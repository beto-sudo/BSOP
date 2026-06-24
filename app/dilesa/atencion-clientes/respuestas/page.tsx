'use client';

/**
 * Atención a Clientes · pestaña "Respuestas" — bandeja de encuestas de
 * conformidad respondidas (Fase 16). Lectura/análisis sobre la vista
 * `dilesa.v_ac_encuestas_respondidas`, sin duplicar captura:
 *
 *   - KPIs del set filtrado (respuestas, NPS prom, detractores, calificaciones).
 *   - Filtros por fecha, proyecto y segmento NPS (promotor/pasivo/detractor).
 *   - Tabla con el comentario libre y foco en detractores para dar seguimiento;
 *     cada fila abre el expediente de la venta.
 *   - Export CSV del set filtrado ("extraer más información").
 *
 * `'use client'` + `useUrlFilters` (useSearchParams) → cuerpo bajo `<Suspense>`.
 * Reusa el permiso del módulo `dilesa.atencion_clientes` (sin sub-slug).
 */

import Link from 'next/link';
import { Suspense, useEffect, useMemo, useState } from 'react';
import { Download, MessageSquareText, RefreshCw, Star } from 'lucide-react';
import { RequireAccess } from '@/components/require-access';
import { createSupabaseBrowserClient } from '@/lib/supabase-browser';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { ModuleKpiStrip, type ModuleKpi } from '@/components/module-page';
import { getSupabaseErrorMessage } from '@/lib/supabase-error';
import { formatDate } from '@/lib/format';
import { useUrlFilters } from '@/hooks/use-url-filters';

type Segmento = 'promotor' | 'pasivo' | 'detractor';

type Respuesta = {
  encuesta_id: string;
  venta_id: string;
  nps: number | null;
  calif_vivienda: number | null;
  calif_proceso: number | null;
  comentario: string | null;
  canal: string | null;
  respondida_at: string | null;
  respondida_fecha: string | null;
  cliente: string | null;
  unidad: string | null;
  proyecto_id: string | null;
  proyecto: string | null;
  nps_segmento: Segmento | null;
};

const DEFAULT_FILTERS = { desde: '', hasta: '', proyecto: '', segmento: '' };

const SEGMENTOS: ReadonlyArray<{ value: '' | Segmento; label: string }> = [
  { value: '', label: 'Todos los segmentos' },
  { value: 'detractor', label: 'Detractores (0-6)' },
  { value: 'pasivo', label: 'Pasivos (7-8)' },
  { value: 'promotor', label: 'Promotores (9-10)' },
];

export default function RespuestasPage() {
  return (
    <RequireAccess empresa="dilesa" modulo="dilesa.atencion_clientes">
      <Suspense
        fallback={
          <div className="container mx-auto max-w-6xl px-4 py-6">
            <Skeleton className="h-96 w-full rounded-xl" />
          </div>
        }
      >
        <RespuestasBody />
      </Suspense>
    </RequireAccess>
  );
}

function RespuestasBody() {
  const { filters, setFilter, clearAll, activeCount } = useUrlFilters(DEFAULT_FILTERS);
  const [respuestas, setRespuestas] = useState<Respuesta[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [recarga, setRecarga] = useState(0);

  useEffect(() => {
    let activo = true;
    (async () => {
      const sb = createSupabaseBrowserClient();
      const { data, error: err } = await sb
        .schema('dilesa')
        .from('v_ac_encuestas_respondidas')
        .select('*')
        .order('respondida_at', { ascending: false });
      if (!activo) return;
      if (err) {
        setError(getSupabaseErrorMessage(err, 'No se pudieron cargar las respuestas.'));
        setLoading(false);
        return;
      }
      setError(null);
      setRespuestas((data ?? []) as Respuesta[]);
      setLoading(false);
    })();
    return () => {
      activo = false;
    };
  }, [recarga]);

  const proyectos = useMemo(() => {
    const map = new Map<string, string>();
    for (const r of respuestas) {
      if (r.proyecto_id && r.proyecto) map.set(r.proyecto_id, r.proyecto);
    }
    return [...map.entries()]
      .map(([id, nombre]) => ({ id, nombre }))
      .sort((a, b) => a.nombre.localeCompare(b.nombre));
  }, [respuestas]);

  const filtradas = useMemo(() => {
    return respuestas.filter((r) => {
      const f = r.respondida_fecha ?? '';
      if (filters.desde && f < filters.desde) return false;
      if (filters.hasta && f > filters.hasta) return false;
      if (filters.proyecto && r.proyecto_id !== filters.proyecto) return false;
      if (filters.segmento && r.nps_segmento !== filters.segmento) return false;
      return true;
    });
  }, [respuestas, filters]);

  const stats = useMemo(() => {
    const avg = (xs: Array<number | null>) => {
      const v = xs.filter((x): x is number => x != null);
      return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
    };
    return {
      n: filtradas.length,
      npsProm: avg(filtradas.map((r) => r.nps)),
      detractores: filtradas.filter((r) => r.nps_segmento === 'detractor').length,
      vivProm: avg(filtradas.map((r) => r.calif_vivienda)),
      procProm: avg(filtradas.map((r) => r.calif_proceso)),
    };
  }, [filtradas]);

  const kpis = useMemo<readonly ModuleKpi[]>(() => {
    const round1 = (x: number | null) => (x == null ? '—' : `${Math.round(x * 10) / 10}`);
    return [
      { key: 'n', label: 'Respuestas', value: stats.n },
      {
        key: 'nps',
        label: 'NPS prom',
        value: round1(stats.npsProm),
        valueClassName:
          stats.npsProm == null
            ? 'text-[var(--text)]/40'
            : stats.npsProm >= 9
              ? 'text-emerald-500'
              : stats.npsProm >= 7
                ? 'text-amber-500'
                : 'text-red-500',
      },
      {
        key: 'detractores',
        label: 'Detractores',
        value: stats.detractores,
        valueClassName: stats.detractores > 0 ? 'text-red-500' : 'text-[var(--text)]/40',
      },
      {
        key: 'viv',
        label: 'Vivienda',
        value: stats.vivProm == null ? '—' : `${round1(stats.vivProm)}/5`,
      },
      {
        key: 'proc',
        label: 'Proceso',
        value: stats.procProm == null ? '—' : `${round1(stats.procProm)}/5`,
      },
    ];
  }, [stats]);

  return (
    <div className="container mx-auto max-w-6xl space-y-6 px-4 py-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-[var(--text)]">
            Respuestas de encuestas
          </h1>
          <p className="mt-1 text-sm text-[var(--text)]/60">
            Conformidad posventa contestada por los clientes. Filtra, lee los comentarios y da
            seguimiento a los detractores.
          </p>
        </div>
        <button
          type="button"
          onClick={() => descargarCsv(filtradas)}
          disabled={filtradas.length === 0}
          className="flex h-9 items-center gap-1.5 rounded-md border border-[var(--border)] px-3 text-sm text-[var(--text)]/70 hover:text-[var(--text)] disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Download className="h-3.5 w-3.5" /> Exportar CSV
        </button>
      </header>

      <ModuleKpiStrip stats={kpis} cols={5} />

      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-1.5 text-xs text-[var(--text)]/60">
          Desde
          <input
            type="date"
            value={filters.desde}
            onChange={(e) => setFilter('desde', e.target.value)}
            className="h-9 rounded-md border border-[var(--border)] bg-[var(--card)] px-2 text-sm text-[var(--text)]"
          />
        </label>
        <label className="flex items-center gap-1.5 text-xs text-[var(--text)]/60">
          Hasta
          <input
            type="date"
            value={filters.hasta}
            onChange={(e) => setFilter('hasta', e.target.value)}
            className="h-9 rounded-md border border-[var(--border)] bg-[var(--card)] px-2 text-sm text-[var(--text)]"
          />
        </label>
        <select
          value={filters.proyecto}
          onChange={(e) => setFilter('proyecto', e.target.value)}
          className="h-9 rounded-md border border-[var(--border)] bg-[var(--card)] px-3 text-sm text-[var(--text)]"
        >
          <option value="">Todos los proyectos</option>
          {proyectos.map((p) => (
            <option key={p.id} value={p.id}>
              {p.nombre}
            </option>
          ))}
        </select>
        <select
          value={filters.segmento}
          onChange={(e) => setFilter('segmento', e.target.value)}
          className="h-9 rounded-md border border-[var(--border)] bg-[var(--card)] px-3 text-sm text-[var(--text)]"
        >
          {SEGMENTOS.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
        {activeCount > 0 ? (
          <button
            type="button"
            onClick={() => clearAll()}
            className="text-xs text-[var(--text)]/60 underline hover:text-[var(--text)]"
          >
            Limpiar filtros
          </button>
        ) : null}
        <button
          type="button"
          onClick={() => setRecarga((n) => n + 1)}
          className="ml-auto flex h-9 items-center gap-1.5 rounded-md border border-[var(--border)] px-3 text-sm text-[var(--text)]/70 hover:text-[var(--text)]"
        >
          <RefreshCw className="h-3.5 w-3.5" /> Refrescar
        </button>
      </div>

      {error ? (
        <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
          {error}
        </div>
      ) : loading ? (
        <Skeleton className="h-96 w-full rounded-xl" />
      ) : respuestas.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[var(--border)] p-10 text-center text-sm text-[var(--text)]/50">
          Aún no hay encuestas respondidas. Cuando un cliente conteste la conformidad posventa,
          aparecerá aquí.
        </div>
      ) : filtradas.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[var(--border)] p-10 text-center text-sm text-[var(--text)]/50">
          Ninguna respuesta coincide con los filtros.
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-[var(--border)]">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--border)] bg-[var(--bg)]/40 text-left text-xs uppercase tracking-wide text-[var(--text)]/50">
                <th className="px-3 py-2.5 font-medium">Fecha</th>
                <th className="px-3 py-2.5 font-medium">Cliente</th>
                <th className="hidden px-3 py-2.5 font-medium md:table-cell">Proyecto / unidad</th>
                <th className="px-3 py-2.5 text-center font-medium">NPS</th>
                <th className="hidden px-3 py-2.5 text-center font-medium sm:table-cell">
                  Vivienda
                </th>
                <th className="hidden px-3 py-2.5 text-center font-medium lg:table-cell">
                  Proceso
                </th>
                <th className="px-3 py-2.5 font-medium">Comentario</th>
              </tr>
            </thead>
            <tbody>
              {filtradas.map((r) => (
                <tr
                  key={r.encuesta_id}
                  className="border-b border-[var(--border)]/50 last:border-0 hover:bg-[var(--bg)]/30"
                >
                  <td className="whitespace-nowrap px-3 py-2.5 tabular-nums text-[var(--text)]/70">
                    {formatDate(r.respondida_fecha)}
                  </td>
                  <td className="px-3 py-2.5">
                    <Link
                      href={`/dilesa/ventas/${r.venta_id}`}
                      className="font-medium text-[var(--text)] underline-offset-2 hover:underline"
                    >
                      {r.cliente ?? '(sin nombre)'}
                    </Link>
                  </td>
                  <td className="hidden px-3 py-2.5 text-[var(--text)]/70 md:table-cell">
                    {[r.proyecto, r.unidad].filter(Boolean).join(' · ') || '—'}
                  </td>
                  <td className="px-3 py-2.5 text-center">
                    <NpsCelda nps={r.nps} segmento={r.nps_segmento} />
                  </td>
                  <td className="hidden px-3 py-2.5 text-center sm:table-cell">
                    <Calif valor={r.calif_vivienda} />
                  </td>
                  <td className="hidden px-3 py-2.5 text-center lg:table-cell">
                    <Calif valor={r.calif_proceso} />
                  </td>
                  <td className="px-3 py-2.5 text-[var(--text)]/80">
                    {r.comentario ? (
                      <span className="flex items-start gap-1.5">
                        <MessageSquareText className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--text)]/30" />
                        <span className="line-clamp-2" title={r.comentario}>
                          {r.comentario}
                        </span>
                      </span>
                    ) : (
                      <span className="text-[var(--text)]/30">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function NpsCelda({ nps, segmento }: { nps: number | null; segmento: Segmento | null }) {
  const tone =
    segmento === 'promotor'
      ? 'success'
      : segmento === 'pasivo'
        ? 'warning'
        : segmento === 'detractor'
          ? 'danger'
          : 'neutral';
  return (
    <span className="inline-flex items-center gap-1.5">
      <Badge tone={tone}>{nps ?? '—'}</Badge>
      {segmento === 'detractor' ? (
        <span className="hidden text-[11px] font-medium text-red-500 lg:inline">Detractor</span>
      ) : null}
    </span>
  );
}

function Calif({ valor }: { valor: number | null }) {
  if (valor == null) return <span className="text-[var(--text)]/30">—</span>;
  return (
    <span className="inline-flex items-center gap-0.5 tabular-nums text-[var(--text)]/80">
      {valor}
      <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
    </span>
  );
}

function descargarCsv(rows: Respuesta[]) {
  if (rows.length === 0) return;
  const header = [
    'Fecha',
    'Cliente',
    'Proyecto',
    'Unidad',
    'NPS',
    'Segmento',
    'Vivienda',
    'Proceso',
    'Comentario',
  ];
  const esc = (v: string | number | null) => {
    const s = v == null ? '' : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = rows.map((r) =>
    [
      r.respondida_fecha,
      r.cliente,
      r.proyecto,
      r.unidad,
      r.nps,
      r.nps_segmento,
      r.calif_vivienda,
      r.calif_proceso,
      r.comentario,
    ]
      .map(esc)
      .join(',')
  );
  // BOM para que Excel respete el UTF-8 (acentos en comentarios/nombres).
  const blob = new Blob(['﻿' + [header.join(','), ...lines].join('\n')], {
    type: 'text/csv;charset=utf-8;',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'encuestas-respondidas.csv';
  a.click();
  URL.revokeObjectURL(url);
}
