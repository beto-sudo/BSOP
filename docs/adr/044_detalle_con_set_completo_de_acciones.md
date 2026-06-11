# ADR-044 — El detalle expone el set completo de acciones (DA1-DA4)

- **Status**: Accepted
- **Date**: 2026-06-11
- **Authors**: Beto, Claude Code
- **Companion to**: [ADR-018](./018_drawer_anatomy.md) / [ADR-026](./026_drawer_anatomy_polish.md) (anatomía del drawer), [ADR-009](./009_detail_page.md) (detail page), [ADR-008](./008_action_feedback.md) (confirmaciones)

---

## Contexto

Auditoría UX del 2026-06-11 (reporte de Beto sobre Compras DILESA): en
varios módulos, hacer clic en una fila abre un drawer de detalle que solo
muestra información, mientras las acciones del documento (autorizar,
generar OC, cancelar, aprobar pago, eliminar…) viven **únicamente** en el
menú ⋯ de la fila (`<RowActions>`) o en botones inline de la celda. El
usuario abre el detalle "para trabajar el documento" y se topa con que
debe cerrarlo y cazar el menú en el extremo derecho de la fila.

El barrido del repo encontró el anti-patrón en 6 superficies (requisiciones
y OC de Compras DILESA, pagos CxP, departamentos/puestos RH, stock RDB,
panel de captura de cotizaciones) y lo descartó en ~22 más que ya estaban
bien (acciones en el header/footer del drawer o en página de detalle
completa).

## Decisión

- **DA1 — Set completo en el detalle.** Toda superficie de detalle que
  abre el clic en fila (drawer o página) expone **todas** las acciones
  disponibles del documento, con los mismos gates de permiso y estado que
  cualquier otra superficie. Si la fila ofrece una acción, el detalle
  también.
- **DA2 — Ubicación canónica.** En `<DetailDrawer>`: acciones de workflow
  (autorizar, generar, aprobar, cerrar, cancelar) van en el `footer`
  (sticky); utilidades (imprimir, editar, procesar) pueden ir en el
  `actions` del header. En páginas de detalle: el header de la página.
- **DA3 — Quick actions complementarias, nunca exclusivas.** Los
  mini-botones de fila (completar tarea con un clic, aprobar pago inline)
  y el menú ⋯ se quedan — son atajos válidos. Lo prohibido es que sean el
  _único_ lugar donde vive una acción que el detalle no ofrece.
- **DA4 — Misma confirmación, mismo audit trail.** Las acciones
  destructivas o con motivo disparadas desde el detalle reusan el mismo
  dialog compartido que la fila (`<ConfirmDialog>`,
  `<CancelarConMotivoDialog>`); nada de caminos paralelos con menos
  fricción.

Patrón de referencia: `ReqDetalleDrawer` en
`components/compras/requisiciones-module.tsx` (footer con Marcar
autorizada / Generar OC / Pedir RFQ / Cancelar, sincronizado con la fila
viva vía `detalleActual`).

## Consecuencias

- El clic en fila vuelve a ser el camino primario para operar un
  documento; el menú ⋯ queda como atajo.
- Los drawers de detalle que refrescan datos tras una acción deben leer
  la **fila viva** (`rows.find(...)` memoizado) para que badges y botones
  reflejen el estado nuevo sin cerrar/reabrir.
- Revisiones de PR: un drawer/página de detalle nuevo con acciones solo
  en `<RowActions>` es un smell que se rechaza citando este ADR.
