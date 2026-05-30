'use client';

/**
 * PlanoAnteproyecto — versiones del plano del anteproyecto DILESA.
 * Sprint 4D de `dilesa-proyectos-checklist-inline`.
 *
 * Beto: "en este paso aún no tenemos el plano oficial, así que aquí
 * trabajamos con el plano del anteproyecto en el que puede haber
 * varias iteraciones".
 *
 * Layout (stack vertical bajo el análisis financiero):
 *   - Header: título + dropdown "Mostrando: versión N (vigente)" +
 *     botón "+ Nueva versión".
 *   - Card grande del plano seleccionado: archivos vía
 *     `<FileAttachments entidad="proyecto_planos">`.
 *   - Pie del card: descripción editable, fecha de subida, botón
 *     "Marcar vigente" (si no lo es) y "Eliminar versión" (soft
 *     delete; sale el unique vigente cuando aplica).
 *
 * Sprint 4E agregará el botón "Analizar con IA" sobre el plano
 * vigente. Por ahora solo gestionamos versiones.
 */

import { useCallback, useEffect, useState, useTransition } from 'react';
import { FileAttachments } from '@/components/file-attachments/file-attachments';
import type { FileRole } from '@/components/file-attachments/types';
import { useAdjuntos } from '@/components/file-attachments/use-adjuntos';
import { getAdjuntoProxyUrl } from '@/lib/adjuntos';
import { createSupabaseBrowserClient } from '@/lib/supabase-browser';
import {
  actualizarPlanoDescripcion,
  aplicarAiAlAnalisisFinanciero,
  crearPlanoVersion,
  eliminarPlanoVersion,
  marcarPlanoVigente,
} from '@/app/dilesa/proyectos/anteproyectos/planos-actions';

export type PlanoVersionRow = {
  id: string;
  version: number;
  descripcion: string | null;
  vigente: boolean;
  created_at: string;
  ai_analisis: PlanoAiAnalisisPersistido | null;
};

/** Shape persistida del análisis AI en `ai_analisis jsonb`. */
export type PlanoAiAnalisisPersistido = {
  area_total_m2: number | null;
  area_vendible_m2: number | null;
  areas_verdes_m2: number | null;
  area_vialidades_m2: number | null;
  lotes_proyectados: number | null;
  tamano_lote_promedio_m2: number | null;
  tipologia_principal: string | null;
  observaciones: string | null;
  recomendaciones: string[];
  confianza: 'alta' | 'media' | 'baja';
  archivo_nombre?: string;
  archivo_adjunto_id?: string;
  analizado_en?: string;
  modelo?: string;
};

const fechaFmt = new Intl.DateTimeFormat('es-MX', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
});

function fmtFecha(iso: string): string {
  return fechaFmt.format(new Date(iso));
}

const PLANO_ROLES: FileRole[] = [{ id: 'plano', label: 'Plano' }];

export function PlanoAnteproyecto({
  proyectoId,
  empresaId,
  empresaSlug,
  onAnalisisAplicado,
}: {
  proyectoId: string;
  empresaId: string;
  empresaSlug: string;
  /** Se llama después de "Aplicar al análisis financiero" para que el
   *  padre refresque la sección de análisis financiero. */
  onAnalisisAplicado?: () => void;
}) {
  const [planos, setPlanos] = useState<PlanoVersionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [editingDescId, setEditingDescId] = useState<string | null>(null);
  const [descDraft, setDescDraft] = useState('');
  const [analizandoAi, setAnalizandoAi] = useState(false);
  const [aiMessage, setAiMessage] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    setLoading(true);
    const supabase = createSupabaseBrowserClient();
    const { data, error: err } = await supabase
      .schema('dilesa')
      .from('proyecto_planos')
      .select('id, version, descripcion, vigente, created_at, ai_analisis')
      .eq('proyecto_id', proyectoId)
      .is('deleted_at', null)
      .order('version', { ascending: false });
    if (err) {
      setError(err.message);
      setPlanos([]);
    } else {
      const rows = (data ?? []) as PlanoVersionRow[];
      setPlanos(rows);
      // Selección por default: el vigente, sino el más reciente.
      const vigente = rows.find((p) => p.vigente);
      setSelectedId((prev) => prev ?? vigente?.id ?? rows[0]?.id ?? null);
    }
    setLoading(false);
  }, [proyectoId]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const handleNuevaVersion = () => {
    setError(null);
    startTransition(async () => {
      const r = await crearPlanoVersion(proyectoId, null);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      await cargar();
      setSelectedId(r.id);
    });
  };

  const handleMarcarVigente = (planoId: string) => {
    setError(null);
    startTransition(async () => {
      const r = await marcarPlanoVigente(planoId);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      await cargar();
    });
  };

  const handleEliminar = (planoId: string) => {
    if (!confirm('¿Eliminar esta versión del plano? Los archivos seguirán en histórico.')) return;
    setError(null);
    startTransition(async () => {
      const r = await eliminarPlanoVersion(planoId);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      // Si era el seleccionado, deseleccionar.
      if (selectedId === planoId) setSelectedId(null);
      await cargar();
    });
  };

  const startEditingDesc = (plano: PlanoVersionRow) => {
    setEditingDescId(plano.id);
    setDescDraft(plano.descripcion ?? '');
  };
  const commitDesc = (planoId: string) => {
    const original = planos.find((p) => p.id === planoId)?.descripcion ?? '';
    if (descDraft === original) {
      setEditingDescId(null);
      return;
    }
    setError(null);
    startTransition(async () => {
      const r = await actualizarPlanoDescripcion(planoId, descDraft);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setEditingDescId(null);
      await cargar();
    });
  };

  const handleAnalizarAi = async (planoId: string) => {
    setError(null);
    setAiMessage(null);
    setAnalizandoAi(true);
    try {
      const res = await fetch(`/api/dilesa/anteproyectos/planos/${planoId}/analizar-ai`, {
        method: 'POST',
      });
      const json = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
      };
      if (!res.ok || !json.ok) {
        setError(json.error ?? `HTTP ${res.status}`);
        return;
      }
      await cargar();
    } finally {
      setAnalizandoAi(false);
    }
  };

  const handleAplicarAi = (planoId: string) => {
    setError(null);
    setAiMessage(null);
    startTransition(async () => {
      const r = await aplicarAiAlAnalisisFinanciero(planoId);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      if (r.aplicados.length === 0) {
        setAiMessage(
          'Todos los campos ya tenían valor. Edita manualmente si quieres reemplazarlos.'
        );
      } else {
        setAiMessage(`Aplicado: ${r.aplicados.length} campos pre-llenados al análisis.`);
      }
      onAnalisisAplicado?.();
    });
  };

  const selected = planos.find((p) => p.id === selectedId) ?? null;

  return (
    <section
      aria-label="Plano del anteproyecto"
      className="rounded-md border border-[var(--border)] bg-[var(--bg)]"
    >
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--border)] px-3 py-2">
        <div className="flex items-center gap-3">
          <h3 className="text-sm font-semibold text-[var(--text)]">Plano del anteproyecto</h3>
          {planos.length > 0 && (
            <select
              value={selectedId ?? ''}
              onChange={(e) => setSelectedId(e.target.value || null)}
              disabled={pending}
              className="h-7 rounded-sm border border-[var(--border)] bg-[var(--card)] px-2 text-xs"
              aria-label="Versión visible"
            >
              {planos.map((p) => (
                <option key={p.id} value={p.id}>
                  Versión {p.version}
                  {p.vigente ? ' · vigente' : ''} · {fmtFecha(p.created_at)}
                </option>
              ))}
            </select>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleNuevaVersion}
            disabled={pending}
            className="h-7 rounded-sm bg-[var(--accent)] px-3 text-xs font-medium text-white hover:opacity-90 disabled:opacity-50"
          >
            + Nueva versión
          </button>
        </div>
      </header>

      <div className="p-3">
        {loading ? (
          <p className="text-xs text-[var(--muted-text)]">Cargando versiones…</p>
        ) : planos.length === 0 ? (
          <div className="rounded-md border border-dashed border-[var(--border)] bg-[var(--card)] p-6 text-center">
            <p className="text-sm font-medium text-[var(--text)]">Sin plano todavía</p>
            <p className="mt-1 text-xs text-[var(--muted-text)]">
              Crea la primera versión y sube el plano (PDF o imagen). Cada iteración queda guardada
              en histórico.
            </p>
          </div>
        ) : !selected ? (
          <p className="text-xs text-[var(--muted-text)]">
            Ninguna versión seleccionada. Usa el selector arriba para elegir.
          </p>
        ) : (
          <article className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-[var(--text)]">Versión {selected.version}</span>
                {selected.vigente ? (
                  <span className="inline-flex rounded-full border border-emerald-300 bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-700">
                    Vigente
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => handleMarcarVigente(selected.id)}
                    disabled={pending}
                    className="rounded-sm border border-[var(--border)] bg-[var(--card)] px-2 py-0.5 text-[11px] hover:bg-[var(--bg)] disabled:opacity-50"
                  >
                    Marcar vigente
                  </button>
                )}
                <span className="text-[var(--muted-text)]">
                  Subida {fmtFecha(selected.created_at)}
                </span>
              </div>
              <button
                type="button"
                onClick={() => handleEliminar(selected.id)}
                disabled={pending}
                className="text-[11px] text-red-600 hover:underline disabled:opacity-50"
              >
                Eliminar versión
              </button>
            </div>

            <div>
              {editingDescId === selected.id ? (
                <textarea
                  value={descDraft}
                  onChange={(e) => setDescDraft(e.target.value)}
                  onBlur={() => commitDesc(selected.id)}
                  onKeyDown={(e) => {
                    if (e.key === 'Escape') {
                      setEditingDescId(null);
                      setDescDraft(selected.descripcion ?? '');
                    }
                  }}
                  autoFocus
                  rows={2}
                  placeholder="Describe esta iteración (ej. 'V2: ajuste de áreas verdes a 12% por feedback comité')"
                  className="w-full rounded-sm border border-[var(--accent)] bg-[var(--bg)] p-2 text-xs focus:outline-none"
                />
              ) : (
                <button
                  type="button"
                  onClick={() => startEditingDesc(selected)}
                  disabled={pending}
                  className="w-full rounded-sm border border-transparent px-2 py-1 text-left text-xs hover:border-[var(--border)] disabled:opacity-50"
                >
                  {selected.descripcion ? (
                    <span className="text-[var(--text)]">{selected.descripcion}</span>
                  ) : (
                    <span className="text-[var(--muted-text)]">
                      Click para describir esta iteración…
                    </span>
                  )}
                </button>
              )}
            </div>

            <PlanoViewer empresaId={empresaId} planoId={selected.id} />

            <FileAttachments
              empresaId={empresaId}
              empresaSlug={empresaSlug as 'dilesa' | 'rdb' | 'ansa' | 'coagan'}
              entidad="proyecto_planos"
              entidadId={selected.id}
              roles={PLANO_ROLES}
              defaultUploadRole="plano"
              multiple={true}
              accept=".pdf,.png,.jpg,.jpeg,.webp,.heic,.heif,.tiff"
              variant="grouped"
            />

            <AiPanel
              plano={selected}
              analizando={analizandoAi}
              pending={pending}
              onAnalizar={() => handleAnalizarAi(selected.id)}
              onAplicar={() => handleAplicarAi(selected.id)}
              message={aiMessage}
            />
          </article>
        )}

        {error && <p className="mt-2 text-xs text-red-600/80">{error}</p>}
      </div>
    </section>
  );
}

// ── Panel del análisis AI ────────────────────────────────────────────────────

const numFmt = new Intl.NumberFormat('es-MX');
const fmtM2 = (n: number | null | undefined): string =>
  n == null ? '—' : `${numFmt.format(n)} m²`;
const fmtInt = (n: number | null | undefined): string => (n == null ? '—' : numFmt.format(n));

function confianzaTone(c: 'alta' | 'media' | 'baja' | undefined): string {
  if (c === 'alta') return 'border-emerald-300 bg-emerald-50 text-emerald-700';
  if (c === 'media') return 'border-amber-300 bg-amber-50 text-amber-700';
  if (c === 'baja') return 'border-red-300 bg-red-50 text-red-700';
  return 'border-[var(--border)] bg-[var(--card)] text-[var(--muted-text)]';
}

function AiPanel({
  plano,
  analizando,
  pending,
  onAnalizar,
  onAplicar,
  message,
}: {
  plano: PlanoVersionRow;
  analizando: boolean;
  pending: boolean;
  onAnalizar: () => void;
  onAplicar: () => void;
  message: string | null;
}) {
  const ai = plano.ai_analisis;
  const tieneAnalisis = ai != null;
  const disabled = analizando || pending;

  return (
    <div className="rounded-md border border-[var(--border)] bg-[var(--card)] p-3">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-[var(--text)]">
            Análisis con IA
          </h4>
          {tieneAnalisis && (
            <span
              className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-medium ${confianzaTone(ai?.confianza)}`}
            >
              Confianza: {ai?.confianza ?? '—'}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onAnalizar}
            disabled={disabled}
            className="h-7 rounded-sm bg-[var(--accent)] px-3 text-xs font-medium text-white hover:opacity-90 disabled:opacity-50"
          >
            {analizando ? 'Analizando…' : tieneAnalisis ? 'Re-analizar' : 'Analizar con IA'}
          </button>
          {tieneAnalisis && (
            <button
              type="button"
              onClick={onAplicar}
              disabled={disabled}
              className="h-7 rounded-sm border border-[var(--border)] bg-[var(--bg)] px-3 text-xs font-medium text-[var(--text)] hover:bg-[var(--card)] disabled:opacity-50"
              title="Llena los campos vacíos del análisis financiero con estos valores. No machaca lo capturado."
            >
              Aplicar al análisis financiero
            </button>
          )}
        </div>
      </header>

      {!tieneAnalisis ? (
        <p className="mt-2 text-xs text-[var(--muted-text)]">
          Sube un PDF o imagen del plano arriba, luego presiona <strong>Analizar con IA</strong>.
          Claude vision detecta áreas, lotes, vialidades y propone recomendaciones. Después puedes
          aplicarlo al análisis financiero (solo llena campos vacíos).
        </p>
      ) : (
        <div className="mt-3 space-y-3">
          {/* Métricas extraídas */}
          <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs sm:grid-cols-3 lg:grid-cols-6">
            <KV k="Área total" v={fmtM2(ai?.area_total_m2 ?? null)} />
            <KV k="Vendible" v={fmtM2(ai?.area_vendible_m2 ?? null)} />
            <KV k="Áreas verdes" v={fmtM2(ai?.areas_verdes_m2 ?? null)} />
            <KV k="Vialidades" v={fmtM2(ai?.area_vialidades_m2 ?? null)} />
            <KV k="Lotes" v={fmtInt(ai?.lotes_proyectados ?? null)} />
            <KV k="Lote prom." v={fmtM2(ai?.tamano_lote_promedio_m2 ?? null)} />
          </div>

          {/* Tipología detectada */}
          {ai?.tipologia_principal && (
            <div className="text-xs">
              <span className="text-[var(--muted-text)]">Tipología detectada: </span>
              <span className="font-medium text-[var(--text)]">{ai.tipologia_principal}</span>
            </div>
          )}

          {/* Observaciones */}
          {ai?.observaciones && (
            <div>
              <div className="text-[10px] uppercase tracking-wide text-[var(--muted-text)]">
                Observaciones
              </div>
              <p className="mt-1 whitespace-pre-line text-xs text-[var(--text)]">
                {ai.observaciones}
              </p>
            </div>
          )}

          {/* Recomendaciones */}
          {ai?.recomendaciones && ai.recomendaciones.length > 0 && (
            <div>
              <div className="text-[10px] uppercase tracking-wide text-[var(--muted-text)]">
                Recomendaciones
              </div>
              <ul className="mt-1 space-y-1 text-xs text-[var(--text)]">
                {ai.recomendaciones.map((r, i) => (
                  <li key={i} className="flex gap-2">
                    <span aria-hidden className="text-[var(--muted-text)]">
                      •
                    </span>
                    <span>{r}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {ai?.analizado_en && (
            <p className="text-[10px] text-[var(--muted-text)]">
              Analizado {new Date(ai.analizado_en).toLocaleString('es-MX')} con{' '}
              <code>{ai?.modelo ?? 'claude'}</code>.
            </p>
          )}
        </div>
      )}

      {message && <p className="mt-2 text-xs text-emerald-700">{message}</p>}
    </div>
  );
}

function KV({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex flex-col">
      <span className="text-[10px] uppercase tracking-wide text-[var(--muted-text)]">{k}</span>
      <span className="text-xs font-semibold tabular-nums text-[var(--text)]">{v}</span>
    </div>
  );
}

// ── Viewer del plano (imagen o PDF embebido) ─────────────────────────────────

function mimeFromName(name: string, declared: string | null | undefined): string {
  if (declared && declared.length > 0) return declared;
  const ext = name.toLowerCase().split('.').pop() ?? '';
  switch (ext) {
    case 'pdf':
      return 'application/pdf';
    case 'png':
      return 'image/png';
    case 'jpg':
    case 'jpeg':
      return 'image/jpeg';
    case 'webp':
      return 'image/webp';
    case 'heic':
    case 'heif':
      return 'image/heic';
    case 'tiff':
      return 'image/tiff';
    default:
      return '';
  }
}

function PlanoViewer({ empresaId, planoId }: { empresaId: string; planoId: string }) {
  // Reutiliza el hook canónico de FileAttachments para no duplicar la
  // lógica de fetch + RLS.
  const { adjuntos, loading } = useAdjuntos({
    empresaId,
    entidadTipo: 'proyecto_plano',
    entidadId: planoId,
  });

  // Tomamos el adjunto más reciente como "principal" del plano (mismo
  // criterio que usa el endpoint analizar-ai).
  const principal = adjuntos.length
    ? [...adjuntos].sort((a, b) => b.created_at.localeCompare(a.created_at))[0]
    : null;
  const proxyUrl = principal ? getAdjuntoProxyUrl(principal.url) : null;

  // Bajamos el archivo via fetch y lo mostramos con blob URL. La SSO
  // wall de Vercel preview bloquea iframes/imgs anidados directamente
  // al /api/adjuntos/ con "refused to connect". El fetch sí transmite
  // las credenciales same-origin; el resultado se muestra desde un
  // blob:URL local que ya no pasa por la auth wall.
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [fetchErr, setFetchErr] = useState<string | null>(null);

  useEffect(() => {
    if (!proxyUrl) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setBlobUrl(null);

      setFetchErr(null);
      return;
    }
    let cancelado = false;
    let urlLocal: string | null = null;

    setFetchErr(null);
    void (async () => {
      try {
        const res = await fetch(proxyUrl, { credentials: 'same-origin' });
        if (!res.ok) {
          if (!cancelado) setFetchErr(`HTTP ${res.status}`);
          return;
        }
        const blob = await res.blob();
        urlLocal = URL.createObjectURL(blob);
        if (cancelado) {
          URL.revokeObjectURL(urlLocal);
          return;
        }

        setBlobUrl(urlLocal);
      } catch (e) {
        if (!cancelado) setFetchErr(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => {
      cancelado = true;
      if (urlLocal) URL.revokeObjectURL(urlLocal);
    };
  }, [proxyUrl]);

  if (loading) {
    return (
      <div className="flex h-32 items-center justify-center rounded-md border border-dashed border-[var(--border)] bg-[var(--card)] text-xs text-[var(--muted-text)]">
        Cargando preview…
      </div>
    );
  }
  if (!principal) {
    return (
      <div className="flex h-32 items-center justify-center rounded-md border border-dashed border-[var(--border)] bg-[var(--card)] text-xs text-[var(--muted-text)]">
        Sube un archivo abajo para ver el plano aquí.
      </div>
    );
  }

  const mime = mimeFromName(principal.nombre, principal.tipo_mime);
  const isImage = mime.startsWith('image/');
  const isPdf = mime === 'application/pdf';
  const unsupportedImage = mime === 'image/heic' || mime === 'image/heif' || mime === 'image/tiff';

  if (unsupportedImage) {
    return (
      <div className="flex h-32 flex-col items-center justify-center gap-2 rounded-md border border-amber-200 bg-amber-50 px-4 text-xs text-amber-800">
        <span>
          El formato {mime} no se puede mostrar embebido. Descarga el archivo desde la lista de
          abajo para verlo.
        </span>
      </div>
    );
  }

  return (
    <figure className="overflow-hidden rounded-md border border-[var(--border)] bg-[var(--card)]">
      <div className="flex items-center justify-between border-b border-[var(--border)] px-2 py-1 text-[10px] text-[var(--muted-text)]">
        <span className="truncate" title={principal.nombre}>
          {principal.nombre}
        </span>
        {proxyUrl && (
          <a
            href={proxyUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="ml-2 shrink-0 hover:underline"
          >
            Abrir en pestaña ↗
          </a>
        )}
      </div>
      {fetchErr ? (
        <div className="p-4 text-xs text-red-600/80">
          No se pudo cargar el preview: {fetchErr}. Usa el link arriba para abrirlo.
        </div>
      ) : !blobUrl ? (
        <div className="flex h-32 items-center justify-center text-xs text-[var(--muted-text)]">
          Cargando archivo…
        </div>
      ) : isImage ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={blobUrl}
          alt={`Plano ${principal.nombre}`}
          className="max-h-[70vh] w-full object-contain"
        />
      ) : isPdf ? (
        <iframe
          src={blobUrl}
          title={`Plano ${principal.nombre}`}
          className="h-[70vh] w-full border-0"
        />
      ) : (
        <div className="p-4 text-xs text-[var(--muted-text)]">
          Tipo no soportado para preview ({mime || 'desconocido'}). Usa el link arriba para abrirlo.
        </div>
      )}
    </figure>
  );
}
