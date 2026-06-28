'use client';

/**
 * CotizacionesModule — RFQ formal multi-proveedor (DILESA).
 *
 * Iniciativa `dilesa-compras` · Sprint Cotizaciones (Fases 2-3). Tab
 * "Cotizaciones" del hub Compras. La RFQ es una **matriz**: N líneas (ancladas a
 * partida, D12) × M proveedores invitados, con un precio por celda. Cubre el ciclo
 * completo: crear la RFQ, invitar proveedores (y agregar más después), capturar su
 * respuesta (precios + archivo + condiciones), comparar lado a lado (mejor precio
 * resaltado + ranking), y **adjudicar** al ganador → genera una OC (tipo compra) o
 * un contrato de obra (tipo obra), heredando los precios del proveedor elegido.
 *
 * Patrón del repo (igual que OrdenesCompraModule): client-side directo, fetch
 * paralelo + Map lookups, un proyecto a la vez, selector solo-con-presupuesto.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Award,
  ClipboardList,
  Download,
  FileDown,
  Loader2,
  Mail,
  Plus,
  RefreshCw,
  Save,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import { createSupabaseBrowserClient } from '@/lib/supabase-browser';
import { DataTable, ModuleKpiStrip, type Column, type ModuleKpi } from '@/components/module-page';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge, type BadgeTone } from '@/components/ui/badge';
import { Combobox } from '@/components/ui/combobox';
import { FileAttachments } from '@/components/file-attachments';
import { CancelarConMotivoDialog } from '@/components/shared/cancelar-con-motivo-dialog';
import { usePermissions, useEffectiveUser } from '@/components/providers';
import { useToast } from '@/components/ui/toast';
import { getSupabaseErrorMessage, toSupabaseError } from '@/lib/supabase-error';
import { formatCurrency } from '@/lib/format';
import { HiloGastoStepper } from '@/components/gasto/hilo-gasto-stepper';
import { useFocusDrilldown } from '@/hooks/use-focus-drilldown';
import {
  buildProyectoOptions,
  type ProyectoOption,
  type ProyectoSelectorRow,
} from '@/lib/dilesa/proyectos-selector';
import { buildPartidaIndex, type PartidaGrupo } from '@/lib/compras/partidas';
import {
  adjudicaA,
  deriveCotizacionKpis,
  mejorProveedorLinea,
  precioCelda,
  rankingProveedores,
  subtotalEstimadoLinea,
  tieneEstimado,
  totalEstimado,
  totalProveedor,
  puedeAdjudicar,
  type CotizacionEstado,
  type CotizacionRow,
  type CotizacionTipo,
  type CotLinea,
  type CotPrecio,
  type CotProveedor,
} from '@/lib/compras/cotizaciones';
import type { EmpresaSlug } from '@/lib/storage';
import {
  DateRangeFilter,
  EMPTY_DATE_RANGE,
  isInDateRange,
  type DateRange,
} from '@/components/filters/date-range-filter';
import { downloadCsv, toCsv } from '@/lib/export/csv';

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
  const { data: effectiveUser } = useEffectiveUser();
  const toast = useToast();
  const puedeEscribir =
    permissions.isAdmin || permissions.modulos.get('dilesa.compras.cotizaciones')?.write === true;
  // Adjudicar = donde se compromete el dinero → solo Dirección/admin (D1,
  // iniciativa dilesa-compras-flujo). Capturar precios sigue abierto a gerencias.
  const esDireccion =
    permissions.isAdmin || (effectiveUser?.direccionEmpresaIds ?? []).includes(empresaId);

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
  const [estadoFiltro, setEstadoFiltro] = useState<CotizacionEstado | ''>('');
  const [rango, setRango] = useState<DateRange>(EMPTY_DATE_RANGE);

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
  const [cancelarCot, setCancelarCot] = useState<CotizacionRow | null>(null);

  // Drill-down (?focus=<cotizacion_id>) desde el hilo del gasto: abre la captura.
  useFocusDrilldown(
    rows,
    (r) => r.id,
    (row) => setCapturaId(row.id)
  );

  const fetchData = useCallback(async (): Promise<FetchResult> => {
    const sb = createSupabaseBrowserClient();
    const [cotRes, proyectosRes, proveedoresRes, catalogoRes, partidasRes] = await Promise.all([
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (sb.schema('erp') as any)
        .from('cotizaciones')
        .select(
          'id, codigo, tipo, estado, descripcion, fecha_limite, adjudicado_proveedor_id, created_at, ' +
            'cotizacion_lineas(id, partida_id, descripcion, unidad, cantidad, precio_estimado), ' +
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
        precio_estimado: number | null;
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
        precioEstimado: Number(l.precio_estimado ?? 0),
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
      // Sin auto-select de proyecto (Sprint 1 `dilesa-compras-operacion`): arranca
      // en "Todos los proyectos"; el alta de RFQ exige elegir proyecto.
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
      if (estadoFiltro && r.estado !== estadoFiltro) return false;
      if (!isInDateRange(r.fechaLimite, rango)) return false;
      if (q) {
        const hay =
          r.codigo.toLowerCase().includes(q) ||
          r.descripcion.toLowerCase().includes(q) ||
          r.proyectoNombre.toLowerCase().includes(q) ||
          r.proveedores.some((p) => p.proveedorNombre.toLowerCase().includes(q));
        if (!hay) return false;
      }
      return true;
    });
  }, [rows, q, proyectoFiltro, estadoFiltro, rango]);

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
    // El folio (RFQ-{año}-{NNNN}) lo asigna el trigger erp.fn_cotizacion_asignar_folio
    // (BEFORE INSERT) — no se manda desde el cliente. Se lee de vuelta para el aviso.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const cotResp = await (sb.schema('erp') as any)
      .from('cotizaciones')
      .insert({
        empresa_id: empresaId,
        tipo,
        estado: 'abierta',
        descripcion: descripcion.trim() || null,
        fecha_limite: fechaLimite || null,
      })
      .select('id, codigo')
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
    const cotCodigo = (cotResp.data.codigo as string | null) ?? 'RFQ';
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
    toast.add({ title: 'Cotización creada', description: cotCodigo, type: 'success' });
    setSubmitting(false);
    setFormOpen(false);
    void cargar();
  }

  const cancelar = useCallback(
    async (c: CotizacionRow, motivo: string) => {
      const sb = createSupabaseBrowserClient();
      const ahora = new Date().toISOString();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error: e } = await (sb.schema('erp') as any)
        .from('cotizaciones')
        .update({
          estado: 'cancelada',
          cancelada_at: ahora,
          motivo_cancelacion: motivo,
          updated_at: ahora,
        })
        .eq('id', c.id);
      if (e) {
        toast.add({
          title: 'Error',
          description: getSupabaseErrorMessage(e, 'No se pudo cancelar.'),
          type: 'error',
        });
        throw e; // mantiene abierto el diálogo de motivo
      }
      toast.add({ title: 'Cotización cancelada', description: c.codigo, type: 'success' });
      // Si la cancelada era la captura abierta, ciérrala (quedaría editable en falso).
      setCapturaId((cur) => (cur === c.id ? null : cur));
      void cargar();
    },
    [toast, cargar]
  );

  const enCaptura = useMemo(() => rows.find((r) => r.id === capturaId) ?? null, [rows, capturaId]);

  const exportarCsv = useCallback(() => {
    const headers = [
      'Folio',
      'Tipo',
      'Proyecto',
      'Descripción',
      'Estado',
      'Líneas',
      'Respuestas',
      'Límite',
    ];
    const filas = filtrados.map((r) => [
      r.codigo,
      TIPO_LABEL[r.tipo],
      r.proyectoNombre || '—',
      r.descripcion,
      ESTADO_LABEL[r.estado],
      r.lineas.length,
      `${r.proveedores.filter((p) => p.estado !== 'invitado').length}/${r.proveedores.length}`,
      r.fechaLimite ?? '',
    ]);
    downloadCsv(`cotizaciones-${new Date().toISOString().slice(0, 10)}`, toCsv(headers, filas));
  }, [filtrados]);

  const columns: Column<CotizacionRow>[] = [
    { key: 'codigo', label: 'Folio', type: 'text', sticky: true, width: 'min-w-[130px]' },
    {
      key: 'proyectoNombre',
      label: 'Proyecto',
      type: 'text',
      width: 'min-w-[150px]',
      render: (r) => r.proyectoNombre || '—',
    },
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
      label: 'Respuestas',
      type: 'custom',
      align: 'right',
      accessor: (r) => r.proveedores.filter((p) => p.estado !== 'invitado').length,
      render: (r) => {
        const resp = r.proveedores.filter((p) => p.estado !== 'invitado').length;
        return `${resp}/${r.proveedores.length}`;
      },
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
            width: 'w-12',
            render: (r: CotizacionRow) =>
              r.estado === 'abierta' || r.estado === 'comparada' ? (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setCancelarCot(r);
                  }}
                  aria-label={`Cancelar ${r.codigo}`}
                  className="inline-flex h-7 w-7 items-center justify-center rounded text-[var(--text)]/40 hover:bg-red-50 hover:text-red-600"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
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
            Solicita precio a varios proveedores y compara. Crea la RFQ con sus líneas, invita
            proveedores, y <strong className="font-medium">haz clic en una cotización</strong> para
            capturar lo que te cotizaron: precios por línea, archivo y condiciones. La adjudicación
            (→ OC o contrato) llega en la siguiente fase.
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
        <select
          value={estadoFiltro}
          onChange={(e) => setEstadoFiltro(e.target.value as CotizacionEstado | '')}
          className="h-9 rounded-md border border-[var(--border)] bg-[var(--card)] px-3 text-sm font-medium text-[var(--text)]"
          aria-label="Estado"
        >
          <option value="">Todos los estados</option>
          <option value="abierta">Abierta</option>
          <option value="comparada">Comparada</option>
          <option value="adjudicada">Adjudicada</option>
          <option value="cancelada">Cancelada</option>
        </select>
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text)]/40" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar folio, descripción, proyecto o proveedor…"
            className="w-72 pl-9"
          />
        </div>
        <DateRangeFilter label="Límite" value={rango} onChange={setRango} />
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

          {/* Proveedores a invitar — buscar y agregar (combobox con búsqueda) */}
          <div className="mt-4">
            <p className="mb-2 text-sm font-medium text-[var(--text)]/70">
              Invitar proveedores ({proveedoresSel.size})
            </p>
            <Combobox
              value={null}
              onChange={(id) => {
                if (!id) return;
                setProveedoresSel((prev) => {
                  const next = new Set(prev);
                  next.add(id);
                  return next;
                });
              }}
              options={proveedores
                .filter((p) => !proveedoresSel.has(p.id))
                .map((p) => ({ value: p.id, label: p.label }))}
              placeholder="Buscar y agregar proveedor…"
              searchPlaceholder="Buscar proveedor…"
              emptyText="Sin proveedores disponibles"
              className="w-80"
              aria-label="Agregar proveedor a la cotización"
            />
            {proveedoresSel.size > 0 ? (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {[...proveedoresSel].map((id) => {
                  const label = proveedores.find((p) => p.id === id)?.label ?? '—';
                  return (
                    <span
                      key={id}
                      className="inline-flex items-center gap-1 rounded-full border border-[var(--accent)] bg-[var(--accent)]/10 px-2.5 py-1 text-xs text-[var(--accent)]"
                    >
                      {label}
                      <button
                        type="button"
                        onClick={() =>
                          setProveedoresSel((prev) => {
                            const next = new Set(prev);
                            next.delete(id);
                            return next;
                          })
                        }
                        aria-label={`Quitar ${label}`}
                        className="text-[var(--accent)]/70 hover:text-[var(--accent)]"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </span>
                  );
                })}
              </div>
            ) : null}
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
          empresaSlug="dilesa"
          puedeEscribir={puedeEscribir}
          esDireccion={esDireccion}
          proveedoresDisponibles={proveedores}
          onClose={() => setCapturaId(null)}
          onSaved={() => {
            setCapturaId(null);
            void cargar();
          }}
          onRefresh={() => void cargar()}
          onCancelarCotizacion={() => setCancelarCot(enCaptura)}
        />
      ) : null}

      <DataTable
        data={filtrados}
        columns={columns}
        rowKey="id"
        loading={loading}
        error={error}
        onRetry={() => void cargar()}
        onRowClick={(r) => setCapturaId(r.id === capturaId ? null : r.id)}
        initialSort={{ key: 'fechaLimite', dir: 'desc' }}
        emptyTitle="Sin cotizaciones"
        emptyDescription="No hay RFQ que coincidan. Crea una con “Nueva cotización”."
        emptyIcon={<ClipboardList className="h-6 w-6" />}
        maxHeight="calc(100vh - 320px)"
      />

      {cancelarCot ? (
        <CancelarConMotivoDialog
          key={cancelarCot.id}
          title={`¿Cancelar ${cancelarCot.codigo}?`}
          description="La cotización quedará cancelada. Se preserva el historial para auditoría."
          confirmLabel="Cancelar cotización"
          onClose={() => setCancelarCot(null)}
          onConfirm={(motivo) => cancelar(cancelarCot, motivo)}
        />
      ) : null}
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
  empresaSlug,
  puedeEscribir,
  esDireccion,
  proveedoresDisponibles,
  onClose,
  onSaved,
  onRefresh,
  onCancelarCotizacion,
}: {
  cotizacion: CotizacionRow;
  empresaId: string;
  empresaSlug: EmpresaSlug;
  puedeEscribir: boolean;
  esDireccion: boolean;
  proveedoresDisponibles: ProveedorOption[];
  onClose: () => void;
  onSaved: () => void;
  onRefresh: () => void;
  /** Cancela la RFQ desde el detalle — misma acción que la X de la fila (ADR-044). */
  onCancelarCotizacion: () => void;
}) {
  const toast = useToast();
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  // Matriz local: `${cotProveedorId}|${lineaId}` → precio (string). Solo los
  // precios YA guardados por proveedor — la matriz arranca en blanco para que
  // cada proveedor cotice a ciegas (el estimado heredado de la requisición vive
  // en su propia columna de referencia, no pre-llena la oferta de nadie).
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

  // Confirmación de envío por email (acción externa) + estado de envío.
  const [confirmEnvioId, setConfirmEnvioId] = useState<string | null>(null);
  const [enviandoId, setEnviandoId] = useState<string | null>(null);
  // Confirmación + estado de adjudicación (genera OC o contrato).
  const [confirmAdjId, setConfirmAdjId] = useState<string | null>(null);
  // Opt-in "OC + Contrato" (Sprint 3): para una cotización de obra con material.
  const [adjAmbos, setAdjAmbos] = useState(false);
  const [adjudicandoId, setAdjudicandoId] = useState<string | null>(null);

  const setCelda = (cotProvId: string, lineaId: string, val: string) =>
    setPrecios((prev) => ({ ...prev, [`${cotProvId}|${lineaId}`]: val }));

  // Enviar la Solicitud de Cotización en PDF al email del proveedor (vía endpoint Resend).
  async function enviarSolicitud(cotProveedorId: string) {
    setConfirmEnvioId(null);
    setEnviandoId(cotProveedorId);
    try {
      const res = await fetch(`/api/dilesa/cotizaciones/${cotizacion.id}/solicitud`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cotProveedorId }),
      });
      const json = (await res.json()) as { sentTo?: string; error?: string };
      if (!res.ok) {
        toast.add({
          title: 'No se envió',
          description: json.error ?? 'Error al enviar la solicitud.',
          type: 'error',
        });
      } else {
        toast.add({
          title: 'Solicitud enviada',
          description: json.sentTo ? `A ${json.sentTo}` : undefined,
          type: 'success',
        });
      }
    } catch {
      toast.add({ title: 'Error', description: 'No se pudo enviar.', type: 'error' });
    } finally {
      setEnviandoId(null);
    }
  }

  // Total por proveedor con la matriz local (en edición).
  const totalLocal = (cotProvId: string): number =>
    cotizacion.lineas.reduce((acc, l) => {
      const v = Number((precios[`${cotProvId}|${l.id}`] ?? '').trim());
      return acc + (l.cantidad ?? 0) * (Number.isFinite(v) ? v : 0);
    }, 0);

  // ¿La RFQ trae estimado de la requisición? → muestra la columna de referencia.
  const hayEstimado = tieneEstimado(cotizacion.lineas);

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

    // El guardado necesita un LÍMITE DE TIEMPO DURO, no solo try/catch. Si la
    // red de la terminal cuelga el POST (incluido el refresh de token de
    // auth-js, que corre bajo un Web Lock), el `await` nunca se resuelve NI
    // rechaza → ni el `finally` corre y el botón se queda "pensando"
    // indefinidamente sin error (reporte de Nahum: "se queda un buen rato y no
    // avanza"; refrescar lo arregla porque libera el lock). El `Promise.race`
    // contra un timeout garantiza que el spinner SIEMPRE se libere con un
    // mensaje accionable, y el `abortSignal` cancela el request en vuelo.
    const SAVE_TIMEOUT_MS = 15_000;
    const ac = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timer = setTimeout(
        () =>
          reject(
            new Error(
              'La conexión tardó demasiado. Refresca la página (Ctrl+Shift+R) e intenta de nuevo.'
            )
          ),
        SAVE_TIMEOUT_MS
      );
    });
    // Evita un unhandledrejection si el timeout pierde la carrera.
    timeoutPromise.catch(() => {});

    const guardado = (async () => {
      // Saltar el upsert vacío evita un POST inútil (solo se actualiza la
      // respuesta del proveedor cuando no se capturó ningún precio).
      if (filasPrecio.length > 0) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const precioResp = await (sb.schema('erp') as any)
          .from('cotizacion_proveedor_precios')
          .upsert(filasPrecio, { onConflict: 'cotizacion_proveedor_id,cotizacion_linea_id' })
          .abortSignal(ac.signal);
        if (precioResp.error) {
          throw toSupabaseError(precioResp.error, 'No se pudieron guardar los precios.');
        }
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
          .eq('id', u.id)
          .abortSignal(ac.signal);
        if (e) {
          throw toSupabaseError(e, 'No se pudo actualizar un proveedor.');
        }
      }
    })();
    // Si el timeout gana la carrera, la promesa real puede rechazar después:
    // la silenciamos para no disparar un unhandledrejection.
    guardado.catch(() => {});

    try {
      await Promise.race([timeoutPromise, guardado]);
      toast.add({ title: 'Precios guardados', description: cotizacion.codigo, type: 'success' });
      onSaved();
    } catch (err) {
      ac.abort();
      toast.add({
        title: 'Error',
        description: getSupabaseErrorMessage(
          err,
          'No se pudieron guardar los precios. Revisa tu conexión e intenta de nuevo.'
        ),
        type: 'error',
      });
    } finally {
      if (timer) clearTimeout(timer);
      setSaving(false);
    }
  }

  // Invitar otro proveedor a una RFQ ya creada (agrega una columna a la matriz).
  async function invitarProveedor(proveedorId: string) {
    const sb = createSupabaseBrowserClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: e } = await (sb.schema('erp') as any).from('cotizacion_proveedores').insert({
      empresa_id: empresaId,
      cotizacion_id: cotizacion.id,
      proveedor_id: proveedorId,
      estado: 'invitado',
    });
    if (e) {
      toast.add({
        title: 'Error',
        description: getSupabaseErrorMessage(e, 'No se pudo invitar al proveedor.'),
        type: 'error',
      });
      return;
    }
    toast.add({ title: 'Proveedor agregado', type: 'success' });
    onRefresh();
  }

  // Adjudicar la RFQ a un proveedor: genera OC (compra) o contrato de obra (obra),
  // marca la cotización 'adjudicada' y a los proveedores elegida/descartada.
  // Crea la OC emitida (enviada) + su detalle desde la cotización; devuelve su id.
  // Reutilizado por la adjudicación a OC y por el opt-in "OC + Contrato" (Sprint 3).
  async function crearOcEmitida(
    sb: ReturnType<typeof createSupabaseBrowserClient>,
    cotProveedorId: string,
    proveedorId: string,
    total: number
  ): Promise<string> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ocResp = await (sb.schema('erp') as any)
      .from('ordenes_compra')
      .insert({
        empresa_id: empresaId,
        cotizacion_id: cotizacion.id,
        proveedor_id: proveedorId,
        estado: 'enviada',
        autorizada_at: new Date().toISOString(),
        total,
      })
      .select('id')
      .single();
    if (ocResp.error || !ocResp.data) {
      throw new Error(
        getSupabaseErrorMessage(ocResp.error, 'No se pudo crear la orden de compra.')
      );
    }
    const ocId = ocResp.data.id as string;
    const detalle = cotizacion.lineas.map((l) => {
      const precio = precioCelda(cotizacion.precios, cotProveedorId, l.id);
      return {
        empresa_id: empresaId,
        orden_compra_id: ocId,
        partida_id: l.partidaId,
        producto_id: null,
        descripcion: l.descripcion.trim() || null,
        unidad: l.unidad,
        cantidad: l.cantidad,
        precio_unitario: precio,
        subtotal: (l.cantidad ?? 0) * precio,
      };
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const detResp = await (sb.schema('erp') as any).from('ordenes_compra_detalle').insert(detalle);
    if (detResp.error) {
      throw new Error(getSupabaseErrorMessage(detResp.error, 'OC creada pero faltaron líneas.'));
    }
    return ocId;
  }

  // Marca la cotización adjudicada + sus proveedores elegida/descartada.
  async function cerrarAdjudicacion(
    sb: ReturnType<typeof createSupabaseBrowserClient>,
    cotProveedorId: string,
    proveedorId: string
  ) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (sb.schema('erp') as any)
      .from('cotizaciones')
      .update({
        estado: 'adjudicada',
        adjudicado_proveedor_id: proveedorId,
        updated_at: new Date().toISOString(),
      })
      .eq('id', cotizacion.id);
    for (const p of cotizacion.proveedores) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (sb.schema('erp') as any)
        .from('cotizacion_proveedores')
        .update({ estado: p.id === cotProveedorId ? 'elegida' : 'descartada' })
        .eq('id', p.id);
    }
  }

  async function adjudicar(cotProveedorId: string, tambienOc = false) {
    setConfirmAdjId(null);
    // Candado de dinero (D1): solo Dirección/admin adjudica. Guard defensivo
    // además del gate visual — la adjudicación emite la OC y compromete.
    if (!esDireccion) return;
    setAdjudicandoId(cotProveedorId);
    const sb = createSupabaseBrowserClient();
    const prov = cotizacion.proveedores.find((p) => p.id === cotProveedorId);
    if (!prov) {
      setAdjudicandoId(null);
      return;
    }
    const total = totalProveedor(cotizacion, cotProveedorId);
    try {
      if (adjudicaA(cotizacion.tipo) === 'oc') {
        await crearOcEmitida(sb, cotProveedorId, prov.proveedorId, total);
      } else {
        // Obra: NO se crea el contrato en silencio. Se rutea a la pantalla de
        // condiciones, que pre-llena desde la cotización y, al guardar, crea el
        // contrato CON sus condiciones y cierra la adjudicación.
        //
        // Opt-in "ambos" (Sprint 3): si es labor + material, además emitimos la OC
        // (material) y la ligamos al contrato vía la pantalla (?oc=). En ese caso la
        // cotización se cierra AQUÍ (la OC ya se emitió); en obra puro la cierra la
        // pantalla al guardar (evita una adjudicación sin contrato si se abandona).
        let ocLigada: string | null = null;
        if (tambienOc) {
          ocLigada = await crearOcEmitida(sb, cotProveedorId, prov.proveedorId, total);
          await cerrarAdjudicacion(sb, cotProveedorId, prov.proveedorId);
        }
        const partidaPrellenado = cotizacion.lineas.map((l) => l.partidaId).find(Boolean) ?? '';
        const params = new URLSearchParams({
          cotizacion: cotizacion.id,
          proveedor: prov.proveedorId,
          total: String(total),
          ...(partidaPrellenado ? { partida: partidaPrellenado } : {}),
          ...(ocLigada ? { oc: ocLigada } : {}),
        });
        router.push(`/dilesa/construccion/contratos/nuevo-obra?${params.toString()}`);
        return;
      }
      await cerrarAdjudicacion(sb, cotProveedorId, prov.proveedorId);
      toast.add({
        title: 'Cotización adjudicada',
        description: 'Orden de compra emitida',
        type: 'success',
      });
      onSaved();
    } catch (e) {
      toast.add({
        title: 'Error al adjudicar',
        description: e instanceof Error ? e.message : 'Error desconocido.',
        type: 'error',
      });
      setAdjudicandoId(null);
    }
  }

  return (
    <div className="rounded-md border border-[var(--accent)]/40 bg-[var(--card)] p-4">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <h2 className="text-sm font-medium uppercase tracking-wider text-[var(--text)]/60">
            Capturar y comparar · {cotizacion.codigo}
          </h2>
          <p className="mt-0.5 text-xs text-[var(--text)]/50">
            Captura el <strong className="font-medium">precio unitario</strong> de cada proveedor
            por línea — el importe del renglón y el total se suman solos. Si la RFQ vino de una
            requisición verás la columna <em>Estimado</em> como referencia interna (no se envía al
            proveedor): cada quien cotiza en blanco para que mande su mejor oferta. El mejor por
            renglón se resalta; sube su archivo y condiciones abajo.
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Cerrar captura"
          className="inline-flex h-7 w-7 items-center justify-center rounded text-[var(--text)]/40 hover:bg-[var(--bg)]"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="mb-4 rounded-md border border-[var(--border)]/60 bg-[var(--bg)] px-3 py-2.5">
        <HiloGastoStepper
          empresa={empresaSlug}
          documento={{ tipo: 'cotizacion', id: cotizacion.id }}
        />
      </div>

      {puedeEscribir ? (
        <div className="mb-3">
          <Combobox
            value={null}
            onChange={(id) => {
              if (id) void invitarProveedor(id);
            }}
            options={proveedoresDisponibles
              .filter((p) => !cotizacion.proveedores.some((cp) => cp.proveedorId === p.id))
              .map((p) => ({ value: p.id, label: p.label }))}
            placeholder="Agregar otro proveedor a esta cotización…"
            searchPlaceholder="Buscar proveedor…"
            emptyText="Sin proveedores disponibles"
            className="w-80"
            aria-label="Agregar proveedor a la cotización"
          />
        </div>
      ) : null}

      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-[var(--border)] text-left text-xs uppercase text-[var(--text)]/50">
              <th className="py-2 pr-3 font-medium">Partida</th>
              <th className="px-2 py-2 text-right font-medium">Cant.</th>
              {hayEstimado ? (
                <th
                  className="px-2 py-2 text-right font-medium"
                  title="Precio estimado heredado de la requisición — referencia interna, no se envía al proveedor"
                >
                  Estimado
                </th>
              ) : null}
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
                {hayEstimado ? (
                  <td className="px-2 py-2 text-right align-top tabular-nums text-[var(--text)]/55">
                    {l.precioEstimado > 0 ? (
                      <>
                        {formatCurrency(l.precioEstimado)}
                        <span className="mt-0.5 block text-[11px] text-[var(--text)]/40">
                          {formatCurrency(subtotalEstimadoLinea(l))}
                        </span>
                      </>
                    ) : (
                      '—'
                    )}
                  </td>
                ) : null}
                {cotizacion.proveedores.map((p) => {
                  const mejor = mejorProveedorLinea(cotizacion.precios, l.id);
                  const esMejor = mejor === p.id;
                  const raw = (precios[`${p.id}|${l.id}`] ?? '').trim();
                  const pu = Number(raw);
                  const subtotal =
                    raw !== '' && Number.isFinite(pu) && pu > 0 ? (l.cantidad ?? 0) * pu : null;
                  return (
                    <td key={p.id} className="px-2 py-1.5 text-right align-top">
                      <Input
                        value={precios[`${p.id}|${l.id}`] ?? ''}
                        onChange={(e) => setCelda(p.id, l.id, e.target.value)}
                        type="number"
                        step="0.01"
                        placeholder="—"
                        className={`w-28 text-right ${esMejor ? 'border-[var(--accent)]' : ''}`}
                      />
                      {subtotal != null ? (
                        <span className="mt-0.5 block text-[11px] tabular-nums text-[var(--text)]/45">
                          {formatCurrency(subtotal)}
                        </span>
                      ) : null}
                    </td>
                  );
                })}
              </tr>
            ))}
            <tr className="border-t-2 border-[var(--border)] font-semibold">
              <td
                className="py-2 pr-3 text-right text-xs uppercase text-[var(--text)]/50"
                colSpan={2}
              >
                Total
              </td>
              {hayEstimado ? (
                <td className="px-2 py-2 text-right tabular-nums text-[var(--text)]/60">
                  {formatCurrency(totalEstimado(cotizacion.lineas))}
                </td>
              ) : null}
              {cotizacion.proveedores.map((p) => (
                <td key={p.id} className="px-2 py-2 text-right tabular-nums text-[var(--text)]">
                  {formatCurrency(totalLocal(p.id))}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>

      {/* Cotización recibida por proveedor: archivo (PDF/Excel) + condiciones */}
      <div className="mt-5">
        <p className="mb-2 text-sm font-medium text-[var(--text)]/70">
          Cotización recibida por proveedor (archivo + condiciones)
        </p>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {cotizacion.proveedores.map((p) => (
            <div key={p.id} className="rounded-md border border-[var(--border)] p-3">
              <p className="mb-2 text-xs font-medium text-[var(--text)]">{p.proveedorNombre}</p>
              <div className="mb-2 flex flex-wrap gap-1.5">
                <Input
                  value={respuesta[p.id]?.tiempoEntrega ?? ''}
                  onChange={(e) =>
                    setRespuesta((prev) => ({
                      ...prev,
                      [p.id]: { ...prev[p.id], tiempoEntrega: e.target.value },
                    }))
                  }
                  placeholder="Tiempo de entrega"
                  className="w-32"
                />
                <Input
                  value={respuesta[p.id]?.condiciones ?? ''}
                  onChange={(e) =>
                    setRespuesta((prev) => ({
                      ...prev,
                      [p.id]: { ...prev[p.id], condiciones: e.target.value },
                    }))
                  }
                  placeholder="Condiciones de pago"
                  className="w-36"
                />
              </div>
              <FileAttachments
                empresaId={empresaId}
                empresaSlug={empresaSlug}
                entidad="cotizaciones"
                entidadId={p.id}
                roles={[{ id: 'cotizacion', label: 'Archivo de cotización' }]}
                variant="flat"
                readOnly={!puedeEscribir}
              />
              {/* Enviar la solicitud (PDF) al proveedor: descargar o por email */}
              <div className="mt-2 flex items-center gap-1.5">
                <a
                  href={`/api/dilesa/cotizaciones/${cotizacion.id}/solicitud?proveedor=${p.id}`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 rounded border border-[var(--border)] px-2 py-1 text-xs text-[var(--text)]/80 hover:bg-[var(--bg)]"
                >
                  <FileDown className="h-3 w-3" /> PDF
                </a>
                {puedeEscribir ? (
                  confirmEnvioId === p.id ? (
                    <span className="inline-flex items-center gap-1 text-xs text-[var(--text)]/70">
                      ¿Enviar por email?
                      <button
                        type="button"
                        onClick={() => void enviarSolicitud(p.id)}
                        className="rounded bg-[var(--accent)] px-1.5 py-0.5 text-white"
                      >
                        Sí
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmEnvioId(null)}
                        className="rounded border border-[var(--border)] px-1.5 py-0.5"
                      >
                        No
                      </button>
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setConfirmEnvioId(p.id)}
                      disabled={enviandoId === p.id}
                      className="inline-flex items-center gap-1 rounded border border-[var(--border)] px-2 py-1 text-xs text-[var(--text)]/80 hover:bg-[var(--bg)] disabled:opacity-50"
                    >
                      {enviandoId === p.id ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <Mail className="h-3 w-3" />
                      )}
                      Enviar
                    </button>
                  )
                ) : null}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Para quien captura pero no es Dirección: la RFQ ya está lista, pero
          adjudicar/emitir la OC le toca a Dirección (D1). */}
      {!esDireccion && puedeAdjudicar(cotizacion) ? (
        <div className="mt-5 border-t border-[var(--border)] pt-4">
          <p className="text-sm text-[var(--text)]/60">
            Lista para adjudicar. La adjudicación —y la emisión de la orden de compra— la realiza
            Dirección.
          </p>
        </div>
      ) : null}

      {/* Comparación + adjudicación: ranking por total, elige el ganador → OC o contrato.
          Solo Dirección/admin adjudica (D1); para los demás se muestra la nota de arriba. */}
      {esDireccion && puedeAdjudicar(cotizacion) ? (
        <div className="mt-5 border-t border-[var(--border)] pt-4">
          <p className="mb-2 text-sm font-medium text-[var(--text)]/70">
            Adjudicar — genera{' '}
            {adjudicaA(cotizacion.tipo) === 'oc' ? 'una orden de compra' : 'un contrato de obra'}{' '}
            con el proveedor elegido. Guarda los precios antes de adjudicar.
          </p>
          <div className="space-y-1.5">
            {rankingProveedores(cotizacion).map((r, i) => (
              <div
                key={r.cotProveedorId}
                className="flex flex-wrap items-center gap-3 rounded-md border border-[var(--border)] px-3 py-2 text-sm"
              >
                <span className="text-xs text-[var(--text)]/40">#{i + 1}</span>
                <span className="min-w-0 flex-1 truncate font-medium text-[var(--text)]">
                  {r.proveedorNombre}
                </span>
                {i === 0 ? <Badge tone="success">Más barato</Badge> : null}
                <span className="tabular-nums text-[var(--text)]/80">
                  {formatCurrency(r.total)}
                </span>
                {puedeEscribir ? (
                  confirmAdjId === r.cotProveedorId ? (
                    <span className="inline-flex items-center gap-1.5 text-xs text-[var(--text)]/70">
                      {adjudicaA(cotizacion.tipo) !== 'oc' ? (
                        <label
                          className="inline-flex items-center gap-1"
                          title="Genera además una OC para el material (labor + material)"
                        >
                          <input
                            type="checkbox"
                            checked={adjAmbos}
                            onChange={(e) => setAdjAmbos(e.target.checked)}
                            className="size-3.5"
                          />
                          +OC
                        </label>
                      ) : null}
                      ¿Adjudicar a este?
                      <button
                        type="button"
                        onClick={() => void adjudicar(r.cotProveedorId, adjAmbos)}
                        className="rounded bg-[var(--accent)] px-1.5 py-0.5 text-white"
                      >
                        Sí
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setConfirmAdjId(null);
                          setAdjAmbos(false);
                        }}
                        className="rounded border border-[var(--border)] px-1.5 py-0.5"
                      >
                        No
                      </button>
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setConfirmAdjId(r.cotProveedorId)}
                      disabled={adjudicandoId !== null}
                      className="inline-flex items-center gap-1 rounded-md bg-[var(--accent)] px-2.5 py-1 text-xs font-medium text-white hover:opacity-90 disabled:opacity-50"
                    >
                      {adjudicandoId === r.cotProveedorId ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <Award className="h-3 w-3" />
                      )}
                      Adjudicar
                    </button>
                  )
                ) : null}
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        {puedeEscribir && (cotizacion.estado === 'abierta' || cotizacion.estado === 'comparada') ? (
          <Button
            variant="ghost"
            onClick={onCancelarCotizacion}
            disabled={saving}
            className="text-[var(--text)]/60 hover:text-red-600"
          >
            <X className="size-4" /> Cancelar cotización
          </Button>
        ) : null}
        <div className="ml-auto flex items-center gap-2">
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cerrar
          </Button>
          <Button onClick={guardar} disabled={saving || !puedeEscribir}>
            {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
            Guardar precios
          </Button>
        </div>
      </div>
    </div>
  );
}
