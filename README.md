# Forecasting Pub 🍺

Centralized forecasting for Schneider Electric sales teams — the enterprise
replacement for the SharePoint/PowerApp forecasting hub. Reps enter where
they'll land this quarter (and future quarters); the app suggests a number
from orders/sales actuals plus open bfo pipeline, shows the opportunities
behind every estimate, and keeps a full audit trail with point-in-time
snapshots of every change.

## The core idea: forecasting shape is configuration — declared in SQL

Twelve BUs, every one slicing differently (Seller/Account/Product,
Region/State/Product-group, Manager/Segment, …) — and no realistic path to
standardizing them. So the app doesn't try. A **forecast config** declares,
as data, and where it's logic, as **SQL over the standard fact columns** —
which is exactly how BUs already express their slicing today:

| Config field | What it controls | Example |
|---|---|---|
| `levels` | The levels the team forecasts to — **1 to 8 of them**. Standard dimensions by key, or fully custom: `{"key": "coast", "label": "Coast", "sql": "CASE WHEN state IN ('VA','NY') THEN 'East' ELSE 'West' END"}` | SAO: Seller → Account → Product Bucket |
| `metric_rules` | Orders vs Sales per row. Structured (`default` + `overrides`) or straight SQL: an expression yielding `'Orders'`/`'Sales'` | lens rule: `product_line = 'Software'` → sales, everything else orders |
| `pipeline_weighting` | How open pipeline feeds the build-up suggestion: `win_probability`, `threshold` (only count opps at ≥ X% win probability), `all`, or a custom `sql` expression | DE: threshold ≥ 45% |
| `bucket_rollups` | Custom product-bucket groupings (derived `product_rollup` dimension) | DE folds 6 buckets into Hardware / Software / Services |
| `fact_filters` | Row restriction: `{"column": [values]}` and/or a raw `{"_sql": "…"}` fragment | `business_unit = 'Secure Power'` |
| `source_*_view` | The SQL views to read in production | `db.schema.orders_sales_view` |

The engine (`services/sqlgen.py` + `services/grid.py`) compiles these into
the aggregation queries that run **in the database** — so when a config
points at the real source views, the BU's logic executes where the data
lives. Every fragment is validated at config-save time (statement
separators, comments, and DML/DDL are rejected; config writes are
admin-surface only).

Onboarding a new BU = one config, through the UI under **Administration** —
no schema changes, no new endpoints, no new screens.

## What's in the app

- **Forecast tab** — the entry grid: actuals, open pipeline, all-bfo and
  build-up suggested, editable adjustment/total (linked, last-edit-wins),
  comments, per-level filters, quarter chips including future quarters,
  grand-total stat tiles, and trend/composition visuals. Rows expand (▸) to
  show the **bfo opportunities behind the estimate**, each linking to
  Salesforce Lightning (placeholder opp id for now).
- **See as of** — pick a date and the grid reconstructs rep input exactly as
  it stood then, replayed from the audit trail (change data capture).
  "Compare to now" adds current totals and Δ columns. Source facts stay live
  until fact snapshots are wired with the real sources.
- **Dashboard tab** — forecast trajectory line, by-dimension explorer
  (stacked bars or lines), dimension/measure switchers, period + level
  filters, KPI tiles.
- **Administration tab** — the whole config surface: dynamic level list
  (add/remove, up to 8), custom SQL dimensions, lens rules or SQL metric,
  threshold slider, bucket rollups, production source views.
- **Audit everywhere** — every change to adjustment/total/comment writes an
  immutable audit row (field, old → new, who, when); the change-history
  drawer shows it per row or per view.

## Architecture

```
 orders/sales feed ─┐                       ┌─ React + Vite + Tailwind SPA
 (external, read-   ├─> standard fact       │    · forecast grid + drill-down
  only skeletons    │   tables (sqlite dev/ │    · dashboard (SVG charts)
  for now)          │   SQL Server prod)    │    · as-of / compare
 bfo pipeline feed ─┘         │             │    · admin / onboarding
                              v             │
                    FastAPI + SQLAlchemy ───┘
                      · sqlgen.py: config → SQL compiler
                      · grid.py: aggregation, entry merge, audit replay
                      · forecast entries + immutable audit
```

- `backend/app/models.py` — three zones: read-only fact skeletons,
  configuration, forecast input. Start here.
- `backend/app/services/sqlgen.py` — the config-to-SQL compiler + guard.
- `backend/app/services/grid.py` — aggregation orchestration, slice
  universe, as-of reconstruction, opportunity drill-down.
- `backend/app/seed.py` — deterministic **invented** demo world (see
  "Demo data" below): 3 differently-shaped
  configs (incl. a custom-SQL dimension), 5 quarters of facts, entries with
  a backdated audit trail.
- `frontend/src/pages/` — ForecastPage, DashboardPage, AdminPage.
- `frontend/src/components/charts/` — line + stacked bar, plain SVG, both
  themes, crosshair/segment tooltips.

### Grid semantics

- **All-bfo suggested** = actuals-to-date + 100% of open pipeline.
- **Build-up suggested** = actuals-to-date + *weighted* open pipeline.
- **Total forecast** = build-up + adjustment. Reps edit either the
  adjustment or the total; they stay linked and **the last edit wins**.
- Future quarters are always enterable: the slice universe carries forward.

## Demo data is entirely invented

This repository is public, so nothing in it describes real business. The
seeded world is fiction by construction:

| Field | What you'll see |
|---|---|
| Accounts | puns on well-known companies — *Toggle Telecom*, *Macrohard*, *Inequinox*, *Analog Realty*, *Scattered Edison*, *Tennessee Valley Suggestion* … never a real customer |
| Sellers & managers | New Girl characters — Jess Day, Nick Miller, Winston Bishop, Cece Parekh, Schmidt, Coach, Aly Nelson, Reagan Lucas, Russell Schiller, Bob Day |
| Products | generic categories only: `product_line` is Hardware / Services / Software, `product_bucket` the finer split (Power Hardware, Field Services, Grid Software, …) |
| Amounts | random draws from a fixed seed (`Random(51)`), scaled so the *shape* is plausible — hardware deals large, services mid, software small, Q4 strong, Q1 soft. The numbers themselves mean nothing. |
| Opportunity links | every drill-down row points at one placeholder Salesforce id |

`backend/tests/test_anonymization.py` enforces this: it scans the backend
package for a denylist of real company, employee, product, and internal
system names, and asserts the seeded people, accounts, and product lines
come only from the invented sets. If you reintroduce a real name, the suite
fails. Add new names to `FORBIDDEN` there when you learn of one worth
guarding.

## Deploy it

**One command, one service, one port:**

```bash
docker compose up -d --build
```

Open <http://localhost:7999>. That's the whole deployment — the UI and the
API are the same service, and the database seeds itself on first start.

```bash
docker compose logs -f      # follow logs
docker compose ps           # status (incl. health)
docker compose down         # stop (data survives)
docker compose down -v      # stop AND erase the data volume
```

### Why it's one service, when local dev runs two

Local development runs two processes — uvicorn and the Vite dev server —
purely for frontend hot-reload. **A deployment has no Vite.** The image
build compiles the frontend to static files, and FastAPI serves those files
alongside the API from a single process:

```
docker compose up
        │
        ▼
┌─────────────────────────────────────────┐
│ image build (multi-stage)               │
│   stage 1  node   → npm run build → dist│
│   stage 2  python → FastAPI + that dist │
└─────────────────────────────────────────┘
        │  one container, one port :7999
        ▼
   /            → the React app (static files)
   /api/*       → the API
   /docs        → interactive API docs
```

So there's no reverse proxy to configure, no CORS in production, no second
container to keep in sync.

### Configuration

Everything is optional — the defaults work with no setup.

| Variable | Default | What it does |
|---|---|---|
| `PORT` | `7999` | Host port to publish. `PORT=8080 docker compose up -d` moves it. |
| `DATABASE_URL` | SQLite on the data volume | Point at SQL Server to use the real warehouse (see below). |

Put overrides in a `.env` file next to `docker-compose.yml`; Compose reads
it automatically.

### Data persistence

The app's own tables — business units, forecast configs, forecast entries,
and the audit trail that powers "see as of" — live in SQLite on the named
volume `forecasting-data`, mounted at `/app/data`. They survive
`docker compose down`, rebuilds, and image upgrades. Only `down -v` erases
them.

To back up: `docker compose cp app:/app/data/forecasting_pub.db ./backup.db`

Two notes if you change the storage:

- Moving to SQL Server means the app's tables get created there on first
  start; the volume then only matters if you switch back.
- If you swap the named volume for a **bind mount** (`./data:/app/data`),
  chown the host directory to uid `10001` — the container runs as a
  non-root user, and bind mounts keep host ownership.

## Run it locally (development)

Backend (API on **:7999**, seeds itself on first start):

```bash
cd backend
pip install -r requirements.txt
uvicorn app.main:app --reload --port 7999
```

Frontend (dev server on :5173, proxies `/api` to :7999):

```bash
cd frontend
npm install
npm run dev
```

Use <http://localhost:5173> while developing — that's the one with
hot-reload. Tests:

```bash
cd backend && python3 -m pytest tests/
```

## Wiring in the real sources

The app only ever **reads** the fact tables — they're skeletons today, fed
by `seed.py`. To swap in production data:

1. Point `DATABASE_URL` at SQL Server (`mssql+pyodbc://…`); the app's own
   tables (configs, entries, audit) create themselves.
2. Materialize each BU's source query into the standard fact shape
   (`fact_orders_sales`, `fact_pipeline` — see `models.py` for the standard
   dimension set). The `source_*_view` config fields record which views.
3. The generated SQL in `sqlgen.py` is portable (no aliases in GROUP BY,
   literal-quoted values); if dialects drift, that module is the seam.
4. Replace `SFDC_PLACEHOLDER_ID` in `services/grid.py` with the real bfo
   opportunity id column to make drill-down links land on the actual record.
5. Fact snapshots (for as-of on actuals/pipeline, not just rep input) ride
   in with the real sources — the `as_of` parameter already flows end to end.

Identity is a placeholder (`X-User` header, picked in the top bar). Swap-in
point for SSO: `current_user` in `backend/app/routers/forecast.py`.

## API sketch

| Method & path | What |
|---|---|
| `GET /api/business-units` | BUs with their configs |
| `POST /api/business-units` · `POST /api/business-units/{id}/configs` · `PUT /api/business-units/configs/{id}` | onboarding (SQL fragments validated here) |
| `GET /api/periods` · `GET /api/dimensions` | reference data |
| `GET /api/forecast/grid?config_id&periods=…[&as_of=…]` | the computed grid, optionally as of a timestamp |
| `POST /api/forecast/configs/{id}/slice-opportunities` | the opportunities behind one row |
| `PUT /api/forecast/configs/{id}/entries` | save adjustment / total / comment |
| `GET /api/forecast/configs/{id}/audit` | change history |

Interactive docs at `http://localhost:7999/docs`.
