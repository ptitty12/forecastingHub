"""Seed the skeleton demo environment.

Everything in here is invented. No real customer, employee, opportunity, or
revenue figure appears in this repository:

- Accounts are puns on well-known companies (never the real names).
- Sellers and managers are named after New Girl characters.
- Products are generic Hardware / Services / Software categories, with
  `product_line` holding the three top-level categories and
  `product_bucket` the finer bucket.
- Amounts are randomly generated from a fixed seed, scaled so the shape is
  plausible (hardware deals large, services mid, software small; Q4 strong,
  Q1 soft) — but the values themselves mean nothing.

Three business configs are seeded, deliberately shaped differently, to
exercise the config-driven engine end to end:

- NonSecurePower / SAO — Seller > Account > Product Bucket, with a lens rule
  (software forecasts on Sales, everything else on Orders) and
  win-probability pipeline weighting.
- Analog Energy / Field Sales — Region > State > Product Rollup (custom
  bucket groupings) with threshold pipeline weighting (opps >= 45% only).
- NonSecurePower / Coast Rollup — two levels, the first a pure-SQL dimension.

Facts span five quarters around the seeded "today": two closed quarters of
actuals, the in-flight quarter with partial actuals plus open pipeline, and
two future quarters that are pipeline-only.

Idempotent: runs only when the database has no business units.
"""
import random
from datetime import date, datetime, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from .models import (
    BusinessUnit,
    FactOrdersSales,
    FactPipeline,
    ForecastAudit,
    ForecastConfig,
    ForecastEntry,
    Period,
)
from .services.grid import make_slice_key

TODAY = date(2026, 8, 5)

PERIODS = [
    ("2026 Q1", 2026, 1, date(2026, 1, 1), date(2026, 3, 31)),
    ("2026 Q2", 2026, 2, date(2026, 4, 1), date(2026, 6, 30)),
    ("2026 Q3", 2026, 3, date(2026, 7, 1), date(2026, 9, 30)),
    ("2026 Q4", 2026, 4, date(2026, 10, 1), date(2026, 12, 31)),
    ("2027 Q1", 2027, 1, date(2027, 1, 1), date(2027, 3, 31)),
]

# Year-end push, soft Q1 — enough shape to make the trend charts read.
QUARTER_FACTOR = {
    "2026 Q1": 0.94,
    "2026 Q2": 1.00,
    "2026 Q3": 1.06,
    "2026 Q4": 1.15,
    "2027 Q1": 0.98,
}

# --- products: three top-level lines, finer buckets underneath ---------------

SP_BUCKETS = [
    "Power Hardware",
    "Cooling Hardware",
    "Rack Hardware",
    "Deployment Services",
    "Maintenance Services",
    "Monitoring Software",
]
DE_BUCKETS = [
    "Switchgear Hardware",
    "Metering Hardware",
    "Relay Hardware",
    "Grid Software",
    "Analytics Software",
    "Field Services",
]
PRODUCT_LINE = {
    "Power Hardware": "Hardware",
    "Cooling Hardware": "Hardware",
    "Rack Hardware": "Hardware",
    "Switchgear Hardware": "Hardware",
    "Metering Hardware": "Hardware",
    "Relay Hardware": "Hardware",
    "Deployment Services": "Services",
    "Maintenance Services": "Services",
    "Field Services": "Services",
    "Monitoring Software": "Software",
    "Grid Software": "Software",
    "Analytics Software": "Software",
}
DE_ROLLUPS = {
    "Hardware": ["Switchgear Hardware", "Metering Hardware", "Relay Hardware"],
    "Software": ["Grid Software", "Analytics Software"],
    "Services": ["Field Services"],
}

# Deal-size scales per product line: (low, high, mode) for a triangular draw.
ORDER_SCALE = {
    "Hardware": (40_000, 3_200_000, 380_000),
    "Services": (15_000, 700_000, 110_000),
    "Software": (10_000, 450_000, 70_000),
}
PIPE_SCALE = {
    "Hardware": (120_000, 6_500_000, 900_000),
    "Services": (40_000, 1_400_000, 240_000),
    "Software": (25_000, 900_000, 150_000),
}

# --- people: New Girl characters --------------------------------------------

SP_MANAGER = "Russell Schiller"
DE_MANAGER = "Bob Day"
DE_SELLERS = ["Schmidt", "Coach Tagliaboo", "Aly Nelson", "Reagan Lucas"]

# --- accounts: puns, never the real thing -----------------------------------

SP_SELLERS = {
    "Jess Day": ["Toggle Telecom", "Disadvantage Depots", "Aluminum Foothills"],
    "Nick Miller": ["Inequinox", "Analog Realty", "Rigidential"],
    "Winston Bishop": ["Macrohard", "Peripheral Knitworks", "Nile Web Services"],
    "Cece Parekh": ["Literal Platforms", "Skeptic Cloud", "Askew Data Centers", "Heap Infrastructure"],
}

# Regional utilities, mapped to states so coverage looks plausible (and the
# misplaced ones are part of the joke).
DE_REGIONS = {
    "Northeast": {"NY": "Scattered Edison", "MA": "Regional Grid", "PA": "Second Energy"},
    "South": {"TX": "LastEra Power", "FL": "Earl Energy", "GA": "Northern Company"},
    "West": {"CA": "Atlantic Gas & Static", "WA": "Puget Silence Energy", "AZ": "Sugar Creek Project"},
}

SP_STATES = ["NV", "VA", "TX", "OR"]

PIPE_STAGES = [
    ("Identify", 0.10),
    ("Qualify", 0.25),
    ("Propose", 0.45),
    ("Negotiate", 0.70),
    ("Commit", 0.90),
]
PROJECT_KINDS = ["expansion", "refresh", "buildout", "retrofit", "consolidation"]

# Slices carrying pre-seeded rep entries. Facts are forced to exist for these
# so the demo grid shows lived-in rows with real numbers behind them.
ANCHORS = [
    ("Jess Day", "Toggle Telecom", "Power Hardware"),
    ("Jess Day", "Toggle Telecom", "Rack Hardware"),
    ("Nick Miller", "Inequinox", "Cooling Hardware"),
]


def _rand_day(rng: random.Random, start: date, end: date) -> date:
    return start + timedelta(days=rng.randint(0, (end - start).days))


def _amount(rng: random.Random, scale: tuple[int, int, int], factor: float) -> float:
    low, high, mode = scale
    return round(rng.triangular(low, high, mode) * factor, -2)


def seed_if_empty(db: Session) -> bool:
    if db.scalar(select(BusinessUnit).limit(1)):
        return False

    for code, year, quarter, start, end in PERIODS:
        db.add(Period(code=code, year=year, quarter=quarter, start_date=start, end_date=end))

    sp = BusinessUnit(code="NSP", name="NonSecurePower", description="UPS, cooling, racks, DC infrastructure")
    de = BusinessUnit(code="AE", name="Analog Energy", description="Grid automation, metering, power systems")
    db.add_all([sp, de])
    db.flush()

    sp_cfg = ForecastConfig(
        business_unit_id=sp.id,
        name="SAO",
        levels=[
            {"key": "seller", "label": "Seller"},
            {"key": "account", "label": "Account"},
            {"key": "product_bucket", "label": "Product Bucket"},
        ],
        # Lens rule: software is forecast on invoicing, hardware on bookings.
        metric_rules={
            "default": "orders",
            "overrides": [{"field": "product_line", "equals": "Software", "metric": "sales"}],
        },
        pipeline_weighting={"mode": "win_probability"},
        fact_filters={"business_unit": ["NonSecurePower"]},
        source_orders_view="orders_sales_standard_view",
        source_pipeline_view="pipeline_standard_view",
    )
    de_cfg = ForecastConfig(
        business_unit_id=de.id,
        name="Field Sales",
        levels=[
            {"key": "region", "label": "Region"},
            {"key": "state", "label": "State"},
            {"key": "product_rollup", "label": "Product Group"},
        ],
        metric_rules={"default": "orders", "overrides": []},
        # Threshold weighting: an opp only counts once its win probability
        # clears the bar the team sets.
        pipeline_weighting={"mode": "threshold", "min_probability": 0.45},
        fact_filters={"business_unit": ["Analog Energy"]},
        bucket_rollups=DE_ROLLUPS,
    )
    # Demonstrates custom SQL dimensions and a non-3 level count: two levels,
    # the first declared entirely as SQL over the standard fact columns.
    sp_coast_cfg = ForecastConfig(
        business_unit_id=sp.id,
        name="Coast Rollup",
        levels=[
            {
                "key": "coast",
                "label": "Coast",
                "sql": "CASE WHEN state IN ('VA', 'NY') THEN 'East' ELSE 'West' END",
            },
            {"key": "product_bucket", "label": "Product Bucket"},
        ],
        metric_rules={"default": "orders", "overrides": []},
        pipeline_weighting={"mode": "all"},
        fact_filters={"business_unit": ["NonSecurePower"]},
    )
    db.add_all([sp_cfg, de_cfg, sp_coast_cfg])
    db.flush()

    rng = random.Random(51)  # deterministic demo data
    opp_counter = [0]

    def add_ons(code: str, start: date, end: date, cap: date | None, **dims):
        """Booked orders and invoiced sales for one slice in one period."""
        end = min(end, cap) if cap else end
        if start > end:
            return
        line = PRODUCT_LINE[dims["product_bucket"]]
        factor = QUARTER_FACTOR[code]
        for txn_type in ("Orders", "Sales"):
            for _ in range(rng.randint(2, 5)):
                db.add(
                    FactOrdersSales(
                        transaction_date=_rand_day(rng, start, end),
                        fiscal_period=code,
                        transaction_type=txn_type,
                        amount=_amount(rng, ORDER_SCALE[line], factor),
                        **dims,
                    )
                )

    def add_pipeline(code: str, start: date, end: date, **dims):
        """Open opportunities closing in one period for one slice."""
        line = PRODUCT_LINE[dims["product_bucket"]]
        factor = QUARTER_FACTOR[code]
        for _ in range(rng.randint(1, 4)):
            opp_counter[0] += 1
            stage, prob = rng.choice(PIPE_STAGES)
            subject = dims.get("account") or dims.get("state")
            db.add(
                FactPipeline(
                    opportunity_id=f"OPP-{opp_counter[0]:05d}",
                    opportunity_name=f"{subject} {dims['product_bucket']} {rng.choice(PROJECT_KINDS)}",
                    close_date=_rand_day(rng, max(start, TODAY), end) if end >= TODAY else _rand_day(rng, start, end),
                    fiscal_period=code,
                    stage=stage,
                    status="Open",
                    win_probability=prob,
                    amount=_amount(rng, PIPE_SCALE[line], factor),
                    **dims,
                )
            )

    for code, _, _, start, end in PERIODS:
        past = end < TODAY
        current = start <= TODAY <= end

        # NonSecurePower: seller / account / bucket grain
        for seller, accounts in SP_SELLERS.items():
            for account in accounts:
                buckets = set(rng.sample(SP_BUCKETS, rng.randint(4, 6)))
                buckets |= {b for (s, a, b) in ANCHORS if s == seller and a == account}
                for bucket in sorted(buckets):
                    dims = dict(
                        business_unit="NonSecurePower",
                        manager=SP_MANAGER,
                        seller=seller,
                        region="NAM",
                        account_segment="Cloud & Service Provider",
                        state=rng.choice(SP_STATES),
                        country="US",
                        account=account,
                        product_bucket=bucket,
                        product_line=PRODUCT_LINE[bucket],
                    )
                    if past or current:
                        add_ons(code, start, end, TODAY if current else None, **dims)
                    if not past and rng.random() < 0.8:
                        add_pipeline(code, start, end, **dims)

        # Analog Energy: region / state / bucket grain
        for region, states in DE_REGIONS.items():
            for state, utility in states.items():
                for bucket in rng.sample(DE_BUCKETS, rng.randint(4, 6)):
                    dims = dict(
                        business_unit="Analog Energy",
                        manager=DE_MANAGER,
                        seller=rng.choice(DE_SELLERS),
                        region=region,
                        account_segment="Utilities",
                        state=state,
                        country="US",
                        account=utility,
                        product_bucket=bucket,
                        product_line=PRODUCT_LINE[bucket],
                    )
                    if past or current:
                        add_ons(code, start, end, TODAY if current else None, **dims)
                    if not past and rng.random() < 0.7:
                        add_pipeline(code, start, end, **dims)

    # A few pre-existing rep entries so the grid shows lived-in state.
    sample_entries = [
        dict(
            period_code="2026 Q3",
            slice_values={"seller": "Jess Day", "account": "Toggle Telecom", "product_bucket": "Power Hardware"},
            adjustment=-1_250_000.0,
            comment="Two-site rollout slipping into Q4 — pulled 2 units out of this quarter.",
            updated_by="jess.day",
        ),
        dict(
            period_code="2026 Q3",
            slice_values={"seller": "Jess Day", "account": "Toggle Telecom", "product_bucket": "Rack Hardware"},
            adjustment=800_000.0,
            comment="Phase 2 expansion verbal, PO expected mid-September.",
            updated_by="jess.day",
        ),
        dict(
            period_code="2026 Q4",
            slice_values={"seller": "Nick Miller", "account": "Inequinox", "product_bucket": "Cooling Hardware"},
            total_forecast=6_500_000.0,
            comment="Committing at 6.5M — liquid cooling retrofit signed off.",
            updated_by="nick.miller",
        ),
    ]
    # Entries carry a backdated audit trail so change history and the
    # "see as of" snapshot view have real state to replay in the demo world.
    entered_at = datetime(2026, 8, 1, 14, 30, tzinfo=timezone.utc)
    for item in sample_entries:
        slice_values = item.pop("slice_values")
        slice_key = make_slice_key(sp_cfg.levels, slice_values)
        db.add(
            ForecastEntry(
                config_id=sp_cfg.id,
                slice_key=slice_key,
                slice_values=slice_values,
                updated_at=entered_at,
                **item,
            )
        )
        for fieldname in ("adjustment", "total_forecast", "comment"):
            if item.get(fieldname) is not None:
                db.add(
                    ForecastAudit(
                        config_id=sp_cfg.id,
                        period_code=item["period_code"],
                        slice_key=slice_key,
                        field=fieldname,
                        old_value=None,
                        new_value=str(item[fieldname]),
                        changed_by=item["updated_by"],
                        changed_at=entered_at,
                    )
                )

    db.commit()
    return True
