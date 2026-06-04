# ADR-040 — Catálogo de conceptos de compra y modelo de presupuesto unificado (cross-schema)

**Fecha:** 2026-06-04
**Estado:** Aceptado (catálogo, Sprint 0) · Dirección acordada para presupuesto (se ejecuta en Sprint 1 con OK puntual)
**Iniciativa:** `dilesa-compras`
**Relacionado:** ADR-038 (`obra_presupuesto`/`obra_estimaciones`), ADR-039 (puente obra→CxP), iniciativa `dilesa-proyectos-anteproyectos` (creó `proyecto_presupuesto_partidas`)

## Contexto

La iniciativa `dilesa-compras` centraliza el ciclo procure-to-pay y lo liga
(opcionalmente) a presupuestos de obra. Al arrancar el Sprint 0 el discovery
reveló dos hechos que obligan a una decisión de arquitectura:

1. **Hay dos modelos de presupuesto en `dilesa` que nunca se unificaron:**
   - `dilesa.obra_presupuesto` — **128 filas vivas** (Lomas de los Encinos
     $73.8M + Lomas del Sol $12.2M). Estructura `etapa · concepto · presupuesto
previo/actualizado · gasto_real (subtotal/iva/total) · proveedor_texto`.
     Creada por `dilesa-contratos-obra` (ADR-038), replica el RESUMEN de los
     Excel LDLE/LDS.
   - `dilesa.proyecto_presupuesto_partidas` — **0 filas (vacía)**. Modelo
     `partida · monto_estimado/aprobado/ejercido · estado · fuente`, creado por
     `dilesa-proyectos-anteproyectos` (Sprint 3) pero nunca poblado.

2. **El catálogo de conceptos** que `dilesa-compras` necesita (jerárquico,
   reutilizable entre proyectos) **no existe**. Los conceptos viven como texto
   libre en `obra_presupuesto.concepto` (93 distintos, con typos, sufijos de
   ejecución y el mismo concepto partido en MO/Material/Maquinaria).

`erp.*` es el schema **genérico/compartido** (lo usan las 5 empresas); el
presupuesto por obra hoy vive en `dilesa.*` (específico de empresa). Un FK
`erp → dilesa` acoplaría el schema genérico a uno de empresa.

## Decisión

### 1. Catálogo de conceptos en `erp` (Sprint 0 — firme)

`erp.conceptos_compra`: catálogo **jerárquico de 3 niveles** vía `padre_id`
self-FK (`nivel ∈ {etapa, capitulo, concepto}`), con `codigo` jerárquico
legible (`1`, `2.3`, `2.3.1`) y `empresa_id` (multi-empresa desde el inicio).
Vive en `erp` porque el ciclo de compras es compartido y el catálogo debe poder
encenderse en otras empresas (aunque su contenido sea por-empresa).

Sembrado para DILESA **normalizando** los 93 conceptos de `obra_presupuesto`
hacia ~3 etapas / ~18 capítulos / ~66 conceptos canónicos (sin typos ni sufijos
`(1era etapa)`/`(5 jornadas)`). El seed es la materialización del taller de
normalización con Beto (2026-06-04). La etapa **"Construcción"** del Excel se
nombra **"Construcción (plataformas)"** para no confundirla con la construcción
de vivienda (que va por contratos+estimaciones, ADR-033).

### 2. `tipo_insumo` es atributo de la partida/línea, NO del concepto

Un mismo concepto canónico (p. ej. "Red de drenaje sanitario") se presupuesta y
se compra en **Mano de obra Y Material Y Maquinaria**. Por eso `tipo_insumo`
(`mano_obra | material | maquinaria | derechos | tramite | servicio`) **no vive
en `erp.conceptos_compra`** — se captura en la **partida presupuestal** y en la
**línea de compra**. El catálogo guarda el concepto agnóstico; así se puede
sumar el costo total de un concepto (MO+Material+Maquinaria) y compararlo entre
proyectos. Decisión cerrada con Beto el 2026-06-04.

### 3. El gasto suelto no usa el catálogo

Las compras sin proyecto (papelería, mobiliario, servicios de oficina) fluyen
con `concepto_id` y `partida_id` nulos y descripción libre. El catálogo es
**solo de obra**; no se contamina con conceptos administrativos. Decisión
cerrada con Beto el 2026-06-04.

### 4. Presupuesto unificado en `erp` (Sprint 1 — dirección acordada, requiere OK puntual)

El presupuesto canónico se generaliza a `erp` (p. ej.
`erp.presupuesto_partidas`: `concepto_id` → catálogo, `proyecto_id`,
`tipo_insumo`, `monto_aprobado`, `estado`), de modo que las líneas de compra
liguen con un FK **dentro de `erp`** (sin cruzar a `dilesa`). Se **migran los
128 registros de `obra_presupuesto`** y se **jubila
`proyecto_presupuesto_partidas`** (vacía → migración barata, sin pérdida de
datos). Se coordina con `dilesa-contratos-obra` (activa, tiene UI de captura de
`obra_presupuesto`) para no romper su flujo. **No se ejecuta en Sprint 0**; se
cierra al inicio del Sprint 1 con OK puntual de Beto.

### 5. Control en 3 capas = vista derivada

`comprometido` (Σ OC activas ligadas a la partida), `ejercido` (Σ
recibido/facturado), `pagado` (Σ `cxp_pago_aplicaciones`) y `disponible` se
**derivan por vista** (`v_partida_control`), no por columnas mantenidas con
triggers. Sprint 1.

## Alternativas consideradas

- **Puente polimórfico en `dilesa`** (mantener `erp` puro; una tabla
  `dilesa.partida_documentos` que ligue partida ↔ documento de compra por
  `(tipo, id)`). Descartada: fragmenta el modelo, complica el rollup de las 3
  capas y el aislamiento, y deja `erp` sin saber de presupuestos (las líneas de
  compra no podrían validar saldo sin un join cross-schema). Generalizar a `erp`
  es más limpio **precisamente porque `proyecto_presupuesto_partidas` está
  vacía** y `obra_presupuesto` solo tiene 128 filas — el costo de migración es
  bajo y se hace una sola vez.
- **Dejar el presupuesto en `dilesa` y duplicar un catálogo por empresa.**
  Descartada: el catálogo y el ciclo de compras son compartibles; duplicar
  rompe la meta de componente compartido (D4).

## Consecuencias

- `erp` gana el dominio "catálogo de conceptos" ahora y "presupuesto" en Sprint
  1. El ciclo de compras liga a presupuesto con FKs internos de `erp`.
- Rollup de costo por concepto **entre proyectos** queda habilitado (mismo
  `concepto_id` en N proyectos).
- Toca `dilesa-contratos-obra` en Sprint 1 (migración de `obra_presupuesto` +
  re-apuntar su UI de captura). Riesgo coordinado, no en Sprint 0.
- `tipo_insumo` como atributo obliga a capturarlo al presupuestar/comprar (un
  campo más en partida y línea), a cambio de comparabilidad real.
- El seed del catálogo es editable (data, no schema): Beto puede afinar nombres
  de capítulos/conceptos sin migración nueva.
