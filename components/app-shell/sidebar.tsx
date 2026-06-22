'use client';

import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useMemo, useState, type Dispatch, type SetStateAction } from 'react';
import { ChevronDown, ChevronRight, PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { useLocale } from '@/lib/i18n';
import { usePermissions } from '@/components/providers';
import {
  canAccessEmpresa,
  canAccessModulo,
  canSeeNavRoute,
  ROUTE_TO_MODULE,
} from '@/lib/permissions';
import {
  NAV_ITEMS,
  NAV_TO_EMPRESA,
  type NavChild,
  type NavItem,
  filterHiddenNavItems,
  getActiveEmpresaHref,
  getActiveSection,
  hasNavSubItems,
  isEmpresaNavItem,
  isItemActive,
  matchesPath,
} from './nav-config';
import { NavIcon } from './nav-icon';
import { EmpresaSwitcher } from './empresa-switcher';

/**
 * Left sidebar: logo header, empresa switcher, focused nav tree, footer credit.
 *
 * Focus mode (iniciativa `ux-consolidacion`): the tree renders only Inicio, the
 * empresa you're currently in, and Configuración. Other empresas live behind
 * the switcher chip — pick one and the tree re-focuses. This replaces the old
 * manual per-empresa visibility toggles with automatic, route-driven focus.
 *
 * Owns these pieces of UI state locally:
 *   - which top-level section is expanded
 *
 * Receives collapsed + mobileOpen from the shell (they're shared with header/backdrop).
 */
export function Sidebar({
  collapsed,
  setCollapsed,
  mobileOpen,
}: {
  collapsed: boolean;
  setCollapsed: Dispatch<SetStateAction<boolean>>;
  mobileOpen: boolean;
}) {
  const pathname = usePathname();
  const { t } = useLocale();
  const { permissions, sidebarHidden } = usePermissions();
  const [expandedSection, setExpandedSection] = useState<string | null>(null);

  // While permissions are still loading we render a skeleton in place of the nav
  // items. This keeps users from briefly seeing modules they shouldn't access.
  const isLoadingPermissions = !permissions || permissions.loading;

  const filteredNavItems = useMemo(() => {
    if (!permissions || permissions.loading) return [];

    // 1) Per-user RBAC filter. Admin bypasses to the full nav tree.
    let byPermissions: NavItem[];
    if (permissions.isAdmin) {
      byPermissions = NAV_ITEMS;
    } else {
      // Visibilidad por módulo con conciencia de hubs (ADR-030): la entrada
      // de un hub se muestra si el usuario alcanza el padre umbrella o
      // cualquiera de sus sub-slugs, no solo el del primer tab.
      const filterChild = (child: NavChild) => canSeeNavRoute(permissions, child.href);

      byPermissions = NAV_ITEMS.reduce<NavItem[]>((acc, item) => {
        // Overview is always visible to authenticated users.
        if (!item.href || item.href === '/') {
          acc.push(item);
          return acc;
        }

        const empresaSlug = NAV_TO_EMPRESA[item.href];

        // Items with no empresa mapping are always visible (e.g., overview).
        if (!empresaSlug) {
          acc.push(item);
          return acc;
        }

        // `settings` no es una empresa operativa: es el bucket de módulos de
        // sistema (Acceso, Notificaciones, Empresas). Su visibilidad se decide
        // por MÓDULO, no por pertenencia a una empresa — mostrar solo los
        // children con módulo accesible y ocultar el grupo si no queda ninguno.
        // Los children sin módulo mapeado (placeholders como Integraciones /
        // Preferencias) quedan solo para admin, que toma la rama isAdmin arriba.
        if (empresaSlug === 'settings') {
          const visibleChildren = (item.children ?? []).filter((child) => {
            const moduloSlug = ROUTE_TO_MODULE[child.href];
            return moduloSlug ? canAccessModulo(permissions, moduloSlug) : false;
          });
          if (visibleChildren.length > 0) acc.push({ ...item, children: visibleChildren });
          return acc;
        }

        // Check empresa-level access.
        if (!canAccessEmpresa(permissions, empresaSlug)) return acc;

        // Grouped shape: filter children inside each section, then drop empty
        // sections so the divider doesn't render alone.
        if (item.sections?.length) {
          const visibleSections = item.sections
            .map((section) => ({ ...section, children: section.children.filter(filterChild) }))
            .filter((section) => section.children.length > 0);
          acc.push({ ...item, sections: visibleSections });
          return acc;
        }

        // Flat shape: filter children directly.
        if (item.children?.length) {
          const visibleChildren = item.children.filter(filterChild);
          // If all children were filtered out, still show the parent (it has empresa access).
          acc.push({ ...item, children: visibleChildren });
          return acc;
        }

        acc.push(item);
        return acc;
      }, []);
    }

    // 2) Admin-managed global denylist (core.sidebar_oculto): hides top-level
    //    items from EVERYONE, admin included. Runs AFTER the RBAC filter, never
    //    instead of it — so a hidden item stays hidden but access is unchanged.
    //    Backs the "Modo presentación" switch (hides SANREN / Personas Físicas).
    return filterHiddenNavItems(byPermissions, sidebarHidden);
  }, [permissions, sidebarHidden]);

  // Which empresa owns the current route (null on Inicio / Configuración).
  const activeEmpresaHref = useMemo(() => getActiveEmpresaHref(pathname), [pathname]);

  // Split the RBAC-filtered nav into focus-mode pieces:
  //   - empresaItems → the switcher dropdown (every empresa you can reach)
  //   - the tree renders only Inicio + the active empresa + Configuración
  const { inicioItem, settingsItem, empresaItems, activeEmpresaItem } = useMemo(() => {
    let inicio: NavItem | undefined;
    let settings: NavItem | undefined;
    const empresas: NavItem[] = [];
    for (const item of filteredNavItems) {
      if (item.href === '/') inicio = item;
      else if (NAV_TO_EMPRESA[item.href] === 'settings') settings = item;
      else if (isEmpresaNavItem(item)) empresas.push(item);
    }
    return {
      inicioItem: inicio,
      settingsItem: settings,
      empresaItems: empresas,
      activeEmpresaItem: empresas.find((item) => item.href === activeEmpresaHref),
    };
  }, [filteredNavItems, activeEmpresaHref]);

  // Re-expand the section that matches the current route on navigation.
  useEffect(() => {
    setExpandedSection(getActiveSection(pathname));
  }, [pathname]);

  return (
    <aside
      id="app-sidebar"
      aria-label={t('header.navigation')}
      className={[
        'fixed inset-y-0 left-0 z-40 flex flex-col border-r border-[var(--border)] bg-[var(--sidebar)] transition-all duration-300 ease-out',
        collapsed ? 'w-16 md:w-16' : 'w-60',
        mobileOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0',
      ].join(' ')}
    >
      <div className="relative flex h-[76px] items-center justify-center border-b border-[var(--border)] px-6">
        <Link
          href="/"
          className={[
            'flex min-w-0 items-center justify-center overflow-hidden rounded-lg bg-white shadow-sm ring-1 ring-inset ring-[var(--border)] transition hover:ring-[var(--accent)]/40',
            collapsed ? 'h-10 w-10 px-0 py-0' : 'px-3.5 py-1.5',
          ].join(' ')}
          aria-label="BSOP home"
        >
          <Image
            src={collapsed ? '/logo-bs.png' : '/logo-bsop.jpg'}
            alt="BSOP"
            width={collapsed ? 28 : 115}
            height={collapsed ? 28 : 39}
            className={[
              'h-auto w-auto object-contain',
              collapsed ? 'max-h-6 max-w-6' : 'max-h-[1.6rem] max-w-[101px]',
            ].join(' ')}
            priority
          />
        </Link>
        <button
          type="button"
          onClick={() => setCollapsed((value) => !value)}
          className="absolute right-6 hidden h-9 w-9 items-center justify-center rounded-xl border border-[var(--border)] bg-[var(--card)] dark:text-white/70 text-[var(--text)]/70 transition hover:border-[var(--accent)] dark:hover:text-white hover:text-[var(--text)] md:inline-flex"
          aria-label={collapsed ? t('header.expand_sidebar') : t('header.collapse_sidebar')}
          aria-expanded={!collapsed}
          aria-controls="app-sidebar"
        >
          {collapsed ? (
            <PanelLeftOpen className="h-4 w-4" />
          ) : (
            <PanelLeftClose className="h-4 w-4" />
          )}
        </button>
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto px-2 py-4">
        {isLoadingPermissions ? (
          <NavSkeleton collapsed={collapsed} />
        ) : (
          <>
            {inicioItem ? (
              <NavTreeItem
                item={inicioItem}
                pathname={pathname}
                collapsed={collapsed}
                setCollapsed={setCollapsed}
                expanded={false}
                onToggleExpand={() => {}}
                t={t}
              />
            ) : null}

            {/* The empresa appears once — this chip is its header. Its modules
                render directly below (inline when expanded); when collapsed the
                chip's dropdown hosts them (no room inline). */}
            <EmpresaSwitcher
              empresas={empresaItems}
              activeHref={activeEmpresaHref}
              collapsed={collapsed}
              onAfterSelect={() => {
                if (collapsed) setCollapsed(false);
              }}
              collapsedModules={
                activeEmpresaItem ? (
                  <NavSubItems item={activeEmpresaItem} pathname={pathname} variant="floating" />
                ) : null
              }
            />

            {activeEmpresaItem && !collapsed ? (
              <div className="mt-0.5 space-y-1 pb-1">
                <NavSubItems item={activeEmpresaItem} pathname={pathname} variant="expanded" />
              </div>
            ) : null}

            {settingsItem ? (
              <NavTreeItem
                item={settingsItem}
                pathname={pathname}
                collapsed={collapsed}
                setCollapsed={setCollapsed}
                expanded={!collapsed && expandedSection === settingsItem.href}
                onToggleExpand={() =>
                  setExpandedSection((cur) =>
                    cur === settingsItem.href ? null : settingsItem.href
                  )
                }
                t={t}
              />
            ) : null}
          </>
        )}
      </nav>
    </aside>
  );
}

/**
 * A single top-level nav entry (Inicio, the active empresa, or Configuración),
 * with its expand/collapse machinery and floating submenu when collapsed.
 *
 * Extracted so the sidebar can render a curated subset of items (focus mode)
 * without duplicating the row markup.
 */
function NavTreeItem({
  item,
  pathname,
  collapsed,
  setCollapsed,
  expanded,
  onToggleExpand,
  t,
}: {
  item: NavItem;
  pathname: string;
  collapsed: boolean;
  setCollapsed: Dispatch<SetStateAction<boolean>>;
  expanded: boolean;
  onToggleExpand: () => void;
  t: (key: string) => string;
}) {
  const active = isItemActive(pathname, item);
  const hasSubItems = hasNavSubItems(item);
  const label = t(item.labelKey);

  return (
    <div className="group/item relative">
      <div
        className={[
          'flex items-center rounded-2xl text-sm transition',
          active
            ? 'border border-[var(--accent)]/40 bg-[var(--accent)]/15 dark:text-white text-[var(--text)] shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]'
            : 'border border-transparent dark:text-white/68 text-[var(--text)]/68 hover:border-[var(--border)] hover:bg-[var(--card)] dark:hover:text-white hover:text-[var(--text)]',
          !collapsed && hasSubItems ? 'pr-1' : '',
        ].join(' ')}
      >
        <Link
          href={item.href}
          onClick={() => {
            if (collapsed) setCollapsed(false);
          }}
          className={[
            'flex min-w-0 flex-1 items-center gap-3 rounded-2xl px-3 py-2.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/40',
            collapsed ? 'justify-center px-2' : '',
          ].join(' ')}
          title={collapsed ? label : undefined}
        >
          <NavIcon icon={item.icon} />
          {!collapsed ? <span className="min-w-0 flex-1 truncate">{label}</span> : null}
        </Link>
        {!collapsed && hasSubItems ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onToggleExpand();
            }}
            aria-label={expanded ? `Contraer ${label}` : `Expandir ${label}`}
            aria-expanded={expanded}
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg dark:text-white/45 text-[var(--text)]/45 transition-colors hover:dark:text-white hover:text-[var(--text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/40"
          >
            {expanded ? (
              <ChevronDown className="h-4 w-4 transition-transform duration-200" />
            ) : (
              <ChevronRight className="h-4 w-4 transition-transform duration-200" />
            )}
          </button>
        ) : null}
      </div>

      {!collapsed && hasSubItems ? (
        <div
          className={[
            'overflow-hidden transition-all duration-200 ease-in-out',
            expanded ? 'max-h-[60rem] opacity-100' : 'max-h-0 opacity-0',
          ].join(' ')}
        >
          <div className="ml-7 mt-1 space-y-1 border-l border-[var(--border)] pl-4 pb-1">
            <NavSubItems item={item} pathname={pathname} variant="expanded" />
          </div>
        </div>
      ) : null}

      {collapsed && hasSubItems ? (
        <div className="pointer-events-none absolute left-full top-0 z-50 ml-2 hidden min-w-48 rounded-2xl border border-[var(--border)] bg-[var(--panel)] p-2 opacity-0 shadow-2xl transition duration-200 group-hover/item:pointer-events-auto group-hover/item:block group-hover/item:opacity-100 md:block">
          <div className="px-2 pb-2 text-xs font-semibold uppercase tracking-[0.16em] text-[var(--text-subtle)]">
            {label}
          </div>
          <div className="space-y-1">
            <NavSubItems item={item} pathname={pathname} variant="floating" />
          </div>
        </div>
      ) : null}
    </div>
  );
}

type NavSubItemsVariant = 'expanded' | 'floating';

/**
 * Renders the sub-items of a nav entry — either grouped sections (DILESA, RDB)
 * or a flat children list (SANREN, Settings, Personas Físicas).
 *
 * Sections with empty `children` are NOT rendered here — they're already filtered
 * out upstream by the permission filter. Receiving an empty list is a no-op.
 */
function NavSubItems({
  item,
  pathname,
  variant,
}: {
  item: NavItem;
  pathname: string;
  variant: NavSubItemsVariant;
}) {
  const dividerPadding = variant === 'expanded' ? 'px-3' : 'px-2';
  const linkBase =
    variant === 'expanded'
      ? 'block rounded-xl border-l-2 px-3 py-2 text-xs transition'
      : 'pointer-events-auto block rounded-xl border-l-2 px-3 py-2 text-xs transition';
  const linkInactive =
    variant === 'expanded'
      ? 'border-transparent dark:text-white/48 text-[var(--text-muted)] hover:bg-[var(--card)] dark:hover:text-white/80 hover:text-[var(--text)]'
      : 'border-transparent dark:text-white/60 text-[var(--text)]/60 hover:bg-[var(--card)] dark:hover:text-white hover:text-[var(--text)]';

  const renderChild = (child: NavChild) => {
    const childActive = matchesPath(pathname, child.href);
    return (
      <Link
        key={child.href}
        href={child.href}
        className={[
          linkBase,
          childActive
            ? 'border-[var(--accent)] bg-[var(--accent)]/10 text-[var(--accent)]'
            : linkInactive,
        ].join(' ')}
      >
        {child.label}
      </Link>
    );
  };

  if (item.sections?.length) {
    return (
      <>
        {item.sections.map((section) => (
          <div key={section.label}>
            <div
              className={`${dividerPadding} pt-3 pb-1 text-[10px] font-semibold uppercase tracking-[0.16em] dark:text-white/35 text-[var(--text-subtle)]`}
            >
              {section.label}
            </div>
            {section.children.map(renderChild)}
          </div>
        ))}
      </>
    );
  }

  if (item.children?.length) {
    return <>{item.children.map(renderChild)}</>;
  }

  return null;
}

/**
 * Placeholder rows rendered in the sidebar while user permissions are loading.
 * Width values are intentionally varied so the skeleton feels organic rather
 * than mechanical. The row count (6) matches the current top-level nav layout
 * (Inicio + 5 sections) — if the base nav grows, bump SKELETON_WIDTHS.
 */
const SKELETON_WIDTHS = [55, 78, 82, 68, 74, 60];

function NavSkeleton({ collapsed }: { collapsed: boolean }) {
  return (
    <div
      className="space-y-1"
      role="status"
      aria-live="polite"
      aria-label="Cargando menú de navegación"
    >
      {SKELETON_WIDTHS.map((width, index) => (
        <div
          key={index}
          className={[
            'flex items-center gap-3 rounded-2xl border border-transparent px-3 py-2.5',
            collapsed ? 'justify-center px-2' : '',
          ].join(' ')}
        >
          <div className="h-5 w-5 shrink-0 animate-pulse rounded-md bg-[var(--card)]" />
          {!collapsed ? (
            <div
              className="h-3 animate-pulse rounded bg-[var(--card)]"
              style={{ width: `${width}%` }}
            />
          ) : null}
        </div>
      ))}
      <span className="sr-only">Cargando menú de navegación…</span>
    </div>
  );
}
