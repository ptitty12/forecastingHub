"""SQL generation — the config-to-SQL compiler.

Everything a BU declares (levels, metric lens, pipeline weighting, filters)
is expressed as — or compiled down to — SQL fragments, composed here into
the aggregation queries the grid runs. This mirrors how BUs already work
(each maintains a SQL query for their preferred levels) and means the same
config runs unchanged against the real source views in production.

Safety model: fragments are authored by admins through the config API, not
by reps, and the app's fact access is read-only. guard_sql() is a
belt-and-braces token screen on top of that — it rejects statement
separators, comments, and DML/DDL keywords. It is not a substitute for
keeping config-write privileges admin-only.
"""
import re

from ..models import STANDARD_DIMENSIONS

ROLLUP_DIMENSION = "product_rollup"
UNMAPPED_ROLLUP = "Other"

_FORBIDDEN = re.compile(
    r";|--|/\*|\*/"
    r"|\b(insert|update|delete|drop|alter|create|truncate|merge|grant|revoke"
    r"|exec|execute|attach|detach|pragma|into|call|union)\b",
    re.IGNORECASE,
)


class SqlValidationError(ValueError):
    pass


def guard_sql(fragment: str, what: str = "SQL fragment") -> str:
    fragment = (fragment or "").strip()
    if not fragment:
        raise SqlValidationError(f"{what} is empty")
    match = _FORBIDDEN.search(fragment)
    if match:
        raise SqlValidationError(f"{what} contains forbidden token: {match.group(0)!r}")
    return fragment


def _sql_str(value: str) -> str:
    """Literal-quote a config-supplied string value."""
    return "'" + str(value).replace("'", "''") + "'"


def level_expr(config, level: dict) -> str:
    """The SELECT/GROUP BY expression for one declared level."""
    if level.get("sql"):
        what = "level " + str(level.get("key"))
        return f"({guard_sql(level['sql'], what)})"
    key = level["key"]
    if key == ROLLUP_DIMENSION:
        rollups = config.bucket_rollups or {}
        if not rollups:
            raise SqlValidationError("product_rollup level requires bucket_rollups")
        arms = [
            f"WHEN product_bucket IN ({', '.join(_sql_str(b) for b in buckets)}) THEN {_sql_str(name)}"
            for name, buckets in rollups.items()
            if buckets
        ]
        return f"(CASE {' '.join(arms)} ELSE {_sql_str(UNMAPPED_ROLLUP)} END)"
    if key in STANDARD_DIMENSIONS:
        return key
    raise SqlValidationError(f"Unknown dimension '{key}' (custom levels must declare sql)")


def metric_type_expr(metric_rules: dict) -> str:
    """Per-row expression yielding 'Orders' or 'Sales' — the metric lens.

    Either supplied directly as SQL (metric_rules.sql) or compiled from the
    structured default + overrides.
    """
    if metric_rules.get("sql"):
        return f"({guard_sql(metric_rules['sql'], 'metric_rules.sql')})"
    default = "Sales" if metric_rules.get("default") == "sales" else "Orders"
    overrides = metric_rules.get("overrides", [])
    if not overrides:
        return _sql_str(default)
    arms = []
    for rule in overrides:
        field = rule["field"]
        if field not in STANDARD_DIMENSIONS:
            raise SqlValidationError(f"Lens rule field '{field}' is not a standard dimension")
        target = "Sales" if rule["metric"] == "sales" else "Orders"
        arms.append(f"WHEN {field} = {_sql_str(rule['equals'])} THEN {_sql_str(target)}")
    return f"(CASE {' '.join(arms)} ELSE {_sql_str(default)} END)"


def pipeline_weight_expr(weighting: dict) -> str:
    """Per-row expression for how an open opp contributes to the build-up."""
    mode = weighting.get("mode", "win_probability")
    if mode == "sql":
        return f"({guard_sql(weighting['sql'], 'pipeline_weighting.sql')})"
    if mode == "all":
        return "amount"
    if mode == "threshold":
        thr = float(weighting.get("min_probability", 0.5))
        return f"(CASE WHEN win_probability >= {thr} THEN amount ELSE 0 END)"
    if mode == "win_probability":
        return "(amount * win_probability)"
    raise SqlValidationError(f"Unknown pipeline weighting mode '{mode}'")


def pipeline_included_expr(weighting: dict) -> str:
    """Boolean-ish (1/0) expression: does this opp contribute at all?"""
    mode = weighting.get("mode", "win_probability")
    if mode == "threshold":
        thr = float(weighting.get("min_probability", 0.5))
        return f"(CASE WHEN win_probability >= {thr} THEN 1 ELSE 0 END)"
    return "1"


def filter_where(fact_filters: dict | None) -> str:
    """WHERE fragments from fact_filters.

    {"column": [values...]} → column IN (...)
    {"_sql": "raw fragment"} → included verbatim (guarded).
    """
    if not fact_filters:
        return ""
    clauses = []
    for column, allowed in fact_filters.items():
        if column == "_sql":
            clauses.append(f"({guard_sql(allowed, 'fact_filters._sql')})")
            continue
        if column not in STANDARD_DIMENSIONS:
            raise SqlValidationError(f"Filter column '{column}' is not a standard dimension")
        if not isinstance(allowed, list) or not allowed:
            raise SqlValidationError(f"Filter for '{column}' must be a non-empty list")
        clauses.append(f"{column} IN ({', '.join(_sql_str(v) for v in allowed)})")
    return (" AND " + " AND ".join(clauses)) if clauses else ""


def validate_config_sql(config) -> None:
    """Compile every fragment once — raises SqlValidationError on bad config."""
    for level in config.levels:
        level_expr(config, level)
    metric_type_expr(config.metric_rules)
    pipeline_weight_expr(config.pipeline_weighting)
    filter_where(config.fact_filters)
