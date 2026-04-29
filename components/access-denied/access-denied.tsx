'use client';

import { Lock } from 'lucide-react';
import * as React from 'react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export type AccessDeniedProps = {
  /** Short heading. Default `'Acceso restringido'`. */
  title?: string;
  /** Body copy. Default explains generic permission missing. */
  description?: React.ReactNode;
  /** Optional context line ("Necesitas: dilesa · contabilidad · escritura"). */
  required?: React.ReactNode;
  /** Optional CTA — typically "Pedir acceso" mailto/Slack/ticket link. */
  action?: React.ReactNode;
  /** Compact variant for inline placements (sub-modules denied inside an enabled page). */
  variant?: 'page' | 'inline';
  className?: string;
};

const DEFAULT_DESCRIPTION =
  'No tienes permisos para acceder a esta sección. Contacta al administrador si necesitas acceso.';

/**
 * `<AccessDenied>` — canonical access-denied surface (ADR-024 AD2).
 *
 * Two variants:
 * - `'page'` (default) — full-height centered, used by `<RequireAccess>`
 *   when blocking a whole page.
 * - `'inline'` — compact card-style, for sub-sections denied within an
 *   otherwise-allowed page (e.g. a tab inside a permitted module).
 *
 * `required` line shows the missing permission ("Necesitas: <empresa> ·
 * <modulo> · <escritura/lectura>") so the user knows what to ask for.
 */
export function AccessDenied({
  title = 'Acceso restringido',
  description = DEFAULT_DESCRIPTION,
  required,
  action,
  variant = 'page',
  className,
}: AccessDeniedProps) {
  const isInline = variant === 'inline';

  return (
    <div
      role="alert"
      aria-live="polite"
      className={cn(
        'flex flex-col items-center justify-center text-center',
        isInline
          ? 'gap-2 rounded-2xl border border-[var(--border)] bg-[var(--card)] px-6 py-8'
          : 'min-h-[60vh] gap-3 px-6 py-12',
        className
      )}
    >
      <div className="rounded-full bg-[var(--accent)]/10 p-3 text-[var(--accent)]">
        <Lock className={isInline ? 'size-5' : 'size-6'} aria-hidden="true" />
      </div>
      <h2 className={cn('font-semibold text-[var(--text)]', isInline ? 'text-sm' : 'text-lg')}>
        {title}
      </h2>
      <p className={cn('text-[var(--text)]/65 max-w-prose', isInline ? 'text-xs' : 'text-sm')}>
        {description}
      </p>
      {required ? (
        <div
          className={cn(
            'mt-1 inline-flex items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--panel)] px-2.5 py-1 font-mono text-[var(--text)]/70',
            isInline ? 'text-[10px]' : 'text-[11px]'
          )}
        >
          <span className="font-semibold uppercase tracking-wider text-[var(--text)]/50">
            Necesitas:
          </span>
          {required}
        </div>
      ) : null}
      {action ? <div className="pt-1">{action}</div> : null}
    </div>
  );
}

/**
 * Convenience CTA: opens a mailto with subject pre-filled. Use as `action`
 * prop when the org has a single admin contact email.
 */
export function RequestAccessButton({
  email,
  subject = 'Solicitud de acceso a BSOP',
  body,
  label = 'Pedir acceso',
}: {
  email: string;
  subject?: string;
  body?: string;
  label?: string;
}) {
  const params = new URLSearchParams({ subject });
  if (body) params.set('body', body);
  const href = `mailto:${email}?${params.toString()}`;
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={() => {
        if (typeof window !== 'undefined') window.location.href = href;
      }}
    >
      {label}
    </Button>
  );
}
