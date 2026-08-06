"""Guard: the seeded demo world must stay fully invented.

This repository is public, so no real customer, employee, product, or
revenue value may appear in seed data. These tests fail loudly if someone
reintroduces one.
"""
import os
import pathlib
import tempfile

import pytest
from fastapi.testclient import TestClient

_tmp = tempfile.mkdtemp()
os.environ.setdefault("DATABASE_URL", f"sqlite:///{_tmp}/test_anon.db")

from app import seed  # noqa: E402
from app.main import app  # noqa: E402

# Names that were present in early drafts (taken from a screenshot of the
# legacy tool) or that name real companies/products. None may come back.
FORBIDDEN = [
    # people
    "Patrick Taylor", "Adam Roberts", "Maria Chen", "DeShawn Carter",
    "Priya Natarajan", "Dana Whitfield", "Luis Ortega", "Sam Patel",
    "Jo Lindqvist", "Terry Adams",
    # customers
    "Switch Communications", "Vantage Data Centers", "Iron Mountain",
    "Equinix", "Digital Realty", "Microsoft", "CoreWeave", "Meta Platforms",
    "Oracle Cloud", "Hyper Solutions",
    # real product / internal system names
    "GVXL", "EcoStruxure", "Galaxy", "sp_ons", "UsPipelineStandards",
    "partnersalesops", "PartnerSalesOps",
]

VALID_LINES = {"Hardware", "Services", "Software"}


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as c:
        yield c


def test_seed_source_has_no_real_names():
    source = pathlib.Path(seed.__file__).read_text()
    hits = [name for name in FORBIDDEN if name.lower() in source.lower()]
    assert not hits, f"real names found in seed.py: {hits}"


def test_repo_python_has_no_real_names():
    """Nothing anywhere in the backend package should carry a real name."""
    root = pathlib.Path(seed.__file__).parent
    hits = []
    for path in root.rglob("*.py"):
        text = path.read_text().lower()
        for name in FORBIDDEN:
            if name.lower() in text:
                hits.append(f"{path.name}: {name}")
    assert not hits, f"real names found: {hits}"


def test_seeded_people_are_fictional(client):
    """Sellers and managers come from the invented cast only."""
    expected_sellers = set(seed.SP_SELLERS) | set(seed.DE_SELLERS)
    expected_managers = {seed.SP_MANAGER, seed.DE_MANAGER}
    for cfg_name, level in (("SAO", "seller"),):
        bus = client.get("/api/business-units").json()
        cfg = next(c for b in bus for c in b["configs"] if c["name"] == cfg_name)
        grid = client.get(
            "/api/forecast/grid", params={"config_id": cfg["id"], "periods": ["2026 Q3"]}
        ).json()
        sellers = {r["slice_values"][level] for r in grid["rows"]}
        assert sellers <= expected_sellers, f"unexpected sellers: {sellers - expected_sellers}"
    assert expected_managers == {"Russell Schiller", "Bob Day"}


def test_seeded_accounts_are_puns(client):
    expected = {a for accounts in seed.SP_SELLERS.values() for a in accounts}
    bus = client.get("/api/business-units").json()
    cfg = next(c for b in bus for c in b["configs"] if c["name"] == "SAO")
    grid = client.get(
        "/api/forecast/grid", params={"config_id": cfg["id"], "periods": ["2026 Q3"]}
    ).json()
    accounts = {r["slice_values"]["account"] for r in grid["rows"]}
    assert accounts <= expected, f"unexpected accounts: {accounts - expected}"


def test_products_are_hardware_services_software():
    """Every bucket maps to exactly one of the three top-level lines."""
    assert set(seed.PRODUCT_LINE.values()) == VALID_LINES
    for bucket in seed.SP_BUCKETS + seed.DE_BUCKETS:
        assert bucket in seed.PRODUCT_LINE, f"{bucket} has no product line"
    assert set(seed.DE_ROLLUPS) == VALID_LINES


def test_amounts_are_sensible(client):
    """Values are random but plausibly scaled — and hardware outsells software."""
    bus = client.get("/api/business-units").json()
    cfg = next(c for b in bus for c in b["configs"] if c["name"] == "SAO")
    grid = client.get(
        "/api/forecast/grid", params={"config_id": cfg["id"], "periods": ["2026 Q2"]}
    ).json()
    by_line = {"Hardware": 0.0, "Services": 0.0, "Software": 0.0}
    for row in grid["rows"]:
        line = seed.PRODUCT_LINE.get(row["slice_values"]["product_bucket"])
        if line:
            by_line[line] += row["actuals"]
    assert by_line["Hardware"] > by_line["Services"] > by_line["Software"] > 0
    # no absurd values: every row lands inside a believable quarterly band
    for row in grid["rows"]:
        assert 0 <= row["actuals"] < 100_000_000
        assert 0 <= row["pipeline_open"] < 100_000_000
