'use client';

/* eslint-disable react-hooks/set-state-in-effect --
 * Mismo data-sync pattern que el resto de páginas de lectura DILESA.
 */

/**
 * Vista del reporte «Calificación por fase» (DILESA · Ventas) — ADR-047,
 * iniciativa dilesa-fluidez-pipeline (S2a, el radar de cuellos).
 *
 * Por cada fase del pipeline (1–14): mediana y p90 de días, contra su benchmark
 * histórico (la "vara"), con banda y tendencia vs. el periodo anterior. El corte
 * temporal (mes/trimestre/semestre/año/todo) lo resuelve el RPC
 * `fn_fase_calificacion` sobre tramos CERRADOS en el periodo; el modo "solo
 * activas" agrega la antigüedad ACTUAL del pipeline vivo. El motor puro
 * `construirCalificacion` arma las filas (mismo que alimentaría el PDF).
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { createSupabaseBrowserClient } from '@/lib/supabase-browser';
import { ModuleKpiStrip, type ModuleKpi } from '@/components/module-page';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { DILESA_EMPRESA_ID } from '@/lib/empresa-constants';
import { getSupabaseErrorMessage } from '@/lib/supabase-error';
import { usePermissions, useEffectiveUser } from '@/components/providers';
import { useUrlFilters } from '@/hooks/use-url-filters';
import { getReporte } from '@/lib/dilesa/reportes/registry';
import {
  agregarPorFase,
  bandaTone,
  construirCalificacion,
  type FaseBenchmark,
  type FaseCalificacionRaw,
} from '@/lib/dilesa/reportes/calificacion-por-fase';
import { ReporteShell } from './reporte-shell';

const REPORTE = getReporte('calificacion-por-fase')!;
const VOLVER_HREF = '/dilesa/ventas/reportes';

const PERIODOS = {
  mes: { label: 'Último mes', dias: 30 },
  trimestre: { label: 'Último trimestre', dias: 90 },
  semestre: { label: 'Último semestre', dias: 180 },
  anio: { label: 'Último año', dias: 365 },
  todo: { label: 'Todo el histórico', dias: null },
  activas: { label: 'Solo activas (hoy)', dias: null },
} as const;
type PeriodoKey = keyof typeof PERIODOS;

const DEFAULT_FILTERS = { periodo: 'trimestre' };

const RESPONSABLE_LABEL = { interna: 'interna', tercero: 'tercero', mixta: 'mixta' } as const;

function fechaISO(msEpoch: number): string {
  return new Date(msEpoch).toISOString().slice(0, 10);
}

export function CalificacionPorFaseView() {
  const { filters, setFilter } = useUrlFilters(DEFAULT_FILTERS);
  // Solo Dirección/admin edita metas (la RLS lo enforce; aquí decide si se
  // muestra el input). Espejo del patrón de requisiciones/presupuesto.
  const { permissions } = usePermissions();
  const { data: effectiveUser } = useEffectiveUser();
  const esDireccion =
    permissions.isAdmin || (effectiveUser?.direccionEmpresaIds ?? []).includes(DILESA_EMPRESA_ID);
  const periodo = (
    Object.prototype.hasOwnProperty.call(PERIODOS, filters.periodo) ? filters.periodo : 'trimestre'
  ) as PeriodoKey;

  const [benchmark, setBenchmark] = useState<FaseBenchmark[]>([]);
  const [periodoRaw, setPeriodoRaw] = useState<FaseCalificacionRaw[]>([]);
  const [previoRaw, setPrevioRaw] = useState<FaseCalificacionRaw[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    setLoading(true);
    setError(null);
    const sb = createSupabaseBrowserClient();
    // El benchmark (vara) es independiente del corte del periodo → va en paralelo
    // con el RPC / la antigüedad, no en serie (antes eran 2 round-trips).
    const benchQuery = sb
      .schema('dilesa')
      .from('v_fase_vara')
      .select('posicion, fase, mediana, p90, n, meta, vara')
      .eq('empresa_id', DILESA_EMPRESA_ID);

    if (periodo === 'activas') {
      // Permanencia ACTUAL del pipeline vivo (no tramos cerrados): se agrega en
      // el cliente desde la antigüedad de cada venta activa.
      const [benchRes, antRes] = await Promise.all([
        benchQuery,
        sb
          .schema('dilesa')
          .from('v_ventas_lista_antiguedad')
          .select('fase_posicion, fase_actual, dias_en_fase')
          .eq('empresa_id', DILESA_EMPRESA_ID),
      ]);
      if (benchRes.error || antRes.error) {
        setError(
          getSupabaseErrorMessage(
            benchRes.error ?? antRes.error,
            'No se pudo cargar el pipeline activo.'
          )
        );
        setLoading(false);
        return;
      }
      const rows = (antRes.data ?? [])
        .filter(
          (r): r is { fase_posicion: number; fase_actual: string; dias_en_fase: number } =>
            r.fase_posicion != null && r.fase_posicion <= 14 && r.dias_en_fase != null
        )
        .map((r) => ({
          posicion: r.fase_posicion,
          fase: r.fase_actual ?? '',
          dias: r.dias_en_fase,
        }));
      setBenchmark((benchRes.data ?? []) as FaseBenchmark[]);
      setPeriodoRaw(agregarPorFase(rows));
      setPrevioRaw([]);
      setLoading(false);
      return;
    }

    const dias = PERIODOS[periodo].dias;
    const hoy = Date.now();
    type RpcArgs = { p_empresa: string; p_desde?: string; p_hasta?: string };
    let curArgs: RpcArgs;
    let prevArgs: RpcArgs | null;
    if (dias == null) {
      curArgs = { p_empresa: DILESA_EMPRESA_ID };
      prevArgs = null;
    } else {
      curArgs = {
        p_empresa: DILESA_EMPRESA_ID,
        p_desde: fechaISO(hoy - dias * 86_400_000),
        p_hasta: fechaISO(hoy),
      };
      prevArgs = {
        p_empresa: DILESA_EMPRESA_ID,
        p_desde: fechaISO(hoy - 2 * dias * 86_400_000),
        p_hasta: fechaISO(hoy - dias * 86_400_000),
      };
    }

    const [benchRes, curRes, prevRes] = await Promise.all([
      benchQuery,
      sb.schema('dilesa').rpc('fn_fase_calificacion', curArgs),
      prevArgs ? sb.schema('dilesa').rpc('fn_fase_calificacion', prevArgs) : Promise.resolve(null),
    ]);
    if (benchRes.error || curRes.error) {
      setError(
        getSupabaseErrorMessage(
          benchRes.error ?? curRes.error,
          'No se pudo calcular la calificación.'
        )
      );
      setLoading(false);
      return;
    }
    setBenchmark((benchRes.data ?? []) as FaseBenchmark[]);
    setPeriodoRaw((curRes.data ?? []) as FaseCalificacionRaw[]);
    setPrevioRaw(((prevRes?.data ?? []) as FaseCalificacionRaw[]) ?? []);
    setLoading(false);
  }, [periodo]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  // Fija/actualiza/borra la meta de una fase (solo Dirección; la RLS lo enforce).
  // Valor vacío = borrar la meta (vuelve a la mediana histórica como vara).
  const guardarMeta = useCallback(
    async (posicion: number, valor: string) => {
      const sb = createSupabaseBrowserClient();
      const limpio = valor.trim();
      if (limpio === '') {
        await sb
          .schema('dilesa')
          .from('fase_metas')
          .update({ activa: false })
          .eq('empresa_id', DILESA_EMPRESA_ID)
          .eq('posicion', posicion);
      } else {
        const meta = Number(limpio);
        if (Number.isNaN(meta) || meta < 0) return;
        const { error: upErr } = await sb
          .schema('dilesa')
          .from('fase_metas')
          .upsert(
            { empresa_id: DILESA_EMPRESA_ID, posicion, meta_dias: meta, activa: true },
            { onConflict: 'empresa_id,posicion' }
          );
        if (upErr) {
          setError(getSupabaseErrorMessage(upErr, 'No se pudo guardar la meta.'));
          return;
        }
      }
      await cargar();
    },
    [cargar]
  );

  const result = useMemo(
    () => construirCalificacion(periodoRaw, benchmark, previoRaw),
    [periodoRaw, benchmark, previoRaw]
  );

  const kpis = useMemo<readonly ModuleKpi[]>(() => {
    const calificadas = result.filas.filter((f) => f.banda !== 'gris').length;
    return [
      { key: 'cuello', label: 'Cuello (p90 más alto)', value: result.cuello?.fase ?? '—' },
      {
        key: 'cuello_dias',
        label: 'Días del cuello (p90)',
        value: result.cuello ? `${result.cuello.p90} d` : '—',
      },
      { key: 'lentas', label: 'Fases lentas (rojo)', value: result.fasesLentas },
      {
        key: 'calificadas',
        label: 'Fases con muestra',
        value: `${calificadas}/${result.filas.length}`,
      },
    ];
  }, [result]);

  const filtros = (
    <>
      <select
        value={periodo}
        onChange={(e) => setFilter('periodo', e.target.value)}
        className="h-9 rounded-md border border-[var(--border)] bg-[var(--card)] px-3 text-sm text-[var(--text)]"
        aria-label="Periodo"
      >
        {(Object.keys(PERIODOS) as PeriodoKey[]).map((k) => (
          <option key={k} value={k}>
            {PERIODOS[k].label}
          </option>
        ))}
      </select>
      <button
        type="button"
        onClick={() => void cargar()}
        className="flex h-9 items-center gap-1.5 rounded-md border border-[var(--border)] px-3 text-sm text-[var(--text)]/70 hover:text-[var(--text)]"
      >
        <RefreshCw className="h-3.5 w-3.5" /> Refrescar
      </button>
    </>
  );

  const esActivas = periodo === 'activas';

  return (
    <ReporteShell reporte={REPORTE} volverHref={VOLVER_HREF} filtros={filtros}>
      <ModuleKpiStrip stats={kpis} cols={4} />

      <p className="text-xs text-[var(--text)]/50">
        {esActivas
          ? 'Permanencia actual de las ventas vivas en cada fase. Banda vs. la vara de la fase (meta o histórico).'
          : 'Mediana y p90 de días por fase en el periodo (tramos ya completados). Banda = qué tan lenta vs. su vara. Fases 1–14 del pipeline; las post-entrega se excluyen.'}
        {esDireccion ? (
          <span className="text-[var(--text)]/40">
            {' '}
            Como Dirección, puedes editar la <strong>Meta</strong> de cada fase (vacío = usar la
            mediana histórica).
          </span>
        ) : null}
      </p>

      {error ? (
        <div className="space-y-3">
          <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
            {error}
          </div>
          <button
            type="button"
            onClick={() => void cargar()}
            className="flex h-9 items-center gap-1.5 rounded-md border border-[var(--border)] px-3 text-sm text-[var(--text)]/70 hover:text-[var(--text)]"
          >
            <RefreshCw className="h-3.5 w-3.5" /> Reintentar
          </button>
        </div>
      ) : loading ? (
        <Skeleton className="h-96 w-full rounded-xl" />
      ) : (
        <div className="overflow-hidden rounded-xl border border-[var(--border)]">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--border)] bg-[var(--bg)]/40 text-left text-xs uppercase tracking-wide text-[var(--text)]/50">
                <th className="w-10 px-3 py-2.5 font-medium">#</th>
                <th className="px-3 py-2.5 font-medium">Fase</th>
                <th className="px-3 py-2.5 text-right font-medium">{esActivas ? 'Ventas' : 'n'}</th>
                <th className="px-3 py-2.5 text-right font-medium">Mediana</th>
                <th className="px-3 py-2.5 text-right font-medium">p90</th>
                <th className="hidden px-3 py-2.5 text-right font-medium md:table-cell">
                  Histórico
                </th>
                <th className="px-3 py-2.5 text-right font-medium">Meta</th>
                <th className="px-3 py-2.5 text-center font-medium">Banda</th>
                {!esActivas ? (
                  <th className="hidden px-3 py-2.5 text-right font-medium md:table-cell">
                    Δ previo
                  </th>
                ) : null}
              </tr>
            </thead>
            <tbody>
              {result.filas.map((f) => (
                <tr
                  key={f.posicion}
                  className="border-b border-[var(--border)]/50 last:border-0 hover:bg-[var(--bg)]/30"
                >
                  <td className="px-3 py-2.5 font-mono text-xs text-[var(--text)]/40">
                    {String(f.posicion).padStart(2, '0')}
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-[var(--text)]">{f.fase}</span>
                      {f.responsable === 'tercero' ? (
                        <span className="rounded bg-[var(--border)]/50 px-1.5 py-0.5 text-[10px] text-[var(--text)]/50">
                          {RESPONSABLE_LABEL[f.responsable]}
                        </span>
                      ) : null}
                    </div>
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-[var(--text)]/80">
                    {f.n}
                  </td>
                  <td className="px-3 py-2.5 text-right font-semibold tabular-nums text-[var(--text)]">
                    {f.mediana != null ? `${f.mediana} d` : '—'}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-[var(--text)]/70">
                    {f.p90 != null ? `${f.p90} d` : '—'}
                  </td>
                  <td className="hidden px-3 py-2.5 text-right tabular-nums text-[var(--text)]/45 md:table-cell">
                    {f.baseline != null ? `${f.baseline} d` : '—'}
                  </td>
                  <td className="px-3 py-2.5 text-right">
                    {esDireccion ? (
                      <input
                        key={`meta-${f.posicion}-${f.meta ?? ''}`}
                        type="number"
                        min={0}
                        defaultValue={f.meta ?? ''}
                        placeholder={f.baseline != null ? String(f.baseline) : '—'}
                        onBlur={(e) => {
                          if (e.target.value !== String(f.meta ?? ''))
                            void guardarMeta(f.posicion, e.target.value);
                        }}
                        className="w-14 rounded border border-[var(--border)] bg-[var(--card)] px-1.5 py-0.5 text-right text-xs tabular-nums"
                        title="Meta de días para esta fase (vacío = usar la mediana histórica)"
                      />
                    ) : f.meta != null ? (
                      <span className="tabular-nums text-[var(--text)]/70">{f.meta} d</span>
                    ) : (
                      <span className="text-[var(--text)]/30">auto</span>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-center">
                    {f.banda === 'gris' ? (
                      <span className="text-[11px] text-[var(--text)]/35">n&lt;5</span>
                    ) : (
                      <Badge tone={bandaTone(f.banda)}>
                        {f.banda === 'verde' ? 'Al día' : f.banda === 'ambar' ? 'Lenta' : 'Crítica'}
                      </Badge>
                    )}
                  </td>
                  {!esActivas ? (
                    <td className="hidden px-3 py-2.5 text-right tabular-nums md:table-cell">
                      {f.deltaPrevio == null || f.deltaPrevio === 0 ? (
                        <span className="text-[var(--text)]/30">—</span>
                      ) : f.deltaPrevio > 0 ? (
                        <span className="text-red-500">▲ {f.deltaPrevio} d</span>
                      ) : (
                        <span className="text-emerald-500">▼ {Math.abs(f.deltaPrevio)} d</span>
                      )}
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </ReporteShell>
  );
}
