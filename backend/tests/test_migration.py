"""The additive column migration.

`create_all` never alters an existing table, so upgrading against a
persisted volume would fail on a newly added column. `ensure_columns()`
closes that gap for nullable columns. Run in a subprocess because
database.py binds its engine at import time from DATABASE_URL.
"""
import subprocess
import sys
import tempfile
import textwrap
from pathlib import Path

BACKEND = Path(__file__).resolve().parents[1]


def _run(script: str, db_path: str) -> subprocess.CompletedProcess:
    return subprocess.run(
        [sys.executable, "-c", textwrap.dedent(script)],
        cwd=BACKEND,
        capture_output=True,
        text=True,
        env={"PATH": "/usr/bin:/bin:/usr/local/bin", "DATABASE_URL": f"sqlite:///{db_path}"},
    )


def test_ensure_columns_adds_missing_nullable_columns():
    with tempfile.TemporaryDirectory() as tmp:
        db = f"{tmp}/legacy.db"

        # A database shaped like the release before BYOQ landed.
        legacy = _run(
            """
            from sqlalchemy import text
            from app.database import engine
            with engine.begin() as c:
                c.execute(text('''
                    CREATE TABLE forecast_configs (
                        id INTEGER PRIMARY KEY,
                        business_unit_id INTEGER,
                        name VARCHAR(128),
                        active BOOLEAN,
                        levels JSON,
                        metric_rules JSON,
                        pipeline_weighting JSON,
                        fact_filters JSON,
                        bucket_rollups JSON,
                        source_orders_view VARCHAR(256),
                        source_pipeline_view VARCHAR(256),
                        created_at DATETIME
                    )
                '''))
                c.execute(text(
                    "INSERT INTO forecast_configs (id, name, active, levels) "
                    "VALUES (1, 'Legacy', 1, '[]')"
                ))
            print('legacy-ready')
            """,
            db,
        )
        assert "legacy-ready" in legacy.stdout, legacy.stderr

        # Starting the app must add the new columns and keep the existing row.
        upgraded = _run(
            """
            from sqlalchemy import inspect, text
            from app.database import Base, engine, ensure_columns
            import app.models  # register metadata
            Base.metadata.create_all(bind=engine)
            added = ensure_columns()
            cols = {c['name'] for c in inspect(engine).get_columns('forecast_configs')}
            with engine.begin() as c:
                name = c.execute(text('SELECT name FROM forecast_configs WHERE id = 1')).scalar()
            print('ADDED:', sorted(added))
            print('HAS_BYOQ:', {'source_orders_sql', 'source_pipeline_sql'} <= cols)
            print('ROW_KEPT:', name)
            print('IDEMPOTENT:', ensure_columns())
            """,
            db,
        )
        out = upgraded.stdout
        assert "HAS_BYOQ: True" in out, upgraded.stderr
        assert "source_orders_sql" in out
        assert "ROW_KEPT: Legacy" in out, "existing configuration must survive the upgrade"
        assert "IDEMPOTENT: []" in out, "a second run should add nothing"
