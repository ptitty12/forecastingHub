"""Reference data: periods, the dimension catalog, and the BYOQ contract."""
from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import STANDARD_DIMENSIONS, Period
from ..schemas import DimensionOut, PeriodOut, SourceContractOut
from ..services.grid import ROLLUP_DIMENSION
from ..services.sqlgen import SOURCE_CONTRACT

router = APIRouter(prefix="/api", tags=["meta"])

DIMENSION_CATALOG: list[DimensionOut] = [
    DimensionOut(key="manager", label="Manager"),
    DimensionOut(key="seller", label="Seller"),
    DimensionOut(key="region", label="Region"),
    DimensionOut(key="account_segment", label="Account Segment"),
    DimensionOut(key="state", label="State"),
    DimensionOut(key="country", label="Country"),
    DimensionOut(key="account", label="Account"),
    DimensionOut(key="product_bucket", label="Product Bucket"),
    DimensionOut(key="product_line", label="Product Line"),
    DimensionOut(
        key=ROLLUP_DIMENSION,
        label="Product Rollup",
        derived=True,
        description="Custom groupings of product buckets, defined per config via bucket_rollups.",
    ),
]


@router.get("/periods", response_model=list[PeriodOut])
def list_periods(db: Session = Depends(get_db)):
    return db.scalars(select(Period).order_by(Period.year, Period.quarter)).all()


@router.get("/dimensions", response_model=list[DimensionOut])
def list_dimensions():
    return DIMENSION_CATALOG


SOURCE_NOTES = [
    "Return a SELECT (a leading WITH … is fine). UNION is allowed and expected —"
    " most real extractions union several source systems.",
    "If the underlying data has no value for a required column, select a literal:"
    " NULL AS stage.",
    "Every column your config references must also be returned: level columns,"
    " lens rule fields, and filter columns.",
    "Row grain is yours. The engine only ever aggregates, so one row per line,"
    " per header, or pre-aggregated all work.",
    "No trailing semicolon, no comments, nothing that writes — the query is"
    " wrapped as a subquery and screened before it runs.",
    "Validated by executing it when you save, so a missing column fails for you"
    " with the database's own message, not for a seller opening the grid.",
]


@router.get("/source-contract", response_model=list[SourceContractOut])
def source_contract():
    """What a bring-your-own query must return, per source."""
    return [
        SourceContractOut(
            source=source,
            standard_table=spec["table"],
            required_columns=spec["required"],
            standard_dimensions=STANDARD_DIMENSIONS,
            notes=SOURCE_NOTES,
        )
        for source, spec in SOURCE_CONTRACT.items()
    ]
