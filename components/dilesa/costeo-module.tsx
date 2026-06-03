'use client';

/**
 * CosteoModule — costeo + rollup de CapEx por proyecto (DILESA).
 *
 * Iniciativa dilesa-contratos-obra · Sprint 3. Tab "Costeo" del hub
 * Construcción. Junta las dos capas del traspaso de obra (ADR-038):
 *
 *   - Capa A (`dilesa.obra_presupuesto`): presupuesto actualizado vs gasto
 *     real por concepto × etapa × proyecto. Es la tabla principal de esta
 *     vista (hasta Sprint 3 no tenía UI).
 *   - Capa B (`dilesa.contratos_construccion` + `dilesa.obra_estimaciones`):
 *     contratado y pagado por proyecto → saldo por pagar (`valor_total − Σ
 *     estimaciones`). Alimenta los KPIs de rollup.
 *
 * Carga cross-schema con queries paralelas + lookups Map (mismo patrón que
 * contratos-module — evita embeds de PostgREST). Los KPIs son reactivos a
 * los filtros (ADR-034); el contratado/saldo refleja los proyectos visibles.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { createSupabaseBrowserClient } from '@/lib/supabase-browser';
import { DataTable, ModuleKpiStrip, type Column, type ModuleKpi } from '@/components/module-page';
import { Input } from '@/components/ui/input';
import { Coins, Plus, RefreshCw, Search } from 'lucide-react';
import { usePermissions } from '@/components/providers';
import { useToast } from '@/components/ui/toast';
import { RowActions } from '@/components/shared/row-actions';
import { CosteoConceptoForm } from '@/components/dilesa/costeo-concepto-form';
import { getSupabaseErrorMessage } from '@/lib/supabase-error';
import { formatCurrency, formatPercent } from '@/lib/format';

export type CosteoRow = {
  id: string;
  proyecto_id: string;
  proyectoNombre: string;
  etapa: string | null;
  concepto: string;
  /** presupuesto_previo crudo (numeric, c/IVA) — para la captura. */
  presupuestoPrevio: number | null;
  /** presupuesto_actualizado crudo (numeric, c/IVA) — para la captura. */
  presupuestoActualizado: number | null;
  /** presupuesto_actualizado ?? presupuesto_previo (numeric, c/IVA). Derivado. */
  presupuesto: number | null;
  /** gasto_real_total (numeric, c/IVA). */
  gastoReal: number | null;
  proveedor: string | null;
  /** fecha_compromiso (date ISO) — para la captura. */
  fechaCompromiso: string | null;
  /** orden dentro del proyecto — autocalculado en alta. */
  orden: number;
  /** gastoReal / presupuesto (0–1) o null si no hay presupuesto. */
  ratio: number | null;
};

/** Contratado y pagado por proyecto (Capa B), para el rollup de saldo. */
export type ContratoAgg = { contratado: number; saldo: number };

/**
 * KPIs reactivos a filtros (ADR-034). `rows` = renglones de presupuesto
 * visibles; `contratos` = agregado de Capa B de los proyectos visibles.
 */
export function deriveKpis(
  rows: readonly CosteoRow[],
  contratos: ContratoAgg
): readonly ModuleKpi[] {
  const presupuesto = rows.reduce((acc, r) => acc + (r.presupuesto ?? 0), 0);
  const gastoReal = rows.reduce((acc, r) => acc + (r.gastoReal ?? 0), 0);
  const ratio = presupuesto > 0 ? gastoReal / presupuesto : null;

  return [
    {
      key: 'presupuesto',
      label: 'Presupuesto',
      value: presupuesto === 0 ? '—' : formatCurrency(presupuesto, { compact: true }),
    },
    {
      key: 'gasto',
      label: 'Gasto real',
      value: gastoReal === 0 ? '—' : formatCurrency(gastoReal, { compact: true }),
    },
    {
      key: 'ejecucion',
      label: '% ejecución',
      value: ratio == null ? '—' : formatPercent(ratio),
    },
    {
      key: 'contratado',
      label: 'Contratado',
      value:
        contratos.contratado === 0 ? '—' : formatCurrency(contratos.contratado, { compact: true }),
    },
    {
      key: 'saldo',
      label: 'Saldo por pagar',
      value: contratos.saldo === 0 ? '—' : formatCurrency(contratos.saldo, { compact: true }),
    },
  ];
}

export function CosteoModule({ empresaId }: { empresaId: string }) {
  const { permissions } = usePermissions();
  const toast = useToast();
  const puedeEscribir =
    permissions.isAdmin || permissions.modulos.get('dilesa.construccion.costeo')?.write === true;

  const [rows, setRows] = useState<CosteoRow[]>([]);
  /** contratado/pagado por proyecto_id (Capa B). */
  const [contratoAggByProyecto, setContratoAggByProyecto] = useState<
    Map<string, { contratado: number; pagado: number }>
  >(new Map());
  /** Proyectos DILESA — selector del form de captura. */
  const [proyectos, setProyectos] = useState<{ id: string; nombre: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [proyectoFiltro, setProyectoFiltro] = useState('');
  const [etapaFiltro, setEtapaFiltro] = useState('');
  /** Captura de presupuesto (Sprint 5). null editRow + open = alta. */
  const [formOpen, setFormOpen] = useState(false);
  const [editRow, setEditRow] = useState<CosteoRow | null>(null);

  const fetchCosteo = useCallback(async (): Promise<{
    rows?: CosteoRow[];
    agg?: Map<string, { contratado: number; pagado: number }>;
    proyectos?: { id: string; nombre: string }[];
    error?: string;
  }> => {
    const sb = createSupabaseBrowserClient();

    // Capa A (presupuesto) + proyectos + Capa B (contratos + estimaciones).
    const [presupuestoRes, proyectosRes, contratosRes, estimacionesRes] = await Promise.all([
      sb
        .schema('dilesa')
        .from('obra_presupuesto')
        .select(
          'id, proyecto_id, etapa, concepto, presupuesto_actualizado, presupuesto_previo, gasto_real_total, proveedor_texto, fecha_compromiso, orden'
        )
        .eq('empresa_id', empresaId)
        .is('deleted_at', null),
      sb
        .schema('dilesa')
        .from('proyectos')
        .select('id, nombre, tipo')
        .eq('empresa_id', empresaId)
        .is('deleted_at', null),
      sb
        .schema('dilesa')
        .from('contratos_construccion')
        .select('id, proyecto_id, valor_total')
        .eq('empresa_id', empresaId)
        .is('deleted_at', null),
      sb
        .schema('dilesa')
        .from('obra_estimaciones')
        .select('contrato_id, monto_total')
        .eq('empresa_id', empresaId)
        .is('deleted_at', null),
    ]);

    const firstErr =
      presupuestoRes.error ?? proyectosRes.error ?? contratosRes.error ?? estimacionesRes.error;
    if (firstErr) {
      return { error: getSupabaseErrorMessage(firstErr, 'No se pudo cargar el costeo.') };
    }

    // proyectoMap resuelve nombres de TODOS los proyectos (incluye anteproyectos,
    // por si un renglón de presupuesto los referencia). El selector del form de
    // captura, en cambio, solo ofrece DESARROLLOS: el presupuesto de obra (Capa A)
    // es de un desarrollo en ejecución, no de un anteproyecto en análisis. Esto
    // además evita el duplicado visual de los proyectos que ya pasaron
    // anteproyecto→desarrollo (mismo nombre en dos filas, ligadas por predecesor).
    const proyectoMap = new Map<string, string>();
    const proyectos: { id: string; nombre: string }[] = [];
    for (const p of proyectosRes.data ?? []) {
      proyectoMap.set(p.id as string, p.nombre as string);
      if (p.tipo === 'desarrollo') {
        proyectos.push({ id: p.id as string, nombre: (p.nombre as string) ?? '' });
      }
    }
    proyectos.sort((a, b) => a.nombre.localeCompare(b.nombre));

    // Capa B: pagado por contrato → contratado/pagado por proyecto.
    const pagadoByContrato = new Map<string, number>();
    for (const e of estimacionesRes.data ?? []) {
      const cid = e.contrato_id as string;
      pagadoByContrato.set(cid, (pagadoByContrato.get(cid) ?? 0) + Number(e.monto_total ?? 0));
    }
    const agg = new Map<string, { contratado: number; pagado: number }>();
    for (const c of contratosRes.data ?? []) {
      const pid = c.proyecto_id as string | null;
      if (!pid) continue;
      const cur = agg.get(pid) ?? { contratado: 0, pagado: 0 };
      cur.contratado += Number(c.valor_total ?? 0);
      cur.pagado += pagadoByContrato.get(c.id as string) ?? 0;
      agg.set(pid, cur);
    }

    const out: CosteoRow[] = (presupuestoRes.data ?? [])
      .filter((r) => r.proyecto_id != null)
      .map((r) => {
        const presupuesto =
          r.presupuesto_actualizado != null
            ? Number(r.presupuesto_actualizado)
            : r.presupuesto_previo != null
              ? Number(r.presupuesto_previo)
              : null;
        const gastoReal = r.gasto_real_total != null ? Number(r.gasto_real_total) : null;
        const pid = r.proyecto_id as string;
        return {
          id: r.id as string,
          proyecto_id: pid,
          proyectoNombre: proyectoMap.get(pid) ?? '',
          etapa: (r.etapa as string | null) ?? null,
          concepto: (r.concepto as string) ?? '',
          presupuestoPrevio: r.presupuesto_previo != null ? Number(r.presupuesto_previo) : null,
          presupuestoActualizado:
            r.presupuesto_actualizado != null ? Number(r.presupuesto_actualizado) : null,
          presupuesto,
          gastoReal,
          proveedor: (r.proveedor_texto as string | null) ?? null,
          fechaCompromiso: (r.fecha_compromiso as string | null) ?? null,
          orden: Number(r.orden ?? 0),
          ratio:
            presupuesto != null && presupuesto > 0 && gastoReal != null
              ? gastoReal / presupuesto
              : null,
        };
      });

    return { rows: out, agg, proyectos };
  }, [empresaId]);

  const cargar = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { rows: data, agg, proyectos: proy, error: e } = await fetchCosteo();
    if (e) {
      setError(e);
      setRows([]);
      setContratoAggByProyecto(new Map());
      setProyectos([]);
    } else {
      setRows(data ?? []);
      setContratoAggByProyecto(agg ?? new Map());
      setProyectos(proy ?? []);
    }
    setLoading(false);
  }, [fetchCosteo]);

  useEffect(() => {
    let activo = true;
    void fetchCosteo().then(({ rows: data, agg, proyectos: proy, error: e }) => {
      if (!activo) return;
      if (e) {
        setError(e);
        setRows([]);
        setContratoAggByProyecto(new Map());
        setProyectos([]);
      } else {
        setRows(data ?? []);
        setContratoAggByProyecto(agg ?? new Map());
        setProyectos(proy ?? []);
      }
      setLoading(false);
    });
    return () => {
      activo = false;
    };
  }, [fetchCosteo]);

  // Soft-delete de un concepto de presupuesto (Sprint 5). Patrón del repo:
  // marca `deleted_at`, preserva historial para auditoría.
  const eliminar = useCallback(
    async (row: CosteoRow) => {
      const sb = createSupabaseBrowserClient();
      const { error: e } = await sb
        .schema('dilesa')
        .from('obra_presupuesto')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', row.id);
      if (e) {
        toast.add({
          title: 'Error al eliminar',
          description: getSupabaseErrorMessage(e, 'No se pudo eliminar el concepto.'),
          type: 'error',
        });
        return;
      }
      toast.add({ title: 'Concepto eliminado', description: row.concepto, type: 'success' });
      void cargar();
    },
    [toast, cargar]
  );

  function abrirAlta() {
    setEditRow(null);
    setFormOpen(true);
  }
  function abrirEdicion(row: CosteoRow) {
    setEditRow(row);
    setFormOpen(true);
  }
  function cerrarForm() {
    setFormOpen(false);
    setEditRow(null);
  }

  const proyectosPresentes = useMemo(
    () => [...new Set(rows.map((r) => r.proyectoNombre).filter(Boolean))].sort(),
    [rows]
  );
  const etapasPresentes = useMemo(
    () => [...new Set(rows.map((r) => r.etapa).filter((e): e is string => Boolean(e)))].sort(),
    [rows]
  );

  const filtrados = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (proyectoFiltro && r.proyectoNombre !== proyectoFiltro) return false;
      if (etapaFiltro && r.etapa !== etapaFiltro) return false;
      if (q) {
        const hay =
          r.concepto.toLowerCase().includes(q) ||
          (r.proveedor?.toLowerCase().includes(q) ?? false) ||
          (r.etapa?.toLowerCase().includes(q) ?? false);
        if (!hay) return false;
      }
      return true;
    });
  }, [rows, search, proyectoFiltro, etapaFiltro]);

  // Contratado/saldo de Capa B para los proyectos visibles en los filtros.
  const contratoTotals = useMemo<ContratoAgg>(() => {
    const visibles = new Set(filtrados.map((r) => r.proyecto_id));
    let contratado = 0;
    let pagado = 0;
    for (const pid of visibles) {
      const a = contratoAggByProyecto.get(pid);
      if (a) {
        contratado += a.contratado;
        pagado += a.pagado;
      }
    }
    return { contratado, saldo: contratado - pagado };
  }, [filtrados, contratoAggByProyecto]);

  const kpis = useMemo(() => deriveKpis(filtrados, contratoTotals), [filtrados, contratoTotals]);

  const columns: Column<CosteoRow>[] = [
    {
      key: 'proyectoNombre',
      label: 'Proyecto',
      type: 'text',
      sticky: true,
      width: 'min-w-[180px]',
    },
    { key: 'etapa', label: 'Etapa', type: 'text', render: (r) => r.etapa || '—' },
    { key: 'concepto', label: 'Concepto', type: 'text', width: 'min-w-[260px]' },
    {
      key: 'presupuesto',
      label: 'Presupuesto',
      type: 'custom',
      accessor: (r) => r.presupuesto ?? 0,
      render: (r) => (r.presupuesto == null ? '—' : formatCurrency(r.presupuesto)),
    },
    {
      key: 'gastoReal',
      label: 'Gasto real',
      type: 'custom',
      accessor: (r) => r.gastoReal ?? 0,
      render: (r) => (r.gastoReal == null ? '—' : formatCurrency(r.gastoReal)),
    },
    {
      key: 'ratio',
      label: '% ejec.',
      type: 'custom',
      accessor: (r) => r.ratio ?? 0,
      render: (r) => (r.ratio == null ? '—' : formatPercent(r.ratio)),
    },
    { key: 'proveedor', label: 'Proveedor', type: 'text', render: (r) => r.proveedor || '—' },
    ...(puedeEscribir
      ? [
          {
            key: 'acciones',
            label: '',
            type: 'custom' as const,
            sortable: false,
            align: 'right' as const,
            width: 'w-12',
            render: (r: CosteoRow) => (
              <RowActions
                ariaLabel={`Acciones para ${r.concepto}`}
                onEdit={{ onClick: () => abrirEdicion(r) }}
                onDelete={{
                  onConfirm: () => eliminar(r),
                  confirmTitle: `¿Eliminar “${r.concepto}”?`,
                  confirmDescription:
                    'Marcará el concepto de presupuesto como eliminado. Se preserva el historial para auditoría.',
                }}
              />
            ),
          },
        ]
      : []),
  ];

  return (
    <div className="space-y-6 p-6">
      <header className="flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[var(--accent)]/10 text-[var(--accent)]">
          <Coins className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-[var(--text)]">Costeo</h1>
          <p className="text-sm text-[var(--text)]/60">
            Presupuesto vs gasto real por concepto y etapa (urbanización + cabecera), con el
            contratado y saldo por pagar de los contratos de obra. CapEx del desarrollo.
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
            placeholder="Buscar concepto, proveedor o etapa…"
            className="w-72 pl-9"
          />
        </div>
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
        <select
          value={etapaFiltro}
          onChange={(e) => setEtapaFiltro(e.target.value)}
          className="h-9 rounded-md border border-[var(--border)] bg-[var(--card)] px-3 text-sm text-[var(--text)]"
        >
          <option value="">Todas las etapas</option>
          {etapasPresentes.map((et) => (
            <option key={et} value={et}>
              {et}
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
        <div className="ml-auto flex items-center gap-3">
          <span className="text-sm text-[var(--text)]/60">
            {filtrados.length} de {rows.length} conceptos
          </span>
          {puedeEscribir ? (
            <button
              type="button"
              onClick={abrirAlta}
              className="inline-flex h-9 items-center gap-1.5 rounded-md bg-[var(--accent)] px-3 text-sm font-medium text-white hover:opacity-90"
            >
              <Plus className="h-3.5 w-3.5" />
              Nuevo concepto
            </button>
          ) : null}
        </div>
      </div>

      {formOpen ? (
        <CosteoConceptoForm
          key={editRow?.id ?? 'nuevo'}
          empresaId={empresaId}
          proyectos={proyectos}
          rows={rows}
          editRow={editRow}
          onClose={cerrarForm}
          onSaved={() => {
            cerrarForm();
            void cargar();
          }}
        />
      ) : null}

      <DataTable
        data={filtrados}
        columns={columns}
        rowKey="id"
        loading={loading}
        error={error}
        onRetry={() => void cargar()}
        initialSort={{ key: 'gastoReal', dir: 'desc' }}
        emptyTitle="Sin costeo"
        emptyDescription="No hay conceptos de presupuesto que coincidan con los filtros."
        emptyIcon={<Coins className="h-6 w-6" />}
        maxHeight="calc(100vh - 280px)"
      />
    </div>
  );
}
