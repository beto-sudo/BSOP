'use client';

import Image from 'next/image';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  Menu,
  Bell,
  ChevronDown,
  ChevronRight,
  PanelLeftClose,
  PanelLeftOpen,
  LogOut,
  Sun,
  Moon,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useTheme } from 'next-themes';
import { createSupabaseBrowserClient } from '@/lib/supabase-browser';
import { useLocale, type Locale } from '@/lib/i18n';
import { usePermissions } from '@/components/providers';
import { canAccessEmpresa, canAccessModulo } from '@/lib/permissions';

type NavChild = {
  label: string;
  href: string;
  divider?: boolean;
};

type NavItem = {
  href: string;
  labelKey: string;
  icon: string;
  matchPaths?: string[];
  children?: NavChild[];
};

type AuthUser = {
  name: string;
  email: string;
  avatarUrl: string | null;
};

const NAV_ITEMS: NavItem[] = [
  { href: '/', labelKey: 'nav.overview', icon: '🏠' },
  {
    href: '/dilesa',
    labelKey: 'DILESA',
    icon: 'DILESA_LOGO',
    children: [
      { label: 'Administración', href: '#', divider: true },
      { label: 'Tareas', href: '/dilesa/tasks' },
      { label: 'Juntas', href: '/dilesa/juntas' },
      { label: 'Documentos', href: '/dilesa/documentos' },
      { label: 'Recursos Humanos', href: '#', divider: true },
      { label: 'Empleados', href: '/dilesa/rh/empleados' },
      { label: 'Puestos', href: '/dilesa/rh/puestos' },
      { label: 'Departamentos', href: '/dilesa/rh/departamentos' },
    ],
  },
  {
    href: '/rdb',
    labelKey: 'Rincón del Bosque',
    icon: 'RDB_LOGO',
    children: [
      { label: 'Operaciones', href: '#', divider: true },
      { label: 'Ventas', href: '/rdb/ventas' },
      { label: 'Cortes', href: '/rdb/cortes' },
      { label: 'Productos', href: '/rdb/productos' },
      { label: 'Inventario', href: '/rdb/inventario' },
      { label: 'Proveedores', href: '/rdb/proveedores' },
      { label: 'Requisiciones', href: '/rdb/requisiciones' },
      { label: 'Órdenes de Compra', href: '/rdb/ordenes-compra' },
      { label: 'Playtomic', href: '/rdb/playtomic' },
      { label: 'Administración', href: '#', divider: true },
      { label: 'Tareas', href: '/rdb/admin/tasks' },
      { label: 'Juntas', href: '/rdb/admin/juntas' },
      { label: 'Documentos', href: '/rdb/admin/documentos' },
      { label: 'Recursos Humanos', href: '#', divider: true },
      { label: 'Empleados', href: '/rdb/rh/empleados' },
      { label: 'Puestos', href: '/rdb/rh/puestos' },
      { label: 'Departamentos', href: '/rdb/rh/departamentos' },
    ],
  },
  {
    href: '/coda',
    labelKey: 'nav.coda',
    icon: '📊',
    children: [
      { label: 'DILESA', href: '/coda/dilesa' },
      { label: 'ANSA', href: '/coda/ansa' },
      { label: 'ANSA-Ventas', href: '/coda/ansa-ventas' },
      { label: 'SR Group', href: '/coda/sr-group' },
      { label: 'RDB', href: '/coda/rdb' },
    ],
  },
  {
    href: '/family',
    labelKey: 'Familia / Grupo SR',
    icon: 'SR_LOGO',
    matchPaths: ['/family', '/travel', '/health'],
    children: [
      { label: 'Viajes', href: '/travel' },
      { label: 'Salud', href: '/health' },
      { label: 'Familia', href: '/family' },
    ],
  },
  {
    href: '/settings',
    labelKey: 'nav.settings',
    icon: '⚙️',
    children: [
      { label: 'Acceso', href: '/settings/acceso' },
      { label: 'Empresas', href: '/settings/empresas' },
      { label: 'Integraciones', href: '/settings/integraciones' },
      { label: 'Preferencias', href: '/settings/preferencias' },
    ],
  },
];

/** Maps route hrefs to their modulo slug for permission checks */
const ROUTE_TO_MODULE: Record<string, string> = {
  '/dilesa/tasks': 'dilesa.tasks',
  '/dilesa/juntas': 'dilesa.juntas',
  '/dilesa/documentos': 'dilesa.documentos',
  '/dilesa/rh/empleados': 'dilesa.rh.empleados',
  '/dilesa/rh/puestos': 'dilesa.rh.puestos',
  '/dilesa/rh/departamentos': 'dilesa.rh.departamentos',
  '/rdb/ventas': 'rdb.ventas',
  '/rdb/cortes': 'rdb.cortes',
  '/rdb/productos': 'rdb.productos',
  '/rdb/inventario': 'rdb.inventario',
  '/rdb/proveedores': 'rdb.proveedores',
  '/rdb/requisiciones': 'rdb.requisiciones',
  '/rdb/playtomic': 'rdb.playtomic',
  '/rdb/ordenes-compra': 'rdb.ordenes_compra',
  '/rdb/admin/tasks': 'rdb.admin.tasks',
  '/rdb/admin/juntas': 'rdb.admin.juntas',
  '/rdb/admin/documentos': 'rdb.admin.documentos',
  '/rdb/rh/empleados': 'rdb.rh.empleados',
  '/rdb/rh/puestos': 'rdb.rh.puestos',
  '/rdb/rh/departamentos': 'rdb.rh.departamentos',
  '/rdb': 'rdb.home',
  '/settings/acceso': 'settings.acceso',
};

/** Maps top-level nav hrefs to their empresa slug */
const NAV_TO_EMPRESA: Record<string, string> = {
  '/dilesa': 'dilesa',
  '/rdb': 'rdb',
  '/coda': 'coda',
  '/family': 'familia',
  '/settings': 'settings',
};

function matchesPath(pathname: string, href: string) {
  return href === '/' ? pathname === '/' : pathname === href || pathname.startsWith(`${href}/`);
}

function isItemActive(pathname: string, item: NavItem) {
  const paths = item.matchPaths ?? [item.href];
  return paths.some((path) => matchesPath(pathname, path));
}

function getActiveSection(pathname: string) {
  return NAV_ITEMS.find((item) => item.children && isItemActive(pathname, item))?.href ?? null;
}

function getSectionLabelKey(pathname: string) {
  return NAV_ITEMS.find((item) => isItemActive(pathname, item))?.labelKey ?? 'nav.overview';
}

const money = (value: number) =>
  value.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: value < 1 ? 4 : 2,
    maximumFractionDigits: value < 1 ? 4 : 2,
  });

function getInitials(name: string, email: string) {
  const source = name.trim() || email.trim();
  const parts = source.split(/\s+/).filter(Boolean).slice(0, 2);
  if (parts.length === 0) return 'BS';
  return parts.map((part) => part[0]?.toUpperCase() ?? '').join('');
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { t, locale, setLocale } = useLocale();
  const { theme, setTheme } = useTheme();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [now, setNow] = useState<Date | null>(null);
  const [expandedSection, setExpandedSection] = useState<string | null>(null);
  const [costToday, setCostToday] = useState<number | null>(null);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const isStandaloneSharePage = pathname.startsWith('/compartir/');
  const isAuthPage = pathname === '/login';

  useEffect(() => {
    setNow(new Date());
    const stored = window.localStorage.getItem('bsop-sidebar-collapsed');
    const mobile = window.matchMedia('(max-width: 768px)').matches;
    if (stored !== null) {
      setCollapsed(stored === 'true');
    } else if (mobile) {
      setCollapsed(false);
    }
  }, []);

  useEffect(() => {
    const supabase = createSupabaseBrowserClient();

    const syncUser = async () => {
      const {
        data: { user: authUser },
      } = await supabase.auth.getUser();

      if (!authUser) {
        setUser(null);
        return;
      }

      setUser({
        name: authUser.user_metadata.full_name ?? authUser.user_metadata.name ?? authUser.email ?? 'Beto Santos',
        email: authUser.email ?? '',
        avatarUrl: authUser.user_metadata.avatar_url ?? null,
      });
    };

    void syncUser();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      const authUser = session?.user;
      if (!authUser) {
        setUser(null);
        return;
      }

      setUser({
        name: authUser.user_metadata.full_name ?? authUser.user_metadata.name ?? authUser.email ?? 'Beto Santos',
        email: authUser.email ?? '',
        avatarUrl: authUser.user_metadata.avatar_url ?? null,
      });
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (isAuthPage || isStandaloneSharePage) {
      return;
    }

    let cancelled = false;
    const fetchCost = () => {
      fetch('/api/usage/summary', { cache: 'no-store' })
        .then((res) => res.json())
        .then((data) => {
          if (!cancelled && data.summary) setCostToday(data.summary.cost_today ?? 0);
        })
        .catch(() => {});
    };
    fetchCost();
    const costTimer = window.setInterval(fetchCost, 120_000);
    return () => {
      cancelled = true;
      window.clearInterval(costTimer);
    };
  }, [isAuthPage, isStandaloneSharePage]);

  useEffect(() => {
    window.localStorage.setItem('bsop-sidebar-collapsed', String(collapsed));
  }, [collapsed]);

  useEffect(() => {
    setExpandedSection(getActiveSection(pathname));
    setMobileOpen(false);
    setMenuOpen(false);
  }, [pathname]);

  const { permissions, impersonating, stopImpersonate } = usePermissions();

  // Filter nav items based on permissions. While loading (permissions === null),
  // show nothing to avoid a flash of unauthorized items.
  const filteredNavItems = useMemo(() => {
    if (!permissions) return [];

    return NAV_ITEMS.reduce<NavItem[]>((acc, item) => {
      // Overview is always visible to authenticated users
      if (!item.href || item.href === '/') {
        acc.push(item);
        return acc;
      }

      const empresaSlug = NAV_TO_EMPRESA[item.href];

      // Items with no empresa mapping are always visible (e.g., overview)
      if (!empresaSlug) {
        acc.push(item);
        return acc;
      }

      // Check empresa-level access
      if (!canAccessEmpresa(permissions, empresaSlug)) return acc;

      // Filter children by modulo access
      if (item.children?.length) {
        const visibleChildren = item.children.filter((child) => {
          const moduloSlug = ROUTE_TO_MODULE[child.href];
          // If no modulo mapping, show if empresa is accessible
          if (!moduloSlug) return true;
          return canAccessModulo(permissions, moduloSlug);
        });

        // If all children were filtered out, still show the parent (it has empresa access)
        acc.push({ ...item, children: visibleChildren });
      } else {
        acc.push(item);
      }

      return acc;
    }, []);
  }, [permissions]);

  const sectionLabelKey = useMemo(() => getSectionLabelKey(pathname), [pathname]);
  const sectionName = t(sectionLabelKey);

  function getGreeting(date: Date) {
    const hour = date.getHours();
    if (hour < 12) return t('greeting.morning');
    if (hour < 19) return t('greeting.afternoon');
    return t('greeting.evening');
  }

  const formattedDate = now
    ? now.toLocaleString(locale === 'es' ? 'es-MX' : 'en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
      })
    : '…';

  const displayName = user?.name ?? 'Adalberto Santos de los Santos';
  const displayEmail = user?.email ?? 'beto@anorte.com';
  const initials = getInitials(displayName, displayEmail);

  const handleSignOut = async () => {
    try {
      setSigningOut(true);
      const supabase = createSupabaseBrowserClient();
      await supabase.auth.signOut();
      router.push('/login');
      router.refresh();
    } finally {
      setSigningOut(false);
      setMenuOpen(false);
    }
  };

  if (isStandaloneSharePage || isAuthPage) {
    return <>{children}</>;
  }

  return (
    <div data-app-shell-root="true" className="min-h-screen bg-[var(--bg)] text-[var(--text)]">
      <button
        type="button"
        onClick={() => { setMobileOpen((value) => !value); setCollapsed(false); }}
        className="fixed left-4 top-4 z-50 inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-[var(--border)] bg-[var(--panel)] dark:text-white text-[var(--text)] shadow-lg transition hover:border-[var(--accent)] md:hidden"
        aria-label={t('header.toggle_nav')}
      >
        <Menu className="h-5 w-5" />
      </button>

      {mobileOpen ? (
        <button
          type="button"
          aria-label={t('header.close_nav')}
          className="fixed inset-0 z-30 bg-black/60 md:hidden"
          onClick={() => setMobileOpen(false)}
        />
      ) : null}

      <aside
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
          >
            {collapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
          </button>
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto px-2 py-4">
          {filteredNavItems.map((item) => {
            const active = isItemActive(pathname, item);
            const hasChildren = Boolean(item.children?.length);
            const expanded = !collapsed && expandedSection === item.href;
            const label = t(item.labelKey);

            return (
              <div key={item.href} className="group/item relative">
                <Link
                  href={item.href}
                  onClick={(e) => {
                    if (collapsed) setCollapsed(false);
                    if (hasChildren) {
                      e.preventDefault();
                      setExpandedSection(expanded && !collapsed ? null : item.href);
                      router.push(item.href);
                    } else {
                      setExpandedSection(null);
                    }
                  }}
                  className={[
                    'group flex items-center gap-3 rounded-2xl px-3 py-2.5 text-sm transition',
                    active
                      ? 'border border-[var(--accent)]/40 bg-[var(--accent)]/15 dark:text-white text-[var(--text)] shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]'
                      : 'border border-transparent dark:text-white/68 text-[var(--text)]/68 hover:border-[var(--border)] hover:bg-[var(--card)] dark:hover:text-white hover:text-[var(--text)]',
                    collapsed ? 'justify-center px-2' : '',
                  ].join(' ')}
                  title={collapsed ? label : undefined}
                >
                  <span className="text-lg leading-none">
                    {item.icon === 'DILESA_LOGO' ? (
                      <img src="/logos/dilesa.jpg" alt="DILESA" className="h-5 w-5 object-contain rounded-sm" />
                    ) : item.icon === 'RDB_LOGO' ? (
                      <img src="/logos/rdb.jpg" alt="RDB" className="h-5 w-5 object-contain rounded-sm" />
                    ) : item.icon === 'SR_LOGO' ? (
                      <img src="/logo-familia-sr.jpg" alt="SR" className="h-5 w-5 object-contain rounded-sm" />
                    ) : (
                      item.icon
                    )}
                  </span>
                  {!collapsed ? <span className="min-w-0 flex-1 truncate">{label}</span> : null}
                  {!collapsed && hasChildren ? (
                    expanded ? (
                      <ChevronDown className="h-4 w-4 shrink-0 dark:text-white/45 text-[var(--text)]/45 transition-transform duration-200" />
                    ) : (
                      <ChevronRight className="h-4 w-4 shrink-0 dark:text-white/45 text-[var(--text)]/45 transition-transform duration-200" />
                    )
                  ) : null}
                </Link>

                {!collapsed && hasChildren ? (
                  <div
                    className={[
                      'overflow-hidden transition-all duration-200 ease-in-out',
                      expanded ? 'max-h-[36rem] opacity-100' : 'max-h-0 opacity-0',
                    ].join(' ')}
                  >
                    <div className="ml-7 mt-1 space-y-1 border-l border-[var(--border)] pl-4 pb-1">
                      {item.children?.map((child) => {
                        if (child.divider) {
                          return (
                            <div
                              key={child.label}
                              className="px-3 pt-3 pb-1 text-[10px] font-semibold uppercase tracking-[0.16em] dark:text-white/35 text-[var(--text)]/40"
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
                                : 'border-transparent dark:text-white/48 text-[var(--text)]/55 hover:bg-[var(--card)] dark:hover:text-white/80 hover:text-[var(--text)]',
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
                    <div className="px-2 pb-2 text-xs font-semibold uppercase tracking-[0.16em] dark:text-white/40 text-[var(--text)]/40">
                      {label}
                    </div>
                    <div className="space-y-1">
                      {item.children?.map((child) => {
                        if (child.divider) {
                          return (
                            <div
                              key={child.label}
                              className="px-2 pt-3 pb-1 text-[10px] font-semibold uppercase tracking-[0.16em] dark:text-white/35 text-[var(--text)]/40"
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
          })}
        </nav>

        <div className="border-t border-[var(--border)] px-3 py-4 text-xs dark:text-white/38 text-[var(--text)]/50">
          {!collapsed ? t('footer.built_by') : '🦞'}
        </div>
      </aside>

      <div
        className={[
          'min-h-screen transition-[padding-left] duration-300 ease-out',
          collapsed ? 'md:pl-16' : 'md:pl-60',
        ].join(' ')}
      >
        <header className="sticky top-0 z-20 border-b border-[var(--border)] bg-[var(--panel)] backdrop-blur-xl">
          <div className="flex min-h-[76px] flex-col gap-3 px-6 py-3 xl:flex-row xl:items-center xl:justify-between">
            <div className="pl-10 md:pl-0 flex items-center gap-4">
              {sectionName === 'DILESA' && (
                <div className="flex h-[3.25rem] w-[3.25rem] shrink-0 items-center justify-center rounded-xl bg-white p-1 shadow-sm ring-1 ring-inset ring-[var(--border)]">
                  <img src="/logos/dilesa.jpg" alt="DILESA" className="h-full w-full rounded-lg object-contain" />
                </div>
              )}
              {sectionName === 'Rincón del Bosque' && (
                <div className="flex h-[3.25rem] w-[3.25rem] shrink-0 items-center justify-center rounded-xl bg-white p-1 shadow-sm ring-1 ring-inset ring-[var(--border)]">
                  <img src="/logos/rdb.jpg" alt="RDB" className="h-full w-full rounded-lg object-contain" />
                </div>
              )}
              {sectionName === 'Familia / Grupo SR' && (
                <div className="flex h-[3.25rem] w-[3.25rem] shrink-0 items-center justify-center rounded-xl bg-white p-1 shadow-sm ring-1 ring-inset ring-[var(--border)]">
                  <img src="/logo-familia-sr.jpg" alt="SR" className="h-full w-full rounded-lg object-contain" />
                </div>
              )}
              <div className="flex flex-col justify-center">
                <div className="text-[10px] uppercase tracking-widest font-semibold dark:text-white/40 text-[var(--text)]/50 mb-0.5 leading-tight">BSOP / {sectionName}</div>
                <div className="text-[22px] font-bold tracking-tight dark:text-white text-[var(--text)] leading-none">{sectionName}</div>
                <div className="text-[13px] font-medium dark:text-white/50 text-[var(--text)]/60 mt-1 leading-tight">{getGreeting(now ?? new Date())}, {displayName.split(" ")[0] ?? "Beto"}</div>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3 text-sm dark:text-white/70 text-[var(--text)]/70">
              <InfoPill label="🕐" value={formattedDate} />
              <InfoPill label="📅" value={t('header.no_events')} />
              <div className="flex items-center gap-2 rounded-2xl border border-[var(--border)] bg-[var(--panel)] px-3 py-2">
                {/* Theme toggle */}
                <button
                  type="button"
                  onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
                  className="flex h-7 w-7 items-center justify-center rounded-xl border border-[var(--border)] bg-[var(--card)] dark:text-white/70 text-[var(--text)]/70 transition hover:border-[var(--accent)] dark:hover:text-white hover:text-[var(--text)]"
                  aria-label={t('header.toggle_theme')}
                >
                  {theme === 'dark' ? <Sun className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />}
                </button>

                {/* Language toggle */}
                <button
                  type="button"
                  onClick={() => setLocale(locale === 'es' ? 'en' : 'es')}
                  className="flex h-7 items-center justify-center rounded-xl border border-[var(--border)] bg-[var(--card)] px-2 text-[10px] font-semibold dark:text-white/70 text-[var(--text)]/70 transition hover:border-[var(--accent)] dark:hover:text-white hover:text-[var(--text)]"
                  aria-label={t('header.toggle_locale')}
                >
                  {locale === 'es' ? 'ES' : 'EN'}
                  <span className="mx-1 dark:text-white/25 text-[var(--text)]/25">|</span>
                  {locale === 'es' ? 'EN' : 'ES'}
                </button>

                {/* Notifications bell */}
                <div className="relative">
                  <Bell className="h-4 w-4 dark:text-white/70 text-[var(--text)]/70" />
                  <span className="absolute -right-1.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-[var(--accent)] px-1 text-[10px] font-semibold text-white">
                    0
                  </span>
                </div>

                {/* Account menu */}
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setMenuOpen((value) => !value)}
                    className="flex items-center gap-2 rounded-full bg-[var(--card)] pl-1 pr-2 py-1 text-left transition dark:hover:bg-white/10 hover:bg-[var(--border)]"
                    aria-expanded={menuOpen}
                    aria-label={t('header.open_account')}
                  >
                    {user?.avatarUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={user.avatarUrl}
                        alt={displayName}
                        width={32}
                        height={32}
                        className="h-8 w-8 rounded-full object-cover"
                      />
                    ) : (
                      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--accent)]/20 text-xs font-semibold dark:text-white text-[var(--text)]">
                        {initials}
                      </div>
                    )}
                    <div className="hidden min-w-0 sm:block">
                      <div className="max-w-56 truncate text-xs dark:text-white/90 text-[var(--text)]/90">{displayName}</div>
                      <div className="max-w-56 truncate text-[10px] dark:text-white/45 text-[var(--text)]/55">{displayEmail}</div>
                    </div>
                    <ChevronDown className="h-4 w-4 dark:text-white/45 text-[var(--text)]/45" />
                  </button>

                  {menuOpen ? (
                    <div className="absolute right-0 top-[calc(100%+0.75rem)] z-30 min-w-56 overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--card)] p-2 shadow-2xl">
                      <div className="border-b border-[var(--border)] px-3 py-2">
                        <div className="truncate text-xs font-medium dark:text-white text-[var(--text)]">{displayName}</div>
                        <div className="mt-1 text-xs dark:text-white/45 text-[var(--text)]/55">{displayEmail}</div>
                      </div>
                      <button
                        type="button"
                        onClick={handleSignOut}
                        disabled={signingOut}
                        className="mt-2 flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm dark:text-white/78 text-[var(--text)]/78 transition dark:hover:bg-white/5 hover:bg-[var(--border)] dark:hover:text-white hover:text-[var(--text)] disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        <LogOut className="h-4 w-4" />
                        {signingOut ? t('header.signing_out') : t('header.sign_out')}
                      </button>
                    </div>
                  ) : null}
                </div>
              </div>
            </div>
          </div>
        </header>

        {impersonating && (
          <div className="sticky top-0 z-50 flex items-center justify-between gap-3 bg-amber-500 px-4 py-2 text-sm font-medium text-white shadow-sm print:hidden">
            <span>👁️ Viendo como: <strong>{impersonating.label}</strong></span>
            <button
              onClick={stopImpersonate}
              className="rounded-md bg-white/20 px-3 py-1 text-xs font-semibold hover:bg-white/30 transition-colors"
            >
              Salir de vista previa
            </button>
          </div>
        )}
        <main className="px-4 py-6 sm:px-6 lg:px-8 print:p-0 print:m-0 print:absolute print:inset-0 print:w-full print:h-auto">{children}</main>
      </div>
    </div>
  );
}

function InfoPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center gap-2 rounded-2xl border border-[var(--border)] bg-[var(--panel)] px-3 py-2">
      <span>{label}</span>
      <span className="dark:text-white/85 text-[var(--text)]/85">{value}</span>
    </div>
  );
}
