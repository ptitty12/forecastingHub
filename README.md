# Forecasting Pub 🍺

**One place for sales teams to call their number.**

Reps enter where they'll land this quarter and the next few. The Pub
suggests a starting number from booked business plus open pipeline, shows
the actual deals behind every suggestion, and keeps a complete audit trail —
so you can rewind the forecast to any date and see exactly what everyone had
committed to at the time.

It replaces a SharePoint/PowerApp setup that had to be rebuilt per team.

```bash
docker compose up -d --build     # → http://localhost:7999
```

---

## Documentation

| Guide | For | Covers |
|---|---|---|
| **[User guide](docs/USER_GUIDE.md)** | Sellers & managers | Entering a forecast, reading the columns, drill-down, seeing the past |
| **[Admin guide](docs/ADMIN_GUIDE.md)** | Whoever onboards teams | Adding and editing teams, levels, metrics, weighting, what's safe to change |
| **[Architecture](docs/ARCHITECTURE.md)** | Engineers | Layers, the config-to-SQL compiler, the grid engine, conventions |
| **[API reference](docs/API.md)** | Integrators | Every endpoint, request and response shapes, error codes |
| **[Deployment](docs/DEPLOYMENT.md)** | Operators | Docker, config, persistence, backup, upgrades, SQL Server |
| **[Overview deck](docs/Forecasting-Pub-Overview.pptx)** | Anyone being shown it | 10 slides of functionality with screenshots ([rebuild](docs/deck/README.md)) |
| **[CLAUDE.md](CLAUDE.md)** | Agents | The working contract for changing this codebase |

Interactive API docs are served at `/docs` on the running app.

---

## The core idea

A dozen business units forecast the same business in a dozen different
shapes, and there's no realistic way to make them agree. So the app has no
opinion about shape: **everything that differs between teams is
configuration**, and that configuration compiles to SQL that runs in the
database.

| A team declares | Example |
|---|---|
| **Levels** — how rows are grouped (1–8, standard dimensions or custom SQL) | Seller → Account → Product Bucket |
| **Metric** — orders or sales, with exceptions | orders, except software on sales |
| **Pipeline weighting** — how open deals count | only deals ≥ 45% likely, at full value |
| **Product groups** — custom bucket rollups | 6 buckets → Hardware / Software / Services |
| **Filters** — which source rows belong to this team | `business_unit = 'Analog Energy'` |
| **Bring your own query** — a whole SELECT when filters aren't enough | union several ERPs, then slice it the normal way |

Onboarding a team is a form in the Administration tab. No schema changes, no
new endpoints, no new screens, no deploy.

---

## What's in the app

**Forecast tab** — the entry grid: actuals, open pipeline, two suggestions,
editable adjustment/total (linked, last-edit-wins), comments, filters,
multi-quarter entry, totals, and trend visuals. Expand any row to see the
Salesforce opportunities behind it, each linking out to the record.

**See as of** — pick a date and the grid rewinds to what everyone had
entered then, replayed from the audit trail. "Compare to now" adds current
values and deltas.

**Dashboard tab** — trajectory line, plus a breakdown explorer with
measure/group-by switchers and stacked-bar or line rendering.

**Administration tab** — add and edit teams: levels (including custom SQL
dimensions), metric rules, weighting, product groups. Deactivate instead of
delete, so nothing is ever lost.

**Audit everywhere** — every change to a number or comment writes an
immutable record: field, old → new, who, when.

---

## Repository layout

```
backend/
  app/
    models.py            three zones: source facts, configuration, forecast input
    services/sqlgen.py   the config → SQL compiler (+ the SQL guard)
    services/grid.py     aggregation, slice universe, audit replay, drill-down
    routers/             HTTP surface and validation
    seed.py              the invented demo world
  tests/                 28 tests, incl. BYOQ, migration and anonymization guards
frontend/
  src/pages/             ForecastPage · DashboardPage · AdminPage
  src/components/        InfoTip, HelpBanner, charts, editable cells
  src/lib/help.ts        every explanation string in the app
docs/                    the guides listed above
Dockerfile               multi-stage: node build → python runtime
docker-compose.yml       the whole deployment
```

---

## Demo data is entirely invented

This repository is public, so nothing in it describes real business:

- **Accounts** are puns on well-known companies — *Toggle Telecom*,
  *Macrohard*, *Inequinox*, *Analog Realty*, *Scattered Edison*, *Tennessee
  Valley Suggestion* — never a real customer.
- **People** are New Girl characters.
- **Products** are generic Hardware / Services / Software categories.
- **Amounts** are random draws from a fixed seed, scaled so the *shape* is
  plausible (hardware large, software small, Q4 strong). The numbers
  themselves mean nothing.
- **Business units** (*NonSecurePower*, *Analog Energy*) and the employer
  name (*Energy 'r US*) are equally fictional.

`backend/tests/test_anonymization.py` enforces this: it scans the whole repo
— Python, TypeScript, Markdown, compose files — against a denylist of real
company, employee, product, and internal system names, and asserts the
seeded people, accounts, and product lines come only from the invented sets.
Reintroduce a real name and the suite fails.

---

## Development

```bash
# backend (API on :7999, seeds itself on first start)
cd backend && pip install -r requirements.txt
uvicorn app.main:app --reload --port 7999

# frontend (dev server on :5173, proxies /api to :7999)
cd frontend && npm install && npm run dev
```

Work against <http://localhost:5173> — that's the one with hot-reload.

```bash
cd backend && python3 -m pytest tests/     # must stay green
cd frontend && npx tsc -b && npm run build # must stay clean
```

---

## Status and known limits

Working end to end on skeleton data. Before production use:

- **Identity is a placeholder** — the `X-User` header is trusted as sent.
  One function (`current_user` in `routers/forecast.py`) is the SSO seam.
- **Source facts are skeletons** — real feeds land in the standard fact
  shape; see [Deployment](docs/DEPLOYMENT.md#moving-to-sql-server).
- **"See as of" rewinds rep input only.** Actuals and pipeline stay live
  because the source tables have no snapshots yet. Called out in the UI.
- **Opportunity links use a placeholder id** until the real one is in the
  pipeline feed (`SFDC_PLACEHOLDER_ID` in `services/grid.py`).
