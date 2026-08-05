"""The forecast grid, drill-down, and rep input.

Identity for now is a trusted X-User header (the frontend sends the picked
user). Swap-in point for SSO: replace `current_user` with a real dependency;
nothing else changes.
"""
from datetime import datetime

from fastapi import APIRouter, Depends, Header, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import ForecastAudit, ForecastConfig, ForecastEntry, Period
from ..schemas import (
    AuditOut,
    EntryOut,
    EntryUpsert,
    GridOut,
    GridRowOut,
    OpportunityOut,
    SliceOppsRequest,
)
from ..services.grid import build_grid, make_slice_key, slice_opportunities
from ..services.sqlgen import SqlValidationError

router = APIRouter(prefix="/api/forecast", tags=["forecast"])

EDITABLE_FIELDS = ("adjustment", "total_forecast", "comment")


def current_user(x_user: str = Header(default="demo.user")) -> str:
    return x_user


def _get_config(db: Session, config_id: int) -> ForecastConfig:
    config = db.get(ForecastConfig, config_id)
    if not config:
        raise HTTPException(404, "Config not found")
    return config


@router.get("/grid", response_model=GridOut)
def get_grid(
    config_id: int,
    periods: list[str] = Query(min_length=1),
    as_of: datetime | None = Query(
        default=None,
        description="Reconstruct rep input as of this moment (audit replay). "
        "Source facts are live regardless — fact snapshots come with real-source wiring.",
    ),
    db: Session = Depends(get_db),
):
    config = _get_config(db, config_id)
    known = {p.code for p in db.scalars(select(Period))}
    unknown = [p for p in periods if p not in known]
    if unknown:
        raise HTTPException(422, f"Unknown periods: {unknown}")
    try:
        rows = build_grid(db, config, periods, as_of=as_of)
    except SqlValidationError as e:
        raise HTTPException(422, f"Config SQL error: {e}")
    return GridOut(
        config=config,
        periods=periods,
        as_of=as_of,
        rows=[GridRowOut(**row.__dict__) for row in rows],
    )


@router.post("/configs/{config_id}/slice-opportunities", response_model=list[OpportunityOut])
def get_slice_opportunities(
    config_id: int,
    payload: SliceOppsRequest,
    db: Session = Depends(get_db),
):
    """The open bfo opportunities building one grid row's pipeline estimate."""
    config = _get_config(db, config_id)
    if not db.get(Period, payload.period_code):
        raise HTTPException(422, f"Unknown period '{payload.period_code}'")
    try:
        return slice_opportunities(db, config, payload.period_code, payload.slice_values)
    except SqlValidationError as e:
        raise HTTPException(422, f"Config SQL error: {e}")


@router.put("/configs/{config_id}/entries", response_model=EntryOut)
def upsert_entry(
    config_id: int,
    payload: EntryUpsert,
    db: Session = Depends(get_db),
    user: str = Depends(current_user),
):
    config = _get_config(db, config_id)
    if not db.get(Period, payload.period_code):
        raise HTTPException(422, f"Unknown period '{payload.period_code}'")
    bad = [f for f in payload.set_fields if f not in EDITABLE_FIELDS]
    if bad:
        raise HTTPException(422, f"Not editable: {bad}")

    level_keys = [lv["key"] for lv in config.levels]
    slice_values = {k: payload.slice_values.get(k) or "" for k in level_keys}
    slice_key = make_slice_key(config.levels, slice_values)

    entry = db.scalar(
        select(ForecastEntry).where(
            ForecastEntry.config_id == config_id,
            ForecastEntry.period_code == payload.period_code,
            ForecastEntry.slice_key == slice_key,
        )
    )
    if not entry:
        entry = ForecastEntry(
            config_id=config_id,
            period_code=payload.period_code,
            slice_key=slice_key,
            slice_values=slice_values,
            updated_by=user,
        )
        db.add(entry)

    changes: list[tuple[str, str | None, str | None]] = []

    def apply(fieldname: str, new_value):
        old_value = getattr(entry, fieldname)
        if old_value != new_value:
            changes.append((fieldname, _fmt(old_value), _fmt(new_value)))
            setattr(entry, fieldname, new_value)

    if "adjustment" in payload.set_fields:
        apply("adjustment", payload.adjustment)
        # last-edited-wins: an adjustment edit invalidates a stored total
        if "total_forecast" not in payload.set_fields:
            apply("total_forecast", None)
    if "total_forecast" in payload.set_fields:
        apply("total_forecast", payload.total_forecast)
        if "adjustment" not in payload.set_fields:
            apply("adjustment", None)
    if "comment" in payload.set_fields:
        apply("comment", payload.comment)

    if changes:
        entry.updated_by = user
        for fieldname, old, new in changes:
            db.add(
                ForecastAudit(
                    config_id=config_id,
                    period_code=payload.period_code,
                    slice_key=slice_key,
                    field=fieldname,
                    old_value=old,
                    new_value=new,
                    changed_by=user,
                )
            )
    db.commit()
    db.refresh(entry)
    return entry


def _fmt(value) -> str | None:
    return None if value is None else str(value)


@router.get("/configs/{config_id}/audit", response_model=list[AuditOut])
def get_audit(
    config_id: int,
    period_code: str | None = None,
    slice_key: str | None = None,
    limit: int = Query(default=100, le=500),
    db: Session = Depends(get_db),
):
    _get_config(db, config_id)
    q = select(ForecastAudit).where(ForecastAudit.config_id == config_id)
    if period_code:
        q = q.where(ForecastAudit.period_code == period_code)
    if slice_key:
        q = q.where(ForecastAudit.slice_key == slice_key)
    q = q.order_by(ForecastAudit.changed_at.desc(), ForecastAudit.id.desc()).limit(limit)
    return db.scalars(q).all()
