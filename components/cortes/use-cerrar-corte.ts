'use client';

import { useState, useTransition } from 'react';
import { cerrarCaja, type Denominacion } from '@/app/rdb/cortes/actions';
import { DENOMINACIONES_DEFAULT, type Corte } from './types';

/**
 * Hook wiring all state for the Cerrar Corte (denominación counter) dialog.
 * Keeps `cortes-view.tsx` focused on high-level composition. Behavior matches
 * the original single-file page exactly — open the dialog via `open(corte)`,
 * submit via `submit(onSuccess)`.
 */
export function useCerrarCorte() {
  const [open, setOpen] = useState(false);
  const [corte, setCorte] = useState<Corte | null>(null);
  const [denominaciones, setDenominaciones] = useState<Denominacion[]>(DENOMINACIONES_DEFAULT);
  const [observaciones, setObservaciones] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function openDialog(next: Corte) {
    setCorte(next);
    setDenominaciones(DENOMINACIONES_DEFAULT.map((d) => ({ ...d, cantidad: 0 })));
    setObservaciones('');
    setError(null);
    setOpen(true);
  }

  function updateCantidad(idx: number, val: string) {
    const n = parseInt(val) || 0;
    setDenominaciones((prev) =>
      prev.map((d, i) => (i === idx ? { ...d, cantidad: Math.max(0, n) } : d))
    );
  }

  function submit(onSuccess: () => void) {
    if (!corte) return;
    setError(null);
    startTransition(async () => {
      try {
        await cerrarCaja({
          corte_id: corte.id,
          denominaciones,
          observaciones: observaciones.trim() || undefined,
        });
        setOpen(false);
        setCorte(null);
        onSuccess();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Error al cerrar el corte');
      }
    });
  }

  return {
    open,
    setOpen,
    corte,
    denominaciones,
    observaciones,
    setObservaciones,
    error,
    isPending,
    openDialog,
    updateCantidad,
    submit,
  };
}
