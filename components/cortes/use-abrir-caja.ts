'use client';

import { useState, useTransition } from 'react';
import { abrirCaja } from '@/app/rdb/cortes/actions';
import type { AbrirForm } from './abrir-caja-dialog';
import { fetchAbrirCajaContext } from './data';
import { todayRange } from './helpers';
import type { Caja } from './types';

const EMPTY_FORM: AbrirForm = {
  caja_id: '',
  responsable_apertura: '',
  efectivo_inicial: '',
  fecha_operativa: todayRange().from,
  auto_matched: false,
};

/**
 * Hook wiring all state for the Abrir Caja dialog — opens, loads cajas +
 * current user, auto-matches the user's caja by first-name substring, and
 * submits the apertura. Behavior preserved 1:1 from the original page.
 */
export function useAbrirCaja() {
  const [open, setOpen] = useState(false);
  const [cajas, setCajas] = useState<Caja[]>([]);
  const [, setLoadingCajas] = useState(false);
  const [form, setForm] = useState<AbrirForm>(EMPTY_FORM);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

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
    } catch {
      // non-fatal
    } finally {
      setLoadingCajas(false);
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
          efectivo_inicial: parseFloat(form.efectivo_inicial) || 0,
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
    error,
    isPending,
    openDialog,
    submit,
  };
}
