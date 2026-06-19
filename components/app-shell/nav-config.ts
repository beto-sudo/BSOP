/**
 * Navigation data and path helpers for the AppShell.
 *
 * Pure module — no React, no side effects. Kept separate so tests, storybooks,
 * or other shells can reuse the same nav topology without importing the UI tree.
 */

export type NavChild = {
  label: string;
  href: string;
};

export type NavSection = {
  label: string;
  children: NavChild[];
};

export type NavIconKey =
  | 'home'
  | 'id-card'
  | 'settings'
  | 'dilesa-logo'
  | 'rdb-logo'
  | 'sanren-logo';

/**
 * Top-level nav entry. Has either `children` (flat list, no grouping) or
 * `sections` (grouped by labeled section). Mutually exclusive.
 *
 * - `children`: e.g. SANREN, Settings — small entries without grouping.
 * - `sections`: e.g. DILESA, RDB — empresas with multiple module groups
 *   (Administración, RRHH, etc.). Sections with empty `children` after
 *   permission filtering are hidden by the sidebar render.
 */
export type NavItem = {
  href: string;
  labelKey: string;
  icon: NavIconKey;
  matchPaths?: string[];
  children?: NavChild[];
  sections?: NavSection[];
};

export const NAV_ITEMS: NavItem[] = [
  { href: '/', labelKey: 'nav.overview', icon: 'home' },
  {
    href: '/dilesa',
    labelKey: 'DILESA',
    icon: 'dilesa-logo',
    sections: [
      {
        label: 'Administración',
        children: [
          { label: 'Tareas', href: '/dilesa/admin/tasks' },
          { label: 'Juntas', href: '/dilesa/admin/juntas' },
          { label: 'Documentos', href: '/dilesa/admin/documentos' },
        ],
      },
      {
        // Tesorería agrupa el ciclo de efectivo: CxC (ingresos), CxP (egresos)
        // y Bancos (posición de caja). Ver iniciativa `tesoreria`.
        label: 'Tesorería',
        children: [
          // CxC — hub con 2 tabs. URL/slug internos siguen siendo `cobranza`.
          { label: 'CxC', href: '/dilesa/cobranza' },
          // CxP — hub con 5 tabs. El padre `dilesa.cxp` es umbrella del sidebar.
          { label: 'CxP', href: '/dilesa/cxp' },
          // "Bancos" (antes "Saldos Bancos"): el módulo ya cubre ficha +
          // saldos + estados de cuenta + conciliación. URL y slugs RBAC
          // conservan `saldos-bancos` — solo cambió el label (2026-06-11).
          { label: 'Bancos', href: '/dilesa/saldos-bancos' },
        ],
      },
      {
        label: 'Recursos Humanos',
        children: [
          { label: 'Personal', href: '/dilesa/rh/personal' },
          { label: 'Puestos', href: '/dilesa/rh/puestos' },
          { label: 'Departamentos', href: '/dilesa/rh/departamentos' },
        ],
      },
      {
        label: 'Compras',
        children: [
          { label: 'Proveedores', href: '/dilesa/proveedores' },
          // Hub P2P con tabs (Requisiciones / Cotizaciones / Órdenes /
          // Recepciones) — ADR-030. Sidebar muestra solo el padre; la URL
          // default cae al tab Órdenes. El label es el hub completo, no el
          // primer tab: un rol puede tener solo parte del ciclo.
          { label: 'Compras', href: '/dilesa/compras' },
        ],
      },
      {
        label: 'Inmobiliario',
        children: [
          { label: 'Portafolio', href: '/dilesa/portafolio' },
          { label: 'Proyectos', href: '/dilesa/proyectos' },
          // Ventas ahora es un hub con 5 tabs (Ventas / Inventario / Fases /
          // Clientes / Vendedores) — el sidebar muestra solo la entry del
          // padre; las tabs viven en el layout (sprint tabs-hub).
          // Inventario quedó dentro de Ventas como tab — antes era top-level.
          { label: 'Ventas', href: '/dilesa/ventas' },
          // Construcción ahora es un hub con 4 tabs (Obras / Contratos /
          // Contratistas / Prototipos) — el sidebar muestra solo la entry
          // del padre; las tabs viven en el layout (sprint tabs+protos).
          { label: 'Construcción', href: '/dilesa/construccion' },
          // RUV (Registro Único de Vivienda · INFONAVIT) — módulo propio,
          // operado por Asistente de Proyectos. Iniciativa `dilesa-ruv`.
          { label: 'RUV', href: '/dilesa/ruv' },
          // Atención a Clientes — bandeja de Ciori (recepción de obra →
          // pre-entrega → entrega → conformidad). Iniciativa `dilesa-atencion-clientes`.
          { label: 'Atención a Clientes', href: '/dilesa/atencion-clientes' },
        ],
      },
    ],
  },
  {
    href: '/rdb',
    labelKey: 'Rincón del Bosque',
    icon: 'rdb-logo',
    sections: [
      {
        label: 'Operativa',
        children: [{ label: 'Home', href: '/rdb/home' }],
      },
      {
        label: 'Administración',
        children: [
          { label: 'Tareas', href: '/rdb/admin/tasks' },
          { label: 'Juntas', href: '/rdb/admin/juntas' },
          { label: 'Documentos', href: '/rdb/admin/documentos' },
          { label: 'CxP', href: '/rdb/cxp' },
        ],
      },
      {
        label: 'Recursos Humanos',
        children: [
          { label: 'Personal', href: '/rdb/rh/personal' },
          { label: 'Puestos', href: '/rdb/rh/puestos' },
          { label: 'Departamentos', href: '/rdb/rh/departamentos' },
        ],
      },
      {
        label: 'Compras',
        children: [
          { label: 'Proveedores', href: '/rdb/proveedores' },
          { label: 'Requisiciones', href: '/rdb/requisiciones' },
          { label: 'Órdenes de Compra', href: '/rdb/ordenes-compra' },
          { label: 'Recepciones', href: '/rdb/recepciones' },
        ],
      },
      {
        label: 'Inventario',
        children: [
          { label: 'Productos', href: '/rdb/productos' },
          { label: 'Inventario', href: '/rdb/inventario' },
        ],
      },
      {
        label: 'Operaciones',
        children: [
          { label: 'Ventas', href: '/rdb/ventas' },
          { label: 'Cortes', href: '/rdb/cortes' },
          { label: 'Playtomic', href: '/rdb/playtomic' },
        ],
      },
    ],
  },
  {
    href: '/personas-fisicas',
    labelKey: 'Personas Físicas',
    icon: 'id-card',
  },
  {
    href: '/family',
    labelKey: 'SANREN',
    icon: 'sanren-logo',
    matchPaths: ['/family', '/health', '/peptides'],
    children: [
      { label: 'Salud', href: '/health' },
      { label: 'Péptidos', href: '/peptides' },
      { label: 'Familia', href: '/family' },
    ],
  },
  {
    href: '/settings',
    labelKey: 'nav.settings',
    icon: 'settings',
    children: [
      { label: 'Acceso', href: '/settings/acceso' },
      { label: 'Notificaciones', href: '/settings/notificaciones' },
      { label: 'IA', href: '/settings/ia' },
      { label: 'Empresas', href: '/settings/empresas' },
      { label: 'Integraciones', href: '/settings/integraciones' },
      { label: 'Preferencias', href: '/settings/preferencias' },
    ],
  },
];

/** Maps top-level nav hrefs to their empresa slug for permission filtering. */
export const NAV_TO_EMPRESA: Record<string, string> = {
  '/dilesa': 'dilesa',
  '/rdb': 'rdb',
  '/family': 'sanren',
  '/personas-fisicas': 'personas_fisicas',
  '/settings': 'settings',
};

export function matchesPath(pathname: string, href: string) {
  return href === '/' ? pathname === '/' : pathname === href || pathname.startsWith(`${href}/`);
}

export function isItemActive(pathname: string, item: NavItem) {
  const paths = item.matchPaths ?? [item.href];
  return paths.some((path) => matchesPath(pathname, path));
}

/**
 * Returns true if the nav item has any expandable content (flat children or
 * grouped sections).
 */
export function hasNavSubItems(item: NavItem): boolean {
  return Boolean(item.children?.length || item.sections?.length);
}

/**
 * Flattens an item's children regardless of shape (flat or grouped). Used for
 * cases where consumers don't care about the section grouping.
 */
export function flattenNavChildren(item: NavItem): NavChild[] {
  if (item.children?.length) return item.children;
  if (item.sections?.length) return item.sections.flatMap((section) => section.children);
  return [];
}

/**
 * Removes top-level nav items whose nav slug is in the `hidden` denylist
 * (sourced from `core.sidebar_oculto`). Applies to ALL users — admin included —
 * so it must run AFTER the per-user permission filter, not instead of it.
 *
 * Items without a `NAV_TO_EMPRESA` mapping (e.g. Inicio) are never hidden: the
 * denylist only governs empresa/virtual top-level entries.
 *
 * Pure function (no React) so the sidebar's visibility contract can be tested
 * in isolation. Returns the same array reference when nothing is hidden.
 */
export function filterHiddenNavItems(items: NavItem[], hidden: Set<string>): NavItem[] {
  if (hidden.size === 0) return items;
  return items.filter((item) => {
    const slug = NAV_TO_EMPRESA[item.href];
    return !slug || !hidden.has(slug);
  });
}

export function getActiveSection(pathname: string) {
  return (
    NAV_ITEMS.find((item) => hasNavSubItems(item) && isItemActive(pathname, item))?.href ?? null
  );
}

export function getSectionLabelKey(pathname: string) {
  return NAV_ITEMS.find((item) => isItemActive(pathname, item))?.labelKey ?? 'nav.overview';
}

export function getInitials(name: string, email: string) {
  const source = name.trim() || email.trim();
  const parts = source.split(/\s+/).filter(Boolean).slice(0, 2);
  if (parts.length === 0) return 'BS';
  return parts.map((part) => part[0]?.toUpperCase() ?? '').join('');
}

export type AuthUser = {
  name: string;
  email: string;
  avatarUrl: string | null;
};
