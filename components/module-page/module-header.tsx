'use client';
import { type ReactNode } from 'react';
import { HelpButton } from '@/components/manual/help-drawer';

export interface ModuleHeaderProps {
  title: ReactNode;
  subtitle?: ReactNode;
  /** Single primary action (e.g. "Registrar Movimiento", "+ Nuevo"). Optional. */
  action?: ReactNode;
  /**
   * Slug del doc de ayuda contextual bajo `content/manual/` (e.g.
   * `dilesa/ventas/lista`). Si se pasa, renderiza el botón "?" junto al título.
   */
  helpSlug?: string;
}

export function ModuleHeader({ title, subtitle, action, helpSlug }: ModuleHeaderProps) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div>
        <div className="flex items-center gap-1.5">
          <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
          {helpSlug ? <HelpButton slug={helpSlug} /> : null}
        </div>
        {subtitle ? <p className="text-sm text-muted-foreground">{subtitle}</p> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}
