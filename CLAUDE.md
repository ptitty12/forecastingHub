# Forecasting Pub — agent guide

Read `README.md` first for the architecture. This file is the working
contract for agents iterating on the codebase.

## Ground rules

- **The fact tables are read-only to the app.** `fact_orders_sales` and
  `fact_pipeline` are fed by external processes in production (seeded
  skeletons in dev). Never add app code that writes them outside `seed.py`.
- **BU differences belong in config, not code.** If a change is "BU X wants
  to slice/weight/lens differently," the answer is a `ForecastConfig` field
  — never a BU-specific branch, endpoint, or component.
- **Logic is SQL.** Levels, metric lens, pipeline weighting, and filters
  compile to SQL in `services/sqlgen.py` and execute in the database. When
  adding a new configurable behavior, add it as a compiled expression there
  rather than as Python post-processing over fetched rows.
- **Every SQL fragment passes `guard_sql()` and is compiled at save time.**
  `_validate_config` in `routers/business_units.py` compiles every fragment
  when a config is written, so a bad config fails for the admin, not for a
  rep opening the grid. Keep that property.
- **Every rep-input mutation must audit.** Any new editable field goes
  through the `upsert_entry` change-tracking pattern and lands in
  `forecast_audit` — the audit trail is also what powers "see as of", so a
  field that skips it silently breaks point-in-time views.
- **Orders ≠ Sales.** Orders = bookings, Sales = invoicing. Fact queries
  filter `transaction_type`; the lens SQL decides which one per row.
- Adjustment and total are linked, last-edit-wins. Preserve the
  `set_fields` semantics in `EntryUpsert` if you touch saving.

## Ports

Backend runs on **7999** (uvicorn, Docker, and the Vite proxy all agree).
Frontend dev server on 5173.

## Verify your work

```bash
cd backend && python3 -m pytest tests/          # must stay green
cd frontend && npx tsc -b && npm run build      # must stay clean
```

Run both servers (`uvicorn app.main:app --port 7999`, `npm run dev`) and
check all three seeded configs load — they exercise different code paths:

| Config | Exercises |
|---|---|
| SP · SAO | 3 levels, structured lens override (T&E → sales), win-probability weighting |
| DE · Field Sales | derived `product_rollup` dimension, threshold weighting |
| SP · Coast Rollup | 2 levels, a custom pure-SQL dimension |

Also check: row expansion (▸) lists opportunities, "see as of" + "compare to
now" reconstructs past state, and the Dashboard tab's dimension/measure/chart
switchers.

## Style

- Backend: SQLAlchemy 2.0 typed mappings, pydantic v2, routers thin /
  services thick. Generated SQL stays dialect-portable — no aliases in
  `GROUP BY`, literal-quote via `sqlgen._sql_str`.
- Frontend: no state library — props down from `App.tsx`; Tailwind v4
  tokens defined in `src/index.css` (use `bg-surface`, `text-ink2`,
  `text-brandink`, etc., never raw hex in components); numeric cells get
  the `.tnum` class.
- Charts: plain SVG in `components/charts/`, fixed categorical slot order
  from `lib/palette.ts` (never cycle or generate hues; fold the tail into
  "Other"), legend always present for ≥2 series, no dual axes.
- Grid loads keep previous data on screen and fade — never blank the table
  on a refetch (`fetchSeq` guards against stale responses).
- Keep light AND dark mode working — tokens flip via
  `prefers-color-scheme`; check both when touching styles.
