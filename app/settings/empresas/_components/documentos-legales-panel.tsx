'use client';

/**
 * Panel "Documentos legales — alta de empleados" para `/settings/empresas/[slug]`.
 *
 * Sprint 4 — iniciativa `empresa-documentos-legales`.
 *
 * Reemplaza el editor de jsonb manual de PR #280 por un flujo basado en
 * referencias a documentos del módulo Documentos:
 *
 *   1. Lee asignaciones via GET /api/empresas/[id]/documentos
 *   2. Agrupa por rol (los 7 de empresa-documentos-legales)
 *   3. Por cada rol con docs asignados: card con metadata, badge default,
 *      botones "Marcar default" / "Desasignar".
 *   4. Por cada rol vacío: dropdown "Asignar documento" (busca en
 *      erp.documentos filtrado por empresa + tipo legal) + CTA "o súbelo
 *      en módulo Documentos".
 *
 * El sync_trigger de Sprint 1 actualiza el jsonb caché en
 * core.empresas.escritura_* automáticamente cuando cambia el doc default
 * de los roles `acta_constitutiva` y `poder_general_administracion`.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { createSupabaseBrowserClient } from '@/lib/supabase-browser';
import { Button } from '@/components/ui/button';
import { FieldLabel } from '@/components/ui/field-label';
import {
  AlertTriangle,
  CheckCircle,
  ExternalLink,
  FileText,
  Loader2,
  Plus,
  RefreshCw,
  Star,
  Trash2,
} from 'lucide-react';

import { EMPRESA_DOCUMENTOS_ROLES } from '@/lib/empresa-documentos/cache-mapping';

// ─── Tipos ──────────────────────────────────────────────────────────────────

type Rol = (typeof EMPRESA_DOCUMENTOS_ROLES)[number];

const ROL_LABELS: Record<Rol, string> = {
  acta_constitutiva: 'Acta constitutiva',
  acta_reforma: 'Acta de reforma',
  poder_general_administracion: 'Poder general — actos de administración',
  poder_actos_dominio: 'Poder — actos de dominio',
  poder_pleitos_cobranzas: 'Poder — pleitos y cobranzas',
  poder_bancario: 'Poder — actos bancarios',
  representante_legal_imss: 'Representante legal IMSS',
};

const ROL_DESCRIPCIONES: Record<Rol, string> = {
  acta_constitutiva: 'Origen de la sociedad — usado por contratos LFT.',
  acta_reforma: 'Modificaciones posteriores a la constitutiva (puede haber varias).',
  poder_general_administracion:
    'Poder estándar para contratación laboral, IMSS, SAT y operación general.',
  poder_actos_dominio: 'Compraventa de inmuebles, hipotecas.',
  poder_pleitos_cobranzas: 'Representación en juicios.',
  poder_bancario: 'Apertura y firma de cuentas bancarias.',
  representante_legal_imss: 'Designación específica del representante ante el IMSS.',
};

const ROLES_QUE_DISPARAN_SYNC: ReadonlyArray<Rol> = [
  'acta_constitutiva',
  'poder_general_administracion',
];

type DocumentoMeta = {
  id: string;
  titulo: string | null;
  numero_documento: string | null;
  fecha_emision: string | null;
  archivo_url: string | null;
  subtipo_meta: Record<string, unknown> | null;
  tipo: string | null;
  tipo_operacion: string | null;
  extraccion_status: string | null;
};

type Asignacion = {
  id: string;
  documento_id: string;
  rol: Rol;
  es_default: boolean;
  asignado_por: string | null;
  asignado_at: string;
  notas: string | null;
  created_at: string;
  documento: DocumentoMeta | null;
};

// Documentos candidatos para el dropdown de asignación.
type DocumentoCandidato = {
  id: string;
  titulo: string | null;
  numero_documento: string | null;
  fecha_emision: string | null;
  tipo_operacion: string | null;
  subtipo_meta: Record<string, unknown> | null;
};

// Tipos legales que aparecen en `erp.documentos.tipo_operacion` y que filtran
// el dropdown del panel. Mantener en sync con la guía del extractor IA en
// `lib/documentos/extraction-core.ts`.
const TIPOS_OPERACION_LEGALES = [
  'constitutiva',
  'reforma',
  'acta',
  'poder',
  'compraventa',
  'hipoteca',
  'fideicomiso',
  'donacion',
  'permuta',
];

// ─── Componente ─────────────────────────────────────────────────────────────

export function DocumentosLegalesPanel({
  empresaId,
  empresaSlug,
}: {
  empresaId: string;
  empresaSlug: string;
}) {
  const supabase = createSupabaseBrowserClient();

  const [asignaciones, setAsignaciones] = useState<Asignacion[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [candidatos, setCandidatos] = useState<DocumentoCandidato[]>([]);
  const [savingAsignacionId, setSavingAsignacionId] = useState<string | null>(null);
  const [savedFlash, setSavedFlash] = useState(false);

  const fetchAsignaciones = useCallback(async () => {
    try {
      const res = await fetch(`/api/empresas/${empresaId}/documentos`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Error al cargar asignaciones');
      setAsignaciones((json.asignaciones ?? []) as Asignacion[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [empresaId]);

  const fetchCandidatos = useCallback(async () => {
    /* eslint-disable @typescript-eslint/no-explicit-any */
    const { data } = await (supabase.schema('erp') as any)
      .from('documentos')
      .select('id, titulo, numero_documento, fecha_emision, tipo_operacion, subtipo_meta')
      .eq('empresa_id', empresaId)
      .is('deleted_at', null)
      .in('tipo_operacion', TIPOS_OPERACION_LEGALES)
      .order('fecha_emision', { ascending: false, nullsFirst: false })
      .limit(100);
    setCandidatos((data ?? []) as DocumentoCandidato[]);
  }, [supabase, empresaId]);

  useEffect(() => {
    void (async () => {
      try {
        await Promise.all([fetchAsignaciones(), fetchCandidatos()]);
      } finally {
        setLoading(false);
      }
    })();
  }, [fetchAsignaciones, fetchCandidatos]);

  const asignacionesPorRol = useMemo<Record<Rol, Asignacion[]>>(() => {
    const out: Record<Rol, Asignacion[]> = {
      acta_constitutiva: [],
      acta_reforma: [],
      poder_general_administracion: [],
      poder_actos_dominio: [],
      poder_pleitos_cobranzas: [],
      poder_bancario: [],
      representante_legal_imss: [],
    };
    for (const a of asignaciones) {
      if (a.rol in out) out[a.rol as Rol].push(a);
    }
    return out;
  }, [asignaciones]);

  // Para cada rol, los IDs ya asignados. El dropdown los filtra.
  const docsAsignadosPorRol = useMemo<Record<Rol, Set<string>>>(() => {
    const out: Record<Rol, Set<string>> = {
      acta_constitutiva: new Set(),
      acta_reforma: new Set(),
      poder_general_administracion: new Set(),
      poder_actos_dominio: new Set(),
      poder_pleitos_cobranzas: new Set(),
      poder_bancario: new Set(),
      representante_legal_imss: new Set(),
    };
    for (const a of asignaciones) {
      if (a.rol in out) out[a.rol as Rol].add(a.documento_id);
    }
    return out;
  }, [asignaciones]);

  // ─── Acciones ─────────────────────────────────────────────────────────

  const flashSaved = () => {
    setSavedFlash(true);
    setTimeout(() => setSavedFlash(false), 2500);
  };

  const handleAsignar = async (rol: Rol, documentoId: string) => {
    setError(null);
    setSavingAsignacionId(`new-${rol}`);
    try {
      const yaHayDefault = asignacionesPorRol[rol].some((a) => a.es_default);
      const res = await fetch(`/api/empresas/${empresaId}/documentos`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          documento_id: documentoId,
          rol,
          // Si no hay otro default vigente para este rol, este se vuelve el
          // default automáticamente. Reduce el costo del "asignar y luego
          // marcar default" para el caso común de empresa sin nada.
          es_default: !yaHayDefault,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Error al asignar');
      await fetchAsignaciones();
      flashSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSavingAsignacionId(null);
    }
  };

  const handleMarcarDefault = async (asignacion: Asignacion) => {
    setError(null);
    setSavingAsignacionId(asignacion.id);
    try {
      const res = await fetch(`/api/empresas/${empresaId}/documentos/${asignacion.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ es_default: true }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Error al marcar default');
      await fetchAsignaciones();
      flashSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSavingAsignacionId(null);
    }
  };

  const handleDesasignar = async (asignacion: Asignacion) => {
    if (
      !confirm(
        `¿Desasignar "${asignacion.documento?.titulo ?? 'documento'}" del rol "${ROL_LABELS[asignacion.rol]}"?\n\nEl documento original NO se borra; solo se quita la liga con la empresa.`
      )
    )
      return;
    setError(null);
    setSavingAsignacionId(asignacion.id);
    try {
      const res = await fetch(`/api/empresas/${empresaId}/documentos/${asignacion.id}`, {
        method: 'DELETE',
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Error al desasignar');
      await fetchAsignaciones();
      flashSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSavingAsignacionId(null);
    }
  };

  const handleVerDocumento = async (doc: DocumentoMeta) => {
    if (!doc.archivo_url) {
      alert('Este documento no tiene archivo cargado en Storage.');
      return;
    }
    if (doc.archivo_url.startsWith('http')) {
      window.open(doc.archivo_url, '_blank');
      return;
    }
    // Path en bucket: primer segmento es bucket, resto es path.
    const bucket = doc.archivo_url.split('/')[0];
    const path = doc.archivo_url.split('/').slice(1).join('/');
    const isAdjuntosPath = !['branding', 'logos'].includes(bucket);
    const targetBucket = isAdjuntosPath ? 'adjuntos' : bucket;
    const targetPath = isAdjuntosPath ? doc.archivo_url : path;
    const { data, error: signErr } = await supabase.storage
      .from(targetBucket)
      .createSignedUrl(targetPath, 3600);
    if (signErr || !data?.signedUrl) {
      alert(`Error al generar enlace: ${signErr?.message ?? 'desconocido'}`);
      return;
    }
    window.open(data.signedUrl, '_blank');
  };

  // ─── Render ───────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="rounded-xl border border-[var(--border)] bg-[var(--panel)]/30 p-6 flex items-center gap-3">
        <Loader2 className="h-5 w-5 animate-spin text-[var(--text)]/40" />
        <span className="text-sm text-[var(--text-muted)]">Cargando documentos legales…</span>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <p className="text-xs text-[var(--text-muted)] flex-1 min-w-[200px]">
          Liga documentos del{' '}
          <a
            href={`/${empresaSlug}/admin/documentos`}
            className="text-[var(--accent)] hover:underline"
          >
            módulo Documentos
          </a>{' '}
          a roles legales de esta empresa. El <span className="font-mono text-[10px]">default</span>{' '}
          de <em>Acta constitutiva</em> y <em>Poder general — actos de administración</em> alimenta
          automáticamente el contrato laboral y la validación de alta de empleados.
        </p>
        <div className="flex items-center gap-2">
          {savedFlash && (
            <span className="flex items-center gap-1 text-xs text-green-400">
              <CheckCircle className="h-3.5 w-3.5" />
              Guardado
            </span>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setLoading(true);
              void Promise.all([fetchAsignaciones(), fetchCandidatos()]).finally(() =>
                setLoading(false)
              );
            }}
            className="gap-1.5 rounded-xl"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Refrescar
          </Button>
        </div>
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-2 text-sm text-red-400">
          <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
          <span className="flex-1">{error}</span>
          <button
            type="button"
            onClick={() => setError(null)}
            className="text-red-400 hover:text-red-300"
          >
            ✕
          </button>
        </div>
      )}

      {EMPRESA_DOCUMENTOS_ROLES.map((rol) => {
        const asigs = asignacionesPorRol[rol];
        const yaAsignados = docsAsignadosPorRol[rol];
        const candidatosDisponibles = candidatos.filter((c) => !yaAsignados.has(c.id));
        const disparaSync = ROLES_QUE_DISPARAN_SYNC.includes(rol);

        return (
          <div
            key={rol}
            className="rounded-xl border border-[var(--border)] bg-[var(--panel)]/20 p-4 space-y-3"
          >
            <div className="flex items-baseline justify-between gap-2">
              <div className="min-w-0">
                <h5 className="text-sm font-semibold text-[var(--text)] flex items-center gap-2">
                  {ROL_LABELS[rol]}
                  {disparaSync && (
                    <span
                      className="text-[10px] uppercase tracking-wider text-blue-400 bg-blue-500/10 border border-blue-500/30 rounded px-1.5 py-0.5"
                      title="El default de este rol se sincroniza al caché jsonb de la empresa para alimentar contratos LFT."
                    >
                      sync RH
                    </span>
                  )}
                </h5>
                <p className="text-xs text-[var(--text-muted)] mt-0.5">{ROL_DESCRIPCIONES[rol]}</p>
              </div>
              <span className="text-xs text-[var(--text)]/40 shrink-0">
                {asigs.length} {asigs.length === 1 ? 'doc' : 'docs'}
              </span>
            </div>

            {asigs.length === 0 ? (
              <div className="rounded-md border border-dashed border-[var(--border)] bg-[var(--panel)]/30 p-3">
                <p className="text-xs text-[var(--text-muted)] mb-2">Sin documentos asignados.</p>
                <AsignarDropdown
                  candidatos={candidatosDisponibles}
                  empresaSlug={empresaSlug}
                  saving={savingAsignacionId === `new-${rol}`}
                  onAsignar={(documentoId) => handleAsignar(rol, documentoId)}
                />
              </div>
            ) : (
              <>
                <div className="space-y-2">
                  {asigs.map((a) => (
                    <AsignacionCard
                      key={a.id}
                      asignacion={a}
                      saving={savingAsignacionId === a.id}
                      onMarcarDefault={() => handleMarcarDefault(a)}
                      onDesasignar={() => handleDesasignar(a)}
                      onVerDocumento={() => a.documento && handleVerDocumento(a.documento)}
                    />
                  ))}
                </div>
                {candidatosDisponibles.length > 0 && (
                  <div className="pt-2 border-t border-[var(--border)]/50">
                    <AsignarDropdown
                      candidatos={candidatosDisponibles}
                      empresaSlug={empresaSlug}
                      saving={savingAsignacionId === `new-${rol}`}
                      onAsignar={(documentoId) => handleAsignar(rol, documentoId)}
                      compact
                    />
                  </div>
                )}
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Subcomponentes ─────────────────────────────────────────────────────────

const REQUIRED_SUBTIPO_META_FIELDS = [
  'numero_escritura',
  'fecha_escritura',
  'notario_nombre',
  'notaria_numero',
  'distrito_notarial',
];

function subtipoMetaCubreCanonicos(meta: Record<string, unknown> | null): boolean {
  if (!meta) return false;
  return REQUIRED_SUBTIPO_META_FIELDS.every((k) => {
    const v = meta[k];
    return typeof v === 'string' && v.trim() !== '';
  });
}

function AsignacionCard({
  asignacion,
  saving,
  onMarcarDefault,
  onDesasignar,
  onVerDocumento,
}: {
  asignacion: Asignacion;
  saving: boolean;
  onMarcarDefault: () => void;
  onDesasignar: () => void;
  onVerDocumento: () => void;
}) {
  const doc = asignacion.documento;
  const cubreCanonicos = subtipoMetaCubreCanonicos(doc?.subtipo_meta ?? null);
  const subtipoMeta = (doc?.subtipo_meta ?? {}) as Record<string, unknown>;

  return (
    <div
      className={`rounded-md border p-3 transition-colors ${
        asignacion.es_default
          ? 'border-emerald-400/50 bg-emerald-50/30 dark:bg-emerald-950/15'
          : 'border-[var(--border)] bg-[var(--card)]/40'
      }`}
    >
      <div className="flex items-start gap-3 flex-wrap">
        <FileText className="h-4 w-4 mt-0.5 shrink-0 text-[var(--text)]/50" />
        <div className="flex-1 min-w-0 space-y-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium text-[var(--text)] break-words">
              {doc?.titulo ?? '(documento sin título)'}
            </span>
            {asignacion.es_default && (
              <span className="text-[10px] uppercase tracking-wider text-emerald-400 bg-emerald-500/10 border border-emerald-500/30 rounded px-1.5 py-0.5 flex items-center gap-1">
                <Star className="h-2.5 w-2.5 fill-current" />
                default
              </span>
            )}
            {!cubreCanonicos && (
              <span
                className="text-[10px] uppercase tracking-wider text-amber-400 bg-amber-500/10 border border-amber-500/30 rounded px-1.5 py-0.5"
                title="El documento no tiene los 5 campos canónicos en subtipo_meta — el contrato LFT puede quedar incompleto."
              >
                falta metadata
              </span>
            )}
          </div>
          <div className="text-xs text-[var(--text-muted)] flex items-center gap-3 flex-wrap">
            {doc?.numero_documento && <span>No. {doc.numero_documento}</span>}
            {doc?.fecha_emision && <span>{doc.fecha_emision}</span>}
            {typeof subtipoMeta.notario_nombre === 'string' && (
              <span>Notario: {subtipoMeta.notario_nombre}</span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <Button
            size="sm"
            variant="ghost"
            onClick={onVerDocumento}
            disabled={!doc?.archivo_url}
            className="gap-1 text-xs h-7 px-2"
            title="Ver documento (abre en pestaña nueva)"
          >
            <ExternalLink className="h-3 w-3" />
          </Button>
          {!asignacion.es_default && (
            <Button
              size="sm"
              variant="ghost"
              onClick={onMarcarDefault}
              disabled={saving}
              className="gap-1 text-xs h-7 px-2"
              title="Marcar como default para flujos automáticos"
            >
              <Star className="h-3 w-3" />
            </Button>
          )}
          <Button
            size="sm"
            variant="ghost"
            onClick={onDesasignar}
            disabled={saving}
            className="gap-1 text-xs h-7 px-2 text-red-400 hover:text-red-300 hover:bg-red-500/10"
            title="Desasignar"
          >
            <Trash2 className="h-3 w-3" />
          </Button>
        </div>
      </div>
    </div>
  );
}

function AsignarDropdown({
  candidatos,
  empresaSlug,
  saving,
  onAsignar,
  compact,
}: {
  candidatos: DocumentoCandidato[];
  empresaSlug: string;
  saving: boolean;
  onAsignar: (documentoId: string) => void;
  compact?: boolean;
}) {
  const [selectedId, setSelectedId] = useState('');

  if (candidatos.length === 0) {
    return (
      <div className="text-xs text-[var(--text-muted)]">
        No hay documentos legales sin asignar para esta empresa.{' '}
        <a
          href={`/${empresaSlug}/admin/documentos`}
          className="text-[var(--accent)] hover:underline"
        >
          Súbelo en módulo Documentos →
        </a>
      </div>
    );
  }

  return (
    <div className={compact ? 'flex items-center gap-2' : 'space-y-2'}>
      {!compact && <FieldLabel>Asignar documento</FieldLabel>}
      <select
        value={selectedId}
        onChange={(e) => setSelectedId(e.target.value)}
        disabled={saving}
        className="flex-1 min-w-0 rounded-md border border-[var(--border)] bg-[var(--panel)] px-3 py-1.5 text-sm text-[var(--text)] disabled:opacity-50"
      >
        <option value="">— Selecciona un documento —</option>
        {candidatos.map((c) => {
          const meta = (c.subtipo_meta ?? {}) as Record<string, unknown>;
          const numero =
            (typeof meta.numero_escritura === 'string' && meta.numero_escritura) ||
            c.numero_documento ||
            '';
          const label = [
            c.titulo ?? '(sin título)',
            c.tipo_operacion ? `[${c.tipo_operacion}]` : '',
            numero ? `No. ${numero}` : '',
            c.fecha_emision ?? '',
          ]
            .filter(Boolean)
            .join(' · ');
          return (
            <option key={c.id} value={c.id}>
              {label}
            </option>
          );
        })}
      </select>
      <Button
        size="sm"
        onClick={() => {
          if (selectedId) {
            onAsignar(selectedId);
            setSelectedId('');
          }
        }}
        disabled={!selectedId || saving}
        className="gap-1.5 rounded-md shrink-0"
      >
        {saving ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <Plus className="h-3.5 w-3.5" />
        )}
        Asignar
      </Button>
    </div>
  );
}
