# ADR-041 — `ejercido` cuenta gastos directos (factura con partida sin OC)

**Estado:** Aceptado
**Fecha:** 2026-06-05
**Iniciativas:** `dilesa-compras` (control presupuestal de 3 capas, D1/D14) ∩ `cxp` (factura de egreso = cuenta por pagar)
**Decisión registrada como:** D14 de `dilesa-compras`

## Contexto

El control presupuestal por partida de DILESA vive en la vista derivada
`erp.v_partida_control` (D1): por cada partida de `erp.presupuesto_partidas`
deriva `comprometido` (Σ OC enviada/parcial/cerrada), `ejercido` (devengado) y
`pagado` (Σ aplicaciones de pago a facturas con `partida_id`).

La definición original calculaba **`ejercido` únicamente desde las recepciones de
OC** (`Σ ordenes_compra_detalle.cantidad_recibida × precio`). Eso asume que todo
gasto pasa por el ciclo requisición → OC → recepción.

En la práctica hay **gastos autorizados y pagados fuera de ese proceso**: una
factura de proveedor que se pagó sin OC previa (compras urgentes, históricas, o
servicios contratados directo). Con el modelo P2P ya en producción, estos gastos
deben poder **registrarse, catalogarse a una partida y reflejarse en el control**
sin forzarlos artificialmente por requisición/OC.

`erp.facturas` ya soporta el caso: tiene `partida_id` (binding a presupuesto,
puesto por `dilesa-compras` Sprint 1) y `orden_compra_id` **nullable** (factura
sin OC). La capa `pagado` de la vista ya suma cualquier factura con `partida_id`.
El hueco está en `ejercido`: una factura directa sin OC sumaba a `pagado` pero
**no a `ejercido`**, dejando el control de 3 capas incoherente (un gasto pagado
que no aparece como ejercido).

## Decisión

**`ejercido` = recepciones de OC + facturas de egreso con partida y SIN OC**
(modelo híbrido). En la vista:

```
ejercido(partida) =
    Σ ordenes_compra_detalle.cantidad_recibida × precio   (recepciones de OC)
  + Σ facturas.total                                       (gastos directos)
      WHERE partida_id = partida
        AND orden_compra_id IS NULL          -- solo gastos directos
        AND flujo = 'egreso'
        AND cancelada_at IS NULL AND estado_cxp <> 'cancelada'
```

La condición **`orden_compra_id IS NULL`** es la que **evita el doble conteo**:
una factura que sí nace de una OC no se recuenta en `ejercido` —su recepción ya
lo hizo—; solo los gastos directos (sin OC) suman por la vía de la factura.

`comprometido`, `pagado` y `disponible` no cambian. Para un gasto directo,
`comprometido` queda en 0 (nunca hubo OC) y el gasto fluye
`ejercido → pagado` directamente.

## Alternativas consideradas

1. **`ejercido` factura-céntrico** (Σ todas las facturas, ignorar recepciones).
   Rechazada: rompería el ejercido de las OC recibidas-aún-no-facturadas (caso
   normal del flujo con OC) y obligaría a facturar para devengar.
2. **Dejar `ejercido` solo-OC y registrar el gasto directo en `gasto_real_total`
   (campo manual de la partida).** Rechazada: `gasto_real_manual` no liga a CxP
   (sin proveedor, sin factura, sin pago real, sin trazabilidad) y duplicaría la
   captura. Beto pidió explícitamente **ligarlo a CxP**.
3. **Forzar una OC "ficticia" por cada gasto histórico.** Rechazada: ensucia el
   módulo de Órdenes con OCs que nunca existieron y falsea el comprometido.

## Consecuencias

- Un gasto directo se registra como **factura de egreso ligada a la partida**
  (sin OC) + su **pago** en CxP, y aparece completo en el control
  (`ejercido` + `pagado`), con trazabilidad de proveedor/factura/pago.
- **No afecta a RDB ni a otras empresas**: la vista solo existe sobre
  `presupuesto_partidas` (presupuesto de obra de DILESA); RDB usa CxP sin
  partidas de proyecto.
- **No afecta el 3-way match de `cxp`**: ese match aplica a facturas _con_ OC;
  los gastos directos (sin OC) quedan fuera de él por diseño.
- La UI para asignar `partida_id` a una factura se construye aparte (Fase 2,
  drawer de factura en el módulo CxP compartido, aditivo y DILESA-first).
- Es un `CREATE OR REPLACE VIEW` puro: mismas columnas, sin cambio de contrato
  para los consumidores (`SCHEMA_REF` no cambia).
