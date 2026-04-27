'use client';
import { type ReactNode } from 'react';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';

export interface DetailHeaderBackProps {
  onClick: () => void;
  /** Used as `aria-label`. e.g. "Volver a Terrenos". */
  label: string;
}

export interface DetailHeaderProps {
  /** Back navigation control. Renders an icon-only outline button. */
  back?: DetailHeaderBackProps;
  /** Small uppercase context line above the title. e.g. "DILESA · Prototipo". */
  eyebrow?: ReactNode;
  /** Main title. Plain text or ReactNode. */
  title: ReactNode;
  /** Optional secondary line under the title (mono code, slug, ID). */
  subtitle?: ReactNode;
  /** Right side: status badges, etapa indicator, etc. Visual peers of actions. */
  meta?: ReactNode;
  /** Right side: action buttons. Single primary or 1-2 secondary. */
  actions?: ReactNode;
}

/**
 * Header de página de detalle. Anatomía canónica (ADR-009 D1):
 *
 *   [back] [eyebrow / title / subtitle]               [meta] [actions]
 *
 * En mobile (sm:flex-row), el bloque derecho cae a una segunda fila.
 */
export function DetailHeader({ back, eyebrow, title, subtitle, meta, actions }: DetailHeaderProps) {
  const backButton = back ? (
    <Button variant="outline" size="icon-sm" onClick={back.onClick} aria-label={back.label}>
      <ArrowLeft className="size-4" />
    </Button>
  ) : null;

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div className="flex items-start gap-2">
        {backButton}
        <div>
          {eyebrow ? (
            <div className="text-xs font-semibold uppercase tracking-[0.22em] text-[var(--text)]/45">
              {eyebrow}
            </div>
          ) : null}
          <h1 className="mt-0.5 text-2xl font-semibold tracking-tight text-[var(--text)]">
            {title}
          </h1>
          {subtitle ? (
            <p className="mt-0.5 font-mono text-xs uppercase tracking-widest text-[var(--text)]/45">
              {subtitle}
            </p>
          ) : null}
        </div>
      </div>
      {meta || actions ? (
        <div className="flex items-center gap-2">
          {meta}
          {actions}
        </div>
      ) : null}
    </div>
  );
}
