'use client';

import { useEffect } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

import { Button } from '@/components/ui/button';

/**
 * Canonical module-level error boundary.
 *
 * Wraps Next.js `error.tsx` boundaries with a consistent look & feel:
 *   - scoped title ("Error en <module>")
 *   - the underlying error message (when present)
 *   - `error.digest` for correlating with server logs (truncated, monospace)
 *   - a "Reintentar" button wired to the `reset` callback
 *
 * This is the UX standard referenced by `ARCHITECTURE.md § UI Standards`.
 * Per-module `error.tsx` files should be thin wrappers around this component
 * so the presentation stays uniform across the product.
 *
 * @example
 *   // app/rh/error.tsx
 *   'use client';
 *   import { ModuleError } from '@/components/shared/module-error';
 *   export default function Error(props: {
 *     error: Error & { digest?: string };
 *     reset: () => void;
 *   }) {
 *     return <ModuleError {...props} moduleName="RH" />;
 *   }
 */
export type ModuleErrorProps = {
  /**
   * Human-readable module label — e.g. `"RH"`, `"RDB"`, `"Settings"`.
   * Shown in the heading ("Error en {moduleName}") and in the console log.
   */
  moduleName: string;
  /**
   * Optional override for the default message shown under the heading.
   * Defaults to the error's own `message`, then to a generic fallback.
   */
  description?: string;
  /**
   * The error thrown while rendering. Next.js augments the error with an
   * opaque `digest` used to look the error up in server logs.
   */
  error: Error & { digest?: string };
  /**
   * Reset callback provided by Next.js. Re-renders the boundary's segment.
   */
  reset: () => void;
};

export function ModuleError({ moduleName, description, error, reset }: ModuleErrorProps) {
  useEffect(() => {
    // Surface the error to the browser console so it's visible in Sentry-less
    // preview deploys. Format matches the pre-existing `app/rdb/requisiciones`
    // and `app/settings/acceso` boundaries.
    console.error(`[${moduleName}] error boundary:`, error);
  }, [moduleName, error]);

  const message =
    description ?? error.message ?? 'Ocurrió un error inesperado al renderizar esta pantalla.';

  return (
    <div
      role="alert"
      aria-live="polite"
      className="mx-auto my-10 max-w-2xl rounded-xl border border-destructive/30 bg-destructive/10 p-6"
    >
      <div className="flex items-start gap-3">
        <AlertTriangle className="mt-0.5 h-5 w-5 flex-none text-destructive" aria-hidden="true" />
        <div className="min-w-0 flex-1 space-y-3">
          <div>
            <h2 className="text-lg font-semibold text-destructive">Error en {moduleName}</h2>
            <p className="mt-1 text-sm text-destructive/90 break-words">{message}</p>
          </div>

          {error.digest ? (
            <p className="font-mono text-xs text-destructive/70">Digest: {error.digest}</p>
          ) : null}

          <div className="pt-1">
            <Button variant="outline" size="sm" onClick={reset} className="gap-1.5">
              <RefreshCw className="h-3.5 w-3.5" />
              Reintentar
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
