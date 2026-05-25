# ADR-032 — Modelo de Construcción DILESA

**Status**: Accepted
**Date**: 2026-05-24
**Initiative**: [dilesa-construccion](../planning/dilesa-construccion.md)
**Schemas**: `dilesa`, `erp`

## Contexto

El módulo de Ventas DILESA (Sprint 7a/7b) opera con asunciones manuales
sobre qué unidades están disponibles porque no existe módulo de
Construcción en BSOP. El bug se materializó durante las pruebas del
piloto Sprint 7c (captura por fase): la dropdown de unidad disponible
en el form de Nueva Solicitud muestra "M1-L3-LDLE · 655.77m²" sin el
sufijo del prototipo porque las 1,590 unidades importadas no tienen
`producto_id` asignado.

En Coda, **el prototipo se asigna al arrancar construcción** (no en
inventario base ni por el vendedor), y la unidad aparece como
disponible para venta **automáticamente al cruzar 20% de avance**.

Esta ADR formaliza el modelo BSOP para Construcción, replicando la
estructura operativamente validada de Coda con cambios estructurales
que aprovechan SQL.

## Decisión

### D1 — Pivot central: `dilesa.construccion`

Una fila por **arranque de construcción** = (unidad × prototipo ×
contratista). El identificador de Coda es `M13-L1-LDS-RMA-MAYA` (lote

- prototipo + contratista key). En BSOP es UUID + columnas separadas
  con FKs claros.

Reemplaza la columna `Construcción por Lote` de Coda (47 cols con
muchas calculadas). En BSOP solo guardamos los campos físicos limpios;
los derivados son SQL functions / vistas.

### D2 — Contratistas en `erp.personas` + satélite

Los contratistas (Personas Físicas o Morales) viven en `erp.personas`
con `tipo='contratista'` (nuevo valor del CHECK). Los 37 campos
específicos de DILESA (REPSE, retención 5%, KPIs, abreviación, etc.)
en `dilesa.contratistas_datos` (1:1 con `erp.personas`).

**Por qué no tabla 100% en `dilesa`**:

- Mantiene la convención de "personas son cross-empresa" (igual que
  proveedores y clientes).
- El día que ANSA u otra empresa contrate al mismo contratista, no
  hay que migrar.
- Datos básicos (nombre, RFC, domicilio, teléfono, email) viven una
  sola vez.

### D3 — Avance % derivado, no capturado

```sql
fn_calcular_avance_construccion(construccion_id uuid) RETURNS numeric
  = SUM(plantilla_tareas.porcentaje_costo)
    WHERE plantilla_tareas.id IN (tareas_terminadas de esta construccion)
```

El avance refleja avance **financiero ponderado** (% de costo de las
tareas terminadas sobre el costo total del prototipo). Es la misma
fórmula que Coda usa hoy.

**No alternativas consideradas:**

- `count(tareas terminadas) / count(total)` → distorsiona: poner una
  puerta = colar una losa.
- Etapas con peso manual → duplica metadata; el peso ya vive en la
  plantilla por tarea.

### D4 — Trigger SQL "20% → disponible"

Cuando `dilesa.construccion.avance_pct` pasa de < 20 a ≥ 20:

- `dilesa.unidades.estado` ← `'en_construccion'` (estado válido del CHECK,
  que la UI de ventas considera disponible para asignar)
- `dilesa.unidades.producto_id` ← el del `construccion.producto_id`

Implementado como trigger AFTER INSERT/DELETE en
`construccion_tareas_terminadas` que recalcula avance + dispara
cambio de estado idempotente (solo si `unidades.estado='planeada'`).

Esto resuelve el bug del prototipo en el form de venta nueva sin
intervención manual.

### D5 — CSV strings → JOINs reales

Coda guarda "Tareas Pendientes" y "Tareas Terminadas" como strings
concatenados con comas (300+ tareas en una celda). En BSOP esto vive
como `dilesa.construccion_tareas_terminadas` (append-only log) con
FK a la tarea. Las tareas pendientes son derivadas:
`plantilla_tareas WHERE id NOT IN (terminadas)`.

### D6 — Columnas calculadas → vistas SQL

`construccion_summary` (vista) con: avance_pct, dias_transcurridos,
dias_retraso, efectividad, mo_ejecutado, mo_por_ejecutar,
fecha_proyectada_terminar, dias_sin_avance. Una sola fuente de verdad;
no hay columnas físicas que puedan desincronizarse.

### D7 — Planos del prototipo en JSONB

Coda tiene 14 columnas de planos (`Plano Arquitectónico Planta Baja`,
`Plano Ejecutivo Acabados`, etc.). En BSOP:

```sql
ALTER TABLE dilesa.productos ADD COLUMN planos JSONB DEFAULT '{}';
-- Estructura:
-- {
--   "arq_planta_baja": "https://.../plano.pdf",
--   "arq_planta_alta": "https://...",
--   "ej_desplantes": "https://...",
--   ...
-- }
```

Permite agregar planos nuevos sin migración. Si un día se necesita
versionado, se agrega `planos_historico JSONB[]`.

### D8 — Contratos N:M con construcciones

Un contrato con un contratista puede cubrir N lotes (en Coda, la
columna "ID Construcción" del contrato es un CSV de hasta 30+ IDs).
En BSOP:

- `dilesa.contratos_construccion` (cabecera: contratista_id, valor,
  fianzas, fecha)
- `dilesa.contrato_lotes` (N:M: contrato_id × construccion_id)

## Alternativas consideradas

**A) Tabla única `dilesa.obras` con todo**: descartada — replica
columnas-CSV de Coda en BSOP, pierde el beneficio de JOINs.

**B) Contratistas en tabla DILESA-only**: descartada — duplica datos
básicos si el contratista también es proveedor de otra empresa.

**C) Avance % capturado manualmente**: descartada — pierde la fuente
única de verdad. El log de tareas terminadas debe ser autoritativo.

**D) Sin trigger, con captura manual de "disponible para venta"**:
descartada — el flujo de Coda funciona porque es automático;
duplicaríamos el trabajo del supervisor.

## Consecuencias

**Positivas**:

- El bug del prototipo en venta nueva se resuelve solo.
- Captura única (tareas terminadas) → múltiples derivados (avance,
  costo MO, fechas proyectadas, disponibilidad).
- Modelo escala a contratistas cross-empresa sin migrar.
- Reportes de KPIs por contratista nativos (efectividad, días sin
  avance, MO pagada vs pendiente).

**Negativas**:

- 8 tablas nuevas + 1 vista + 2 funciones + 1 trigger. Schema más
  grande (pero proporcional al dominio).
- El cálculo de avance requiere JOIN con plantilla_tareas en cada
  recálculo. Costo amortizable con índices + cache de avance
  pre-calculado en `construccion.avance_pct`.
- Migración desde Coda de TODO el histórico (~750k filas estimadas
  de `tareas_terminadas`) requiere batching cuidadoso.

**Neutras**:

- El trigger es idempotente (solo dispara si `unidades.estado='planeada'`);
  no hay riesgo de loops.

## Validación post-Sprint 2

Spot-check de 5 obras en `construccion` migradas: el avance %
calculado por BSOP coincide con el avance que muestra Coda.

## Referencias

- Iniciativa: `docs/planning/dilesa-construccion.md`
- Mapeo Coda → BSOP (a crear en Sprint 2): `docs/planning/dilesa-construccion-mapeo-coda.md`
- Tablas Coda exploradas: `scripts/explore-dilesa-construccion-coda.ts`
  → `/tmp/dilesa-construccion-coda.json`
