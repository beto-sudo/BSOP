'use client';

import { Bell, Calendar, ChevronDown, Clock, Moon, Sun } from 'lucide-react';
import { useTheme } from 'next-themes';
import { useLocale } from '@/lib/i18n';
import { AccountMenu } from './account-menu';
import { InfoPill } from './info-pill';
import type { AuthUser } from './nav-config';

/**
 * Sticky top bar: section icon + title + greeting on the left, info pills +
 * theme/locale toggles + bell + account menu on the right.
 *
 * All state is owned by the parent except theme/locale (next-themes + i18n
 * providers) and AccountMenu's local open/signingOut state.
 */
export function Header({
  sectionName,
  displayName,
  greeting,
  formattedDate,
  user,
}: {
  sectionName: string;
  displayName: string;
  greeting: string;
  formattedDate: string;
  user: AuthUser | null;
}) {
  const { t, locale, setLocale } = useLocale();
  const { theme, setTheme } = useTheme();

  return (
    <header className="sticky top-0 z-20 border-b border-[var(--border)] bg-[var(--panel)] backdrop-blur-xl">
      <div className="flex min-h-[76px] flex-col gap-3 px-6 py-3 xl:flex-row xl:items-center xl:justify-between">
        <div className="pl-10 md:pl-0 flex items-center gap-4">
          {sectionName === 'DILESA' && (
            <div className="flex h-[3.25rem] w-[3.25rem] shrink-0 items-center justify-center rounded-xl bg-white p-1 shadow-sm ring-1 ring-inset ring-[var(--border)]">
              <img
                src="/logos/dilesa.jpg"
                alt="DILESA"
                className="h-full w-full rounded-lg object-contain"
              />
            </div>
          )}
          {sectionName === 'Rincón del Bosque' && (
            <div className="flex h-[3.25rem] w-[3.25rem] shrink-0 items-center justify-center rounded-xl bg-white p-1 shadow-sm ring-1 ring-inset ring-[var(--border)]">
              <img
                src="/logos/rdb.jpg"
                alt="RDB"
                className="h-full w-full rounded-lg object-contain"
              />
            </div>
          )}
          {sectionName === 'SANREN' && (
            <div className="flex h-[3.25rem] w-[3.25rem] shrink-0 items-center justify-center rounded-xl bg-white p-1 shadow-sm ring-1 ring-inset ring-[var(--border)]">
              <img
                src="/logos/sanren.png"
                alt="SANREN"
                className="h-full w-full rounded-lg object-contain"
              />
            </div>
          )}
          <div className="flex flex-col justify-center">
            <div className="text-[10px] uppercase tracking-widest font-semibold dark:text-white/40 text-[var(--text)]/50 mb-0.5 leading-tight">
              BSOP / {sectionName}
            </div>
            <div className="text-[22px] font-bold tracking-tight dark:text-white text-[var(--text)] leading-none">
              {sectionName}
            </div>
            <div className="text-[13px] font-medium dark:text-white/50 text-[var(--text)]/60 mt-1 leading-tight">
              {greeting}, {displayName.split(' ')[0] ?? 'Beto'}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 text-sm dark:text-white/70 text-[var(--text)]/70">
          <InfoPill icon={Clock} value={formattedDate} />
          <InfoPill icon={Calendar} value={t('header.no_events')} />
          <div className="flex items-center gap-2 rounded-2xl border border-[var(--border)] bg-[var(--panel)] px-3 py-2">
            {/* Theme toggle */}
            <button
              type="button"
              onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
              className="flex h-7 w-7 items-center justify-center rounded-xl border border-[var(--border)] bg-[var(--card)] dark:text-white/70 text-[var(--text)]/70 transition hover:border-[var(--accent)] dark:hover:text-white hover:text-[var(--text)]"
              aria-label={t('header.toggle_theme')}
            >
              {theme === 'dark' ? (
                <Sun className="h-3.5 w-3.5" />
              ) : (
                <Moon className="h-3.5 w-3.5" />
              )}
            </button>

            {/* Language toggle */}
            <button
              type="button"
              onClick={() => setLocale(locale === 'es' ? 'en' : 'es')}
              className="flex h-7 items-center justify-center gap-1 rounded-xl border border-[var(--border)] bg-[var(--card)] px-2 text-[10px] font-semibold dark:text-white/70 text-[var(--text)]/70 transition hover:border-[var(--accent)] dark:hover:text-white hover:text-[var(--text)]"
              aria-label={t('header.toggle_locale')}
              title={locale === 'es' ? 'Cambiar a English' : 'Change to Español'}
            >
              {locale === 'es' ? 'ES' : 'EN'}
              <ChevronDown className="h-3 w-3" />
            </button>

            {/* Notifications bell */}
            <NotificationsBell />

            <AccountMenu user={user} />
          </div>
        </div>
      </div>
    </header>
  );
}

function NotificationsBell() {
  const count = 0;
  return (
    <button
      type="button"
      onClick={() => {
        // TODO: abrir panel de notificaciones (pendiente de implementación)
      }}
      aria-label="Notificaciones"
      title="Próximamente"
      className="relative flex h-7 w-7 items-center justify-center rounded-xl border border-[var(--border)] bg-[var(--card)] dark:text-white/70 text-[var(--text)]/70 transition hover:border-[var(--accent)] dark:hover:text-white hover:text-[var(--text)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/40"
    >
      <Bell className="h-3.5 w-3.5" />
      {count > 0 ? (
        <span className="absolute -right-1.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-[var(--accent)] px-1 text-[10px] font-semibold text-white">
          {count}
        </span>
      ) : null}
    </button>
  );
}
