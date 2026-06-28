'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { CalendarPlus, FileText, Plus, RefreshCw } from 'lucide-react';

import { ModuleKpiStrip, type ModuleKpi } from '@/components/module-page';
import { createSupabaseBrowserClient } from '@/lib/supabase-browser';
import { getSupabaseErrorMessage } from '@/lib/supabase-error';

import { ArrendamientoCaptureDialog } from './arrendamiento-capture-dialog';
import {
  ArrendamientoEstadoCuentaDrawer,
  type ContratoSel,
} from './arrendamiento-estado-cuenta-drawer';
import { ArrendamientoGenerarCargosDialog } from './arrendamiento-generar-cargos-dialog';

/**
 * Módulo Arrendamiento (DILESA) — lista de contratos + KPIs. Iniciativa
 * `arrendamiento` · Sprint 1d. v1 mínimo: lista read-only de contratos y su
 * estado; el alta (form sobre la RPC erp.arrendamiento_alta) llega en S1e.
 */

type ArrendamientoRow = {
  id: string;
  folio: string | null;
  arrendatario_persona_id: string;
  tipo_plazo: string;
  fecha_inicio: string | null;
  fecha_fin: string | null;
  estado: string;
};

type FetchResult = {
  rows: ArrendamientoRow[];
  nombres: Record<string, string>;
  error: string | null;
};

const ESTADO_LABEL: Record<string, string> = {
  borrador: 'Borrador',
  vigente: 'Vigente',
  por_vencer: 'Por vencer',
  renovado: 'Renovado',
  terminado: 'Terminado',
  rescindido: 'Rescindido',
};

const ESTADO_CLASS: Record<string, string> = {
  borrador: 'bg-muted text-muted-foreground',
  vigente: 'bg-emerald-500/15 text-emerald-600',
  por_vencer: 'bg-amber-500/15 text-amber-600',
  renovado: 'bg-sky-500/15 text-sky-600',
  terminado: 'bg-muted text-muted-foreground',
  rescindido: 'bg-rose-500/15 text-rose-600',
};

function fmtFecha(d: string | null): string {
  if (!d) return '—';
  // Las fechas vienen YYYY-MM-DD (date); parsear sin TZ para no correr el día.
  const [y, m, day] = d.slice(0, 10).split('-');
  return `${day}/${m}/${y}`;
}

export function ArrendamientoModule({ empresaId }: { empresaId: string }) {
  const [rows, setRows] = useState<ArrendamientoRow[]>([]);
  const [nombres, setNombres] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [generarOpen, setGenerarOpen] = useState(false);
  const [contratoSel, setContratoSel] = useState<ContratoSel | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  // fetchData RETORNA el resultado (no setea estado). El setState vive en
  // aplicar(), llamado dentro del .then — así el efecto no dispara setState de
  // forma síncrona (evita el cascade de renders que marca el linter). Patrón de
  // contabilidad-catalogo-module.
  const fetchData = useCallback(async (): Promise<FetchResult> => {
    const sb = createSupabaseBrowserClient();
    const { data, error: e } = await sb
      .schema('erp')
      .from('arrendamientos')
      .select('id, folio, arrendatario_persona_id, tipo_plazo, fecha_inicio, fecha_fin, estado')
      .eq('empresa_id', empresaId)
      .is('deleted_at', null)
      .order('created_at', { ascending: false });
    if (e) {
      return {
        rows: [],
        nombres: {},
        error: getSupabaseErrorMessage(e, 'No se pudieron cargar los contratos.'),
      };
    }
    const list = (data ?? []) as ArrendamientoRow[];

    // Nombres de arrendatario (FK a erp.personas, mismo schema). Segunda query
    // por consistencia con el patrón cross-schema del repo.
    const ids = [...new Set(list.map((r) => r.arrendatario_persona_id).filter(Boolean))];
    const map: Record<string, string> = {};
    if (ids.length) {
      const { data: personas } = await sb
        .schema('erp')
        .from('personas')
        .select('id, nombre')
        .in('id', ids);
      for (const p of (personas ?? []) as { id: string; nombre: string | null }[]) {
        map[p.id] = p.nombre ?? '—';
      }
    }
    return { rows: list, nombres: map, error: null };
  }, [empresaId]);

  const aplicar = useCallback((res: FetchResult) => {
    setRows(res.rows);
    setNombres(res.nombres);
    setError(res.error);
    setLoading(false);
  }, []);

  useEffect(() => {
    let activo = true;
    void fetchData().then((res) => {
      if (activo) aplicar(res);
    });
    return () => {
      activo = false;
    };
  }, [fetchData, aplicar]);

  const kpis = useMemo<ModuleKpi[]>(() => {
    const by = (estado: string) => rows.filter((r) => r.estado === estado).length;
    return [
      { key: 'vigentes', label: 'Vigentes', value: by('vigente') },
      {
        key: 'por_vencer',
        label: 'Por vencer',
        value: by('por_vencer'),
        valueClassName: 'text-amber-600',
      },
      { key: 'borrador', label: 'Borradores', value: by('borrador') },
      { key: 'total', label: 'Total de contratos', value: rows.length },
    ];
  }, [rows]);

  return (
    <div className="space-y-4 p-4 sm:p-6">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold">Arrendamiento</h1>
          <p className="text-sm text-muted-foreground">
            Contratos de renta de activos del portafolio. Haz clic en un contrato para ver su estado
            de cuenta y registrar pagos.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              setLoading(true);
              void fetchData().then(aplicar);
            }}
            className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm hover:bg-muted"
          >
            <RefreshCw className="size-4" /> Actualizar
          </button>
          <button
            type="button"
            onClick={() => setGenerarOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm hover:bg-muted"
          >
            <CalendarPlus className="size-4" /> Generar cargos del mes
          </button>
          <button
            type="button"
            onClick={() => setDialogOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            <Plus className="size-4" /> Nuevo contrato
          </button>
        </div>
      </div>

      <ModuleKpiStrip stats={kpis} />

      {error && (
        <div className="rounded-md border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-600">
          {error}
        </div>
      )}

      {loading ? (
        <div className="py-12 text-center text-sm text-muted-foreground">Cargando contratos…</div>
      ) : rows.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed py-16 text-center">
          <FileText className="size-8 text-muted-foreground" />
          <p className="text-sm font-medium">Aún no hay contratos de arrendamiento</p>
          <p className="max-w-sm text-xs text-muted-foreground">
            El alta de contratos (con sus líneas y la renta inicial) llega en el siguiente sprint.
            El modelo y la cobranza ya están en producción.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="border-b bg-muted/40 text-left text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-3 py-2 font-medium">Folio</th>
                <th className="px-3 py-2 font-medium">Arrendatario</th>
                <th className="px-3 py-2 font-medium">Plazo</th>
                <th className="px-3 py-2 font-medium">Vigencia</th>
                <th className="px-3 py-2 font-medium">Estado</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr
                  key={r.id}
                  onClick={() => {
                    setContratoSel({
                      id: r.id,
                      folio: r.folio,
                      arrendatario_persona_id: r.arrendatario_persona_id,
                      arrendatario_nombre: nombres[r.arrendatario_persona_id] ?? '—',
                    });
                    setDrawerOpen(true);
                  }}
                  className="cursor-pointer border-b last:border-0 hover:bg-muted/30"
                >
                  <td className="px-3 py-2 font-mono text-xs">{r.folio ?? '—'}</td>
                  <td className="px-3 py-2">{nombres[r.arrendatario_persona_id] ?? '…'}</td>
                  <td className="px-3 py-2 capitalize">
                    {r.tipo_plazo === 'campana' ? 'Campaña' : 'Plazo'}
                  </td>
                  <td className="px-3 py-2 text-xs">
                    {fmtFecha(r.fecha_inicio)} → {fmtFecha(r.fecha_fin)}
                  </td>
                  <td className="px-3 py-2">
                    <span
                      className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
                        ESTADO_CLASS[r.estado] ?? 'bg-muted text-muted-foreground'
                      }`}
                    >
                      {ESTADO_LABEL[r.estado] ?? r.estado}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <ArrendamientoCaptureDialog
        empresaId={empresaId}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onCreated={() => void fetchData().then(aplicar)}
      />

      <ArrendamientoGenerarCargosDialog
        open={generarOpen}
        onOpenChange={setGenerarOpen}
        onGenerated={() => void fetchData().then(aplicar)}
      />

      <ArrendamientoEstadoCuentaDrawer
        empresaId={empresaId}
        contrato={contratoSel}
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
      />
    </div>
  );
}
