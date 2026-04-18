'use client';

import { Menu } from 'lucide-react';
import { useEffect, useMemo } from 'react';
import { usePathname } from 'next/navigation';
import { useLocale } from '@/lib/i18n';
import { usePermissions } from '@/components/providers';
import { Header } from './header';
import { ImpersonationBanner } from './impersonation-banner';
import { Sidebar } from './sidebar';
import { getSectionLabelKey } from './nav-config';
import { useShellState } from './use-shell-state';

/**
 * Top-level layout shell: sidebar + header + main content area.
 *
 * Responsibilities kept here:
 *   - Short-circuit rendering for /login and /compartir/* (no shell chrome)
 *   - Mobile menu toggle + backdrop (coordinates with Sidebar's mobileOpen)
 *   - Greeting + section title derived from path (passed to Header)
 *   - Impersonation banner when admin is previewing another user
 *
 * Everything else is delegated to Sidebar / Header / AccountMenu / useShellState.
 */
export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { t, locale } = useLocale();
  const { impersonating, stopImpersonate } = usePermissions();

  const isStandaloneSharePage = pathname.startsWith('/compartir/');
  const isAuthPage = pathname === '/login';

  const { collapsed, setCollapsed, mobileOpen, setMobileOpen, now, user } = useShellState({
    isAuthPage,
    isStandaloneSharePage,
  });

  // Close the mobile overlay whenever the route changes.
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname, setMobileOpen]);

  const sectionLabelKey = useMemo(() => getSectionLabelKey(pathname), [pathname]);
  const sectionName = t(sectionLabelKey);

  const displayName = user?.name ?? 'Adalberto Santos de los Santos';

  const greeting = useMemo(() => {
    const date = now ?? new Date();
    const hour = date.getHours();
    if (hour < 12) return t('greeting.morning');
    if (hour < 19) return t('greeting.afternoon');
    return t('greeting.evening');
  }, [now, t]);

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

  if (isStandaloneSharePage || isAuthPage) {
    return <>{children}</>;
  }

  return (
    <div data-app-shell-root="true" className="min-h-screen bg-[var(--bg)] text-[var(--text)]">
      <button
        type="button"
        onClick={() => {
          setMobileOpen((value) => !value);
          setCollapsed(false);
        }}
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

      <Sidebar collapsed={collapsed} setCollapsed={setCollapsed} mobileOpen={mobileOpen} />

      <div
        className={[
          'min-h-screen transition-[padding-left] duration-300 ease-out',
          collapsed ? 'md:pl-16' : 'md:pl-60',
        ].join(' ')}
      >
        <Header
          sectionName={sectionName}
          displayName={displayName}
          greeting={greeting}
          formattedDate={formattedDate}
          user={user}
        />

        {impersonating && (
          <ImpersonationBanner label={impersonating.label} onStop={stopImpersonate} />
        )}

        <main className="px-4 py-6 sm:px-6 lg:px-8 print:p-0 print:m-0 print:absolute print:inset-0 print:w-full print:h-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
