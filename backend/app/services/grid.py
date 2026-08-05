"""The forecast grid engine.

v2: all slicing/lens/weighting logic executes as SQL (see sqlgen.py), so a
config's declared fragments run in the database — the same fragments will
run against the real source views in production. Python's remaining jobs:
composing the queries, carrying the slice universe across periods, merging
rep entries, and reconstructing entry state as of a point in time from the
audit trail.

Grid columns:
    actuals             OnS facts, metric chosen per row by the lens SQL
    open pipeline       open bfo opportunities closing in period
    suggested (all bfo) actuals + 100% of open pipeline
    suggested (buildup) actuals + weighted open pipeline (weighting SQL)
    adjustment / total / comment    rep input (live, or as-of via audit replay)
"""
from dataclasses import dataclass, field
from datetime import datetime

from sqlalchemy import bindparam, select, text
from sqlalchemy.orm import Session

from ..models import ForecastAudit, ForecastConfig, ForecastEntry
from . import sqlgen

ROLLUP_DIMENSION = sqlgen.ROLLUP_DIMENSION
UNMAPPED_ROLLUP = sqlgen.UNMAPPED_ROLLUP

SFDC_OPP_URL = "https://se.lightning.force.com/lightning/r/Opportunity/{id}/view"
# Placeholder: every opp links to this known-good record until real bfo ids land.
SFDC_PLACEHOLDER_ID = "006Kj000017MqbZIAS"


def make_slice_key(levels: list[dict], values: dict) -> str:
    return "||".join(f"{lv['key']}={values.get(lv['key']) or ''}" for lv in levels)


def _level_select(config: ForecastConfig) -> tuple[list[str], list[str]]:
    """(aliased select expressions, raw expressions) for the config's levels."""
    exprs = [sqlgen.level_expr(config, lv) for lv in config.levels]
    aliased = [f"{e} AS lv{i}" for i, e in enumerate(exprs)]
    return aliased, exprs


def _run_agg(db: Session, sql: str, periods: list[str], n_levels: int):
    stmt = text(sql).bindparams(bindparam("periods", expanding=True))
    out = {}
    for row in db.execute(stmt, {"periods": periods}):
        key = (row[0], tuple((v if v is not None else "") for v in row[1 : 1 + n_levels]))
        out[key] = tuple(row[1 + n_levels :])
    return out


def aggregate_orders(db: Session, config: ForecastConfig, periods: list[str]) -> dict:
    aliased, exprs = _level_select(config)
    metric = sqlgen.metric_type_expr(config.metric_rules)
    where = sqlgen.filter_where(config.fact_filters)
    sql = f"""
        SELECT fiscal_period, {', '.join(aliased)},
               SUM(CASE WHEN transaction_type = {metric} THEN amount ELSE 0 END) AS actuals
        FROM fact_orders_sales
        WHERE fiscal_period IN :periods{where}
        GROUP BY fiscal_period, {', '.join(exprs)}
    """
    return _run_agg(db, sql, periods, len(config.levels))


def aggregate_pipeline(db: Session, config: ForecastConfig, periods: list[str]) -> dict:
    aliased, exprs = _level_select(config)
    weight = sqlgen.pipeline_weight_expr(config.pipeline_weighting)
    where = sqlgen.filter_where(config.fact_filters)
    sql = f"""
        SELECT fiscal_period, {', '.join(aliased)},
               SUM(amount) AS pipe_open,
               SUM({weight}) AS pipe_weighted
        FROM fact_pipeline
        WHERE status = 'Open' AND fiscal_period IN :periods{where}
        GROUP BY fiscal_period, {', '.join(exprs)}
    """
    return _run_agg(db, sql, periods, len(config.levels))


# --- rep entries: live, or reconstructed as of a timestamp --------------------

_NUMERIC_FIELDS = ("adjustment", "total_forecast")


def _entry_state_live(db: Session, config_id: int, periods: list[str]) -> dict:
    out = {}
    for e in db.scalars(
        select(ForecastEntry).where(
            ForecastEntry.config_id == config_id, ForecastEntry.period_code.in_(periods)
        )
    ):
        out[(e.period_code, e.slice_key)] = {
            "adjustment": e.adjustment,
            "total_forecast": e.total_forecast,
            "comment": e.comment,
            "updated_by": e.updated_by,
            "updated_at": e.updated_at.isoformat() if e.updated_at else None,
        }
    return out


def _entry_state_as_of(db: Session, config_id: int, periods: list[str], as_of: datetime) -> dict:
    """Replay the audit trail up to `as_of` — change data capture for rep input."""
    records = db.scalars(
        select(ForecastAudit)
        .where(
            ForecastAudit.config_id == config_id,
            ForecastAudit.period_code.in_(periods),
            ForecastAudit.changed_at <= as_of,
        )
        .order_by(ForecastAudit.changed_at, ForecastAudit.id)
    ).all()
    out: dict = {}
    for r in records:
        state = out.setdefault(
            (r.period_code, r.slice_key),
            {"adjustment": None, "total_forecast": None, "comment": None, "updated_by": None, "updated_at": None},
        )
        if r.new_value is None:
            value = None
        elif r.field in _NUMERIC_FIELDS:
            try:
                value = float(r.new_value)
            except ValueError:
                value = None
        else:
            value = r.new_value
        state[r.field] = value
        state["updated_by"] = r.changed_by
        state["updated_at"] = r.changed_at.isoformat() if r.changed_at else None
    return out


@dataclass
class GridRow:
    period_code: str
    slice_key: str
    slice_values: dict
    actuals: float = 0.0
    pipeline_open: float = 0.0
    pipeline_weighted: float = 0.0
    suggested_all_bfo: float = 0.0
    suggested_buildup: float = 0.0
    adjustment: float | None = None
    total_forecast: float | None = None
    effective_adjustment: float = 0.0
    effective_total: float = 0.0
    comment: str | None = None
    updated_by: str | None = None
    updated_at: str | None = None
    has_entry: bool = field(default=False)


def build_grid(
    db: Session,
    config: ForecastConfig,
    period_codes: list[str],
    as_of: datetime | None = None,
) -> list[GridRow]:
    level_keys = [lv["key"] for lv in config.levels]

    actuals = aggregate_orders(db, config, period_codes)
    pipeline = aggregate_pipeline(db, config, period_codes)
    entries = (
        _entry_state_as_of(db, config.id, period_codes, as_of)
        if as_of
        else _entry_state_live(db, config.id, period_codes)
    )

    slice_universe: set[tuple] = set()
    for _, s in actuals:
        slice_universe.add(s)
    for _, s in pipeline:
        slice_universe.add(s)
    entry_by_key: dict[tuple[str, str], dict] = {}
    for (period, skey), state in entries.items():
        entry_by_key[(period, skey)] = state
        parts = [p.split("=", 1)[1] if "=" in p else "" for p in skey.split("||")]
        if len(parts) == len(level_keys):
            slice_universe.add(tuple(parts))

    # Every known slice appears in every requested period, so reps can enter
    # future quarters even where facts are still empty.
    rows: list[GridRow] = []
    for period in period_codes:
        for s in sorted(slice_universe):
            values = dict(zip(level_keys, s))
            skey = make_slice_key(config.levels, values)
            a = (actuals.get((period, s)) or (0.0,))[0] or 0.0
            po, pw = pipeline.get((period, s)) or (0.0, 0.0)
            po, pw = po or 0.0, pw or 0.0
            row = GridRow(
                period_code=period,
                slice_key=skey,
                slice_values=values,
                actuals=round(a, 2),
                pipeline_open=round(po, 2),
                pipeline_weighted=round(pw, 2),
                suggested_all_bfo=round(a + po, 2),
                suggested_buildup=round(a + pw, 2),
            )
            state = entry_by_key.get((period, skey))
            if state:
                row.has_entry = True
                row.adjustment = state["adjustment"]
                row.total_forecast = state["total_forecast"]
                row.comment = state["comment"]
                row.updated_by = state["updated_by"]
                row.updated_at = state["updated_at"]
            # Precedence: an explicit total wins; else buildup + adjustment.
            if row.total_forecast is not None:
                row.effective_total = round(row.total_forecast, 2)
                row.effective_adjustment = round(row.total_forecast - row.suggested_buildup, 2)
            elif row.adjustment is not None:
                row.effective_adjustment = round(row.adjustment, 2)
                row.effective_total = round(row.suggested_buildup + row.adjustment, 2)
            else:
                row.effective_adjustment = 0.0
                row.effective_total = row.suggested_buildup
            rows.append(row)
    return rows


# --- drill-down: the opportunities behind one slice ---------------------------


def slice_opportunities(
    db: Session, config: ForecastConfig, period_code: str, slice_values: dict
) -> list[dict]:
    """Open opportunities feeding one grid row's pipeline numbers."""
    _, exprs = _level_select(config)
    where = sqlgen.filter_where(config.fact_filters)
    weight = sqlgen.pipeline_weight_expr(config.pipeline_weighting)
    included = sqlgen.pipeline_included_expr(config.pipeline_weighting)

    conditions = []
    params: dict = {"period": period_code}
    for i, lv in enumerate(config.levels):
        conditions.append(f"COALESCE({exprs[i]}, '') = :lv{i}")
        params[f"lv{i}"] = slice_values.get(lv["key"]) or ""

    sql = f"""
        SELECT opportunity_id, opportunity_name, account, amount, win_probability,
               stage, close_date, {weight} AS weighted_amount, {included} AS included
        FROM fact_pipeline
        WHERE status = 'Open' AND fiscal_period = :period{where}
          AND {' AND '.join(conditions)}
        ORDER BY amount DESC
    """
    out = []
    for r in db.execute(text(sql), params).mappings():
        out.append(
            {
                "opportunity_id": r["opportunity_id"],
                "opportunity_name": r["opportunity_name"],
                "account": r["account"],
                "amount": r["amount"],
                "win_probability": r["win_probability"],
                "stage": r["stage"],
                "close_date": str(r["close_date"]) if r["close_date"] else None,
                "weighted_amount": round(r["weighted_amount"] or 0.0, 2),
                "included": bool(r["included"]),
                "url": SFDC_OPP_URL.format(id=SFDC_PLACEHOLDER_ID),
            }
        )
    return out
