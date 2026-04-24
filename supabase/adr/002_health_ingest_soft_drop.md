# ADR-002 — Health ingest blocklist: soft drop en vez de aborto

**Fecha:** 2026-04-24
**Estado:** propuesto (pendiente ejecución por Claude Code y aprobación de Beto)
**Autor:** planeado en Cowork-Supabase
**Referencias:**

- Migración original del trigger: `supabase/migrations/20260423005640_health_metrics_ingest_blocklist.sql` (sprint drift-1, Mig 4 de 6)
- Endpoint de ingest: `app/api/health/ingest/route.ts`
- `supabase/GOVERNANCE.md`

---

## Contexto

El 2026-04-23 01:54 UTC se aplicó la migración `20260423005640_health_metrics_ingest_blocklist.sql`, que instaló `trg_health_metrics_ingest_blocklist BEFORE INSERT ON health.health_metrics` con la función `health.fn_reject_noisy_ingest`. La función tiene tres reglas de rechazo — dos usan `RETURN NULL` (soft drop) y una usa `RAISE EXCEPTION`:

| Regla                              | Acción                |
| ---------------------------------- | --------------------- |
| `source IS NULL OR source = ''`    | **`RAISE EXCEPTION`** |
| `source = 'Test Watch'`            | `RETURN NULL`         |
| `metric_name IN ('Dietary Water')` | `RETURN NULL`         |

El endpoint `/api/health/ingest` inserta por batch vía `supabase.from('health_metrics').upsert(...)`. Postgres corre el batch dentro de una transacción implícita: una sola fila que dispare `RAISE EXCEPTION` aborta el batch entero y **todas** las filas buenas del mismo batch se pierden.

### Síntoma observado

Desde el 2026-04-22 16:24 UTC no entra data `Sleep *` (Sleep Core, REM, Deep, Awake, In Bed). Todo lo demás (Heart Rate, Active Energy, Step Count, HRV, etc.) sigue ingresando normal.

### Evidencia

En `health.health_ingest_log`, el 2026-04-23 entre las 02:34 y 02:41 UTC hay 3 batches idénticos de ~3137 métricas con:

```
error: health_metrics: source cannot be null/empty | code=P0001
```

Esos batches coincidían con la ventana en que Health Auto Export sube el sueño del 22→23. Las 3 filas `Sleep *` eran colaterales: estaban bien formadas, pero alguna otra fila del batch llegaba con `source` vacío y tumbó la transacción. El reintento a las 02:42 ya pasó (con 2 métricas más, mismo tamaño de payload — posible que HAE filtrara algo del lado cliente), pero ese batch ya no traía el sueño.

### Reproducción controlada (2026-04-24)

```sql
BEGIN;
INSERT INTO health.health_metrics (metric_name, date, value, unit, source) VALUES
  ('Sleep Core', '2026-04-23 05:00:00+00', 1.5, 'hr', 'Apple Watch'),
  ('Sleep REM',  '2026-04-23 06:00:00+00', 0.8, 'hr', 'Apple Watch'),
  ('Step Count', '2026-04-23 06:30:00+00', 120, 'count', '')
ON CONFLICT (metric_name, date, source) DO UPDATE SET value = EXCLUDED.value;
-- ERROR: health_metrics: source cannot be null/empty (P0001)
-- Conteo de filas insertadas = 0 (todo rollback, incluyendo las 2 Sleep buenas)
ROLLBACK;
```

Mismo test con la función parcheada (`RETURN NULL` en vez de `RAISE`): las 2 filas `Sleep *` entran, la de `source=''` se descarta silenciosa.

## Decisión

Cambiar la regla `source IS NULL OR source = ''` de `RAISE EXCEPTION` a `RETURN NULL`. Queda consistente con las otras dos reglas del mismo trigger: el trigger siempre **filtra**, nunca **aborta**.

No se crea migración para re-ejecutar batches históricos: Health Auto Export no tiene replay server-side. Si el shortcut en el iPhone todavía tiene los payloads del 22→23 y 23→24 en cola, van a reintentar solos en el próximo push; si ya los dropeó, ese sueño está perdido (2 noches).

### Por qué no endurecer el endpoint a cambio

El endpoint ya defaultea `source` a `'Health Auto Export'` si viene vacío (`rowSource || entrySource || 'Health Auto Export'`). Sin embargo, basta una ruta de código que no pase por ese normalizer para reintroducir el problema. Mientras la BD sea la última línea de defensa, queremos que **no aborte batch**. La alternativa "hacer al endpoint infalible" deja la DB expuesta al próximo refactor del cliente.

Se documenta en §Seguimiento una tarea complementaria para el lane UI: filtrar explícitamente filas con `source` vacío antes del upsert (defensa en profundidad), no como sustituto de este fix.

## Consecuencias

### Positivas

- El batch de ingest nunca se pierde entero por una fila defectuosa.
- Queda consistente el comportamiento del trigger: todo rechazo es soft-drop.
- Recuperamos el ingest de `Sleep *` en la próxima subida.

### Neutras / a monitorear

- Filas con `source` vacío dejan de dar señal ruidosa (ya no producen error en logs). Si aparecen en volumen anómalo, no nos vamos a enterar hasta que revisemos el conteo vs payload_size.
- Mitigación: seguimiento 1 abajo (contador en `health_ingest_log`).

### Negativas

- Ninguna identificada. La regla actual de `RAISE` no aporta enforcement útil porque el endpoint sí defaultea source; era una red de seguridad que terminó siendo una bomba.

## Seguimiento

1. **Telemetría en `health.health_ingest_log`** — agregar columna `metrics_dropped_by_trigger int` contando filas descartadas (`metrics_count` ya cuenta lo enviado; queremos diferenciar enviadas vs persistidas). Se puede calcular comparando conteo pre-upsert vs `affected_rows` post-upsert. Scope separado, prioridad baja.
2. **Hardening en endpoint (lane UI)** — en `app/api/health/ingest/route.ts`, después de `dedupeByKey` agregar un `.filter(r => !!r.source && r.source.trim() !== '')`. Cinturón + tirantes. Documentar en proyecto Cowork "BSOP UI" o donde viva el owner del endpoint.
3. **Chequear si HAE tiene cache local del sueño perdido** — pedir a Beto que abra el shortcut en el iPhone y fuerce un re-sync del rango 2026-04-22 → 2026-04-24. Si HAE expone esa opción, puede recuperar el sueño colateral; si no, se pierde.

## Ejecución

Un solo PR:

- Migración: `supabase/migrations/20260424150000_health_blocklist_soft_drop.sql` (body en el prompt de Claude Code, ver `002_health_ingest_soft_drop.claude-code.md`).
- Regenerar `SCHEMA_REF.md` (`npm run schema:ref`) — aunque el cambio es solo de función; el hook lo corre igual.
- Verificación post-merge: que `health.health_ingest_log` vuelva a registrar `status='ok'` en todos los batches, y que `Sleep *` vuelva a tener `ingested_at` reciente.

## Cambios a este ADR

Editar vía PR con cambio de estado: `propuesto → aceptado → implementado`. Si aparece un motivo para mantener `RAISE EXCEPTION`, revertir con una nueva migración y actualizar aquí la decisión.
