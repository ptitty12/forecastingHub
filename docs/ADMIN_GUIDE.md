# Administering the Forecasting Pub

For whoever onboards teams and keeps their setups right. Everything here is
done in the **Administration** tab — no deployments, no code, no tickets.

---

## The one idea

Every team forecasts differently, and the app doesn't fight that. A team's
whole way of working is described by a **forecast view** (a config), and a
view is data you fill in through a form:

| Decision | Field | Example |
|---|---|---|
| How are rows grouped? | **Levels** | Seller → Account → Product Bucket |
| Orders or sales? | **Metric** | Orders, except software on sales |
| How does pipeline count? | **Weighting** | Only deals ≥ 45% likely |
| Any groupings of products? | **Product groups** | 6 buckets → Hardware / Software / Services |

Onboarding a team means answering those four questions once.

---

## Adding a team

1. Open **Administration**.
2. **Business unit** — pick an existing one, or switch to *New business
   unit* and give it a short code and a name.
3. **View name** — what this way of forecasting is called. Usually the
   sub-segment: "Field Sales", "Named Accounts", "OEM". One business unit
   can have several views.
4. **Forecast levels** — see below.
5. **What this team forecasts** — orders or sales, plus any exceptions.
6. **How open pipeline counts** — see below.
7. **Add team**. It appears in the View menu immediately.

---

## Levels — how the grid is sliced

Levels are the columns on the left of the grid, and they define what a "row"
means. Level 1 is the widest grouping; each level below splits it further.

- Most teams use **two or three**. You can add up to **eight**.
- Standard dimensions available out of the box: Manager, Seller, Region,
  Account Segment, State, Country, Account, Product Bucket, Product Line.
- **Product Rollup** is a grouped dimension — pick it and a *Product groups*
  box appears (see below).
- **Custom dimension (SQL)** is for anything else.

### Custom dimensions

Choose *＋ Custom dimension (SQL)…* on any level and give it:

- a **short name** (lowercase slug, e.g. `coast`) — internal identity
- a **column heading** (e.g. `Coast`) — what sellers see
- a **SQL expression** over the standard fact columns

```sql
CASE WHEN state IN ('VA','NY','MA') THEN 'East' ELSE 'West' END
```

```sql
CASE WHEN amount >= 1000000 THEN 'Large' ELSE 'Standard' END
```

The expression is compiled and validated the moment you save. If it's
malformed or contains anything that isn't a read-only expression, the save
is rejected with the reason — the seller never sees a broken grid.

### Product groups (rollups)

When a level uses **Product Rollup**, define the groups as JSON — group name
first, then the buckets inside it:

```json
{
  "Hardware": ["Switchgear Hardware", "Metering Hardware", "Relay Hardware"],
  "Software": ["Grid Software", "Analytics Software"],
  "Services": ["Field Services"]
}
```

Anything not listed lands in a group called **Other**, so nothing goes
missing — a stray bucket shows up rather than vanishing from the totals.

---

## Metric — orders or sales

- **Orders** = counted when the customer commits (bookings).
- **Sales** = counted when we invoice.

Pick the team's default, then add **exceptions** for parts of the portfolio
that work the other way:

> if `product_line` is `Software` use `sales`

Rules are checked in order and the first match wins; everything unmatched
falls through to the default. This is how a team forecasts hardware on
bookings while software follows invoicing.

For lenses too complicated for simple rules, tick **Write it as SQL** and
supply an expression that returns the word `Orders` or `Sales` per row:

```sql
CASE WHEN product_line = 'Software' AND region = 'NAM' THEN 'Sales' ELSE 'Orders' END
```

---

## Pipeline weighting

How open deals feed the **Suggested forecast**:

| Mode | Behaviour | Suits |
|---|---|---|
| **Win probability** | Each deal contributes its value × its likelihood. A $1M deal at 40% adds $400K. | Teams with well-maintained probabilities and lots of deals |
| **Probability threshold** | Deals at or above the bar count **in full**; below it, nothing. | Teams who treat a stage as the "real" line — usually the more intuitive of the two |
| **Count everything** | Every open deal at full value. | Sanity-checking the ceiling; rarely a real forecast |

The threshold slider sets the bar. Sellers see which mode is in force in the
sentence under their grid, and the row drill-down marks each deal as counted
or not.

The **All-deals suggestion** column always shows 100% of pipeline regardless
of this setting, so the optimistic ceiling is always one glance away.

---

## Bring your own query (BYOQ)

Sometimes filters aren't enough — the real extraction unions several source
systems, applies rules the standard table doesn't carry, or needs a
restatement window. In that case a team can supply **its own SELECT** for
either source, and the rest of the engine composes on top of it unchanged:
levels, metric rules, weighting, filters and drill-down all still apply.

Find it under **Bring your own query** in the setup panel. Leave both boxes
blank to read the standard tables.

### The contract

Your query is wrapped as a subquery, so it must return certain columns.
"Required" means *selectable* — if the underlying data has no such value,
select a literal (`NULL AS stage`).

**Orders & sales** — replaces `fact_orders_sales`:

| Column | Type | Notes |
|---|---|---|
| `fiscal_period` | text | Must match a period code exactly, e.g. `2026 Q3` |
| `transaction_type` | text | `Orders` (bookings) or `Sales` (invoiced) |
| `amount` | number | Signed; summed as-is |

**Open pipeline** — replaces `fact_pipeline`:

| Column | Type | Notes |
|---|---|---|
| `fiscal_period` | text | Must match a period code exactly |
| `status` | text | Only rows equal to `Open` are counted |
| `amount` | number | Full, unweighted deal value |
| `win_probability` | number | **0 to 1**, not 0 to 100 |
| `opportunity_id` | text | Shown in the drill-down |
| `opportunity_name`, `account`, `stage`, `close_date` | text / date | Drill-down labels; `NULL` allowed |

**Plus every column your config references** — level columns, lens rule
fields, and filter columns. If you slice by `seller`, the query must return
`seller`.

The live contract is always available at `GET /api/source-contract`, and the
setup panel shows it inline behind *What must it return?* — so it can't
drift from what the engine enforces.

### Rules and conveniences

- **UNION and CTEs are allowed and expected.** A leading `WITH …` is fine.
- **Row grain is yours.** The engine only aggregates, so one row per line,
  per header, or pre-aggregated all work.
- **No trailing semicolon, no comments, nothing that writes.** Statement
  separators and DML/DDL are rejected outright.
- **Validation runs your query.** On save, the app executes everything the
  config generates with a period that matches nothing. A missing column
  fails *for you*, with the database's own message — never for a seller
  opening the grid.

### Example

```sql
WITH oracle AS (
    SELECT period AS fiscal_period, 'Orders' AS transaction_type,
           booked_amount AS amount, rep AS seller, customer AS account
    FROM oracle_bookings
    WHERE booked_amount <> 0
), pos AS (
    -- POS gives ships only, so it lands as Sales
    SELECT period AS fiscal_period, 'Sales' AS transaction_type,
           invoiced AS amount, rep AS seller, customer AS account
    FROM pos_ships
)
SELECT * FROM oracle
UNION ALL
SELECT * FROM pos
```

### Before you reach for it

BYOQ is powerful but it is code, held in configuration. Prefer the standard
table plus filters when it can express the same thing — it is easier for the
next person to read, and it stays correct when the standard tables gain
columns. Reach for BYOQ when the logic genuinely cannot be expressed
declaratively.

**Security:** a BYOQ query runs with the app's own database privileges.
Grant the app a read-only role on your source schemas, and treat access to
this tab as you would database access.

---

## Editing a team

Press **Edit** on any view. The panel loads its current setup; change what
you need and **Save changes**. Changes are live for everyone immediately.

**Rename** on the business unit header edits its code, name, and
description.

### What's safe, and what to think about

| Change | Effect |
|---|---|
| Rename a view or business unit | Safe. Nothing else moves. |
| Change the metric or exceptions | Safe. Actuals recompute; entered forecasts are untouched. |
| Change pipeline weighting | Safe. The suggestion moves; anyone who entered a **Total** keeps their number, anyone on an **Adjustment** moves with it. |
| Add or edit product groups | Safe, but rows regroup — see below. |
| **Change the levels** | **Re-shapes the grid.** Read on. |

### Changing levels

Levels define what a row *is*, so changing them changes row identity.
Forecasts entered against the old shape are **kept in the database but stop
appearing**, because they no longer match any row.

Nothing is deleted. Put the levels back and the entries reappear exactly as
they were.

Practical advice: settle levels before a quarter opens. If you must change
mid-quarter, tell the team to re-enter, or change it back and forth once to
confirm what's there.

---

## Deactivating instead of deleting

There is no delete, on purpose — forecasts are a record of what people
committed to, and deleting them destroys an audit trail.

**Deactivate** removes a view from the View menu. Its entries and history
stay put, and **Reactivate** brings it all back unchanged.

Use it for teams that reorganise, seasonal views, or setups created by
mistake.

---

## Validation and safety

Every save is checked before it's stored:

- levels must be distinct, and between 1 and 8
- a custom level must have both a name and an expression
- a Product Rollup level requires product groups
- the metric must resolve to orders or sales
- a threshold needs a probability between 0 and 1
- **every SQL fragment is compiled**, and rejected if it contains statement
  separators, comments, or anything that isn't a read-only expression

Because compilation happens at save time, a bad setup fails for *you*, with
a message — never for a seller opening the grid.

Two things worth knowing:

- **SQL fragments are admin-authored.** Only people with access to this tab
  can write them. Treat access to it as you would database access.
- **The app only ever reads** the orders/sales and pipeline tables. Nothing
  configured here can modify source data.

---

## Common setups

**Classic named-account team**
Levels: Seller → Account → Product Bucket · Metric: orders · Weighting: win
probability.

**Territory team**
Levels: Region → State → Product Rollup · Metric: orders · Weighting:
threshold at the stage the team considers real.

**Manager rollup**
Levels: Manager → Seller · Metric: orders · Weighting: whatever the sellers'
own view uses, so the numbers reconcile.

**Product-led team**
Levels: Product Line → Account · Metric: sales · Weighting: win probability.

---

## Troubleshooting

**"That name is already taken."** Two views under one business unit can't
share a name. Rename one.

**A seller says their rows vanished.** Check whether the levels changed
recently. Set them back and the entries return.

**The suggestion looks far too high.** Usually weighting: *Count everything*
includes long-shot deals at full value. Switch to threshold or win
probability.

**A view isn't in the View menu.** It's deactivated. Reactivate it here.

**A custom dimension won't save.** Read the message — it names the problem.
Most often a semicolon, a comment, or a stray keyword in the expression.
