'use client';

import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Menu,
  Bell,
  ChevronDown,
  ChevronRight,
  PanelLeftClose,
  PanelLeftOpen,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import usage from '@/data/usage.json';

type NavChild = {
  label: string;
  href: string;
};

type NavItem = {
  href: string;
  label: string;
  icon: string;
  matchPaths?: string[];
  children?: NavChild[];
};

const NAV_ITEMS: NavItem[] = [
  { href: '/', label: 'Overview', icon: '🏠' },
  {
    href: '/businesses',
    label: 'Businesses',
    icon: '🏢',
    children: [
      { label: 'ANSA', href: '/businesses/ansa' },
      { label: 'DILESA', href: '/businesses/dilesa' },
      { label: 'COAGAN', href: '/businesses/coagan' },
      { label: 'RDB', href: '/businesses/rdb' },
    ],
  },
  {
    href: '/finance',
    label: 'Finance',
    icon: '💰',
    children: [
      { label: 'Inversiones', href: '/finance/inversiones' },
      { label: 'Cuentas', href: '/finance/cuentas' },
      { label: 'Ingresos', href: '/finance/ingresos' },
      { label: 'Gastos', href: '/finance/gastos' },
    ],
  },
  {
    href: '/coda',
    label: 'Coda Architect',
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
    href: '/travel',
    label: 'Travel',
    icon: '✈️',
    children: [
      { label: 'Viajes activos', href: '/travel/viajes-activos' },
      { label: 'Planeación', href: '/travel/planeacion' },
      { label: 'Historial', href: '/travel/historial' },
    ],
  },
  {
    href: '/health',
    label: 'Health',
    icon: '❤️',
    children: [
      { label: 'Medicamentos', href: '/health/medicamentos' },
      { label: 'Citas', href: '/health/citas' },
      { label: 'Vitales', href: '/health/vitales' },
    ],
  },
  {
    href: '/ai/dashboard',
    label: 'AI Operations',
    icon: '🤖',
    matchPaths: ['/ai', '/usage', '/agents', '/rnd'],
    children: [
      { label: 'Dashboard', href: '/ai/dashboard' },
      { label: 'Usage & Costs', href: '/ai/usage' },
      { label: 'Agents', href: '/agents' },
      { label: 'Models', href: '/ai/models' },
      { label: 'R&D Council', href: '/rnd' },
    ],
  },
  {
    href: '/documents',
    label: 'Documents',
    icon: '📄',
    children: [
      { label: 'Legales', href: '/documents/legales' },
      { label: 'Contratos', href: '/documents/contratos' },
      { label: 'Branding', href: '/documents/branding' },
    ],
  },
  {
    href: '/family',
    label: 'Family / SR Group',
    icon: '👨‍👩‍👧',
    children: [
      { label: 'Patrimonio', href: '/family/patrimonio' },
      { label: 'Calendario', href: '/family/calendario' },
      { label: 'Activos', href: '/family/activos' },
    ],
  },
  {
    href: '/settings',
    label: 'Settings',
    icon: '⚙️',
    children: [
      { label: 'Acceso', href: '/settings/acceso' },
      { label: 'Integraciones', href: '/settings/integraciones' },
      { label: 'Preferencias', href: '/settings/preferencias' },
    ],
  },
];

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

function getSectionName(pathname: string) {
  return NAV_ITEMS.find((item) => isItemActive(pathname, item))?.label ?? 'Overview';
}

const money = (value: number) =>
  value.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: value < 1 ? 4 : 2,
    maximumFractionDigits: value < 1 ? 4 : 2,
  });

function getGreeting(date: Date) {
  const hour = date.getHours();
  if (hour < 12) return 'Buenos días';
  if (hour < 19) return 'Buenas tardes';
  return 'Buenas noches';
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [now, setNow] = useState<Date | null>(null);
  const [expandedSection, setExpandedSection] = useState<string | null>(null);
  const isStandaloneSharePage = pathname.startsWith('/compartir/');

  useEffect(() => {
    setNow(new Date());
    const stored = window.localStorage.getItem('bsop-sidebar-collapsed');
    const mobile = window.matchMedia('(max-width: 768px)').matches;
    if (stored !== null) {
      setCollapsed(stored === 'true');
    } else if (mobile) {
      setCollapsed(true);
    }
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    window.localStorage.setItem('bsop-sidebar-collapsed', String(collapsed));
  }, [collapsed]);

  useEffect(() => {
    setExpandedSection(getActiveSection(pathname));
    setMobileOpen(false);
  }, [pathname]);

  const sectionName = useMemo(() => getSectionName(pathname), [pathname]);
  const formattedDate = now
    ? now.toLocaleString('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      })
    : 'Loading time...';

  if (isStandaloneSharePage) {
    return <>{children}</>;
  }

  return (
    <div className="min-h-screen bg-[var(--bg)] text-[var(--text)]">
      <button
        type="button"
        onClick={() => setMobileOpen((value) => !value)}
        className="fixed left-4 top-4 z-50 inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-[var(--border)] bg-[var(--panel)] text-white shadow-lg transition hover:border-[var(--accent)] md:hidden"
        aria-label="Toggle navigation"
      >
        <Menu className="h-5 w-5" />
      </button>

      {mobileOpen ? (
        <button
          type="button"
          aria-label="Close navigation"
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
        <div className="flex items-center justify-between border-b border-[var(--border)] px-3 py-4">
          <Link
            href="/"
            className={[
              'flex min-w-0 items-center overflow-hidden rounded-2xl border border-white/10 bg-white/95 p-2 shadow-sm transition hover:border-white/20',
              collapsed ? 'justify-center' : 'w-full max-w-[148px]',
            ].join(' ')}
            aria-label="BSOP home"
          >
            <Image
              src={collapsed ? '/logo-bs.png' : '/logo-bsop.jpg'}
              alt="BSOP"
              width={collapsed ? 36 : 136}
              height={collapsed ? 36 : 46}
              className={[
                'h-auto w-auto object-contain',
                collapsed ? 'max-h-9 max-w-9' : 'max-h-12 max-w-[136px]',
              ].join(' ')}
              priority
            />
          </Link>
          <button
            type="button"
            onClick={() => setCollapsed((value) => !value)}
            className="hidden h-9 w-9 items-center justify-center rounded-xl border border-[var(--border)] bg-white/5 text-white/70 transition hover:border-[var(--accent)] hover:text-white md:inline-flex"
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {collapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
          </button>
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto px-2 py-4">
          {NAV_ITEMS.map((item) => {
            const active = isItemActive(pathname, item);
            const hasChildren = Boolean(item.children?.length);
            const expanded = !collapsed && expandedSection === item.href;

            return (
              <div key={item.href} className="group/item relative">
                <Link
                  href={item.href}
                  onClick={() => setExpandedSection(hasChildren ? item.href : null)}
                  className={[
                    'group flex items-center gap-3 rounded-2xl px-3 py-2.5 text-sm transition',
                    active
                      ? 'border border-[var(--accent)]/40 bg-[var(--accent)]/15 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]'
                      : 'border border-transparent text-white/68 hover:border-[var(--border)] hover:bg-white/5 hover:text-white',
                    collapsed ? 'justify-center px-2' : '',
                  ].join(' ')}
                  title={collapsed ? item.label : undefined}
                >
                  <span className="text-lg leading-none">{item.icon}</span>
                  {!collapsed ? <span className="min-w-0 flex-1 truncate">{item.label}</span> : null}
                  {!collapsed && hasChildren ? (
                    expanded ? (
                      <ChevronDown className="h-4 w-4 shrink-0 text-white/45 transition-transform duration-200" />
                    ) : (
                      <ChevronRight className="h-4 w-4 shrink-0 text-white/45 transition-transform duration-200" />
                    )
                  ) : null}
                </Link>

                {!collapsed && hasChildren ? (
                  <div
                    className={[
                      'overflow-hidden transition-all duration-200 ease-in-out',
                      expanded ? 'max-h-80 opacity-100' : 'max-h-0 opacity-0',
                    ].join(' ')}
                  >
                    <div className="ml-7 mt-1 space-y-1 border-l border-white/8 pl-4 pb-1">
                      {item.children?.map((child) => {
                        const childActive = matchesPath(pathname, child.href);
                        return (
                          <Link
                            key={child.href}
                            href={child.href}
                            className={[
                              'block rounded-xl border-l-2 px-3 py-2 text-xs transition',
                              childActive
                                ? 'border-[var(--accent)] bg-[var(--accent)]/10 text-[var(--accent)]'
                                : 'border-transparent text-white/48 hover:bg-white/5 hover:text-white/80',
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
                    <div className="px-2 pb-2 text-xs font-semibold uppercase tracking-[0.16em] text-white/40">
                      {item.label}
                    </div>
                    <div className="space-y-1">
                      {item.children?.map((child) => {
                        const childActive = matchesPath(pathname, child.href);
                        return (
                          <Link
                            key={child.href}
                            href={child.href}
                            className={[
                              'pointer-events-auto block rounded-xl border-l-2 px-3 py-2 text-xs transition',
                              childActive
                                ? 'border-[var(--accent)] bg-[var(--accent)]/10 text-[var(--accent)]'
                                : 'border-transparent text-white/60 hover:bg-white/5 hover:text-white',
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

        <div className="border-t border-[var(--border)] px-3 py-4 text-xs text-white/38">
          {!collapsed ? 'Built with 🦞 by Claw & Beto' : '🦞'}
        </div>
      </aside>

      <div
        className={[
          'min-h-screen transition-[padding-left] duration-300 ease-out',
          collapsed ? 'md:pl-16' : 'md:pl-60',
        ].join(' ')}
      >
        <header className="sticky top-0 z-20 border-b border-[var(--border)] bg-[rgba(15,17,23,0.88)] backdrop-blur-xl">
          <div className="flex min-h-20 flex-col gap-4 px-4 py-4 sm:px-6 lg:px-8 xl:flex-row xl:items-center xl:justify-between">
            <div className="pl-12 md:pl-0">
              <div className="text-xs uppercase tracking-[0.24em] text-white/35">BSOP / {sectionName}</div>
              <div className="mt-1 text-2xl font-semibold text-white">{sectionName}</div>
              <div className="mt-1 text-sm text-white/48">{getGreeting(now ?? new Date())}, Beto</div>
            </div>

            <div className="flex flex-wrap items-center gap-3 text-sm text-white/70">
              <InfoPill label="🕐" value={formattedDate} />
              <InfoPill label="💰" value={`Today ${money(usage.summary.costToday)}`} />
              <InfoPill label="📅" value="No upcoming events" />
              <div className="flex items-center gap-3 rounded-2xl border border-[var(--border)] bg-[var(--panel)] px-3 py-2">
                <div className="relative">
                  <Bell className="h-4 w-4 text-white/70" />
                  <span className="absolute -right-1.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-[var(--accent)] px-1 text-[10px] font-semibold text-white">
                    0
                  </span>
                </div>
                <div className="flex items-center gap-2 rounded-full bg-white/5 pl-1 pr-2 py-1">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--accent)]/20 text-xs font-semibold text-white">
                    BS
                  </div>
                  <span className="text-sm text-white/80">Beto Santos</span>
                  <ChevronDown className="h-4 w-4 text-white/45" />
                </div>
              </div>
            </div>
          </div>
        </header>

        <main className="px-4 py-6 sm:px-6 lg:px-8">{children}</main>
      </div>
    </div>
  );
}

function InfoPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center gap-2 rounded-2xl border border-[var(--border)] bg-[var(--panel)] px-3 py-2">
      <span>{label}</span>
      <span className="text-white/85">{value}</span>
    </div>
  );
}
