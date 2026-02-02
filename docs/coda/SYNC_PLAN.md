# Coda → Supabase staging sync (plan)

Doc: `ZNxWl_DI2D`

## Goals
- Keep Coda as the operational system while we build BSOP/Supabase.
- Ingest Coda data repeatedly for testing and for eventual cutover.

## What we sync
1) **Always**: table metadata → `staging.coda_tables` (includes tables + views)
2) **Rows**: only **base tables** (`tableType=table`) and initially only the ERP core set:
   - Terrenos `grid-0MSgwKOC9A`
   - Anteproyectos `grid-918aH4OlMi`
   - Proyectos `grid-SlvkPAfZNE`
   - Inventario `grid--AHYMPQI7Z`
   - Clientes `grid-mMIXWCSfyr`

We will expand to other tables once we identify true dependencies (catalogs/refs).

## Command
Set env:
- `CODA_API_TOKEN`
- `CODA_DOC_ID=ZNxWl_DI2D`
- `CODA_TABLE_IDS=grid-0MSgwKOC9A,grid-918aH4OlMi,grid-SlvkPAfZNE,grid--AHYMPQI7Z,grid-mMIXWCSfyr`

Run:
- `npm run sync:coda`

## Notes
- Current implementation is safe-first: denormalized JSON ingestion into staging.
- Next step: incremental watermarking + transforms into normalized `erp.*` tables.
