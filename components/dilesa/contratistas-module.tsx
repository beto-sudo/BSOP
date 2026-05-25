'use client';

/**
 * ContratistasModule — catálogo de contratistas DILESA con KPIs derivados.
 *
 * Iniciativa dilesa-construccion · Sprint 3 (UI lectura). Lista de los
 * contratistas registrados (~23 en Sprint 2) con KPIs calculados en
 * memoria a partir de `dilesa.construccion`: obras en curso, obras
 * terminadas, MO ejecutado total. Click → /dilesa/construccion/contratistas/[id].
 *
 * Modelo (ADR-032 D2): los contratistas viven en `erp.personas` con
 * `tipo='contratista'`. Datos específicos de DILESA (REPSE, retención,
 * abreviación, etc.) viven en el satélite `dilesa.contratistas_datos`.
 * Esta página los cruza vía 2 queries paralelas + lookup en memoria.
 *
 * KPIs son cálculos client-side (no vistas SQL todavía — Sprint 4 puede
 * mover esto a una vista materializada si la cardinalidad lo justifica).
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createSupabaseBrowserClient } from '@/lib/supabase-browser';
import { DataTable, type Column } from '@/components/module-page';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { HardHat, RefreshCw, Search, Users } from 'lucide-react';
import { getSupabaseErrorMessage } from '@/lib/supabase-error';

type ContratistaRow = {
  persona_id: string;
  nombre: string;
  rfc: string | null;
  abreviacion: string | null;
  persona_fisica_o_moral: string | null;
  repse: string | null;
  retencion_pct: number | null;
  activo: boolean;
  obrasEnCurso: number;
  obrasTerminadas: number;
  moEjecutadoTotal: number;
};

export function ContratistasModule({ empresaId }: { empresaId: string }) {
  const router = useRouter();
  const [contratistas, setContratistas] = useState<ContratistaRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [tipoFiltro, setTipoFiltro] = useState<'' | 'PF' | 'PM'>('');
  const [estadoFiltro, setEstadoFiltro] = useState<'' | 'activos' | 'inactivos'>('activos');
  const [repseFiltro, setRepseFiltro] = useState<'' | 'con_repse' | 'sin_repse'>('');

  const fetchContratistas = useCallback(async (): Promise<{
    data?: ContratistaRow[];
    error?: string;
  }> => {
    const sb = createSupabaseBrowserClient();

    // 3 queries paralelas: personas (tipo=contratista) + satélite +
    // construcciones (para KPIs derivados). Cross-schema sin embeds.
    const [personasRes, datosRes, obrasRes] = await Promise.all([
      sb
        .schema('erp')
        .from('personas')
        .select('id, nombre, apellido_paterno, apellido_materno, rfc, activo')
        .eq('empresa_id', empresaId)
        .eq('tipo', 'contratista')
        .is('deleted_at', null),
      sb
        .schema('dilesa')
        .from('contratistas_datos')
        .select('persona_id, abreviacion, persona_fisica_o_moral, repse, retencion_pct, activo')
        .eq('empresa_id', empresaId)
        .is('deleted_at', null),
      sb
        .schema('dilesa')
        .from('construccion')
        .select('contratista_id, estado, mo_ejecutado')
        .eq('empresa_id', empresaId)
        .is('deleted_at', null),
    ]);

    const firstErr = personasRes.error ?? datosRes.error ?? obrasRes.error;
    if (firstErr) {
      return {
        error: getSupabaseErrorMessage(firstErr, 'No se pudieron cargar los contratistas.'),
      };
    }

    const datosMap = new Map<
      string,
      {
        abreviacion: string | null;
        persona_fisica_o_moral: string | null;
        repse: string | null;
        retencion_pct: number | null;
        activo: boolean;
      }
    >();
    for (const d of datosRes.data ?? []) {
      datosMap.set(d.persona_id as string, {
        abreviacion: (d.abreviacion as string | null) ?? null,
        persona_fisica_o_moral: (d.persona_fisica_o_moral as string | null) ?? null,
        repse: (d.repse as string | null) ?? null,
        retencion_pct: (d.retencion_pct as number | null) ?? null,
        activo: (d.activo as boolean) ?? true,
      });
    }

    // KPIs por contratista: count en_curso, count terminada(+derivados),
    // suma de mo_ejecutado. "Obras en curso" = estados que no son
    // terminales (arrancada, en_progreso); el resto cuenta como
    // terminadas (terminada, dtu, seguro_calidad, extraida) o
    // canceladas (que NO sumamos como ningún KPI).
    const ENCURSO = new Set(['arrancada', 'en_progreso']);
    const TERMINADA = new Set(['terminada', 'dtu', 'seguro_calidad', 'extraida']);
    type Agg = { enCurso: number; terminadas: number; mo: number };
    const aggMap = new Map<string, Agg>();
    for (const o of obrasRes.data ?? []) {
      const cid = o.contratista_id as string;
      const agg = aggMap.get(cid) ?? { enCurso: 0, terminadas: 0, mo: 0 };
      const estado = o.estado as string;
      if (ENCURSO.has(estado)) agg.enCurso += 1;
      else if (TERMINADA.has(estado)) agg.terminadas += 1;
      // cancelada → no se cuenta como ninguno
      agg.mo += Number(o.mo_ejecutado ?? 0);
      aggMap.set(cid, agg);
    }

    const rows: ContratistaRow[] = (personasRes.data ?? []).map((p) => {
      const id = p.id as string;
      const nombre = [p.nombre, p.apellido_paterno, p.apellido_materno].filter(Boolean).join(' ');
      const d = datosMap.get(id);
      const agg = aggMap.get(id) ?? { enCurso: 0, terminadas: 0, mo: 0 };
      return {
        persona_id: id,
        nombre: nombre || '(sin nombre)',
        rfc: (p.rfc as string | null) ?? null,
        abreviacion: d?.abreviacion ?? null,
        persona_fisica_o_moral: d?.persona_fisica_o_moral ?? null,
        repse: d?.repse ?? null,
        retencion_pct: d?.retencion_pct ?? null,
        // Si hay satélite, su `activo` manda; si no, usamos el de la
        // persona (fallback razonable cuando el contratista no tiene
        // datos DILESA registrados todavía).
        activo: d ? d.activo : (p.activo as boolean),
        obrasEnCurso: agg.enCurso,
        obrasTerminadas: agg.terminadas,
        moEjecutadoTotal: agg.mo,
      };
    });

    return { data: rows };
  }, [empresaId]);

  const cargar = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { data, error: e } = await fetchContratistas();
    if (e) {
      setError(e);
      setContratistas([]);
    } else setContratistas(data ?? []);
    setLoading(false);
  }, [fetchContratistas]);

  useEffect(() => {
    let activo = true;
    void fetchContratistas().then(({ data, error: e }) => {
      if (!activo) return;
      if (e) {
        setError(e);
        setContratistas([]);
      } else setContratistas(data ?? []);
      setLoading(false);
    });
    return () => {
      activo = false;
    };
  }, [fetchContratistas]);

  const filtrados = useMemo(() => {
    const q = search.trim().toLowerCase();
    return contratistas.filter((c) => {
      if (tipoFiltro === 'PF' && c.persona_fisica_o_moral !== 'Persona Física') return false;
      if (tipoFiltro === 'PM' && c.persona_fisica_o_moral !== 'Persona Moral') return false;
      if (estadoFiltro === 'activos' && !c.activo) return false;
      if (estadoFiltro === 'inactivos' && c.activo) return false;
      if (repseFiltro === 'con_repse' && !c.repse) return false;
      if (repseFiltro === 'sin_repse' && c.repse) return false;
      if (q) {
        const hay =
          c.nombre.toLowerCase().includes(q) ||
          (c.rfc ?? '').toLowerCase().includes(q) ||
          (c.abreviacion ?? '').toLowerCase().includes(q);
        if (!hay) return false;
      }
      return true;
    });
  }, [contratistas, search, tipoFiltro, estadoFiltro, repseFiltro]);

  const columns: Column<ContratistaRow>[] = [
    {
      key: 'nombre',
      label: 'Contratista',
      type: 'custom',
      sticky: true,
      width: 'min-w-[280px]',
      accessor: (c) => c.nombre,
      render: (c) => (
        <div>
          <div className="font-medium text-[var(--text)]">{c.nombre}</div>
          {c.abreviacion ? (
            <div className="text-[11px] uppercase tracking-wide text-[var(--text)]/50">
              {c.abreviacion}
            </div>
          ) : null}
        </div>
      ),
    },
    {
      key: 'rfc',
      label: 'RFC',
      type: 'text',
      render: (c) => c.rfc ?? '—',
    },
    {
      key: 'persona_fisica_o_moral',
      label: 'Tipo',
      type: 'text',
      render: (c) => {
        if (c.persona_fisica_o_moral === 'Persona Física') return 'PF';
        if (c.persona_fisica_o_moral === 'Persona Moral') return 'PM';
        return c.persona_fisica_o_moral ?? '—';
      },
    },
    {
      key: 'obrasEnCurso',
      label: 'En curso',
      type: 'number',
      render: (c) => (
        <span className="inline-flex items-center gap-1 tabular-nums">
          {c.obrasEnCurso}
          {c.obrasEnCurso > 0 ? <HardHat className="h-3 w-3 text-[var(--accent)]/60" /> : null}
        </span>
      ),
    },
    { key: 'obrasTerminadas', label: 'Terminadas', type: 'number' },
    { key: 'moEjecutadoTotal', label: 'MO ejecutado', type: 'currency' },
    {
      key: 'repse',
      label: 'REPSE',
      type: 'custom',
      accessor: (c) => (c.repse ? 1 : 0),
      render: (c) =>
        c.repse ? (
          <span className="inline-flex items-center gap-1 text-xs text-[var(--text)]/70">
            <Badge tone="success">REPSE</Badge>
          </span>
        ) : (
          <span className="text-xs text-[var(--text)]/40">—</span>
        ),
    },
    {
      key: 'retencion_pct',
      label: 'Retención',
      type: 'custom',
      accessor: (c) => c.retencion_pct ?? 0,
      render: (c) =>
        c.retencion_pct != null ? (
          <span className="tabular-nums">{c.retencion_pct.toFixed(2)}%</span>
        ) : (
          '—'
        ),
    },
    {
      key: 'activo',
      label: 'Activo',
      type: 'custom',
      accessor: (c) => (c.activo ? 1 : 0),
      render: (c) =>
        c.activo ? <Badge tone="success">Activo</Badge> : <Badge tone="neutral">Inactivo</Badge>,
    },
  ];

  const onRowClick = (c: ContratistaRow) => {
    router.push(`/dilesa/construccion/contratistas/${c.persona_id}`);
  };

  return (
    <div className="space-y-6 p-6">
      <header className="flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[var(--accent)]/10 text-[var(--accent)]">
          <Users className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-[var(--text)]">Contratistas</h1>
          <p className="text-sm text-[var(--text)]/60">
            Catálogo con KPIs derivados de las obras: en curso, terminadas, MO ejecutado.
          </p>
        </div>
      </header>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text)]/40" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar nombre, RFC o abreviación…"
            className="w-72 pl-9"
          />
        </div>
        <select
          value={tipoFiltro}
          onChange={(e) => setTipoFiltro(e.target.value as '' | 'PF' | 'PM')}
          className="h-9 rounded-md border border-[var(--border)] bg-[var(--card)] px-3 text-sm text-[var(--text)]"
        >
          <option value="">PF + PM</option>
          <option value="PF">Persona Física</option>
          <option value="PM">Persona Moral</option>
        </select>
        <select
          value={estadoFiltro}
          onChange={(e) => setEstadoFiltro(e.target.value as '' | 'activos' | 'inactivos')}
          className="h-9 rounded-md border border-[var(--border)] bg-[var(--card)] px-3 text-sm text-[var(--text)]"
        >
          <option value="activos">Solo activos</option>
          <option value="inactivos">Solo inactivos</option>
          <option value="">Activos + inactivos</option>
        </select>
        <select
          value={repseFiltro}
          onChange={(e) => setRepseFiltro(e.target.value as '' | 'con_repse' | 'sin_repse')}
          className="h-9 rounded-md border border-[var(--border)] bg-[var(--card)] px-3 text-sm text-[var(--text)]"
        >
          <option value="">REPSE — cualquiera</option>
          <option value="con_repse">Con REPSE</option>
          <option value="sin_repse">Sin REPSE</option>
        </select>
        <button
          type="button"
          onClick={() => void cargar()}
          className="flex h-9 items-center gap-1.5 rounded-md border border-[var(--border)] px-3 text-sm text-[var(--text)]/70 hover:text-[var(--text)]"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Refrescar
        </button>
        <span className="ml-auto text-sm text-[var(--text)]/60">
          {filtrados.length} de {contratistas.length} contratistas
        </span>
      </div>

      <DataTable
        data={filtrados}
        columns={columns}
        rowKey="persona_id"
        loading={loading}
        error={error}
        onRetry={() => void cargar()}
        onRowClick={onRowClick}
        initialSort={{ key: 'obrasEnCurso', dir: 'desc' }}
        emptyTitle="Sin contratistas"
        emptyDescription="No hay contratistas que coincidan con los filtros actuales."
        emptyIcon={<Users className="h-6 w-6" />}
        maxHeight="calc(100vh - 280px)"
      />
    </div>
  );
}
