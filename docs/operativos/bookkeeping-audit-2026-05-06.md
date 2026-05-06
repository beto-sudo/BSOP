# Auditoría de bookkeeping `supabase_migrations.schema_migrations`

**Fecha:** 2026-05-06
**Branch:** `chore/bookkeeping-audit`
**Estado:** auditoría lista; **NO se ejecutó el repair** — esperando luz verde de Beto.

## Contexto

`supabase db push` ha venido fallando con drift "remote migrations not in
local migrations directory" porque el bookkeeping de `schema_migrations`
se quedó congelado el **2026-04-25 16:22 UTC** (versión `20260425162203`).
Desde entonces, ~36 migraciones se aplicaron físicamente a la BD por
`psql` directo o vía Supabase MCP (en sesiones automatizadas) sin que el
bookkeeping se actualizara.

Por eso he venido aplicando todas mis migraciones recientes (cron jwt,
coverage effective, historial, etc.) con `psql` directo en lugar de
`db push`.

## Hallazgos

| Métrica                                                |  Valor |
| ------------------------------------------------------ | -----: |
| Archivos en `supabase/migrations/*.sql`                |    221 |
| Versiones en `supabase_migrations.schema_migrations`   |    185 |
| **Migraciones locales NO registradas**                 | **36** |
| Versiones en bookkeeping huérfanas (sin archivo local) |      0 |

## Spot-checks de aplicación física

Para confirmar que las 36 migraciones SÍ están aplicadas físicamente
(solo falta el registro), validé 8 puntos representativos:

| Migración        | Objeto verificado                           | Existe |
| ---------------- | ------------------------------------------- | ------ |
| `20260425170000` | schema `analytics`                          | ✅     |
| `20260428220000` | columna `core.modulos.seccion`              | ✅     |
| `20260428230000` | módulo `dilesa.terrenos` en `core.modulos`  | ✅     |
| `20260430140000` | módulo `rdb.recepciones` en `core.modulos`  | ✅     |
| `20260501000000` | tabla `erp.empleados_pago`                  | ✅     |
| `20260504000000` | tabla `playtomic.payment_assignments`       | ✅     |
| `20260504133353` | función `core.fn_persona_visible`           | ✅     |
| `20260504210000` | tabla `playtomic.payments_import`           | ✅     |
| `20260505010000` | vista `playtomic.v_bookings_total_coverage` | ✅     |
| `20260506010513` | columna `effective_status` en la vista      | ✅     |
| `20260506015406` | vista `playtomic.v_conciliacion_historial`  | ✅     |

8/8 confirmadas. Confianza alta de que las 36 están aplicadas.

## Lista completa de versiones a reparar (36)

```
20260425170000  analytics_schema_pilot
20260426120000  …
20260426130000  …
20260427103620  …
20260427150000  …
20260427180000  …
20260427210000  …
20260428100000  …
20260428140000  …
20260428220000  modulos_add_seccion
20260428230000  modulos_dilesa_inmobiliario
20260428235000  …
20260428240000  …
20260428241000  …
20260428250000  drop_rdb_tasks_modulo
20260429100000  …
20260430000000  …
20260430120000  …
20260430130000  …
20260430140000  modulo_rdb_recepciones
20260430150000  …
20260430160000  …
20260430170000  …
20260430210000  modulos_seccion_operativa
20260501000000  import_empleados_contpaqi_schema_delta
20260501010000  import_empleados_contpaqi_catalogos
20260504000000  playtomic_payment_assignments
20260504133353  personas_visibilidad_cross_empresa
20260504210000  playtomic_payments_import
20260504230000  drop_redundant_service_role_policies_playtomic
20260505000000  grant_authenticated_playtomic_payment_tables
20260505010000  playtomic_v_bookings_total_coverage
20260505030000  pgrst_db_max_rows_50k
20260505234803  playtomic_cron_jwt_auth
20260506010513  playtomic_coverage_effective
20260506015406  playtomic_v_conciliacion_historial
```

## Comando para ejecutar el repair

**Importante:** correr desde el repo BSOP local con el CLI de Supabase
linked al proyecto correcto.

```bash
cd /Users/Beto/BSOP
supabase migration repair --status applied \
  20260425170000 20260426120000 20260426130000 20260427103620 \
  20260427150000 20260427180000 20260427210000 20260428100000 \
  20260428140000 20260428220000 20260428230000 20260428235000 \
  20260428240000 20260428241000 20260428250000 20260429100000 \
  20260430000000 20260430120000 20260430130000 20260430140000 \
  20260430150000 20260430160000 20260430170000 20260430210000 \
  20260501000000 20260501010000 20260504000000 20260504133353 \
  20260504210000 20260504230000 20260505000000 20260505010000 \
  20260505030000 20260505234803 20260506010513 20260506015406
```

El comando solo escribe en `supabase_migrations.schema_migrations` (tabla
de bookkeeping de Supabase). NO toca `core.*`, `playtomic.*`, ni ninguna
tabla de datos. Es una operación reversible (se puede revertir con
`--status reverted`).

## Validación post-repair

Después del repair, correr:

```bash
supabase db push --linked
```

Debe terminar con `Remote database is up to date.` (sin sugerir más
repairs ni intentar aplicar nada). Eso confirma que el bookkeeping
quedó alineado con la realidad física.

## Si algo sale mal

- `supabase migration list --linked` muestra el estado actual.
- Para revertir el repair: `supabase migration repair --status reverted <versions>`.
  Eso regresa al estado actual (drift conocido).
- Como spot-checks confirmaron objetos físicos OK, el peor caso de un
  repair mal hecho es que `db push` siga sugiriendo repairs. **No se
  pierden datos.**

## Por qué pasó esto

Causa raíz probable: durante varias semanas se han aplicado migraciones
con `psql` directo al fallar `db push` por drift previo. Cada aplicación
exitosa por `psql` saltaba el `INSERT INTO supabase_migrations.schema_migrations`
que `db push` agrega automáticamente. El bookkeeping se quedó atrás.

Para evitar repetir el patrón, idealmente:

1. Una vez resuelto este drift, validar que `db push` funciona limpio.
2. Cuando una migración requiera `psql` directo (drift preexistente, o
   urgencia), agregar manualmente el row al bookkeeping al final:
   ```sql
   INSERT INTO supabase_migrations.schema_migrations (version, statements)
   VALUES ('YYYYMMDDHHMMSS', ARRAY['<sql_completo>'])
   ON CONFLICT DO NOTHING;
   ```
3. Lo correcto a futuro: mecanismo automático en pre-commit que detecte
   migraciones aplicadas pero no registradas. Out of scope para esta
   auditoría.
