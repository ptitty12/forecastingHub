# Architecture

How the Forecasting Pub is put together, and why. Read this before changing
the engine.

---

## The problem it solves

A dozen business units forecast the same underlying business in a dozen
different shapes — some by seller and account, some by region, some by
product grouping — and there is no realistic path to making them agree. The
old solution was a separate hacked-together app per team.

The design response: **the app has no opinion about shape.** Everything that
differs between teams is *configuration*, and that configuration compiles to
SQL that runs in the database. Adding a team is data entry. The code path is
identical for all of them.

---

## Layers

```
       ┌──────────────────────── external, not ours ────────────────────────┐
       │  orders/sales feed                          bfo pipeline feed      │
       └───────────┬─────────────────────────────────────────┬─────────────┘
                   ▼                                         ▼
        fact_orders_sales                              fact_pipeline      ← read-only to the app
                   └──────────────────┬──────────────────────┘
                                      ▼
                        services/sqlgen.py   config ──► SQL
                                      ▼
                        services/grid.py     aggregate · merge · replay
                                      ▼
                              routers/*.py   HTTP + validation
                                      ▼
                    React SPA (grid · dashboard · admin)
```

### Zone 1 — source facts (read-only)

`fact_orders_sales` and `fact_pipeline` in `models.py`. In production these
are fed by external processes; **the app never writes them** (outside
`seed.py`, which exists only to make the demo world).

They carry a superset of the dimension columns any team might forecast by —
`business_unit`, `manager`, `seller`, `region`, `account_segment`, `state`,
`country`, `account`, `product_bucket`, `product_line` — which is what makes
"how we slice" a pure configuration question.

Two conventions inherited from the source systems:

- **Orders ≠ Sales.** Orders are bookings, Sales are invoicing. Every query
  against the orders/sales table must filter `transaction_type`; a query
  that doesn't is almost certainly wrong.
- **There is no single grain.** The real table unions many source systems.
  Don't assume line or header level.

### Zone 2 — configuration

`BusinessUnit` and `ForecastConfig`. A config declares levels, metric rules,
pipeline weighting, fact filters, product rollups, and (documentation-only)
the production source views. See [ADMIN_GUIDE](ADMIN_GUIDE.md) for the
semantics of each and [API](API.md) for the exact shapes.

### Zone 3 — forecast input

`ForecastEntry` (one row per config × period × slice) and `ForecastAudit`
(one immutable row per field change). The audit table isn't a nicety: it is
the **storage layer for point-in-time views**. Anything that mutates rep
input without writing audit rows silently breaks "see as of".

---

## The config-to-SQL compiler

`services/sqlgen.py` turns a config into SQL fragments:

| Function | Produces |
|---|---|
| `level_expr` | the SELECT/GROUP BY expression per level — a column, a compiled `CASE` for rollups, or an admin-supplied expression |
| `metric_type_expr` | a per-row expression yielding `'Orders'` or `'Sales'` |
| `pipeline_weight_expr` | a per-row weighted-amount expression |
| `pipeline_included_expr` | 1/0 — does this deal count at all (drives the drill-down's "counted" flag) |
| `filter_where` | additional WHERE clauses |
| `orders_source` / `pipeline_source` | the FROM source: the standard fact table, or a team's BYOQ query wrapped as a subquery |

`grid.py` composes those into two aggregation queries — one per fact table —
and runs them. **The grouping happens in the database, not in Python.** That
is what makes pointing a config at a real warehouse view a config change
rather than a rewrite.

### Bring your own query

`source_orders_sql` / `source_pipeline_sql` on a config replace the standard
fact table as the FROM source. Everything above composes on top of the
subquery unchanged, which is why the feature costs so little: the only new
concept is *where FROM points*.

Two guards, deliberately different:

- `guard_sql` screens **expressions** (levels, lens, weighting). Strict —
  an expression never needs UNION or anything statement-shaped.
- `guard_query` screens **BYOQ queries**. Allows UNION and CTEs, since real
  extractions union several systems; still rejects statement separators,
  comments, and DML/DDL, and requires a leading SELECT or WITH.

The contract a BYOQ query must satisfy lives in one place —
`sqlgen.SOURCE_CONTRACT` — and is served to the admin UI at
`GET /api/source-contract`, so documentation, UI, and enforcement cannot
drift apart.

**Validation is execution.** `grid.probe_sources` runs every query the
config generates against a period that matches nothing. Static checks
cannot know whether a hand-written query exposes `seller`; running it can.
The failure therefore lands on the admin who wrote the query, carrying the
driver's own message, rather than on a seller opening the grid.

### Safety model

Three layers, in order of importance:

1. **Fact access is read-only.** No app code writes source tables.
2. **Fragments are admin-authored.** Writing SQL requires access to the
   admin API. Treat that access like database access.
3. **The guards screen tokens** — statement separators, comments, and
   DML/DDL are rejected — and `_validate_config` compiles *and executes*
   every query **at save time**, so a bad config fails for the admin who
   wrote it rather than the seller who opens the grid.

Layer 3 is defense in depth, not the primary control. Don't loosen 1 or 2 on
the strength of it.

### Portability

Generated SQL avoids aliases in `GROUP BY` and literal-quotes values through
`_sql_str`, so it runs on SQLite and SQL Server alike. If a dialect ever
diverges, `sqlgen.py` is the single seam to fix.

---

## The grid engine

`grid.py::build_grid(db, config, periods, as_of=None)` returns the rows the
UI renders.

1. **Aggregate** actuals (lens applied) and pipeline (weighting applied).
2. **Build the slice universe** — every slice seen in either fact table,
   plus every slice that has an entry. This is what lets sellers forecast a
   future quarter with no data in it yet: the universe carries forward.
3. **Merge entry state**, live or replayed (below).
4. **Compute the derived columns**, with this precedence:

```
all-bfo suggested  = actuals + open pipeline
build-up suggested = actuals + weighted pipeline

if an explicit total was entered:
    effective_total      = that total
    effective_adjustment = total − build-up          (derived for display)
else if an adjustment was entered:
    effective_adjustment = that adjustment
    effective_total      = build-up + adjustment     (moves with the suggestion)
else:
    effective_total      = build-up
```

**Last edit wins.** Saving an adjustment clears a stored total and vice
versa (`set_fields` in `EntryUpsert` carries the intent). The user-visible
consequence: a stored **total** is a commitment that survives suggestion
drift; a stored **adjustment** floats with it. That is a feature, and it's
documented for sellers in the [user guide](USER_GUIDE.md).

### Point-in-time ("see as of")

`_entry_state_as_of` replays `forecast_audit` in `(changed_at, id)` order up
to the requested moment, rebuilding each entry field by field. No snapshot
tables, no scheduled job — the audit trail *is* the change data capture.

Current limit, surfaced in the UI rather than hidden: **facts are live in
as-of mode.** Only rep input rewinds, because the source tables have no
snapshots yet. When they gain them, the `as_of` parameter already flows end
to end and the aggregation queries gain a date predicate.

---

## Frontend

React + Vite + TypeScript + Tailwind v4. No state library — props flow down
from `App.tsx`, which owns business units, periods, dimensions, and the
selected view.

| Path | Role |
|---|---|
| `pages/ForecastPage.tsx` | the entry grid, drill-down, as-of/compare, totals, visuals |
| `pages/DashboardPage.tsx` | charts and the dimension/measure explorer |
| `pages/AdminPage.tsx` | onboarding and editing views |
| `components/charts/` | plain-SVG line and stacked bar |
| `components/InfoTip.tsx` | the "?" affordance used throughout |
| `lib/help.ts` | **every explanation string in the app, in one file** |
| `lib/palette.ts` | fixed categorical colour order, light and dark steps |

Conventions worth keeping:

- **Help text lives in `lib/help.ts`**, not inline in components, so the
  wording can be reviewed as prose.
- **The grid never blanks on refetch.** Data stays on screen and fades; a
  `fetchSeq` ref discards stale responses so fast clicking can't land out of
  order.
- **Colour comes from `lib/palette.ts` in fixed slot order** — never cycled,
  never generated. Past 7 series, fold the tail into "Other".
- **Tokens, not hex.** `bg-surface`, `text-ink2`, `text-brandink` etc. are
  defined in `index.css` and flip for dark mode.
- Numeric columns get `.tnum` so digits line up.

---

## Identity

A trusted `X-User` header, chosen in the top bar, stamped onto every entry
and audit row. `current_user` in `routers/forecast.py` is the single
swap-in point for SSO; nothing else needs to change.

---

## Deliberate non-goals

- **No deletes.** Deactivation everywhere a delete would be expected — the
  audit trail is the point of the product.
- **Additive migrations only.** `database.ensure_columns()` adds nullable
  columns missing from existing tables at startup, so an upgrade against a
  persisted volume works; anything else (NOT NULL, type changes, renames)
  raises rather than guessing, and needs a real migration.
- **No per-BU code paths.** If a change would add one, it belongs in config
  instead.
- **No dual-axis charts, no generated colours.** Consistency beats novelty
  in a tool people read every week.
