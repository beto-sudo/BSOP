'use client';

/**
 * CotizacionesModule — RFQ formal multi-proveedor (DILESA).
 *
 * Iniciativa `dilesa-compras` · Sprint Cotizaciones · Fase 2 (captura). Tab
 * "Cotizaciones" del hub Compras. La RFQ es una **matriz**: N líneas (ancladas a
 * partida, D12) × M proveedores invitados, con un precio por celda. Aquí se
 * crea la RFQ, se invita a proveedores y se captura su respuesta + la matriz de
 * precios. La comparativa lado a lado y la adjudicación (→ OC o contrato) viven
 * en la Fase 3.
 *
 * Patrón del repo (igual que OrdenesCompraModule): client-side directo, fetch
 * paralelo + Map lookups, un proyecto a la vez, selector solo-con-presupuesto.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ClipboardList, Loader2, Plus, RefreshCw, Save, Search, Trash2, X } from 'lucide-react';
import { createSupabaseBrowserClient } from '@/lib/supabase-browser';
import { DataTable, ModuleKpiStrip, type Column, type ModuleKpi } from '@/components/module-page';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge, type BadgeTone } from '@/components/ui/badge';
import { usePermissions } from '@/components/providers';
import { useToast } from '@/components/ui/toast';
import { getSupabaseErrorMessage } from '@/lib/supabase-error';
import { formatCurrency } from '@/lib/format';
import {
  buildProyectoOptions,
  type ProyectoOption,
  type ProyectoSelectorRow,
} from '@/lib/dilesa/proyectos-selector';
import { buildPartidaIndex, type PartidaGrupo } from '@/lib/compras/partidas';
import {
  deriveCotizacionKpis,
  mejorProveedorLinea,
  type CotizacionEstado,
  type CotizacionRow,
  type CotizacionTipo,
  type CotLinea,
  type CotPrecio,
  type CotProveedor,
} from '@/lib/compras/cotizaciones';

const ESTADO_TONE: Record<CotizacionEstado, BadgeTone> = {
  abierta: 'info',
  comparada: 'warning',
  adjudicada: 'success',
  cancelada: 'danger',
};
const ESTADO_LABEL: Record<CotizacionEstado, string> = {
  abierta: 'Abierta',
  comparada: 'Comparada',
  adjudicada: 'Adjudicada',
  cancelada: 'Cancelada',
};
const TIPO_LABEL: Record<CotizacionTipo, string> = {
  compra: 'Compra (→ OC)',
  obra: 'Obra (→ contrato)',
};

type ProveedorOption = { id: string; label: string };

/** Fila con el proyecto inferido de las partidas de sus líneas (para filtrar). */
type CotizacionRowUI = CotizacionRow & { proyectoId: string | null };

type FetchResult = {
  rows?: CotizacionRowUI[];
  proyectos?: ProyectoOption[];
  proveedores?: ProveedorOption[];
  partidasByProyecto?: Map<string, PartidaGrupo[]>;
  error?: string;
};

/** Línea en captura (alta de RFQ). */
type DraftLinea = {
  key: string;
  partidaId: string;
  descripcion: string;
  unidad: string;
  cantidad: string;
};
function emptyLinea(): DraftLinea {
  return { key: crypto.randomUUID(), partidaId: '', descripcion: '', unidad: '', cantidad: '' };
}
function toNum(s: string): number {
  const n = Number(s.trim());
  return Number.isFinite(n) ? n : 0;
}

export function CotizacionesModule({ empresaId }: { empresaId: string }) {
  const { permissions } = usePermissions();
  const toast = useToast();
  const puedeEscribir =
    permissions.isAdmin || permissions.modulos.get('dilesa.compras.cotizaciones')?.write === true;

  const [rows, setRows] = useState<CotizacionRowUI[]>([]);
  const [proyectos, setProyectos] = useState<ProyectoOption[]>([]);
  const [proveedores, setProveedores] = useState<ProveedorOption[]>([]);
  const [partidasByProyecto, setPartidasByProyecto] = useState<Map<string, PartidaGrupo[]>>(
    new Map()
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [proyectoFiltro, setProyectoFiltro] = useState('');
  const autoSelectDone = useRef(false);

  // Alta de RFQ
  const [formOpen, setFormOpen] = useState(false);
  const [tipo, setTipo] = useState<CotizacionTipo>('compra');
  const [descripcion, setDescripcion] = useState('');
  const [fechaLimite, setFechaLimite] = useState('');
  const [lineas, setLineas] = useState<DraftLinea[]>([emptyLinea()]);
  const [proveedoresSel, setProveedoresSel] = useState<Set<string>>(new Set());
  const [submitting, setSubmitting] = useState(false);

  // Captura de precios (matriz) de una RFQ existente
  const [capturaId, setCapturaId] = useState<string | null>(null);

  const fetchData = useCallback(async (): Promise<FetchResult> => {
    const sb = createSupabaseBrowserClient();
    const [cotRes, proyectosRes, proveedoresRes, catalogoRes, partidasRes] = await Promise.all([
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (sb.schema('erp') as any)
        .from('cotizaciones')
        .select(
          'id, codigo, tipo, estado, descripcion, fecha_limite, adjudicado_proveedor_id, created_at, ' +
            'cotizacion_lineas(id, partida_id, descripcion, unidad, cantidad), ' +
            'cotizacion_proveedores(id, proveedor_id, estado, monto_total, tiempo_entrega, condiciones, notas, ' +
            'cotizacion_proveedor_precios(id, cotizacion_linea_id, precio_unitario))'
        )
        .eq('empresa_id', empresaId)
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
        .eq('activo', true)
        .is('deleted_at', null),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (sb.schema('erp') as any)
        .from('conceptos_compra')
        .select('id, padre_id, nivel, codigo, nombre')
        .eq('empresa_id', empresaId)
        .is('deleted_at', null),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (sb.schema('erp') as any)
        .from('presupuesto_partidas')
        .select('id, proyecto_id, concepto_id, concepto_texto')
        .eq('empresa_id', empresaId)
        .is('deleted_at', null),
    ]);

    const firstErr =
      cotRes.error ??
      proyectosRes.error ??
      proveedoresRes.error ??
      catalogoRes.error ??
      partidasRes.error;
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
    const proveedores: ProveedorOption[] = ((proveedoresRes.data ?? []) as unknown as ProvRaw[])
      .map((pv) => ({
        id: pv.id,
        label:
          [pv.personas?.nombre, pv.personas?.apellido_paterno, pv.personas?.apellido_materno]
            .filter(Boolean)
            .join(' ')
            .trim() || '(sin nombre)',
      }))
      .sort((a, b) => a.label.localeCompare(b.label));
    const proveedorLabel = new Map(proveedores.map((p) => [p.id, p.label]));

    const {
      partidaLabel,
      partidaProyecto,
      gruposByProyecto: partidasByProyecto,
    } = buildPartidaIndex(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (partidasRes.data ?? []) as any[],
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (catalogoRes.data ?? []) as any[]
    );

    type CotRaw = {
      id: string;
      codigo: string | null;
      tipo: string;
      estado: string;
      descripcion: string | null;
      fecha_limite: string | null;
      adjudicado_proveedor_id: string | null;
      created_at: string;
      cotizacion_lineas: Array<{
        id: string;
        partida_id: string | null;
        descripcion: string | null;
        unidad: string | null;
        cantidad: number | null;
      }> | null;
      cotizacion_proveedores: Array<{
        id: string;
        proveedor_id: string;
        estado: string;
        monto_total: number | null;
        tiempo_entrega: string | null;
        condiciones: string | null;
        notas: string | null;
        cotizacion_proveedor_precios: Array<{
          id: string;
          cotizacion_linea_id: string;
          precio_unitario: number | null;
        }> | null;
      }> | null;
    };

    const out: CotizacionRowUI[] = ((cotRes.data ?? []) as CotRaw[]).map((c) => {
      const cotLineas: CotLinea[] = (c.cotizacion_lineas ?? []).map((l) => ({
        id: l.id,
        partidaId: l.partida_id,
        partidaLabel: l.partida_id ? (partidaLabel.get(l.partida_id) ?? '—') : '—',
        descripcion: l.descripcion ?? '',
        unidad: l.unidad,
        cantidad: Number(l.cantidad ?? 0),
      }));
      const cotProveedores: CotProveedor[] = (c.cotizacion_proveedores ?? []).map((p) => ({
        id: p.id,
        proveedorId: p.proveedor_id,
        proveedorNombre: proveedorLabel.get(p.proveedor_id) ?? '—',
        estado: p.estado as CotProveedor['estado'],
        montoTotal: p.monto_total != null ? Number(p.monto_total) : null,
        tiempoEntrega: p.tiempo_entrega,
        condiciones: p.condiciones,
        notas: p.notas,
      }));
      const precios: CotPrecio[] = (c.cotizacion_proveedores ?? []).flatMap((p) =>
        (p.cotizacion_proveedor_precios ?? []).map((pr) => ({
          cotProveedorId: p.id,
          lineaId: pr.cotizacion_linea_id,
          precioUnitario: Number(pr.precio_unitario ?? 0),
        }))
      );
      const proyectoId =
        cotLineas
          .map((l) => l.partidaId)
          .filter(Boolean)
          .map((pid) => partidaProyecto.get(pid!))[0] ?? null;
      return {
        id: c.id,
        codigo: c.codigo ?? '—',
        tipo: (c.tipo as CotizacionTipo) ?? 'compra',
        estado: (c.estado as CotizacionEstado) ?? 'abierta',
        descripcion: c.descripcion ?? '',
        fechaLimite: c.fecha_limite ?? c.created_at?.slice(0, 10) ?? null,
        proyectoNombre: proyectoId ? (proyectoMap.get(proyectoId) ?? '') : '',
        adjudicadoProveedorId: c.adjudicado_proveedor_id,
        lineas: cotLineas,
        proveedores: cotProveedores,
        precios,
        proyectoId,
      };
    });

    return { rows: out, proyectos, proveedores, partidasByProyecto };
  }, [empresaId]);

  const apply = useCallback((res: FetchResult) => {
    if (res.error) {
      setError(res.error);
      setRows([]);
    } else {
      setError(null);
      setRows(res.rows ?? []);
      setProyectos(res.proyectos ?? []);
      setProveedores(res.proveedores ?? []);
      setPartidasByProyecto(res.partidasByProyecto ?? new Map());
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
      if (!autoSelectDone.current && !res.error) {
        const firstByPartida = [...(res.partidasByProyecto ?? new Map()).keys()][0];
        if (firstByPartida) setProyectoFiltro(firstByPartida);
        autoSelectDone.current = true;
      }
      setLoading(false);
    });
    return () => {
      activo = false;
    };
  }, [fetchData, apply]);

  // Solo proyectos con presupuesto (partidas) o que ya tienen RFQs.
  const proyectosPresentes = useMemo(() => {
    const conPresupuesto = new Set(partidasByProyecto.keys());
    const enRows = new Set(rows.map((r) => r.proyectoId).filter(Boolean) as string[]);
    const m = new Map<string, string>();
    for (const p of proyectos) {
      if (conPresupuesto.has(p.id) || enRows.has(p.id)) m.set(p.id, p.nombre);
    }
    return [...m.entries()]
      .map(([id, nombre]) => ({ id, nombre }))
      .sort((a, b) => a.nombre.localeCompare(b.nombre));
  }, [proyectos, partidasByProyecto, rows]);

  const q = search.trim().toLowerCase();
  const filtrados = useMemo(() => {
    return rows.filter((r) => {
      if (proyectoFiltro && r.proyectoId !== proyectoFiltro) return false;
      if (q) {
        const hay =
          r.codigo.toLowerCase().includes(q) ||
          r.descripcion.toLowerCase().includes(q) ||
          r.proveedores.some((p) => p.proveedorNombre.toLowerCase().includes(q));
        if (!hay) return false;
      }
      return true;
    });
  }, [rows, q, proyectoFiltro]);

  const kpisData = useMemo(() => deriveCotizacionKpis(filtrados), [filtrados]);
  const kpis: ModuleKpi[] = [
    { key: 'total', label: 'RFQ', value: kpisData.total === 0 ? '—' : String(kpisData.total) },
    {
      key: 'abiertas',
      label: 'Abiertas',
      value: kpisData.abiertas === 0 ? '—' : String(kpisData.abiertas),
    },
    {
      key: 'adjudicadas',
      label: 'Adjudicadas',
      value: kpisData.adjudicadas === 0 ? '—' : String(kpisData.adjudicadas),
    },
    {
      key: 'montoAdjudicado',
      label: 'Adjudicado',
      value:
        kpisData.montoAdjudicado === 0
          ? '—'
          : formatCurrency(kpisData.montoAdjudicado, { compact: true }),
    },
  ];

  const proyectoActivo = proyectoFiltro || '';
  const partidaGrupos = proyectoActivo ? (partidasByProyecto.get(proyectoActivo) ?? []) : [];

  function abrirAlta() {
    setTipo('compra');
    setDescripcion('');
    setFechaLimite('');
    setLineas([emptyLinea()]);
    setProveedoresSel(new Set());
    setFormOpen(true);
  }

  const canSubmit =
    proyectoActivo !== '' &&
    lineas.some((l) => l.partidaId !== '' && toNum(l.cantidad) > 0) &&
    proveedoresSel.size > 0;

  async function onSubmit() {
    if (!canSubmit || submitting) return;
    setSubmitting(true);
    const sb = createSupabaseBrowserClient();
    const validas = lineas.filter((l) => l.partidaId !== '' && toNum(l.cantidad) > 0);
    const folio = `RFQ-${Date.now().toString(36).toUpperCase()}`;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const cotResp = await (sb.schema('erp') as any)
      .from('cotizaciones')
      .insert({
        empresa_id: empresaId,
        codigo: folio,
        tipo,
        estado: 'abierta',
        descripcion: descripcion.trim() || null,
        fecha_limite: fechaLimite || null,
      })
      .select('id')
      .single();
    if (cotResp.error || !cotResp.data) {
      toast.add({
        title: 'Error',
        description: getSupabaseErrorMessage(cotResp.error, 'No se pudo crear la cotización.'),
        type: 'error',
      });
      setSubmitting(false);
      return;
    }
    const cotId = cotResp.data.id as string;
    const detalle = validas.map((l) => ({
      empresa_id: empresaId,
      cotizacion_id: cotId,
      partida_id: l.partidaId,
      descripcion: l.descripcion.trim() || null,
      unidad: l.unidad.trim() || null,
      cantidad: toNum(l.cantidad),
    }));
    const invitados = [...proveedoresSel].map((pid) => ({
      empresa_id: empresaId,
      cotizacion_id: cotId,
      proveedor_id: pid,
      estado: 'invitado',
    }));
    const [lineasResp, provResp] = await Promise.all([
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (sb.schema('erp') as any).from('cotizacion_lineas').insert(detalle),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (sb.schema('erp') as any).from('cotizacion_proveedores').insert(invitados),
    ]);
    const insErr = lineasResp.error ?? provResp.error;
    if (insErr) {
      toast.add({
        title: 'Error',
        description: getSupabaseErrorMessage(insErr, 'Cotización creada pero faltaron datos.'),
        type: 'error',
      });
      setSubmitting(false);
      return;
    }
    toast.add({ title: 'Cotización creada', description: folio, type: 'success' });
    setSubmitting(false);
    setFormOpen(false);
    void cargar();
  }

  const cancelar = useCallback(
    async (c: CotizacionRow) => {
      const sb = createSupabaseBrowserClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error: e } = await (sb.schema('erp') as any)
        .from('cotizaciones')
        .update({ estado: 'cancelada', updated_at: new Date().toISOString() })
        .eq('id', c.id);
      if (e) {
        toast.add({
          title: 'Error',
          description: getSupabaseErrorMessage(e, 'No se pudo cancelar.'),
          type: 'error',
        });
        return;
      }
      toast.add({ title: 'Cotización cancelada', description: c.codigo, type: 'success' });
      void cargar();
    },
    [toast, cargar]
  );

  const enCaptura = useMemo(() => rows.find((r) => r.id === capturaId) ?? null, [rows, capturaId]);

  const columns: Column<CotizacionRow>[] = [
    { key: 'codigo', label: 'Folio', type: 'text', sticky: true, width: 'min-w-[130px]' },
    {
      key: 'tipo',
      label: 'Tipo',
      type: 'custom',
      render: (r) => <span className="text-sm">{TIPO_LABEL[r.tipo]}</span>,
    },
    {
      key: 'descripcion',
      label: 'Descripción',
      type: 'text',
      width: 'min-w-[200px]',
      render: (r) => r.descripcion || '—',
    },
    {
      key: 'estado',
      label: 'Estado',
      type: 'custom',
      render: (r) => <Badge tone={ESTADO_TONE[r.estado]}>{ESTADO_LABEL[r.estado]}</Badge>,
    },
    {
      key: 'lineasCount',
      label: 'Líneas',
      type: 'custom',
      align: 'right',
      accessor: (r) => r.lineas.length,
      render: (r) => String(r.lineas.length),
    },
    {
      key: 'provCount',
      label: 'Proveedores',
      type: 'custom',
      align: 'right',
      accessor: (r) => r.proveedores.length,
      render: (r) => String(r.proveedores.length),
    },
    { key: 'fechaLimite', label: 'Límite', type: 'text', render: (r) => r.fechaLimite || '—' },
    ...(puedeEscribir
      ? [
          {
            key: 'acciones',
            label: '',
            type: 'custom' as const,
            sortable: false,
            align: 'right' as const,
            width: 'w-40',
            render: (r: CotizacionRow) =>
              r.estado === 'abierta' || r.estado === 'comparada' ? (
                <div className="flex items-center justify-end gap-1">
                  <button
                    type="button"
                    onClick={() => setCapturaId(r.id)}
                    className="rounded border border-[var(--border)] px-2 py-1 text-xs text-[var(--text)]/80 hover:bg-[var(--card)]"
                  >
                    Capturar precios
                  </button>
                  <button
                    type="button"
                    onClick={() => void cancelar(r)}
                    aria-label={`Cancelar ${r.codigo}`}
                    className="inline-flex h-7 w-7 items-center justify-center rounded text-[var(--text)]/40 hover:bg-red-50 hover:text-red-600"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ) : null,
          },
        ]
      : []),
  ];

  return (
    <div className="space-y-6 p-6">
      <header className="flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[var(--accent)]/10 text-[var(--accent)]">
          <ClipboardList className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-[var(--text)]">Cotizaciones</h1>
          <p className="text-sm text-[var(--text)]/60">
            RFQ formal multi-proveedor: pide precio a N por las líneas (ancladas a partida), captura
            la matriz y adjudica a OC o contrato (comparativa y adjudicación en la siguiente fase).
          </p>
        </div>
      </header>

      <ModuleKpiStrip stats={kpis} cols={4} />

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
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text)]/40" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar folio, descripción o proveedor…"
            className="w-72 pl-9"
          />
        </div>
        <button
          type="button"
          onClick={() => void cargar()}
          className="flex h-9 items-center gap-1.5 rounded-md border border-[var(--border)] px-3 text-sm text-[var(--text)]/70 hover:text-[var(--text)]"
        >
          <RefreshCw className="h-3.5 w-3.5" /> Refrescar
        </button>
        <div className="ml-auto flex items-center gap-3">
          <span className="text-sm text-[var(--text)]/60">
            {filtrados.length} de {rows.length} cotizaciones
          </span>
          {puedeEscribir ? (
            <button
              type="button"
              onClick={abrirAlta}
              disabled={proyectoActivo === ''}
              title={
                proyectoActivo === '' ? 'Selecciona un proyecto para crear una RFQ' : undefined
              }
              className="inline-flex h-9 items-center gap-1.5 rounded-md bg-[var(--accent)] px-3 text-sm font-medium text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Plus className="h-3.5 w-3.5" /> Nueva cotización
            </button>
          ) : null}
        </div>
      </div>

      {formOpen ? (
        <div className="rounded-md border border-[var(--border)] bg-[var(--card)] p-4">
          <div className="mb-3 flex flex-wrap items-center gap-3">
            <h2 className="text-sm font-medium uppercase tracking-wider text-[var(--text)]/60">
              Nueva RFQ ·{' '}
              {proyectosPresentes.find((p) => p.id === proyectoActivo)?.nombre ?? 'Proyecto'}
            </h2>
            <select
              value={tipo}
              onChange={(e) => setTipo(e.target.value as CotizacionTipo)}
              className="h-9 rounded-md border border-[var(--border)] bg-[var(--bg)] px-3 text-sm text-[var(--text)]"
              aria-label="Tipo de cotización"
            >
              <option value="compra">{TIPO_LABEL.compra}</option>
              <option value="obra">{TIPO_LABEL.obra}</option>
            </select>
            <Input
              value={descripcion}
              onChange={(e) => setDescripcion(e.target.value)}
              placeholder="Descripción (opcional)"
              className="w-64"
            />
            <label className="flex items-center gap-1.5 text-sm text-[var(--text)]/60">
              Límite
              <Input
                value={fechaLimite}
                onChange={(e) => setFechaLimite(e.target.value)}
                type="date"
                className="w-40"
              />
            </label>
          </div>

          {/* Líneas a cotizar */}
          <div className="space-y-2">
            {lineas.map((l, idx) => (
              <div key={l.key} className="flex flex-wrap items-center gap-2">
                <select
                  value={l.partidaId}
                  onChange={(e) =>
                    setLineas((prev) =>
                      prev.map((x) => (x.key === l.key ? { ...x, partidaId: e.target.value } : x))
                    )
                  }
                  className="h-9 min-w-[260px] flex-1 rounded-md border border-[var(--border)] bg-[var(--bg)] px-3 text-sm text-[var(--text)]"
                >
                  <option value="">Partida…</option>
                  {partidaGrupos.map((g) => (
                    <optgroup key={g.key} label={g.label}>
                      {g.partidas.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.label}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
                <Input
                  value={l.descripcion}
                  onChange={(e) =>
                    setLineas((prev) =>
                      prev.map((x) => (x.key === l.key ? { ...x, descripcion: e.target.value } : x))
                    )
                  }
                  placeholder="Detalle (opcional)"
                  className="w-44"
                />
                <Input
                  value={l.cantidad}
                  onChange={(e) =>
                    setLineas((prev) =>
                      prev.map((x) => (x.key === l.key ? { ...x, cantidad: e.target.value } : x))
                    )
                  }
                  type="number"
                  step="0.01"
                  placeholder="Cant."
                  className="w-20"
                />
                <Input
                  value={l.unidad}
                  onChange={(e) =>
                    setLineas((prev) =>
                      prev.map((x) => (x.key === l.key ? { ...x, unidad: e.target.value } : x))
                    )
                  }
                  placeholder="Unidad"
                  className="w-24"
                />
                <button
                  type="button"
                  onClick={() =>
                    setLineas((prev) =>
                      prev.length > 1 ? prev.filter((x) => x.key !== l.key) : prev
                    )
                  }
                  aria-label={`Quitar línea ${idx + 1}`}
                  className="inline-flex h-7 w-7 items-center justify-center rounded text-[var(--text)]/40 hover:bg-red-50 hover:text-red-600"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={() => setLineas((prev) => [...prev, emptyLinea()])}
            className="mt-2 inline-flex items-center gap-1.5 rounded-md border border-[var(--border)] px-3 py-1.5 text-sm text-[var(--text)]/70 hover:text-[var(--text)]"
          >
            <Plus className="h-3.5 w-3.5" /> Agregar línea
          </button>

          {/* Proveedores a invitar */}
          <div className="mt-4">
            <p className="mb-2 text-sm font-medium text-[var(--text)]/70">
              Invitar proveedores ({proveedoresSel.size})
            </p>
            <div className="flex max-h-32 flex-wrap gap-2 overflow-y-auto">
              {proveedores.map((p) => {
                const sel = proveedoresSel.has(p.id);
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() =>
                      setProveedoresSel((prev) => {
                        const next = new Set(prev);
                        if (next.has(p.id)) next.delete(p.id);
                        else next.add(p.id);
                        return next;
                      })
                    }
                    className={`rounded-full border px-3 py-1 text-xs ${
                      sel
                        ? 'border-[var(--accent)] bg-[var(--accent)]/10 text-[var(--accent)]'
                        : 'border-[var(--border)] text-[var(--text)]/70 hover:bg-[var(--card)]'
                    }`}
                  >
                    {p.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="mt-4 flex items-center justify-end gap-2">
            <Button variant="outline" onClick={() => setFormOpen(false)} disabled={submitting}>
              Cancelar
            </Button>
            <Button onClick={onSubmit} disabled={!canSubmit || submitting}>
              {submitting ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Plus className="size-4" />
              )}
              Crear RFQ
            </Button>
          </div>
        </div>
      ) : null}

      {enCaptura ? (
        <CapturaPrecios
          key={enCaptura.id}
          cotizacion={enCaptura}
          empresaId={empresaId}
          onClose={() => setCapturaId(null)}
          onSaved={() => {
            setCapturaId(null);
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
        initialSort={{ key: 'fechaLimite', dir: 'desc' }}
        emptyTitle="Sin cotizaciones"
        emptyDescription="No hay RFQ que coincidan. Crea una con “Nueva cotización”."
        emptyIcon={<ClipboardList className="h-6 w-6" />}
        maxHeight="calc(100vh - 320px)"
      />
    </div>
  );
}

/**
 * Panel de captura de la matriz de precios (precio por línea por proveedor) +
 * datos de respuesta de cada proveedor. Guarda upsert de
 * `cotizacion_proveedor_precios` + update de `cotizacion_proveedores`.
 */
function CapturaPrecios({
  cotizacion,
  empresaId,
  onClose,
  onSaved,
}: {
  cotizacion: CotizacionRow;
  empresaId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const [saving, setSaving] = useState(false);
  // Matriz local: `${cotProveedorId}|${lineaId}` → precio (string).
  const [precios, setPrecios] = useState<Record<string, string>>(() => {
    const seed: Record<string, string> = {};
    for (const p of cotizacion.precios) {
      seed[`${p.cotProveedorId}|${p.lineaId}`] = p.precioUnitario ? String(p.precioUnitario) : '';
    }
    return seed;
  });
  // Datos de respuesta por proveedor.
  const [respuesta, setRespuesta] = useState<
    Record<string, { tiempoEntrega: string; condiciones: string; notas: string }>
  >(() => {
    const seed: Record<string, { tiempoEntrega: string; condiciones: string; notas: string }> = {};
    for (const p of cotizacion.proveedores) {
      seed[p.id] = {
        tiempoEntrega: p.tiempoEntrega ?? '',
        condiciones: p.condiciones ?? '',
        notas: p.notas ?? '',
      };
    }
    return seed;
  });

  const setCelda = (cotProvId: string, lineaId: string, val: string) =>
    setPrecios((prev) => ({ ...prev, [`${cotProvId}|${lineaId}`]: val }));

  // Total por proveedor con la matriz local (en edición).
  const totalLocal = (cotProvId: string): number =>
    cotizacion.lineas.reduce((acc, l) => {
      const v = Number((precios[`${cotProvId}|${l.id}`] ?? '').trim());
      return acc + (l.cantidad ?? 0) * (Number.isFinite(v) ? v : 0);
    }, 0);

  async function guardar() {
    if (saving) return;
    setSaving(true);
    const sb = createSupabaseBrowserClient();
    // Upsert de precios (uno por celda con valor > 0) + update de respuesta/estado por proveedor.
    const filasPrecio: Array<{
      empresa_id: string;
      cotizacion_proveedor_id: string;
      cotizacion_linea_id: string;
      precio_unitario: number;
    }> = [];
    for (const p of cotizacion.proveedores) {
      for (const l of cotizacion.lineas) {
        const raw = (precios[`${p.id}|${l.id}`] ?? '').trim();
        if (raw === '') continue;
        const val = Number(raw);
        if (!Number.isFinite(val) || val <= 0) continue;
        filasPrecio.push({
          empresa_id: empresaId,
          cotizacion_proveedor_id: p.id,
          cotizacion_linea_id: l.id,
          precio_unitario: val,
        });
      }
    }
    // Proveedor pasa a "respondida" si capturó al menos un precio; su monto_total se deriva.
    const updates = cotizacion.proveedores.map((p) => {
      const t = totalLocal(p.id);
      const r = respuesta[p.id] ?? { tiempoEntrega: '', condiciones: '', notas: '' };
      return {
        id: p.id,
        estado: t > 0 ? ('respondida' as const) : ('invitado' as const),
        monto_total: t > 0 ? t : null,
        tiempo_entrega: r.tiempoEntrega.trim() || null,
        condiciones: r.condiciones.trim() || null,
        notas: r.notas.trim() || null,
      };
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const precioResp = await (sb.schema('erp') as any)
      .from('cotizacion_proveedor_precios')
      .upsert(filasPrecio, { onConflict: 'cotizacion_proveedor_id,cotizacion_linea_id' });
    if (precioResp.error) {
      toast.add({
        title: 'Error',
        description: getSupabaseErrorMessage(
          precioResp.error,
          'No se pudieron guardar los precios.'
        ),
        type: 'error',
      });
      setSaving(false);
      return;
    }
    for (const u of updates) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error: e } = await (sb.schema('erp') as any)
        .from('cotizacion_proveedores')
        .update({
          estado: u.estado,
          monto_total: u.monto_total,
          tiempo_entrega: u.tiempo_entrega,
          condiciones: u.condiciones,
          notas: u.notas,
        })
        .eq('id', u.id);
      if (e) {
        toast.add({
          title: 'Error',
          description: getSupabaseErrorMessage(e, 'No se pudo actualizar un proveedor.'),
          type: 'error',
        });
        setSaving(false);
        return;
      }
    }
    toast.add({ title: 'Precios guardados', description: cotizacion.codigo, type: 'success' });
    setSaving(false);
    onSaved();
  }

  return (
    <div className="rounded-md border border-[var(--accent)]/40 bg-[var(--card)] p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-medium uppercase tracking-wider text-[var(--text)]/60">
          Capturar precios · {cotizacion.codigo}
        </h2>
        <button
          type="button"
          onClick={onClose}
          aria-label="Cerrar captura"
          className="inline-flex h-7 w-7 items-center justify-center rounded text-[var(--text)]/40 hover:bg-[var(--bg)]"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-[var(--border)] text-left text-xs uppercase text-[var(--text)]/50">
              <th className="py-2 pr-3 font-medium">Partida</th>
              <th className="px-2 py-2 text-right font-medium">Cant.</th>
              {cotizacion.proveedores.map((p) => (
                <th key={p.id} className="px-2 py-2 text-right font-medium">
                  {p.proveedorNombre}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {cotizacion.lineas.map((l) => (
              <tr key={l.id} className="border-b border-[var(--border)]/50">
                <td className="py-2 pr-3">
                  <span className="text-[var(--text)]">{l.partidaLabel}</span>
                  {l.descripcion ? (
                    <span className="block text-xs text-[var(--text)]/50">{l.descripcion}</span>
                  ) : null}
                </td>
                <td className="px-2 py-2 text-right tabular-nums text-[var(--text)]/70">
                  {l.cantidad} {l.unidad ?? ''}
                </td>
                {cotizacion.proveedores.map((p) => {
                  const mejor = mejorProveedorLinea(cotizacion.precios, l.id);
                  const esMejor = mejor === p.id;
                  return (
                    <td key={p.id} className="px-2 py-1.5 text-right">
                      <Input
                        value={precios[`${p.id}|${l.id}`] ?? ''}
                        onChange={(e) => setCelda(p.id, l.id, e.target.value)}
                        type="number"
                        step="0.01"
                        placeholder="—"
                        className={`w-28 text-right ${esMejor ? 'border-[var(--accent)]' : ''}`}
                      />
                    </td>
                  );
                })}
              </tr>
            ))}
            <tr className="font-medium">
              <td
                className="py-2 pr-3 text-right text-xs uppercase text-[var(--text)]/50"
                colSpan={2}
              >
                Total
              </td>
              {cotizacion.proveedores.map((p) => (
                <td key={p.id} className="px-2 py-2 text-right tabular-nums">
                  {formatCurrency(totalLocal(p.id))}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>

      {/* Datos de respuesta por proveedor */}
      <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {cotizacion.proveedores.map((p) => (
          <div key={p.id} className="rounded border border-[var(--border)] p-2">
            <p className="mb-1.5 text-xs font-medium text-[var(--text)]">{p.proveedorNombre}</p>
            <div className="flex flex-wrap gap-1.5">
              <Input
                value={respuesta[p.id]?.tiempoEntrega ?? ''}
                onChange={(e) =>
                  setRespuesta((prev) => ({
                    ...prev,
                    [p.id]: { ...prev[p.id], tiempoEntrega: e.target.value },
                  }))
                }
                placeholder="Entrega"
                className="w-28"
              />
              <Input
                value={respuesta[p.id]?.condiciones ?? ''}
                onChange={(e) =>
                  setRespuesta((prev) => ({
                    ...prev,
                    [p.id]: { ...prev[p.id], condiciones: e.target.value },
                  }))
                }
                placeholder="Condiciones"
                className="w-32"
              />
            </div>
          </div>
        ))}
      </div>

      <div className="mt-4 flex items-center justify-end gap-2">
        <Button variant="outline" onClick={onClose} disabled={saving}>
          Cerrar
        </Button>
        <Button onClick={guardar} disabled={saving}>
          {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
          Guardar precios
        </Button>
      </div>
    </div>
  );
}
