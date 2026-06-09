'use client';

/**
 * HiloGastoStepper — el "viaje" de una compra, visible desde cualquier
 * documento del ciclo P2P (iniciativa `dilesa-flujo-gasto` · Sprint 1).
 *
 * Read-only: muestra los pasos del hilo (Solicitada → Cotizada → Ordenada /
 * Contratada → Recibida / Estimada → Facturada → Pagada) con el paso del
 * documento actual resaltado y los documentos ligados como links que abren su
 * módulo (`hrefDoc` — también es la fuente canónica del destino de cada tipo).
 *
 * Carga lazy: el fetch corre al montar (el componente vive dentro de drawers
 * y paneles de detalle, nunca en listados). Si el documento no tiene hilo
 * (p. ej. factura suelta de RDB sin OC), igual pinta su mini-hilo
 * Facturada → Pagada — data-driven, sin gate por empresa.
 */

import { useEffect, useState } from 'react';
import { Check, Loader2, Minus, X } from 'lucide-react';
import { createSupabaseBrowserClient } from '@/lib/supabase-browser';
import {
  buildHiloPasos,
  fetchHiloRegistros,
  hrefDoc,
  type HiloDoc,
  type HiloGasto,
  type HiloPaso,
} from '@/lib/gasto/hilo';

const DOT: Record<HiloPaso['estado'], string> = {
  hecho: 'bg-emerald-500/15 text-emerald-600',
  parcial: 'bg-amber-500/15 text-amber-600',
  actual: 'bg-[var(--accent)]/15 text-[var(--accent)]',
  pendiente: 'bg-[var(--card)] text-[var(--text)]/30 border border-[var(--border)]',
  cancelado: 'bg-red-500/10 text-red-600',
};

function PasoDot({ paso }: { paso: HiloPaso }) {
  return (
    <span
      className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${DOT[paso.estado]} ${
        paso.esActual ? 'ring-2 ring-[var(--accent)] ring-offset-1' : ''
      }`}
      aria-hidden
    >
      {paso.estado === 'hecho' ? (
        <Check className="h-3.5 w-3.5" />
      ) : paso.estado === 'cancelado' ? (
        <X className="h-3.5 w-3.5" />
      ) : paso.estado === 'parcial' ? (
        <Minus className="h-3.5 w-3.5" />
      ) : (
        <span className="h-1.5 w-1.5 rounded-full bg-current" />
      )}
    </span>
  );
}

export function HiloGastoStepper({
  empresa,
  documento,
}: {
  /** Slug de empresa para armar los hrefs (dilesa, rdb, …). */
  empresa: string;
  documento: HiloDoc;
}) {
  // Estado keyeado por documento: si la key no coincide (cambió la fila
  // seleccionada en el drawer) se renderiza loading en lugar del hilo stale —
  // sin reset síncrono dentro del effect (regla set-state-in-effect).
  const docKey = `${documento.tipo}:${documento.id}`;
  const [estado, setEstado] = useState<{
    docKey: string;
    hilo: HiloGasto | null;
    error: string | null;
  }>({ docKey: '', hilo: null, error: null });

  useEffect(() => {
    let activo = true;
    const sb = createSupabaseBrowserClient();
    fetchHiloRegistros(sb, documento)
      .then((registros) => {
        if (activo) setEstado({ docKey, hilo: buildHiloPasos(registros, documento), error: null });
      })
      .catch((e: Error) => {
        if (activo) setEstado({ docKey, hilo: null, error: e.message });
      });
    return () => {
      activo = false;
    };
  }, [docKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const { hilo, error } = estado.docKey === docKey ? estado : { hilo: null, error: null };

  if (error) {
    return <p className="text-xs text-[var(--text)]/50">No se pudo cargar el hilo: {error}</p>;
  }
  if (!hilo) {
    return (
      <p className="flex items-center gap-1.5 text-xs text-[var(--text)]/50">
        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Cargando hilo…
      </p>
    );
  }

  return (
    <ol className="flex items-start gap-0 overflow-x-auto pb-1" aria-label="Hilo del gasto">
      {hilo.pasos.map((paso, i) => (
        <li key={paso.key} className="flex min-w-0 flex-1 items-start">
          {i > 0 ? (
            <span className="mt-3 h-px w-3 shrink-0 bg-[var(--border)] sm:w-5" aria-hidden />
          ) : null}
          <div className="flex min-w-[84px] flex-col items-center gap-1 px-1 text-center">
            <PasoDot paso={paso} />
            <span
              className={`text-xs leading-tight ${
                paso.esActual
                  ? 'font-semibold text-[var(--text)]'
                  : paso.estado === 'pendiente'
                    ? 'text-[var(--text)]/45'
                    : 'text-[var(--text)]/80'
              }`}
            >
              {paso.label}
            </span>
            {paso.detalle ? (
              <span className="text-[11px] leading-tight text-[var(--text)]/50">
                {paso.detalle}
              </span>
            ) : null}
            {paso.refs.length > 0 ? (
              <span className="flex max-w-full flex-col items-center">
                {paso.refs.slice(0, 3).map((ref) => {
                  const href = ref.id === documento.id ? null : hrefDoc(empresa, ref.tipo, ref.id);
                  return href ? (
                    <a
                      key={ref.id}
                      href={href}
                      className="max-w-full truncate text-[11px] font-medium text-[var(--accent)] underline-offset-2 hover:underline"
                    >
                      {ref.codigo}
                    </a>
                  ) : (
                    <span
                      key={ref.id}
                      className="max-w-full truncate text-[11px] font-medium text-[var(--text)]/70"
                    >
                      {ref.codigo}
                    </span>
                  );
                })}
                {paso.refs.length > 3 ? (
                  <span className="text-[11px] text-[var(--text)]/50">+{paso.refs.length - 3}</span>
                ) : null}
              </span>
            ) : null}
          </div>
        </li>
      ))}
    </ol>
  );
}

/**
 * Sección lista para insertar en drawers (título uniforme + stepper).
 * Los módulos la montan tras su separador correspondiente.
 */
export function HiloGastoSection({ empresa, documento }: { empresa: string; documento: HiloDoc }) {
  return (
    <section className="space-y-2 text-sm">
      <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        Hilo del gasto
      </div>
      <HiloGastoStepper empresa={empresa} documento={documento} />
    </section>
  );
}
