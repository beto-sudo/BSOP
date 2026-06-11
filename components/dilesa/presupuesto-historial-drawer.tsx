'use client';

/**
 * Historial presupuestal de una partida (iniciativa
 * `dilesa-presupuesto-baseline` · Sprint 2): el lugar único para
 * reconstruir cómo y por qué llegó el monto vigente — baseline (original) +
 * todas las órdenes de cambio (autorizadas, rechazadas, canceladas y
 * pendientes) con motivo, quién/cuándo y documentos de soporte.
 */

import { useEffect, useState } from 'react';
import { FileText, Lock, ShieldCheck } from 'lucide-react';
import { createSupabaseBrowserClient } from '@/lib/supabase-browser';
import { DetailDrawer, DetailDrawerContent } from '@/components/detail-page/detail-drawer';
import { Badge, type BadgeTone } from '@/components/ui/badge';
import { FileAttachments } from '@/components/file-attachments/file-attachments';
import { formatCurrency } from '@/lib/format';
import {
  CATEGORIA_LABELS,
  ESTADO_LABELS,
  deltaFirmado,
  type BaselineInfo,
  type OrdenCambio,
  type OrdenCambioEstado,
} from '@/lib/presupuesto/ordenes-cambio';

const ESTADO_TONE: Record<OrdenCambioEstado, BadgeTone> = {
  solicitada: 'warning',
  autorizada: 'success',
  rechazada: 'danger',
  cancelada: 'neutral',
};

const fmtFechaHora = (iso: string) =>
  new Intl.DateTimeFormat('es-MX', { dateStyle: 'medium', timeStyle: 'short' }).format(
    new Date(iso)
  );

/**
 * Resuelve nombres de usuario para el audit trail. Falla silencioso a Map
 * vacío (la UI muestra solo fechas) — el historial no depende de poder leer
 * `core.usuarios`. Compartido con `<PresupuestoTimeline>`.
 */
export function useUsuarioNombres(ids: readonly (string | null)[]) {
  const [nombres, setNombres] = useState<Map<string, string>>(new Map());
  const key = [...new Set(ids.filter(Boolean) as string[])].sort().join(',');

  useEffect(() => {
    if (!key) return;
    let activo = true;
    (async () => {
      const sb = createSupabaseBrowserClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (sb.schema('core') as any)
        .from('usuarios')
        .select('id, first_name, email')
        .in('id', key.split(','));
      if (!activo || error || !data) return;
      const m = new Map<string, string>();
      for (const u of data as { id: string; first_name: string | null; email: string }[]) {
        m.set(u.id, u.first_name || u.email);
      }
      setNombres(m);
    })();
    return () => {
      activo = false;
    };
  }, [key]);

  return nombres;
}

export function PresupuestoHistorialDrawer({
  open,
  onOpenChange,
  empresaId,
  partida,
  baseline,
  montoBaseline,
  cambiosNetos,
  ordenes,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  empresaId: string;
  partida: { id: string; concepto: string; vigente: number } | null;
  baseline: BaselineInfo | null;
  /** Snapshot original de ESTA partida (null = nació después del baseline). */
  montoBaseline: number | null;
  cambiosNetos: number;
  /** Todas las órdenes de la partida (cualquier estado), cronológicas. */
  ordenes: readonly OrdenCambio[];
}) {
  const nombres = useUsuarioNombres(
    ordenes.flatMap((o) => [o.solicitadoPor, o.resueltoPor]).concat(baseline?.autorizadoPor ?? null)
  );
  if (!partida) return null;

  const quien = (id: string | null) => (id ? (nombres.get(id) ?? '—') : '—');
  const original = montoBaseline ?? (baseline ? 0 : null);

  return (
    <DetailDrawer
      open={open}
      onOpenChange={onOpenChange}
      title={partida.concepto}
      description="Historia del presupuesto de la partida — original, cambios y su soporte."
      size="md"
    >
      <DetailDrawerContent>
        <div className="space-y-4">
          {/* Resumen del invariante: original + cambios = vigente */}
          <div className="grid grid-cols-3 gap-2 rounded-md border border-[var(--border)] bg-[var(--card)] p-3 text-center">
            <div>
              <div className="text-xs uppercase tracking-wide text-[var(--text)]/50">Original</div>
              <div className="font-semibold tabular-nums text-[var(--text)]">
                {original == null ? '—' : formatCurrency(original)}
              </div>
            </div>
            <div>
              <div className="text-xs uppercase tracking-wide text-[var(--text)]/50">Cambios</div>
              <div
                className={`font-semibold tabular-nums ${cambiosNetos < 0 ? 'text-amber-600' : 'text-[var(--text)]'}`}
              >
                {cambiosNetos === 0
                  ? '—'
                  : `${cambiosNetos > 0 ? '+' : ''}${formatCurrency(cambiosNetos)}`}
              </div>
            </div>
            <div>
              <div className="text-xs uppercase tracking-wide text-[var(--text)]/50">Vigente</div>
              <div className="font-semibold tabular-nums text-[var(--text)]">
                {formatCurrency(partida.vigente)}
              </div>
            </div>
          </div>

          {/* Documentos de la partida (soporte del estimado — formación) */}
          <div className="rounded border border-dashed border-[var(--border)] bg-[var(--bg)] p-1">
            <FileAttachments
              empresaId={empresaId}
              empresaSlug="dilesa"
              entidad="presupuesto_partidas"
              entidadId={partida.id}
              roles={[
                {
                  id: 'soporte',
                  label: 'Documentos de la partida',
                  icon: <FileText className="h-3 w-3" />,
                },
              ]}
              defaultUploadRole="soporte"
              variant="flat"
              readOnly
            />
          </div>

          {/* Punto de partida: baseline */}
          {baseline ? (
            <div className="flex flex-wrap items-center gap-2 rounded-md border border-emerald-500/20 bg-emerald-500/5 px-3 py-2 text-sm">
              <ShieldCheck className="h-4 w-4 text-emerald-500" />
              <span className="font-medium text-[var(--text)]">Presupuesto inicial</span>
              <span className="tabular-nums text-[var(--text)]/80">
                {original == null ? '—' : formatCurrency(original)}
              </span>
              <span className="text-xs text-[var(--text)]/50">
                congelado el {fmtFechaHora(baseline.autorizadoAt)} por{' '}
                {quien(baseline.autorizadoPor)}
                {montoBaseline == null ? ' · la partida nació después del baseline (en $0)' : ''}
              </span>
            </div>
          ) : (
            <div className="flex items-center gap-2 rounded-md border border-[var(--border)] px-3 py-2 text-sm text-[var(--text)]/60">
              <Lock className="h-4 w-4" />
              El proyecto aún no tiene presupuesto inicial autorizado; la partida se edita
              libremente.
            </div>
          )}

          {/* Órdenes (cronológicas) */}
          {ordenes.length === 0 ? (
            <p className="text-sm text-[var(--text)]/60">
              Sin órdenes de cambio para esta partida.
            </p>
          ) : (
            <ul className="space-y-3">
              {[...ordenes]
                .sort((a, b) => a.solicitadoAt.localeCompare(b.solicitadoAt))
                .map((o) => {
                  const delta = deltaFirmado(o);
                  return (
                    <li
                      key={o.id}
                      className="space-y-2 rounded-md border border-[var(--border)] bg-[var(--card)] p-3 text-sm"
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge tone={ESTADO_TONE[o.estado]}>{ESTADO_LABELS[o.estado]}</Badge>
                        <Badge tone={o.tipo === 'aditiva' ? 'info' : 'warning'}>
                          {o.tipo === 'aditiva' ? 'Aditiva' : 'Deductiva'}
                        </Badge>
                        <span
                          className={`font-semibold tabular-nums ${delta < 0 ? 'text-amber-600' : 'text-[var(--text)]'}`}
                        >
                          {delta > 0 ? '+' : ''}
                          {formatCurrency(delta)}
                        </span>
                        <span className="text-xs text-[var(--text)]/50">
                          {CATEGORIA_LABELS[o.categoria]}
                        </span>
                      </div>
                      <p className="text-[var(--text)]/80">{o.motivo}</p>
                      {o.estado === 'rechazada' && o.motivoRechazo ? (
                        <p className="text-xs text-red-600">Rechazo: {o.motivoRechazo}</p>
                      ) : null}
                      <p className="text-xs text-[var(--text)]/50">
                        Solicitada el {fmtFechaHora(o.solicitadoAt)} por {quien(o.solicitadoPor)}
                        {o.resueltoAt
                          ? ` · resuelta el ${fmtFechaHora(o.resueltoAt)} por ${quien(o.resueltoPor)}`
                          : ''}
                        {o.estado === 'autorizada' && o.montoAntes != null && o.montoDespues != null
                          ? ` · ${formatCurrency(o.montoAntes)} → ${formatCurrency(o.montoDespues)}`
                          : ''}
                      </p>
                      <div className="rounded border border-dashed border-[var(--border)] bg-[var(--bg)] p-1">
                        <FileAttachments
                          empresaId={empresaId}
                          empresaSlug="dilesa"
                          entidad="presupuesto_cambios"
                          entidadId={o.id}
                          roles={[
                            {
                              id: 'soporte',
                              label: 'Soporte de la decisión',
                              icon: <FileText className="h-3 w-3" />,
                            },
                          ]}
                          defaultUploadRole="soporte"
                          variant="flat"
                          readOnly
                        />
                      </div>
                    </li>
                  );
                })}
            </ul>
          )}
        </div>
      </DetailDrawerContent>
    </DetailDrawer>
  );
}
