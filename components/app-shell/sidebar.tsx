'use client';

import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useMemo, useState, type Dispatch, type SetStateAction } from 'react';
import {
  ChevronDown,
  ChevronRight,
  Home,
  IdCard,
  type LucideIcon,
  PanelLeftClose,
  PanelLeftOpen,
  Settings as SettingsIcon,
} from 'lucide-react';
import { useLocale } from '@/lib/i18n';
import { usePermissions } from '@/components/providers';
import { canAccessEmpresa, canAccessModulo, ROUTE_TO_MODULE } from '@/lib/permissions';
import {
  NAV_ITEMS,
  NAV_TO_EMPRESA,
  type NavIconKey,
  type NavItem,
  getActiveSection,
  isItemActive,
  matchesPath,
} from './nav-config';

const LUCIDE_BY_KEY: Record<'home' | 'id-card' | 'settings', LucideIcon> = {
  home: Home,
  'id-card': IdCard,
  settings: SettingsIcon,
};

const LOGO_BY_KEY: Record<
  'dilesa-logo' | 'rdb-logo' | 'sanren-logo',
  { src: string; alt: string }
> = {
  'dilesa-logo': { src: '/brand/dilesa/isotipo.png', alt: 'DILESA' },
  'rdb-logo': { src: '/brand/rdb/isotipo.png', alt: 'RDB' },
  // SANREN se mantiene en `/logos/sanren.png` hasta que tenga assets en `/brand/sanren/`.
  'sanren-logo': { src: '/logos/sanren.png', alt: 'SANREN' },
};

function NavIcon({ icon }: { icon: NavIconKey }) {
  if (icon in LOGO_BY_KEY) {
    const { src, alt } = LOGO_BY_KEY[icon as keyof typeof LOGO_BY_KEY];
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src} alt={alt} className="h-5 w-5 object-contain rounded-sm" />;
  }
  const Icon = LUCIDE_BY_KEY[icon as keyof typeof LUCIDE_BY_KEY];
  return <Icon className="h-5 w-5 shrink-0" aria-hidden="true" />;
}

/**
 * Left sidebar: logo header, collapsible nav tree, footer credit.
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
  const { permissions } = usePermissions();
  const [expandedSection, setExpandedSection] = useState<string | null>(null);

  // While permissions are still loading we render a skeleton in place of the nav
  // items. This keeps users from briefly seeing modules they shouldn't access.
  const isLoadingPermissions = !permissions || permissions.loading;

  const filteredNavItems = useMemo(() => {
    if (!permissions || permissions.loading) return [];
    // Admin sees everything.
    if (permissions.isAdmin) return NAV_ITEMS;

    return NAV_ITEMS.reduce<NavItem[]>((acc, item) => {
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

      // Check empresa-level access.
      if (!canAccessEmpresa(permissions, empresaSlug)) return acc;

      // Filter children by modulo access.
      if (item.children?.length) {
        const visibleChildren = item.children.filter((child) => {
          const moduloSlug = ROUTE_TO_MODULE[child.href];
          // If no modulo mapping, show if empresa is accessible.
          if (!moduloSlug) return true;
          return canAccessModulo(permissions, moduloSlug);
        });

        // If all children were filtered out, still show the parent (it has empresa access).
        acc.push({ ...item, children: visibleChildren });
      } else {
        acc.push(item);
      }

      return acc;
    }, []);
  }, [permissions]);

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
          filteredNavItems.map((item) => {
            const active = isItemActive(pathname, item);
            const hasChildren = Boolean(item.children?.length);
            const expanded = !collapsed && expandedSection === item.href;
            const label = t(item.labelKey);

            return (
              <div key={item.href} className="group/item relative">
                <div
                  className={[
                    'flex items-center rounded-2xl text-sm transition',
                    active
                      ? 'border border-[var(--accent)]/40 bg-[var(--accent)]/15 dark:text-white text-[var(--text)] shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]'
                      : 'border border-transparent dark:text-white/68 text-[var(--text)]/68 hover:border-[var(--border)] hover:bg-[var(--card)] dark:hover:text-white hover:text-[var(--text)]',
                    !collapsed && hasChildren ? 'pr-1' : '',
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
                  {!collapsed && hasChildren ? (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setExpandedSection(expanded ? null : item.href);
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

                {!collapsed && hasChildren ? (
                  <div
                    className={[
                      'overflow-hidden transition-all duration-200 ease-in-out',
                      expanded ? 'max-h-[60rem] opacity-100' : 'max-h-0 opacity-0',
                    ].join(' ')}
                  >
                    <div className="ml-7 mt-1 space-y-1 border-l border-[var(--border)] pl-4 pb-1">
                      {item.children?.map((child) => {
                        if (child.divider) {
                          return (
                            <div
                              key={child.label}
                              className="px-3 pt-3 pb-1 text-[10px] font-semibold uppercase tracking-[0.16em] dark:text-white/35 text-[var(--text-subtle)]"
                            >
                              {child.label}
                            </div>
                          );
                        }
                        const childActive = matchesPath(pathname, child.href);
                        return (
                          <Link
                            key={child.href}
                            href={child.href}
                            className={[
                              'block rounded-xl border-l-2 px-3 py-2 text-xs transition',
                              childActive
                                ? 'border-[var(--accent)] bg-[var(--accent)]/10 text-[var(--accent)]'
                                : 'border-transparent dark:text-white/48 text-[var(--text-muted)] hover:bg-[var(--card)] dark:hover:text-white/80 hover:text-[var(--text)]',
                            ].join(' ')}
                          >
                            {child.label}
                          </Link>
                        );
                      })}
                    </div>
                  </div>
                ) : null}

                {collapsed && hasChildren ? (
                  <div className="pointer-events-none absolute left-full top-0 z-50 ml-2 hidden min-w-48 rounded-2xl border border-[var(--border)] bg-[var(--panel)] p-2 opacity-0 shadow-2xl transition duration-200 group-hover/item:pointer-events-auto group-hover/item:block group-hover/item:opacity-100 md:block">
                    <div className="px-2 pb-2 text-xs font-semibold uppercase tracking-[0.16em] text-[var(--text-subtle)]">
                      {label}
                    </div>
                    <div className="space-y-1">
                      {item.children?.map((child) => {
                        if (child.divider) {
                          return (
                            <div
                              key={child.label}
                              className="px-2 pt-3 pb-1 text-[10px] font-semibold uppercase tracking-[0.16em] dark:text-white/35 text-[var(--text-subtle)]"
                            >
                              {child.label}
                            </div>
                          );
                        }
                        const childActive = matchesPath(pathname, child.href);
                        return (
                          <Link
                            key={child.href}
                            href={child.href}
                            className={[
                              'pointer-events-auto block rounded-xl border-l-2 px-3 py-2 text-xs transition',
                              childActive
                                ? 'border-[var(--accent)] bg-[var(--accent)]/10 text-[var(--accent)]'
                                : 'border-transparent dark:text-white/60 text-[var(--text)]/60 hover:bg-[var(--card)] dark:hover:text-white hover:text-[var(--text)]',
                            ].join(' ')}
                          >
                            {child.label}
                          </Link>
                        );
                      })}
                    </div>
                  </div>
                ) : null}
              </div>
            );
          })
        )}
      </nav>

      <div className="border-t border-[var(--border)] px-3 py-4 text-xs dark:text-white/38 text-[var(--text)]/50">
        {!collapsed ? t('footer.built_by') : '🦞'}
      </div>
    </aside>
  );
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
