'use client';

import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export type FormSectionProps = {
  title?: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  className?: string;
  /** Render a top divider above the section. Off by default. */
  divider?: boolean;
};

/**
 * `<FormSection>` — visual grouping with optional title + description.
 *
 * Use to break long forms into labelled chunks ("Datos personales",
 * "Datos fiscales", etc.). For a single field per row, place
 * `<FormField>` directly inside; for multi-column layouts, wrap fields in
 * `<FormRow cols={2}>`.
 */
export function FormSection({
  title,
  description,
  children,
  className,
  divider,
}: FormSectionProps) {
  return (
    <section
      className={cn('space-y-4', divider && 'border-t border-[var(--border)] pt-5', className)}
    >
      {(title || description) && (
        <header className="space-y-1">
          {title ? <h3 className="text-sm font-semibold text-[var(--text)]">{title}</h3> : null}
          {description ? <p className="text-xs text-[var(--text)]/50">{description}</p> : null}
        </header>
      )}
      {children}
    </section>
  );
}
