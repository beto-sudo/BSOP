'use client';

import { useCallback, useState, useTransition } from 'react';
import { cerrarCaja, obtenerVouchersDelCorte, type Denominacion } from '@/app/rdb/cortes/actions';
import { fetchCorteIngresosTarjeta } from './data';
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
  // Ingresos por tarjeta autoritativos (rdb.v_cortes_totales), resueltos al abrir
  // el diálogo. Se inicializa optimista con el valor del list view y se corrige
  // con el fetch — así el paso de Vouchers aparece aunque el list view venga con
  // lag de Waitry (mismo criterio que el guard server-side de cerrarCaja).
  const [ingresosTarjeta, setIngresosTarjeta] = useState(0);

  const isWizard = ingresosTarjeta > 0;

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
    // Optimista desde el list view; se corrige abajo con la fuente autoritativa.
    const listTarjeta = next.ingresos_tarjeta ?? 0;
    setIngresosTarjeta(listTarjeta);
    setOpen(true);
    if (listTarjeta > 0) {
      void loadVouchers(next.id);
    }
    // Resolver ingresos_tarjeta autoritativos (rdb.v_cortes_totales). Si el list
    // view venía en 0 por lag y aquí resulta > 0, activamos el wizard y cargamos
    // los vouchers adjuntos para que el cajero pueda subir antes de cerrar.
    void fetchCorteIngresosTarjeta(next.id).then((auth) => {
      setIngresosTarjeta(auth);
      if (auth > 0 && listTarjeta === 0) void loadVouchers(next.id);
    });
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
