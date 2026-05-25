# Iniciativa — Estimaciones de pago a contratistas (DILESA)

**Slug:** `dilesa-estimaciones`
**Empresas:** DILESA
**Schemas afectados:** `dilesa` (2 tablas nuevas + RPC de generación),
`core` (3 roles nuevos si aún no existen)
**Estado:** planned
**Dueño:** Beto
**Creada:** 2026-05-25
**Última actualización:** 2026-05-25 (planning doc + promovida)

## Problema

El módulo Construcción ya captura tareas terminadas con su MO calculada
(% × valor_contrato_mo), pero **no existe el cierre operativo del ciclo
de pago a contratistas**. Hoy en Coda eso se hace así:

1. Las tareas palomeadas van acumulando "pendiente de pago" por
   contratista.
2. Cada **miércoles** el gerente de construcción hace cierre: revisa,
   aprueba, agrupa por contratista las tareas no pagadas.
3. Se desglosa por tarea dentro de cada obra, se suma por unidad y se
   totaliza el monto del contratista.
4. Mismo día se solicita factura al contratista.
5. **Jueves siguiente** se paga y se marca como saldado.

Sin este módulo en BSOP:

- No hay vista de "pendiente de pago acumulado por contratista".
- No hay lock que impida des-palomear o borrar tareas ya pagadas
  (riesgo de inconsistencia financiera).
- No hay PDF formal de estimación para entregar al contratista.
- No hay audit trail de quién aprobó/pagó cada estimación.
- Las estimaciones siguen viviendo en Coda — duplicación de fuente de
  verdad con la captura de tareas en BSOP.

## Outcome esperado

1. **Vista "pendiente de pago"** por contratista: lista de tareas
   palomeadas que aún no entraron a una estimación, con monto bruto
   acumulado.
2. **Flujo de cierre semanal**: el gerente arma estimación a demanda
   (típicamente miércoles), revisa el desglose, aprueba. Sistema valida
   que las tareas no estén en otra estimación.
3. **PDF formal de estimación** generado al aprobar — desglose por
   obra, tareas, montos brutos, retención 5%, monto neto. Enviado por
   email al contratista solicitando factura.
4. **Lock post-pago**: una vez `estado='pagada'`, las tareas vinculadas
   quedan blindadas — no se pueden des-palomear ni borrar excepto por
   dirección (override de emergencia).
5. **Audit trail**: quién aprobó, cuándo se mandó email, quién registró
   pago, referencia bancaria.
6. **Migración histórica de Coda**: opcional v2 — importar estimaciones
   ya pagadas para tener histórico de pagos por contratista.

## Modelo conceptual

```
CATÁLOGOS (existentes)
  dilesa.construccion_tareas_terminadas  ← captura palomeo
  v_construccion_tareas_terminadas_con_mo (vista)

ESTIMACIONES (nuevas)
  dilesa.estimaciones
    id, codigo (EST-2026-W22-MAYA-001 auto)
    contratista_id, fecha_cierre (DATE), fecha_pago_programado (DATE)
    monto_bruto (sum tareas), retencion_pct (default 5)
    retencion_monto, monto_neto (bruto - retencion)
    factura_url, factura_folio, factura_fecha
    aprobada_por_user_id, aprobada_at
    pagada_por_user_id, pagada_at, referencia_pago
    estado check IN ('borrador','aprobada','facturada','pagada','cancelada')
    notas, deleted_at, created_at, updated_at

  dilesa.estimacion_tareas (M:1 estimacion ← tarea terminada)
    estimacion_id, tarea_terminada_id (UNIQUE — locks)
    construccion_id (denormalizado para queries fast)
    monto_calculado (snapshot bruto del momento del cierre)
    created_at

VISTAS
  v_tareas_pendientes_de_pago (terminadas WHERE NOT IN estimacion_tareas
                                AND construccion no cancelada)
  v_estimaciones_resumen (por contratista × estado × semana)
```

**Asunciones del modelo**:

- **Una tarea = una estimación**: UNIQUE(tarea_terminada_id) blinda
  duplicación. Si una tarea palomeada no entra a la estimación de W22,
  queda libre para incluirse en W23.
- **Multi-obra**: una estimación combina tareas de N obras del mismo
  contratista. Una estimación = 1 contratista, varias obras.
- **Retención 5%**: estándar mexicano (formato Beto). Se acumula hasta
  fin de obra (libración manual v2 — no en MVP).
- **Cadencia**: semanal, cierre miércoles, pago jueves. Pero el campo
  es `fecha_cierre` (DATE) — no se asume strict lun-dom; el gerente
  puede cerrar cualquier día.
- **Generación a demanda**: el gerente clickea "Nueva estimación →
  contratista X → todas sus pendientes hasta hoy". No cron automático
  (Sprint 6 opcional si Beto lo pide).

**Estados** (5):

```
[borrador] → aprobar → [aprobada] → registrar factura → [facturada]
                                                          → registrar pago → [pagada]
[borrador|aprobada] → cancelar → [cancelada]   (libera tareas)
```

- `borrador`: gerente la generó, está revisando. Tareas tentativamente
  reservadas. Editable: agregar/quitar tareas, cambiar fecha cierre.
- `aprobada`: gerente revisa y aprueba. Se envía PDF + email al
  contratista pidiendo factura. Tareas siguen reservadas pero no
  editable el contenido.
- `facturada`: contratista entregó factura. Se captura URL/folio.
  Lista para pagar.
- `pagada`: pago efectuado. Tareas asociadas **locked** (no des-palomeo,
  no borrado, salvo override dirección).
- `cancelada`: se rechaza por error. Tareas vuelven a "pendientes de
  pago" y entran a próxima estimación.

## RBAC (3 roles nuevos)

| Rol                       | Ver estimaciones                           | Crear/aprobar | Registrar pago | Override post-pago |
| ------------------------- | ------------------------------------------ | ------------- | -------------- | ------------------ |
| `supervisor_construccion` | propias (donde es supervisor de las obras) | —             | —              | —                  |
| `gerente_construccion`    | todas DILESA                               | ✓             | ✓              | —                  |
| `direccion`               | todas DILESA                               | ✓             | ✓              | ✓                  |

Sub-slugs:

- `dilesa.construccion.estimaciones` (read/write) → gerente + dirección
- `dilesa.construccion.estimaciones.admin` → solo dirección

## Sprints

### Sprint 1 — Schema base + RPC generación

- ADR del modelo (estados, lock, retención, fórmula de fecha_pago_programado)
- Migración: `dilesa.estimaciones` + `dilesa.estimacion_tareas` con check
  constraints + RLS + índices + UNIQUE(tarea_terminada_id)
- Vistas SQL: `v_tareas_pendientes_de_pago`, `v_estimaciones_resumen`
- Función SQL `dilesa.fn_generar_estimacion_borrador(contratista_id, fecha_cierre)`
  → crea estimacion en `borrador` + inserta todas las tareas pendientes
  del contratista hasta `fecha_cierre`. Devuelve `estimacion_id`.
- Función SQL `dilesa.fn_tarea_terminada_esta_pagada(tarea_terminada_id)`
  → bool helper para el lock del trigger.

### Sprint 2 — RBAC + lock en palomeo inline

- Migración: agregar `supervisor_construccion`, `gerente_construccion`,
  `direccion` a `core.roles` (si no existen) + módulos en `core.modulos`.
- Backfill permisos: Beto/Alejandra/Michelle a sus respectivos roles.
- Modificar `app/dilesa/construccion/[id]/page.tsx`: el handler
  `desPalomearTarea` valida primero con `fn_tarea_terminada_esta_pagada`
  → si está en estimación pagada, muestra error "tarea ya pagada en
  estimación EST-2026-W22-MAYA — no se puede modificar. Pide a
  dirección si necesitas hacer cambio."
- Sub-slug check para el botón "Generar estimación" (solo gerente+).

### Sprint 3 — UI lista + detalle estimación

- Nueva tab "Estimaciones" en hub Construcción (5° tab)
- `/dilesa/construccion/estimaciones` — lista filtrable por
  contratista, estado, semana. Columnas: código, contratista, fecha
  cierre, monto neto, estado, días desde cierre.
- `/dilesa/construccion/estimaciones/[id]` — detalle con:
  - Header: código + contratista + monto neto + estado badge
  - Desglose por obra (acordeón): unidad + tareas (nombre + fecha
    - monto bruto) + subtotal por obra
  - Footer: monto bruto · retención 5% · monto neto · audit info
  - Botones de transición de estado según rol

### Sprint 4 — UI generar + flujo de cierre

- `/dilesa/construccion/estimaciones/nueva` — form:
  1. Selecciona contratista
  2. Selecciona fecha de cierre (default = hoy)
  3. Preview de tareas pendientes que se incluirán (lista chequeable
     — gerente puede des-marcar tareas que no quiera incluir esta vez)
  4. Submit → llama `fn_generar_estimacion_borrador` → redirige a
     detalle del borrador para revisión
- En detalle del contratista (existente): botón "Nueva estimación" +
  KPI "Pendiente de pago: $X" (suma de v_tareas_pendientes_de_pago)

### Sprint 5 — PDF + email contratista

- Template PDF en `lib/pdf/estimacion-template.tsx` (estilo Coda):
  - Header DILESA + datos del contratista (razón social, RFC,
    domicilio fiscal)
  - Tabla desglosada por obra: unidad + tareas + montos
  - Totales: bruto, retención 5%, neto
  - Pie: solicita factura por monto neto, datos para emitir factura
- API route `/api/dilesa/estimaciones/[id]/pdf` → returns PDF stream
- Botón "Aprobar y enviar al contratista" en detalle estado=borrador →
  cambia estado a `aprobada` + envía email Resend con PDF adjunto +
  template de email "favor de prepare factura por $X y enviar a
  pagos@dilesa.mx".
- Botón "Registrar factura recibida" en estado=aprobada → captura URL/folio.
- Botón "Marcar como pagada" en estado=facturada → captura referencia
  bancaria + fecha + transiciona a `pagada` → dispara el lock en cascada.

### Sprint 6 (opcional) — Migración histórica de Coda

- Si Beto lo pide, importar estimaciones pagadas históricas de Coda
  para tener KPIs históricos de pagos por contratista.
- Mapeo Coda → BSOP de la tabla "Estimaciones" / "Pagos".
- Marca todas con `estado='pagada'` + `coda_row_id` para idempotencia.

## Decisiones registradas

- **2026-05-25** (Q1): cadencia semanal "cierre miércoles, pago jueves",
  pero el campo es `fecha_cierre DATE` libre (no enum). El gerente
  cierra a demanda; el sistema no impone día. (Why: Beto confirmó este
  flujo operativo en chat; el campo libre permite cierres ad-hoc en
  semanas atípicas.)
- **2026-05-25** (Q2): UNIQUE(tarea_terminada_id) en estimacion_tareas.
  Una tarea solo entra a UNA estimación. Si no se incluyó esta semana,
  queda libre para la próxima. (Why: blinda duplicación de pago;
  simplifica el modelo).
- **2026-05-25** (Q3): multi-obra por estimación. Una estimación = 1
  contratista, N obras. (Why: refleja realidad operativa — un
  contratista trabaja simultáneamente en varias viviendas y cobra
  todo junto.)
- **2026-05-25** (Q4): retención 5% (no 10%) — convención DILESA. Campo
  `retencion_pct` editable por estimación por si hay excepciones.
- **2026-05-25** (Q5): generar PDF + enviar email automático al
  aprobar. Solicita factura por monto neto. (Why: cierra el loop de
  comunicación con el contratista sin acción manual extra; libera al
  gerente de mandar emails uno por uno.)
- **2026-05-25** (lock): tarea pagada NO se puede des-palomear ni
  borrar excepto dirección con override explícito. Patrón: trigger
  `BEFORE DELETE/UPDATE` en `construccion_tareas_terminadas` que llama
  `fn_tarea_terminada_esta_pagada` + verifica rol. (Why: integridad
  financiera; si pagaste una tarea no puedes desaparecerla del log.)

## Bitácora

- **2026-05-25** — Promovida a iniciativa formal tras Q&A con Beto.
  Planning doc creado + fila en INITIATIVES.md. Próximo: Sprint 1.

## Riesgos / open topics

- **R1**: ¿Qué pasa con tareas terminadas de obras `cancelada`? Asumo
  que NO entran a `v_tareas_pendientes_de_pago` (la obra cancelada
  cierra su ciclo). Confirmar con Beto en Sprint 1.
- **R2**: ¿Cómo se libera la retención acumulada? En Coda quizás
  manual al cerrar obra. v1 NO incluye liberación — queda como
  "saldo retención" visible en detalle del contratista. v2 si Beto
  pide.
- **R3**: Estimaciones con tareas de obras de varios proyectos —
  validar que el desglose por obra (con su proyecto) sea legible.
- **R4**: Email Resend — pendiente confirmar template de remitente
  (¿pagos@dilesa.mx?) y dominio verificado.

## Métricas de éxito

1. **Cierre operativo completo en BSOP**: Beto y Alejandra dejan de
   usar Coda para estimaciones después del primer ciclo completo
   (miércoles → jueves).
2. **0 inconsistencias financieras**: cero tareas pagadas que se
   des-palomeen accidentalmente (el lock funciona).
3. **PDF aceptable**: contratistas reciben el PDF y mandan factura sin
   pedir aclaraciones de formato.
4. **Audit trail completo**: cualquier pago se puede trazar de la
   estimación al user que la aprobó, al user que registró pago, a la
   referencia bancaria.
