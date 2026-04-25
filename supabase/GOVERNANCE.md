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

## §4 — Aplicar migrations: `db push`, no MCP

**Regla dura:** las migrations se aplican vía `supabase db push` desde local
o desde GH Action. **Nunca** vía `mcp__supabase__apply_migration` excepto
emergencia.

### Por qué

`apply_migration` y `psql` directo no respetan el `version` del filename:
registran la entry en `supabase_migrations.schema_migrations` con un timestamp
generado al momento del apply. Resultado: el `version` en DB diverge del
prefijo del filename y el Supabase CLI emite el warning
`Applied out-of-order migrations: [...]` en cada `supabase db push` siguiente
— ensucia el output del drift-check en cada PR de DB.

`config.toml` debe tener `project_id`, `[db].major_version` y `[api].schemas`
completos (ya está en este repo, ver el archivo). Si falta algo, `db push`
no arranca sin flags y la gente se va al MCP por default — ahí empieza el
drift.

### Procedimiento normal

1. Editar archivo en `supabase/migrations/<timestamp>_<name>.sql`. El
   `<timestamp>` debe ser estrictamente mayor al último aplicado en prod.
   Para forzar el ordenamiento usá `date -u +%Y%m%d%H%M%S`.
2. `supabase db push` (CLI valida sintaxis y aplica).
3. `npm run schema:ref` (regenera `SCHEMA_REF.md`).
4. Commit + PR.

### Procedimiento de emergencia (apply directo en prod sin push)

Solo si hay un fix urgente que no puede esperar al ciclo de PR:

1. Aplicar via MCP `apply_migration` o `psql` directo a prod.
2. **Inmediatamente después**, identificar la `version` que registró
   Supabase:
   ```sql
   SELECT version FROM supabase_migrations.schema_migrations
   WHERE name = '<name>' ORDER BY version DESC LIMIT 1;
   ```
3. Crear/renombrar el archivo en `supabase/migrations/` con esa `version`
   exacta como prefijo del filename. El SQL en disco debe matchear lo que
   se aplicó (no la versión "limpia" que hubieras querido aplicar).
4. Commit + PR para sincronizar el repo.

Si saltás el paso 3, el siguiente PR de DB va a tener divergencia
filename↔version, el drift-check va a flaggear, y el cleanup posterior
es ~10x más caro que documentarlo bien al momento.

### Bootstrap files (whitelist permanente)

Los 4 archivos `20260101000000-3_*` viven en disco **y** en `schema_migrations`
(registrados como applied en prod sin re-ejecutar SQL — son idempotentes
con `IF NOT EXISTS`). En entornos nuevos (Preview Branch, dev local, DR)
son los primeros que aplican y crean schemas/tablas ambient que prod tenía
desde antes del migration tracking. El GH Action de filename↔version los
whitelista por consistencia con el patrón histórico, aunque ya no tienen
divergencia disco↔DB.

### Histórico legacy-refs (whitelist permanente, DB-only)

14 migrations Mar–Abr 2026 (`20260325_waitry_inbound_processing`,
`20260405-20260408_*`, `20260417105758_legacy_cleanup_*`) viven SOLO en
`schema_migrations` — su SQL referencia schemas legacy (`waitry.*`,
`caja.*`, `inventario.*`, `rdb.*_legacy`) que fueron consolidados a
`rdb.*` por `20260408000000_rdb_consolidation`. Si esos archivos viven
en disco, fallan al re-correr en una Preview Branch fresca porque las
tablas legacy nunca existieron en el bootstrap moderno (que crea
`rdb.waitry_*` directo). El SQL completo está en
`schema_migrations.statements` como audit trail. El GH Action los whitelista
para que la divergencia "DB-only" no triggeree warning.

## §5 — Sprint histórico de cleanup filename↔version

- **drift-3** (2026-04-25): erradicación del drift filename↔version. 58
  archivos renombrados con `git mv` para que filename matchee el `version`
  registrado en `schema_migrations`. 16 huérfanos históricos
  (Mar–Abr/2026) recuperados desde `schema_migrations.statements`. 14 de
  ellos referencian schemas legacy droppeados (`waitry.*`, `caja.*`,
  `inventario.*`, `rdb.*_legacy`) que fueron consolidados por
  `20260408000000_rdb_consolidation` — al fallar en Preview Branch fresh,
  se mantienen solo en `schema_migrations` (audit trail) y NO en disco; el
  GH Action los whitelista. Los 2 modernos (`add_personas_contacto_*`,
  `dilesa_consolidate_permissive_policies`) sí viven en disco porque
  referencian schemas modernos que existen post-bootstrap. 2 archivos cuyo
  SQL ya estaba aplicado en prod sin tracker
  (`dedup_movimientos_caja_name_refs`, `dilesa_maquinaria_expose_schema`)
  registrados con su version del filename. 4 bootstrap files registrados
  como applied en prod (idempotentes, no-op). `config.toml` completado
  para que `db push` funcione desde local. Governance §4 + drift-check §7
  agregados para evitar regresión.
