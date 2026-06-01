# ADR-038 — Modelo de contratos de obra (vivienda + no-vivienda) y frontera con CxP

**Fecha:** 2026-06-01
**Estado:** Aceptado
**Iniciativa:** `dilesa-contratos-obra`

## Contexto

El módulo de Construcción DILESA solo modelaba **construcción de vivienda**:
`dilesa.contratos_construccion` ligado a lotes (`contrato_lotes`), avance por
plantilla de tareas del prototipo y estimaciones por tareas terminadas
(`dilesa.estimaciones`, ADR-033). Pero buena parte del gasto de obra del
desarrollo **no es vivienda**: urbanización (drenaje, agua, pavimentación,
cordón, electrificación…), obras de cabecera (barda, caseta, portón, plaza) y
tareas/trámites sueltos. Eso se controlaba en Excel por proyecto, sin sistema.

Se exploraron los Excel reales (`Proyecto LDLE.xlsx`, `Proyecto LDS.xlsx`): una
hoja **RESUMEN** (presupuesto previo/actualizado vs gasto real por concepto ×
etapa, con proveedor y factura) + hojas de detalle por frente (contrato con
anticipo y retención variables + estimaciones de etiqueta libre).

## Decisión

1. **Generalizar `contratos_construccion` con un `tipo`** (`vivienda` |
   `urbanizacion` | `obra_cabecera` | `tarea_menor`) en lugar de crear una tabla
   separada de contratos no-vivienda. La cabecera ya era casi genérica
   (`proyecto_id`, `contratista_id`, `valor_total`); solo lo específico de
   vivienda (`contrato_lotes`, avance por plantilla) queda condicionado al tipo.
   Se añaden `anticipo_pct`, `retencion_pct` (variables: vivienda 5% sin
   anticipo; urbanización suele 10% con anticipo 30/50/60%).

2. **Dos capas** para lo no-vivienda:
   - `dilesa.obra_presupuesto` — presupuesto vs gasto real por concepto × etapa
     (replica RESUMEN). Da el **costeo por proyecto** (CapEx del desarrollo).
   - `dilesa.obra_estimaciones` — estimaciones de **monto directo** por contrato
     (anticipo + numeradas + finiquito; etiqueta libre).

3. **Estimaciones de obra en tabla nueva, separada de `dilesa.estimaciones`.**
   La de vivienda (ADR-033) se liga a tareas terminadas; la de obra es monto por
   avance sin tareas. Mezclarlas contaminaría el flujo de avance de vivienda.

4. **IVA de frontera.** DILESA opera en franja fronteriza → IVA general **8%**;
   proveedores sin el estímulo facturan **16%** (excepción). Se modela
   `subtotal` / `iva` / `iva_tasa` / `total` y se **desglosa donde esté
   especificado**; un renglón sin desglose entra solo con su total y se completa
   al capturar la factura real (no se infiere una tasa fija). Consistente con
   `proveedores_tasa_iva` (migración 20260506233009).

5. **Frontera con CxP (ADR-037, subledger gemelo CxC/CxP).** El contrato de obra
   es el **compromiso**; el pago vive en CxP. En **Fase 2**, cada estimación /
   gasto real emite un cargo al subledger CxP (`erp`) contra el proyecto, y CxP
   lleva programación, aprobación, saldo y conciliación. **Fase 1 (v1)** lleva
   saldo simple (`valor_total − Σ estimaciones`) sin CxP, porque CxP aún está en
   desarrollo y hay dolor inmediato (todo en Excel).

## Consecuencias

- Se puede traspasar la info histórica de LDLE y LDS (RESUMEN + contratos +
  estimaciones) a BSOP.
- El costeo de urbanización/cabecera por proyecto alimenta el análisis
  financiero del desarrollo (Sprint 3).
- CxP se integra sin re-modelar el contrato (solo agregar la emisión del cargo).
- **Diferido:** desglose de partidas a nivel volumen × PU (los Excel no lo traen
  de forma uniforme); se evalúa si algún frente lo requiere.

## Alternativas consideradas

- **Tabla separada de contratos no-vivienda** — rechazada: duplica la cabecera
  y la lógica de estimaciones/retención; el `tipo` es más simple.
- **Mandar todo directo a CxP sin módulo de obra** — rechazada: un contrato de
  obra es más que una cuenta por pagar (alcance, partidas, retención de
  garantía, estimaciones por avance); CxP registra el pago, no el compromiso de
  obra.
