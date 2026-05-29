'use client';

/**
 * `<TareaPasos>` — grid 1×4 horizontal con los 4 pasos canónicos.
 *
 * Sprint 3 de `dilesa-proyectos-checklist-inline`. Cada celda captura
 * monto + documento + fecha + estado (pendiente/hecho/N/A) + notas
 * para uno de los pasos: cotizacion · factura · pago · resultado.
 *
 * Sprint 3.5 (refactor 2026-05-29): el grid pasa de 2×2 a 1×4 para
 * aprovechar pantallas anchas (en mobile/tablet se apila). Botón
 * "Autorizar" en el paso cotización gateado por rol director.
 *
 * Se monta dentro del expand de `<TareasChecklist>` (1 fila por tarea
 * cuando está colapsada; este grid aparece debajo al hacer click).
 */

import { useEffect, useState, useTransition } from 'react';
import { Check, Circle, FileText, Minus, ShieldCheck } from 'lucide-react';
import { FileAttachments } from '@/components/file-attachments/file-attachments';
import { Badge } from '@/components/ui/badge';
import { autorizarPaso, upsertPaso } from '@/app/dilesa/proyectos/anteproyectos/actions';
import {
  type PasoEstado,
  type TareaPaso,
  TAREA_PASOS_VALIDOS,
  PASO_TO_PARTIDA_ESTADO,
} from './tareas-checklist-types';
import type { EmpresaSlug } from '@/lib/storage';

const moneyFmt = new Intl.NumberFormat('es-MX', {
  style: 'currency',
  currency: 'MXN',
  maximumFractionDigits: 0,
});

export type PasoRow = {
  id: string;
  tarea_id: string;
  paso: TareaPaso;
  monto: number | null;
  documento_url: string | null;
  fecha: string | null;
  estado: PasoEstado;
  notas: string | null;
  autorizado_at: string | null;
  autorizado_por: string | null;
};

/**
 * Pasos que requieren autorización adicional (rol director/admin).
 * v1: solo `cotizacion`. Extender si Beto pide para factura/pago.
 */
const PASOS_REQUIEREN_AUTORIZACION: ReadonlySet<TareaPaso> = new Set(['cotizacion']);

export function pasoRequiereAutorizacion(paso: TareaPaso): boolean {
  return PASOS_REQUIEREN_AUTORIZACION.has(paso);
}

/**
 * "Estado visual" del paso, derivado del estado + autorización.
 * Útil para la mini visualización en la fila compacta y para el badge
 * del header de cada celda.
 */
export type EstadoVisual =
  | 'pendiente'
  | 'hecho'
  | 'esperando_autorizacion'
  | 'autorizado'
  | 'no_aplica';

export function estadoVisualDePaso(p: PasoRow): EstadoVisual {
  if (p.estado === 'no_aplica') return 'no_aplica';
  if (p.estado === 'pendiente') return 'pendiente';
  // estado = 'hecho'
  if (pasoRequiereAutorizacion(p.paso)) {
    return p.autorizado_at ? 'autorizado' : 'esperando_autorizacion';
  }
  return 'hecho';
}

const PASO_LABEL: Record<TareaPaso, string> = {
  cotizacion: 'Cotización',
  factura: 'Factura',
  pago: 'Pago',
  resultado: 'Resultado',
};

/**
 * Calcula el avance % de una tarea: hechos / aplicables × 100.
 * Aplicables = pasos cuyo estado ≠ 'no_aplica'. Si no hay pasos
 * instanciados, devuelve 0. Exportado para tests.
 */
export function computeAvanceTarea(pasos: readonly PasoRow[]): number {
  const aplicables = pasos.filter((p) => p.estado !== 'no_aplica');
  if (aplicables.length === 0) return 0;
  const hechos = aplicables.filter((p) => p.estado === 'hecho').length;
  return Math.round((100 * hechos) / aplicables.length);
}

/**
 * Suma los montos capturados en los pasos financieros (cotización +
 * factura + pago). Útil para mostrar "$ acum." en la fila compacta.
 */
export function sumMontosPasos(pasos: readonly PasoRow[]): number {
  return pasos.reduce((acc, p) => {
    if (p.paso === 'resultado') return acc;
    return acc + (p.monto ?? 0);
  }, 0);
}

export function TareaPasos({
  tareaId,
  pasos: pasosProp,
  empresaId,
  empresaSlug,
  puedeAutorizar = false,
  onChange,
}: {
  tareaId: string;
  pasos: readonly PasoRow[];
  empresaId: string;
  empresaSlug: EmpresaSlug;
  /** Si true, el botón "Autorizar" se muestra en pasos pendientes de
   *  autorización. Default false. El padre resuelve el rol del usuario. */
  puedeAutorizar?: boolean;
  onChange?: () => void;
}) {
  // Index por paso para acceso O(1). Si falta algún paso lo tratamos
  // como pendiente vacío (la UI permite capturar y el upsert lo crea).
  const byPaso = new Map(pasosProp.map((p) => [p.paso, p]));

  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
      {TAREA_PASOS_VALIDOS.map((paso) => (
        <PasoCard
          key={paso}
          tareaId={tareaId}
          paso={paso}
          row={byPaso.get(paso) ?? null}
          empresaId={empresaId}
          empresaSlug={empresaSlug}
          puedeAutorizar={puedeAutorizar}
          onChange={onChange}
        />
      ))}
    </div>
  );
}

function PasoCard({
  tareaId,
  paso,
  row,
  empresaId,
  empresaSlug,
  puedeAutorizar,
  onChange,
}: {
  tareaId: string;
  paso: TareaPaso;
  row: PasoRow | null;
  empresaId: string;
  empresaSlug: EmpresaSlug;
  puedeAutorizar: boolean;
  onChange?: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [montoLocal, setMontoLocal] = useState(row?.monto != null ? String(row.monto) : '');
  const [fechaLocal, setFechaLocal] = useState(row?.fecha ?? '');

  // Sincroniza estado local cuando el prop cambia (refresh externo).
  useEffect(() => {
    let activo = true;
    void Promise.resolve().then(() => {
      if (!activo) return;
      setMontoLocal(row?.monto != null ? String(row.monto) : '');
      setFechaLocal(row?.fecha ?? '');
    });
    return () => {
      activo = false;
    };
  }, [row?.monto, row?.fecha]);

  const estado: PasoEstado = row?.estado ?? 'pendiente';
  const esFinanciero = paso !== 'resultado';
  const partidaSugerida = PASO_TO_PARTIDA_ESTADO[paso];

  const guardar = (patch: Parameters<typeof upsertPaso>[2]) => {
    setError(null);
    startTransition(async () => {
      const r = await upsertPaso(tareaId, paso, patch);
      if (!r.ok) setError(r.error);
      else onChange?.();
    });
  };

  const handleMontoBlur = () => {
    const trimmed = montoLocal.trim();
    const parsed = trimmed === '' ? null : Number(trimmed);
    if (parsed != null && (!Number.isFinite(parsed) || parsed < 0)) {
      setError('Monto debe ser número ≥ 0');
      return;
    }
    if (parsed === (row?.monto ?? null)) return;
    guardar({ monto: parsed });
  };

  const handleFechaBlur = () => {
    const next = fechaLocal === '' ? null : fechaLocal;
    if (next === (row?.fecha ?? null)) return;
    guardar({ fecha: next });
  };

  const handleEstadoToggle = (next: PasoEstado) => {
    if (next === estado) return;
    guardar({ estado: next });
  };

  const handleAutorizar = () => {
    setError(null);
    startTransition(async () => {
      const r = await autorizarPaso(tareaId, paso);
      if (!r.ok) setError(r.error);
      else onChange?.();
    });
  };

  const isNoAplica = estado === 'no_aplica';
  const isHecho = estado === 'hecho';
  const requiereAut = pasoRequiereAutorizacion(paso);
  const yaAutorizado = !!row?.autorizado_at;
  const esperandoAut = requiereAut && isHecho && !yaAutorizado;

  // Tonalidad del card según estado visual.
  const cardTone = isNoAplica
    ? 'border-[var(--border)] bg-[var(--card)]/30 opacity-50'
    : esperandoAut
      ? 'border-amber-300 bg-amber-50/40'
      : yaAutorizado
        ? 'border-emerald-300 bg-emerald-50/50'
        : isHecho
          ? 'border-emerald-200 bg-emerald-50/40'
          : 'border-[var(--border)] bg-[var(--bg)]';

  return (
    <div className={`rounded-md border p-3 transition-colors ${cardTone}`}>
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-1.5">
          <span className="truncate text-xs font-semibold uppercase tracking-wide text-[var(--text)]/70">
            {PASO_LABEL[paso]}
          </span>
          {partidaSugerida && (
            <Badge tone="neutral">
              <span className="text-[10px] normal-case">→ {partidaSugerida}</span>
            </Badge>
          )}
          {yaAutorizado && (
            <span title="Autorizado por dirección">
              <ShieldCheck className="h-3 w-3 text-emerald-600" aria-label="Autorizado" />
            </span>
          )}
        </div>
        <div className="flex items-center gap-0.5">
          <EstadoButton
            current={estado}
            target="pendiente"
            label="Pendiente"
            icon={<Circle className="h-3 w-3" />}
            disabled={pending}
            onClick={() => handleEstadoToggle('pendiente')}
          />
          <EstadoButton
            current={estado}
            target="hecho"
            label="Hecho"
            icon={<Check className="h-3 w-3" />}
            disabled={pending}
            onClick={() => handleEstadoToggle('hecho')}
          />
          <EstadoButton
            current={estado}
            target="no_aplica"
            label="N/A"
            icon={<Minus className="h-3 w-3" />}
            disabled={pending}
            onClick={() => handleEstadoToggle('no_aplica')}
          />
        </div>
      </div>

      {!isNoAplica && (
        <div className="space-y-2">
          {esFinanciero && (
            <div className="flex items-center gap-2">
              <input
                type="number"
                inputMode="decimal"
                step="0.01"
                value={montoLocal}
                onChange={(e) => setMontoLocal(e.target.value)}
                onBlur={handleMontoBlur}
                disabled={pending}
                placeholder="$ —"
                className="h-7 flex-1 rounded-md border border-[var(--border)] bg-[var(--bg)] px-2 text-right text-xs tabular-nums focus:border-[var(--accent)] focus:outline-none disabled:opacity-50"
                aria-label={`Monto de ${PASO_LABEL[paso]}`}
              />
              <input
                type="date"
                value={fechaLocal}
                onChange={(e) => setFechaLocal(e.target.value)}
                onBlur={handleFechaBlur}
                disabled={pending}
                className="h-7 rounded-md border border-[var(--border)] bg-[var(--bg)] px-2 text-xs focus:border-[var(--accent)] focus:outline-none disabled:opacity-50"
                aria-label={`Fecha de ${PASO_LABEL[paso]}`}
              />
            </div>
          )}

          {!esFinanciero && (
            <input
              type="date"
              value={fechaLocal}
              onChange={(e) => setFechaLocal(e.target.value)}
              onBlur={handleFechaBlur}
              disabled={pending}
              className="h-7 w-full rounded-md border border-[var(--border)] bg-[var(--bg)] px-2 text-xs focus:border-[var(--accent)] focus:outline-none disabled:opacity-50"
              aria-label={`Fecha de entrega del resultado`}
            />
          )}

          <div className="rounded border border-dashed border-[var(--border)] bg-[var(--bg)] p-1">
            <FileAttachments
              empresaId={empresaId}
              empresaSlug={empresaSlug}
              entidad="proyecto_tarea_pasos"
              entidadId={row?.id ?? ''}
              roles={[
                { id: paso, label: PASO_LABEL[paso], icon: <FileText className="h-3 w-3" /> },
              ]}
              defaultUploadRole={paso}
              variant="flat"
              readOnly={!row?.id}
              onChange={onChange}
            />
            {!row?.id && (
              <p className="px-1 text-[10px] text-[var(--text)]/50">
                Captura monto o estado primero para habilitar subida de archivos.
              </p>
            )}
          </div>

          {esFinanciero && row?.monto != null && row.monto > 0 && (
            <p className="text-[10px] tabular-nums text-[var(--text)]/60">
              {moneyFmt.format(row.monto)}
              {row.fecha ? ` · ${row.fecha}` : ''}
            </p>
          )}

          {esperandoAut && (
            <div className="mt-1 rounded-md border border-amber-300 bg-amber-100/60 px-2 py-1.5 text-[11px] text-amber-900">
              <div className="font-medium">Esperando autorización</div>
              {puedeAutorizar ? (
                <button
                  type="button"
                  onClick={handleAutorizar}
                  disabled={pending}
                  className="mt-1 inline-flex h-6 items-center gap-1 rounded border border-amber-400 bg-amber-200 px-2 text-[11px] font-medium text-amber-900 hover:bg-amber-300 disabled:opacity-50"
                >
                  <ShieldCheck className="h-3 w-3" />
                  {pending ? 'Autorizando…' : 'Autorizar'}
                </button>
              ) : (
                <span className="text-amber-800/70">Requiere rol de dirección.</span>
              )}
            </div>
          )}

          {yaAutorizado && row?.autorizado_at && (
            <p className="text-[10px] text-emerald-700">
              Autorizado {row.autorizado_at.slice(0, 10)}
            </p>
          )}
        </div>
      )}

      {error && <p className="mt-2 text-[11px] text-red-600/80">{error}</p>}
    </div>
  );
}

function EstadoButton({
  current,
  target,
  label,
  icon,
  disabled,
  onClick,
}: {
  current: PasoEstado;
  target: PasoEstado;
  label: string;
  icon: React.ReactNode;
  disabled: boolean;
  onClick: () => void;
}) {
  const active = current === target;
  const tone =
    target === 'hecho'
      ? active
        ? 'bg-emerald-100 text-emerald-700'
        : 'text-[var(--text)]/40 hover:bg-emerald-50 hover:text-emerald-600'
      : target === 'no_aplica'
        ? active
          ? 'bg-[var(--card)] text-[var(--text)]/70'
          : 'text-[var(--text)]/40 hover:bg-[var(--card)]'
        : active
          ? 'bg-[var(--card)] text-[var(--text)]'
          : 'text-[var(--text)]/40 hover:bg-[var(--card)]';
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || active}
      title={label}
      aria-label={label}
      className={`inline-flex h-6 w-6 items-center justify-center rounded transition-colors disabled:cursor-default ${tone}`}
    >
      {icon}
    </button>
  );
}
