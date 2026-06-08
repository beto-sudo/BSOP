'use client';
import { type ReactNode } from 'react';

export interface ModuleHeaderProps {
  title: ReactNode;
  subtitle?: ReactNode;
  /** Single primary action (e.g. "Registrar Movimiento", "+ Nuevo"). Optional. */
  action?: ReactNode;
}

export function ModuleHeader({ title, subtitle, action }: ModuleHeaderProps) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {subtitle ? <p className="text-sm text-muted-foreground">{subtitle}</p> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}
