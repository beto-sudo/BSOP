# Iniciativa — Sidebar taxonomía y secciones (UI)

**Slug:** `sidebar-taxonomia`
**Empresas:** RDB, DILESA (alcance v1). ANSA, COAGAN y Nigropetense quedan fuera hasta que tengan más módulos vivos.
**Schemas afectados:** n/a (UI / shell)
**Estado:** planned
**Dueño:** Beto
**Creada:** 2026-04-28
**Última actualización:** 2026-04-28

> Independiente de la cola UI (`forms-pattern`, `badge-system`, etc.).
> Toca el shell de navegación, no primitivos visuales — puede
> ejecutarse en paralelo sin bloquear ni ser bloqueada.

## Problema

La taxonomía actual del sidebar (`components/app-shell/nav-config.ts`)
creció orgánicamente y hoy sufre tres problemas concretos:

1. **"Operaciones" en RDB es un cajón heterogéneo.** 8 ítems sin
   jerarquía interna mezclando revenue (Ventas, Cortes), procurement
   (Proveedores, Requisiciones, Órdenes de Compra), catálogo
   (Productos, Inventario) e integración (Playtomic).
2. **"Operaciones" en DILESA tiene 1 ítem (Proveedores).** Una sección
   con un solo hijo es ruido visual — el divider cuesta más que el
   contenido.
3. **Estructuralmente las secciones no existen como entidades.** En
   `nav-config.ts` son `{ divider: true }` en un array flat. No se
   pueden esconder secciones vacías sin refactor del shape.

Cuando entren ANSA, COAGAN y Nigropetense (cada una con su propio mix
de módulos), sin una taxonomía clara y sin esconder vacías, el sidebar
se vuelve impredecible: cada empresa muestra una mezcla distinta de
secciones, algunas con un solo ítem, sin jerarquía mental compartida.

## Outcome esperado

- **Taxonomía v1 de 5 secciones**, consistente entre RDB y DILESA:
  1. **Administración** — gobierno corporativo (Tareas, Juntas,
     Documentos). Compartida cross-empresa.
  2. **Recursos Humanos** — Personal, Puestos, Departamentos.
     Compartida cross-empresa.
  3. **Compras** — Proveedores, Requisiciones, Órdenes de Compra,
     Recepciones (cuando UI exista), CxP (cuando exista).
  4. **Inventario** — Productos, Inventario (stock), Movimientos.
  5. **Operaciones** — el core del giro de cada empresa: RDB →
     Ventas, Cortes, Playtomic; DILESA → Terrenos, Prototipos,
     Anteproyectos, Proyectos.
- **Shape de `NAV_ITEMS` refactorizado** de flat con dividers a
  `{ section: { label, children[] } }`. Render del sidebar salta
  secciones con `children.length === 0`.
- **ADR documentando el shape nuevo** + las 5 secciones v1 +
  decisión de Inmobiliario como sub-grupo de Operaciones (no sección
  propia) hasta que crezca a 8+ módulos.
- **Cero cambio de URLs** — solo re-agrupación visual. Cada módulo
  mantiene su path.

## Cómo funcionan los permisos hoy (referencia)

Antes del refactor hay que entender la mecánica vigente — cualquier
cambio a la nav debe respetar este modelo o lo rompemos:

- **2 capas de permisos:**
  1. **Empresa-level** (`canAccessEmpresa`): top-level del sidebar
     (`/dilesa`, `/rdb`, …) se filtra por `NAV_TO_EMPRESA` en
     `nav-config.ts`. Si no tienes acceso a la empresa, la entrada
     completa desaparece.
  2. **Módulo-level** (`canAccessModulo`): cada `child.href`
     (ej. `/rdb/proveedores`) se mapea a un slug de módulo via
     `ROUTE_TO_MODULE` y se filtra individualmente. Si tienes acceso
     a la empresa pero no al módulo, ese ítem específico se
     esconde.
- **Las secciones (Administración, RRHH, etc.) NO tienen permisos
  propios.** Son dividers visuales hoy. Cuando el shape nuevo las
  vuelva contenedores, el filtrado sigue siendo a nivel `child.href`
  → módulo. La sección hereda visibilidad: si todos sus children
  quedan filtrados, la sección desaparece (regla nueva del refactor).
- **`ROUTE_TO_MODULE` es el contrato.** Cada URL del sidebar tiene
  exactamente una entrada ahí. Mover un módulo de "Operaciones" a
  "Compras" NO cambia su `ROUTE_TO_MODULE` (la URL no cambia), por
  lo que los permisos siguen funcionando sin tocar DB.

## Alcance v1

- [ ] Refactor de `components/app-shell/nav-config.ts`:
      `NavItem.children` pasa de `NavChild[]` (flat con `divider`)
      a `NavSection[]` (`{ label, children: NavChild[] }`).
- [ ] Render en `components/app-shell/sidebar.tsx` adaptado al shape
      nuevo + skip de secciones con `children.length === 0`.
- [ ] **Filtrado de permisos preservado y reforzado.** El
      `useMemo`/`reduce` en `sidebar.tsx` (líneas 82-122 hoy) que
      hace `canAccessEmpresa` + filter por `canAccessModulo` se
      adapta al shape nuevo y ahora también colapsa secciones cuyos
      children quedan en cero después del filtro de módulos. Esto
      cubre el caso "usuario con acceso a la empresa pero no a
      ningún módulo de la sección" — antes mostraba un divider
      huérfano, ahora la sección entera desaparece.
- [ ] **Verificar `ROUTE_TO_MODULE` cubre 100% de los `child.href`.**
      Si Sprint 2 introduce URLs nuevas (poco probable, pero p.ej.
      si se separa "Movimientos" como child propio), agregar la
      entrada en `ROUTE_TO_MODULE` Y en la tabla de módulos en DB.
      Si solo se reagrupan módulos existentes, no hay cambios de DB.
- [ ] Re-taxonomizar RDB con las 5 secciones:
  - Administración: Tareas, Juntas, Documentos.
  - Recursos Humanos: Personal, Puestos, Departamentos.
  - Compras: Proveedores, Requisiciones, Órdenes de Compra.
  - Inventario: Productos, Inventario.
  - Operaciones: Ventas, Cortes, Playtomic.
- [ ] Re-taxonomizar DILESA con las 5 secciones (las que aplican):
  - Administración: Tareas, Juntas, Documentos.
  - Recursos Humanos: Personal, Puestos, Departamentos.
  - Compras: Proveedores. _(sección con 1 ítem hoy — se valida
    visualmente; si queda extraño, evaluar plegar Proveedores en
    Operaciones temporalmente)_
  - Operaciones: Terrenos, Prototipos, Anteproyectos, Proyectos.
- [ ] ADR `docs/adr/014_sidebar_taxonomia.md` (numeración tentativa,
      ajustar al ejecutar) con el shape nuevo + las 5 secciones +
      regla de "esconder secciones vacías" + decisión Inmobiliario.
- [ ] Verificar visualmente en preview ambos sidebars (RDB + DILESA)
      antes de mergear.

## Fuera de alcance

- **Sección "Finanzas".** Beto la dejó como posible sección futura
  (CxP + Tesorería + Facturación), pero no urge ahora. Se evalúa
  cuando `cxp` cierre Sprint 1-2 y haya 2-3 módulos financieros vivos.
  Si ese momento llega, sale como sub-iniciativa o como sprint 3 de
  esta misma.
- **ANSA, COAGAN, Nigropetense.** Cada una entra al sidebar cuando
  tenga sus módulos operativos vivos. La taxonomía v1 deja "huecos"
  vacíos preparados (Compras, Inventario, Operaciones) que se llenan
  empresa por empresa.
- **Búsqueda dentro del sidebar / collapsable groups / iconos por
  sección.** UX adicional, no para v1.
- **Permisos a nivel sección.** El modelo actual de 2 capas (empresa
  y módulo) se mantiene. Permisos granulares por sección (ej. "este
  usuario ve la sección Compras pero no Inventario aunque tenga
  acceso a sus módulos") no aplican — si necesitas esconder una
  sección entera, controlas vía permisos de los módulos hijos.
- **Auto-sync `ROUTE_TO_MODULE` ↔ DB ↔ nav-config.** Hoy es manual
  en 3 lugares (declaración de `ROUTE_TO_MODULE` en código, registro
  en tabla de módulos en DB, declaración en `NAV_ITEMS`). Es deuda
  pre-existente, no se aborda aquí — se documenta como riesgo a
  vigilar al ejecutar y se considera futura iniciativa si se vuelve
  problema.

## Métricas de éxito

- 100% de las páginas en RDB y DILESA acomodadas en una de las 5
  secciones v1, sin "huérfanos" en el root.
- Cero secciones con `children.length === 0` visibles en el sidebar.
- Cero cambio en URLs vs. lo que existe hoy (verificable con `git
diff` solo sobre `nav-config.ts` y `sidebar.tsx`).
- Cuando se agregue una empresa nueva (ANSA/COAGAN/Nigropetense), el
  costo es: declarar sus secciones con sus children y listo — sin
  tocar el render.

## Riesgos / preguntas abiertas

- [ ] **DILESA queda con sección "Compras" de 1 solo ítem
      (Proveedores).** Inconsistente con el principio de "no secciones
      con 1 hijo". Decisión al implementar: dejar la sección preparada
      (a futuro entran Requisiciones, OCs, CxP de DILESA) o plegar
      temporalmente Proveedores dentro de Operaciones.
- [ ] **Inmobiliario como sección propia vs sub-grupo.** v1 lo deja
      dentro de Operaciones como agrupación natural del giro de
      DILESA. Si crece a 8+ módulos, se promueve a sección propia en
      iteración futura.
- [ ] **`getActiveSection` / `getSectionLabelKey` en `nav-config.ts`**
      consumen `NAV_ITEMS` con el shape actual. Hay que actualizar
      esos helpers al nuevo shape — no son cambios grandes pero hay
      que cubrirlos en el sprint, no después.
- [ ] **Header móvil.** El header del shell muestra el `labelKey` de
      la sección activa via `getSectionLabelKey`. Verificar que sigue
      funcionando con el shape nuevo (el "label" mostrado es el de la
      empresa, no el de la sub-sección — debería estar bien, pero
      validar).
- [ ] **Permisos: regresión silenciosa al filtrar.** El refactor del
      filtro `useMemo` debe preservar exactamente la semántica
      actual: admin ve todo, usuario con acceso a empresa ve children
      filtrados por `canAccessModulo`, secciones sin children visibles
      se colapsan. Riesgo: cambio sutil que esconda módulos a usuarios
      que sí tenían acceso. Mitigación: probar con un usuario no-admin
      en preview (Beto puede impersonate) antes de mergear.
- [ ] **Sincronización `ROUTE_TO_MODULE` ↔ tabla de módulos en DB.**
      Hoy se mantiene a mano. Si Sprint 2 introduce URLs nuevas o
      renombra alguna, hay que actualizar ambos lugares. Si solo
      reagrupa (URLs idénticas), la DB no se toca. Validar al
      arrancar Sprint 2 que el listado en `ROUTE_TO_MODULE` coincide
      con `core.modulos` o equivalente.
- [ ] **Tests existentes del sidebar.** Buscar tests en
      `components/app-shell/__tests__` o similar y actualizar al shape
      nuevo. Si no hay tests, considerar agregar uno mínimo en este
      sprint para no regresar (especialmente del filtrado por
      permisos — ese es el punto crítico).

## Sprints / hitos

### Sprint 1 — refactor estructural (shape + render)

- Definir `NavSection` type en `nav-config.ts`.
- Convertir `NAV_ITEMS` al shape nuevo manteniendo la taxonomía
  actual (mismas secciones, solo cambia la estructura). Esto permite
  validar el refactor sin re-taxonomizar al mismo tiempo.
- Adaptar `sidebar.tsx` al nuevo shape + lógica de "skip secciones
  vacías".
- Actualizar `getActiveSection`, `getSectionLabelKey` y cualquier
  consumer de `NavItem.children`.
- Verificar visualmente que RDB y DILESA se ven idénticos a hoy.
- Mergear como PR aislado para reducir blast radius.

### Sprint 2 — re-taxonomizar RDB + DILESA

- Aplicar la taxonomía v1 (Administración / RRHH / Compras /
  Inventario / Operaciones) a RDB.
- Aplicar a DILESA con las secciones que apliquen (decidir en el
  momento si "Compras: Proveedores" sale como sección o se pliega).
- ADR-014 con shape, taxonomía y regla de esconder vacías.
- Verificar visualmente ambos sidebars en preview.

## Decisiones registradas

_(append-only, fechadas — escrito por Claude Code al ejecutar)_

- **2026-04-28 — Alcance v1 limitado a RDB + DILESA.** ANSA, COAGAN
  y Nigropetense quedan fuera explícitamente porque aún no tienen
  módulos vivos suficientes en el sidebar. Beto prefiere consolidar
  primero las dos empresas activas y meter las otras tres cuando
  tengan masa crítica. Razón: evitar diseñar la taxonomía con
  hipótesis sobre módulos que no existen.
- **2026-04-28 — Finanzas diferida.** Posible sección futura
  (CxP + Tesorería + Facturación) — Beto dijo "tal vez sí convenga
  crear una sección de Finanzas, mas no sé si ya en este momento".
  Decisión: esperar a que `cxp` Sprint 1-2 cierre y haya 2-3 módulos
  financieros vivos. En ese momento se evalúa promover a sección o
  dejar el flujo P2P consolidado en "Compras".
- **2026-04-28 — Inmobiliario plegado en Operaciones (DILESA).**
  En vez de promover a sección propia, vive como agrupación natural
  del core del giro DILESA dentro de Operaciones. Razón: con 4
  módulos hoy (Terrenos/Prototipos/Anteproyectos/Proyectos) no
  amerita sección propia; si crece a 8+ se reabre la decisión.
- **2026-04-28 — Permisos viven a nivel URL/módulo, no a nivel
  sección.** El modelo actual de 2 capas (`canAccessEmpresa` +
  `canAccessModulo` con `ROUTE_TO_MODULE` como contrato) se preserva
  intacto. Re-taxonomizar (mover módulo de "Operaciones" a "Compras")
  no requiere cambios de DB porque la URL del módulo no cambia. La
  visibilidad de la sección se deriva del filtro de sus children:
  si todos quedan ocultos, la sección colapsa. Permisos granulares
  por sección quedan explícitamente fuera de alcance.

## Bitácora

_(append-only, escrita por Claude Code al ejecutar)_

- **2026-04-28** — Iniciativa promovida a `planned` con alcance v1
  cerrado entre Beto y CC en conversación. Doc creado + fila en
  `INITIATIVES.md`.
