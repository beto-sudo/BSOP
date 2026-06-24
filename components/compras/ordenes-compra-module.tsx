'use client';

/**
 * OrdenesCompraModule — alta y gestión de órdenes de compra de obra (DILESA).
 *
 * Iniciativa `dilesa-compras` · Sprint 2 Fase B. Tab "Órdenes" del hub Compras.
 * Modelo constructora-first (D7/D12): cada línea se ancla a una **partida** del
 * presupuesto del proyecto (`erp.presupuesto_partidas`, ya clasificada al
 * catálogo); `producto_id` queda null, sin inventario. Al **enviar** la OC pasa
 * a `enviada` y mueve `comprometido` en `erp.v_partida_control`.
 *
 * Un proyecto a la vez (como Costeo): el selector fija el proyecto; la OC y sus
 * partidas son de ese proyecto. Reusa las RPCs de `erp` para cerrar/cancelar.
 *
 * Carga cross-schema con queries paralelas + lookups Map (patrón del repo).
 * La recepción (devengar `ejercido`) vive en el tab Recepciones (Fase C).
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Coins,
  Download,
  Loader2,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Send,
  Trash2,
  X,
} from 'lucide-react';
import { createSupabaseBrowserClient } from '@/lib/supabase-browser';
import { DataTable, ModuleKpiStrip, type Column, type ModuleKpi } from '@/components/module-page';
import {
  DetailDrawer,
  DetailDrawerContent,
  DetailDrawerSection,
} from '@/components/detail-page/detail-drawer';
import { HiloGastoStepper } from '@/components/gasto/hilo-gasto-stepper';
import { CancelarConMotivoDialog } from '@/components/shared/cancelar-con-motivo-dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge, type BadgeTone } from '@/components/ui/badge';
import { RowActions } from '@/components/shared/row-actions';
import { usePermissions, useEffectiveUser } from '@/components/providers';
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
  deriveOcKpis,
  lineaTotal,
  ocTotal,
  type OcEstado,
  type OcLinea,
  type OcRow,
} from '@/lib/compras/ordenes';
import { useFocusDrilldown } from '@/hooks/use-focus-drilldown';
import {
  DateRangeFilter,
  EMPTY_DATE_RANGE,
  isInDateRange,
  type DateRange,
} from '@/components/filters/date-range-filter';
import { downloadCsv, toCsv } from '@/lib/export/csv';

const SIN = '__sin__';
/** Valor del selector para ver/crear órdenes de gasto suelto (sin proyecto/partida). */
const LIBRE = '__libre__';

const ESTADO_TONE: Record<OcEstado, BadgeTone> = {
  borrador: 'neutral',
  enviada: 'info',
  parcial: 'warning',
  cerrada: 'success',
  cancelada: 'danger',
};
const ESTADO_LABEL: Record<OcEstado, string> = {
  borrador: 'Borrador',
  enviada: 'Enviada',
  parcial: 'Parcial',
  cerrada: 'Cerrada',
  cancelada: 'Cancelada',
};

/** Opción de proveedor para el dropdown (OC.proveedor_id → erp.proveedores). */
type ProveedorOption = { id: string; label: string };

type FetchResult = {
  rows?: OcRow[];
  proyectos?: ProyectoOption[];
  proveedores?: ProveedorOption[];
  partidasByProyecto?: Map<string, PartidaGrupo[]>;
  error?: string;
};

/** Líneas en captura (alta). */
type DraftLinea = {
  key: string;
  partidaId: string;
  descripcion: string;
  unidad: string;
  cantidad: string;
  precio: string;
};

function emptyLinea(): DraftLinea {
  return {
    key: crypto.randomUUID(),
    partidaId: '',
    descripcion: '',
    unidad: '',
    cantidad: '',
    precio: '',
  };
}
function toNum(s: string): number {
  const n = Number(s.trim());
  return Number.isFinite(n) ? n : 0;
}

export function OrdenesCompraModule({ empresaId }: { empresaId: string }) {
  const { permissions } = usePermissions();
  const { data: effectiveUser } = useEffectiveUser();
  const toast = useToast();
  const puedeEscribir =
    permissions.isAdmin || permissions.modulos.get('dilesa.compras.ordenes')?.write === true;
  // Emitir la OC (borrador → enviada) compromete el presupuesto → solo
  // Dirección/admin (D2, iniciativa dilesa-compras-flujo). Editar/crear borrador
  // sigue abierto a quien tiene escritura.
  const esDireccion =
    permissions.isAdmin || (effectiveUser?.direccionEmpresaIds ?? []).includes(empresaId);

  const [rows, setRows] = useState<OcRow[]>([]);
  const [proyectos, setProyectos] = useState<ProyectoOption[]>([]);
  const [proveedores, setProveedores] = useState<ProveedorOption[]>([]);
  const [partidasByProyecto, setPartidasByProyecto] = useState<Map<string, PartidaGrupo[]>>(
    new Map()
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [proyectoFiltro, setProyectoFiltro] = useState('');
  const [estadoFiltro, setEstadoFiltro] = useState<OcEstado | ''>('');
  const [rango, setRango] = useState<DateRange>(EMPTY_DATE_RANGE);

  const [formOpen, setFormOpen] = useState(false);
  const [proveedorId, setProveedorId] = useState('');
  const [lineas, setLineas] = useState<DraftLinea[]>([emptyLinea()]);
  const [submitting, setSubmitting] = useState(false);
  /** OC en edición (solo borrador, quick win S4 — antes: cancelar y recrear). */
  const [editOc, setEditOc] = useState<OcRow | null>(null);

  const [detalle, setDetalle] = useState<OcRow | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [cancelarOcRow, setCancelarOcRow] = useState<OcRow | null>(null);

  // Drill-down (?focus=<oc_id>) desde el hilo del gasto de otros módulos.
  useFocusDrilldown(
    rows,
    (r) => r.id,
    (row) => {
      setDetalle(row);
      setDrawerOpen(true);
    }
  );

  const fetchData = useCallback(async (): Promise<FetchResult> => {
    const sb = createSupabaseBrowserClient();
    const [ocRes, proyectosRes, proveedoresRes, catalogoRes, partidasRes] = await Promise.all([
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (sb.schema('erp') as any)
        .from('ordenes_compra')
        .select(
          'id, codigo, proveedor_id, estado, fecha_entrega, created_at, ordenes_compra_detalle(id, partida_id, descripcion, unidad, cantidad, cantidad_recibida, cantidad_cancelada, precio_unitario, precio_real)'
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
      ocRes.error ??
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

    // Índice de partidas compartido: label, proyecto y optgroups etapa›capítulo (D4).
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
    // OC → proyecto se infiere de la partida de su primera línea (partidaProyecto del índice).
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
        proveedorNombre: o.proveedor_id ? (proveedorLabel.get(o.proveedor_id) ?? '—') : '—',
        estado: (o.estado as OcEstado) ?? 'borrador',
        fecha: o.fecha_entrega ?? o.created_at?.slice(0, 10) ?? null,
        lineas,
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
      // Sin auto-select de proyecto (Sprint 1 `dilesa-compras-operacion`): el
      // módulo arranca en "Todos los proyectos" para que el operador vea TODO el
      // pendiente de entrada, no un solo fraccionamiento. El alta exige elegir
      // proyecto explícitamente.
      setLoading(false);
    });
    return () => {
      activo = false;
    };
  }, [fetchData, apply]);

  // Solo proyectos con presupuesto cargado (partidas) o que ya tienen órdenes.
  // Los fraccionamientos sin partidas (vacíos o cerrados) no estorban el selector.
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
      if (proyectoFiltro === LIBRE) {
        if (r.proyectoId !== null) return false;
      } else if (proyectoFiltro && r.proyectoId !== proyectoFiltro) {
        return false;
      }
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

  // El drawer lee la fila viva: tras una acción (enviar / cerrar) el refetch
  // actualiza `rows` y el detalle abierto refleja el estado nuevo.
  const detalleActual = useMemo(
    () => (detalle ? (rows.find((r) => r.id === detalle.id) ?? detalle) : null),
    [rows, detalle]
  );

  const kpisData = useMemo(() => deriveOcKpis(filtrados), [filtrados]);
  const kpis: ModuleKpi[] = [
    { key: 'total', label: 'Órdenes', value: kpisData.total === 0 ? '—' : String(kpisData.total) },
    {
      key: 'borrador',
      label: 'Borrador',
      value: kpisData.borrador === 0 ? '—' : String(kpisData.borrador),
    },
    {
      key: 'activas',
      label: 'Enviadas',
      value: kpisData.activas === 0 ? '—' : String(kpisData.activas),
    },
    {
      key: 'cerradas',
      label: 'Cerradas',
      value: kpisData.cerradas === 0 ? '—' : String(kpisData.cerradas),
    },
    {
      key: 'comprometido',
      label: 'Comprometido',
      value:
        kpisData.comprometido === 0
          ? '—'
          : formatCurrency(kpisData.comprometido, { compact: true }),
    },
  ];

  const modoLibre = proyectoFiltro === LIBRE;
  const proyectoActivo =
    proyectoFiltro && proyectoFiltro !== SIN && proyectoFiltro !== LIBRE ? proyectoFiltro : '';
  const partidaGrupos = proyectoActivo ? (partidasByProyecto.get(proyectoActivo) ?? []) : [];
  // Alta disponible con un proyecto presupuestado elegido, o en gasto suelto.
  const puedeAlta = modoLibre || proyectoActivo !== '';

  function abrirAlta() {
    setEditOc(null);
    setProveedorId('');
    setLineas([emptyLinea()]);
    setFormOpen(true);
  }

  /** Edición de una OC en borrador: form de alta pre-poblado (S4). */
  function abrirEdicionOc(oc: OcRow) {
    if (oc.estado !== 'borrador') return;
    // OC de gasto suelto (sin proyecto) → modo libre; con proyecto, fija ese
    // proyecto para poblar sus partidas en el form.
    setProyectoFiltro(oc.proyectoId ?? LIBRE);
    setEditOc(oc);
    setProveedorId(oc.proveedorId ?? '');
    setLineas(
      oc.lineas.length > 0
        ? oc.lineas.map((l) => ({
            key: crypto.randomUUID(),
            partidaId: l.partidaId ?? '',
            descripcion: l.descripcion,
            unidad: l.unidad ?? '',
            cantidad: String(l.cantidad),
            precio: String(l.precioUnitario),
          }))
        : [emptyLinea()]
    );
    setDrawerOpen(false);
    setFormOpen(true);
  }

  const draftTotal = useMemo(
    () => lineas.reduce((acc, l) => acc + toNum(l.cantidad) * toNum(l.precio), 0),
    [lineas]
  );
  // Gasto suelto: la línea válida es texto (descripción + cantidad). Con proyecto: partida + cantidad.
  const canSubmit = modoLibre
    ? lineas.some((l) => l.descripcion.trim() !== '' && toNum(l.cantidad) > 0)
    : proyectoActivo !== '' && lineas.some((l) => l.partidaId !== '' && toNum(l.cantidad) > 0);

  async function onSubmit() {
    if (!canSubmit || submitting) return;
    setSubmitting(true);
    const sb = createSupabaseBrowserClient();
    const validas = modoLibre
      ? lineas.filter((l) => l.descripcion.trim() !== '' && toNum(l.cantidad) > 0)
      : lineas.filter((l) => l.partidaId !== '' && toNum(l.cantidad) > 0);
    const total = validas.reduce((acc, l) => acc + toNum(l.cantidad) * toNum(l.precio), 0);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const erp = sb.schema('erp') as any;

    let ocId: string;
    let folio: string;
    if (editOc) {
      // Edición de borrador: actualiza cabecera y REEMPLAZA las líneas
      // (sin recepciones en borrador, el replace es seguro). El filtro
      // .eq('estado','borrador') evita pisar una OC que otro usuario ya envió.
      ocId = editOc.id;
      folio = editOc.codigo;
      const upd = await erp
        .from('ordenes_compra')
        .update({
          proveedor_id: proveedorId || null,
          total,
          updated_at: new Date().toISOString(),
        })
        .eq('id', editOc.id)
        .eq('estado', 'borrador')
        .select('id');
      if (upd.error || (upd.data ?? []).length === 0) {
        toast.add({
          title: 'No se pudo editar',
          description: upd.error
            ? getSupabaseErrorMessage(upd.error, 'Error al actualizar la OC.')
            : 'La orden ya no está en borrador (alguien la envió). Refresca e intenta de nuevo.',
          type: 'error',
        });
        setSubmitting(false);
        return;
      }
      const del = await erp.from('ordenes_compra_detalle').delete().eq('orden_compra_id', ocId);
      if (del.error) {
        toast.add({
          title: 'Error',
          description: getSupabaseErrorMessage(del.error, 'No se pudieron reemplazar las líneas.'),
          type: 'error',
        });
        setSubmitting(false);
        return;
      }
    } else {
      // El folio (OC-{año}-{NNNN}) lo asigna el trigger erp.fn_oc_asignar_folio;
      // el cliente ya no lo genera, se lee de vuelta para el toast.
      const ocResp = await erp
        .from('ordenes_compra')
        .insert({
          empresa_id: empresaId,
          proveedor_id: proveedorId || null,
          estado: 'borrador',
          total,
        })
        .select('id, codigo')
        .single();
      if (ocResp.error || !ocResp.data) {
        toast.add({
          title: 'Error',
          description: getSupabaseErrorMessage(ocResp.error, 'No se pudo crear la OC.'),
          type: 'error',
        });
        setSubmitting(false);
        return;
      }
      ocId = ocResp.data.id as string;
      folio = (ocResp.data.codigo as string) ?? ocId;
    }

    const detalle = validas.map((l) => ({
      empresa_id: empresaId,
      orden_compra_id: ocId,
      partida_id: modoLibre ? null : l.partidaId,
      producto_id: null,
      descripcion: l.descripcion.trim() || null,
      unidad: l.unidad.trim() || null,
      cantidad: toNum(l.cantidad),
      precio_unitario: toNum(l.precio),
      subtotal: toNum(l.cantidad) * toNum(l.precio),
    }));
    const detResp = await erp.from('ordenes_compra_detalle').insert(detalle);
    if (detResp.error) {
      toast.add({
        title: 'Error',
        description: getSupabaseErrorMessage(
          detResp.error,
          editOc ? 'OC actualizada pero faltaron líneas.' : 'OC creada pero faltaron líneas.'
        ),
        type: 'error',
      });
      setSubmitting(false);
      return;
    }
    toast.add({
      title: editOc ? 'Orden actualizada' : 'Orden creada',
      description: folio,
      type: 'success',
    });
    setSubmitting(false);
    setFormOpen(false);
    setEditOc(null);
    void cargar();
  }

  const cambiarEstado = useCallback(
    async (oc: OcRow, estado: OcEstado, okMsg: string) => {
      // Candado de dinero (D2): emitir (→ enviada) solo Dirección/admin.
      if (estado === 'enviada' && !esDireccion) return;
      // Una OC emitida compromete presupuesto y es el documento que va al
      // proveedor (PDF/email, Sprint 2-3 de `dilesa-compras-operacion`): no puede
      // emitirse sin destinatario. Se valida aquí, en el punto de emisión.
      if (estado === 'enviada' && !oc.proveedorId) {
        toast.add({
          title: 'Falta proveedor',
          description: 'Asígnale un proveedor a la orden (edítala) antes de marcarla enviada.',
          type: 'error',
        });
        return;
      }
      const sb = createSupabaseBrowserClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error: e } = await (sb.schema('erp') as any)
        .from('ordenes_compra')
        .update({ estado, updated_at: new Date().toISOString() })
        .eq('id', oc.id);
      if (e) {
        toast.add({
          title: 'Error',
          description: getSupabaseErrorMessage(e, 'No se pudo actualizar.'),
          type: 'error',
        });
        return;
      }
      toast.add({ title: okMsg, description: oc.codigo, type: 'success' });
      void cargar();
    },
    [toast, cargar, esDireccion]
  );

  const cancelar = useCallback(
    async (oc: OcRow, motivo: string): Promise<boolean> => {
      const sb = createSupabaseBrowserClient();
      const ahora = new Date().toISOString();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error: e } = await (sb.schema('erp') as any)
        .from('ordenes_compra')
        .update({
          estado: 'cancelada',
          cancelada_at: ahora,
          motivo_cancelacion: motivo,
          updated_at: ahora,
        })
        .eq('id', oc.id);
      if (e) {
        toast.add({
          title: 'Error',
          description: getSupabaseErrorMessage(e, 'No se pudo cancelar.'),
          type: 'error',
        });
        return false;
      }
      toast.add({ title: 'Orden cancelada', description: oc.codigo, type: 'success' });
      void cargar();
      return true;
    },
    [toast, cargar]
  );

  const cerrar = useCallback(
    async (oc: OcRow) => {
      const sb = createSupabaseBrowserClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error: e } = await (sb.schema('erp') as any).rpc('oc_cerrar_orden', {
        p_orden_id: oc.id,
        p_motivo: 'Cierre manual desde Compras DILESA',
      });
      if (e) {
        toast.add({
          title: 'Error',
          description: getSupabaseErrorMessage(e, 'No se pudo cerrar.'),
          type: 'error',
        });
        return;
      }
      toast.add({ title: 'Orden cerrada', description: oc.codigo, type: 'success' });
      void cargar();
    },
    [toast, cargar]
  );

  const exportarCsv = useCallback(() => {
    const headers = ['Folio', 'Proyecto', 'Proveedor', 'Estado', 'Líneas', 'Total', 'Fecha'];
    const filas = filtrados.map((r) => [
      r.codigo,
      r.proyectoNombre || 'Gasto suelto',
      r.proveedorNombre,
      ESTADO_LABEL[r.estado],
      r.lineas.length,
      ocTotal(r),
      r.fecha ?? '',
    ]);
    downloadCsv(`ordenes-compra-${new Date().toISOString().slice(0, 10)}`, toCsv(headers, filas));
  }, [filtrados]);

  const columns: Column<OcRow>[] = [
    { key: 'codigo', label: 'Folio', type: 'text', sticky: true, width: 'min-w-[120px]' },
    {
      key: 'proyectoNombre',
      label: 'Proyecto',
      type: 'text',
      width: 'min-w-[160px]',
      render: (r) => r.proyectoNombre || 'Gasto suelto',
    },
    { key: 'proveedorNombre', label: 'Proveedor', type: 'text', width: 'min-w-[200px]' },
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
      key: 'total',
      label: 'Total',
      type: 'custom',
      align: 'right',
      accessor: (r) => ocTotal(r),
      render: (r) => formatCurrency(ocTotal(r)),
    },
    { key: 'fecha', label: 'Fecha', type: 'text', render: (r) => r.fecha || '—' },
    ...(puedeEscribir
      ? [
          {
            key: 'acciones',
            label: '',
            type: 'custom' as const,
            sortable: false,
            align: 'right' as const,
            width: 'w-12',
            render: (r: OcRow) => (
              <RowActions
                ariaLabel={`Acciones para ${r.codigo}`}
                onDelete={
                  r.estado === 'borrador' || r.estado === 'enviada'
                    ? {
                        onConfirm: async (motivo) => {
                          await cancelar(r, motivo ?? '');
                        },
                        label: 'Cancelar OC',
                        confirmTitle: `¿Cancelar ${r.codigo}?`,
                        confirmDescription:
                          'La orden quedará cancelada y dejará de comprometer presupuesto.',
                        confirmLabel: 'Cancelar OC',
                        requireMotivo: true,
                      }
                    : undefined
                }
              >
                {r.estado === 'borrador' ? (
                  <>
                    <button
                      type="button"
                      onClick={() => abrirEdicionOc(r)}
                      className="flex w-full items-center gap-2 px-2 py-1.5 text-left text-sm hover:bg-[var(--card)]"
                    >
                      <Pencil className="h-3.5 w-3.5" /> Editar borrador
                    </button>
                    {esDireccion ? (
                      <button
                        type="button"
                        onClick={() => void cambiarEstado(r, 'enviada', 'Orden enviada')}
                        className="flex w-full items-center gap-2 px-2 py-1.5 text-left text-sm hover:bg-[var(--card)]"
                      >
                        <Send className="h-3.5 w-3.5" /> Marcar enviada
                      </button>
                    ) : null}
                  </>
                ) : null}
                {r.estado === 'enviada' || r.estado === 'parcial' ? (
                  <button
                    type="button"
                    onClick={() => void cerrar(r)}
                    className="flex w-full items-center gap-2 px-2 py-1.5 text-left text-sm hover:bg-[var(--card)]"
                  >
                    <X className="h-3.5 w-3.5" /> Cerrar orden
                  </button>
                ) : null}
              </RowActions>
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
          <h1 className="text-2xl font-semibold tracking-tight text-[var(--text)]">
            Órdenes de compra
          </h1>
          <p className="text-sm text-[var(--text)]/60">
            Órdenes ancladas a concepto + partida del presupuesto. Al enviarse comprometen el
            presupuesto de la partida; la recepción (ejercido) vive en el tab Recepciones.
          </p>
        </div>
      </header>

      <ModuleKpiStrip stats={kpis} cols={5} />

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
          <option value={LIBRE}>Gasto suelto (sin proyecto)</option>
        </select>
        <select
          value={estadoFiltro}
          onChange={(e) => setEstadoFiltro(e.target.value as OcEstado | '')}
          className="h-9 rounded-md border border-[var(--border)] bg-[var(--card)] px-3 text-sm font-medium text-[var(--text)]"
          aria-label="Estado"
        >
          <option value="">Todos los estados</option>
          <option value="borrador">Borrador</option>
          <option value="enviada">Enviada</option>
          <option value="parcial">Parcial</option>
          <option value="cerrada">Cerrada</option>
          <option value="cancelada">Cancelada</option>
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
            {filtrados.length} de {rows.length} órdenes
          </span>
          {puedeEscribir ? (
            <button
              type="button"
              onClick={abrirAlta}
              disabled={!puedeAlta}
              title={!puedeAlta ? 'Elige un proyecto con presupuesto o “Gasto suelto”' : undefined}
              className="inline-flex h-9 items-center gap-1.5 rounded-md bg-[var(--accent)] px-3 text-sm font-medium text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Plus className="h-3.5 w-3.5" /> Nueva orden
            </button>
          ) : null}
        </div>
      </div>

      {formOpen ? (
        <div className="rounded-md border border-[var(--border)] bg-[var(--card)] p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-medium uppercase tracking-wider text-[var(--text)]/60">
              {editOc ? `Editar orden · ${editOc.codigo}` : 'Nueva orden'} ·{' '}
              {modoLibre
                ? 'Gasto suelto'
                : (proyectosPresentes.find((p) => p.id === proyectoActivo)?.nombre ?? 'Proyecto')}
            </h2>
            <select
              value={proveedorId}
              onChange={(e) => setProveedorId(e.target.value)}
              className="h-9 w-72 rounded-md border border-[var(--border)] bg-[var(--bg)] px-3 text-sm text-[var(--text)]"
            >
              <option value="">Proveedor — Por definir</option>
              {proveedores.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            {lineas.map((l, idx) => (
              <div key={l.key} className="flex flex-wrap items-center gap-2">
                {!modoLibre ? (
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
                ) : null}
                <Input
                  value={l.descripcion}
                  onChange={(e) =>
                    setLineas((prev) =>
                      prev.map((x) => (x.key === l.key ? { ...x, descripcion: e.target.value } : x))
                    )
                  }
                  placeholder={modoLibre ? '¿Qué se compra?' : 'Detalle (opcional)'}
                  className={modoLibre ? 'min-w-[260px] flex-1' : 'w-44'}
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
                <Input
                  value={l.precio}
                  onChange={(e) =>
                    setLineas((prev) =>
                      prev.map((x) => (x.key === l.key ? { ...x, precio: e.target.value } : x))
                    )
                  }
                  type="number"
                  step="0.01"
                  placeholder="P. unit. (c/IVA)"
                  className="w-32"
                />
                <span className="w-28 text-right text-sm tabular-nums text-[var(--text)]/70">
                  {formatCurrency(toNum(l.cantidad) * toNum(l.precio))}
                </span>
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

          <div className="mt-3 flex items-center justify-between">
            <button
              type="button"
              onClick={() => setLineas((prev) => [...prev, emptyLinea()])}
              className="inline-flex items-center gap-1.5 rounded-md border border-[var(--border)] px-3 py-1.5 text-sm text-[var(--text)]/70 hover:text-[var(--text)]"
            >
              <Plus className="h-3.5 w-3.5" /> Agregar línea
            </button>
            <span className="text-sm font-medium text-[var(--text)]">
              Total: {formatCurrency(draftTotal)}
            </span>
          </div>

          <div className="mt-3 flex items-center justify-end gap-2">
            <Button variant="outline" onClick={() => setFormOpen(false)} disabled={submitting}>
              Cancelar
            </Button>
            <Button onClick={onSubmit} disabled={!canSubmit || submitting}>
              {submitting ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Plus className="size-4" />
              )}
              {editOc ? 'Guardar cambios' : 'Crear orden (borrador)'}
            </Button>
          </div>
        </div>
      ) : null}

      <DataTable
        data={filtrados}
        columns={columns}
        rowKey="id"
        loading={loading}
        error={error}
        onRetry={() => void cargar()}
        onRowClick={(r) => {
          setDetalle(r);
          setDrawerOpen(true);
        }}
        initialSort={{ key: 'fecha', dir: 'desc' }}
        emptyTitle="Sin órdenes"
        emptyDescription="No hay órdenes de compra que coincidan. Crea una con “Nueva orden”."
        emptyIcon={<Coins className="h-6 w-6" />}
        maxHeight="calc(100vh - 320px)"
      />

      <OcDetalleDrawer
        oc={detalleActual}
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        puedeEscribir={puedeEscribir}
        esDireccion={esDireccion}
        onEditar={(r) => {
          setDrawerOpen(false);
          abrirEdicionOc(r);
        }}
        onMarcarEnviada={(r) => void cambiarEstado(r, 'enviada', 'Orden enviada')}
        onCerrarOrden={(r) => void cerrar(r)}
        onCancelar={(r) => setCancelarOcRow(r)}
      />

      {cancelarOcRow ? (
        <CancelarConMotivoDialog
          key={cancelarOcRow.id}
          title={`¿Cancelar ${cancelarOcRow.codigo}?`}
          description="La orden quedará cancelada y dejará de comprometer presupuesto."
          confirmLabel="Cancelar OC"
          onClose={() => setCancelarOcRow(null)}
          onConfirm={async (motivo) => {
            const ok = await cancelar(cancelarOcRow, motivo);
            if (ok) setDrawerOpen(false);
          }}
        />
      ) : null}
    </div>
  );
}

/**
 * Drawer de detalle de la OC (nuevo en Sprint 1 de `dilesa-flujo-gasto`):
 * antes la OC solo existía como fila con acciones — el detalle (líneas) y el
 * hilo del gasto (incluida la bidireccionalidad OC → facturas/pagos, que
 * aporta el stepper con sus refs) no eran visibles desde ningún lado.
 *
 * El footer expone el set completo de acciones del documento (ADR-044): las
 * mismas del menú ⋯ de la fila, con los mismos gates de permiso y estado.
 */
function OcDetalleDrawer({
  oc,
  open,
  onClose,
  puedeEscribir,
  esDireccion,
  onEditar,
  onMarcarEnviada,
  onCerrarOrden,
  onCancelar,
}: {
  oc: OcRow | null;
  open: boolean;
  onClose: () => void;
  puedeEscribir: boolean;
  esDireccion: boolean;
  onEditar: (oc: OcRow) => void;
  onMarcarEnviada: (oc: OcRow) => void;
  onCerrarOrden: (oc: OcRow) => void;
  onCancelar: (oc: OcRow) => void;
}) {
  const conAcciones =
    !!oc &&
    puedeEscribir &&
    (oc.estado === 'borrador' || oc.estado === 'enviada' || oc.estado === 'parcial');
  return (
    <DetailDrawer
      open={open}
      onOpenChange={(v) => !v && onClose()}
      size="lg"
      title={oc?.codigo ?? 'Orden de compra'}
      description={
        oc ? [oc.proveedorNombre, oc.proyectoNombre].filter(Boolean).join(' · ') : undefined
      }
      meta={oc ? <Badge tone={ESTADO_TONE[oc.estado]}>{ESTADO_LABEL[oc.estado]}</Badge> : null}
      footer={
        conAcciones ? (
          <div className="flex flex-wrap items-center gap-2">
            {oc.estado === 'borrador' ? (
              <>
                <Button variant="outline" onClick={() => onEditar(oc)}>
                  <Pencil className="size-4" /> Editar borrador
                </Button>
                {esDireccion ? (
                  <Button onClick={() => onMarcarEnviada(oc)}>
                    <Send className="size-4" /> Marcar enviada
                  </Button>
                ) : null}
              </>
            ) : null}
            {oc.estado === 'enviada' || oc.estado === 'parcial' ? (
              <Button variant="outline" onClick={() => onCerrarOrden(oc)}>
                <X className="size-4" /> Cerrar orden
              </Button>
            ) : null}
            {oc.estado === 'borrador' || oc.estado === 'enviada' ? (
              <Button
                variant="ghost"
                className="ml-auto text-[var(--text)]/60 hover:text-red-600"
                onClick={() => onCancelar(oc)}
              >
                <Trash2 className="size-4" /> Cancelar OC
              </Button>
            ) : null}
          </div>
        ) : null
      }
    >
      <DetailDrawerContent>
        {!oc ? null : (
          <>
            <DetailDrawerSection title="Hilo del gasto" divider={false}>
              <HiloGastoStepper empresa="dilesa" documento={{ tipo: 'oc', id: oc.id }} />
            </DetailDrawerSection>

            <DetailDrawerSection title={`Líneas (${oc.lineas.length})`}>
              <div className="space-y-1.5 text-sm">
                {oc.lineas.map((l) => (
                  <div
                    key={l.id}
                    className="flex items-baseline justify-between gap-3 border-b border-[var(--border)]/60 pb-1.5 last:border-0"
                  >
                    <div className="min-w-0">
                      <div className="truncate font-medium text-[var(--text)]">
                        {l.partidaLabel}
                      </div>
                      <div className="truncate text-xs text-[var(--text)]/55">
                        {[l.descripcion, l.unidad].filter(Boolean).join(' · ') || '—'}
                      </div>
                    </div>
                    <div className="shrink-0 text-right">
                      <div className="tabular-nums text-[var(--text)]">
                        {formatCurrency(lineaTotal(l))}
                      </div>
                      <div className="text-xs tabular-nums text-[var(--text)]/55">
                        {l.cantidadRecibida} / {l.cantidad} recibido
                      </div>
                    </div>
                  </div>
                ))}
                <div className="flex items-center justify-between pt-1 font-semibold text-[var(--text)]">
                  <span>Total</span>
                  <span className="tabular-nums">{formatCurrency(ocTotal(oc))}</span>
                </div>
              </div>
            </DetailDrawerSection>
          </>
        )}
      </DetailDrawerContent>
    </DetailDrawer>
  );
}
