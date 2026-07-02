'use client';

/**
 * EvaluacionModule — Evaluación 2.0 del embudo de compra de terrenos
 * (iniciativa `dilesa-portafolio-predios` · S6).
 *
 * Kanban por etapa (detectado → análisis → negociación → decisión) sobre
 * los activos `estado=prospecto`. Cards con $/m² solicitado, prioridad,
 * responsable, siguiente acción y alerta de estancamiento (>30 días sin
 * revisión). Cambiar etapa desde la card (Dirección/admin) queda en la
 * bitácora vía trigger. Click → expediente.
 */

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createSupabaseBrowserClient } from '@/lib/supabase-browser';
import { ModuleKpiStrip, type ModuleKpi } from '@/components/module-page';
import { Badge } from '@/components/ui/badge';
import { formatCurrency } from '@/lib/format';
import { getSupabaseErrorMessage } from '@/lib/supabase-error';
import { useEffectiveUser } from '@/components/providers';
import { actualizarEmbudoTerreno } from '@/app/dilesa/portafolio/actions';
import {
  DIAS_ESTANCAMIENTO,
  ETAPAS_EMBUDO,
  diasSinRevision,
  promedioPrecioM2,
} from '@/lib/dilesa/evaluacion';
import { hoyISOMatamoros } from '@/lib/fecha-mx';
import { Landmark, Search } from 'lucide-react';
import { Input } from '@/components/ui/input';

type Prospecto = {
  id: string;
  nombre: string;
  tipo: string;
  zona: string | null;
  municipio: string | null;
  area_m2: number | null;
  created_at: string;
  etapa: string | null;
  prioridad: string | null;
  responsable: string | null;
  siguiente_accion: string | null;
  fecha_ultima_revision: string | null;
  precio_solicitado_m2: number | null;
  precio_ofertado_m2: number | null;
};

async function fetchProspectos(
  empresaId: string
): Promise<{ ok: true; rows: Prospecto[] } | { ok: false; error: string }> {
  const sb = createSupabaseBrowserClient();
  const { data: activos, error: aErr } = await sb
    .schema('dilesa')
    .from('activos')
    .select('id, nombre, tipo, zona, municipio, area_m2, created_at')
    .eq('empresa_id', empresaId)
    .eq('estado', 'prospecto')
    .is('deleted_at', null)
    .order('nombre');
  if (aErr) {
    return {
      ok: false,
      error: getSupabaseErrorMessage(aErr, 'No se pudieron cargar los prospectos.'),
    };
  }
  const ids = (activos ?? []).map((a) => a.id);
  const sat = new Map<string, Partial<Prospecto>>();
  if (ids.length > 0) {
    const { data: terrenos } = await sb
      .schema('dilesa')
      .from('activo_terreno')
      .select(
        'activo_id, etapa, prioridad, responsable, siguiente_accion, fecha_ultima_revision, precio_solicitado_m2, precio_ofertado_m2'
      )
      .in('activo_id', ids);
    for (const t of terrenos ?? []) {
      sat.set(t.activo_id as string, t as unknown as Partial<Prospecto>);
    }
  }
  const rows = (activos ?? []).map((a) => ({
    ...(a as Omit<
      Prospecto,
      | 'etapa'
      | 'prioridad'
      | 'responsable'
      | 'siguiente_accion'
      | 'fecha_ultima_revision'
      | 'precio_solicitado_m2'
      | 'precio_ofertado_m2'
    >),
    etapa: null,
    prioridad: null,
    responsable: null,
    siguiente_accion: null,
    fecha_ultima_revision: null,
    precio_solicitado_m2: null,
    precio_ofertado_m2: null,
    ...sat.get(a.id),
  })) as Prospecto[];
  return { ok: true, rows };
}

function prioridadTone(p: string | null): 'danger' | 'warning' | 'neutral' {
  const v = (p ?? '').toLowerCase();
  if (v.startsWith('alta')) return 'danger';
  if (v.startsWith('media')) return 'warning';
  return 'neutral';
}

export function EvaluacionModule({ empresaId }: { empresaId: string }) {
  const router = useRouter();
  const { data: effectiveUser } = useEffectiveUser();
  const puedeAdmin =
    !!effectiveUser?.isAdmin || (effectiveUser?.direccionEmpresaIds ?? []).includes(empresaId);

  const [rows, setRows] = useState<Prospecto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const hoy = useMemo(() => hoyISOMatamoros(), []);

  useEffect(() => {
    let vivo = true;
    fetchProspectos(empresaId).then((r) => {
      if (!vivo) return;
      if (r.ok) {
        setRows(r.rows);
        setError(null);
      } else {
        setError(r.error);
      }
      setLoading(false);
    });
    return () => {
      vivo = false;
    };
  }, [empresaId]);

  const filtrados = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (r) =>
        r.nombre.toLowerCase().includes(q) ||
        (r.zona ?? '').toLowerCase().includes(q) ||
        (r.responsable ?? '').toLowerCase().includes(q)
    );
  }, [rows, search]);

  const kpis = useMemo<ModuleKpi[]>(() => {
    const sup = filtrados.reduce((a, r) => a + (r.area_m2 ?? 0), 0);
    const solicitado = filtrados.reduce(
      (a, r) => a + (r.area_m2 && r.precio_solicitado_m2 ? r.area_m2 * r.precio_solicitado_m2 : 0),
      0
    );
    const prom = promedioPrecioM2(filtrados.map((r) => r.precio_solicitado_m2));
    const estancados = filtrados.filter((r) => {
      const d = diasSinRevision(hoy, r.fecha_ultima_revision, r.created_at);
      return d != null && d > DIAS_ESTANCAMIENTO;
    }).length;
    return [
      { key: 'total', label: 'Prospectos', value: String(filtrados.length) },
      { key: 'sup', label: 'Superficie', value: `${Math.round(sup).toLocaleString('es-MX')} m²` },
      { key: 'valor', label: 'Valor solicitado', value: formatCurrency(solicitado) },
      {
        key: 'prom',
        label: '$/m² solicitado (prom.)',
        value: prom != null ? formatCurrency(prom) : '—',
      },
      {
        key: 'estancados',
        label: `Sin revisar > ${DIAS_ESTANCAMIENTO}d`,
        value: String(estancados),
      },
    ];
  }, [filtrados, hoy]);

  async function moverEtapa(p: Prospecto, etapa: string) {
    const r = await actualizarEmbudoTerreno({
      activoId: p.id,
      campos: { etapa },
      fechaRevision: hoy,
    });
    if (!r.ok) {
      setError(r.error);
      return;
    }
    setRows((rs) =>
      rs.map((x) => (x.id === p.id ? { ...x, etapa, fecha_ultima_revision: hoy } : x))
    );
  }

  const sinEmbudo = filtrados.filter((r) => r.tipo !== 'terreno');

  if (loading) {
    return (
      <div className="space-y-4 p-6">
        <div className="h-8 w-72 animate-pulse rounded bg-[var(--border)]/60" />
        <div className="grid gap-4 md:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-64 animate-pulse rounded-lg bg-[var(--border)]/40" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      <header className="flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[var(--accent)]/10 text-[var(--accent)]">
          <Landmark className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-[var(--text)]">
            Evaluación de compra
          </h1>
          <p className="text-sm text-[var(--text)]/60">
            Embudo de adquisición de terrenos: detectado → análisis → negociación → decisión. La
            salida es Adquirido o Descartado (se cambia en el expediente).
          </p>
        </div>
      </header>

      <ModuleKpiStrip stats={kpis} cols={5} />

      <div className="flex items-center gap-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text)]/40" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Nombre, zona o responsable…"
            className="w-72 pl-9"
          />
        </div>
        {error ? <p className="text-sm text-[var(--danger)]">{error}</p> : null}
      </div>

      <div className="grid items-start gap-4 md:grid-cols-2 xl:grid-cols-4">
        {ETAPAS_EMBUDO.map((col) => {
          const cards = filtrados.filter(
            (r) => r.tipo === 'terreno' && (r.etapa ?? 'detectado') === col.value
          );
          return (
            <div
              key={col.value}
              className="rounded-lg border border-[var(--border)] bg-[var(--card)]/60"
            >
              <div className="flex items-center justify-between border-b border-[var(--border)] px-3 py-2">
                <h2 className="text-sm font-medium text-[var(--text)]">{col.label}</h2>
                <span className="text-xs tabular-nums text-[var(--text)]/50">{cards.length}</span>
              </div>
              <div className="space-y-2 p-2">
                {cards.length === 0 ? (
                  <p className="px-1 py-3 text-center text-xs text-[var(--text)]/40">
                    Sin prospectos
                  </p>
                ) : null}
                {cards.map((p) => {
                  const dias = diasSinRevision(hoy, p.fecha_ultima_revision, p.created_at);
                  const estancado = dias != null && dias > DIAS_ESTANCAMIENTO;
                  return (
                    <div
                      key={p.id}
                      role="button"
                      tabIndex={0}
                      onClick={() => router.push(`/dilesa/portafolio/activo/${p.id}`)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') router.push(`/dilesa/portafolio/activo/${p.id}`);
                      }}
                      className="cursor-pointer rounded-md border border-[var(--border)] bg-[var(--card)] p-3 transition-colors hover:border-[var(--accent)]/60"
                    >
                      <div className="mb-1 flex items-start justify-between gap-2">
                        <span className="min-w-0 truncate text-sm font-medium text-[var(--text)]">
                          {p.nombre}
                        </span>
                        {p.prioridad ? (
                          <Badge tone={prioridadTone(p.prioridad)}>{p.prioridad}</Badge>
                        ) : null}
                      </div>
                      <div className="space-y-0.5 text-xs text-[var(--text)]/60">
                        <p>
                          {p.zona ?? p.municipio ?? '—'}
                          {p.area_m2 != null ? ` · ${p.area_m2.toLocaleString('es-MX')} m²` : ''}
                        </p>
                        <p className="tabular-nums">
                          {p.precio_solicitado_m2 != null
                            ? `Solicitan ${formatCurrency(p.precio_solicitado_m2)}/m²`
                            : 'Sin precio solicitado'}
                          {p.precio_ofertado_m2 != null
                            ? ` · ofertado ${formatCurrency(p.precio_ofertado_m2)}/m²`
                            : ''}
                        </p>
                        {p.responsable ? <p>Responsable: {p.responsable}</p> : null}
                        {p.siguiente_accion ? <p>→ {p.siguiente_accion}</p> : null}
                      </div>
                      <div className="mt-2 flex items-center justify-between gap-2">
                        {dias != null ? (
                          <span
                            className={`text-xs tabular-nums ${
                              estancado
                                ? 'font-medium text-[var(--danger)]'
                                : 'text-[var(--text)]/40'
                            }`}
                          >
                            {estancado ? '⚠ ' : ''}
                            {dias}d sin revisar
                          </span>
                        ) : (
                          <span />
                        )}
                        {puedeAdmin ? (
                          <select
                            value={p.etapa ?? 'detectado'}
                            onClick={(e) => e.stopPropagation()}
                            onChange={(e) => void moverEtapa(p, e.target.value)}
                            className="h-6 rounded border border-[var(--border)] bg-[var(--card)] px-1 text-xs text-[var(--text)]/70"
                          >
                            {ETAPAS_EMBUDO.map((e) => (
                              <option key={e.value} value={e.value}>
                                {e.label}
                              </option>
                            ))}
                          </select>
                        ) : null}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {sinEmbudo.length > 0 ? (
        <div className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-4">
          <h2 className="mb-2 text-sm font-medium uppercase tracking-wider text-[var(--text)]/60">
            Prospectos fuera del embudo de terrenos ({sinEmbudo.length})
          </h2>
          <ul className="space-y-1 text-sm">
            {sinEmbudo.map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  onClick={() => router.push(`/dilesa/portafolio/activo/${p.id}`)}
                  className="text-[var(--accent)] underline-offset-2 hover:underline"
                >
                  {p.nombre}
                </button>
                <span className="text-[var(--text)]/50"> · {p.tipo}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
