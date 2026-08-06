# API reference

Base URL `/api`. Interactive docs (OpenAPI/Swagger) are served at `/docs` on
the running app.

Identity: every request may carry an **`X-User`** header. It is stamped onto
entries and audit rows; it defaults to `demo.user`. This is the SSO swap-in
point (`current_user` in `routers/forecast.py`).

---

## Reference data

### `GET /api/health`

```json
{ "status": "ok" }
```

Used by the container health check.

### `GET /api/periods`

Fiscal quarters available for forecasting.

```json
[{ "code": "2026 Q3", "year": 2026, "quarter": 3,
   "start_date": "2026-07-01", "end_date": "2026-09-30" }]
```

### `GET /api/source-contract`

What a bring-your-own query must return, per source. The admin UI renders
this directly, so it is always in step with what the engine enforces.

```json
[{
  "source": "orders",
  "standard_table": "fact_orders_sales",
  "required_columns": {
    "fiscal_period": "text — must match a period code exactly, e.g. '2026 Q3'",
    "transaction_type": "text — 'Orders' (bookings) or 'Sales' (invoiced)",
    "amount": "number — signed; summed as-is"
  },
  "standard_dimensions": ["business_unit", "manager", "seller", "…"],
  "notes": ["Return a SELECT (a leading WITH … is fine). UNION is allowed…"]
}]
```

### `GET /api/dimensions`

The standard dimensions a config may use as levels. `derived: true` marks
dimensions computed from configuration (currently `product_rollup`).

```json
[{ "key": "seller", "label": "Seller", "derived": false, "description": null }]
```

---

## Teams and configuration

### `GET /api/business-units`

Every business unit with its forecast views nested.

```json
[{
  "id": 1, "code": "NSP", "name": "NonSecurePower", "description": "…",
  "configs": [{
    "id": 1, "business_unit_id": 1, "name": "SAO", "active": true,
    "levels": [{ "key": "seller", "label": "Seller", "sql": null }],
    "metric_rules": { "default": "orders", "overrides": [] },
    "pipeline_weighting": { "mode": "win_probability" },
    "fact_filters": { "business_unit": ["NonSecurePower"] },
    "bucket_rollups": null,
    "source_orders_view": "orders_sales_standard_view",
    "source_pipeline_view": "pipeline_standard_view"
  }]
}]
```

### `POST /api/business-units` → 201

```json
{ "code": "IND", "name": "Industry", "description": "optional" }
```

409 if the code exists.

### `PUT /api/business-units/{bu_id}`

Partial update — only the fields you send are applied.

```json
{ "name": "Renamed", "description": "new blurb" }
```

404 unknown, 409 code collision.

### `POST /api/business-units/{bu_id}/configs` → 201

### `PUT /api/business-units/configs/{config_id}`

Both take the same body. Everything except `name` and `levels` is optional.

```json
{
  "name": "Field Sales",
  "active": true,
  "levels": [
    { "key": "region", "label": "Region" },
    { "key": "coast", "label": "Coast",
      "sql": "CASE WHEN state IN ('VA','NY') THEN 'East' ELSE 'West' END" }
  ],
  "metric_rules": {
    "default": "orders",
    "overrides": [{ "field": "product_line", "equals": "Software", "metric": "sales" }]
  },
  "pipeline_weighting": { "mode": "threshold", "min_probability": 0.45 },
  "fact_filters": { "business_unit": ["Analog Energy"] },
  "bucket_rollups": { "Hardware": ["Switchgear Hardware"] },
  "source_orders_view": null,
  "source_pipeline_view": null
}
```

**Field notes**

| Field | Rules |
|---|---|
| `levels` | 1–8, distinct keys. A key that isn't a standard dimension **must** carry `sql`. `product_rollup` requires `bucket_rollups`. |
| `metric_rules` | `default` is `orders` or `sales`; `overrides` are checked in order, first match wins. Or supply `sql` returning `'Orders'`/`'Sales'`. |
| `pipeline_weighting.mode` | `win_probability` · `threshold` (needs `min_probability` 0–1) · `all` · `sql` (needs `sql`) |
| `fact_filters` | `{ "column": [values] }` per standard dimension, and/or `{ "_sql": "raw fragment" }` |
| `active` | `false` hides the view from the picker; nothing is deleted |
| `source_orders_sql` / `source_pipeline_sql` | BYOQ. A SELECT (or `WITH …`) that replaces the standard fact table as the FROM source. Must return the columns in `GET /api/source-contract` plus everything this config references. UNION allowed; statement separators, comments and DML rejected. Validated by execution at save time. |

**Responses:** 201/200 with the stored config · 404 unknown BU or config ·
409 duplicate name · 422 validation, with `detail` naming the problem.

Every SQL fragment is compiled at save time, and every query the config
generates is **executed** against a period that matches nothing — so a BYOQ
query missing a column fails here, with the database's message in `detail`,
rather than at read time.

---

## Forecast

### `GET /api/forecast/grid`

| Param | Notes |
|---|---|
| `config_id` | required |
| `periods` | required, repeatable: `?periods=2026 Q3&periods=2026 Q4` |
| `as_of` | optional ISO timestamp — replays rep input as of that moment |

```json
{
  "config": { "…": "the config, echoed" },
  "periods": ["2026 Q3"],
  "as_of": null,
  "rows": [{
    "period_code": "2026 Q3",
    "slice_key": "seller=Jess Day||account=Toggle Telecom",
    "slice_values": { "seller": "Jess Day", "account": "Toggle Telecom" },
    "actuals": 2173600.0,
    "pipeline_open": 7415800.0,
    "pipeline_weighted": 2997190.0,
    "suggested_all_bfo": 9589400.0,
    "suggested_buildup": 5170790.0,
    "adjustment": -1250000.0,
    "total_forecast": null,
    "effective_adjustment": -1250000.0,
    "effective_total": 3920790.0,
    "comment": "Two-site rollout slipping into Q4.",
    "updated_by": "jess.day",
    "updated_at": "2026-08-01T14:30:00",
    "has_entry": true
  }]
}
```

`effective_*` are the values to display: an explicit `total_forecast` wins,
otherwise `suggested_buildup + adjustment`. See
[ARCHITECTURE](ARCHITECTURE.md#the-grid-engine) for the precedence rules.

422 on unknown periods or a config whose SQL no longer compiles.

### `POST /api/forecast/configs/{config_id}/slice-opportunities`

The open deals behind one row.

```json
{ "period_code": "2026 Q3", "slice_values": { "seller": "Jess Day", "account": "Toggle Telecom" } }
```

```json
[{
  "opportunity_id": "OPP-00003",
  "opportunity_name": "Toggle Telecom Power Hardware consolidation",
  "account": "Toggle Telecom",
  "amount": 2925300.0,
  "win_probability": 0.45,
  "stage": "Propose",
  "close_date": "2026-09-14",
  "weighted_amount": 1316385.0,
  "included": true,
  "url": "https://…/lightning/r/Opportunity/{id}/view"
}]
```

`included` reflects the config's weighting — under a threshold, deals below
the bar come back `false` with `weighted_amount: 0`.

> The opportunity id in `url` is a placeholder until the real bfo id lands in
> the pipeline feed — see `SFDC_PLACEHOLDER_ID` in `services/grid.py`.

### `PUT /api/forecast/configs/{config_id}/entries`

Save rep input. **`set_fields` decides what is applied** — this is how
"clear a value" is distinguished from "leave it alone".

```json
{
  "period_code": "2026 Q3",
  "slice_values": { "seller": "Jess Day", "account": "Toggle Telecom" },
  "adjustment": -1250000,
  "comment": "Two-site rollout slipping.",
  "set_fields": ["adjustment", "comment"]
}
```

Editable fields: `adjustment`, `total_forecast`, `comment`.

**Linked fields:** sending `adjustment` without `total_forecast` clears any
stored total, and vice versa. Send both to set both.

Returns the stored entry. Each changed field also writes an audit row.

### `GET /api/forecast/configs/{config_id}/audit`

| Param | Notes |
|---|---|
| `period_code` | optional filter |
| `slice_key` | optional filter — one row's history |
| `limit` | default 100, max 500 |

```json
[{
  "id": 42, "config_id": 1, "period_code": "2026 Q3",
  "slice_key": "seller=Jess Day||account=Toggle Telecom",
  "field": "adjustment", "old_value": null, "new_value": "-1250000.0",
  "changed_by": "jess.day", "changed_at": "2026-08-01T14:30:00"
}]
```

Newest first. This table is append-only and is what `as_of` replays.

---

## Errors

Standard FastAPI shape:

```json
{ "detail": "pipeline_weighting.mode must be one of (...)" }
```

| Code | Meaning |
|---|---|
| 404 | unknown business unit, config, or period |
| 409 | duplicate business-unit code or view name |
| 422 | validation — body shape, or a config/SQL problem named in `detail` |
