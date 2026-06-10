'use client';

/**
 * `<TareasChecklist>` — checklist compacto de tareas con captura inline.
 *
 * Sprint 1 de `dilesa-proyectos-checklist-inline` (refactor UI 2026-05-29
 * tras feedback de Beto: "cada tarea en un solo renglón, más limpio y
 * organizado").
 *
 * Layout: tabla HTML compacta con sticky header y una fila por tarea.
 * Cada fila colapsada (default) muestra los campos resumen + 3 acciones
 * inline (estado dropdown, monto si cotización, indicadores doc/notas).
 * Click en la fila expande un panel inline debajo con `<FileAttachments>`
 * completo, textarea de notas, descripción canónica y dependencias
 * bloqueantes en texto largo.
 *
 * Server actions con whitelist por campo (Sprint 1). Optimistic UI con
 * rollback. Sprint 3 reusará este mismo componente en el detalle del
 * desarrollo filtrando por `aplicacion_snapshot`.
 */

import { Fragment, useCallback, useEffect, useMemo, useState, useTransition } from 'react';
import { ChevronRight, MessageSquare, Paperclip } from 'lucide-react';
import { Badge, type BadgeTone } from '@/components/ui/badge';
import { updateTareaEstado, updateTareaNotas } from '@/app/dilesa/proyectos/anteproyectos/actions';
import { TAREA_ESTADOS_VALIDOS, type TareaEstado } from './tareas-checklist-types';
import { TareaCicloReal } from './tarea-ciclo-real';
import {
  TareaPasos,
  type PasoRow,
  type EstadoVisual,
  computeAvanceTarea,
  estadoVisualDePaso,
  sumMontosPasos,
} from './tarea-pasos';
import type { EmpresaSlug } from '@/lib/storage';

const moneyFmt = new Intl.NumberFormat('es-MX', {
  style: 'currency',
  currency: 'MXN',
  maximumFractionDigits: 0,
});

export type TareaChecklistRow = {
  id: string;
  titulo: string;
  descripcion: string | null;
  estado: string;
  orden: number;
  tipo_snapshot: string | null;
  subtipo_snapshot: string | null;
  entidad_responsable_snapshot: string | null;
  obligatoriedad_snapshot: string | null;
  requiere_archivo_snapshot: boolean | null;
  fecha_objetivo_inicio: string | null;
  fecha_objetivo_fin: string | null;
  fecha_completada: string | null;
  resultado_monto: number | null;
  resultado_documento_url: string | null;
  plantilla_tarea_id: string | null;
};

export type TareaDependencia = {
  tarea_id: string;
  depende_de_tarea_id: string;
};

export type { PasoRow } from './tarea-pasos';

const ESTADO_TONE: Record<string, BadgeTone> = {
  pendiente: 'neutral',
  bloqueada: 'warning',
  en_curso: 'info',
  completada: 'success',
  cancelada: 'neutral',
};
const ESTADO_LABEL: Record<string, string> = {
  pendiente: 'Pendiente',
  bloqueada: 'Bloqueada',
  en_curso: 'En curso',
  completada: 'Completada',
  cancelada: 'Cancelada',
};

const OBLIG_TONE: Record<string, BadgeTone> = {
  obligatoria: 'danger',
  opcional: 'neutral',
  condicional: 'info',
};

const moneyFmtCompact = new Intl.NumberFormat('es-MX', {
  style: 'currency',
  currency: 'MXN',
  notation: 'compact',
  maximumFractionDigits: 1,
});

/**
 * Formatea una fecha ISO (YYYY-MM-DD) en formato compacto "dd/mmm" para
 * caber en columna estrecha. Null → "—".
 */
function fmtFechaCorta(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(`${iso}T00:00:00`);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('es-MX', { day: '2-digit', month: 'short' }).replace('.', '');
}

/**
 * Calcula qué tareas están bloqueadas por dependencias incompletas.
 * Devuelve mapa `tareaId → titulos de bloqueantes incompletas`.
 */
export function computeBloqueadasMap(
  tareas: readonly TareaChecklistRow[],
  deps: readonly TareaDependencia[]
): Map<string, string[]> {
  const tareaById = new Map(tareas.map((t) => [t.id, t]));
  const result = new Map<string, string[]>();
  for (const d of deps) {
    const dep = tareaById.get(d.depende_de_tarea_id);
    if (!dep) continue;
    if (dep.estado === 'completada' || dep.estado === 'cancelada') continue;
    const arr = result.get(d.tarea_id) ?? [];
    arr.push(dep.titulo);
    result.set(d.tarea_id, arr);
  }
  return result;
}

export function TareasChecklist({
  tareas: tareasInicial,
  dependencias,
  pasos,
  empresaId,
  empresaSlug,
  puedeAutorizar = false,
  proyectoId,
  partidasPorTarea,
  onChange,
}: {
  tareas: readonly TareaChecklistRow[];
  dependencias: readonly TareaDependencia[];
  pasos: readonly PasoRow[];
  empresaId: string;
  empresaSlug: EmpresaSlug;
  puedeAutorizar?: boolean;
  /** Para el link al tab Gasto desde el ciclo real (fase 2 dilesa-flujo-gasto). */
  proyectoId?: string;
  /** tareaId → partida canónica creada por la tarea (tarea_origen_id). */
  partidasPorTarea?: ReadonlyMap<string, { id: string; concepto: string }>;
  onChange?: () => void;
}) {
  const tareasSource: readonly TareaChecklistRow[] = Array.isArray(tareasInicial)
    ? tareasInicial
    : [];
  // Estado local — optimistic. Rollback si la server action falla.
  const [tareas, setTareas] = useState<TareaChecklistRow[]>([...tareasSource]);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Sincroniza state local cuando el padre nos pasa nuevas tareas. Comparamos
  // shallow por id+estado+monto+url+notas para no re-sincronizar al re-renderear
  // con la misma data. setState va dentro de useEffect (regla React 19).
  const fingerprint = tareasSource
    .map((t) => `${t.id}:${t.estado}:${t.resultado_monto ?? ''}:${t.resultado_documento_url ?? ''}`)
    .join('|');
  useEffect(() => {
    setTareas([...tareasSource]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fingerprint]);

  const bloqueadasMap = useMemo(
    () => computeBloqueadasMap(tareas, dependencias),
    [tareas, dependencias]
  );

  const pasosPorTarea = useMemo(() => {
    const m = new Map<string, PasoRow[]>();
    for (const p of pasos) {
      const arr = m.get(p.tarea_id) ?? [];
      arr.push(p);
      m.set(p.tarea_id, arr);
    }
    return m;
  }, [pasos]);

  const patchLocal = useCallback((id: string, patch: Partial<TareaChecklistRow>) => {
    setTareas((prev) => prev.map((t) => (t.id === id ? { ...t, ...patch } : t)));
  }, []);

  const toggleExpand = useCallback((id: string) => {
    setExpandedId((prev) => (prev === id ? null : id));
  }, []);

  if (tareas.length === 0) {
    return <p className="text-sm text-[var(--text)]/60">Sin tareas instanciadas todavía.</p>;
  }

  return (
    <div className="space-y-2">
      {error && (
        <p className="rounded-md border border-red-200 bg-red-50 p-2 text-sm text-red-700">
          {error}
        </p>
      )}
      <div className="overflow-x-auto rounded-md border border-[var(--border)]">
        <table className="min-w-full text-sm">
          <thead className="bg-[var(--card)] text-xs uppercase tracking-wide text-[var(--text)]/50">
            <tr className="border-b border-[var(--border)]">
              <th className="w-8 px-2 py-2 text-center">#</th>
              <th className="px-3 py-2 text-left">Tarea</th>
              <th className="hidden w-32 px-2 py-2 text-left lg:table-cell">Entidad</th>
              <th className="w-36 px-2 py-2 text-left">Estado</th>
              <th className="w-20 px-2 py-2 text-left">Vence</th>
              <th className="w-40 px-2 py-2 text-center">
                <span className="block">C · F · P · R</span>
                <span className="block text-[9px] normal-case tracking-normal text-[var(--text)]/40">
                  cotiz · factura · pago · result
                </span>
              </th>
              <th className="w-16 px-2 py-2 text-right">Avance</th>
              <th className="w-24 px-2 py-2 text-right">$ acum.</th>
              <th className="w-12 px-2 py-2 text-center" aria-label="Notas">
                <MessageSquare className="mx-auto h-3.5 w-3.5" />
              </th>
            </tr>
          </thead>
          <tbody>
            {tareas.map((t, idx) => (
              <Fragment key={t.id}>
                <TareaRowCompact
                  tarea={t}
                  pasos={pasosPorTarea.get(t.id) ?? []}
                  orden={idx + 1}
                  bloqueadaPor={bloqueadasMap.get(t.id) ?? []}
                  expanded={expandedId === t.id}
                  onToggleExpand={toggleExpand}
                  onPatch={patchLocal}
                  onError={setError}
                  onChange={onChange}
                />
                {expandedId === t.id && (
                  <TareaRowExpanded
                    tarea={t}
                    pasos={pasosPorTarea.get(t.id) ?? []}
                    bloqueadaPor={bloqueadasMap.get(t.id) ?? []}
                    empresaId={empresaId}
                    empresaSlug={empresaSlug}
                    puedeAutorizar={puedeAutorizar}
                    proyectoId={proyectoId}
                    partida={partidasPorTarea?.get(t.id) ?? null}
                    onPatch={patchLocal}
                    onError={setError}
                    onChange={onChange}
                  />
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Fila compacta (default — 1 renglón) ────────────────────────────────────

function TareaRowCompact({
  tarea,
  pasos,
  orden,
  bloqueadaPor,
  expanded,
  onToggleExpand,
  onPatch,
  onError,
  onChange,
}: {
  tarea: TareaChecklistRow;
  pasos: readonly PasoRow[];
  orden: number;
  bloqueadaPor: string[];
  expanded: boolean;
  onToggleExpand: (id: string) => void;
  onPatch: (id: string, patch: Partial<TareaChecklistRow>) => void;
  onError: (msg: string | null) => void;
  onChange?: () => void;
}) {
  const [pending, startTransition] = useTransition();

  const avance = useMemo(() => computeAvanceTarea(pasos), [pasos]);
  const montoAcum = useMemo(() => sumMontosPasos(pasos), [pasos]);

  const tieneNotas = !!(tarea.descripcion && tarea.descripcion.trim() !== '');
  const completada = tarea.estado === 'completada' || avance === 100;

  const handleEstadoChange = useCallback(
    (next: TareaEstado) => {
      const prev = tarea.estado;
      onPatch(tarea.id, {
        estado: next,
        fecha_completada: next === 'completada' ? new Date().toISOString().slice(0, 10) : null,
      });
      startTransition(async () => {
        const r = await updateTareaEstado(tarea.id, next);
        if (!r.ok) {
          onPatch(tarea.id, { estado: prev });
          onError(r.error);
        } else {
          onError(null);
          onChange?.();
        }
      });
    },
    [tarea.id, tarea.estado, onPatch, onError, onChange]
  );

  return (
    <tr
      className={`border-b border-[var(--border)]/60 transition-colors hover:bg-[var(--card)]/60 ${
        expanded ? 'bg-[var(--card)]/40' : ''
      } ${completada ? 'text-[var(--text)]/60' : ''}`}
    >
      <td className="px-2 py-1.5 text-center text-xs text-[var(--text)]/40 tabular-nums">
        {orden}
      </td>
      <td className="px-3 py-1.5">
        <button
          type="button"
          onClick={() => onToggleExpand(tarea.id)}
          className="-mx-1 flex w-full items-center gap-1.5 rounded px-1 py-0.5 text-left hover:bg-[var(--card)]/80"
        >
          <ChevronRight
            className={`h-3.5 w-3.5 text-[var(--text)]/40 transition-transform ${
              expanded ? 'rotate-90' : ''
            }`}
          />
          <span
            className={`flex-1 truncate font-medium ${
              completada ? 'line-through' : 'text-[var(--text)]'
            }`}
          >
            {tarea.titulo}
          </span>
          {tarea.obligatoriedad_snapshot && tarea.obligatoriedad_snapshot !== 'opcional' && (
            <Badge tone={OBLIG_TONE[tarea.obligatoriedad_snapshot] ?? 'neutral'}>
              {tarea.obligatoriedad_snapshot === 'obligatoria' ? 'obl.' : 'cond.'}
            </Badge>
          )}
          {bloqueadaPor.length > 0 && (
            <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-700">
              bloqueada
            </span>
          )}
        </button>
      </td>
      <td className="hidden px-2 py-1.5 text-xs text-[var(--text)]/70 lg:table-cell">
        <span className="block truncate">
          {tarea.entidad_responsable_snapshot ?? <span className="text-[var(--text)]/30">—</span>}
        </span>
      </td>
      <td className="px-2 py-1.5">
        <select
          value={tarea.estado}
          disabled={pending}
          onChange={(e) => handleEstadoChange(e.target.value as TareaEstado)}
          onClick={(e) => e.stopPropagation()}
          className={`h-7 w-full rounded-md border bg-[var(--bg)] px-1.5 text-xs disabled:opacity-50 ${
            ESTADO_TONE[tarea.estado] === 'success'
              ? 'border-emerald-300 text-emerald-700'
              : ESTADO_TONE[tarea.estado] === 'warning'
                ? 'border-amber-300 text-amber-700'
                : ESTADO_TONE[tarea.estado] === 'info'
                  ? 'border-sky-300 text-sky-700'
                  : 'border-[var(--border)] text-[var(--text)]'
          }`}
          aria-label={`Estado de ${tarea.titulo}`}
        >
          {TAREA_ESTADOS_VALIDOS.map((e) => (
            <option key={e} value={e}>
              {ESTADO_LABEL[e] ?? e}
            </option>
          ))}
        </select>
      </td>
      <td className="px-2 py-1.5 text-xs text-[var(--text)]/70 tabular-nums">
        {fmtFechaCorta(tarea.fecha_objetivo_fin)}
      </td>
      <td className="px-2 py-1.5 text-center">
        <PasosMini pasos={pasos} />
      </td>
      <td className="px-2 py-1.5 text-right">
        <AvanceBar pct={avance} />
      </td>
      <td className="px-2 py-1.5 text-right text-xs tabular-nums text-[var(--text)]/70">
        {montoAcum > 0 ? (
          moneyFmtCompact.format(montoAcum)
        ) : (
          <span className="text-[var(--text)]/30">—</span>
        )}
      </td>
      <td className="px-2 py-1.5 text-center">
        <button
          type="button"
          onClick={() => onToggleExpand(tarea.id)}
          className="inline-flex h-6 w-6 items-center justify-center rounded hover:bg-[var(--card)]"
          aria-label={tieneNotas ? 'Ver notas' : 'Agregar notas'}
        >
          <MessageSquare
            className={`h-3.5 w-3.5 ${
              tieneNotas ? 'text-[var(--accent)]' : 'text-[var(--text)]/25'
            }`}
          />
        </button>
      </td>
    </tr>
  );
}

// ─── Fila expandida (panel de captura inline) ───────────────────────────────

function TareaRowExpanded({
  tarea,
  pasos,
  bloqueadaPor,
  empresaId,
  empresaSlug,
  puedeAutorizar,
  proyectoId,
  partida,
  onPatch,
  onError,
  onChange,
}: {
  tarea: TareaChecklistRow;
  pasos: readonly PasoRow[];
  bloqueadaPor: string[];
  empresaId: string;
  empresaSlug: EmpresaSlug;
  puedeAutorizar: boolean;
  proyectoId?: string;
  partida?: { id: string; concepto: string } | null;
  onPatch: (id: string, patch: Partial<TareaChecklistRow>) => void;
  onError: (msg: string | null) => void;
  onChange?: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [notasLocal, setNotasLocal] = useState(tarea.descripcion ?? '');

  useEffect(() => {
    let activo = true;
    void Promise.resolve().then(() => {
      if (!activo) return;
      setNotasLocal(tarea.descripcion ?? '');
    });
    return () => {
      activo = false;
    };
  }, [tarea.descripcion]);

  const handleNotasBlur = useCallback(() => {
    const next = notasLocal.trim() === '' ? null : notasLocal;
    if (next === tarea.descripcion) return;
    const prev = tarea.descripcion;
    onPatch(tarea.id, { descripcion: next });
    startTransition(async () => {
      const r = await updateTareaNotas(tarea.id, next);
      if (!r.ok) {
        onPatch(tarea.id, { descripcion: prev });
        setNotasLocal(prev ?? '');
        onError(r.error);
      } else {
        onError(null);
        onChange?.();
      }
    });
  }, [notasLocal, tarea.id, tarea.descripcion, onPatch, onError, onChange]);

  return (
    <tr className="border-b border-[var(--border)]/60 bg-[var(--card)]/30">
      <td colSpan={7} className="px-3 py-3">
        {/* Ciclo real (fase 2 dilesa-flujo-gasto): solo cuando la tarea ya
            originó una partida canónica — el stepper muestra RFQ/OC/factura/
            pago reales anclados a ella. */}
        {partida && proyectoId ? (
          <div className="mb-3">
            <TareaCicloReal
              empresaId={empresaId}
              proyectoId={proyectoId}
              partidaId={partida.id}
              concepto={partida.concepto}
            />
          </div>
        ) : null}
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-[var(--text)]/60">
            {tarea.tipo_snapshot && (
              <span>
                {tarea.tipo_snapshot}
                {tarea.subtipo_snapshot ? ` · ${tarea.subtipo_snapshot}` : ''}
              </span>
            )}
            {tarea.entidad_responsable_snapshot && (
              <span>{tarea.entidad_responsable_snapshot}</span>
            )}
            {(tarea.fecha_objetivo_inicio || tarea.fecha_objetivo_fin) && (
              <span>
                Objetivo {fmtFechaCorta(tarea.fecha_objetivo_inicio)} →{' '}
                {fmtFechaCorta(tarea.fecha_objetivo_fin)}
              </span>
            )}
            {tarea.fecha_completada && (
              <span className="text-emerald-700">Completada {tarea.fecha_completada}</span>
            )}
          </div>

          {bloqueadaPor.length > 0 && (
            <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              <strong>Bloqueada por:</strong> {bloqueadaPor.join(', ')}
            </p>
          )}

          <TareaPasos
            tareaId={tarea.id}
            pasos={pasos}
            empresaId={empresaId}
            empresaSlug={empresaSlug}
            puedeAutorizar={puedeAutorizar}
            onChange={onChange}
          />

          <label className="block">
            <span className="mb-1 block text-[11px] uppercase tracking-wide text-[var(--text)]/50">
              Notas
            </span>
            <textarea
              value={notasLocal}
              onChange={(e) => setNotasLocal(e.target.value)}
              onBlur={handleNotasBlur}
              disabled={pending}
              rows={2}
              placeholder="Comentarios, contexto, decisión…"
              className="w-full rounded-md border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm focus:border-[var(--accent)] focus:outline-none disabled:opacity-50"
            />
          </label>
        </div>
      </td>
    </tr>
  );
}

// ─── Mini visualización de pasos (4 cuadrados en la fila compacta) ──────────

const PASO_ORDER: readonly ('cotizacion' | 'factura' | 'pago' | 'resultado')[] = [
  'cotizacion',
  'factura',
  'pago',
  'resultado',
];

const ESTADO_VISUAL_TONE: Record<EstadoVisual, string> = {
  pendiente: 'bg-[var(--border)]/40 border-[var(--border)]',
  hecho: 'bg-emerald-500 border-emerald-500',
  esperando_autorizacion: 'bg-amber-400 border-amber-500',
  autorizado: 'bg-emerald-600 border-emerald-600',
  no_aplica: 'bg-transparent border-[var(--border)]/40 border-dashed',
};

const ESTADO_VISUAL_LABEL: Record<EstadoVisual, string> = {
  pendiente: 'pendiente',
  hecho: 'hecho',
  esperando_autorizacion: 'esperando autorización',
  autorizado: 'autorizado',
  no_aplica: 'no aplica',
};

const PASO_SHORT_LABEL: Record<'cotizacion' | 'factura' | 'pago' | 'resultado', string> = {
  cotizacion: 'C',
  factura: 'F',
  pago: 'P',
  resultado: 'R',
};

function PasosMini({ pasos }: { pasos: readonly PasoRow[] }) {
  const byPaso = new Map(pasos.map((p) => [p.paso, p]));
  return (
    <div className="inline-flex items-center gap-1.5">
      {PASO_ORDER.map((paso) => {
        const row = byPaso.get(paso);
        const visual: EstadoVisual = row ? estadoVisualDePaso(row) : 'pendiente';
        const doc = row?.documento_url ?? null;
        const label = `${PASO_SHORT_LABEL[paso]}: ${ESTADO_VISUAL_LABEL[visual]}`;
        const baseCls = `inline-flex h-4 w-4 items-center justify-center rounded-sm border text-[9px] font-bold ${ESTADO_VISUAL_TONE[visual]}`;

        if (doc) {
          return (
            <a
              key={paso}
              href={doc}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              title={`${label} — click para abrir documento`}
              aria-label={`Abrir documento de ${PASO_SHORT_LABEL[paso]}`}
              className={`${baseCls} cursor-pointer ring-offset-1 transition-shadow hover:ring-2 hover:ring-[var(--accent)]/60`}
            >
              <span className="sr-only">{PASO_SHORT_LABEL[paso]} con documento adjunto</span>
            </a>
          );
        }
        return (
          <span key={paso} title={label} aria-label={label} className={baseCls}>
            <span className="sr-only">{PASO_SHORT_LABEL[paso]}</span>
          </span>
        );
      })}
    </div>
  );
}

// ─── Avance bar (mini barra horizontal para columna de avance) ──────────────

function AvanceBar({ pct }: { pct: number }) {
  const safe = Math.max(0, Math.min(100, pct));
  const tone =
    safe === 100
      ? 'bg-emerald-500'
      : safe >= 50
        ? 'bg-sky-500'
        : safe > 0
          ? 'bg-amber-500'
          : 'bg-[var(--border)]';
  return (
    <div className="flex items-center justify-end gap-1.5">
      <div className="h-1.5 w-12 overflow-hidden rounded-full bg-[var(--border)]/40">
        <div className={`h-full ${tone}`} style={{ width: `${safe}%` }} />
      </div>
      <span className="text-xs tabular-nums text-[var(--text)]/70">{safe}%</span>
    </div>
  );
}
