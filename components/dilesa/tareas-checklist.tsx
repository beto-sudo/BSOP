'use client';

/**
 * `<TareasChecklist>` — checklist de tareas con captura inline.
 *
 * Sprint 1 de `dilesa-proyectos-checklist-inline`. Reemplaza la tabla
 * read-only que vivía en `<AnteproyectoDetalle>`. Cada tarea es una
 * card con:
 * - Header: título, badges (tipo/subtipo/obligatoriedad), dropdown
 *   estado, fechas objetivo.
 * - Captura: input monto (si subtipo='cotizacion'), `<FileAttachments>`
 *   inline (si requiere_archivo_snapshot), notas autosave debounced.
 * - Dependencias bloqueantes como chips.
 *
 * Server actions con whitelist por campo (Sprint 1). Optimistic UI
 * con rollback. Sprint 3 reusará este mismo componente en el detalle
 * del desarrollo filtrando por `aplicacion_snapshot`.
 */

import { useCallback, useEffect, useMemo, useState, useTransition } from 'react';
import { FileText } from 'lucide-react';
import { Badge, type BadgeTone } from '@/components/ui/badge';
import { FileAttachments } from '@/components/file-attachments/file-attachments';
import {
  updateTareaDocumento,
  updateTareaEstado,
  updateTareaMonto,
  updateTareaNotas,
} from '@/app/dilesa/proyectos/anteproyectos/actions';
import { TAREA_ESTADOS_VALIDOS, type TareaEstado } from './tareas-checklist-types';
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

function esCotizacion(t: TareaChecklistRow): boolean {
  return (t.subtipo_snapshot ?? '').toLowerCase().includes('cotizac');
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
  empresaId,
  empresaSlug,
  onChange,
}: {
  tareas: readonly TareaChecklistRow[];
  dependencias: readonly TareaDependencia[];
  empresaId: string;
  empresaSlug: EmpresaSlug;
  onChange?: () => void;
}) {
  // Guard defensivo: si el padre pasa algo que no es array (race condition
  // o data corrupta), tratamos como vacío para no romper el render.
  const tareasSource: readonly TareaChecklistRow[] = Array.isArray(tareasInicial)
    ? tareasInicial
    : [];
  // Estado local — optimistic. Rollback si la server action falla.
  const [tareas, setTareas] = useState<TareaChecklistRow[]>([...tareasSource]);
  const [error, setError] = useState<string | null>(null);

  // Sincroniza state local cuando el padre nos pasa nuevas tareas (refresh).
  // Comparación shallow por id+estado para evitar re-sincronizar la lista local
  // entera cuando llega el mismo dataset. setState va dentro de useEffect (no
  // de useMemo) para respetar la semántica de React 19.
  const idsEstados = tareasSource.map((t) => `${t.id}:${t.estado}`).join('|');
  useEffect(() => {
    setTareas([...tareasSource]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idsEstados, tareasSource.length]);

  const bloqueadasMap = useMemo(
    () => computeBloqueadasMap(tareas, dependencias),
    [tareas, dependencias]
  );

  const patchLocal = useCallback((id: string, patch: Partial<TareaChecklistRow>) => {
    setTareas((prev) => prev.map((t) => (t.id === id ? { ...t, ...patch } : t)));
  }, []);

  if (tareas.length === 0) {
    return <p className="text-sm text-[var(--text)]/60">Sin tareas instanciadas todavía.</p>;
  }

  return (
    <div className="space-y-3">
      {error && (
        <p className="rounded-md border border-red-200 bg-red-50 p-2 text-sm text-red-700">
          {error}
        </p>
      )}
      {tareas.map((t) => (
        <TareaCard
          key={t.id}
          tarea={t}
          bloqueadaPor={bloqueadasMap.get(t.id) ?? []}
          empresaId={empresaId}
          empresaSlug={empresaSlug}
          onPatch={patchLocal}
          onError={setError}
          onChange={onChange}
        />
      ))}
    </div>
  );
}

function TareaCard({
  tarea,
  bloqueadaPor,
  empresaId,
  empresaSlug,
  onPatch,
  onError,
  onChange,
}: {
  tarea: TareaChecklistRow;
  bloqueadaPor: string[];
  empresaId: string;
  empresaSlug: EmpresaSlug;
  onPatch: (id: string, patch: Partial<TareaChecklistRow>) => void;
  onError: (msg: string | null) => void;
  onChange?: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [montoLocal, setMontoLocal] = useState(
    tarea.resultado_monto != null ? String(tarea.resultado_monto) : ''
  );
  const [notasLocal, setNotasLocal] = useState(tarea.descripcion ?? '');
  const esCot = esCotizacion(tarea);
  const requiereArchivo = !!tarea.requiere_archivo_snapshot;

  const handleEstadoChange = (next: TareaEstado) => {
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
  };

  const handleMontoBlur = () => {
    const trimmed = montoLocal.trim();
    const parsed = trimmed === '' ? null : Number(trimmed);
    if (parsed != null && (!Number.isFinite(parsed) || parsed < 0)) {
      onError('Monto debe ser número ≥ 0');
      return;
    }
    if (parsed === tarea.resultado_monto) return;
    const prev = tarea.resultado_monto;
    onPatch(tarea.id, { resultado_monto: parsed });
    startTransition(async () => {
      const r = await updateTareaMonto(tarea.id, parsed);
      if (!r.ok) {
        onPatch(tarea.id, { resultado_monto: prev });
        setMontoLocal(prev != null ? String(prev) : '');
        onError(r.error);
      } else {
        onError(null);
        onChange?.();
      }
    });
  };

  const handleNotasBlur = () => {
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
  };

  const handleAttachmentsChange = () => {
    // Sprint 1 minimal: registramos la subida en `proyecto_tareas.resultado_documento_url`
    // como atajo de UI; el legajo completo vive en `erp.adjuntos`. La URL
    // efectiva la resolvemos pidiendo al componente que avise; el caller
    // refresca el detalle completo para traer la URL recién escrita por
    // server action.
    onChange?.();
  };

  // Como el slot de FileAttachments se monta inline sin "primer adjunto",
  // el shortcut `resultado_documento_url` se mantiene como referencia
  // textual editable hasta que el operador suba un archivo real (que
  // dispara onChange y refresca el legajo desde erp.adjuntos).
  const handleLimpiarDocumento = () => {
    const prev = tarea.resultado_documento_url;
    onPatch(tarea.id, { resultado_documento_url: null });
    startTransition(async () => {
      const r = await updateTareaDocumento(tarea.id, null);
      if (!r.ok) {
        onPatch(tarea.id, { resultado_documento_url: prev });
        onError(r.error);
      } else {
        onError(null);
        onChange?.();
      }
    });
  };

  const fechaCompletadaLabel = tarea.fecha_completada
    ? `Completada ${tarea.fecha_completada}`
    : tarea.fecha_objetivo_inicio || tarea.fecha_objetivo_fin
      ? `Objetivo ${tarea.fecha_objetivo_inicio ?? '—'} → ${tarea.fecha_objetivo_fin ?? '—'}`
      : null;

  return (
    <article className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h4 className="text-sm font-medium text-[var(--text)]">{tarea.titulo}</h4>
            {tarea.obligatoriedad_snapshot && (
              <Badge tone={OBLIG_TONE[tarea.obligatoriedad_snapshot] ?? 'neutral'}>
                {tarea.obligatoriedad_snapshot}
              </Badge>
            )}
            {tarea.tipo_snapshot && (
              <span className="text-xs text-[var(--text)]/60">
                {tarea.tipo_snapshot}
                {tarea.subtipo_snapshot ? ` · ${tarea.subtipo_snapshot}` : ''}
              </span>
            )}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-[var(--text)]/60">
            {tarea.entidad_responsable_snapshot && (
              <span>{tarea.entidad_responsable_snapshot}</span>
            )}
            {fechaCompletadaLabel && <span>{fechaCompletadaLabel}</span>}
          </div>
          {bloqueadaPor.length > 0 && (
            <p className="mt-2 text-xs text-amber-700">Bloqueada por: {bloqueadaPor.join(', ')}</p>
          )}
        </div>
        <select
          value={tarea.estado}
          disabled={pending}
          onChange={(e) => handleEstadoChange(e.target.value as TareaEstado)}
          className="h-8 rounded-md border border-[var(--border)] bg-[var(--bg)] px-2 text-xs text-[var(--text)] disabled:opacity-50"
          aria-label={`Estado de ${tarea.titulo}`}
        >
          {TAREA_ESTADOS_VALIDOS.map((e) => (
            <option key={e} value={e}>
              {ESTADO_LABEL[e] ?? e}
            </option>
          ))}
        </select>
      </header>

      <div className="mt-3 flex items-center gap-2">
        <Badge tone={ESTADO_TONE[tarea.estado] ?? 'neutral'}>
          {ESTADO_LABEL[tarea.estado] ?? tarea.estado}
        </Badge>
      </div>

      {(esCot || requiereArchivo) && (
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
          {esCot && (
            <label className="block text-xs">
              <span className="mb-1 block uppercase tracking-wide text-[var(--text)]/50">
                Monto cotizado (MXN)
              </span>
              <input
                type="number"
                inputMode="decimal"
                step="0.01"
                value={montoLocal}
                onChange={(e) => setMontoLocal(e.target.value)}
                onBlur={handleMontoBlur}
                disabled={pending}
                placeholder="0"
                className="h-9 w-full rounded-md border border-[var(--border)] bg-[var(--bg)] px-3 text-sm text-[var(--text)] focus:border-[var(--accent)] focus:outline-none disabled:opacity-50"
              />
              {tarea.resultado_monto != null && (
                <span className="mt-1 block text-xs text-[var(--text)]/60">
                  {moneyFmt.format(tarea.resultado_monto)}
                </span>
              )}
            </label>
          )}
          {requiereArchivo && (
            <div>
              <span className="mb-1 block text-xs uppercase tracking-wide text-[var(--text)]/50">
                Documento(s)
              </span>
              <div className="rounded-md border border-[var(--border)] bg-[var(--bg)] p-2">
                <FileAttachments
                  empresaId={empresaId}
                  empresaSlug={empresaSlug}
                  entidad="proyecto_tareas"
                  entidadId={tarea.id}
                  roles={[
                    { id: 'resultado', label: 'Resultado', icon: <FileText className="h-3 w-3" /> },
                    { id: 'anexo', label: 'Anexo' },
                  ]}
                  defaultUploadRole="resultado"
                  variant="flat"
                  onChange={handleAttachmentsChange}
                />
              </div>
              {tarea.resultado_documento_url && (
                <div className="mt-1 flex items-center gap-2 text-xs">
                  <a
                    href={tarea.resultado_documento_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[var(--accent)] hover:underline"
                  >
                    URL legada
                  </a>
                  <button
                    type="button"
                    onClick={handleLimpiarDocumento}
                    disabled={pending}
                    className="text-[var(--text)]/50 hover:text-[var(--text)]"
                  >
                    Limpiar
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      <label className="mt-3 block text-xs">
        <span className="mb-1 block uppercase tracking-wide text-[var(--text)]/50">Notas</span>
        <textarea
          value={notasLocal}
          onChange={(e) => setNotasLocal(e.target.value)}
          onBlur={handleNotasBlur}
          disabled={pending}
          rows={2}
          placeholder="Comentarios, contexto, decisión…"
          className="w-full rounded-md border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm text-[var(--text)] focus:border-[var(--accent)] focus:outline-none disabled:opacity-50"
        />
      </label>
    </article>
  );
}
