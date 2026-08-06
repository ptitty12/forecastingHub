"""Database setup.

SQLite by default for local dev. Set DATABASE_URL to point at SQL Server
(mssql+pyodbc://...) when wiring up the real warehouse-hosted tables.
The app only ever READS the fact tables (orders/sales, pipeline) — they are
managed by external processes in production.
"""
import os

from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

DATABASE_URL = os.environ.get("DATABASE_URL", "sqlite:///./forecasting_pub.db")

connect_args = {"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {}
engine = create_engine(DATABASE_URL, connect_args=connect_args)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


class Base(DeclarativeBase):
    pass


def get_db():
    db: Session = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def ensure_columns() -> list[str]:
    """Add model columns missing from existing tables.

    `create_all` makes new tables but never alters existing ones, so an
    upgrade against a persisted volume would otherwise fail on a new column.
    Only nullable columns are added — anything else needs a real migration
    and is reported instead of guessed at.
    """
    from sqlalchemy import inspect, text

    added: list[str] = []
    insp = inspect(engine)
    for table in Base.metadata.sorted_tables:
        if not insp.has_table(table.name):
            continue
        existing = {c["name"] for c in insp.get_columns(table.name)}
        for col in table.columns:
            if col.name in existing:
                continue
            if not col.nullable:
                raise RuntimeError(
                    f"{table.name}.{col.name} is missing and is NOT NULL — "
                    "this upgrade needs a hand-written migration."
                )
            ddl = f"ALTER TABLE {table.name} ADD COLUMN {col.name} {col.type.compile(engine.dialect)}"
            with engine.begin() as conn:
                conn.execute(text(ddl))
            added.append(f"{table.name}.{col.name}")
    return added
