# ADR-014 — Sidebar taxonomía y secciones

- **Status**: Accepted
- **Date**: 2026-04-28
- **Authors**: Beto, Claude Code (iniciativa `sidebar-taxonomia`)
- **Related**: [ADR-011](./011_shared_modules_cross_empresa.md), [planning](../planning/sidebar-taxonomia.md)

---

## Contexto

El sidebar de BSOP creció orgánicamente. Hasta el Sprint 0 de esta
iniciativa, las sub-secciones dentro de cada empresa (Administración,
Recursos Humanos, etc.) vivían como **dividers visuales en un array
flat**:

```ts
// Antes — components/app-shell/nav-config.ts
{
  href: '/rdb',
  children: [
    { label: 'Administración', href: '#', divider: true },
    { label: 'Tareas', href: '/rdb/admin/tasks' },
    // … 7 ítems más mezclando revenue / procurement / catálogo
  ],
}
```

Tres problemas concretos resultaron de ese diseño:

1. **"Operaciones" en RDB era un cajón heterogéneo.** 8 ítems sin
   jerarquía interna mezclando revenue (Ventas, Cortes), procurement
   (Proveedores, Requisiciones, OCs), catálogo (Productos, Inventario)
   e integración (Playtomic).
2. **"Operaciones" en DILESA tenía 1 ítem (Proveedores).** Una sección
   con un solo hijo es ruido visual — el divider cuesta más que el
   contenido.
3. **Estructuralmente las secciones no existían como entidades.** Los
   dividers eran `{ divider: true }` interleaved con los hijos
   reales, así que era imposible "esconder secciones vacías" cuando
   un usuario con permisos parciales filtraba todos los hijos de una
   sección — el divider quedaba huérfano.

Con 5 empresas planeadas (RDB, DILESA, ANSA, COAGAN, Nigropetense) y
mezclas distintas de módulos por empresa, la falta de una taxonomía
clara y de la posibilidad de esconder vacías volvía el sidebar
impredecible.

## Decisión

### Shape estructural

El campo `children: NavChild[]` (flat) deja de aceptar `divider: true`.
Se introduce un campo paralelo `sections: NavSection[]` (mutuamente
exclusivo con `children`) donde cada sección es un grupo labeleado:

```ts
export type NavChild = { label: string; href: string };
export type NavSection = { label: string; children: NavChild[] };

export type NavItem = {
  href: string;
  labelKey: string;
  icon: NavIconKey;
  matchPaths?: string[];
  // Mutuamente exclusivos:
  children?: NavChild[]; // flat — sin agrupación interna
  sections?: NavSection[]; // grupos labeleados
};
```

- **`children`** se usa para items sin agrupación interna: SANREN,
  Settings, Personas Físicas. Lista flat de 2-5 ítems.
- **`sections`** se usa para empresas operativas (DILESA, RDB) donde
  los módulos se agrupan semánticamente.

### Las 5 secciones v1

Aplicables a empresas con masa crítica de módulos (RDB y DILESA hoy;
ANSA, COAGAN, Nigropetense cuando entren):

| Sección              | Contenido                                                                                                                                                                                                |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Administración**   | Gobierno corporativo: Tareas, Juntas, Documentos. Compartida cross-empresa.                                                                                                                              |
| **Recursos Humanos** | Personal, Puestos, Departamentos. Compartida cross-empresa.                                                                                                                                              |
| **Compras**          | Flujo P2P: Proveedores, Requisiciones, Órdenes de Compra, Recepciones (cuando UI exista), CxP (cuando exista).                                                                                           |
| **Inventario**       | Productos, Inventario (stock), Movimientos.                                                                                                                                                              |
| **Operaciones**      | El **core del giro** de cada empresa: RDB → Ventas/Cortes/Playtomic; DILESA → Terrenos/Prototipos/Anteproyectos/Proyectos; cuando entren — COAGAN → cosechas/ganado; ANSA → ventas/servicio/refacciones. |

### Las 6 reglas (ST1–ST6)

#### ST1 — `children` y `sections` son mutuamente exclusivos

Un `NavItem` declara `children` _o_ `sections`, nunca ambos. El test
`NAV_ITEMS taxonomy invariants` enforza esto en CI.

- `children` → items con sub-items pero sin agrupación. Renderiza
  flat sin labels de sección.
- `sections` → items con agrupación semántica. Cada sección renderiza
  su `label` como divider y luego sus children.

#### ST2 — Las 5 secciones v1 son la taxonomía estándar para empresas operativas

Las 5 secciones (Administración / RRHH / Compras / Inventario /
Operaciones) cubren el modelo mental cross-empresa. Cuando una
empresa nueva entra al repo:

- Hereda las 3 secciones compartidas (Admin / RRHH / la regla
  P2P→Compras).
- "Operaciones" se llena con módulos del **core del giro de esa
  empresa específica**.

Excepciones aceptables:

- **Sección con 1 ítem** (ej. `Compras: Proveedores` en DILESA hoy):
  permitida cuando la sección está semánticamente lista para crecer
  (cuando entren Requisiciones/OCs/CxP de DILESA, ya tendrán su
  lugar). Mantiene consistencia mental cross-empresa.
- **Sección omitida**: si una empresa no tiene módulos en alguna de
  las 5, simplemente no la declara. El render NO la muestra.

Secciones nuevas (ej. "Finanzas") quedan diferidas — se evalúan
cuando hay 2-3 módulos vivos que la justifiquen, no antes.

#### ST3 — Secciones vacías post-filtro se ocultan automáticamente

El filtro de permisos en `components/app-shell/sidebar.tsx` aplica a
nivel `child.href` (vía `canAccessModulo` + `ROUTE_TO_MODULE`). Tras
filtrar, secciones cuyos `children.length === 0` se descartan del
render — el `label` de la sección no se renderiza solo.

Esto cubre el caso "usuario con acceso a la empresa pero sin permisos
para los módulos de una sección entera". Antes se mostraba un divider
huérfano; ahora la sección entera desaparece.

#### ST4 — Permisos viven a nivel URL/módulo, NO a nivel sección

El modelo de 2 capas se mantiene:

- **Empresa-level** (`canAccessEmpresa` via `NAV_TO_EMPRESA`): controla
  visibilidad del top-level (`/dilesa`, `/rdb`, …).
- **Módulo-level** (`canAccessModulo` via `ROUTE_TO_MODULE`): controla
  visibilidad de cada child individual.

**No hay permisos a nivel sección.** Re-taxonomizar (mover
`/rdb/proveedores` de "Operaciones" a "Compras") **NO requiere
cambios de DB ni de `ROUTE_TO_MODULE`** — la URL del módulo no cambia,
solo la agrupación visual. La visibilidad de la sección se deriva del
filtro de sus children (ST3).

Si necesitas esconder una sección entera para un usuario, lo logras
controlando los permisos de los módulos hijos.

#### ST5 — `flattenNavChildren` para consumers que no necesitan agrupación

Helpers o tests que necesitan iterar todos los hijos de un nav item
(ej. validar que cada URL tiene una entrada en `ROUTE_TO_MODULE`)
usan `flattenNavChildren(item)` en lugar de leer
`item.children` o `item.sections` directamente. Esto evita branchear
cada caller por shape.

#### ST6 — Empresa nueva = solo declarar su shape

Cuando ANSA, COAGAN o Nigropetense entren al sidebar:

1. Agregar la entrada en `NAV_ITEMS` con `sections: [...]` declarando
   solo las secciones que apliquen (Admin / RRHH siempre; Compras /
   Inventario / Operaciones según corresponda).
2. Agregar las URLs de sus módulos a `ROUTE_TO_MODULE`.
3. Agregar el slug de la empresa a `NAV_TO_EMPRESA`.
4. Registrar los módulos en la tabla de módulos en DB.

**El render del sidebar no se toca.** El soporte de skip-secciones-
vacías + ambos shapes (`children` flat o `sections` agrupados) ya
cubre cualquier mezcla.

## Implementación

Este ADR se adopta en dos sprints de la iniciativa
`sidebar-taxonomia`:

- **Sprint 1** (PR #277, mergeado 2026-04-28) — Refactor estructural
  del shape sin tocar la taxonomía visible. Incluye helpers nuevos
  (`hasNavSubItems`, `flattenNavChildren`), componente local
  `<NavSubItems>` con variant `expanded`/`floating`, filtro de
  permisos adaptado para colapsar secciones vacías (ST3). 18 tests
  nuevos en `components/app-shell/__tests__/nav-config.test.ts`.
- **Sprint 2** (este PR) — Re-taxonomizar RDB y DILESA con las 5
  secciones v1 + ADR-014.

Estado final tras Sprint 2:

```
RDB
├─ Administración: Tareas, Juntas, Documentos
├─ Recursos Humanos: Personal, Puestos, Departamentos
├─ Compras: Proveedores, Requisiciones, Órdenes de Compra
├─ Inventario: Productos, Inventario
└─ Operaciones: Ventas, Cortes, Playtomic

DILESA
├─ Administración: Tareas, Juntas, Documentos
├─ Recursos Humanos: Personal, Puestos, Departamentos
├─ Compras: Proveedores
└─ Operaciones: Terrenos, Prototipos, Anteproyectos, Proyectos
```

Notas de la re-taxonomización:

- **Operaciones de RDB** queda con 3 ítems del core del giro
  (Ventas/Cortes/Playtomic), no 8. Procurement y catálogo salieron a
  sus secciones propias.
- **Inmobiliario plegado en Operaciones de DILESA**, no como sección
  propia. Decisión revisable si DILESA crece a 8+ módulos
  inmobiliarios.
- **DILESA no tiene secciones de Inventario.** No las declara —
  invisible en el sidebar gracias a ST3 (sección no declarada =
  sección no renderizada).

## Consecuencias

### Positivas

- **Modelo mental cross-empresa.** Un usuario que aprende la
  estructura de RDB puede navegar DILESA sin re-aprender — las
  secciones son las mismas (cuando aplican).
- **Escalabilidad de empresas.** ANSA / COAGAN / Nigropetense entran
  con costo predecible: declarar shape, registrar módulos. El render
  no se toca.
- **Cero ruido visual de secciones vacías.** Un usuario con permisos
  parciales ve solo lo que puede acceder, sin dividers huérfanos.
- **Permisos no se complican.** Re-taxonomizar es solo cosmético —
  ROUTE_TO_MODULE y la DB no cambian.
- **Invariantes verificadas en CI.** Tests enforzan que `children` y
  `sections` son mutuamente exclusivos y que ninguna sección se
  declara con 0 children.

### Negativas

- **Sección con 1 ítem es válida (ej. DILESA Compras).** Visualmente
  se ve un divider con un solo link debajo. Aceptado conscientemente
  por consistencia mental cross-empresa (ST2). Si la sección no crece
  en el mediano plazo, se puede plegar — la decisión queda revisable.
- **`children` y `sections` coexistiendo en el type.** Dos shapes
  válidos en el mismo type añade complejidad mínima al render
  (`<NavSubItems>` ya lo absorbe). El test ST1 evita que alguien
  declare ambos por accidente.
- **Re-acomodos futuros costarán un PR.** Si se decide promover
  Inmobiliario a sección propia, o crear "Finanzas", es un cambio en
  `nav-config.ts` + ajuste de tests + ADR follow-up. Aceptable —
  cambios de IA del sidebar son raros y deben ser deliberados.

## Referencias

- [docs/planning/sidebar-taxonomia.md](../planning/sidebar-taxonomia.md) — alcance v1 + decisiones
  - sprints + bitácora.
- [components/app-shell/nav-config.ts](../../components/app-shell/nav-config.ts) — `NAV_ITEMS`,
  `NavItem`, `NavSection`, helpers.
- [components/app-shell/sidebar.tsx](../../components/app-shell/sidebar.tsx) — `<Sidebar>`,
  `<NavSubItems>`, filtro de permisos.
- [components/app-shell/\_\_tests\_\_/nav-config.test.ts](../../components/app-shell/__tests__/nav-config.test.ts) — invariantes ST1, ST2.
- [lib/permissions.ts](../../lib/permissions.ts) — `ROUTE_TO_MODULE`, `canAccessEmpresa`,
  `canAccessModulo` (ST4).
