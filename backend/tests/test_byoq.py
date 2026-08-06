"""Bring-your-own-query sources.

A team can replace either fact source with its own SELECT. These tests pin
the contract: what must be returned, what is rejected, and that the rest of
the engine (levels, lens, weighting, filters, drill-down) composes on top of
a custom query unchanged.
"""
import os
import tempfile

import pytest
from fastapi.testclient import TestClient

_tmp = tempfile.mkdtemp()
os.environ.setdefault("DATABASE_URL", f"sqlite:///{_tmp}/test_byoq.db")

from app.main import app  # noqa: E402


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as c:
        yield c


@pytest.fixture(scope="module")
def bu_id(client):
    r = client.post("/api/business-units", json={"code": "BYO", "name": "Byoq Co"})
    return r.json()["id"]


def _make(client, bu_id, name, **extra):
    body = {
        "name": name,
        "levels": [{"key": "seller", "label": "Seller"}],
        **extra,
    }
    return client.post(f"/api/business-units/{bu_id}/configs", json=body)


# --- the published contract --------------------------------------------------

def test_contract_is_published(client):
    r = client.get("/api/source-contract")
    assert r.status_code == 200
    by_source = {c["source"]: c for c in r.json()}
    assert set(by_source) == {"orders", "pipeline"}

    orders = by_source["orders"]
    assert set(orders["required_columns"]) == {"fiscal_period", "transaction_type", "amount"}
    assert orders["standard_table"] == "fact_orders_sales"
    assert "seller" in orders["standard_dimensions"]

    pipeline = by_source["pipeline"]
    for col in ("fiscal_period", "status", "amount", "win_probability", "opportunity_id"):
        assert col in pipeline["required_columns"]
    assert pipeline["notes"], "the contract should carry human guidance"


# --- a custom orders query, end to end --------------------------------------

def test_byoq_orders_drives_the_grid(client, bu_id):
    """A query that halves amounts and renames a seller proves it is in force."""
    sql = """
        SELECT fiscal_period,
               transaction_type,
               amount / 2.0 AS amount,
               'Custom Seller' AS seller
        FROM fact_orders_sales
        WHERE business_unit = 'NonSecurePower'
    """
    r = _make(client, bu_id, "Custom orders", source_orders_sql=sql)
    assert r.status_code == 201, r.text
    cfg_id = r.json()["id"]
    assert r.json()["source_orders_sql"].strip().startswith("SELECT")

    grid = client.get(
        "/api/forecast/grid", params={"config_id": cfg_id, "periods": ["2026 Q2"]}
    ).json()
    sellers = {row["slice_values"]["seller"] for row in grid["rows"]}
    assert sellers == {"Custom Seller"}, "the custom query's own columns should drive slicing"
    assert sum(r["actuals"] for r in grid["rows"]) > 0

    # halving is visible against the standard source over the same period
    std = _make(client, bu_id, "Std orders", fact_filters={"business_unit": ["NonSecurePower"]})
    std_grid = client.get(
        "/api/forecast/grid", params={"config_id": std.json()["id"], "periods": ["2026 Q2"]}
    ).json()
    custom_total = sum(r["actuals"] for r in grid["rows"])
    std_total = sum(r["actuals"] for r in std_grid["rows"])
    assert custom_total == pytest.approx(std_total / 2, rel=0.01)


def test_byoq_supports_union_and_cte(client, bu_id):
    """Real extractions union several systems; CTEs must work too."""
    sql = """
        WITH east AS (
            SELECT * FROM fact_orders_sales WHERE state IN ('VA', 'NY')
        ), west AS (
            SELECT * FROM fact_orders_sales WHERE state NOT IN ('VA', 'NY')
        )
        SELECT fiscal_period, transaction_type, amount, seller FROM east
        UNION ALL
        SELECT fiscal_period, transaction_type, amount, seller FROM west
    """
    r = _make(client, bu_id, "Union orders", source_orders_sql=sql)
    assert r.status_code == 201, r.text
    grid = client.get(
        "/api/forecast/grid", params={"config_id": r.json()["id"], "periods": ["2026 Q2"]}
    ).json()
    assert sum(row["actuals"] for row in grid["rows"]) > 0


# --- a custom pipeline query, including drill-down --------------------------

def test_byoq_pipeline_including_drilldown(client, bu_id):
    """Contract columns can be literals when the source lacks them."""
    sql = """
        SELECT fiscal_period,
               status,
               amount,
               0.9 AS win_probability,
               opportunity_id,
               opportunity_name,
               account,
               NULL AS stage,
               NULL AS close_date,
               seller
        FROM fact_pipeline
        WHERE business_unit = 'NonSecurePower'
    """
    r = _make(
        client,
        bu_id,
        "Custom pipeline",
        source_pipeline_sql=sql,
        pipeline_weighting={"mode": "threshold", "min_probability": 0.5},
    )
    assert r.status_code == 201, r.text
    cfg_id = r.json()["id"]

    grid = client.get(
        "/api/forecast/grid", params={"config_id": cfg_id, "periods": ["2026 Q4"]}
    ).json()
    rows = [row for row in grid["rows"] if row["pipeline_open"] > 0]
    assert rows
    # every deal is forced to 0.9, so a 0.5 threshold counts all of them
    for row in rows:
        assert row["pipeline_weighted"] == pytest.approx(row["pipeline_open"], rel=0.01)

    opps = client.post(
        f"/api/forecast/configs/{cfg_id}/slice-opportunities",
        json={"period_code": "2026 Q4", "slice_values": rows[0]["slice_values"]},
    ).json()
    assert opps
    assert all(o["win_probability"] == 0.9 for o in opps)
    assert all(o["stage"] is None for o in opps)  # NULL literal survives
    assert all(o["included"] for o in opps)


# --- rejections --------------------------------------------------------------

def test_missing_required_column_is_rejected(client, bu_id):
    """No transaction_type — the composed query cannot run, so the save fails."""
    r = _make(
        client,
        bu_id,
        "No txn type",
        source_orders_sql="SELECT fiscal_period, amount, seller FROM fact_orders_sales",
    )
    assert r.status_code == 422
    detail = r.json()["detail"].lower()
    assert "did not run" in detail
    assert "transaction_type" in detail


def test_missing_level_column_is_rejected(client, bu_id):
    """The query is valid but omits a column the config slices by."""
    r = client.post(
        f"/api/business-units/{bu_id}/configs",
        json={
            "name": "No seller col",
            "levels": [{"key": "seller", "label": "Seller"}],
            "source_orders_sql": "SELECT fiscal_period, transaction_type, amount FROM fact_orders_sales",
        },
    )
    assert r.status_code == 422
    assert "seller" in r.json()["detail"].lower()


def test_write_statements_are_rejected(client, bu_id):
    for bad in (
        "SELECT 1 AS amount; DROP TABLE fact_pipeline",
        "SELECT fiscal_period, transaction_type, amount INTO other FROM fact_orders_sales",
        "DELETE FROM fact_orders_sales",
        "SELECT fiscal_period, transaction_type, amount FROM fact_orders_sales -- sneaky",
    ):
        r = _make(client, bu_id, f"bad {bad[:14]}", source_orders_sql=bad)
        assert r.status_code == 422, bad
        assert "query" in r.json()["detail"].lower()


def test_garbage_sql_is_rejected(client, bu_id):
    r = _make(client, bu_id, "Garbage", source_orders_sql="SELECT this is not sql FROM nowhere")
    assert r.status_code == 422
    assert "did not run" in r.json()["detail"].lower()


# --- editing -----------------------------------------------------------------

def test_byoq_can_be_added_and_removed_by_edit(client, bu_id):
    r = _make(client, bu_id, "Editable source")
    cfg_id = r.json()["id"]
    assert r.json()["source_orders_sql"] is None

    sql = "SELECT fiscal_period, transaction_type, amount, seller FROM fact_orders_sales"
    r = client.put(
        f"/api/business-units/configs/{cfg_id}",
        json={
            "name": "Editable source",
            "levels": [{"key": "seller", "label": "Seller"}],
            "source_orders_sql": sql,
        },
    )
    assert r.status_code == 200, r.text
    assert r.json()["source_orders_sql"] == sql

    # and back to the standard table
    r = client.put(
        f"/api/business-units/configs/{cfg_id}",
        json={"name": "Editable source", "levels": [{"key": "seller", "label": "Seller"}]},
    )
    assert r.status_code == 200
    assert r.json()["source_orders_sql"] is None
