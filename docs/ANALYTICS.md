# Módulo `analytics` — capa gold para BI externo

> Vive en el schema Postgres `analytics`. Pensado para que Metabase /
> Superset / DuckDB lean métricas listas sin pegarle a las tablas vivas
> de `erp` / `dilesa` / `rdb` / `playtomic`.

## TL;DR

- Un schema dedicado: `analytics`.
- Un rol read-only: `analytics_reader` (LOGIN, password fuera de migración).
- Vistas materializadas (MVs) refrescadas cada 30 min vía `pg_cron` o manualmente con `analytics.refresh_all()`.
- Catálogo de métricas en `analytics.metric_dictionary` — definición canónica de cada KPI.

## ¿Por qué un schema aparte?

1. **Aislamiento de privilegios.** El rol del BI sólo ve `analytics`.
2. **Performance.** Las MVs cachean joins pesados; el dashboard no pega contra `erp.cortes_caja` viva.
3. **Cross-empresa sin gymnastics.** Las MVs no respetan RLS — útil para Beto admin, riesgo controlado mientras solo él consuma.
4. **Diccionario en DB.** `analytics.metric_dictionary` es la fuente de verdad de cómo se calcula cada métrica.

## MVs piloto

| MV                       | Granularidad            | Origen                                                     |
| ------------------------ | ----------------------- | ---------------------------------------------------------- |
| `mv_corte_diario`        | 1 fila por corte        | `erp.cortes_caja` + `cortes_vouchers` + `movimientos_caja` |
| `mv_dilesa_pipeline`     | 1 fila por lote         | `dilesa.lotes` + `proyectos` + `v_lotes_estatus`           |
| `mv_playtomic_ocupacion` | (cancha × fecha × hora) | `playtomic.bookings`                                       |

## Refresh

```sql
SELECT * FROM analytics.refresh_all();
```

Devuelve `(mv_name, refreshed_at, duration_ms)`. Usa `REFRESH MATERIALIZED VIEW CONCURRENTLY` (no bloquea lecturas).

Para automatizar con `pg_cron` (si está habilitado en el proyecto):

```sql
SELECT cron.schedule(
  'analytics-refresh',
  '*/30 * * * *',
  'SELECT analytics.refresh_all()'
);
```

## Setear password de `analytics_reader`

No va en migración (secret). Se hace una vez:

```sql
ALTER ROLE analytics_reader WITH PASSWORD 'xxx';
```

Guardar en 1Password → `Infrastructure / BSOP-Analytics / DB password`.

## Conectar Metabase

Host: `db.<project>.supabase.co` (o pooler:6543 para pgbouncer)
Port: `5432`
DB: `postgres`
User: `analytics_reader`
Password: 1Password
SSL: required

En Metabase → **Admin → Databases → Add database → PostgreSQL**.
Marcar "Only show schemas: analytics" para limitar el catálogo.

## Agregar una MV nueva

1. Diseñar query con joins ya prefiltrados por `empresa_id` si aplica.
2. Crear migración `<TS>_analytics_mv_<nombre>.sql` con:
   - `CREATE MATERIALIZED VIEW analytics.mv_<nombre> AS …;`
   - Índice único para soportar `REFRESH CONCURRENTLY`.
   - Índices de filtro común (`fecha`, `empresa_id`).
   - `GRANT SELECT … TO analytics_reader;`
   - Agregar el nombre al array `mvs` dentro de `analytics.refresh_all()` (ALTER FUNCTION).
3. Insertar entradas en `analytics.metric_dictionary` por cada métrica derivada.
4. Correr `npm run schema:ref` para actualizar `SCHEMA_REF.md`.

## Convenciones

- **Todo timestamp**: `timestamptz`. Para particionar por fecha local, convertir a `America/Matamoros` en la MV.
- **Empresa_id**: incluir siempre la columna y un índice `(empresa_id, fecha)`.
- **Refrescos pesados**: evitar joins contra tablas con >10M filas sin `WHERE` por fecha.
- **Naming**: `mv_<dominio>_<grano>` (ej. `mv_corte_diario`, `mv_dilesa_pipeline`).
- **Columna sentinela**: cada MV expone `_refreshed_at = NOW()` para validar frescura desde Metabase.

## Próximos candidatos (no implementados)

- `mv_cobranza_aging` — `erp.cobranza` con buckets 0-30 / 31-60 / 61-90 / 90+.
- `mv_inventario_diferencias` — diferencias por levantamiento.
- `mv_gastos_categoria_mes` — `erp.gastos` agrupado.
- `mv_audit_anomalias` — `core.audit_log` con detección de patrones (cambios fuera de horario, ediciones a cortes cerrados).
- `mv_flotilla_tco` — `erp.activos` + `activos_mantenimiento` por unidad.
- `kpi_diario` — fact table denormalizada `(fecha, empresa_id, kpi, valor)` para dashboards instantáneos.

## Decisiones registradas

Ver migración `20260425170000_analytics_schema_pilot.sql` (sección "Decisiones") para el racional D1–D6.
