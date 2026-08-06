# One image, one service.
#
# The frontend is compiled to static files in stage 1; stage 2 runs FastAPI,
# which serves those files alongside the API on a single port. The Vite dev
# server exists only for local hot-reload — it is not part of a deployment.

# ---- stage 1: build the frontend ----
FROM node:22-slim AS webbuild
WORKDIR /web

# Copy manifests first so `npm ci` is cached until dependencies change.
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci

COPY frontend/ ./
RUN npm run build          # -> /web/dist

# ---- stage 2: the runtime ----
FROM python:3.11-slim
WORKDIR /app

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PORT=7999 \
    FRONTEND_DIST=/app/frontend-dist \
    DATABASE_URL=sqlite:////app/data/forecasting_pub.db

COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY backend/app ./app
COPY --from=webbuild /web/dist ./frontend-dist

# Run as a non-root user. /app/data is the SQLite home and the only path
# that needs to be writable — mount a volume there to persist configs,
# forecast entries, and the audit trail across container replacements.
RUN useradd --create-home --uid 10001 appuser \
    && mkdir -p /app/data \
    && chown -R appuser:appuser /app/data
USER appuser
VOLUME ["/app/data"]

EXPOSE 7999

# No curl in the image — ask Python instead.
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD python -c "import os,urllib.request; urllib.request.urlopen('http://127.0.0.1:'+os.environ['PORT']+'/api/health').read()"

CMD ["sh", "-c", "exec uvicorn app.main:app --host 0.0.0.0 --port ${PORT}"]
