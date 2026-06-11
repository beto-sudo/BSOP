'use client';

/**
 * Gobierno presupuestal en el tab Gasto (iniciativa
 * `dilesa-presupuesto-baseline` · Sprint 2):
 *
 * - `<BaselineBanner>` — estado del presupuesto inicial: autorizado (línea
 *   informativa con total/fecha) o pendiente (acción "Autorizar presupuesto
 *   inicial" para Dirección, con notas opcionales; congela via RPC).
 * - `<SolicitarCambioCard>` — card inline (patrón CosteoConceptoForm) para
 *   crear una orden de cambio (aditiva/deductiva + categoría + motivo
 *   obligatorio); al crear, fase 2 para adjuntar el soporte de la decisión.
 * - `<CambiosPendientesPanel>` — órdenes `solicitada`: Dirección autoriza o
 *   rechaza (motivo obligatorio); el solicitante puede retirar. El soporte
 *   (adjuntos) es visible para revisar ANTES de autorizar.
 *
 * La mutación de montos vive en RPCs de DB (S1); aquí solo UI + actions.
 */

import { useMemo, useState } from 'react';
import {
  CheckCircle2,
  FileText,
  Loader2,
  Lock,
  ShieldCheck,
  TriangleAlert,
  XCircle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { FileAttachments } from '@/components/file-attachments/file-attachments';
import { useToast } from '@/components/ui/toast';
import { formatCurrency } from '@/lib/format';
import {
  CATEGORIA_LABELS,
  CATEGORIAS,
  deltaFirmado,
  type BaselineInfo,
  type OrdenCambio,
  type OrdenCambioCategoria,
  type OrdenCambioTipo,
} from '@/lib/presupuesto/ordenes-cambio';
import {
  autorizarBaseline,
  cancelarCambio,
  resolverCambio,
  solicitarCambio,
} from '@/app/dilesa/proyectos/[id]/gasto/actions';

const fmtFecha = (iso: string) =>
  new Intl.DateTimeFormat('es-MX', { dateStyle: 'medium' }).format(new Date(iso));

// ─── Banner del baseline ─────────────────────────────────────────────────────

export function BaselineBanner({
  proyectoId,
  baseline,
  preliminaresCount,
  totalVigente,
  puedeAutorizar,
  onChanged,
}: {
  proyectoId: string;
  /** null = el proyecto aún no tiene presupuesto inicial autorizado. */
  baseline: BaselineInfo | null;
  /** Partidas en estado `preliminar` del proyecto (bloquean el congelado). */
  preliminaresCount: number;
  /** Σ presupuesto vigente de las partidas visibles (preview al congelar). */
  totalVigente: number;
  puedeAutorizar: boolean;
  onChanged: () => void;
}) {
  const toast = useToast();
  const [expandido, setExpandido] = useState(false);
  const [notas, setNotas] = useState('');
  const [submitting, setSubmitting] = useState(false);

  if (baseline) {
    return (
      <div className="flex flex-wrap items-center gap-2 rounded-md border border-emerald-500/20 bg-emerald-500/5 px-4 py-2.5 text-sm">
        <ShieldCheck className="h-4 w-4 shrink-0 text-emerald-500" />
        <span className="font-medium text-[var(--text)]">Presupuesto inicial autorizado</span>
        <span className="text-[var(--text)]/70">
          {formatCurrency(baseline.total)} · {baseline.partidasCount} partidas ·{' '}
          {fmtFecha(baseline.autorizadoAt)}
        </span>
        {baseline.notas ? <span className="text-[var(--text)]/50">— {baseline.notas}</span> : null}
        <span className="ml-auto inline-flex items-center gap-1 text-xs text-[var(--text)]/50">
          <Lock className="h-3 w-3" />
          Los montos solo cambian con orden de cambio autorizada
        </span>
      </div>
    );
  }

  return (
    <div className="rounded-md border border-amber-500/25 bg-amber-500/5 px-4 py-3 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <TriangleAlert className="h-4 w-4 shrink-0 text-amber-500" />
        <span className="font-medium text-[var(--text)]">
          Este proyecto no tiene presupuesto inicial autorizado
        </span>
        <span className="text-[var(--text)]/60">
          — las partidas se editan libremente (formación).
        </span>
        {puedeAutorizar && !expandido ? (
          <Button
            variant="outline"
            size="sm"
            className="ml-auto"
            onClick={() => setExpandido(true)}
          >
            <ShieldCheck className="size-4" />
            Autorizar presupuesto inicial
          </Button>
        ) : null}
      </div>

      {puedeAutorizar && expandido ? (
        <div className="mt-3 space-y-3 border-t border-[var(--border)]/60 pt-3">
          <p className="text-[var(--text)]/70">
            Congela el snapshot de todas las partidas activas como{' '}
            <strong>presupuesto original</strong> ({formatCurrency(totalVigente)} hoy). A partir de
            ahí, todo incremento o deductiva pasa por una orden de cambio autorizada por Dirección,
            con motivo y documentos de soporte.
          </p>
          {preliminaresCount > 0 ? (
            <p className="flex items-center gap-1.5 font-medium text-amber-600">
              <TriangleAlert className="h-3.5 w-3.5" />
              Hay {preliminaresCount} partida{preliminaresCount === 1 ? '' : 's'} en estado
              preliminar — autorízalas o descártalas antes de congelar.
            </p>
          ) : null}
          <div className="flex flex-wrap items-end gap-2">
            <div className="min-w-72 flex-1">
              <div className="mb-1 text-xs font-medium uppercase tracking-wide text-[var(--text)]/50">
                Notas (opcional — p. ej. referencia de la junta donde se aprobó)
              </div>
              <Input
                value={notas}
                onChange={(e) => setNotas(e.target.value)}
                placeholder="Aprobado en junta de consejo del…"
              />
            </div>
            <Button variant="outline" onClick={() => setExpandido(false)} disabled={submitting}>
              Cancelar
            </Button>
            <Button
              disabled={submitting || preliminaresCount > 0}
              onClick={async () => {
                setSubmitting(true);
                const r = await autorizarBaseline(proyectoId, notas);
                setSubmitting(false);
                if (!r.ok) {
                  toast.add({ title: 'No se pudo autorizar', description: r.error, type: 'error' });
                  return;
                }
                toast.add({
                  title: 'Presupuesto inicial autorizado',
                  description: 'El baseline quedó congelado; los cambios ahora van por orden.',
                  type: 'success',
                });
                setExpandido(false);
                onChanged();
              }}
            >
              {submitting ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <ShieldCheck className="size-4" />
              )}
              Congelar presupuesto inicial
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

// ─── Solicitud de orden de cambio (card inline) ──────────────────────────────

export function SolicitarCambioCard({
  empresaId,
  proyectoId,
  partida,
  onClose,
  onCreated,
}: {
  empresaId: string;
  proyectoId: string;
  partida: { id: string; concepto: string; vigente: number };
  onClose: () => void;
  /** Llamado al crear la orden (la card pasa a fase de adjuntos). */
  onCreated: () => void;
}) {
  const toast = useToast();
  const [tipo, setTipo] = useState<OrdenCambioTipo>('aditiva');
  const [monto, setMonto] = useState('');
  const [categoria, setCategoria] = useState<OrdenCambioCategoria>('alcance');
  const [motivo, setMotivo] = useState('');
  const [submitting, setSubmitting] = useState(false);
  /** Fase 2: orden creada → adjuntar soporte. */
  const [cambioId, setCambioId] = useState<string | null>(null);

  const montoNum = Number(monto);
  const montoValido = Number.isFinite(montoNum) && montoNum > 0;
  const nuevoVigente = montoValido
    ? partida.vigente + (tipo === 'aditiva' ? montoNum : -montoNum)
    : null;
  const dejaNegativo = nuevoVigente != null && nuevoVigente < 0;
  const canSubmit = montoValido && motivo.trim().length > 0 && !dejaNegativo;

  if (cambioId) {
    return (
      <div className="rounded-md border border-[var(--border)] bg-[var(--card)] p-4">
        <h2 className="mb-1 flex items-center gap-2 text-sm font-medium text-[var(--text)]">
          <CheckCircle2 className="h-4 w-4 text-emerald-500" />
          Orden de cambio solicitada · {partida.concepto}
        </h2>
        <p className="mb-3 text-xs text-[var(--text)]/60">
          Adjunta el soporte de la decisión (cotización, minuta, correo…) — es el expediente que
          ampara el cambio cuando se reconstruya la historia.
        </p>
        <div className="rounded border border-dashed border-[var(--border)] bg-[var(--bg)] p-1">
          <FileAttachments
            empresaId={empresaId}
            empresaSlug="dilesa"
            entidad="presupuesto_cambios"
            entidadId={cambioId}
            roles={[
              {
                id: 'soporte',
                label: 'Soporte de la decisión',
                icon: <FileText className="h-3 w-3" />,
              },
            ]}
            defaultUploadRole="soporte"
            variant="flat"
          />
        </div>
        <div className="mt-3 flex justify-end">
          <Button onClick={onClose}>Listo</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-md border border-[var(--border)] bg-[var(--card)] p-4">
      <h2 className="mb-3 text-sm font-medium uppercase tracking-wider text-[var(--text)]/60">
        Solicitar cambio de presupuesto · {partida.concepto}
      </h2>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
        <div>
          <div className="mb-1 text-xs font-medium uppercase tracking-wide text-[var(--text)]/50">
            Tipo *
          </div>
          <select
            value={tipo}
            onChange={(e) => setTipo(e.target.value as OrdenCambioTipo)}
            className="h-9 w-full rounded-md border border-[var(--border)] bg-[var(--card)] px-3 text-sm text-[var(--text)]"
          >
            <option value="aditiva">Aditiva (incrementa)</option>
            <option value="deductiva">Deductiva (disminuye)</option>
          </select>
        </div>
        <div>
          <div className="mb-1 text-xs font-medium uppercase tracking-wide text-[var(--text)]/50">
            Monto (c/IVA) *
          </div>
          <Input
            type="number"
            step="0.01"
            min="0"
            value={monto}
            onChange={(e) => setMonto(e.target.value)}
            placeholder="0.00"
          />
        </div>
        <div className="sm:col-span-2">
          <div className="mb-1 text-xs font-medium uppercase tracking-wide text-[var(--text)]/50">
            Categoría del motivo *
          </div>
          <select
            value={categoria}
            onChange={(e) => setCategoria(e.target.value as OrdenCambioCategoria)}
            className="h-9 w-full rounded-md border border-[var(--border)] bg-[var(--card)] px-3 text-sm text-[var(--text)]"
          >
            {CATEGORIAS.map((c) => (
              <option key={c} value={c}>
                {CATEGORIA_LABELS[c]}
              </option>
            ))}
          </select>
        </div>
        <div className="sm:col-span-4">
          <div className="mb-1 text-xs font-medium uppercase tracking-wide text-[var(--text)]/50">
            Motivo * (queda como expediente de la decisión)
          </div>
          <textarea
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            rows={2}
            placeholder="Por qué cambia el presupuesto de esta partida…"
            className="w-full rounded-md border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm text-[var(--text)]"
          />
        </div>
      </div>
      <p className="mt-2 text-[11px] text-[var(--text)]/60">
        Vigente actual: {formatCurrency(partida.vigente)}
        {nuevoVigente != null ? (
          <>
            {' → '}
            <span className={dejaNegativo ? 'font-medium text-red-600' : 'font-medium'}>
              {formatCurrency(nuevoVigente)}
            </span>
            {dejaNegativo ? ' — la deductiva no puede dejar la partida en negativo.' : ''}
          </>
        ) : null}{' '}
        El cambio aplica cuando Dirección lo autorice.
      </p>
      <div className="mt-3 flex items-center justify-end gap-2">
        <Button variant="outline" onClick={onClose} disabled={submitting}>
          Cancelar
        </Button>
        <Button
          disabled={!canSubmit || submitting}
          onClick={async () => {
            setSubmitting(true);
            const r = await solicitarCambio({
              proyectoId,
              partidaId: partida.id,
              tipo,
              monto: montoNum,
              categoria,
              motivo,
            });
            setSubmitting(false);
            if (!r.ok) {
              toast.add({ title: 'No se pudo solicitar', description: r.error, type: 'error' });
              return;
            }
            setCambioId(r.cambioId);
            onCreated();
          }}
        >
          {submitting ? <Loader2 className="size-4 animate-spin" /> : null}
          Solicitar cambio
        </Button>
      </div>
    </div>
  );
}

// ─── Panel de órdenes pendientes ─────────────────────────────────────────────

export function CambiosPendientesPanel({
  empresaId,
  ordenes,
  partidaLabelById,
  puedeAutorizar,
  puedeEscribir,
  onResolved,
}: {
  empresaId: string;
  /** Órdenes en estado `solicitada` del proyecto visible. */
  ordenes: readonly OrdenCambio[];
  partidaLabelById: ReadonlyMap<string, string>;
  puedeAutorizar: boolean;
  puedeEscribir: boolean;
  onResolved: () => void;
}) {
  const toast = useToast();
  const [resolviendo, setResolviendo] = useState<string | null>(null);
  const [rechazando, setRechazando] = useState<OrdenCambio | null>(null);
  const [retirando, setRetirando] = useState<OrdenCambio | null>(null);

  const ordenadas = useMemo(
    () => [...ordenes].sort((a, b) => a.solicitadoAt.localeCompare(b.solicitadoAt)),
    [ordenes]
  );

  if (ordenadas.length === 0) return null;

  async function resolver(
    orden: OrdenCambio,
    decision: 'autorizada' | 'rechazada',
    motivo?: string
  ) {
    setResolviendo(orden.id);
    const r = await resolverCambio(orden.id, decision, motivo);
    setResolviendo(null);
    if (!r.ok) {
      toast.add({ title: 'No se pudo resolver', description: r.error, type: 'error' });
      return;
    }
    toast.add({
      title: decision === 'autorizada' ? 'Cambio autorizado' : 'Cambio rechazado',
      description: partidaLabelById.get(orden.partidaId) ?? '',
      type: 'success',
    });
    onResolved();
  }

  return (
    <div className="rounded-md border border-[var(--border)] bg-[var(--card)]">
      <div className="flex items-center gap-2 border-b border-[var(--border)] px-4 py-2.5">
        <TriangleAlert className="h-4 w-4 text-amber-500" />
        <h2 className="text-sm font-medium text-[var(--text)]">
          Órdenes de cambio por autorizar ({ordenadas.length})
        </h2>
        {!puedeAutorizar ? (
          <span className="text-xs text-[var(--text)]/50">— las resuelve Dirección</span>
        ) : null}
      </div>
      <ul className="divide-y divide-[var(--border)]/60">
        {ordenadas.map((o) => {
          const delta = deltaFirmado(o);
          return (
            <li key={o.id} className="space-y-2 px-4 py-3 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium text-[var(--text)]">
                  {partidaLabelById.get(o.partidaId) ?? 'Partida'}
                </span>
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
                  {CATEGORIA_LABELS[o.categoria]} · solicitada el {fmtFecha(o.solicitadoAt)}
                </span>
              </div>
              <p className="text-[var(--text)]/80">{o.motivo}</p>
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
                  readOnly={!puedeEscribir}
                />
              </div>
              <div className="flex items-center justify-end gap-2">
                {puedeEscribir ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={resolviendo === o.id}
                    onClick={() => setRetirando(o)}
                    className="text-[var(--text)]/60"
                  >
                    Retirar solicitud
                  </Button>
                ) : null}
                {puedeAutorizar ? (
                  <>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={resolviendo === o.id}
                      onClick={() => setRechazando(o)}
                      className="text-red-600 hover:bg-red-50 hover:text-red-700"
                    >
                      <XCircle className="size-4" />
                      Rechazar
                    </Button>
                    <Button
                      size="sm"
                      disabled={resolviendo === o.id}
                      onClick={() => void resolver(o, 'autorizada')}
                    >
                      {resolviendo === o.id ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : (
                        <CheckCircle2 className="size-4" />
                      )}
                      Autorizar
                    </Button>
                  </>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>

      <ConfirmDialog
        open={rechazando != null}
        onOpenChange={(open) => {
          if (!open) setRechazando(null);
        }}
        onConfirm={async (motivo) => {
          if (rechazando) await resolver(rechazando, 'rechazada', motivo);
          setRechazando(null);
        }}
        title="¿Rechazar la orden de cambio?"
        description="El presupuesto vigente no cambia. La orden queda en el expediente como rechazada."
        confirmLabel="Rechazar"
        requireMotivo
      />
      <ConfirmDialog
        open={retirando != null}
        onOpenChange={(open) => {
          if (!open) setRetirando(null);
        }}
        onConfirm={async () => {
          if (!retirando) return;
          const r = await cancelarCambio(retirando.id);
          if (!r.ok) {
            toast.add({ title: 'No se pudo retirar', description: r.error, type: 'error' });
          } else {
            toast.add({ title: 'Solicitud retirada', type: 'success' });
            onResolved();
          }
          setRetirando(null);
        }}
        title="¿Retirar la solicitud?"
        description="La orden queda cancelada sin afectar el presupuesto."
        confirmLabel="Retirar"
      />
    </div>
  );
}
