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

## §3 — Regenerar y validar el schema (desde la shadow, no prod)

Las migraciones son la fuente de verdad. `SCHEMA_REF.md` y `types/supabase.ts`
se regeneran desde una **shadow DB** construida con las migraciones del repo —
**no desde prod** (iniciativa `derivados-sin-drift`). Así el schema es función
pura de la rama: determinista, sin secret de prod, sin flakes, y que prod esté
adelantado/atrasado deja de importar.

Tras tocar `supabase/migrations/`, regenerá los derivados (requiere Docker):

```sh
supabase start        # levanta la shadow y aplica todas las migraciones
npm run db:regen      # SCHEMA_REF.md + types/supabase.ts desde la shadow local
supabase stop         # opcional
```

Commiteá `SCHEMA_REF.md` + `types/supabase.ts` junto con la migración.

**CI lo valida** con el workflow `schema-check.yml`: levanta la shadow, regenera
`SCHEMA_REF` y falla si no coincide con el commiteado (solo corre el trabajo
pesado en PRs que tocan DB). Si `supabase start` falla ahí, alguna migración no
reproduce desde cero → aplicá §1.

Sin Docker local podés dejar que CI valide, pero **para regenerar los derivados
necesitás Docker** — en el modelo nuevo ya no hay atajo contra prod.

## §4 — Aplicar migrations: AL MERGEAR (db push automático), no antes, no MCP

**Regla dura (modelo `derivados-sin-drift` S3):** las migraciones se aplican a
prod **al mergear el PR a `main`**, automáticamente, vía el workflow
`db-push-on-merge.yml` (`supabase db push`). **No** se aplican antes de mergear,
**ni** por `mcp__supabase__apply_migration`, **ni** con `psql`/`db push` manual a
prod. Una sola vía. Así prod nunca se adelanta a `main` (muere el drift de
SCHEMA_REF que rompía PRs ajenos) y el ledger no deriva (`db push` registra con
el timestamp del archivo; muere el baile de `migration repair`).

### Gate financiero (D5) — el gate es el MERGE

- **No-financieras** → auto-merge → al mergear, `db-push-on-merge.yml` las aplica.
- **Financieras** (mueven dinero o permisos) → el check `financial-migration-guard`
  las detecta y **bloquea el auto-merge**; las revisa y mergea **Dirección a mano**,
  agregando el label `finanzas-ok` al PR. Ese merge ES la confirmación explícita
  que exige el control financiero. Al mergear, se aplican igual vía el workflow.

### Procedimiento normal

1. Crear el archivo con `npm run db:new "<slug>"` (timestamp anti-colisión).
2. Regenerar los derivados **desde la shadow** (no prod): `supabase start &&
npm run db:regen` (ver §3). Commitear `SCHEMA_REF.md` + `types/supabase.ts`.
3. Abrir el PR. CI valida: `schema-check` (shadow) + `financial-migration-guard`.
4. Mergear — no-financiera: auto-merge; financiera: Dirección con label `finanzas-ok`.
5. `db-push-on-merge.yml` aplica a prod **al mergear**. NO hagas `db push` manual.

### Por qué NO aplicar antes de mergear ni por MCP

`apply_migration`/`psql` directo registran en `schema_migrations` con el timestamp
del APPLY (≠ el del filename) → el `version` en DB diverge del archivo, `db push`
emite `Applied out-of-order migrations` y termina rompiéndose para todas las
sesiones. Aplicar antes de mergear adelanta prod a `main` → rompía el schema-check
de PRs ajenos. El modelo nuevo elimina ambos males con una sola vía de aplicación
(post-merge, `db push`, timestamp del archivo).

### Procedimiento de emergencia (hotfix sin esperar al PR)

Solo si un fix no puede esperar el ciclo de PR/merge:

1. Aplicar vía `psql` directo a prod (preferido sobre MCP: no auto-registra huérfano).
2. Crear el archivo en `supabase/migrations/` con un timestamp ≥ al último aplicado;
   el SQL debe matchear lo aplicado.
3. Abrir PR. Al mergear, `db-push-on-merge` re-aplica como no-op (ya está) y deja el
   archivo registrado. Verificar `supabase migration list` 1:1 después.

### Bootstrap files (whitelist permanente)

Los 4 archivos `20260101000000-3_*` viven en disco **y** en `schema_migrations`
(registrados como applied en prod sin re-ejecutar SQL — son idempotentes
con `IF NOT EXISTS`). En entornos nuevos (Preview Branch, dev local, DR)
son los primeros que aplican y crean schemas/tablas ambient que prod tenía
desde antes del migration tracking. El GH Action de filename↔version los
whitelista por consistencia con el patrón histórico, aunque ya no tienen
divergencia disco↔DB.

### Histórico legacy-refs (no-op stubs en disco)

14 migrations Mar–Abr 2026 (`20260325_waitry_inbound_processing`,
`20260405-20260408_*`, `20260417105758_legacy_cleanup_*`) viven en disco
como **no-op stubs** (`SELECT 1 WHERE false;`) con header explicativo. Su
SQL real referencia schemas legacy (`waitry.*`, `caja.*`, `inventario.*`,
`rdb.*_legacy`) que fueron consolidados a `rdb.*` por
`20260408000000_rdb_consolidation`. Re-correrlo en Preview Branch fresca
falla porque las tablas legacy nunca existieron en el bootstrap moderno
(que crea `rdb.waitry_*` directo).

El SQL original completo vive en `supabase_migrations.schema_migrations.statements`
como audit trail. Para auditar:

```sql
SELECT statements FROM supabase_migrations.schema_migrations
WHERE version = '20260408000000';
```

Filename↔version matchea en ambos lados (disk + DB), así que no requiere whitelist.

## §5 — Sprint histórico de cleanup filename↔version

- **drift-3** (2026-04-25): erradicación del drift filename↔version.
  - **58 archivos renombrados** con `git mv` para que filename matchee el
    `version` registrado en `schema_migrations`.
  - **16 huérfanos históricos** (Mar–Abr/2026) recuperados desde
    `schema_migrations.statements`. 14 de ellos viven como **no-op stubs**
    en disco (referencian schemas legacy `waitry.*` / `caja.*` /
    `inventario.*` / `rdb.*_legacy` que fueron consolidados por
    `20260408000000_rdb_consolidation` — re-correrlos rompería Preview
    Branch). Los 2 modernos (`add_personas_contacto_y_empleados_notas`,
    `dilesa_consolidate_permissive_policies`) viven con su SQL real porque
    referencian schemas modernos que existen post-bootstrap.
  - **2 archivos** cuyo SQL ya estaba aplicado en prod sin tracker
    (`dedup_movimientos_caja_name_refs`, `dilesa_maquinaria_expose_schema`)
    registrados con su `version` del filename.
  - **4 bootstrap files** registrados como applied en prod (idempotentes,
    no-op en prod, sí corren en Preview/DR/local).
  - **4 dilesa_lotes** rebautizados en `schema_migrations` para limpiar el
    bug del MCP que registró `name` con timestamp embedded
    (`20260423230504_20260423110100_dilesa_lotes` →
    `20260423110100_dilesa_lotes`). Sin esta corrección, el orden de
    aplicación dejaba `dilesa.inventario_vivienda` (FK → construccion_lote)
    corriendo antes que `dilesa.construccion_lote`.
  - `config.toml` completado para que `db push` funcione desde local.
  - Governance §4 + drift-check §7 agregados para evitar regresión.
