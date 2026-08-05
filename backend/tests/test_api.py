"""End-to-end API tests against a seeded temp database."""
import os
import tempfile
from datetime import datetime, timezone

import pytest
from fastapi.testclient import TestClient

_tmp = tempfile.mkdtemp()
os.environ["DATABASE_URL"] = f"sqlite:///{_tmp}/test.db"

from app.main import app  # noqa: E402


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as c:
        yield c


def _config(client, bu_code, name):
    bus = client.get("/api/business-units").json()
    bu = next(b for b in bus if b["code"] == bu_code)
    return next(c for c in bu["configs"] if c["name"] == name)


def test_health_and_seed(client):
    assert client.get("/api/health").json() == {"status": "ok"}
    bus = client.get("/api/business-units").json()
    assert {b["code"] for b in bus} == {"SP", "DE"}
    sp = _config(client, "SP", "SAO")
    assert [lv["key"] for lv in sp["levels"]] == ["seller", "account", "product_bucket"]
    de = _config(client, "DE", "Field Sales")
    assert de["pipeline_weighting"] == {"mode": "threshold", "min_probability": 0.45}


def test_periods_and_dimensions(client):
    periods = client.get("/api/periods").json()
    assert [p["code"] for p in periods] == ["2026 Q1", "2026 Q2", "2026 Q3", "2026 Q4", "2027 Q1"]
    dims = client.get("/api/dimensions").json()
    assert any(d["key"] == "product_rollup" and d["derived"] for d in dims)


def test_grid_math(client):
    cfg = _config(client, "SP", "SAO")
    grid = client.get(
        "/api/forecast/grid", params={"config_id": cfg["id"], "periods": ["2026 Q3"]}
    ).json()
    rows = grid["rows"]
    assert rows, "grid should have rows"
    for r in rows:
        assert r["suggested_all_bfo"] == pytest.approx(r["actuals"] + r["pipeline_open"], abs=0.05)
        assert r["suggested_buildup"] == pytest.approx(r["actuals"] + r["pipeline_weighted"], abs=0.05)
        assert r["pipeline_weighted"] <= r["pipeline_open"] + 0.01
    adj_row = next(
        r
        for r in rows
        if r["slice_values"]
        == {"seller": "Adam Roberts", "account": "Switch Communications", "product_bucket": "3ph"}
    )
    assert adj_row["adjustment"] == -1_250_000.0
    assert adj_row["effective_total"] == pytest.approx(adj_row["suggested_buildup"] - 1_250_000.0, abs=0.05)


def test_threshold_weighting_math(client):
    """DE uses threshold mode: weighted pipeline only counts opps >= 45%."""
    cfg = _config(client, "DE", "Field Sales")
    grid = client.get(
        "/api/forecast/grid", params={"config_id": cfg["id"], "periods": ["2026 Q4"]}
    ).json()
    rows = [r for r in grid["rows"] if r["pipeline_open"] > 0]
    assert rows
    # threshold weighting is all-or-nothing per opp: weighted <= open, and for
    # at least some rows they differ (sub-threshold opps excluded)
    assert any(r["pipeline_weighted"] < r["pipeline_open"] for r in rows)
    for r in rows:
        opps = client.post(
            f"/api/forecast/configs/{cfg['id']}/slice-opportunities",
            json={"period_code": "2026 Q4", "slice_values": r["slice_values"]},
        ).json()
        expected = sum(o["amount"] for o in opps if o["win_probability"] >= 0.45)
        assert r["pipeline_weighted"] == pytest.approx(expected, abs=0.05)


def test_slice_opportunities(client):
    cfg = _config(client, "SP", "SAO")
    grid = client.get(
        "/api/forecast/grid", params={"config_id": cfg["id"], "periods": ["2026 Q4"]}
    ).json()
    row = next(r for r in grid["rows"] if r["pipeline_open"] > 0)
    opps = client.post(
        f"/api/forecast/configs/{cfg['id']}/slice-opportunities",
        json={"period_code": "2026 Q4", "slice_values": row["slice_values"]},
    ).json()
    assert opps
    assert sum(o["amount"] for o in opps) == pytest.approx(row["pipeline_open"], abs=0.05)
    for o in opps:
        assert o["url"] == "https://se.lightning.force.com/lightning/r/Opportunity/006Kj000017MqbZIAS/view"
        assert o["opportunity_id"].startswith("OPP-")


def test_custom_sql_level_config(client):
    """Seeded 2-level config with a pure-SQL dimension works end to end."""
    cfg = _config(client, "SP", "Coast Rollup")
    assert len(cfg["levels"]) == 2
    grid = client.get(
        "/api/forecast/grid", params={"config_id": cfg["id"], "periods": ["2026 Q3"]}
    ).json()
    coasts = {r["slice_values"]["coast"] for r in grid["rows"]}
    assert coasts == {"East", "West"}


def test_rollup_dimension(client):
    cfg = _config(client, "DE", "Field Sales")
    grid = client.get(
        "/api/forecast/grid", params={"config_id": cfg["id"], "periods": ["2026 Q3"]}
    ).json()
    groups = {r["slice_values"]["product_rollup"] for r in grid["rows"]}
    assert groups <= {"Grid Hardware", "Digital Grid", "Services", "Other"}
    assert "Grid Hardware" in groups


def test_entry_upsert_audit_and_as_of(client):
    cfg = _config(client, "SP", "SAO")
    slice_values = {"seller": "Maria Chen", "account": "Equinix", "product_bucket": "Software"}

    r = client.put(
        f"/api/forecast/configs/{cfg['id']}/entries",
        json={
            "period_code": "2026 Q3",
            "slice_values": slice_values,
            "adjustment": 500000,
            "set_fields": ["adjustment"],
        },
        headers={"X-User": "maria.chen"},
    )
    assert r.status_code == 200, r.text
    checkpoint = datetime.now(timezone.utc)  # between the two edits

    r = client.put(
        f"/api/forecast/configs/{cfg['id']}/entries",
        json={
            "period_code": "2026 Q3",
            "slice_values": slice_values,
            "total_forecast": 2000000,
            "set_fields": ["total_forecast"],
        },
        headers={"X-User": "maria.chen"},
    )
    assert r.json()["total_forecast"] == 2000000
    assert r.json()["adjustment"] is None

    # live grid reflects the explicit total
    grid = client.get(
        "/api/forecast/grid", params={"config_id": cfg["id"], "periods": ["2026 Q3"]}
    ).json()
    row = next(r for r in grid["rows"] if r["slice_values"] == slice_values)
    assert row["effective_total"] == 2000000

    # as-of the checkpoint (before the total was set): adjustment state shows
    asof_grid = client.get(
        "/api/forecast/grid",
        params={
            "config_id": cfg["id"],
            "periods": ["2026 Q3"],
            "as_of": checkpoint.isoformat(),
        },
    ).json()
    asof_row = next(r for r in asof_grid["rows"] if r["slice_values"] == slice_values)
    assert asof_row["adjustment"] == 500000
    assert asof_row["total_forecast"] is None
    assert asof_row["effective_total"] == pytest.approx(
        asof_row["suggested_buildup"] + 500000, abs=0.05
    )

    # as-of before any change: no entry state at all
    early = client.get(
        "/api/forecast/grid",
        params={"config_id": cfg["id"], "periods": ["2026 Q3"], "as_of": "2026-01-01T00:00:00"},
    ).json()
    early_row = next(r for r in early["rows"] if r["slice_values"] == slice_values)
    assert not early_row["has_entry"]

    audit = client.get(
        f"/api/forecast/configs/{cfg['id']}/audit", params={"period_code": "2026 Q3"}
    ).json()
    fields = [(a["field"], a["new_value"]) for a in audit if a["changed_by"] == "maria.chen"]
    assert ("adjustment", "500000.0") in fields
    assert ("total_forecast", "2000000.0") in fields


def test_onboard_new_bu_with_custom_levels(client):
    r = client.post(
        "/api/business-units",
        json={"code": "IND", "name": "Industry", "description": "Industrial automation"},
    )
    assert r.status_code == 201
    bu_id = r.json()["id"]

    r = client.post(
        f"/api/business-units/{bu_id}/configs",
        json={
            "name": "OEM",
            "levels": [
                {"key": "manager", "label": "Manager"},
                {"key": "account_segment", "label": "Segment"},
                {"key": "state", "label": "State"},
                {
                    "key": "deal_size",
                    "label": "Deal Size",
                    "sql": "CASE WHEN amount >= 1000000 THEN 'Large' ELSE 'Standard' END",
                },
            ],
            "metric_rules": {"default": "sales", "overrides": []},
            "pipeline_weighting": {"mode": "threshold", "min_probability": 0.3},
        },
    )
    assert r.status_code == 201, r.text
    cfg_id = r.json()["id"]

    grid = client.get("/api/forecast/grid", params={"config_id": cfg_id, "periods": ["2026 Q3"]})
    assert grid.status_code == 200
    assert len(grid.json()["config"]["levels"]) == 4


def test_config_validation(client):
    bus = client.get("/api/business-units").json()
    bu_id = bus[0]["id"]
    r = client.post(
        f"/api/business-units/{bu_id}/configs",
        json={"name": "bad", "levels": [{"key": "nonsense", "label": "X"}]},
    )
    assert r.status_code == 422
    r = client.post(
        f"/api/business-units/{bu_id}/configs",
        json={"name": "bad2", "levels": [{"key": "product_rollup", "label": "X"}]},
    )
    assert r.status_code == 422  # rollup level without bucket_rollups
    # SQL guard: DML in a custom level is rejected at save time
    r = client.post(
        f"/api/business-units/{bu_id}/configs",
        json={
            "name": "bad3",
            "levels": [{"key": "evil", "label": "X", "sql": "1; DROP TABLE fact_pipeline"}],
        },
    )
    assert r.status_code == 422
    assert "forbidden" in r.json()["detail"].lower()
    # threshold mode requires a valid min_probability
    r = client.post(
        f"/api/business-units/{bu_id}/configs",
        json={
            "name": "bad4",
            "levels": [{"key": "seller", "label": "Seller"}],
            "pipeline_weighting": {"mode": "threshold"},
        },
    )
    assert r.status_code == 422
