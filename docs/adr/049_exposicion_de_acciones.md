# ADR-049 — Exposición de acciones: visibles en la fila, posición en el drawer, y guard (AE1-AE5)

- **Status**: Accepted
- **Date**: 2026-06-25 (aprobado por Beto; default de visibilidad = iconos con tooltip)
- **Authors**: Beto, Claude Code
- **Companion to**: [ADR-044](./044_detalle_con_set_completo_de_acciones.md) (el detalle expone el set completo), [ADR-018](./018_drawer_anatomy.md)/[ADR-026](./026_drawer_anatomy_polish.md) (anatomía del drawer), [ADR-010](./010_data_table.md) (DataTable)
- **Iniciativa**: `ux-consolidacion`

---

## Contexto

Reporte de Beto (2026-06-25, sobre Compras): en Órdenes "los 3 puntitos con el menú del lado derecho para imprimir quedan muy escondidos", y "en algunos lados [los botones del drawer] los tenemos arriba, en otros abajo". Un barrido del repo con dos agentes confirmó dos huecos:

**Hueco 1 — visibilidad en la fila.** El [ADR-044](./044_detalle_con_set_completo_de_acciones.md) garantiza que el _detalle_ expone todas las acciones (DA1) y que las quick-actions de fila son complementarias (DA3), pero **no regula si la acción primaria del documento se muestra VISIBLE en la fila o se esconde en el menú ⋯**. Resultado: módulos como Órdenes y Requisiciones meten TODO (incluida "Imprimir"/"Enviar"/"Generar OC") dentro del ⋯ — cumple ADR-044 pero el usuario no las encuentra. En contraste, CxP Pagos expone "Aprobar/Pagar" como botones visibles (mejor descubribilidad).

**Hueco 2 — posición en el drawer no se respeta.** El ADR-044 DA2 SÍ fija el estándar (workflow → `footer`, utilidades → `actions` del header), pero envejeció sin guard. El barrido encontró **~5 drawers con acciones arriba (header) y ~4 abajo (footer)**, incluyendo **acciones de workflow puestas arriba** (ej. "Traspasar al portafolio", "Regresar a ventas") y **forms con Guardar/Cancelar inline que se van con el scroll** (Tasks), que el estándar manda al footer sticky.

## Decisión

### AE1 — La acción primaria del documento va VISIBLE en la fila, no en el ⋯

La columna de acciones de una tabla expone como **iconos/botones visibles** (con tooltip o label corto) las **acciones primarias** del documento. El menú ⋯ queda para las secundarias, raras o destructivas.

- **"Primaria"** = la(s) acción(es) para las que existe el documento o que se hacen a diario. Para documentos **imprimibles/enviables** (OC, RFQ, factura, estado de cuenta): _Imprimir/Descargar_ y _Enviar_. Para **pendientes de flujo** (pago, requisición): la acción de avance (_Aprobar_, _Pagar_, _Generar OC_).
- **Tope: máximo 3 acciones visibles** por fila para no ensanchar la tabla; el resto al ⋯.
- **Prohibido**: que la acción primaria viva _solo_ en el ⋯.

### AE2 — Posición canónica en el `<DetailDrawer>` (reafirma ADR-044 DA2)

- **Workflow** (autorizar, generar, aprobar, cerrar, cancelar, traspasar, regresar, marcar) → **`footer` sticky**.
- **Utilidades** (imprimir, descargar, editar, procesar con IA) → **`actions` del header**.
- **Forms** (capturas, altas, ediciones): Guardar/Cancelar → **`footer` sticky** (nunca inline scrolleable).

Los violadores que el barrido detectó (a confirmar/corregir en ejecución): drawers de Activo/Unidad de DILESA (acción de workflow en el header) y los forms de Tasks (acciones inline scrolleables).

### AE3 — Un primitivo compartido para la fila

Un componente único —`<RowQuickActions>` o una extensión de [`<RowActions>`](../../components/shared/row-actions.tsx)— encapsula el patrón **"1-3 iconos visibles + ⋯ con el resto"**, para que sea idéntico en todo el repo y no se reinvente por módulo. Los iconos visibles reusan los mismos handlers/gates que el ⋯ y el footer del drawer (ADR-044 DA1/DA4: sin caminos paralelos).

### AE4 — Resolución de nombres de usuario por directorio (ya iniciado)

Relacionado: mostrar nombres de usuarios (solicitante, autor, asignado) desde el cliente es un anti-patrón roto por el RLS self-only de `core.usuarios`. El estándar es la vista **`core.v_usuarios_directorio`** (migración `20260625140306`, ya en prod). Los ~15 módulos que aún leen `core.usuarios` desde el browser para mostrar nombres migran a la vista. (Es "exposición de información" de personas, encaja en este ADR.)

### AE5 — Guard contra el drift

- **Revisión de PR** (blanda): un detalle nuevo con acciones solo en ⋯ (viola AE1 si la primaria queda escondida), o una acción de workflow en el header del drawer (viola AE2), se rechaza citando este ADR.
- **Test de convención** (dura, si resulta factible): un test que escanee los usos de `<DetailDrawer>` y falle si un set conocido de acciones de workflow aparece en el `actions` del header en vez del `footer`; y que el primitivo `<RowQuickActions>` sea el único camino para acciones de fila. El alcance exacto del test se decide en la ejecución (puede empezar como snapshot/lista y endurecerse).

## Consecuencias

- Las acciones que el usuario más usa dejan de estar escondidas: la tabla las muestra, el drawer las confirma, y ambos usan el mismo handler.
- Hay un solo lugar (el primitivo) que define cómo se ve una fila con acciones → cero drift entre módulos.
- Trabajo de adopción incremental (no big-bang): se prioriza Compras (la queja original), luego se corrige cada violador y se hace rollout. Cada paso es un sprint chico de `ux-consolidacion`.
- ADR-044 sigue vigente; este ADR lo **completa** (le agrega la regla de visibilidad que le faltaba) y le pone dientes (el guard).

## Plan de ejecución (sprints de `ux-consolidacion`, tras aprobación)

1. **Primitivo + Compras.** `<RowQuickActions>` y adoptarlo en Órdenes (Imprimir/Enviar visibles) y Requisiciones (Generar OC/RFQ visibles). Resuelve la queja original.
2. **Drawers parejos + guard.** Corregir los violadores de posición (Activo/Unidad/Tasks) + el guard (test de convención).
3. **Rollout.** El primitivo al resto de módulos con acciones de fila; migrar los ~15 módulos de nombres a `v_usuarios_directorio`.
