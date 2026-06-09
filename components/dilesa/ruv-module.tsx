'use client';

/**
 * RuvModule — listado de frentes (ofertas) RUV de DILESA con KPIs + detalle.
 * Iniciativa `dilesa-ruv` · Sprint 3 (UI).
 *
 * Una fila por frente (oferta ante INFONAVIT). Lee `dilesa.ruv_frentes` (datos
 * de la oferta) + la vista `dilesa.v_ruv_frente_avance` (métricas derivadas de
 * las viviendas ligadas en construcción) + `dilesa.proyectos` (nombre). Click en
 * fila abre el detail drawer con el checklist de documentos del paquete.
 *
 * Read-only en v1. El alta/edición de frentes y el marcado de documentos llegan
 * en el siguiente sprint (proceso de alta a definir con Beto).
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { FileStack, Plus, RefreshCw, Search } from 'lucide-react';

import { createSupabaseBrowserClient } from '@/lib/supabase-browser';
import { getSupabaseErrorMessage } from '@/lib/supabase-error';
import { DILESA_EMPRESA_ID } from '@/lib/empresa-constants';
import { formatDate } from '@/lib/format';
import { DataTable, ModuleKpiStrip, type Column, type ModuleKpi } from '@/components/module-page';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { RuvFrenteCrearDrawer } from '@/components/dilesa/ruv-frente-crear-drawer';
import {
  avanceLabel,
  avanceTone,
  docsPendientesTone,
  type RuvFrenteRow,
} from '@/components/dilesa/ruv-utils';

function numOrNull(v: unknown): number | null {
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export function RuvModule({ empresaId = DILESA_EMPRESA_ID }: { empresaId?: string }) {
  const [rows, setRows] = useState<RuvFrenteRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | string | null>(null);
  const [search, setSearch] = useState('');
  const [proyectoFiltro, setProyectoFiltro] = useState('');
  const [crearOpen, setCrearOpen] = useState(false);
  const router = useRouter();

  const cargar = useCallback(async () => {
    setLoading(true);
    setError(null);
    const sb = createSupabaseBrowserClient();

    const [frentesRes, avanceRes, proyectosRes] = await Promise.all([
      sb
        .schema('dilesa')
        .from('ruv_frentes')
        .select(
          'id, nombre, id_oferta, id_orden, fecha_inicio, fecha_fin, viviendas_oferta, proyecto_id'
        )
        .eq('empresa_id', empresaId)
        .is('deleted_at', null),
      sb
        .schema('dilesa')
        .from('v_ruv_frente_avance')
        .select(
          'frente_id, lotes, viviendas, cuvs_emitidos, con_dtu, con_seguro_calidad, con_paquete_ruv, documentos_pendientes, pct_paquete_ruv'
        )
        .eq('empresa_id', empresaId),
      sb.schema('dilesa').from('proyectos').select('id, nombre').eq('empresa_id', empresaId),
    ]);

    if (frentesRes.error) {
      setError(getSupabaseErrorMessage(frentesRes.error, 'No se pudieron cargar los frentes.'));
      setRows([]);
      setLoading(false);
      return;
    }
    if (avanceRes.error) {
      setError(getSupabaseErrorMessage(avanceRes.error, 'No se pudo cargar el avance.'));
      setRows([]);
      setLoading(false);
      return;
    }
    if (proyectosRes.error) {
      setError(getSupabaseErrorMessage(proyectosRes.error, 'No se pudieron cargar los proyectos.'));
      setRows([]);
      setLoading(false);
      return;
    }

    const proyectoMap = new Map<string, string>(
      (proyectosRes.data ?? []).map((p) => [p.id as string, p.nombre as string])
    );
    const avanceMap = new Map(
      (avanceRes.data ?? []).map((a) => [a.frente_id as string, a] as const)
    );

    const merged: RuvFrenteRow[] = (frentesRes.data ?? []).map((f) => {
      const a = avanceMap.get(f.id as string);
      return {
        id: f.id as string,
        nombre: f.nombre as string,
        idOferta: numOrNull(f.id_oferta),
        idOrden: numOrNull(f.id_orden),
        fechaInicio: (f.fecha_inicio as string | null) ?? null,
        fechaFin: (f.fecha_fin as string | null) ?? null,
        viviendasOferta: numOrNull(f.viviendas_oferta),
        proyectoId: (f.proyecto_id as string | null) ?? null,
        proyectoNombre: f.proyecto_id ? (proyectoMap.get(f.proyecto_id as string) ?? '') : '',
        lotes: numOrNull(a?.lotes) ?? 0,
        viviendas: numOrNull(a?.viviendas) ?? 0,
        cuvsEmitidos: numOrNull(a?.cuvs_emitidos) ?? 0,
        conDtu: numOrNull(a?.con_dtu) ?? 0,
        conSeguroCalidad: numOrNull(a?.con_seguro_calidad) ?? 0,
        conPaqueteRuv: numOrNull(a?.con_paquete_ruv) ?? 0,
        documentosPendientes: numOrNull(a?.documentos_pendientes) ?? 0,
        pctPaqueteRuv: numOrNull(a?.pct_paquete_ruv),
      };
    });
    merged.sort((x, y) => x.nombre.localeCompare(y.nombre, 'es', { numeric: true }));

    setRows(merged);
    setLoading(false);
  }, [empresaId]);

  useEffect(() => {
    let activo = true;
    void (async () => {
      await cargar();
      if (!activo) return;
    })();
    return () => {
      activo = false;
    };
  }, [cargar]);

  // Opciones de proyecto para el filtro.
  const proyectos = useMemo(() => {
    const set = new Set<string>();
    for (const r of rows) if (r.proyectoNombre) set.add(r.proyectoNombre);
    return [...set].sort((a, b) => a.localeCompare(b, 'es'));
  }, [rows]);

  const filtrados = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (proyectoFiltro && r.proyectoNombre !== proyectoFiltro) return false;
      if (q) {
        const hay =
          r.nombre.toLowerCase().includes(q) ||
          r.proyectoNombre.toLowerCase().includes(q) ||
          String(r.idOferta ?? '').includes(q) ||
          String(r.idOrden ?? '').includes(q);
        if (!hay) return false;
      }
      return true;
    });
  }, [rows, search, proyectoFiltro]);

  const kpis = useMemo<ModuleKpi[]>(() => {
    const totalFrentes = filtrados.length;
    const viviendasOferta = filtrados.reduce((acc, r) => acc + (r.viviendasOferta ?? 0), 0);
    const cuvs = filtrados.reduce((acc, r) => acc + r.cuvsEmitidos, 0);
    const totalViv = filtrados.reduce((acc, r) => acc + r.viviendas, 0);
    const totalPaquete = filtrados.reduce((acc, r) => acc + r.conPaqueteRuv, 0);
    const pctGlobal = totalViv > 0 ? Math.round((100 * totalPaquete) / totalViv) : null;
    const sinViviendas = filtrados.filter((r) => r.viviendas === 0).length;

    return [
      { key: 'frentes', label: 'Frentes', value: totalFrentes },
      {
        key: 'viviendas-oferta',
        label: 'Viviendas en oferta',
        value: viviendasOferta === 0 ? '—' : viviendasOferta,
      },
      { key: 'cuvs', label: 'CUVs emitidos', value: cuvs === 0 ? '—' : cuvs },
      {
        key: 'avance',
        label: 'Avance paquete RUV',
        value: pctGlobal == null ? '—' : `${pctGlobal}%`,
      },
      {
        key: 'sin-viviendas',
        label: 'Frentes sin viviendas',
        value: sinViviendas,
        valueClassName: sinViviendas > 0 ? 'text-amber-500' : undefined,
      },
    ];
  }, [filtrados]);

  const columns: Column<RuvFrenteRow>[] = [
    {
      key: 'nombre',
      label: 'Frente',
      type: 'text',
      sticky: true,
      width: 'min-w-[220px]',
      render: (r) => (
        <div className="min-w-0">
          <div className="font-medium text-[var(--text)]">{r.nombre}</div>
          {r.proyectoNombre ? (
            <div className="text-xs text-[var(--text)]/60">{r.proyectoNombre}</div>
          ) : null}
        </div>
      ),
    },
    {
      key: 'idOferta',
      label: 'ID Oferta',
      type: 'text',
      align: 'right',
      accessor: (r) => r.idOferta ?? Number.NEGATIVE_INFINITY,
      render: (r) => (r.idOferta != null ? r.idOferta : '—'),
    },
    {
      key: 'viviendasOferta',
      label: 'Viv. oferta',
      type: 'text',
      align: 'right',
      accessor: (r) => r.viviendasOferta ?? -1,
      render: (r) => r.viviendasOferta ?? '—',
    },
    {
      key: 'viviendas',
      label: 'Viv. ligadas',
      type: 'text',
      align: 'right',
      accessor: (r) => r.viviendas,
      render: (r) => r.viviendas,
    },
    {
      key: 'cuvsEmitidos',
      label: 'CUVs',
      type: 'text',
      align: 'right',
      accessor: (r) => r.cuvsEmitidos,
      render: (r) => r.cuvsEmitidos,
    },
    {
      key: 'pctPaqueteRuv',
      label: 'Avance',
      type: 'custom',
      align: 'right',
      accessor: (r) => r.pctPaqueteRuv ?? -1,
      render: (r) => (
        <Badge tone={avanceTone(r.pctPaqueteRuv)}>{avanceLabel(r.pctPaqueteRuv)}</Badge>
      ),
    },
    {
      key: 'documentosPendientes',
      label: 'Docs pend.',
      type: 'custom',
      align: 'right',
      sortable: false,
      render: (r) =>
        r.documentosPendientes > 0 ? (
          <Badge tone={docsPendientesTone(r.documentosPendientes)}>{r.documentosPendientes}</Badge>
        ) : (
          <span className="text-[var(--text)]/40">—</span>
        ),
    },
    {
      key: 'fechaInicio',
      label: 'Inicio',
      type: 'text',
      align: 'right',
      accessor: (r) => r.fechaInicio ?? '',
      render: (r) => (r.fechaInicio ? formatDate(r.fechaInicio) : '—'),
    },
  ];

  return (
    <div className="space-y-6 p-6">
      <header className="flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[var(--accent)]/10 text-[var(--accent)]">
          <FileStack className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-[var(--text)]">
            RUV — Frentes
          </h1>
          <p className="text-sm text-[var(--text)]/60">
            Ofertas de vivienda registradas ante INFONAVIT, su avance de trámite y el checklist de
            documentos del paquete.
          </p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            onClick={() => void cargar()}
            className="flex h-9 items-center gap-1.5 rounded-md border border-[var(--border)] px-3 text-sm text-[var(--text)]/70 hover:text-[var(--text)]"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Refrescar
          </button>
          <button
            type="button"
            onClick={() => setCrearOpen(true)}
            className="flex h-9 items-center gap-1.5 rounded-md bg-[var(--accent)] px-3 text-sm font-medium text-white hover:opacity-90"
          >
            <Plus className="h-3.5 w-3.5" />
            Nuevo frente
          </button>
        </div>
      </header>

      <ModuleKpiStrip stats={kpis} cols={5} />

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative max-w-xs flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text)]/40" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar frente, proyecto, ID oferta…"
            className="pl-8"
          />
        </div>
        <select
          value={proyectoFiltro}
          onChange={(e) => setProyectoFiltro(e.target.value)}
          className="h-9 rounded-md border border-[var(--border)] bg-[var(--bg)] px-2 text-sm text-[var(--text)]"
        >
          <option value="">Todos los proyectos</option>
          {proyectos.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
      </div>

      <DataTable
        data={filtrados}
        columns={columns}
        rowKey="id"
        loading={loading}
        error={error}
        onRetry={() => void cargar()}
        onRowClick={(r) => router.push(`/dilesa/ruv/${r.id}`)}
        initialSort={{ key: 'nombre', dir: 'asc' }}
        emptyTitle="Sin frentes RUV"
        emptyDescription="No hay frentes (ofertas) registrados para DILESA."
        emptyIcon={<FileStack className="h-6 w-6" />}
        maxHeight="calc(100vh - 340px)"
      />

      <RuvFrenteCrearDrawer
        empresaId={empresaId}
        open={crearOpen}
        onOpenChange={setCrearOpen}
        onDone={() => void cargar()}
      />
    </div>
  );
}
