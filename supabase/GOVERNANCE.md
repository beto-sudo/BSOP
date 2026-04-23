# BSOP DB Governance — quick reference

Doc minimalista. Reglas sólo para evitar repeticiones de drift que ya nos
mordieron. Para schema canónico vivir leer `SCHEMA_REF.md` (regenerable con
`npm run schema:ref`).

## §1 — Migraciones reproducibles desde cero

Una migración aplicada en prod **debe** poder volver a correr contra una DB
fresca (Supabase Preview Branch, dev local, DR) sin errores. Si una
migración referencia un objeto que podría haber dejado de existir (porque
otra migración posterior lo movió, renombró o tiró), envolvé la operación
en una guarda condicional.

### Patrón estándar

```sql
DO $$
BEGIN
  IF to_regclass('schema.tabla') IS NOT NULL THEN
    -- GRANT, ALTER, CREATE INDEX, CREATE POLICY, INSERT…
  END IF;
END $$;
```

`to_regclass()` devuelve `NULL` si el objeto no existe — sin levantar
excepción. Para funciones usá `to_regprocedure('schema.fn(args)')`.

### Cuándo aplica

- GRANT/REVOKE sobre tablas que pertenecen a un schema "ambient" (no
  creado por migración) o que después se mueven/dropean.
- ALTER TABLE / CREATE INDEX en tablas legacy que ya fueron renombradas o
  dropeadas.
- CREATE POLICY donde el target podría no existir en una DB fresca.
- Backfills `INSERT INTO new SELECT FROM legacy` — siempre.
- ALTER FUNCTION / ALTER VIEW sobre objetos que podrían no existir en la
  cadena fresca.

### Cuándo NO aplica

- CREATE TABLE / CREATE FUNCTION nuevos — son la fuente de verdad, deben
  existir.
- DROP TABLE/POLICY/INDEX `IF EXISTS` — ya manejan ausencia.
- Operaciones sobre objetos creados por la misma migración.

### ¿Por qué no rompe prod?

Supabase tracker `supabase_migrations.schema_migrations` registra cada
migración por `version + name`. Las migraciones ya aplicadas no se
re-ejecutan. Editar una migración vieja para hacerla idempotente afecta
sólo entornos nuevos (Preview, DR, local).

## §2 — Sprints históricos

- **drift-1** (2026-04-23): saneamiento general — drop trip legacy,
  health schema dedicado, profile/user_presence → core, limpieza waitry
  duplicate indexes.
- **drift-1.5** (2026-04-23): hardening de migraciones viejas para que
  Preview Branches corran limpias. Wrapping con `to_regclass()` de
  todas las refs a tablas hoy inexistentes (`rdb.cajas/cortes/...`,
  `caja.*`, `waitry.*`, `public.usage_*`, `public.trip_*`,
  `public.profile`, `public.user_presence`, archives `*_archive_*`).
  Sin agregar migraciones nuevas — sólo se editaron las originales.
- **drift-2** (2026-04-23): cleanup post drift-1. Drop de 9 policies
  `service_role` redundantes (`USING(true)` — `service_role` bypassa RLS),
  drop de index duplicado `erp_pagos_prov_anio_mes_idx` (ya cubierto
  por UNIQUE constraint), VACUUM FULL `health.health_metrics` (libera
  ~100 MB), bootstrap de índices ambient para `rdb.waitry_*` agregados
  al pre-migration bootstrap, y GH Action `drift-check.yml` que corre
  `supabase/scripts/drift-check.sql` en cada PR a `supabase/migrations/`,
  schedule semanal y manual dispatch.

## §3 — Validar antes de mergear

Si tenés Docker + Supabase CLI:

```sh
supabase db reset --no-seed
```

Sin Docker: dejarlo en manos de Supabase Preview Branch. Si el PR
levanta una DB fresca y aplica migraciones limpias, está bien.
Si aparece "relation X does not exist" en el primer apply de un PR que
no creó X, hay drift nuevo — tratar como bloqueante y aplicar §1.
