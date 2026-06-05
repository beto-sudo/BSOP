# ADR-042 — El contrato de obra como compromiso de una partida del presupuesto

**Estado:** Aceptado · Fase 1 (DB) aplicada a prod 2026-06-05 (migración `20260605190000`)
**Fecha:** 2026-06-05
**Iniciativas:** `dilesa-compras` (control presupuestal de 3 capas, D1) ∩ `dilesa-contratos-obra` (contratos + estimaciones) ∩ `cxp` (factura → pago)
**Decisión registrada como:** D15 de `dilesa-compras`

## Contexto

DILESA terminó con **dos vistas del mismo gasto de obra que nunca convergieron**:

- **Costeo por partidas** — `erp.presupuesto_partidas` + `erp.v_partida_control`
  (iniciativa `dilesa-compras`): la verdad del costo por concepto, con control de
  3 capas `comprometido → ejercido → pagado` y `disponible = aprobado −
comprometido`. Hoy `comprometido` lo mueve la OC; `ejercido` la recepción + las
  facturas directas (ADR-041); `pagado` los pagos de CxP.
- **Contratos de obra** — `dilesa.contratos_construccion` + `dilesa.obra_estimaciones`
  (iniciativa `dilesa-contratos-obra`): el compromiso con cada contratista de
  mano de obra y sus avances, con el puente a CxP definido en ADR-039
  (estimación → factura de egreso `obra_estimacion_id`).

Ambos se cargaron por separado desde los Excel (RESUMEN vs hojas por frente) y
**no se ligan**: 302 contratos, **0** partidas con `contrato_id`, **0** facturas
con `obra_estimacion_id`. La columna `presupuesto_partidas.contrato_id` existe
pero nunca se pobló (0/128 en el histórico). Resultado: el gasto de **mano de
obra** (contratos) no aparece en el control presupuestal por partida — el ciclo
de obra queda a medias respecto al outcome de `dilesa-compras` (control de 3
capas de **todo** el gasto del proyecto).

## Decisión

El **presupuesto por partidas es el centro**. Una partida se ejerce de dos formas
simétricas; el contrato de obra es a la mano de obra lo que la OC es a los
materiales:

|                    | Materiales / servicios | Mano de obra             |
| ------------------ | ---------------------- | ------------------------ |
| Compromiso         | Orden de Compra        | **Contrato de obra**     |
| Devengo (ejercido) | Recepción / factura    | **Estimación → factura** |
| Pago               | CxP                    | CxP                      |

1. **Contrato 1:1 partida** (decisión de Beto, 2026-06-05). Cada contrato de obra
   se liga a **exactamente una** partida del presupuesto, vía una columna nueva
   **`dilesa.contratos_construccion.partida_id`** (FK → `erp.presupuesto_partidas`,
   nullable, cross-schema `dilesa → erp` — mismo patrón que
   `presupuesto_partidas.proyecto_id`). Una partida puede tener N contratos
   (relación contrato→partida N:1), pero un contrato apunta a una sola partida.
   **NO** se usa `presupuesto_partidas.contrato_id` (esa dirección implica
   contrato→N partidas, lo contrario de lo elegido); queda en desuso.

2. **El contrato compromete su partida.** Se extiende
   `erp.v_partida_control.comprometido` para sumar, además de las OC, el
   **`valor_total`** de los contratos activos ligados a la partida:

   ```
   comprometido(partida) = Σ OC (enviada/parcial/cerrada)  +  Σ contratos activos por partida_id
   ```

   El `disponible = aprobado − comprometido` alerta si el contrato excede el
   presupuesto de la partida (sobre-contratación). No hay doble conteo: el
   contrato compromete (su `valor_total`), las estimaciones-factura ejercen — son
   capas distintas.

3. **La estimación hereda la partida del contrato** (decisión de Beto). El RPC de
   emisión pendiente de ADR-039 (`erp.cxp_factura_desde_estimacion`) pobla, además
   de `obra_estimacion_id`, el **`partida_id`** = la partida del contrato. La
   factura de la estimación (sin OC, con partida) suma a `ejercido` + `pagado` por
   el **modelo híbrido** ya cableado (ADR-041) — sin nueva lógica de vista para el
   ejercido.

4. **El contrato se origina desde el presupuesto.** Se replantea el alta de
   contrato: al crearlo se **elige la partida del costeo** que cubre (selector
   agrupado etapa›capítulo, reusa `buildPartidaIndex`). El contrato consume una
   partida existente; si el concepto no está presupuestado, se crea primero en
   Costeo (consistente con D12 "siempre hay partida").

## Consecuencias

- El control de 3 capas refleja **todo** el gasto del proyecto: compras (OC +
  gasto directo) **y** mano de obra (contratos + estimaciones). Cierra el outcome
  #2 de `dilesa-compras`.
- Desde Costeo, cada partida muestra comprometido/ejercido/pagado/disponible sin
  importar el canal; desde el contrato se ve su partida y su avance vs presupuesto.
- Reúsa ADR-039 (estimación → factura) y ADR-041 (ejercido híbrido) sin
  re-modelarlos: lo único nuevo es `contratos_construccion.partida_id`, el
  `comprometido` extendido en la vista, y el `partida_id` en el RPC de emisión.
- **No afecta vivienda ni otras empresas**: el `partida_id` es nullable; los
  contratos sin partida (o de otras empresas) se comportan igual que hoy.
- El binding 1:1 puede quedar corto si un frente real cubre varios conceptos del
  catálogo; se evalúa evolucionar a N partidas (con desglose de estimación por
  partida) si la operación lo exige. Por ahora, 1:1 + partidas más gruesas.

## Alternativas consideradas

- **Contrato → N partidas** (un contrato agrupa varias partidas vía
  `presupuesto_partidas.contrato_id`). Rechazada por Beto para v1: obliga a
  distribuir el `valor_total` entre partidas y a desglosar cada estimación por
  partida. El 1:1 es más simple y suficiente.
- **Dejar el contrato fuera del control de partidas** (solo su saldo propio
  `valor_total − Σ estimaciones`, como hoy). Rechazada: deja el costeo ciego al
  mayor gasto del desarrollo (urbanización por contrato) y no cierra el control
  de 3 capas.
- **El contrato como un tipo de OC.** Rechazada: el contrato de obra tiene
  anticipo, retención de garantía y estimaciones por avance — semántica distinta
  de la OC; forzarlo a OC ensucia ambos modelos (ya separado en D8).

## Ejecución (sprint, no en este ADR)

Fases tentativas (cada una su PR; migraciones con OK de Beto):

1. **DB** ✅ (aplicada 2026-06-05, migración `20260605190000`) — `contratos_construccion.partida_id`
   (FK → `erp.presupuesto_partidas`, nullable, `ON DELETE SET NULL`) + índice parcial +
   `v_partida_control.comprometido` extendido (`Σ OC + Σ contratos activos por partida_id`,
   filtrado por `empresa_id`). Aditivo puro (0 contratos ligados hoy). Llega vía el sprint
   Cotizaciones (RFQ) como su Fase 0, por ser prerrequisito de la adjudicación a contrato.
2. **UI alta de contrato** — selector de partida al crear/editar el contrato.
3. **Emisión a CxP** — RPC `cxp_factura_desde_estimacion` poblando `partida_id`
   (cierra también el pendiente de ADR-039) + UI "Emitir a CxP" que ya existe.
