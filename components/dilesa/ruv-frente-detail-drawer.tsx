'use client';

/**
 * RuvFrenteDetailDrawer — detalle de un frente (oferta) RUV.
 * Iniciativa `dilesa-ruv` · Sprints 3-4.
 *
 * Muestra los datos de la oferta + el avance del trámite + el checklist de los
 * 27 documentos del paquete. Sprint 4: el checklist es editable — por cada
 * documento se puede subir un archivo (a Storage, bucket `adjuntos`) y marcarlo
 * cargado/pendiente. El archivo se referencia en `ruv_frente_documentos.archivo_url`.
 */

import { useCallback, useEffect, useState } from 'react';
import {
  CalendarClock,
  CheckCircle2,
  Circle,
  Loader2,
  Paperclip,
  RotateCcw,
  Upload,
} from 'lucide-react';

import { createSupabaseBrowserClient } from '@/lib/supabase-browser';
import { getSupabaseErrorMessage } from '@/lib/supabase-error';
import { getAdjuntoProxyUrl } from '@/lib/adjuntos';
import { buildAdjuntoPath } from '@/lib/storage/path';
import { formatDate } from '@/lib/format';
import { useToast } from '@/components/ui/toast';
import {
  DetailDrawer,
  DetailDrawerContent,
  DetailDrawerSection,
  DetailDrawerSkeleton,
} from '@/components/detail-page';
import { Badge } from '@/components/ui/badge';
import { marcarDocumento } from '@/app/dilesa/ruv/actions';
import { avanceLabel, avanceTone, type RuvFrenteRow } from '@/components/dilesa/ruv-utils';

type ChecklistItem = {
  id: string;
  nombre: string;
  orden: number | null;
  estado: 'cargado' | 'pendiente';
  fechaCarga: string | null;
  archivoUrl: string | null;
};

/** Par etiqueta/valor para las secciones de datos. */
function Campo({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-1">
      <span className="text-xs text-[var(--text)]/55">{label}</span>
      <span className="text-sm font-medium text-[var(--text)] tabular-nums">{children}</span>
    </div>
  );
}

export function RuvFrenteDetailDrawer({
  frente,
  empresaId,
  open,
  onOpenChange,
  onChanged,
}: {
  frente: RuvFrenteRow | null;
  empresaId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Llamado cuando cambia el estado de un documento — refresca el listado padre. */
  onChanged?: () => void;
}) {
  const toast = useToast();
  const [checklist, setChecklist] = useState<ChecklistItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyDoc, setBusyDoc] = useState<string | null>(null);

  const cargarChecklist = useCallback(async () => {
    if (!frente) return;
    setLoading(true);
    setError(null);
    const sb = createSupabaseBrowserClient();
    const [catRes, estadoRes] = await Promise.all([
      sb
        .schema('dilesa')
        .from('ruv_documentos_catalogo')
        .select('id, nombre, orden')
        .eq('empresa_id', empresaId)
        .eq('activo', true),
      sb
        .schema('dilesa')
        .from('ruv_frente_documentos')
        .select('documento_catalogo_id, estado, fecha_carga, archivo_url')
        .eq('frente_id', frente.id)
        .is('deleted_at', null),
    ]);

    if (catRes.error || estadoRes.error) {
      setError(
        getSupabaseErrorMessage(catRes.error ?? estadoRes.error, 'No se pudo cargar el checklist.')
      );
      setChecklist([]);
      setLoading(false);
      return;
    }

    const estadoPorDoc = new Map(
      (estadoRes.data ?? []).map((e) => [e.documento_catalogo_id, e] as const)
    );
    const items: ChecklistItem[] = (catRes.data ?? [])
      .map((d) => {
        const e = estadoPorDoc.get(d.id);
        return {
          id: d.id as string,
          nombre: d.nombre as string,
          orden: (d.orden as number | null) ?? null,
          estado: (e?.estado as 'cargado' | 'pendiente') ?? 'pendiente',
          fechaCarga: (e?.fecha_carga as string | null) ?? null,
          archivoUrl: (e?.archivo_url as string | null) ?? null,
        };
      })
      .sort((a, b) => (a.orden ?? 999) - (b.orden ?? 999) || a.nombre.localeCompare(b.nombre));

    setChecklist(items);
    setLoading(false);
  }, [frente, empresaId]);

  useEffect(() => {
    if (!open || !frente) return;
    let activo = true;
    void (async () => {
      await cargarChecklist();
      if (!activo) return;
    })();
    return () => {
      activo = false;
    };
  }, [open, frente, cargarChecklist]);

  const subirArchivo = useCallback(
    async (item: ChecklistItem, file: File) => {
      if (!frente) return;
      setBusyDoc(item.id);
      const sb = createSupabaseBrowserClient();
      const path = buildAdjuntoPath({
        empresa: 'dilesa',
        entidad: 'frentes',
        entidadId: frente.id,
        filename: file.name,
      });
      const { error: upErr } = await sb.storage.from('adjuntos').upload(path, file);
      if (upErr) {
        toast.add({
          title: 'No se pudo subir el archivo',
          description: upErr.message,
          type: 'error',
        });
        setBusyDoc(null);
        return;
      }
      const res = await marcarDocumento({
        frenteId: frente.id,
        documentoCatalogoId: item.id,
        estado: 'cargado',
        archivoUrl: path,
      });
      if (!res.ok) {
        toast.add({
          title: 'No se pudo marcar el documento',
          description: res.error,
          type: 'error',
        });
      } else {
        toast.add({ title: 'Documento cargado', type: 'success' });
        await cargarChecklist();
        onChanged?.();
      }
      setBusyDoc(null);
    },
    [frente, toast, cargarChecklist, onChanged]
  );

  const cambiarEstado = useCallback(
    async (item: ChecklistItem, estado: 'cargado' | 'pendiente') => {
      if (!frente) return;
      setBusyDoc(item.id);
      const res = await marcarDocumento({
        frenteId: frente.id,
        documentoCatalogoId: item.id,
        estado,
      });
      if (!res.ok) {
        toast.add({ title: 'No se pudo actualizar', description: res.error, type: 'error' });
      } else {
        await cargarChecklist();
        onChanged?.();
      }
      setBusyDoc(null);
    },
    [frente, toast, cargarChecklist, onChanged]
  );

  const cargados = checklist.filter((i) => i.estado === 'cargado').length;
  const pendientes = checklist.length - cargados;

  return (
    <DetailDrawer
      open={open}
      onOpenChange={onOpenChange}
      size="md"
      title={frente?.nombre ?? 'Frente RUV'}
      description={frente?.proyectoNombre || undefined}
      meta={
        frente ? (
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={avanceTone(frente.pctPaqueteRuv)}>
              Paquete RUV {avanceLabel(frente.pctPaqueteRuv)}
            </Badge>
            {frente.idOferta != null ? (
              <Badge tone="neutral">Oferta {frente.idOferta}</Badge>
            ) : null}
          </div>
        ) : null
      }
    >
      <DetailDrawerContent>
        {!frente ? null : (
          <>
            <DetailDrawerSection title="Datos de la oferta" divider={false}>
              <Campo label="Proyecto / Fraccionamiento">{frente.proyectoNombre || '—'}</Campo>
              <Campo label="ID Oferta (INFONAVIT)">{frente.idOferta ?? '—'}</Campo>
              <Campo label="ID Orden">{frente.idOrden ?? '—'}</Campo>
              <Campo label="Fecha inicio">
                {frente.fechaInicio ? formatDate(frente.fechaInicio) : '—'}
              </Campo>
              <Campo label="Fecha fin">{frente.fechaFin ? formatDate(frente.fechaFin) : '—'}</Campo>
              <Campo label="Viviendas en oferta">{frente.viviendasOferta ?? '—'}</Campo>
            </DetailDrawerSection>

            <DetailDrawerSection title="Avance del trámite">
              <Campo label="Lotes del frente">{frente.lotes}</Campo>
              <Campo label="Viviendas ligadas (construcción)">{frente.viviendas}</Campo>
              <Campo label="CUVs emitidos">{frente.cuvsEmitidos}</Campo>
              <Campo label="Con DTU liberado">{frente.conDtu}</Campo>
              <Campo label="Con seguro de calidad">{frente.conSeguroCalidad}</Campo>
              <Campo label="Con paquete RUV">{frente.conPaqueteRuv}</Campo>
            </DetailDrawerSection>

            <DetailDrawerSection
              title="Documentos del paquete"
              description={
                checklist.length > 0
                  ? `${cargados} cargados · ${pendientes} pendientes`
                  : 'Catálogo de documentos requeridos'
              }
            >
              {loading ? (
                <DetailDrawerSkeleton showStats={false} />
              ) : error ? (
                <p className="text-sm text-[var(--danger)]">{error}</p>
              ) : checklist.length === 0 ? (
                <p className="text-sm text-[var(--text)]/55">Sin documentos en el catálogo.</p>
              ) : (
                <ul className="space-y-1">
                  {checklist.map((item) => {
                    const busy = busyDoc === item.id;
                    return (
                      <li
                        key={item.id}
                        className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-[var(--card)]/60"
                      >
                        {item.estado === 'cargado' ? (
                          <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" />
                        ) : (
                          <Circle className="h-4 w-4 shrink-0 text-[var(--text)]/30" />
                        )}
                        <div className="min-w-0 flex-1">
                          <span className="text-sm text-[var(--text)]">{item.nombre}</span>
                          {item.estado === 'cargado' && item.fechaCarga ? (
                            <span className="ml-2 inline-flex items-center gap-1 text-xs text-[var(--text)]/45">
                              <CalendarClock className="h-3 w-3" />
                              {formatDate(item.fechaCarga)}
                            </span>
                          ) : null}
                        </div>

                        {busy ? (
                          <Loader2 className="h-4 w-4 animate-spin text-[var(--text)]/50" />
                        ) : item.estado === 'cargado' ? (
                          <div className="flex shrink-0 items-center gap-1.5">
                            {item.archivoUrl ? (
                              <a
                                href={getAdjuntoProxyUrl(item.archivoUrl)}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 text-xs text-[var(--accent)] hover:underline"
                              >
                                <Paperclip className="h-3 w-3" />
                                Ver
                              </a>
                            ) : null}
                            <button
                              type="button"
                              onClick={() => void cambiarEstado(item, 'pendiente')}
                              title="Marcar pendiente"
                              className="inline-flex items-center gap-1 rounded border border-[var(--border)] px-1.5 py-0.5 text-xs text-[var(--text)]/60 hover:text-[var(--text)]"
                            >
                              <RotateCcw className="h-3 w-3" />
                            </button>
                          </div>
                        ) : (
                          <label className="inline-flex shrink-0 cursor-pointer items-center gap-1 rounded border border-[var(--border)] px-2 py-1 text-xs text-[var(--text)]/70 hover:text-[var(--text)]">
                            <Upload className="h-3 w-3" />
                            Subir
                            <input
                              type="file"
                              className="hidden"
                              onChange={(e) => {
                                const f = e.target.files?.[0];
                                if (f) void subirArchivo(item, f);
                                e.target.value = '';
                              }}
                            />
                          </label>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </DetailDrawerSection>
          </>
        )}
      </DetailDrawerContent>
    </DetailDrawer>
  );
}
