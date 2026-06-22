'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { Building2, Check, ChevronsUpDown } from 'lucide-react';
import { useLocale } from '@/lib/i18n';
import { NavIcon } from './nav-icon';
import type { NavItem } from './nav-config';

/**
 * Empresa switcher — the context selector that drives the sidebar's focus mode.
 *
 * The sidebar tree only renders the empresa you're currently in; this chip is
 * how you jump to another. Click it and the empresas you have access to drop
 * down; pick one and it navigates + closes. Closes on outside-click or Escape.
 *
 * `empresas` arrives already filtered (RBAC + admin presentation denylist), so
 * the dropdown never offers something the tree wouldn't. Renders nothing when
 * there are no empresas to switch between (e.g. a settings-only user).
 */
export function EmpresaSwitcher({
  empresas,
  activeHref,
  collapsed,
  onAfterSelect,
}: {
  empresas: NavItem[];
  activeHref: string | null;
  collapsed: boolean;
  onAfterSelect?: () => void;
}) {
  const { t } = useLocale();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close on outside pointerdown + Escape while open.
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  if (empresas.length === 0) return null;

  const active = activeHref ? empresas.find((item) => item.href === activeHref) : undefined;
  const chipLabel = active ? t(active.labelKey) : t('nav.choose_empresa');

  const select = () => {
    setOpen(false);
    onAfterSelect?.();
  };

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={t('nav.switch_empresa')}
        title={collapsed ? chipLabel : undefined}
        className={[
          'flex w-full items-center rounded-2xl border text-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/40',
          open
            ? 'border-[var(--accent)]/50 bg-[var(--accent)]/10'
            : 'border-[var(--border)] bg-[var(--card)] hover:border-[var(--accent)]/40',
          collapsed ? 'justify-center px-2 py-2' : 'gap-2.5 px-3 py-2.5',
        ].join(' ')}
      >
        {active ? (
          <NavIcon icon={active.icon} className="h-5 w-5" />
        ) : (
          <Building2
            className="h-5 w-5 shrink-0 dark:text-white/55 text-[var(--text)]/55"
            aria-hidden="true"
          />
        )}
        {!collapsed ? (
          <>
            <span className="min-w-0 flex-1 truncate text-left font-medium dark:text-white text-[var(--text)]">
              {chipLabel}
            </span>
            <ChevronsUpDown
              className="h-4 w-4 shrink-0 dark:text-white/45 text-[var(--text)]/45"
              aria-hidden="true"
            />
          </>
        ) : null}
      </button>

      {open ? (
        <div
          role="menu"
          className={[
            'z-50 rounded-2xl border border-[var(--border)] bg-[var(--panel)] p-1.5 shadow-2xl',
            collapsed
              ? 'absolute left-full top-0 ml-2 min-w-56'
              : 'absolute inset-x-0 top-full mt-1.5',
          ].join(' ')}
        >
          <div className="px-2 pb-1.5 pt-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--text-subtle)]">
            {t('nav.switch_empresa')}
          </div>
          {empresas.map((item) => {
            const isActive = item.href === activeHref;
            return (
              <Link
                key={item.href}
                href={item.href}
                role="menuitem"
                onClick={select}
                className={[
                  'flex items-center gap-2.5 rounded-xl px-2.5 py-2 text-sm transition',
                  isActive
                    ? 'bg-[var(--accent)]/15 text-[var(--accent)]'
                    : 'dark:text-white/75 text-[var(--text)]/75 hover:bg-[var(--card)] dark:hover:text-white hover:text-[var(--text)]',
                ].join(' ')}
              >
                <NavIcon icon={item.icon} className="h-5 w-5" />
                <span className="min-w-0 flex-1 truncate">{t(item.labelKey)}</span>
                {isActive ? <Check className="h-4 w-4 shrink-0" aria-hidden="true" /> : null}
              </Link>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
