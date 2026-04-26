'use client';
import { useState } from 'react';
import { AlertCircle, RotateCw, X } from 'lucide-react';
import { Button } from '@/components/ui/button';

export interface ErrorBannerProps {
  /** Error to display. Rendered as `error.message` if Error, otherwise as string. */
  error: Error | string;
  /** If provided, shows a "Reintentar" button. Use only when the operation is idempotent. */
  onRetry?: () => void;
  /** If true, shows a × button to dismiss the banner. */
  dismissible?: boolean;
  className?: string;
}

/**
 * Persistent error banner for module fetches. Lives between `<ModuleFilters>`
 * and `<ModuleContent>` per ADR-004 R10. See ADR-006.
 */
export function ErrorBanner({ error, onRetry, dismissible = false, className }: ErrorBannerProps) {
  const [dismissed, setDismissed] = useState(false);
  if (dismissed) return null;

  const message = error instanceof Error ? error.message : error;

  return (
    <div
      role="alert"
      aria-live="polite"
      className={[
        'flex items-start gap-3 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
      <div className="flex-1">{message}</div>
      {onRetry ? (
        <Button
          variant="outline"
          size="sm"
          onClick={onRetry}
          className="h-7 gap-1.5 border-destructive/30 px-2 text-destructive hover:bg-destructive/20 hover:text-destructive"
        >
          <RotateCw className="h-3 w-3" />
          Reintentar
        </Button>
      ) : null}
      {dismissible ? (
        <button
          type="button"
          onClick={() => setDismissed(true)}
          aria-label="Cerrar"
          className="text-destructive/70 hover:text-destructive"
        >
          <X className="h-4 w-4" />
        </button>
      ) : null}
    </div>
  );
}
