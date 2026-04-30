# Iniciativa — Drawer anatomy · Polish (`<DetailDrawer>` v2)

**Slug:** `drawer-anatomy-polish`
**Empresas:** todas
**Schemas afectados:** n/a (UI)
**Estado:** planned
**Dueño:** Beto
**Creada:** 2026-04-30
**Última actualización:** 2026-04-30

## Problema

`drawer-anatomy` (cerrada 2026-04-30, ADR-018) fijó la anatomía base del
`<DetailDrawer>` con DD1-DD6 y migró 7 drawers core. Tras el cierre, una
auditoría visual encontró 5 fricciones que ADR-018 no cubría:

1. **Header collision**: el botón X (cierre, `absolute top-3 right-3`,
   28×28px) se empalma con el título cuando el texto llega al borde
   derecho — el `SheetTitle` no tiene `pr-*` que reserve el espacio del
   X. Con títulos largos que envuelven a 2 líneas, el solapamiento se
   ve en la primera línea. Las `actions` tienen `mr-8` defensivo, pero
   están escondidas en mobile (`hidden sm:flex`) — se pierde
   funcionalidad sin aviso.

2. **Sub-secciones**: cada drawer pinta sus secciones internas
   (`space-y-4`/`space-y-6`, divisores ad-hoc, padding propio). La
   inconsistencia produce el síntoma "doble padding" → el reflejo es
   parchear con `className="p-0"` en el wrapper, lo que termina en
   "cero margen" visible.

3. **Loading/error/empty states**: cuando se abre el drawer sobre un row
   y hay fetch async, cada caller inventa su skeleton. No hay un patrón
   estándar.

4. **Form mode**: el `footer` prop existe pero no hay convención de
   cuándo va `<FormActions>` ahí vs inline en el body. Drawers tipo
   create/edit duplican layout.

5. **Print stylesheet en callers**: DD5 dice "por construcción", pero
   los callers siguen agregando `print:` ad-hoc en cada bloque interno.
   Sobra ruido.

**Decisión adicional autorizada por Beto el 2026-04-30**: las
"excepciones documentadas" en `drawer-anatomy` v1 (DILESA list pages,
Settings/Acceso, Productos drawer, Requisiciones, Proveedores list, RH
dept/puestos, Tasks create/edit, Juntas list/detail, Settings/Empresas
detail) se migran en este sprint. Razón: cerrar el patrón de drawers
"para siempre" en lugar de esperar a que cada feature work las toque
incrementalmente.

## Outcome esperado

- `<DetailDrawerHeader>` corrige el empalme título/X/actions y queda
  mobile-friendly por construcción.
- Sub-componente `<DetailDrawerSection>` con padding/divisores
  canónicos. Ningún drawer reinventa secciones.
- `<DetailDrawerSkeleton>` para el patrón loading. Adopters llaman 1
  línea cuando data está cargando.
- Form mode formalizado: convención clara de cuándo footer vs inline,
  helper compatible con `<FormActions>` (ADR-016 F4) integrado.
- `print:` en callers reducido al mínimo — todo lo común vive en el
  componente base.
- 100% de los `<Sheet>` raw del repo migrados a `<DetailDrawer>`. Cero
  excepciones permanentes.
- ADR-026 documenta DD7-DD11.

## Alcance v1 (cerrado 2026-04-30)

- [ ] Sprint 1 — Foundation:
  - [ ] Fix `<DetailDrawerHeader>`: `pr-14` en header + `line-clamp-2
break-words` en título + actions sin `hidden sm:flex` + flex-col
        en mobile.
  - [ ] Nuevo `<DetailDrawerSection>` con title/description/divider
        canónicos.
  - [ ] Nuevo `<DetailDrawerSkeleton>` para loading state.
  - [ ] Form mode: documentar y dejar idiomático (footer + `<FormActions>`).
  - [ ] ADR-026 con DD7-DD11.
  - [ ] Golden migration: re-aplicar a `<StockDetailDrawer>` (golden de
        v1) usando los nuevos sub-componentes donde aplique.

- [ ] Sprint 2 — Aplicar a 7 drawers core ya migrados:
  - [ ] `<OrderDetail>` (Ventas)
  - [ ] `<CorteDetail>` (Cortes)
  - [ ] `<DocumentoDetailSheet>` (Documentos)
  - [ ] OC drawer en `app/rdb/ordenes-compra/page.tsx`
  - [ ] `<TasksUpdatesSheet>` (Tasks)
  - [ ] `<NuevaEmpresaDrawer>` (Settings/Empresas)
  - [ ] `<DocumentoCreateSheet>` (Documentos)

- [ ] Sprint 3 — Migrar excepciones documentadas en `drawer-anatomy` v1:
  - [ ] DILESA list pages: `terrenos`, `prototipos`, `proyectos`, `anteproyectos`
        (4 sheets "Nuevo X")
  - [ ] `app/settings/empresas/_components/empresa-detail.tsx`
  - [ ] `app/settings/acceso/acceso-client.tsx`
  - [ ] `app/rdb/productos/page.tsx`
  - [ ] `app/rdb/requisiciones/page.tsx`
  - [ ] `app/inicio/juntas/[id]/page.tsx`
  - [ ] `components/proveedores/proveedores-module.tsx`
  - [ ] `components/rh/puestos-module.tsx`
  - [ ] `components/rh/departamentos-module.tsx`
  - [ ] `components/tasks/tasks-create-form.tsx`
  - [ ] `components/tasks/tasks-edit-form.tsx`
  - [ ] `components/juntas/admin-juntas-list-module.tsx`
  - [ ] `components/juntas/junta-detail-module.tsx`

- [ ] Sprint 4 — Cierre:
  - [ ] Smoke en preview (login + 3 drawers de muestra).
  - [ ] Mover iniciativa a `## Done` en `INITIATIVES.md`.
  - [ ] Bitácora final.

## Decisiones tomadas al cerrar alcance

- **DD7 — Header reserva el espacio del X**: padding-right `pr-14`
  (56px) en `<SheetHeader>` por construcción. Suficiente para X de 28px
  - 28px de buffer. Elimina la necesidad del `mr-8` mágico en actions.

- **DD8 — Título line-clamp-2 break-words**: `<SheetTitle>` con
  `line-clamp-2 break-words` por default. Títulos largos cortan a 2
  líneas en lugar de invadir el espacio del X o crecer indefinidamente.

- **DD9 — Mobile actions stack vertical**: actions cambian de
  `hidden sm:flex` a `flex flex-col gap-3 sm:flex-row sm:items-start
sm:justify-between sm:gap-4`. Siempre visibles. Stack en mobile,
  inline en desktop. `flex-wrap` en actions para evitar overflow.

- **DD10 — `<DetailDrawerSection>` canónico**: sub-componente con
  `title?: string`, `description?: string`, `divider?: boolean` (default
  `true` después del primero), `padding?: 'default' | 'none'` (default
  `'default'`). Espaciado: `space-y-3` interno, `mt-4` entre secciones,
  `pt-4 border-t` cuando `divider`.

- **DD11 — `<DetailDrawerSkeleton>`**: rendea 3 bloques shimmer (header
  meta, 4 líneas de body, una sub-sección con 3 stat cards). Usable
  como `{loading ? <DetailDrawerSkeleton /> : <Content />}`. No replica
  el header completo — el caller pasa el título ya conocido.

- **Form mode idiomático**: cuando `footer={<FormActions ... />}`, el
  drawer detecta y aplica `border-t` + `px-6 py-3` automáticamente. El
  body del form usa `<DetailDrawerSection>` por sub-grupo. Reusa
  `useDirtyConfirm` (DD6 ↔ ADR-016 F6).

- **Migrar las "excepciones documentadas"**: la decisión de v1 era "se
  actualizan cuando se toquen por feature work". Beto autoriza explícitamente
  cerrar todo en este sprint para no dejar pendientes visuales.

## Fuera de alcance v1

- **URL state / deep-link** (`?detail=<id>`): el back button no abre el
  drawer hoy. Vale, pero es un cambio mayor que toca routing en cada
  page. Sale como sub-iniciativa si emerge.

- **Drawer con sub-tabs internos** ya estaba fuera en v1 y sigue fuera.
  Si emerge, sale como `<DetailDrawerTabs>` aparte.

- **Skeleton del header**: el patrón actual es que el caller pasa
  `title` ya conocido (ej. `item.nombre` del row clickeado). Si se
  quisiera abrir el drawer sin título conocido, sería otro caso. No
  hay ejemplos en el repo, posterga.

- **Nested drawers**: print logic ya cuenta `PRINT_SHEET_COUNT_ATTR`
  (cubierto por shadcn). Si emergen, se documentan; no se prohíben pero
  no hay convención.

## Métricas de éxito

- Cero solapamientos del X con el título o las actions en cualquier
  drawer del repo.
- Mobile: actions visibles en todos los drawers (no `hidden sm:flex`).
- Cero `<Sheet>` directo + `<SheetContent>` en `app/` o `components/`
  (excepto `components/ui/sheet.tsx` y `components/detail-page/detail-drawer.tsx`).
- Cero `className="p-0"` defensivo en `<DetailDrawerContent>`.
- `print:` ad-hoc en callers reducido ≥30% post-DD5+DD7.

## Sprints / hitos

| #   | Sprint                                                                            | Estado  | PR  |
| --- | --------------------------------------------------------------------------------- | ------- | --- |
| 1   | Foundation (header fix + Section + Skeleton + Form mode + ADR-026 + golden Stock) | pending | TBD |
| 2   | Aplicar a 7 drawers core ya migrados                                              | pending | TBD |
| 3   | Migrar excepciones documentadas (~13 archivos)                                    | pending | TBD |
| 4   | Cierre + smoke + Done en INITIATIVES                                              | pending | TBD |

## Decisiones registradas

### 2026-04-30 · Promoción de la iniciativa

Beto reportó dos síntomas visuales en sesión:

1. Tamaño/padding inconsistentes entre drawers ("muchas veces tiene
   cero margen").
2. Título empalmándose con el botón X y/o las actions en algunos casos.

Auditoría rápida confirmó que el problema #1 viene mayoritariamente de
los `<Sheet>` raw documentados como excepciones en v1 (drift estético,
no funcional). Problema #2 es bug del componente base (afecta TODOS los
drawers, incluso los migrados).

Beto autorizó scope completo (B sobre A): incluir las excepciones de v1
en este sprint para cerrar el patrón end-to-end. Modo PR+merge autónomo
con CI verde.

## Bitácora

(append-only — entradas más recientes primero)
