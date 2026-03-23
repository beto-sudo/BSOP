'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Menu, Bell, ChevronDown, PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import usage from '@/data/usage.json';

type NavItem = {
  href: string;
  label: string;
  icon: string;
  section?: string;
  children?: { label: string; href?: string }[];
};

const NAV_ITEMS: NavItem[] = [
  { href: '/', label: 'Overview', icon: '🏠' },
  {
    href: '/businesses',
    label: 'Businesses',
    icon: '🏢',
    children: [
      { label: 'ANSA' },
      { label: 'DILESA' },
      { label: 'COAGAN' },
      { label: 'RDB' },
    ],
  },
  { href: '/finance', label: 'Finance', icon: '💰' },
  { href: '/coda', label: 'Coda Architect', icon: '📊' },
  { href: '/travel', label: 'Travel', icon: '✈️' },
  { href: '/health', label: 'Health', icon: '❤️' },
  { href: '/usage', label: 'AI Operations', icon: '🤖' },
  { href: '/documents', label: 'Documents', icon: '📄' },
  { href: '/family', label: 'Family / SR Group', icon: '👨‍👩‍👧' },
  { href: '/settings', label: 'Settings', icon: '⚙️' },
];

const SECTION_NAMES: Record<string, string> = {
  '/': 'Overview',
  '/agents': 'Agent Operations',
  '/businesses': 'Businesses',
  '/coda': 'Coda Architect',
  '/documents': 'Documents',
  '/family': 'Family / SR Group',
  '/finance': 'Finance',
  '/health': 'Health',
  '/settings': 'Settings',
  '/travel': 'Travel',
  '/usage': 'AI Operations',
};

const money = (value: number) =>
  value.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: value < 1 ? 4 : 2,
    maximumFractionDigits: value < 1 ? 4 : 2,
  });

function getSectionName(pathname: string) {
  if (pathname.startsWith('/travel/')) return 'Travel';
  const match = Object.keys(SECTION_NAMES)
    .sort((a, b) => b.length - a.length)
    .find((path) => path !== '/' && pathname.startsWith(path));
  if (match) return SECTION_NAMES[match];
  return SECTION_NAMES[pathname] ?? 'Overview';
}

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
          <Link href="/" className="flex min-w-0 items-center gap-3 overflow-hidden">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-[var(--accent)]/15 text-lg">
              🦞
            </div>
            {!collapsed ? (
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold tracking-[0.18em] text-white">BSOP</div>
                <div className="truncate text-xs text-white/45">Beto Santos Ops</div>
              </div>
            ) : null}
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
            const active = item.href === '/' ? pathname === '/' : pathname.startsWith(item.href);
            return (
              <div key={item.href} className="space-y-1">
                <Link
                  href={item.href}
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
                  {!collapsed ? <span className="truncate">{item.label}</span> : null}
                </Link>
                {!collapsed && item.children ? (
                  <div className="ml-11 space-y-1 pb-1">
                    {item.children.map((child) => (
                      <div key={child.label} className="text-xs text-white/35">
                        {child.label}
                      </div>
                    ))}
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

      <div className={[
        'min-h-screen transition-[padding-left] duration-300 ease-out',
        collapsed ? 'md:pl-16' : 'md:pl-60',
      ].join(' ')}>
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
