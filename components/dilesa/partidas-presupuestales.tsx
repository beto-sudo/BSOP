'use client';

/**
 * `<PartidasPresupuestales>` — vista del presupuesto del proyecto
 * agrupado por estado del ciclo de vida.
 *
 * Sprint 2 de `dilesa-proyectos-checklist-inline`. Reemplaza la tabla
 * read-only que vivía en `<AnteproyectoDetalle>` con un componente
 * reusable (Sprint 3 lo espejará en el detalle del desarrollo).
 *
 * Lectura: lee de `dilesa.proyecto_presupuesto_partidas` con su
 * `estado` discriminator. Las partidas con `tarea_origen_id` no-null
 * vinieron auto-vinculadas desde la captura inline de monto en una
 * tarea de cotización (`updateTareaMonto` server action).
 *
 * Escritura: server action `autorizarPartida` mueve una preliminar a
 * autorizada. Sprint 2 solo expone este transition; los demás
 * (planeada → en_ejercicio → cerrada) los dispara la maquinaria de
 * estimaciones existente.
 */

import { useMemo, useState, useTransition } from 'react';
import { Badge, type BadgeTone } from '@/components/ui/badge';
import { autorizarPartida } from '@/app/dilesa/proyectos/anteproyectos/actions';
import { PARTIDA_ESTADOS_VALIDOS, type PartidaEstado } from './tareas-checklist-types';

const moneyFmt = new Intl.NumberFormat('es-MX', {
  style: 'currency',
  currency: 'MXN',
  maximumFractionDigits: 0,
});

export type PartidaRow = {
  id: string;
  partida: string;
  descripcion: string | null;
  monto_estimado: number | null;
  monto_aprobado: number | null;
  monto_ejercido: number | null;
  fuente: string | null;
  estado: string;
  tarea_origen_id: string | null;
  autorizado_at: string | null;
};

const ESTADO_TONE: Record<string, BadgeTone> = {
  preliminar: 'neutral',
  autorizada: 'info',
  planeada: 'info',
  en_ejercicio: 'warning',
  cerrada: 'success',
};
const ESTADO_LABEL: Record<string, string> = {
  preliminar: 'Preliminar',
  autorizada: 'Autorizada',
  planeada: 'Planeada',
  en_ejercicio: 'En ejercicio',
  cerrada: 'Cerrada',
};

/**
 * Agrupa las partidas por estado. Exportado para tests + cálculo de
 * resumen. Estados sin partidas no se devuelven en el map.
 */
export function groupByEstado(partidas: readonly PartidaRow[]): Map<PartidaEstado, PartidaRow[]> {
  const out = new Map<PartidaEstado, PartidaRow[]>();
  for (const p of partidas) {
    const est = (PARTIDA_ESTADOS_VALIDOS as readonly string[]).includes(p.estado)
      ? (p.estado as PartidaEstado)
      : ('preliminar' as PartidaEstado);
    const arr = out.get(est) ?? [];
    arr.push(p);
    out.set(est, arr);
  }
  return out;
}

/**
 * Suma totales por estado. Sprint 2 muestra estos en el header de
 * cada grupo.
 */
export function totalesPorEstado(partidas: readonly PartidaRow[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const p of partidas) {
    const v = p.monto_aprobado ?? p.monto_estimado ?? 0;
    out[p.estado] = (out[p.estado] ?? 0) + v;
  }
  return out;
}

export function PartidasPresupuestales({
  partidas,
  onChange,
}: {
  partidas: readonly PartidaRow[];
  onChange?: () => void;
}) {
  if (partidas.length === 0) {
    return (
      <p className="text-sm text-[var(--text)]/60">
        Sin partidas todavía. Captura un monto en alguna tarea de cotización del checklist para que
        aparezca aquí como preliminar.
      </p>
    );
  }

  const grupos = groupByEstado(partidas);
  const totales = totalesPorEstado(partidas);

  return (
    <div className="space-y-4">
      {PARTIDA_ESTADOS_VALIDOS.filter((e) => grupos.has(e)).map((estado) => {
        const filas = grupos.get(estado) ?? [];
        return (
          <section key={estado}>
            <header className="mb-2 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Badge tone={ESTADO_TONE[estado] ?? 'neutral'}>
                  {ESTADO_LABEL[estado] ?? estado}
                </Badge>
                <span className="text-xs text-[var(--text)]/60">
                  {filas.length} {filas.length === 1 ? 'partida' : 'partidas'}
                </span>
              </div>
              <span className="text-sm tabular-nums text-[var(--text)]/80">
                {moneyFmt.format(totales[estado] ?? 0)}
              </span>
            </header>
            <div className="overflow-x-auto rounded-md border border-[var(--border)]">
              <table className="min-w-full text-sm">
                <thead className="text-xs uppercase text-[var(--text)]/50">
                  <tr className="border-b border-[var(--border)] bg-[var(--card)]">
                    <th className="py-2 px-3 text-left">Partida</th>
                    <th className="py-2 px-3 text-left">Fuente</th>
                    <th className="py-2 px-3 text-right">Estimado</th>
                    <th className="py-2 px-3 text-right">Aprobado</th>
                    <th className="py-2 px-3 text-right">Ejercido</th>
                    <th className="py-2 px-3 text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {filas.map((p) => (
                    <PartidaRowView key={p.id} partida={p} onChange={onChange} />
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        );
      })}
    </div>
  );
}

function PartidaRowView({ partida, onChange }: { partida: PartidaRow; onChange?: () => void }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const handleAutorizar = () => {
    setError(null);
    startTransition(async () => {
      const r = await autorizarPartida(partida.id);
      if (!r.ok) setError(r.error);
      else onChange?.();
    });
  };

  const origen = useMemo(() => {
    if (!partida.fuente) return null;
    if (partida.fuente === 'cotizacion' && partida.tarea_origen_id) {
      return 'cotización (auto)';
    }
    return partida.fuente;
  }, [partida.fuente, partida.tarea_origen_id]);

  return (
    <tr className="border-b border-[var(--border)]/40 last:border-0">
      <td className="py-2 px-3">
        <div className="font-medium text-[var(--text)]">{partida.partida}</div>
        {partida.descripcion && (
          <div className="text-xs text-[var(--text)]/60">{partida.descripcion}</div>
        )}
      </td>
      <td className="py-2 px-3 text-[var(--text)]/70">{origen ?? '—'}</td>
      <td className="py-2 px-3 text-right tabular-nums text-[var(--text)]/80">
        {partida.monto_estimado != null ? moneyFmt.format(partida.monto_estimado) : '—'}
      </td>
      <td className="py-2 px-3 text-right tabular-nums text-[var(--text)]/80">
        {partida.monto_aprobado != null ? moneyFmt.format(partida.monto_aprobado) : '—'}
      </td>
      <td className="py-2 px-3 text-right tabular-nums text-[var(--text)]/80">
        {partida.monto_ejercido != null && partida.monto_ejercido > 0
          ? moneyFmt.format(partida.monto_ejercido)
          : '—'}
      </td>
      <td className="py-2 px-3 text-right">
        {partida.estado === 'preliminar' ? (
          <button
            type="button"
            onClick={handleAutorizar}
            disabled={pending}
            className="h-7 rounded-md border border-[var(--border)] bg-[var(--accent)]/10 px-3 text-xs font-medium text-[var(--accent)] hover:bg-[var(--accent)]/20 disabled:opacity-50"
          >
            {pending ? 'Autorizando…' : 'Autorizar'}
          </button>
        ) : null}
        {error && <div className="mt-1 text-xs text-red-600/80">{error}</div>}
      </td>
    </tr>
  );
}
