'use client';
import { type ReactNode } from 'react';

export interface ModuleFiltersProps {
  /** Filter controls in left-to-right reading order. */
  children: ReactNode;
  /** Right-aligned count / status text (e.g. "115 productos"). */
  count?: ReactNode;
  /** Right-aligned secondary actions (e.g. Imprimir, Exportar). Per ADR-004 R5. */
  actions?: ReactNode;
}

export function ModuleFilters({ children, count, actions }: ModuleFiltersProps) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      {children}
      {actions ? <div className="ml-auto flex items-center gap-2">{actions}</div> : null}
      {count ? (
        <span className={['text-sm text-muted-foreground', actions ? '' : 'ml-auto'].join(' ')}>
          {count}
        </span>
      ) : null}
    </div>
  );
}
