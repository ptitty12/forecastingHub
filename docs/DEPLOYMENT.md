# Deployment & operations

---

## One service, one port

```bash
docker compose up -d --build
```

Open <http://localhost:7999>. That is the entire deployment.

Local development runs two processes (uvicorn + the Vite dev server) purely
for hot-reload. **A deployment has no Vite.** The image build compiles the
frontend to static files and FastAPI serves them alongside the API from a
single process — so there is no reverse proxy to configure, no CORS in
production, and no second container to keep in sync.

```
docker compose up
        │
        ▼
┌──────────────────────────────────────────┐
│ image build (multi-stage)                │
│   stage 1  node   → npm run build → dist │
│   stage 2  python → FastAPI + that dist  │
└──────────────────────────────────────────┘
        │  one container, port 7999
        ▼
   /          → the React app
   /api/*     → the API
   /docs      → interactive API docs
```

### Everyday commands

```bash
docker compose logs -f      # follow logs
docker compose ps           # status, including health
docker compose restart      # restart in place
docker compose down         # stop; data survives
docker compose down -v      # stop AND erase the data volume
```

---

## Configuration

Both optional. Put overrides in a `.env` file beside `docker-compose.yml`;
Compose reads it automatically.

| Variable | Default | Purpose |
|---|---|---|
| `PORT` | `7999` | Host port to publish. `PORT=8080 docker compose up -d` |
| `DATABASE_URL` | SQLite on the data volume | Where the app's own tables live |

Inside the image, `FRONTEND_DIST` points at the compiled frontend. Leave it
alone unless you're changing the image layout.

---

## Data and persistence

The app's own tables — business units, forecast views, forecast entries, and
the audit trail that powers "see as of" — live in SQLite on the named volume
`forecasting-data`, mounted at `/app/data`.

They survive `docker compose down`, rebuilds, and image upgrades. **Only
`down -v` erases them.**

### Backup

```bash
docker compose cp app:/app/data/forecasting_pub.db ./backup-$(date +%F).db
```

SQLite is a single file; that copy is a complete backup. Restore by stopping
the app, copying the file back, and starting it.

Worth scheduling: the audit trail is the record of what people committed to
and cannot be reconstructed from source systems.

### Bind mounts

If you swap the named volume for a bind mount (`./data:/app/data`), chown
the host directory to uid `10001` — the container runs as a non-root user
and bind mounts keep host ownership.

```bash
mkdir -p data && sudo chown -R 10001:10001 data
```

---

## Upgrading

```bash
git pull
docker compose up -d --build
```

The volume is untouched, so configs, entries, and history carry across.

**Schema changes:** at startup the app calls `create_all` (new tables) and
then `ensure_columns()`, which adds **nullable** columns that exist in the
model but not yet in the table — so ordinary upgrades against a persisted
volume just work, and log what they added. Anything beyond that (a NOT NULL
column, a type change, a rename) raises at startup with the offending column
named, and needs a hand-written migration. Take a backup before those.

---

## Moving to SQL Server

The app only ever **reads** the fact tables; it owns just its own
configuration, entries, and audit tables.

1. Point `DATABASE_URL` at SQL Server:
   ```
   DATABASE_URL=mssql+pyodbc://user:pass@host/db?driver=ODBC+Driver+18+for+SQL+Server
   ```
2. Add `pyodbc` to `backend/requirements.txt` and the ODBC driver to the
   runtime stage of the `Dockerfile` (`unixodbc` plus the `msodbcsql18`
   package from the vendor's apt repository) — the slim base image ships
   neither.
3. Materialise each team's source query into the standard fact shape
   (`fact_orders_sales`, `fact_pipeline`; the column set is in
   `backend/app/models.py`). Each view's `source_*_view` fields record which
   views a team is meant to read.
4. Restart. The app's own tables are created on first start.

The generated SQL is written to be portable — no aliases in `GROUP BY`,
literal-quoted values — but `services/sqlgen.py` is the single seam if a
dialect ever diverges.

---

## Health and monitoring

The container exposes a health check that polls `/api/health` every 30s
(10s grace at start, 3 retries). `docker compose ps` shows the result, and
orchestrators can use it directly.

For an external monitor, `GET /api/health` returning `{"status":"ok"}` is
the signal.

---

## Security notes

- The container runs as **non-root** (uid 10001). Only `/app/data` is
  writable.
- **Identity is a placeholder.** The `X-User` header is trusted as sent. Do
  not expose the app outside a trusted network until SSO replaces
  `current_user` in `backend/app/routers/forecast.py`.
- **The admin tab accepts SQL** — both expression fragments and whole
  bring-your-own-query SELECTs. They are screened, compiled and executed at
  save time, and the app never writes source data, but a BYOQ query runs
  with the app's own database privileges. Grant the app a **read-only role**
  on source schemas, and treat access to Administration as database access.
- No secrets are baked into the image. `DATABASE_URL` is the only sensitive
  value; keep it in `.env` (git-ignored) or your orchestrator's secret store.

---

## Running without Docker

```bash
# backend — API and, if built, the frontend, on :7999
cd backend
pip install -r requirements.txt
uvicorn app.main:app --port 7999

# frontend — dev server with hot-reload on :5173, proxying /api to :7999
cd frontend
npm install
npm run dev
```

Use <http://localhost:5173> while developing. To serve the compiled app from
uvicorn alone, run `npm run build` first — `app/main.py` mounts
`frontend/dist` automatically when it exists.

---

## Troubleshooting

**"Can't reach the server" in the UI.** The API isn't up on 7999.
`docker compose logs app`.

**Port already in use.** `PORT=8080 docker compose up -d`.

**Data disappeared after a rebuild.** Check the volume still exists
(`docker volume ls | grep forecasting`). `down -v` removes it; `down` does
not.

**Health check failing but the app responds.** The check runs *inside* the
container against `127.0.0.1:$PORT`; confirm `PORT` matches the port uvicorn
was told to bind.

**Permission denied writing the database.** A bind mount owned by the wrong
user — see the chown note above.
