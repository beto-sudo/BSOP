'use client';

import { useState, useTransition } from 'react';
import { abrirCaja, previewEfectivoInicial } from '@/app/rdb/cortes/actions';
import type { AbrirForm } from './abrir-caja-dialog';
import { fetchAbrirCajaContext } from './data';
import { todayRange } from './helpers';
import type { Caja } from './types';

const EMPTY_FORM: AbrirForm = {
  caja_id: '',
  responsable_apertura: '',
  fecha_operativa: todayRange().from,
  auto_matched: false,
  efectivo_heredado_monto: 0,
  efectivo_heredado_es_heredado: false,
  efectivo_heredado_previo_sin_contar: false,
  efectivo_heredado_cerrado_at: null,
  efectivo_heredado_cargando: false,
};

/**
 * Hook wiring all state for the Abrir Caja dialog — opens, loads cajas +
 * current user, auto-matches the user's caja by first-name substring, and
 * submits the apertura. El efectivo inicial se hereda automáticamente del
 * cierre del último corte cerrado de la misma caja (server-side es la
 * fuente de verdad — el cliente solo previsualiza).
 */
export function useAbrirCaja() {
  const [open, setOpen] = useState(false);
  const [cajas, setCajas] = useState<Caja[]>([]);
  const [, setLoadingCajas] = useState(false);
  const [form, setForm] = useState<AbrirForm>(EMPTY_FORM);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  async function refetchEfectivoHeredado(cajaNombre: string) {
    setForm((f) => ({ ...f, efectivo_heredado_cargando: true }));
    try {
      const preview = await previewEfectivoInicial(cajaNombre);
      setForm((f) => ({
        ...f,
        efectivo_heredado_monto: preview.monto,
        efectivo_heredado_es_heredado: preview.heredado,
        efectivo_heredado_previo_sin_contar: preview.previo_sin_contar,
        efectivo_heredado_cerrado_at: preview.cerrado_at,
        efectivo_heredado_cargando: false,
      }));
    } catch {
      // Si falla el preview, el server lo recalcula al abrir; muestra $0 mientras.
      setForm((f) => ({
        ...f,
        efectivo_heredado_monto: 0,
        efectivo_heredado_es_heredado: false,
        efectivo_heredado_previo_sin_contar: false,
        efectivo_heredado_cerrado_at: null,
        efectivo_heredado_cargando: false,
      }));
    }
  }

  async function openDialog() {
    setOpen(true);
    setError(null);
    setLoadingCajas(true);
    try {
      const { cajas: cajasList, userName, firstName } = await fetchAbrirCajaContext();
      setCajas(cajasList);

      const matchedCaja = cajasList.find((c) =>
        c.nombre.toLowerCase().includes(firstName.toLowerCase())
      );

      setForm((f) => ({
        ...f,
        responsable_apertura: userName,
        caja_id: matchedCaja?.id ?? '',
        fecha_operativa: todayRange().from,
        auto_matched: !!matchedCaja,
      }));

      if (matchedCaja) {
        void refetchEfectivoHeredado(matchedCaja.nombre);
      }
    } catch {
      // non-fatal
    } finally {
      setLoadingCajas(false);
    }
  }

  function changeCaja(cajaId: string) {
    setForm((f) => ({ ...f, caja_id: cajaId }));
    const caja = cajas.find((c) => c.id === cajaId);
    if (caja) {
      void refetchEfectivoHeredado(caja.nombre);
    } else {
      // Combobox limpiado — resetear el preview.
      setForm((f) => ({
        ...f,
        efectivo_heredado_monto: 0,
        efectivo_heredado_es_heredado: false,
        efectivo_heredado_previo_sin_contar: false,
        efectivo_heredado_cerrado_at: null,
      }));
    }
  }

  function submit(onSuccess: () => void) {
    setError(null);
    const selectedCaja = cajas.find((c) => c.id === form.caja_id);
    if (!form.caja_id) {
      setError('Selecciona una caja.');
      return;
    }
    if (!form.responsable_apertura.trim()) {
      setError('Ingresa el nombre del responsable de apertura.');
      return;
    }

    startTransition(async () => {
      try {
        const result = await abrirCaja({
          caja_id: form.caja_id,
          caja_nombre: selectedCaja?.nombre ?? form.caja_id,
          responsable_apertura: form.responsable_apertura.trim(),
          fecha_operativa: form.fecha_operativa || todayRange().from,
        });

        if (!result.ok) {
          setError(result.error);
          return;
        }

        setOpen(false);
        setForm(EMPTY_FORM);
        onSuccess();
      } catch (err) {
        // Solo entra aquí por errores inesperados (red, parseo). Los errores
        // de negocio (duplicado, no autenticado, etc.) llegan en result.error.
        setError(err instanceof Error ? err.message : 'Error al abrir la caja');
      }
    });
  }

  return {
    open,
    setOpen,
    cajas,
    form,
    setForm,
    changeCaja,
    error,
    isPending,
    openDialog,
    submit,
  };
}
