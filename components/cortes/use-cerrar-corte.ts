'use client';

import { useCallback, useState, useTransition } from 'react';
import { cerrarCaja, obtenerVouchersDelCorte, type Denominacion } from '@/app/rdb/cortes/actions';
import { DENOMINACIONES_DEFAULT, type Corte, type Voucher } from './types';

/**
 * Hook wiring all state for the Cerrar Corte dialog.
 *
 * Base flow (un solo paso): conteo de denominaciones → cerrarCaja.
 * Flow con tarjeta (wizard 2 pasos): conteo → vouchers → cerrarCaja.
 *
 * El modo wizard se activa solo cuando `corte.ingresos_tarjeta > 0`. Los
 * vouchers se persisten al subir (desde el VoucherUploader, server actions
 * directos) — el `submit` aquí solo cierra el corte. Validación dura: en
 * wizard no se permite cerrar si vouchers.length === 0.
 */
export function useCerrarCorte() {
  const [open, setOpen] = useState(false);
  const [corte, setCorte] = useState<Corte | null>(null);
  const [denominaciones, setDenominaciones] = useState<Denominacion[]>(DENOMINACIONES_DEFAULT);
  const [observaciones, setObservaciones] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [step, setStep] = useState<1 | 2>(1);
  const [vouchers, setVouchers] = useState<Voucher[]>([]);
  const [loadingVouchers, setLoadingVouchers] = useState(false);

  const isWizard = (corte?.ingresos_tarjeta ?? 0) > 0;

  const loadVouchers = useCallback(async (corteId: string) => {
    setLoadingVouchers(true);
    try {
      const vs = await obtenerVouchersDelCorte(corteId);
      setVouchers(vs);
    } catch {
      // No bloquear el wizard si falla — el uploader re-carga al subir.
      setVouchers([]);
    } finally {
      setLoadingVouchers(false);
    }
  }, []);

  function openDialog(next: Corte) {
    setCorte(next);
    setDenominaciones(DENOMINACIONES_DEFAULT.map((d) => ({ ...d, cantidad: 0 })));
    setObservaciones('');
    setError(null);
    setStep(1);
    setVouchers([]);
    setOpen(true);
    // Pre-carga en wizard para ver vouchers ya adjuntos previamente.
    if ((next.ingresos_tarjeta ?? 0) > 0) {
      void loadVouchers(next.id);
    }
  }

  function updateCantidad(idx: number, val: string) {
    const n = parseInt(val) || 0;
    setDenominaciones((prev) =>
      prev.map((d, i) => (i === idx ? { ...d, cantidad: Math.max(0, n) } : d))
    );
  }

  function goNext() {
    if (step === 1 && isWizard) setStep(2);
  }

  function goBack() {
    if (step === 2) setStep(1);
  }

  function onVoucherUploaded(v: Voucher) {
    setVouchers((prev) => [...prev, v]);
  }

  function onVoucherRemoved(id: string) {
    setVouchers((prev) => prev.filter((v) => v.id !== id));
  }

  function submit(onSuccess: () => void) {
    if (!corte) return;
    if (isWizard && vouchers.length === 0) {
      setError('Debes subir al menos un voucher antes de cerrar el corte.');
      return;
    }
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
        setStep(1);
        setVouchers([]);
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
    // Wizard
    isWizard,
    step,
    goNext,
    goBack,
    vouchers,
    loadingVouchers,
    onVoucherUploaded,
    onVoucherRemoved,
  };
}
