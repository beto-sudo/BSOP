'use client';
import { type ReactNode } from 'react';

export interface ModuleTab<K extends string = string> {
  key: K;
  label: ReactNode;
}

export interface ModuleTabsProps<K extends string = string> {
  tabs: ReadonlyArray<ModuleTab<K>>;
  value: K;
  onChange: (next: K) => void;
}

/**
 * Underline-style module tabs. Hidden when there's only one tab (per ADR-004).
 * Matches the pattern in components/ventas/ventas-view.tsx.
 */
export function ModuleTabs<K extends string = string>({
  tabs,
  value,
  onChange,
}: ModuleTabsProps<K>) {
  if (tabs.length < 2) return null;
  return (
    <div className="flex flex-wrap gap-2 border-b" role="tablist">
      {tabs.map(({ key, label }) => {
        const active = key === value;
        return (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(key)}
            className={[
              '-mb-px border-b-2 px-4 py-2 text-sm font-medium transition',
              active
                ? 'border-emerald-500 text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground',
            ].join(' ')}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}
