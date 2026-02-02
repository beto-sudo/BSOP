# Staging schemas (created)

Created in Supabase:
- schema `staging`
- schema `erp`

## staging.coda_tables
Stores doc table metadata (id/name/type) for audit + discovery.

PK: (doc_id, table_id)

## staging.coda_sync_state
Per-table cursor/watermark + last sync timestamps/errors.

PK: (doc_id, table_id)

## staging.coda_rows
Raw row payloads from Coda (JSON), keyed by (doc_id, table_id, row_id).

PK: (doc_id, table_id, row_id)

Notes:
- This is intentionally *denormalized* and safe to rebuild.
- Transform jobs will materialize normalized ERP tables under `erp`.
