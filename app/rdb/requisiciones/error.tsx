'use client';

import { useEffect } from 'react';
import { Button } from '@/components/ui/button';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('RDB Requisiciones error boundary:', error);
  }, [error]);

  return (
    <div className="mx-auto max-w-2xl space-y-4 rounded-xl border border-destructive/30 bg-destructive/10 p-6 text-sm">
      <div className="text-lg font-semibold text-destructive">Error en Requisiciones</div>
      <p className="text-destructive/90">
        {error.message || 'Ocurrió un error al renderizar o procesar esta pantalla.'}
      </p>
      {error.digest ? (
        <p className="font-mono text-xs text-destructive/80">Digest: {error.digest}</p>
      ) : null}
      <div>
        <Button variant="outline" onClick={reset}>Intentar de nuevo</Button>
      </div>
    </div>
  );
}
