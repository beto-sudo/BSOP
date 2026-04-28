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
        label: 'Recursos Humanos',
        children: [
          { label: 'Personal', href: '/dilesa/rh/personal' },
          { label: 'Puestos', href: '/dilesa/rh/puestos' },
          { label: 'Departamentos', href: '/dilesa/rh/departamentos' },
        ],
      },
      {
        label: 'Inmobiliario',
        children: [
          { label: 'Terrenos', href: '/dilesa/terrenos' },
          { label: 'Prototipos', href: '/dilesa/prototipos' },
          { label: 'Anteproyectos', href: '/dilesa/anteproyectos' },
          { label: 'Proyectos', href: '/dilesa/proyectos' },
        ],
      },
      {
        label: 'Operaciones',
        children: [{ label: 'Proveedores', href: '/dilesa/proveedores' }],
      },
    ],
  },
  {
    href: '/rdb',
    labelKey: 'Rincón del Bosque',
    icon: 'rdb-logo',
    sections: [
      {
        label: 'Administración',
        children: [
          { label: 'Tareas', href: '/rdb/admin/tasks' },
          { label: 'Juntas', href: '/rdb/admin/juntas' },
          { label: 'Documentos', href: '/rdb/admin/documentos' },
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
        label: 'Operaciones',
        children: [
          { label: 'Ventas', href: '/rdb/ventas' },
          { label: 'Cortes', href: '/rdb/cortes' },
          { label: 'Productos', href: '/rdb/productos' },
          { label: 'Inventario', href: '/rdb/inventario' },
          { label: 'Proveedores', href: '/rdb/proveedores' },
          { label: 'Requisiciones', href: '/rdb/requisiciones' },
          { label: 'Órdenes de Compra', href: '/rdb/ordenes-compra' },
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
    matchPaths: ['/family', '/health'],
    children: [
      { label: 'Salud', href: '/health' },
      { label: 'Familia', href: '/family' },
    ],
  },
  {
    href: '/settings',
    labelKey: 'nav.settings',
    icon: 'settings',
    children: [
      { label: 'Acceso', href: '/settings/acceso' },
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
  '/family': 'familia',
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
