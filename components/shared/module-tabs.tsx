'use client';

/**
 * Tabs para las páginas master de módulos Dilesa (sprint dilesa-1 UI).
 *
 * Convención de flujo-maestro §6:
 *   Alta / Consulta / Resumen / Timeline / Chart
 *
 * El tab activo se persiste en el query param `?tab=...` para que el link sea
 * compartible y el back-forward del navegador funcione. Los tabs opcionales
 * (Timeline, Chart) pueden renderizar un placeholder mientras no se
 * implementan — la navegación sigue siendo libre.
 */

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback } from 'react';
import { cn } from '@/lib/utils';

export type ModuleTabKey = 'consulta' | 'resumen' | 'timeline' | 'chart';

export type ModuleTabDef = {
  key: ModuleTabKey;
  label: string;
  badge?: string | number | null;
};

const DEFAULT_TAB: ModuleTabKey = 'consulta';

export function useActiveTab(): ModuleTabKey {
  const params = useSearchParams();
  const raw = params.get('tab');
  if (raw === 'consulta' || raw === 'resumen' || raw === 'timeline' || raw === 'chart') {
    return raw;
  }
  return DEFAULT_TAB;
}

export function ModuleTabs({ tabs }: { tabs: ModuleTabDef[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const active = useActiveTab();

  const navigate = useCallback(
    (key: ModuleTabKey) => {
      const next = new URLSearchParams(params);
      if (key === DEFAULT_TAB) next.delete('tab');
      else next.set('tab', key);
      const qs = next.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [params, pathname, router]
  );

  return (
    <div
      role="tablist"
      aria-label="Vistas del módulo"
      className="flex items-center gap-1 border-b border-[var(--border)]"
    >
      {tabs.map((tab) => {
        const isActive = tab.key === active;
        return (
          <button
            key={tab.key}
            role="tab"
            type="button"
            aria-selected={isActive}
            aria-controls={`panel-${tab.key}`}
            id={`tab-${tab.key}`}
            onClick={() => navigate(tab.key)}
            className={cn(
              'relative flex items-center gap-2 px-3 py-2 text-sm font-medium transition-colors',
              'border-b-2 -mb-px',
              isActive
                ? 'border-[var(--accent)] text-[var(--text)]'
                : 'border-transparent text-[var(--text)]/55 hover:text-[var(--text)]'
            )}
          >
            {tab.label}
            {tab.badge != null ? (
              <span
                className={cn(
                  'ml-0.5 inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded-full px-1.5 text-[10px] font-semibold',
                  isActive
                    ? 'bg-[var(--accent)]/15 text-[var(--accent)]'
                    : 'bg-[var(--border)]/60 text-[var(--text)]/55'
                )}
              >
                {tab.badge}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

export function TabPanel({
  tabKey,
  active,
  children,
}: {
  tabKey: ModuleTabKey;
  active: ModuleTabKey;
  children: React.ReactNode;
}) {
  return (
    <div
      role="tabpanel"
      id={`panel-${tabKey}`}
      aria-labelledby={`tab-${tabKey}`}
      hidden={active !== tabKey}
      className="pt-4"
    >
      {active === tabKey ? children : null}
    </div>
  );
}
