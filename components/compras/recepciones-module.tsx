'use client';

/**
 * RecepcionesModule — recepción de órdenes de compra (DILESA, constructora).
 *
 * Iniciativa `dilesa-compras` · Sprint 2 Fase C. Tab "Recepciones" del hub
 * Compras. Bandeja de OCs en estado `enviada`/`parcial`; recibir N por línea
 * **devenga contra la partida** (`erp.v_partida_control.ejercido`) vía la RPC
 * `oc_recibir_linea_partida` — sin mover inventario (D11/D13).
 *
 * Recepción ligera (D11): no hay documento de recepción con folio; el estado
 * vive en `ordenes_compra_detalle.cantidad_recibida`. Un proyecto a la vez.
 */

import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import { ChevronRight, Download, Loader2, PackageCheck, RefreshCw, Search } from 'lucide-react';
import { createSupabaseBrowserClient } from '@/lib/supabase-browser';
import { ModuleKpiStrip, type Column, type ModuleKpi } from '@/components/module-page';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge, type BadgeTone } from '@/components/ui/badge';
import { usePermissions } from '@/components/providers';
import { useToast } from '@/components/ui/toast';
import { getSupabaseErrorMessage } from '@/lib/supabase-error';
import { formatCurrency } from '@/lib/format';
import { HiloGastoStepper } from '@/components/gasto/hilo-gasto-stepper';
import { useFocusDrilldown } from '@/hooks/use-focus-drilldown';
import {
  buildProyectoOptions,
  type ProyectoOption,
  type ProyectoSelectorRow,
} from '@/lib/dilesa/proyectos-selector';
import { buildPartidaIndex } from '@/lib/compras/partidas';
import {
  lineaPendiente,
  lineaTotal,
  type OcEstado,
  type OcLinea,
  type OcRow,
} from '@/lib/compras/ordenes';
import {
  DateRangeFilter,
  EMPTY_DATE_RANGE,
  isInDateRange,
  type DateRange,
} from '@/components/filters/date-range-filter';
import { downloadCsv, toCsv } from '@/lib/export/csv';
import { hoyISOMatamoros } from '@/lib/fecha-mx';

const ESTADO_TONE: Record<string, BadgeTone> = { enviada: 'info', parcial: 'warning' };
const ESTADO_LABEL: Record<string, string> = { enviada: 'Enviada', parcial: 'Parcial' };

type ProvName = Map<string, string>;
type FetchResult = {
  rows?: OcRow[];
  proyectos?: ProyectoOption[];
  error?: string;
};

function toNum(s: string): number {
  const n = Number(s.trim());
  return Number.isFinite(n) ? n : 0;
}

export function RecepcionesModule({ empresaId }: { empresaId: string }) {
  const { permissions } = usePermissions();
  const toast = useToast();
  const puedeRecibir =
    permissions.isAdmin || permissions.modulos.get('dilesa.compras.recepciones')?.write === true;

  const [rows, setRows] = useState<OcRow[]>([]);
  const [proyectos, setProyectos] = useState<ProyectoOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [proyectoFiltro, setProyectoFiltro] = useState('');
  const [estadoFiltro, setEstadoFiltro] = useState<'' | 'enviada' | 'parcial'>('');
  const [rango, setRango] = useState<DateRange>(EMPTY_DATE_RANGE);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  /** detalleId → cantidad recibida (total) en captura. */
  const [recibos, setRecibos] = useState<Record<string, string>>({});
  const [savingId, setSavingId] = useState<string | null>(null);

  // Drill-down (?focus=<oc_id>) desde el hilo del gasto: expande la OC en la bandeja.
  useFocusDrilldown(
    rows,
    (r) => r.id,
    (row) => setExpandedId(row.id)
  );

  const fetchData = useCallback(async (): Promise<FetchResult> => {
    const sb = createSupabaseBrowserClient();
    const [ocRes, proyectosRes, proveedoresRes, partidasRes] = await Promise.all([
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (sb.schema('erp') as any)
        .from('ordenes_compra')
        .select(
          'id, codigo, proveedor_id, estado, fecha_entrega, created_at, ordenes_compra_detalle(id, partida_id, descripcion, unidad, cantidad, cantidad_recibida, cantidad_cancelada, precio_unitario, precio_real)'
        )
        .eq('empresa_id', empresaId)
        .in('estado', ['enviada', 'parcial'])
        .is('deleted_at', null),
      sb
        .schema('dilesa')
        .from('proyectos')
        .select('id, nombre, tipo, proyecto_predecesor_id')
        .eq('empresa_id', empresaId)
        .is('deleted_at', null),
      sb
        .schema('erp')
        .from('proveedores')
        .select('id, personas:persona_id(nombre, apellido_paterno, apellido_materno)')
        .eq('empresa_id', empresaId)
        .is('deleted_at', null),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (sb.schema('erp') as any)
        .from('presupuesto_partidas')
        .select('id, proyecto_id, concepto_texto')
        .eq('empresa_id', empresaId)
        .is('deleted_at', null),
    ]);

    const firstErr = ocRes.error ?? proyectosRes.error ?? proveedoresRes.error ?? partidasRes.error;
    if (firstErr) return { error: getSupabaseErrorMessage(firstErr, 'No se pudo cargar.') };

    const proyectoMap = new Map<string, string>();
    for (const p of proyectosRes.data ?? []) proyectoMap.set(p.id as string, p.nombre as string);
    const proyectos = buildProyectoOptions(
      (proyectosRes.data ?? []) as unknown as ProyectoSelectorRow[]
    );

    type ProvRaw = {
      id: string;
      personas: {
        nombre: string | null;
        apellido_paterno: string | null;
        apellido_materno: string | null;
      } | null;
    };
    const provName: ProvName = new Map();
    for (const pv of (proveedoresRes.data ?? []) as unknown as ProvRaw[]) {
      provName.set(
        pv.id,
        [pv.personas?.nombre, pv.personas?.apellido_paterno, pv.personas?.apellido_materno]
          .filter(Boolean)
          .join(' ')
          .trim() || '(sin nombre)'
      );
    }

    // Índice de partidas compartido (D4) — sin catálogo: Recepciones no da de alta líneas.
    const { partidaLabel, partidaProyecto } = buildPartidaIndex(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (partidasRes.data ?? []) as any[]
    );

    type OcRaw = {
      id: string;
      codigo: string | null;
      proveedor_id: string | null;
      estado: string;
      fecha_entrega: string | null;
      created_at: string;
      ordenes_compra_detalle: Array<{
        id: string;
        partida_id: string | null;
        descripcion: string | null;
        unidad: string | null;
        cantidad: number | null;
        cantidad_recibida: number | null;
        cantidad_cancelada: number | null;
        precio_unitario: number | null;
        precio_real: number | null;
      }> | null;
    };
    const out: OcRow[] = ((ocRes.data ?? []) as OcRaw[]).map((o) => {
      const lineas: OcLinea[] = (o.ordenes_compra_detalle ?? []).map((d) => ({
        id: d.id,
        partidaId: d.partida_id,
        partidaLabel: d.partida_id ? (partidaLabel.get(d.partida_id) ?? '—') : '—',
        descripcion: d.descripcion ?? '',
        unidad: d.unidad,
        cantidad: Number(d.cantidad ?? 0),
        cantidadRecibida: Number(d.cantidad_recibida ?? 0),
        cantidadCancelada: Number(d.cantidad_cancelada ?? 0),
        precioUnitario: Number(d.precio_real ?? d.precio_unitario ?? 0),
      }));
      const proyectoId =
        lineas
          .map((l) => l.partidaId)
          .filter(Boolean)
          .map((pid) => partidaProyecto.get(pid!))[0] ?? null;
      return {
        id: o.id,
        codigo: o.codigo ?? '—',
        proyectoId,
        proyectoNombre: proyectoId ? (proyectoMap.get(proyectoId) ?? '') : '',
        proveedorId: o.proveedor_id,
        proveedorNombre: o.proveedor_id ? (provName.get(o.proveedor_id) ?? '—') : '—',
        estado: (o.estado as OcEstado) ?? 'enviada',
        fecha: o.fecha_entrega ?? o.created_at?.slice(0, 10) ?? null,
        lineas,
      };
    });

    return { rows: out, proyectos };
  }, [empresaId]);

  const apply = useCallback((res: FetchResult) => {
    if (res.error) {
      setError(res.error);
      setRows([]);
    } else {
      setError(null);
      setRows(res.rows ?? []);
      setProyectos(res.proyectos ?? []);
    }
  }, []);

  const cargar = useCallback(async () => {
    setLoading(true);
    apply(await fetchData());
    setLoading(false);
  }, [fetchData, apply]);

  useEffect(() => {
    let activo = true;
    void fetchData().then((res) => {
      if (!activo) return;
      apply(res);
      // Sin auto-select (Sprint 1 `dilesa-compras-operacion`): la bandeja arranca
      // mostrando TODO lo que falta por recibir, no un solo fraccionamiento.
      setLoading(false);
    });
    return () => {
      activo = false;
    };
  }, [fetchData, apply]);

  const proyectosPresentes = useMemo(() => {
    const m = new Map<string, string>();
    for (const p of proyectos) m.set(p.id, p.nombre);
    return [...m.entries()]
      .map(([id, nombre]) => ({ id, nombre }))
      .sort((a, b) => a.nombre.localeCompare(b.nombre));
  }, [proyectos]);

  const q = search.trim().toLowerCase();
  const filtrados = useMemo(() => {
    return rows.filter((r) => {
      if (proyectoFiltro && r.proyectoId !== proyectoFiltro) return false;
      if (estadoFiltro && r.estado !== estadoFiltro) return false;
      if (!isInDateRange(r.fecha, rango)) return false;
      if (q) {
        const hay =
          r.codigo.toLowerCase().includes(q) ||
          r.proveedorNombre.toLowerCase().includes(q) ||
          r.proyectoNombre.toLowerCase().includes(q) ||
          r.lineas.some((l) => l.partidaLabel.toLowerCase().includes(q));
        if (!hay) return false;
      }
      return true;
    });
  }, [rows, q, proyectoFiltro, estadoFiltro, rango]);

  const kpis: ModuleKpi[] = useMemo(() => {
    const enviadas = filtrados.filter((r) => r.estado === 'enviada').length;
    const parciales = filtrados.filter((r) => r.estado === 'parcial').length;
    const pendienteValor = filtrados.reduce(
      (acc, r) => acc + r.lineas.reduce((a, l) => a + lineaPendiente(l) * l.precioUnitario, 0),
      0
    );
    return [
      { key: 'porRecibir', label: 'Por recibir', value: enviadas === 0 ? '—' : String(enviadas) },
      { key: 'parciales', label: 'Parciales', value: parciales === 0 ? '—' : String(parciales) },
      {
        key: 'pendiente',
        label: 'Valor pendiente',
        value: pendienteValor === 0 ? '—' : formatCurrency(pendienteValor, { compact: true }),
      },
    ];
  }, [filtrados]);

  const toggleExpand = useCallback((oc: OcRow) => {
    setExpandedId((prev) => {
      if (prev === oc.id) return null;
      // Prefill recibos con la cantidad recibida actual de cada línea.
      setRecibos((r) => {
        const next = { ...r };
        for (const l of oc.lineas) next[l.id] = String(l.cantidadRecibida);
        return next;
      });
      return oc.id;
    });
  }, []);

  const recibirTodo = useCallback((oc: OcRow) => {
    setRecibos((r) => {
      const next = { ...r };
      for (const l of oc.lineas) {
        next[l.id] = String(l.cantidad - l.cantidadCancelada);
      }
      return next;
    });
  }, []);

  const guardar = useCallback(
    async (oc: OcRow) => {
      setSavingId(oc.id);
      const sb = createSupabaseBrowserClient();
      // Solo las líneas cuyo total recibido cambió.
      const cambios = oc.lineas.filter((l) => {
        const v = recibos[l.id];
        return v != null && toNum(v) !== l.cantidadRecibida;
      });
      if (cambios.length === 0) {
        toast.add({
          title: 'Sin cambios',
          description: 'No modificaste cantidades.',
          type: 'info',
        });
        setSavingId(null);
        return;
      }
      for (const l of cambios) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error: e } = await (sb.schema('erp') as any).rpc('oc_recibir_linea_partida', {
          p_detalle_id: l.id,
          p_cantidad_recibida_total: toNum(recibos[l.id]),
          p_costo_unitario: null,
        });
        if (e) {
          toast.add({
            title: 'Error al recibir',
            description: getSupabaseErrorMessage(e, `Falló la línea "${l.partidaLabel}".`),
            type: 'error',
          });
          setSavingId(null);
          void cargar();
          return;
        }
      }
      toast.add({
        title: 'Recepción registrada',
        description: `${oc.codigo} · ${cambios.length} línea(s)`,
        type: 'success',
      });
      setSavingId(null);
      setExpandedId(null);
      void cargar();
    },
    [recibos, toast, cargar]
  );

  const exportarCsv = useCallback(() => {
    const headers = ['Folio', 'Proyecto', 'Proveedor', 'Estado', 'Líneas pendientes', 'Fecha'];
    const filas = filtrados.map((r) => [
      r.codigo,
      r.proyectoNombre || 'Gasto suelto',
      r.proveedorNombre,
      ESTADO_LABEL[r.estado] ?? r.estado,
      r.lineas.filter((l) => lineaPendiente(l) > 0).length,
      r.fecha ?? '',
    ]);
    downloadCsv(`recepciones-pendientes-${hoyISOMatamoros()}`, toCsv(headers, filas));
  }, [filtrados]);

  const columns: Column<OcRow>[] = [
    {
      key: 'expand',
      label: '',
      type: 'custom',
      sortable: false,
      width: 'w-8',
      render: (r) => (
        <ChevronRight
          className={`h-4 w-4 text-[var(--text)]/40 transition-transform ${expandedId === r.id ? 'rotate-90' : ''}`}
        />
      ),
    },
    { key: 'codigo', label: 'Folio', type: 'text', width: 'min-w-[120px]' },
    {
      key: 'proyectoNombre',
      label: 'Proyecto',
      type: 'custom',
      width: 'min-w-[150px]',
      render: (r) => r.proyectoNombre || 'Gasto suelto',
    },
    { key: 'proveedorNombre', label: 'Proveedor', type: 'text', width: 'min-w-[200px]' },
    {
      key: 'estado',
      label: 'Estado',
      type: 'custom',
      render: (r) => (
        <Badge tone={ESTADO_TONE[r.estado] ?? 'neutral'}>
          {ESTADO_LABEL[r.estado] ?? r.estado}
        </Badge>
      ),
    },
    {
      key: 'pendiente',
      label: 'Líneas pend.',
      type: 'custom',
      align: 'right',
      accessor: (r) => r.lineas.filter((l) => lineaPendiente(l) > 0).length,
      render: (r) => String(r.lineas.filter((l) => lineaPendiente(l) > 0).length),
    },
    { key: 'fecha', label: 'Fecha', type: 'text', render: (r) => r.fecha || '—' },
  ];

  return (
    <div className="space-y-6 p-6">
      <header className="flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[var(--accent)]/10 text-[var(--accent)]">
          <PackageCheck className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-[var(--text)]">Recepciones</h1>
          <p className="text-sm text-[var(--text)]/60">
            Recibe lo comprado contra la partida del presupuesto. Cada recepción mueve el “ejercido”
            de la partida, sin tocar inventario.
          </p>
        </div>
      </header>

      <ModuleKpiStrip stats={kpis} cols={3} />

      <div className="flex flex-wrap items-center gap-3">
        <select
          value={proyectoFiltro}
          onChange={(e) => setProyectoFiltro(e.target.value)}
          className="h-9 rounded-md border border-[var(--border)] bg-[var(--card)] px-3 text-sm font-medium text-[var(--text)]"
          aria-label="Proyecto"
        >
          <option value="">Todos los proyectos</option>
          {proyectosPresentes.map((p) => (
            <option key={p.id} value={p.id}>
              {p.nombre}
            </option>
          ))}
        </select>
        <select
          value={estadoFiltro}
          onChange={(e) => setEstadoFiltro(e.target.value as '' | 'enviada' | 'parcial')}
          className="h-9 rounded-md border border-[var(--border)] bg-[var(--card)] px-3 text-sm font-medium text-[var(--text)]"
          aria-label="Estado"
        >
          <option value="">Enviadas y parciales</option>
          <option value="enviada">Enviada</option>
          <option value="parcial">Parcial</option>
        </select>
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text)]/40" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar folio, proveedor, proyecto o partida…"
            className="w-72 pl-9"
          />
        </div>
        <DateRangeFilter label="Fecha" value={rango} onChange={setRango} />
        <button
          type="button"
          onClick={() => void cargar()}
          className="flex h-9 items-center gap-1.5 rounded-md border border-[var(--border)] px-3 text-sm text-[var(--text)]/70 hover:text-[var(--text)]"
        >
          <RefreshCw className="h-3.5 w-3.5" /> Refrescar
        </button>
        <div className="ml-auto flex items-center gap-3">
          <button
            type="button"
            onClick={exportarCsv}
            disabled={filtrados.length === 0}
            className="flex h-9 items-center gap-1.5 rounded-md border border-[var(--border)] px-3 text-sm text-[var(--text)]/70 hover:text-[var(--text)] disabled:opacity-50"
          >
            <Download className="h-3.5 w-3.5" /> Exportar
          </button>
          <span className="text-sm text-[var(--text)]/60">
            {filtrados.length} {filtrados.length === 1 ? 'orden' : 'órdenes'} por recibir
          </span>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center gap-2 rounded-md border border-[var(--border)] py-16 text-sm text-[var(--text)]/60">
          <Loader2 className="h-4 w-4 animate-spin" /> Cargando…
        </div>
      ) : error ? (
        <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          <p>{error}</p>
          <button
            type="button"
            onClick={() => void cargar()}
            className="mt-2 rounded-md border border-red-300 px-3 py-1 text-xs font-medium hover:bg-red-100"
          >
            Reintentar
          </button>
        </div>
      ) : filtrados.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 rounded-md border border-dashed border-[var(--border)] py-16 text-center">
          <PackageCheck className="h-6 w-6 text-[var(--text)]/30" />
          <p className="text-sm font-medium text-[var(--text)]">Nada por recibir</p>
          <p className="text-sm text-[var(--text)]/60">
            No hay órdenes enviadas o parciales en este filtro.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-md border border-[var(--border)]">
          <table className="min-w-full text-sm">
            <thead className="bg-[var(--card)] text-xs uppercase tracking-wide text-[var(--text)]/50">
              <tr className="border-b border-[var(--border)]">
                {columns.map((c) => (
                  <th
                    key={c.key}
                    className={`px-3 py-2.5 ${c.align === 'right' ? 'text-right' : 'text-left'} ${c.width ?? ''}`}
                  >
                    {c.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtrados.map((oc) => (
                <Fragment key={oc.id}>
                  <tr
                    onClick={() => toggleExpand(oc)}
                    className="cursor-pointer border-b border-[var(--border)]/60 transition-colors hover:bg-[var(--card)]/50"
                  >
                    {columns.map((c) => (
                      <td
                        key={c.key}
                        className={`px-3 py-2 ${c.align === 'right' ? 'text-right tabular-nums' : ''}`}
                      >
                        {c.render
                          ? c.render(oc)
                          : String((oc as unknown as Record<string, unknown>)[c.key] ?? '')}
                      </td>
                    ))}
                  </tr>
                  {expandedId === oc.id ? (
                    <tr className="border-b border-[var(--border)] bg-[var(--card)]/30">
                      <td colSpan={columns.length} className="px-4 py-3">
                        <ReceivePanel
                          oc={oc}
                          recibos={recibos}
                          setRecibos={setRecibos}
                          puedeRecibir={puedeRecibir}
                          saving={savingId === oc.id}
                          onRecibirTodo={() => recibirTodo(oc)}
                          onGuardar={() => void guardar(oc)}
                        />
                      </td>
                    </tr>
                  ) : null}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function ReceivePanel({
  oc,
  recibos,
  setRecibos,
  puedeRecibir,
  saving,
  onRecibirTodo,
  onGuardar,
}: {
  oc: OcRow;
  recibos: Record<string, string>;
  setRecibos: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  puedeRecibir: boolean;
  saving: boolean;
  onRecibirTodo: () => void;
  onGuardar: () => void;
}) {
  return (
    <div className="space-y-2">
      <div className="rounded-md border border-[var(--border)]/60 bg-[var(--bg)] px-3 py-2.5">
        <HiloGastoStepper empresa="dilesa" documento={{ tipo: 'oc', id: oc.id }} />
      </div>
      <table className="min-w-full text-sm">
        <thead className="text-xs uppercase tracking-wide text-[var(--text)]/50">
          <tr>
            <th className="py-1 pr-3 text-left">Partida</th>
            <th className="px-2 py-1 text-right">Pedida</th>
            <th className="px-2 py-1 text-right">Recibida</th>
            <th className="px-2 py-1 text-right">Pendiente</th>
            <th className="px-2 py-1 text-right">Recibir (total)</th>
            <th className="px-2 py-1 text-right">Importe</th>
          </tr>
        </thead>
        <tbody>
          {oc.lineas.map((l) => {
            const pend = lineaPendiente(l);
            return (
              <tr key={l.id} className="border-t border-[var(--border)]/40">
                <td className="py-1.5 pr-3">
                  <span className="text-[var(--text)]">{l.partidaLabel}</span>
                  {l.descripcion ? (
                    <span className="text-[var(--text)]/50"> · {l.descripcion}</span>
                  ) : null}
                </td>
                <td className="px-2 py-1.5 text-right tabular-nums">{l.cantidad}</td>
                <td className="px-2 py-1.5 text-right tabular-nums text-[var(--text)]/70">
                  {l.cantidadRecibida}
                </td>
                <td className="px-2 py-1.5 text-right tabular-nums">
                  {pend > 0 ? pend : <span className="text-[var(--text)]/30">0</span>}
                </td>
                <td className="px-2 py-1.5 text-right">
                  <Input
                    type="number"
                    step="0.01"
                    value={recibos[l.id] ?? String(l.cantidadRecibida)}
                    onChange={(e) => setRecibos((r) => ({ ...r, [l.id]: e.target.value }))}
                    disabled={!puedeRecibir || saving}
                    className="ml-auto w-24 text-right"
                    aria-label={`Recibir ${l.partidaLabel}`}
                  />
                </td>
                <td className="px-2 py-1.5 text-right tabular-nums">
                  {formatCurrency(lineaTotal(l))}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {puedeRecibir ? (
        <div className="flex items-center justify-end gap-2 pt-1">
          <Button variant="outline" onClick={onRecibirTodo} disabled={saving}>
            Recibir todo
          </Button>
          <Button onClick={onGuardar} disabled={saving}>
            {saving ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <PackageCheck className="size-4" />
            )}
            Guardar recepción
          </Button>
        </div>
      ) : (
        <p className="pt-1 text-right text-xs text-[var(--text)]/50">
          Sin permiso de escritura en Recepciones.
        </p>
      )}
    </div>
  );
}
