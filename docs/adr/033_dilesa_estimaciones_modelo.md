# ADR-033 — Modelo de Estimaciones de pago a contratistas (DILESA)

**Status**: Accepted
**Date**: 2026-05-25
**Initiative**: [dilesa-estimaciones](../planning/dilesa-estimaciones.md)
**Schemas**: `dilesa`, `core` (roles)

## Contexto

El módulo Construcción ya captura tareas terminadas con MO calculada
(`v_construccion_tareas_terminadas_con_mo`), pero **no existe el cierre
operativo del ciclo de pago a contratistas** en BSOP. Beto y el gerente
de construcción siguen haciendo el cierre semanal en Coda:

1. Las tareas palomeadas van acumulando "pendiente de pago".
2. Cada **miércoles** el gerente cierra: revisa, aprueba, agrupa por
   contratista.
3. Desglose por tarea dentro de cada obra, suma por unidad, totaliza.
4. Mismo día se solicita factura al contratista.
5. **Jueves siguiente** se paga y se marca como saldado.

Esta ADR formaliza el modelo BSOP que cierra ese loop, eliminando la
duplicación con Coda.

## Decisión

### D1 — Modelo M:1 (`estimacion ← N tareas`)

```
dilesa.estimaciones (1 fila por cierre)
  ↑
dilesa.estimacion_tareas (M:1)
  ↓
dilesa.construccion_tareas_terminadas (existente)
```

**Por qué no denormalizar montos**:

- El detalle por tarea es necesario para el PDF que se entrega al
  contratista (solicitud de factura debe desglosar).
- Re-cálculos al cancelar estimación se simplifican (DELETE de
  `estimacion_tareas` libera las tareas).
- Análisis de variación (qué tarea entró en qué estimación) se hace
  con un solo JOIN.

### D2 — UNIQUE(tarea_terminada_id) en `estimacion_tareas`

Constraint absoluto, **sin condición por estado de estimación**. Una
tarea solo puede estar en una estimación a la vez, sin importar si la
estimación está en borrador, aprobada, facturada o pagada.

**Implicaciones**:

- Si una estimación se cancela, las tareas se LIBERAN al hacer DELETE
  de `estimacion_tareas`. Quedan disponibles para próxima estimación.
- Si una tarea palomeada no entra a la estimación de W22, queda en
  `v_tareas_pendientes_de_pago` para W23+ — sin acción manual.
- Si por error se intenta meter una tarea dos veces, falla la UNIQUE
  (defensa).

### D3 — Estados (5): borrador → aprobada → facturada → pagada / cancelada

```
[borrador] ─aprobar─→ [aprobada] ─factura recibida─→ [facturada] ─pago efectuado─→ [pagada]
   │                      │
   └────cancelar──────────┴──→ [cancelada] (libera tareas vía DELETE estimacion_tareas)
```

| Estado      | Tareas editables | Datos editables              | Lock en tareas                                                      |
| ----------- | ---------------- | ---------------------------- | ------------------------------------------------------------------- |
| `borrador`  | ✓ (add/remove)   | ✓ todo                       | —                                                                   |
| `aprobada`  | —                | factura_url/folio            | —                                                                   |
| `facturada` | —                | referencia_pago + fecha_pago | —                                                                   |
| `pagada`    | —                | —                            | ✓ trigger bloquea DELETE/UPDATE en `construccion_tareas_terminadas` |
| `cancelada` | —                | —                            | — (tareas liberadas)                                                |

**Por qué 5 estados y no 3**:

- `aprobada` separada de `facturada` permite trackear el tiempo
  factura recibida (KPI operativo del contratista).
- `facturada` separada de `pagada` permite el día gap entre solicitar
  factura (miércoles) y pagarla (jueves).
- `cancelada` es estado distinto a "no existe" para preservar audit
  trail (quién la canceló, cuándo, por qué).

### D4 — Retención 5% como default, editable

Campo `retencion_pct numeric(5,2) NOT NULL DEFAULT 5.0` por
estimación. La convención DILESA es 5% (no 10% como otros constructores
mexicanos), pero el modelo permite excepciones por contrato.

`retencion_monto` y `monto_neto` se calculan al cierre y se snapshot
en la fila — no se re-derivan (evita re-cálculos si el % cambia
después).

```sql
retencion_monto = monto_bruto * (retencion_pct / 100)
monto_neto      = monto_bruto - retencion_monto
```

**Liberación de retención acumulada**: NO en MVP. Se queda visible
como "saldo retenido" agregado por contratista en una vista futura.
Se libera manualmente al cierre de la obra (v2 si Beto pide).

### D5 — Multi-obra por estimación (1 contratista, N obras)

Refleja realidad operativa: un contratista trabaja simultáneamente en
varias viviendas y cobra todo junto cada semana. El desglose por obra
es client-side (GROUP BY en query del detalle) — la estimación no
tiene FK a obra específica.

`estimacion_tareas.construccion_id` se denormaliza para queries fast
del desglose, pero la integridad la garantiza la FK a `tarea_terminada`.

### D6 — Cadencia: `fecha_cierre DATE` libre, no enum

El cierre operativo es semanal miércoles → jueves, pero el campo es
DATE libre. Razones:

- Permite cierres ad-hoc (semanas con festivos, cierres parciales).
- No fuerza alineación lun-dom artificial.
- El código UI puede pre-fill default = próximo miércoles + warning
  si se elige otro día, sin restringir.

### D7 — `fecha_pago_programado` = `fecha_cierre + 1 día`

Default automático en el RPC `fn_generar_estimacion_borrador` y en el
INSERT directo: si no se especifica, el sistema agrega 1 día calendario
a `fecha_cierre`. Editable post-creación.

Por simplicidad NO se ajusta por fines de semana o festivos —
miércoles+1 = jueves siempre OK. Si llega a haber cierres lunes
(festivo martes), el operador ajusta manualmente.

### D8 — Lock post-pago: trigger en `construccion_tareas_terminadas`

Cuando una estimación pasa a `pagada`, las tareas vinculadas quedan
blindadas:

```sql
CREATE TRIGGER tg_ctt_lock_pagadas
  BEFORE UPDATE OR DELETE ON dilesa.construccion_tareas_terminadas
  FOR EACH ROW EXECUTE FUNCTION dilesa.fn_tg_ctt_lock_pagadas();
```

La función rechaza con `RAISE EXCEPTION` si:

- La fila está en una `estimacion_tareas` cuya `estimacion.estado='pagada'`
- Y el usuario NO tiene el rol `direccion` (override de emergencia).

El override de dirección se valida con
`core.fn_user_has_role('direccion')` (helper a crear en Sprint 2 RBAC).

Para esta Sprint 1 el trigger se crea pero **NO valida rol** (siempre
rechaza si está pagada) — el override de dirección se agrega en Sprint
2 cuando los roles existan. Esto significa que en Sprint 1, ningún
usuario puede des-palomear tareas pagadas; Sprint 2 abre la excepción
para dirección.

### D9 — Audit trail apunta a `core.usuarios` (no a `erp.personas`)

Sigue el patrón establecido por `revisado_por_user_id` en
`construccion_tareas_terminadas` (ADR del Sprint construcción inline):
los users del sistema operan BSOP, no necesariamente son personas ERP.

```sql
aprobada_por_user_id uuid REFERENCES core.usuarios(id) ON DELETE SET NULL
pagada_por_user_id   uuid REFERENCES core.usuarios(id) ON DELETE SET NULL
```

Display: `core.usuarios.first_name` (con fallback a `email` si NULL).

### D10 — RPC `fn_generar_estimacion_borrador(contratista_id, fecha_cierre)`

En vez de generar la estimación con triggers automáticos (cron),
preferimos un RPC que el operador invoca explícitamente desde la UI:

```sql
fn_generar_estimacion_borrador(
  p_contratista_id uuid,
  p_fecha_cierre date DEFAULT CURRENT_DATE,
  p_retencion_pct numeric DEFAULT 5.0
) RETURNS uuid  -- estimacion_id creada
```

Comportamiento:

1. Busca todas las `construccion_tareas_terminadas` del contratista:
   - `fecha_terminada <= p_fecha_cierre`
   - `deleted_at IS NULL`
   - NO está en ninguna `estimacion_tareas` (libre)
   - La `construccion` NO está en estado `cancelada`
2. Calcula MO por tarea (COALESCE(captura, % × valor_contrato_mo))
3. INSERT estimacion borrador con `monto_bruto = SUM(MO)`,
   retención, neto, código auto-generado
4. INSERT N filas en `estimacion_tareas` (snapshot del monto)
5. RETURNS estimacion_id

Si el contratista no tiene tareas pendientes, devuelve NULL (no crea
estimación vacía).

### D11 — Código auto: `EST-YYYY-WNN-<abrev>-NNN`

Format al estilo Coda:

- `EST` prefijo
- `YYYY` año del cierre
- `WNN` semana ISO del cierre (W01-W53)
- `<abrev>` abreviación del contratista (`MAYA`, `MAR`, `DAV`)
- `NNN` secuencial por contratista por semana (001, 002, ...) — por si
  hay 2 estimaciones la misma semana (raro pero posible)

UNIQUE(empresa_id, codigo) garantiza no-colisión.

## Alternativas consideradas

- **A1 — Sin tabla intermedia, montos en JSON en estimación**: simple
  pero pierde queries SQL nativos del desglose. Rechazada.
- **A2 — Estados solo borrador → pagada (2 estados)**: pierde
  granularidad del flujo factura. Rechazada — Beto confirmó que el
  flujo de 3 días (cierre miércoles, factura miércoles, pago jueves)
  es importante operativamente.
- **A3 — Cron automático genera estimaciones cada miércoles**: agrega
  complejidad sin valor — el gerente igual tiene que revisar y
  aprobar. Mejor a demanda. Rechazada.
- **A4 — Retención al pagar (no al cerrar)**: el factor de retención
  no es renegociable post-factura. Rechazada.
- **A5 — Lock por estado vs por trigger**: solo policy UI es frágil
  (cualquier acceso DB directo lo brinca). Trigger SQL es la fuente
  de verdad. Aceptada (D8).

## Consecuencias

**Positivas**:

- Cierre operativo completo en BSOP — elimina dependencia de Coda
  para estimaciones.
- Audit trail robusto: quién aprobó, quién pagó, referencia bancaria,
  factura ligada.
- Lock SQL garantiza integridad financiera independientemente de bugs
  UI.
- PDF + email automatizan el loop con el contratista.

**Negativas**:

- Sprint 2 (RBAC) tiene que crear el rol `direccion` antes de que el
  lock tenga el override. Hasta entonces, **nadie** puede modificar
  tareas pagadas — incluyendo admins. Esto es intencional pero hay
  que documentarlo en CHANGELOG.
- El RPC `fn_generar_estimacion_borrador` puede tardar si un
  contratista tiene cientos de tareas pendientes (poco común — el
  cierre semanal mantiene los volúmenes bajos).
- El campo `retencion_pct` editable abre la puerta a inconsistencias
  (ej. cambiar de 5 a 10% post-aprobación). Mitigación: el UI solo
  permite editar en estado `borrador`.

## Migración

Una sola migración en Sprint 1:

```
supabase/migrations/<TIMESTAMP>_dilesa_estimaciones_schema_base.sql
```

Crea: 2 tablas + 2 vistas + 2 funciones + 1 trigger + 1 RLS policy
por tabla + índices. Aditiva pura — no toca tablas existentes.

## Validación

- Test manual: crear borrador con `fn_generar_estimacion_borrador`,
  agregar/quitar tareas, aprobar, marcar factura, pagar, verificar
  que el lock SQL rechaza `DELETE FROM construccion_tareas_terminadas`.
- Sprint 2: validar que el rol `direccion` puede hacer override.
