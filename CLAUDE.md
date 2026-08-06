# Forecasting Pub — agent guide

Read `README.md` for orientation and `docs/ARCHITECTURE.md` before touching
the engine. This file is the working contract for changing this codebase.

| Doc | When you need it |
|---|---|
| `docs/ARCHITECTURE.md` | changing the engine, the compiler, or the grid |
| `docs/ADMIN_GUIDE.md` | changing config semantics or the admin UI |
| `docs/API.md` | changing any endpoint or payload shape |
| `docs/USER_GUIDE.md` | changing anything a seller sees |
| `docs/DEPLOYMENT.md` | changing ports, the image, or persistence |

**Docs are part of the change.** A new config field, endpoint, or column
isn't done until the guide that covers it says so.

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
- **The demo world stays invented.** This repo is public. Never put a real
  customer, employee, product, or internal system/table name into seed data,
  code comments, tests, or docs — accounts are puns, people are New Girl
  characters, products are Hardware/Services/Software, amounts are random.
  `tests/test_anonymization.py` enforces it via a denylist; when you learn of
  another real name worth guarding, add it to `FORBIDDEN` rather than
  loosening the test.
- **Orders ≠ Sales.** Orders = bookings, Sales = invoicing. Fact queries
  filter `transaction_type`; the lens SQL decides which one per row.
- Adjustment and total are linked, last-edit-wins. Preserve the
  `set_fields` semantics in `EntryUpsert` if you touch saving.

## Ports & topology

Backend runs on **7999** (uvicorn, Docker, and the Vite proxy all agree).
Frontend dev server on 5173.

**Dev runs two processes; a deployment runs one.** Vite exists only for
hot-reload. `docker compose up -d --build` compiles the frontend into the
image and FastAPI serves it from the same process as the API — see the
static mount at the bottom of `app/main.py`. When touching that mount, the
`FRONTEND_DIST` env var, or the ports, keep all four in agreement:
`Dockerfile`, `docker-compose.yml`, `vite.config.ts` proxy, and
`app/main.py`.

SQLite lives on the `forecasting-data` volume at `/app/data` — the app's
configs, entries, and audit trail. Never write app data anywhere else in the
container; nothing outside `/app/data` persists, and the container runs as
non-root uid 10001 so most other paths aren't writable.

## Verify your work

```bash
cd backend && python3 -m pytest tests/          # must stay green
cd frontend && npx tsc -b && npm run build      # must stay clean
```

Run both servers (`uvicorn app.main:app --port 7999`, `npm run dev`) and
check all three seeded configs load — they exercise different code paths:

| Config | Exercises |
|---|---|
| NSP · SAO | 3 levels, structured lens override (software → sales), win-probability weighting |
| AE · Field Sales | derived `product_rollup` dimension, threshold weighting |
| NSP · Coast Rollup | 2 levels, a custom pure-SQL dimension |

Also check: row expansion (▸) lists opportunities, "see as of" + "compare to
now" reconstructs past state, the Dashboard tab's dimension/measure/chart
switchers, and Administration's Edit / Deactivate round-trip.

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
- **Help text lives in `src/lib/help.ts`**, never inline in components, so
  the wording can be reviewed as prose. Every new column, control, or admin
  field ships with an `InfoTip` written the house way: plain language, no
  jargon a seller wouldn't say out loud, one or two sentences — say what the
  number *is*, then what to *do* with it.
- Empty and error states explain the fix, not just the failure ("your
  filters are hiding everything" beats "no rows").
- Nothing is deleted. Where a delete seems natural, deactivate instead —
  the audit trail is the point of the product.
- Keep light AND dark mode working — tokens flip via
  `prefers-color-scheme`; check both when touching styles.
