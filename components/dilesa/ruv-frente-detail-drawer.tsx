'use client';

/**
 * RuvFrenteDetailDrawer — detalle de un frente (oferta) RUV.
 * Iniciativa `dilesa-ruv` · Sprint 3 (UI).
 *
 * Recibe la fila ya cargada (RuvFrenteRow) para los datos de la oferta + el
 * avance derivado, y carga aparte el checklist de documentos del paquete
 * (catálogo × estado por frente). El checklist es read-only en v1: el marcado
 * cargado/pendiente y el alta/edición de frentes llegan en el siguiente sprint,
 * cuando Beto defina el proceso de alta.
 */

import { useCallback, useEffect, useState } from 'react';
import { CalendarClock, CheckCircle2, Circle } from 'lucide-react';

import { createSupabaseBrowserClient } from '@/lib/supabase-browser';
import { getSupabaseErrorMessage } from '@/lib/supabase-error';
import { formatDate } from '@/lib/format';
import {
  DetailDrawer,
  DetailDrawerContent,
  DetailDrawerSection,
  DetailDrawerSkeleton,
} from '@/components/detail-page';
import { Badge } from '@/components/ui/badge';
import { avanceLabel, avanceTone, type RuvFrenteRow } from '@/components/dilesa/ruv-utils';

type ChecklistItem = {
  id: string;
  nombre: string;
  orden: number | null;
  estado: 'cargado' | 'pendiente';
  fechaCarga: string | null;
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
}: {
  frente: RuvFrenteRow | null;
  empresaId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [checklist, setChecklist] = useState<ChecklistItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
        .select('documento_catalogo_id, estado, fecha_carga')
        .eq('frente_id', frente.id)
        .is('deleted_at', null),
    ]);

    if (catRes.error) {
      setError(
        getSupabaseErrorMessage(catRes.error, 'No se pudo cargar el catálogo de documentos.')
      );
      setChecklist([]);
      setLoading(false);
      return;
    }
    if (estadoRes.error) {
      setError(
        getSupabaseErrorMessage(estadoRes.error, 'No se pudo cargar el estado de documentos.')
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
                  {checklist.map((item) => (
                    <li
                      key={item.id}
                      className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-[var(--card)]/60"
                    >
                      {item.estado === 'cargado' ? (
                        <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" />
                      ) : (
                        <Circle className="h-4 w-4 shrink-0 text-[var(--text)]/30" />
                      )}
                      <span className="flex-1 text-sm text-[var(--text)]">{item.nombre}</span>
                      {item.estado === 'cargado' && item.fechaCarga ? (
                        <span className="flex items-center gap-1 text-xs text-[var(--text)]/50">
                          <CalendarClock className="h-3 w-3" />
                          {formatDate(item.fechaCarga)}
                        </span>
                      ) : (
                        <Badge tone={item.estado === 'cargado' ? 'success' : 'neutral'}>
                          {item.estado === 'cargado' ? 'Cargado' : 'Pendiente'}
                        </Badge>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </DetailDrawerSection>
          </>
        )}
      </DetailDrawerContent>
    </DetailDrawer>
  );
}
