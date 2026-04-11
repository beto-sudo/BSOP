'use client';

import { useEffect } from 'react';

export default function AccesoError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('Acceso page error:', error);
  }, [error]);

  return (
    <div className="flex flex-col items-center justify-center py-24 text-center">
      <div className="text-4xl">⚠️</div>
      <h2 className="mt-4 text-xl font-semibold dark:text-white text-[var(--text)]">
        Error al cargar la página
      </h2>
      <p className="mt-2 max-w-md text-sm dark:text-white/55 text-[var(--text)]/55">
        {error.message || 'Ocurrió un error inesperado. Intenta de nuevo.'}
      </p>
      <button
        onClick={reset}
        className="mt-4 rounded-lg bg-white/10 px-4 py-2 text-sm font-medium hover:bg-white/20 transition-colors"
      >
        Reintentar
      </button>
    </div>
  );
}
