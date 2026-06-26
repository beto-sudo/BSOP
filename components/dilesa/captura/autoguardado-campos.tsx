'use client';

/**
 * Autoguardado de campos de captura de fase (iniciativa `dilesa-autoguardado-captura`,
 * ADR-051). Generaliza el patrón que la fase 10 (Firmas Programadas) ya usaba para la
 * fecha/hora: lo que se teclea persiste solo —debounced— sin esperar al botón que avanza
 * la fase, igual que un documento persiste al soltarlo.
 *
 * El hook NO sabe de tablas ni RPCs: la fase provee `guardar()` (UPDATE directo a
 * `dilesa.ventas` para campos simples, o la RPC auditada donde exista — ADR-051 D3) y las
 * dos "firmas" (serialización de lo actual vs lo último guardado). El hook orquesta el
 * debounce, el de-dup (no guarda si nada cambió) y el estado visible.
 *
 * Uso:
 *   const persistido = { fecha: venta.fecha ?? '' };       // lo que está en la DB
 *   const actual = { fecha };                               // estado del form
 *   const auto = useAutoguardadoCampos({
 *     clave: JSON.stringify(actual),
 *     claveGuardada: JSON.stringify(persistido),
 *     habilitado: puedeEscribir && !bloqueado,
 *     guardar: async () => {
 *       const { error } = await sb.schema('dilesa').from('ventas').update({...}).eq('id', id);
 *       if (error) return { ok: false, error: error.message };
 *       setVenta(v => ({ ...v, fecha }));                   // refresca la firma guardada
 *       return { ok: true };
 *     },
 *   });
 *   // <IndicadorAutoguardado estado={auto.estado} error={auto.error} />
 */

import { useEffect, useRef, useState } from 'react';
import { Check, Loader2, TriangleAlert } from 'lucide-react';

export type EstadoAutoguardado = 'idle' | 'guardando' | 'guardado' | 'error';

export type AutoguardadoResult = { estado: EstadoAutoguardado; error: string | null };

export function useAutoguardadoCampos(opts: {
  /** Firma serializable de los valores actuales del form (cambia ⇒ hay algo que guardar). */
  clave: string;
  /** Firma de lo último persistido con éxito (la fase la refresca dentro de `guardar`). */
  claveGuardada: string;
  /** false = no autoguardar (sin permiso, bloqueado por lock/rol, o cargando). */
  habilitado: boolean;
  /** Persiste los campos. Debe refrescar la firma guardada al tener éxito. */
  guardar: () => Promise<{ ok: boolean; error?: string }>;
  /** ms de espera tras el último cambio (default 700). */
  debounceMs?: number;
}): AutoguardadoResult {
  const { clave, claveGuardada, habilitado, guardar, debounceMs = 700 } = opts;
  const [estado, setEstado] = useState<EstadoAutoguardado>('idle');
  const [error, setError] = useState<string | null>(null);
  // Ref a `guardar` para no re-disparar el efecto cuando cambia su identidad
  // (closure nuevo en cada render); el debounce depende solo de las firmas. El ref
  // se actualiza en un efecto (no durante el render) para cumplir react-hooks/refs.
  const guardarRef = useRef(guardar);
  useEffect(() => {
    guardarRef.current = guardar;
  });

  useEffect(() => {
    if (!habilitado) return;
    if (clave === claveGuardada) return; // nada cambió respecto a lo guardado
    let activo = true;
    const t = setTimeout(async () => {
      setEstado('guardando');
      setError(null);
      const r = await guardarRef.current();
      if (!activo) return;
      if (r.ok) {
        setEstado('guardado');
      } else {
        setEstado('error');
        setError(r.error ?? 'No se pudo guardar.');
      }
    }, debounceMs);
    return () => {
      activo = false;
      clearTimeout(t);
    };
  }, [clave, claveGuardada, habilitado, debounceMs]);

  return { estado, error };
}

/** Indicador discreto del estado de autoguardado, para poner junto al título de la sección. */
export function IndicadorAutoguardado({
  estado,
  error,
}: {
  estado: EstadoAutoguardado;
  error?: string | null;
}) {
  if (estado === 'idle') return null;
  if (estado === 'guardando') {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] text-[var(--text)]/50">
        <Loader2 className="size-3 animate-spin" /> Guardando…
      </span>
    );
  }
  if (estado === 'guardado') {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] text-emerald-600 dark:text-emerald-400">
        <Check className="size-3" /> Guardado
      </span>
    );
  }
  return (
    <span
      className="inline-flex items-center gap-1 text-[11px] text-amber-700 dark:text-amber-300"
      title={error ?? undefined}
    >
      <TriangleAlert className="size-3" /> No se guardó
    </span>
  );
}
