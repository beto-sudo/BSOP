# CC PROMPT — Reconciliar drift de `supabase_migrations.schema_migrations`

**Origin:** sprint 4D §1 PR (db_quick_wins_4d). Mientras aplicaba esa migration con `supabase db push` (per instrucción explícita), el CLI bailó por drift histórico — la migration acabó aplicándose vía `mcp__supabase__execute_sql` + INSERT manual a tracking. Workaround OK puntual, pero el drift sigue ahí y va a bloquear el siguiente intento de `db push` también.

## Contexto

Históricamente este repo aplicó migraciones vía MCP `apply_migration`, que registra en `supabase_migrations.schema_migrations` con `version = current_timestamp()` (cuando MCP fue llamado), **no** con el timestamp del filename. Resultado:

```
LOCAL filename                                                | REMOTE schema_migrations.version
20260424184710_erp_cortes_vouchers.sql                        | 20260424184855
20260424230000_erp_producto_receta_modelo.sql                 | 20260424233233
20260424234500_drop_redundant_service_role_policy_producto…   | 20260424234451
20260425002501_rls_initplan_waitry_select.sql                 | 20260425002501  ← match (PR #181 fue manual fix)
20260425100000_db_quick_wins_4d.sql                           | 20260425100000  ← match (esta PR, fix manual)
```

Hoy `supabase migration list` reporta **73 versiones remotas sin archivo local** — y **muchos archivos locales sin row remoto con version matcheada** (aunque el `name` matchea). El CLI ve ambos lados como "drift" y bloquea `db push` con:

```
Remote migration versions not found in local migrations directory.
```

## Goal

Que `supabase db push` corra limpio sin warnings ni errores en la próxima migration, y que cada `version` en `schema_migrations` matchee el filename de su archivo local correspondiente.

## Tareas

### 1. Mapear el drift completo

Producir `docs/db-migration-drift-map.csv` con columnas:
- `local_filename` (o vacío si solo existe remoto)
- `local_version` (extraído del filename, vacío si no hay local)
- `remote_version` (vacío si no hay row remoto)
- `migration_name` (común a ambos lados)
- `action` — uno de: `keep` (ya matchea), `realign-remote` (renombrar version remota al filename local), `realign-local` (renombrar archivo local al version remoto), `delete-remote-orphan` (row remoto sin local file), `add-local-stub` (file local faltante para row remoto válido)

Querys útiles:
```sql
-- Lado remoto
SELECT version, name FROM supabase_migrations.schema_migrations ORDER BY version;
-- Lado local
ls supabase/migrations/ | sed -E 's/^([0-9]+)_(.+)\.sql$/\1\t\2/'
```

### 2. Decidir estrategia

**Opción 1 — Realinear remoto al local (preserva filenames git):**
- Por cada par `(local_version, remote_version, name)` donde versions difieren pero name matchea: `UPDATE schema_migrations SET version = '<local_version>' WHERE version = '<remote_version>'`.
- Riesgo: bajo. La columna `version` no tiene FKs salidas. Pero es escritura directa al tracking de Supabase — testear en branch antes.

**Opción 2 — Realinear local al remoto (preserva tracking actual):**
- Renombrar archivos locales a `<remote_version>_<name>.sql`.
- Riesgo: bajo, pero rompe el orden cronológico legible del repo (los timestamps ya no representan cuándo se escribió la migration).

**Opción 3 — Combinación:** mantener filenames donde no hay drift, alinear los demás caso por caso.

Mi (Beto) instinto: Opción 1. El filename con timestamp humano legible importa más para git history que el version remoto que es opaco. Pero validar primero en Preview Branch.

### 3. Aplicar el realineamiento

Crear migration `supabase/migrations/<timestamp>_drift_reconcile.sql` que NO se aplica (es solo para audit trail), y aplicar los UPDATEs vía MCP `execute_sql` en producción. La migration sirve como documentación de qué se cambió.

Alternativamente, si Supabase CLI tiene un `migration repair --status applied --version-rename <old> <new>` (verificar — no estoy seguro que exista), usar eso.

### 4. Validar

```sh
supabase migration list --db-url "$SUPABASE_DB_URL"
# Todos los rows deberían tener LOCAL == REMOTE column (o "       " si solo en uno)
# Idealmente cero filas con LOCAL ∅, cero filas con REMOTE ∅

# Test el camino feliz
echo "-- noop test" > supabase/migrations/<timestamp>_drift_test.sql
supabase db push --db-url "$SUPABASE_DB_URL"
# Debería aplicar limpio sin warnings
rm supabase/migrations/<timestamp>_drift_test.sql
```

### 5. Documentar

- Agregar §4 a `supabase/GOVERNANCE.md`: "Aplicar migraciones via `supabase db push`, no MCP `apply_migration`. La razón es matchear version=filename. Si tienes que usar MCP por urgencia, registrar manualmente en `schema_migrations` con el version del filename después de aplicar (ver PR #182 sprint 4D §1 para template)."

## Convención de aplicación para esta PR

Esta PR de reconciliación misma debe usar `supabase db push` para la migration de audit (la `_drift_reconcile.sql`). Una vez reconciliado, debería funcionar.

## Riesgo

**Medio.** Tocar `supabase_migrations.schema_migrations` es escritura directa al tracking interno de Supabase. Aunque la tabla solo tracking metadata (no afecta schema real), un mistake puede:
- Hacer que el CLI re-aplique migrations (idempotencia salva pero ruidoso)
- Romper el `db pull` de Supabase si el usuario lo corre

**Mitigación:**
- Tomar snapshot: `pg_dump --schema=supabase_migrations -f /tmp/migrations_backup.sql $SUPABASE_DB_URL`
- Aplicar UPDATEs uno por uno, verificando `migration list` después de cada batch
- Tener rollback list a la mano

## Output esperado del PR

- `docs/db-migration-drift-map.csv` (audit trail)
- `supabase/migrations/<timestamp>_drift_reconcile.sql` (migration documentando los cambios, idempotente, vacía o con comentarios)
- `supabase/GOVERNANCE.md` §4 actualizada
- `npm run schema:ref` regenerado (probablemente sin cambios, pero por hábito)
- PR description con before/after de `migration list`

## Referencias

- PR sprint 4D §1: <link cuando se mergee>
- PR #181 (rls_initplan_waitry_select): primer intento de matchear version=filename, exitoso.
- `supabase migration list` documentation: https://supabase.com/docs/reference/cli/supabase-migration-list
