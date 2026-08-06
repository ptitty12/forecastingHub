"""SQL generation — the config-to-SQL compiler.

Everything a BU declares (levels, metric lens, pipeline weighting, filters)
is expressed as — or compiled down to — SQL fragments, composed here into
the aggregation queries the grid runs. This mirrors how BUs already work
(each maintains a SQL query for their preferred levels) and means the same
config runs unchanged against the real source views in production.

A team can also bring its own query (BYOQ) for either source — see
SOURCE_CONTRACT below — when its real extraction logic is too involved to
express as filters. The declared query becomes the FROM subquery and
everything else composes on top of it unchanged.

Safety model: fragments and queries are authored by admins through the
config API, not by reps, and the app never writes source data. The guards
here are a belt-and-braces token screen on top of that — they reject
statement separators, comments, and DML/DDL. They are not a substitute for
keeping config-write privileges admin-only, nor for granting the app a
read-only database role. A BYOQ query runs with the app's own database
privileges.
"""
import re

from ..models import STANDARD_DIMENSIONS

ROLLUP_DIMENSION = "product_rollup"
UNMAPPED_ROLLUP = "Other"

# Expression-level guard. Deliberately stricter than the query guard: a
# level/lens/weighting fragment is an expression, so it never needs UNION,
# CTEs, or anything statement-shaped.
_FORBIDDEN = re.compile(
    r";|--|/\*|\*/"
    r"|\b(insert|update|delete|drop|alter|create|truncate|merge|grant|revoke"
    r"|exec|execute|attach|detach|pragma|into|call|union)\b",
    re.IGNORECASE,
)

# Query-level guard for BYOQ. UNION and CTEs are the whole point — a real
# extraction usually unions several source systems — so they are allowed;
# anything that writes, or that could end the statement, is not.
_FORBIDDEN_QUERY = re.compile(
    r";|--|/\*|\*/"
    r"|\b(insert|update|delete|drop|alter|truncate|merge|grant|revoke"
    r"|exec|execute|attach|detach|pragma|into|call)\b",
    re.IGNORECASE,
)
_QUERY_START = re.compile(r"^\s*(select|with)\b", re.IGNORECASE)


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


def guard_query(query: str, what: str = "query") -> str:
    """Screen a full BYOQ SELECT. Allows UNION and CTEs; blocks writes."""
    query = (query or "").strip().rstrip(";").strip()
    if not query:
        raise SqlValidationError(f"{what} is empty")
    if not _QUERY_START.match(query):
        raise SqlValidationError(f"{what} must start with SELECT or WITH")
    match = _FORBIDDEN_QUERY.search(query)
    if match:
        raise SqlValidationError(f"{what} contains forbidden token: {match.group(0)!r}")
    return query


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


# ---------------------------------------------------------------------------
# Sources: the standard fact tables, or a team's own query (BYOQ)
# ---------------------------------------------------------------------------

# The contract a bring-your-own query must satisfy. "Required" means the
# column must be selectable — if the underlying data doesn't have it, select
# a literal (e.g. `NULL AS stage`). Everything the config itself references
# (level columns, lens fields, filter columns) must also be present; that is
# checked by actually executing the composed query at save time.
SOURCE_CONTRACT = {
    "orders": {
        "table": "fact_orders_sales",
        "required": {
            "fiscal_period": "text — must match a period code exactly, e.g. '2026 Q3'",
            "transaction_type": "text — 'Orders' (bookings) or 'Sales' (invoiced)",
            "amount": "number — signed; summed as-is",
        },
    },
    "pipeline": {
        "table": "fact_pipeline",
        "required": {
            "fiscal_period": "text — must match a period code exactly, e.g. '2026 Q3'",
            "status": "text — only rows equal to 'Open' are counted",
            "amount": "number — full (unweighted) deal value",
            "win_probability": "number — 0 to 1, not 0 to 100",
            "opportunity_id": "text — shown in the row drill-down",
            "opportunity_name": "text — drill-down label; NULL allowed",
            "account": "text — drill-down label; NULL allowed",
            "stage": "text — drill-down label; NULL allowed",
            "close_date": "date — drill-down label; NULL allowed",
        },
    },
}


def orders_source(config) -> str:
    """FROM-clause source for orders/sales: the standard table, or BYOQ."""
    custom = getattr(config, "source_orders_sql", None)
    if custom:
        return f"({guard_query(custom, 'orders/sales query')}) AS src"
    return SOURCE_CONTRACT["orders"]["table"]


def pipeline_source(config) -> str:
    """FROM-clause source for pipeline: the standard table, or BYOQ."""
    custom = getattr(config, "source_pipeline_sql", None)
    if custom:
        return f"({guard_query(custom, 'pipeline query')}) AS src"
    return SOURCE_CONTRACT["pipeline"]["table"]


def validate_config_sql(config) -> None:
    """Compile every fragment once — raises SqlValidationError on bad config."""
    for level in config.levels:
        level_expr(config, level)
    metric_type_expr(config.metric_rules)
    pipeline_weight_expr(config.pipeline_weighting)
    filter_where(config.fact_filters)
    orders_source(config)
    pipeline_source(config)
