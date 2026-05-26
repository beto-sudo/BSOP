'use client';

/**
 * ContratosModule — lista de contratos de construcción DILESA.
 *
 * Iniciativa dilesa-construccion · Sprint tabs+protos. Tab "Contratos" del
 * hub Construcción. Lista filtrable de los contratos en
 * `dilesa.contratos_construccion`: código, fecha, contratista (lookup
 * cross-schema vía erp.personas), proyecto (lookup dilesa.proyectos),
 * valor total, # lotes asignados (count en `contrato_lotes`).
 *
 * Click en fila → /dilesa/construccion/contratos/[id] con la ficha
 * completa: datos generales, lotes asignados con avance, KPIs MO.
 *
 * Carga cross-schema con 4 queries paralelas + lookups Map (mismo patrón
 * que construccion-module / contratistas-module — evita embeds de
 * PostgREST cuando la tabla embebida vive en > 1 schema y permite
 * filtros sobre los nombres derivados sin hits adicionales).
 *
 * Botón "+ Nuevo contrato" lleva al form combinado de Sprint 4 que crea
 * cabecera + arranca N lotes en una sola operación.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createSupabaseBrowserClient } from '@/lib/supabase-browser';
import { usePermissions } from '@/components/providers';
import { DataTable, ModuleKpiStrip, type Column, type ModuleKpi } from '@/components/module-page';
import { Input } from '@/components/ui/input';
import { FileText, Plus, RefreshCw, Search } from 'lucide-react';
import { getSupabaseErrorMessage } from '@/lib/supabase-error';
import { formatCurrency } from '@/lib/format';

export type ContratoRow = {
  id: string;
  codigo: string;
  fecha_contrato: string;
  contratista_id: string;
  proyecto_id: string | null;
  valor_total: number;
  /** Computed: nombre del contratista (erp.personas). */
  contratistaNombre: string;
  contratistaAbreviacion: string | null;
  /** Computed: nombre del proyecto (dilesa.proyectos). */
  proyectoNombre: string;
  /** Computed: count de contrato_lotes (no soft-deleted). */
  lotesCount: number;
};

/**
 * KPIs reactivos a filtros — ADR-034. Pivote vs curaduría: "% consumido
 * promedio" y "próximo vencimiento" no son derivables del row plano.
 * Reemplazados por agregados del portafolio de contratos.
 */
export function deriveKpis(rows: readonly ContratoRow[]): readonly ModuleKpi[] {
  const total = rows.length;
  const valorTotal = rows.reduce((acc, r) => acc + (r.valor_total ?? 0), 0);
  const lotesAsignados = rows.reduce((acc, r) => acc + r.lotesCount, 0);
  const promedio = total === 0 ? null : valorTotal / total;

  const porContratista = new Map<string, number>();
  for (const r of rows) {
    porContratista.set(r.contratistaNombre, (porContratista.get(r.contratistaNombre) ?? 0) + 1);
  }
  let topContratista: string | null = null;
  let topCount = 0;
  for (const [nombre, count] of [...porContratista.entries()].sort(([a], [b]) =>
    a.localeCompare(b, 'es')
  )) {
    if (count > topCount) {
      topCount = count;
      topContratista = nombre;
    }
  }

  return [
    { key: 'total', label: 'Contratos', value: total },
    {
      key: 'valor',
      label: 'Valor total',
      value: total === 0 ? '—' : formatCurrency(valorTotal, { compact: true }),
    },
    { key: 'lotes', label: 'Lotes asignados', value: lotesAsignados },
    {
      key: 'promedio',
      label: 'Promedio/contrato',
      value: promedio == null ? '—' : formatCurrency(promedio, { compact: true }),
    },
    {
      key: 'top',
      label: 'Top contratista',
      value: topContratista ? `${topContratista} (${topCount})` : '—',
    },
  ];
}

export function ContratosModule({ empresaId }: { empresaId: string }) {
  const router = useRouter();
  const { permissions } = usePermissions();
  const puedeCrear =
    permissions.isAdmin || permissions.modulos.get('dilesa.construccion.contratos')?.write === true;

  const [contratos, setContratos] = useState<ContratoRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [contratistaFiltro, setContratistaFiltro] = useState('');
  const [proyectoFiltro, setProyectoFiltro] = useState('');

  const fetchContratos = useCallback(async (): Promise<{
    data?: ContratoRow[];
    error?: string;
  }> => {
    const sb = createSupabaseBrowserClient();

    // 4 queries paralelas: contratos + contrato_lotes (para count) +
    // personas (contratistas) + proyectos (+ satélite de abrev en aparte
    // para no inflar el cross-join).
    const [contratosRes, lotesRes, personasRes, proyectosRes, datosRes] = await Promise.all([
      sb
        .schema('dilesa')
        .from('contratos_construccion')
        .select('id, codigo, fecha_contrato, contratista_id, proyecto_id, valor_total')
        .eq('empresa_id', empresaId)
        .is('deleted_at', null),
      sb
        .schema('dilesa')
        .from('contrato_lotes')
        .select('contrato_id')
        .eq('empresa_id', empresaId)
        .is('deleted_at', null),
      sb
        .schema('erp')
        .from('personas')
        .select('id, nombre, apellido_paterno, apellido_materno')
        .eq('empresa_id', empresaId)
        .eq('tipo', 'contratista'),
      sb
        .schema('dilesa')
        .from('proyectos')
        .select('id, nombre')
        .eq('empresa_id', empresaId)
        .is('deleted_at', null),
      sb
        .schema('dilesa')
        .from('contratistas_datos')
        .select('persona_id, abreviacion')
        .eq('empresa_id', empresaId)
        .is('deleted_at', null),
    ]);

    const firstErr =
      contratosRes.error ??
      lotesRes.error ??
      personasRes.error ??
      proyectosRes.error ??
      datosRes.error;
    if (firstErr) {
      return { error: getSupabaseErrorMessage(firstErr, 'No se pudieron cargar los contratos.') };
    }

    const personaMap = new Map<string, string>();
    for (const p of personasRes.data ?? []) {
      const nombre = [p.nombre, p.apellido_paterno, p.apellido_materno].filter(Boolean).join(' ');
      personaMap.set(p.id as string, nombre || '(sin nombre)');
    }
    const abrevMap = new Map<string, string | null>();
    for (const d of datosRes.data ?? []) {
      abrevMap.set(d.persona_id as string, (d.abreviacion as string | null) ?? null);
    }
    const proyectoMap = new Map<string, string>();
    for (const p of proyectosRes.data ?? []) proyectoMap.set(p.id as string, p.nombre as string);

    const lotesByContrato = new Map<string, number>();
    for (const l of lotesRes.data ?? []) {
      const cid = l.contrato_id as string;
      lotesByContrato.set(cid, (lotesByContrato.get(cid) ?? 0) + 1);
    }

    const rows: ContratoRow[] = (contratosRes.data ?? []).map((c) => {
      const cid = c.contratista_id as string;
      const pid = c.proyecto_id as string | null;
      return {
        id: c.id as string,
        codigo: c.codigo as string,
        fecha_contrato: c.fecha_contrato as string,
        contratista_id: cid,
        proyecto_id: pid,
        valor_total: Number(c.valor_total ?? 0),
        contratistaNombre: personaMap.get(cid) ?? '(sin contratista)',
        contratistaAbreviacion: abrevMap.get(cid) ?? null,
        proyectoNombre: pid ? (proyectoMap.get(pid) ?? '') : '',
        lotesCount: lotesByContrato.get(c.id as string) ?? 0,
      };
    });

    return { data: rows };
  }, [empresaId]);

  const cargar = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { data, error: e } = await fetchContratos();
    if (e) {
      setError(e);
      setContratos([]);
    } else setContratos(data ?? []);
    setLoading(false);
  }, [fetchContratos]);

  useEffect(() => {
    let activo = true;
    void fetchContratos().then(({ data, error: e }) => {
      if (!activo) return;
      if (e) {
        setError(e);
        setContratos([]);
      } else setContratos(data ?? []);
      setLoading(false);
    });
    return () => {
      activo = false;
    };
  }, [fetchContratos]);

  const contratistasPresentes = useMemo(
    () => [...new Set(contratos.map((c) => c.contratistaNombre).filter(Boolean))].sort(),
    [contratos]
  );
  const proyectosPresentes = useMemo(
    () => [...new Set(contratos.map((c) => c.proyectoNombre).filter(Boolean))].sort(),
    [contratos]
  );

  const filtrados = useMemo(() => {
    const q = search.trim().toLowerCase();
    return contratos.filter((c) => {
      if (contratistaFiltro && c.contratistaNombre !== contratistaFiltro) return false;
      if (proyectoFiltro && c.proyectoNombre !== proyectoFiltro) return false;
      if (q) {
        const hay =
          c.codigo.toLowerCase().includes(q) ||
          c.contratistaNombre.toLowerCase().includes(q) ||
          c.proyectoNombre.toLowerCase().includes(q);
        if (!hay) return false;
      }
      return true;
    });
  }, [contratos, search, contratistaFiltro, proyectoFiltro]);

  const kpis = useMemo(() => deriveKpis(filtrados), [filtrados]);

  const columns: Column<ContratoRow>[] = [
    {
      key: 'codigo',
      label: 'Código',
      type: 'text',
      sticky: true,
      width: 'min-w-[240px]',
    },
    { key: 'fecha_contrato', label: 'Fecha', type: 'date' },
    {
      key: 'contratistaNombre',
      label: 'Contratista',
      type: 'custom',
      accessor: (c) => c.contratistaNombre,
      render: (c) =>
        c.contratistaAbreviacion ? (
          <span title={c.contratistaNombre}>
            <span className="font-medium">{c.contratistaAbreviacion}</span>
            <span className="ml-1 text-[var(--text)]/40">·</span>
            <span className="ml-1 text-[var(--text)]/60">{c.contratistaNombre}</span>
          </span>
        ) : (
          c.contratistaNombre
        ),
    },
    {
      key: 'proyectoNombre',
      label: 'Proyecto',
      type: 'text',
      render: (c) => c.proyectoNombre || '—',
    },
    { key: 'lotesCount', label: 'Lotes', type: 'number' },
    { key: 'valor_total', label: 'Valor MO', type: 'currency' },
  ];

  const onRowClick = (c: ContratoRow) => {
    router.push(`/dilesa/construccion/contratos/${c.id}`);
  };

  return (
    <div className="space-y-6 p-6">
      <header className="flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[var(--accent)]/10 text-[var(--accent)]">
          <FileText className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-[var(--text)]">Contratos</h1>
          <p className="text-sm text-[var(--text)]/60">
            Contratos de construcción con contratistas. Cada uno cubre 1+ lotes con su precio MO/m²
            y arranca obras en una sola operación.
          </p>
        </div>
      </header>

      <ModuleKpiStrip stats={kpis} cols={5} />

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text)]/40" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar código, contratista o proyecto…"
            className="w-72 pl-9"
          />
        </div>
        <select
          value={contratistaFiltro}
          onChange={(e) => setContratistaFiltro(e.target.value)}
          className="h-9 rounded-md border border-[var(--border)] bg-[var(--card)] px-3 text-sm text-[var(--text)]"
        >
          <option value="">Todos los contratistas</option>
          {contratistasPresentes.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <select
          value={proyectoFiltro}
          onChange={(e) => setProyectoFiltro(e.target.value)}
          className="h-9 rounded-md border border-[var(--border)] bg-[var(--card)] px-3 text-sm text-[var(--text)]"
        >
          <option value="">Todos los proyectos</option>
          {proyectosPresentes.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
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
          {filtrados.length} de {contratos.length} contratos
        </span>
        {puedeCrear ? (
          <Link
            href="/dilesa/construccion/contratos/nuevo"
            className="flex h-9 items-center gap-1.5 rounded-md bg-[var(--accent)] px-3 text-sm font-medium text-white hover:opacity-90"
          >
            <Plus className="h-3.5 w-3.5" />
            Nuevo contrato + arranques
          </Link>
        ) : null}
      </div>

      <DataTable
        data={filtrados}
        columns={columns}
        rowKey="id"
        loading={loading}
        error={error}
        onRetry={() => void cargar()}
        onRowClick={onRowClick}
        initialSort={{ key: 'fecha_contrato', dir: 'desc' }}
        emptyTitle="Sin contratos"
        emptyDescription="No hay contratos que coincidan con los filtros actuales."
        emptyIcon={<FileText className="h-6 w-6" />}
        maxHeight="calc(100vh - 280px)"
      />
    </div>
  );
}
