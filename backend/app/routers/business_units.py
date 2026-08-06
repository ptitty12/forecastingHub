"""BU + forecast-config administration — how new teams get onboarded."""
import re
from types import SimpleNamespace

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from ..database import get_db
from ..models import BusinessUnit, ForecastConfig
from ..routers.meta import DIMENSION_CATALOG
from ..schemas import (
    BusinessUnitIn,
    BusinessUnitOut,
    BusinessUnitUpdate,
    ForecastConfigIn,
    ForecastConfigOut,
)
from ..services import sqlgen

router = APIRouter(prefix="/api/business-units", tags=["business-units"])

VALID_DIMENSION_KEYS = {d.key for d in DIMENSION_CATALOG}
CUSTOM_KEY_RE = re.compile(r"^[a-z][a-z0-9_]{0,63}$")
WEIGHTING_MODES = ("win_probability", "threshold", "all", "sql")


def _validate_config(payload: ForecastConfigIn) -> None:
    keys = [lv.key for lv in payload.levels]
    if len(set(keys)) != len(keys):
        raise HTTPException(422, "Levels must use distinct dimensions")
    for lv in payload.levels:
        if lv.sql:
            if not CUSTOM_KEY_RE.match(lv.key):
                raise HTTPException(
                    422, f"Custom dimension key '{lv.key}' must be a lowercase slug (a-z, 0-9, _)"
                )
        elif lv.key not in VALID_DIMENSION_KEYS:
            raise HTTPException(422, f"Unknown dimension '{lv.key}' (custom levels must declare sql)")
    if "product_rollup" in keys and not payload.bucket_rollups:
        raise HTTPException(422, "product_rollup level requires bucket_rollups")
    if not payload.metric_rules.get("sql") and payload.metric_rules.get("default") not in ("orders", "sales"):
        raise HTTPException(422, "metric_rules.default must be 'orders' or 'sales' (or supply metric_rules.sql)")
    mode = payload.pipeline_weighting.get("mode")
    if mode not in WEIGHTING_MODES:
        raise HTTPException(422, f"pipeline_weighting.mode must be one of {WEIGHTING_MODES}")
    if mode == "threshold":
        thr = payload.pipeline_weighting.get("min_probability")
        if not isinstance(thr, (int, float)) or not 0 <= thr <= 1:
            raise HTTPException(422, "threshold weighting requires min_probability between 0 and 1")

    # Compile every SQL fragment once so a bad config is rejected at save time,
    # not when a rep opens the grid.
    probe = SimpleNamespace(
        levels=[lv.model_dump() for lv in payload.levels],
        metric_rules=payload.metric_rules,
        pipeline_weighting=payload.pipeline_weighting,
        fact_filters=payload.fact_filters,
        bucket_rollups=payload.bucket_rollups,
    )
    try:
        for level in probe.levels:
            sqlgen.level_expr(probe, level)
        sqlgen.metric_type_expr(probe.metric_rules)
        sqlgen.pipeline_weight_expr(probe.pipeline_weighting)
        sqlgen.filter_where(probe.fact_filters)
    except sqlgen.SqlValidationError as e:
        raise HTTPException(422, str(e))


@router.get("", response_model=list[BusinessUnitOut])
def list_business_units(db: Session = Depends(get_db)):
    return db.scalars(
        select(BusinessUnit).options(selectinload(BusinessUnit.configs)).order_by(BusinessUnit.name)
    ).all()


@router.post("", response_model=BusinessUnitOut, status_code=201)
def create_business_unit(payload: BusinessUnitIn, db: Session = Depends(get_db)):
    if db.scalar(select(BusinessUnit).where(BusinessUnit.code == payload.code)):
        raise HTTPException(409, f"Business unit '{payload.code}' already exists")
    bu = BusinessUnit(**payload.model_dump())
    db.add(bu)
    db.commit()
    db.refresh(bu)
    return bu


@router.put("/{bu_id}", response_model=BusinessUnitOut)
def update_business_unit(bu_id: int, payload: BusinessUnitUpdate, db: Session = Depends(get_db)):
    bu = db.get(BusinessUnit, bu_id)
    if not bu:
        raise HTTPException(404, "Business unit not found")
    data = payload.model_dump(exclude_unset=True)
    new_code = data.get("code")
    if new_code and new_code != bu.code:
        clash = db.scalar(select(BusinessUnit).where(BusinessUnit.code == new_code))
        if clash:
            raise HTTPException(409, f"Business unit '{new_code}' already exists")
    for k, v in data.items():
        setattr(bu, k, v)
    db.commit()
    db.refresh(bu)
    return bu


@router.post("/{bu_id}/configs", response_model=ForecastConfigOut, status_code=201)
def create_config(bu_id: int, payload: ForecastConfigIn, db: Session = Depends(get_db)):
    bu = db.get(BusinessUnit, bu_id)
    if not bu:
        raise HTTPException(404, "Business unit not found")
    _validate_config(payload)
    existing = db.scalar(
        select(ForecastConfig).where(
            ForecastConfig.business_unit_id == bu_id, ForecastConfig.name == payload.name
        )
    )
    if existing:
        raise HTTPException(409, f"Config '{payload.name}' already exists for this BU")
    config = ForecastConfig(business_unit_id=bu_id, **payload.model_dump())
    db.add(config)
    db.commit()
    db.refresh(config)
    return config


@router.put("/configs/{config_id}", response_model=ForecastConfigOut)
def update_config(config_id: int, payload: ForecastConfigIn, db: Session = Depends(get_db)):
    config = db.get(ForecastConfig, config_id)
    if not config:
        raise HTTPException(404, "Config not found")
    _validate_config(payload)
    if payload.name != config.name:
        clash = db.scalar(
            select(ForecastConfig).where(
                ForecastConfig.business_unit_id == config.business_unit_id,
                ForecastConfig.name == payload.name,
                ForecastConfig.id != config_id,
            )
        )
        if clash:
            raise HTTPException(409, f"Config '{payload.name}' already exists for this team")
    # Levels define slice identity: changing them re-slices the grid, and
    # existing entries keyed to the old shape stop matching. They are kept
    # (nothing is deleted) but will not surface until the shape matches again.
    for k, v in payload.model_dump().items():
        setattr(config, k, v)
    db.commit()
    db.refresh(config)
    return config
