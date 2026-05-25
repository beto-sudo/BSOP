# Mapeo Coda → BSOP — Módulo Construcción DILESA

> **Sprint 2** de `dilesa-construccion`. Documenta cómo cada columna
> de cada tabla en Coda se mapea al schema BSOP. Los scripts de
> importación (`scripts/import_dilesa_construccion_*.ts`) implementan
> este mapeo.

**Coda doc**: `ZNxWl_DI2D`
**Tablas exploradas**: ver `scripts/explore-dilesa-construccion-coda.ts`

---

## Orden de importación (respeta FKs)

1. **catálogos** (sin dependencias entre sí):
   - Etapas de Construcción → `dilesa.etapas_construccion`
   - Tareas de Construcción → `dilesa.tareas_construccion`
   - Plantilla Tareas → `dilesa.plantilla_tareas` (FK productos + tareas + etapas)
   - Planos del prototipo → `dilesa.productos.planos JSONB` (in-place)
2. **contratistas** → `erp.personas` (tipo='contratista') + `dilesa.contratistas_datos`
3. **contratos** → `dilesa.contratos_construccion`
4. **construcción** (pivot central) → `dilesa.construccion` (FK unidades + productos + contratistas + contratos)
5. **tareas terminadas** (log) → `dilesa.construccion_tareas_terminadas`

---

## 1. Etapas de Construcción · `grid-CThW1hcfYn` → `dilesa.etapas_construccion`

| Coda               | BSOP             | Notas                                       |
| ------------------ | ---------------- | ------------------------------------------- |
| Etapa Construcción | `nombre`         | PRELIMINARES, CIMENTACION, ALBAÑILERIA, ... |
| Orden de Etapa     | `orden`          | int 1..N                                    |
| Costo Plantilla    | (descartado)     | calculado en Coda; en BSOP es derivado      |
| Porcentaje         | (descartado)     | derivado del SUM de plantilla_tareas        |
| Dias               | `dias_estimados` | int default 0                               |

**Dedup**: `(empresa_id, nombre)` UNIQUE — etapas únicas por nombre.

---

## 2. Tareas de Construcción · `grid-w2cUreZ1mG` → `dilesa.tareas_construccion`

| Coda                  | BSOP         | Notas                                |
| --------------------- | ------------ | ------------------------------------ |
| Tarea de Construccion | `nombre`     | Diccionario de tareas — ~500 entries |
| Fecha Carga           | (descartado) | metadata Coda, no se usa             |

**Dedup**: `(empresa_id, nombre)` UNIQUE. Si hay duplicados ortográficos en Coda, deduplicamos a la primera ocurrencia y reportamos.

---

## 3. Plantilla Tareas · `grid-ger9cXNCKh` → `dilesa.plantilla_tareas`

| Coda                     | BSOP                 | Notas                                                            |
| ------------------------ | -------------------- | ---------------------------------------------------------------- |
| Tarea Construcción       | `tarea_id` (FK)      | resuelto por nombre                                              |
| Etapa Construcción       | `etapa_id` (FK)      | resuelto por nombre                                              |
| Prototipo                | `producto_id` (FK)   | resuelto por nombre del producto (formato `LDLE-ISC`, `LDS-RMA`) |
| Porcentaje de Costo      | `porcentaje_costo`   | "0.2100%" → 0.0021 (decimal)                                     |
| Costo MO                 | `costo_mo_plantilla` | numeric                                                          |
| Tiempo                   | `tiempo_dias`        | numeric                                                          |
| Etapa-Tarea Construcción | (descartado)         | concatenado calculado en Coda                                    |
| \*Termina                | (descartado)         | botón UI                                                         |
| Costo MO Plantilla       | (descartado)         | duplicado calculado                                              |

**Dedup**: `(producto_id, tarea_id, etapa_id)` UNIQUE.

**Validación post-import**: SUM(porcentaje_costo) por producto debería ser ~1.0 (100%). Reportar productos donde no sume.

---

## 4. Prototipos (planos) · `grid-iGIRvYfGUx` → `dilesa.productos.planos JSONB`

Las 14 columnas de planos del prototipo Coda se concentran en un único
JSONB `planos` en `dilesa.productos`. UPDATE in-place (las filas de
productos ya existen).

| Coda → BSOP key                                                            |
| -------------------------------------------------------------------------- |
| Plano Arquitectónico Planta Baja → `arq_planta_baja`                       |
| Plano Arquitectónico Planta Alta → `arq_planta_alta`                       |
| Plano Arquitectónico Cortes → `arq_cortes`                                 |
| Plano Arquitectónico Elevaciones → `arq_elevaciones`                       |
| Plano Arquitectónico Detalles Constructivos → `arq_detalles_constructivos` |
| Plano Ejecutivo Desplantes → `ej_desplantes`                               |
| Plano Ejecutivo Acabados → `ej_acabados`                                   |
| Plano Ejecutivo Carpinteria → `ej_carpinteria`                             |
| Plano Ejecutivo Canceleria → `ej_canceleria`                               |
| Plano Ejecutivo Herreria → `ej_herreria`                                   |
| Plano Ejecutivo Detalles → `ej_detalles`                                   |
| Plano Ejecutivo Plafones → `ej_plafones`                                   |
| Plano Ingenieria Estructural → `ing_estructural`                           |
| Plano Ingenieria Electrica → `ing_electrica`                               |
| Plano Ingenieria Hidráulica → `ing_hidraulica`                             |
| Plano Ingenieria Sanitaria → `ing_sanitaria`                               |
| Plano Ingenieria Gas → `ing_gas`                                           |

**Valor**: URL del plano en Coda (campo `firstUrl`). Si no hay plano, no se incluye la key en el JSONB.

**Match**: por `productos.nombre` (formato `LV-ISC`, `LDS-RMA`, etc.) ↔ Coda `ID Prototipo` o `name`.

Las otras 46 columnas de `Prototipos` (Valor Avaluo, KPIs, Inventario en Construcción, etc.) son calculadas/derivadas y no se importan — vivirán como vistas en BSOP.

---

## 5. Contratistas · `grid-b-HTXuSZp4` → `erp.personas` + `dilesa.contratistas_datos`

**A. `erp.personas`** (1 fila por contratista, `tipo='contratista'`):

| Coda        | BSOP                                           |
| ----------- | ---------------------------------------------- |
| Contratista | `nombre` (PF) o `nombre` con razón social (PM) |
| Telefono    | `telefono`                                     |
| email       | `email`                                        |
| RFC         | `rfc`                                          |

**B. `dilesa.contratistas_datos`** (1:1 con persona):

| Coda                                    | BSOP                               |
| --------------------------------------- | ---------------------------------- |
| (FK)                                    | `persona_id`                       |
| Abreviación                             | `abreviacion` (ej. 'MAYA', 'ROCA') |
| Persona Fisica o Moral                  | `persona_fisica_o_moral`           |
| Representante Legal                     | `representante_legal`              |
| REPSE                                   | `repse`                            |
| Registro Patronal                       | `registro_patronal`                |
| Domicilio                               | `domicilio` (blob)                 |
| Activo                                  | `activo`                           |
| (los demás 22 cols son KPIs/calculados) | (descartado, son derivados)        |

**Match para re-import**: por `rfc` (único en SAT); si no hay RFC, por `nombre` exacto.

---

## 6. Contrato de Construcción · `grid-OWReJ19erT` → `dilesa.contratos_construccion` + `dilesa.contrato_lotes`

**A. `dilesa.contratos_construccion`**:

| Coda                     | BSOP                                         |
| ------------------------ | -------------------------------------------- |
| ID Contrato Construcción | `codigo` (ej. '2026/2-DIE-ANA-CONTRATO#273') |
| Fecha Contrato           | `fecha_contrato`                             |
| Contratista              | `contratista_id` (FK, resuelto por nombre)   |
| Valor del Contrato       | `valor_total`                                |
| Fianzas                  | `fianzas_url` (firstUrl)                     |
| Fraccionamiento          | `proyecto_id` (FK, resuelto por nombre)      |
| Genera Contrato          | (descartado) — botón UI                      |

**Dedup**: `(empresa_id, codigo)` UNIQUE.

**B. `dilesa.contrato_lotes`** (N:M derivado del CSV "ID Construcción"):

La columna `ID Construcción` en Coda es CSV: `M13-L1-LDS-RMA-MAYA,M13-L2-LDS-RMA-MAYA,...`. Split por coma → 1 fila por par (contrato, construcción). El FK a `construccion_id` se resuelve por el `codigo` que viene del mismo split.

**Importante**: contratos se importan ANTES que construcción, pero `contrato_lotes` requiere construcción YA importada (FK). Por eso `contrato_lotes` se popula al final del Sprint 2 (después de construcción).

---

## 7. Construcción por Lote · `grid-CkajhVirlg` → `dilesa.construccion`

Tabla pivot central. 47 columnas en Coda; conservamos solo los campos físicos.

| Coda                                        | BSOP                             | Notas                                                              |
| ------------------------------------------- | -------------------------------- | ------------------------------------------------------------------ |
| ID Construcción                             | `codigo`                         | ej. 'M13-L1-LDS-RMA-MAYA'                                          |
| ID Inventario                               | (lookup)                         | match a `dilesa.unidades.identificador` para `unidad_id`           |
| ID Lote                                     | (validación)                     | parte del ID Inventario (sin sufijo de prototipo)                  |
| Prototipo                                   | `producto_id` (FK)               | resuelto por nombre del producto                                   |
| Contratista                                 | `contratista_id` (FK)            | resuelto por nombre                                                |
| Supervisor                                  | `supervisor_persona_id` (FK opc) | resuelto por nombre, opcional                                      |
| Fecha de Arranque🚧                         | `fecha_arranque`                 |                                                                    |
| Fecha Compromiso para Terminar              | `fecha_compromiso_terminar`      |                                                                    |
| Fecha Terminada🏁                           | `fecha_terminada`                |                                                                    |
| Fecha Seguro Calidad✅                      | `fecha_seguro_calidad`           |                                                                    |
| Fecha Extracción🔄                          | `fecha_extraccion`               |                                                                    |
| Fecha Paquete RUV📦                         | `fecha_paquete_ruv`              |                                                                    |
| Fecha DTU🔴                                 | `fecha_dtu`                      |                                                                    |
| CUV                                         | `cuv`                            | Clave Única de Vivienda                                            |
| Frente RUV                                  | `frente_ruv`                     |                                                                    |
| M² de Construcción                          | `m2_construccion`                |                                                                    |
| Precio MO x M²                              | `precio_mo_x_m2`                 |                                                                    |
| Valor Contrato MO                           | `valor_contrato_mo`              |                                                                    |
| MO Ejecutado                                | `mo_ejecutado`                   | snapshot al momento del import (real-time recalculado por trigger) |
| ID Contrato Construcción                    | (lookup para contrato_lotes)     | no es FK directo en construccion                                   |
| Proyecto                                    | (validación)                     | derivable de la unidad                                             |
| Avance%                                     | (descartado, calculado)          | trigger lo recalcula automáticamente al importar tareas terminadas |
| Tareas Pendientes/Terminadas/Construcción   | (descartado, calculadas)         | el log se importa después                                          |
| MO Por Ejecutar                             | (descartado)                     | derivado                                                           |
| Tiempo Transcurrido / Efectividad / Dias \* | (descartado)                     | derivados                                                          |
| DTU (boolean ✅)                            | (deriv. de fecha_dtu)            |                                                                    |

**Estado** se infiere:

- `fecha_terminada IS NOT NULL` → `'terminada'`
- `fecha_dtu IS NOT NULL` → `'dtu'`
- `fecha_seguro_calidad IS NOT NULL` → `'seguro_calidad'`
- `fecha_extraccion IS NOT NULL` → `'extraida'`
- else → `'en_progreso'` (o `'arrancada'` si no hay fecha_arranque)

**Match a unidades**: Coda `ID Inventario` (formato `M13-L1-LDS-RMA`) coincide directo con `dilesa.unidades.identificador`. Si no encuentra match, reporta y omite (no se inventa unidad).

**Conflicto con CHECK `construccion_unidad_uk UNIQUE`**: si Coda tiene 2 obras para la misma unidad (lote re-arrancado), solo importamos la más reciente. La vieja se marca `estado='cancelada'`.

---

## 8. Tareas Terminadas · `grid-fJSixLw1DF` → `dilesa.construccion_tareas_terminadas`

Log append-only — el más voluminoso (~750k filas estimadas).

| Coda                                                                            | BSOP                                                           |
| ------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| ID Construcción                                                                 | `construccion_id` (FK, resuelto por codigo)                    |
| Tarea Terminada                                                                 | `plantilla_tarea_id` (FK, ver lookup abajo)                    |
| Fecha Tarea Terminada                                                           | `fecha_terminada`                                              |
| Tiempo                                                                          | `tiempo_real_dias`                                             |
| Mano de Obra                                                                    | `mano_obra_pagada`                                             |
| Revisado Por:                                                                   | `revisado_por_persona_id` (FK opc, resuelto por nombre)        |
| Fecha Tarea Pagada                                                              | `fecha_pagada`                                                 |
| Contratista                                                                     | (validación, debe coincidir con `construccion.contratista_id`) |
| Duplicados / Row ID / Tiene Duplicados / Borrar / \*Elimina / Fecha Terminada🏁 | (descartado, metadata Coda)                                    |

**Lookup `plantilla_tarea_id`**: Coda "Tarea Terminada" tiene formato `ETAPA-Nombre de Tarea` (ej. `CIMENTACION-Trazo de Cimentacion`). Para resolver:

1. Split por primer `-` → etapa y nombre tarea
2. Match al producto vía `construccion.producto_id`
3. Encontrar `plantilla_tareas` WHERE producto_id = X AND etapa nombre = Y AND tarea nombre = Z

Si no encuentra match (tarea de otra plantilla o etiqueta no estándar), reportar y omitir.

**Dedup**: `(construccion_id, plantilla_tarea_id)` UNIQUE — una tarea solo puede aparecer 1 vez por construcción. Si Coda tiene duplicados (la col `Duplicados` los marca), tomar el primero.

**Batching**: para 750k filas, procesar por contrato (300-500 tareas por contrato), commit por batch. La columna `Tiene Duplicados` boolean de Coda ayuda a filtrar — los duplicados los omitimos.

**Trigger trampa**: el trigger `tg_construccion_avance` recalcula `construccion.avance_pct` en CADA insert. Para 750k inserts el costo es prohibitivo. **Estrategia**: temporalmente DISABLE el trigger durante el import (`ALTER TABLE ... DISABLE TRIGGER ...`), correr el bulk insert, REENABLE y luego ejecutar manualmente `UPDATE construccion SET avance_pct = dilesa.fn_calcular_avance_construccion(id)` por cada construccion — 1 UPDATE por obra (~5,000 max) en vez de 1 cálculo por tarea (750k).

---

## Validaciones post-import (Sprint 2 último paso)

1. **Conteos vs. Coda** (spot-check 5 obras al azar):
   - SELECT COUNT(\*) FROM dilesa.construccion → debe coincidir con # filas activas en Coda
   - SELECT COUNT(\*) FROM dilesa.construccion_tareas_terminadas → coincide con Coda
2. **Avance calculado vs. Coda** (5 obras al azar):
   - SELECT codigo, avance_pct FROM dilesa.construccion → debe coincidir ±1pp con Avance% de Coda
3. **Trigger funcional**:
   - INSERT manual de 1 tarea terminada en una construccion con avance 18% → debe pasar a ≥20 + unidad pasar a 'en_construccion'
   - DELETE de esa tarea → revertir
4. **Plantilla suma 100%**:
   - SELECT producto_id, SUM(porcentaje_costo) FROM plantilla_tareas GROUP BY producto_id
   - Cualquier producto con suma < 0.95 o > 1.05 → reportar y revisar

---

## Notas de operación

- **Idempotente**: cada script usa UPSERT por `coda_row_id` (siguiendo el patrón establecido en F2 del Sprint 6 de ventas). Re-correr el script salta lo ya importado.
- **Logging**: cada script imprime conteos (insertados, actualizados, skipped, errores) + lista de IDs problemáticos.
- **Storage de planos**: las URLs de Coda son externas (`codahosted.io`). NO se descargan a Supabase Storage en Sprint 2 — quedan como URLs externas en `productos.planos`. Migración a Storage privado en Sprint posterior (mismo patrón que el expediente de ventas Fase 4.5).
