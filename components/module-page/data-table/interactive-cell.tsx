'use client';
import { type ReactNode, type MouseEvent } from 'react';

export interface InteractiveCellProps {
  children: ReactNode;
  className?: string;
}

/**
 * Wrapper para celdas que contienen popovers, inline-editors, dropdowns u
 * otros controles que NO deben disparar `onRowClick`. Hace `stopPropagation`
 * automático en click. Ver ADR-010 DT5.
 *
 * Usage:
 *
 *   <DataTable.InteractiveCell>
 *     <Combobox value={status} onChange={...} />
 *   </DataTable.InteractiveCell>
 */
export function InteractiveCell({ children, className }: InteractiveCellProps) {
  const stop = (e: MouseEvent) => e.stopPropagation();
  return (
    <div onClick={stop} className={className}>
      {children}
    </div>
  );
}
