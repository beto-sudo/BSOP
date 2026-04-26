'use client';
import { type ReactNode } from 'react';

export interface EmptyStateProps {
  /** Lucide icon (or any node) shown above the title. Optional. */
  icon?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  /** CTA. Use the same primary action node as `<ModuleHeader action>` for "módulo virgen". */
  action?: ReactNode;
  className?: string;
}

/**
 * Centered empty state for module content. Renders standalone (caller wraps
 * in `<TableRow>+<TableCell colSpan>` for table use). See ADR-006.
 */
export function EmptyState({ icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div
      className={[
        'flex flex-col items-center justify-center gap-2 px-4 py-12 text-center',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {icon ? <div className="text-muted-foreground/60">{icon}</div> : null}
      <h3 className="text-base font-medium text-foreground">{title}</h3>
      {description ? <p className="max-w-md text-sm text-muted-foreground">{description}</p> : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}
