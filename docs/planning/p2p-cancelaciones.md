# Iniciativa — Cancelación con motivo en el P2P

**Slug:** `p2p-cancelaciones`
**Empresas:** todas (golden DILESA; el patrón es transversal al ciclo P2P)
**Schemas afectados:** `dilesa` (`obra_estimaciones`, `contratos_construccion`), `erp`
(`recepciones`, y uniformar `requisiciones`/`cotizaciones`/`ordenes_compra`/
`presupuesto_partidas`/`facturas`/`cxp_pagos`)
**Estado:** in_progress
**Dueño:** Beto
**Creada:** 2026-06-07
**Última actualización:** 2026-06-07 (promovida + arranca Fase 1)

## Problema

En el ciclo de compras y pagos (P2P) la capacidad de **deshacer una captura
errónea** está a medias e inconsistente. Hoy:

- **Sí cancelan/eliminan:** requisición, cotización, orden de compra, partida del
  costeo, factura CxP, pago CxP.
- **NO se pueden quitar:** estimación de obra, contrato de obra, recepción.

Además la nomenclatura está dispareja ("Cancelar" deja el registro visible con
estado en OC/factura/pago; "Eliminar" lo oculta con `deleted_at` en
requisición/cotización/partida), y ninguna pide **motivo** para auditoría.

Resultado: si capturas mal un contrato, una estimación o una recepción, te quedas
con basura que no puedes corregir desde la UI (hay que ir a SQL).

## Outcome esperado

1. Toda entidad del P2P se puede **cancelar con motivo** desde la UI, dejando el
   registro **visible** con badge "Cancelado" + quién/cuándo/por qué (audit trail).
2. **Gating:** puede cancelar un **admin**, o **quien capturó** el registro
   mientras **no tenga consecuencias**. (Los registros históricos sin
   `creado_por` solo los cancela un admin.)
3. **Bloqueo con mensaje** cuando el registro ya movió dinero o tiene
   dependencias (hijos): el sistema explica qué hay que deshacer primero.
4. Patrón **uniforme** en las 3 entidades que faltan + motivo en las que ya
   cancelan.

## Decisiones registradas (cerradas con Beto, 2026-06-07)

- **D1 — Cancelar, no eliminar.** El registro cancelado **queda visible** con
  estado "Cancelado" + `motivo_cancelacion`. No se borra físicamente. Patrón
  canónico (en vez de ocultar con `deleted_at`).
- **D2 — Gating: admin o quien capturó sin consecuencias.** Se agrega `creado_por`
  donde falte. Históricos (sin `creado_por`) → solo admin.
- **D3 — Bloquear con mensaje ante dependencias/efecto financiero.** No se cancela
  en cascada; se bloquea y se indica qué deshacer primero.

## Patrón canónico (columnas + RPC)

A cada tabla cancelable se agregan: `cancelada_at timestamptz`,
`cancelada_por uuid`, `motivo_cancelacion text`, y `creado_por uuid` (nullable) si
no existe. Un registro con `cancelada_at IS NOT NULL` está cancelado (visible,
excluido de los cálculos de saldo/comprometido/ejercido).

Cada entidad tiene su RPC `*_cancelar(p_id, p_motivo)` que: valida no-cancelado,
valida el gating (admin OR `creado_por = auth.uid()`), valida las reglas de
bloqueo de su entidad, y marca la cancelación. UI compartida:
`<CancelarConMotivoDialog>`.

### Reglas de bloqueo por entidad

| Entidad               | Cancelable si…            | Bloquea si…                                  |
| --------------------- | ------------------------- | -------------------------------------------- |
| Estimación de obra    | sin factura CxP activa    | tiene factura → "cancela la factura primero" |
| Contrato de obra      | sin estimaciones activas  | tiene estimaciones → "cancélalas primero"    |
| Recepción             | la OC no está facturada   | hay factura ligada a la OC                   |
| Partida (Costeo)      | sin comprometido/ejercido | tiene movimiento                             |
| (las que ya cancelan) | —                         | sus reglas actuales + motivo                 |

## Alcance v1 — Fases

- **Fase 1 — Base + estimación.** Patrón canónico + `<CancelarConMotivoDialog>` +
  cancelar estimación (RPC + UI en `obra-contrato-detalle`, badge + excluir del
  saldo y del costeo) + `creado_por` en altas nuevas.
- **Fase 2 — Contrato de obra.** Cancelar contrato (bloquea con estimaciones;
  libera comprometido en `v_partida_control`). UI en el detalle.
- **Fase 3 — Recepción.** Revertir recepción (ajusta `cantidad_recibida`/ejercido;
  bloquea si OC facturada).
- **Fase 4 — Uniformar.** Motivo de cancelación en requisición/cotización/OC/
  partida/factura/pago (reusar el diálogo).

## Fuera de alcance v1

- Re-trabajar las entidades que ya cancelan para migrar de `deleted_at` a estado
  visible (más allá de agregar motivo) — se evalúa si la inconsistencia molesta.
- Cancelación en cascada (D3 lo descarta: se bloquea).

## Riesgos / decisiones abiertas

- **R1 — Cambiar de `deleted_at` a `cancelada_at` exige ajustar los cálculos** que
  suman cada entidad (saldo del contrato, pagado en costeo, comprometido/ejercido
  en `v_partida_control`) para excluir canceladas. Se hace por entidad en su fase.
- **R2 — Históricos sin `creado_por`.** Solo admin podrá cancelarlos; aceptado.

## Bitácora

(append-only)

### 2026-06-07 — Promoción + arranque (modo autónomo)

Iniciativa promovida tras observar Beto que faltaba poder cancelar en el P2P.
Decisiones D1-D3 cerradas. Diagnóstico: 6 entidades ya cancelan, 3 faltan
(estimación, contrato, recepción); falta `creado_por` en las tablas de obra.
Arranca Fase 1 (base + estimación). Migraciones como archivo, aplicadas con
cuidado (dry-run + repair); código/UI con auto-merge al verde.
