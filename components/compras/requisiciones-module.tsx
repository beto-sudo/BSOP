'use client';

/**
 * RequisicionesModule — alta y gestión de requisiciones de compra (DILESA).
 *
 * Iniciativa `dilesa-compras` · Sprint 2 Fase D. Tab "Requisiciones" del hub
 * Compras. La requisición es la **solicitud** que abre el ciclo P2P: se captura
 * lo que se necesita anclado a una **partida** del presupuesto (D7/D12,
 * `producto_id` null, sin inventario), se autoriza, y de ahí se **genera la OC**
 * con un clic.
 *
 * El valor central es "Generar OC": copia `partida_id` de
 * `requisiciones_detalle` → `ordenes_compra_detalle` (lo que el `generarOrdenCompra`
 * de RDB **no** hace, riesgo F3) — sin eso la OC generada no comprometería
 * presupuesto. La OC nace en `borrador` y de ahí sigue su flujo en el tab Órdenes.
 *
 * Estado sin catálogo (ver `lib/compras/requisiciones.ts`): se deriva de
 * `autorizada_at` + la OC ligada. Un proyecto a la vez (como Costeo/Órdenes).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ClipboardList,
  Loader2,
  Plus,
  RefreshCw,
  Search,
  ShoppingCart,
  Trash2,
} from 'lucide-react';
import { createSupabaseBrowserClient } from '@/lib/supabase-browser';
import { DataTable, ModuleKpiStrip, type Column, type ModuleKpi } from '@/components/module-page';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge, type BadgeTone } from '@/components/ui/badge';
import { RowActions } from '@/components/shared/row-actions';
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
  deriveReqEstado,
  deriveReqKpis,
  puedeGenerarOc,
  reqTotal,
  type ReqEstado,
  type ReqLinea,
  type ReqRow,
} from '@/lib/compras/requisiciones';

const SIN = '__sin__';
/** Valor del selector para capturar una requisición libre (gasto suelto sin proyecto). */
const LIBRE = '__libre__';

const ESTADO_TONE: Record<ReqEstado, BadgeTone> = {
  pendiente: 'neutral',
  autorizada: 'info',
  con_oc: 'success',
};
const ESTADO_LABEL: Record<ReqEstado, string> = {
  pendiente: 'Pendiente',
  autorizada: 'Autorizada',
  con_oc: 'Con orden',
};

type FetchResult = {
  rows?: ReqRow[];
  proyectos?: ProyectoOption[];
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

export function RequisicionesModule({ empresaId }: { empresaId: string }) {
  const { permissions } = usePermissions();
  const toast = useToast();
  const puedeEscribir =
    permissions.isAdmin || permissions.modulos.get('dilesa.compras.requisiciones')?.write === true;

  const [rows, setRows] = useState<ReqRow[]>([]);
  const [proyectos, setProyectos] = useState<ProyectoOption[]>([]);
  const [partidasByProyecto, setPartidasByProyecto] = useState<Map<string, PartidaGrupo[]>>(
    new Map()
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [proyectoFiltro, setProyectoFiltro] = useState('');
  const autoSelectDone = useRef(false);

  const [formOpen, setFormOpen] = useState(false);
  const [justificacion, setJustificacion] = useState('');
  const [lineas, setLineas] = useState<DraftLinea[]>([emptyLinea()]);
  const [submitting, setSubmitting] = useState(false);
  const [accionId, setAccionId] = useState<string | null>(null);

  const fetchData = useCallback(async (): Promise<FetchResult> => {
    const sb = createSupabaseBrowserClient();
    const [reqRes, proyectosRes, catalogoRes, partidasRes, ocRes, usuariosRes] = await Promise.all([
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (sb.schema('erp') as any)
        .from('requisiciones')
        .select(
          'id, codigo, solicitante_id, autorizada_at, created_at, justificacion, requisiciones_detalle(id, partida_id, descripcion, unidad, cantidad, precio_estimado)'
        )
        .eq('empresa_id', empresaId)
        .is('deleted_at', null),
      sb
        .schema('dilesa')
        .from('proyectos')
        .select('id, nombre, tipo, proyecto_predecesor_id')
        .eq('empresa_id', empresaId)
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
      // OCs ligadas a una requisición y no canceladas → la requisición está "con orden".
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (sb.schema('erp') as any)
        .from('ordenes_compra')
        .select('requisicion_id, codigo, estado')
        .eq('empresa_id', empresaId)
        .not('requisicion_id', 'is', null)
        .neq('estado', 'cancelada')
        .is('deleted_at', null),
      // Best-effort: nombre del solicitante (cross-schema erp→core, sin embed).
      sb.schema('core').from('usuarios').select('id, first_name, email'),
    ]);

    const firstErr =
      reqRes.error ?? proyectosRes.error ?? catalogoRes.error ?? partidasRes.error ?? ocRes.error;
    if (firstErr) return { error: getSupabaseErrorMessage(firstErr, 'No se pudo cargar.') };

    const proyectoMap = new Map<string, string>();
    for (const p of proyectosRes.data ?? []) proyectoMap.set(p.id as string, p.nombre as string);
    const proyectos = buildProyectoOptions(
      (proyectosRes.data ?? []) as unknown as ProyectoSelectorRow[]
    );

    // Índice de partidas (label, proyecto, optgroups) — compartido (D4).
    const { partidaLabel, partidaProyecto, gruposByProyecto } = buildPartidaIndex(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (partidasRes.data ?? []) as any[],
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (catalogoRes.data ?? []) as any[]
    );

    type OcLink = { requisicion_id: string | null; codigo: string | null; estado: string };
    const ocByReq = new Map<string, string>();
    for (const o of (ocRes.data ?? []) as OcLink[]) {
      if (o.requisicion_id && !ocByReq.has(o.requisicion_id)) {
        ocByReq.set(o.requisicion_id, o.codigo ?? '—');
      }
    }

    type UsuarioRaw = { id: string; first_name: string | null; email: string | null };
    const userName = new Map<string, string>();
    for (const u of (usuariosRes.data ?? []) as unknown as UsuarioRaw[]) {
      userName.set(u.id, u.first_name?.trim() || u.email?.split('@')[0] || '—');
    }

    type ReqRaw = {
      id: string;
      codigo: string | null;
      solicitante_id: string | null;
      autorizada_at: string | null;
      created_at: string;
      justificacion: string | null;
      requisiciones_detalle: Array<{
        id: string;
        partida_id: string | null;
        descripcion: string | null;
        unidad: string | null;
        cantidad: number | null;
        precio_estimado: number | null;
      }> | null;
    };
    const out: ReqRow[] = ((reqRes.data ?? []) as ReqRaw[]).map((r) => {
      const lineas: ReqLinea[] = (r.requisiciones_detalle ?? []).map((d) => ({
        id: d.id,
        partidaId: d.partida_id,
        partidaLabel: d.partida_id ? (partidaLabel.get(d.partida_id) ?? '—') : '—',
        descripcion: d.descripcion ?? '',
        unidad: d.unidad,
        cantidad: Number(d.cantidad ?? 0),
        precioEstimado: Number(d.precio_estimado ?? 0),
      }));
      const proyectoId =
        lineas
          .map((l) => l.partidaId)
          .filter(Boolean)
          .map((pid) => partidaProyecto.get(pid!))[0] ?? null;
      return {
        id: r.id,
        codigo: r.codigo ?? '—',
        proyectoId,
        proyectoNombre: proyectoId ? (proyectoMap.get(proyectoId) ?? '') : '',
        solicitanteNombre: r.solicitante_id ? (userName.get(r.solicitante_id) ?? '—') : '—',
        autorizadaAt: r.autorizada_at,
        ocCodigo: ocByReq.get(r.id) ?? null,
        fecha: r.created_at?.slice(0, 10) ?? null,
        justificacion: r.justificacion,
        lineas,
      };
    });

    return { rows: out, proyectos, partidasByProyecto: gruposByProyecto };
  }, [empresaId]);

  const apply = useCallback((res: FetchResult) => {
    if (res.error) {
      setError(res.error);
      setRows([]);
    } else {
      setError(null);
      setRows(res.rows ?? []);
      setProyectos(res.proyectos ?? []);
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
        const first = (res.rows ?? [])
          .filter((r) => r.proyectoId)
          .sort((a, b) => a.proyectoNombre.localeCompare(b.proyectoNombre))[0];
        const firstByPartida = [...(res.partidasByProyecto ?? new Map()).keys()][0];
        const pid = first?.proyectoId ?? firstByPartida ?? '';
        if (pid) setProyectoFiltro(pid);
        autoSelectDone.current = true;
      }
      setLoading(false);
    });
    return () => {
      activo = false;
    };
  }, [fetchData, apply]);

  // Solo proyectos con presupuesto cargado (partidas) o que ya tienen requisiciones.
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
      if (q) {
        const hay =
          r.codigo.toLowerCase().includes(q) ||
          r.solicitanteNombre.toLowerCase().includes(q) ||
          r.lineas.some((l) => l.partidaLabel.toLowerCase().includes(q));
        if (!hay) return false;
      }
      return true;
    });
  }, [rows, q, proyectoFiltro]);

  const kpisData = useMemo(() => deriveReqKpis(filtrados), [filtrados]);
  const kpis: ModuleKpi[] = [
    {
      key: 'total',
      label: 'Requisiciones',
      value: kpisData.total === 0 ? '—' : String(kpisData.total),
    },
    {
      key: 'pendientes',
      label: 'Pendientes',
      value: kpisData.pendientes === 0 ? '—' : String(kpisData.pendientes),
    },
    {
      key: 'autorizadas',
      label: 'Autorizadas',
      value: kpisData.autorizadas === 0 ? '—' : String(kpisData.autorizadas),
    },
    {
      key: 'conOc',
      label: 'Con orden',
      value: kpisData.conOc === 0 ? '—' : String(kpisData.conOc),
    },
    {
      key: 'estimado',
      label: 'Estimado por comprar',
      value: kpisData.estimado === 0 ? '—' : formatCurrency(kpisData.estimado, { compact: true }),
    },
  ];

  const modoLibre = proyectoFiltro === LIBRE;
  const proyectoActivo =
    proyectoFiltro && proyectoFiltro !== SIN && proyectoFiltro !== LIBRE ? proyectoFiltro : '';
  const partidaGrupos = proyectoActivo ? (partidasByProyecto.get(proyectoActivo) ?? []) : [];
  // Alta disponible con un proyecto presupuestado elegido, o en modo gasto suelto.
  const puedeAlta = modoLibre || proyectoActivo !== '';

  function abrirAlta() {
    setJustificacion('');
    setLineas([emptyLinea()]);
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
    const { data: auth } = await sb.auth.getUser();
    const validas = modoLibre
      ? lineas.filter((l) => l.descripcion.trim() !== '' && toNum(l.cantidad) > 0)
      : lineas.filter((l) => l.partidaId !== '' && toNum(l.cantidad) > 0);
    const folio = `REQ-${Date.now().toString(36).toUpperCase()}`;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const reqResp = await (sb.schema('erp') as any)
      .from('requisiciones')
      .insert({
        empresa_id: empresaId,
        codigo: folio,
        solicitante_id: auth?.user?.id ?? null,
        justificacion: justificacion.trim() || null,
      })
      .select('id')
      .single();
    if (reqResp.error || !reqResp.data) {
      toast.add({
        title: 'Error',
        description: getSupabaseErrorMessage(reqResp.error, 'No se pudo crear la requisición.'),
        type: 'error',
      });
      setSubmitting(false);
      return;
    }
    const reqId = reqResp.data.id as string;
    const detalle = validas.map((l) => ({
      empresa_id: empresaId,
      requisicion_id: reqId,
      partida_id: modoLibre ? null : l.partidaId,
      producto_id: null,
      descripcion: l.descripcion.trim() || null,
      unidad: l.unidad.trim() || null,
      cantidad: toNum(l.cantidad),
      precio_estimado: toNum(l.precio) || null,
    }));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const detResp = await (sb.schema('erp') as any).from('requisiciones_detalle').insert(detalle);
    if (detResp.error) {
      toast.add({
        title: 'Error',
        description: getSupabaseErrorMessage(
          detResp.error,
          'Requisición creada pero faltaron líneas.'
        ),
        type: 'error',
      });
      setSubmitting(false);
      return;
    }
    toast.add({ title: 'Requisición creada', description: folio, type: 'success' });
    setSubmitting(false);
    setFormOpen(false);
    void cargar();
  }

  const autorizar = useCallback(
    async (req: ReqRow) => {
      setAccionId(req.id);
      const sb = createSupabaseBrowserClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error: e } = await (sb.schema('erp') as any)
        .from('requisiciones')
        .update({ autorizada_at: new Date().toISOString() })
        .eq('id', req.id);
      setAccionId(null);
      if (e) {
        toast.add({
          title: 'Error',
          description: getSupabaseErrorMessage(e, 'No se pudo autorizar.'),
          type: 'error',
        });
        return;
      }
      toast.add({ title: 'Requisición autorizada', description: req.codigo, type: 'success' });
      void cargar();
    },
    [toast, cargar]
  );

  const cancelar = useCallback(
    async (req: ReqRow) => {
      const sb = createSupabaseBrowserClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error: e } = await (sb.schema('erp') as any)
        .from('requisiciones')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', req.id);
      if (e) {
        toast.add({
          title: 'Error',
          description: getSupabaseErrorMessage(e, 'No se pudo cancelar.'),
          type: 'error',
        });
        return;
      }
      toast.add({ title: 'Requisición cancelada', description: req.codigo, type: 'success' });
      void cargar();
    },
    [toast, cargar]
  );

  /**
   * Genera la OC desde la requisición. **Copia `partida_id`** de cada línea
   * (fix del riesgo F3 de RDB) para que la OC comprometa presupuesto. La OC nace
   * en `borrador`; el precio estimado de la requisición prellena `precio_unitario`.
   * Marca la requisición como autorizada (convertida).
   */
  const generarOC = useCallback(
    async (req: ReqRow) => {
      if (!puedeGenerarOc(req) || accionId === req.id) return;
      setAccionId(req.id);
      const sb = createSupabaseBrowserClient();
      const folio = `OC-${Date.now().toString(36).toUpperCase()}`;
      // Partida opcional: gasto suelto genera OC sin partida (no compromete presupuesto).
      const validas = req.lineas.filter((l) => l.cantidad > 0);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const ocResp = await (sb.schema('erp') as any)
        .from('ordenes_compra')
        .insert({
          empresa_id: empresaId,
          codigo: folio,
          requisicion_id: req.id,
          proveedor_id: null,
          estado: 'borrador',
          total: validas.reduce((acc, l) => acc + l.cantidad * l.precioEstimado, 0),
        })
        .select('id')
        .single();
      if (ocResp.error || !ocResp.data) {
        setAccionId(null);
        toast.add({
          title: 'Error',
          description: getSupabaseErrorMessage(ocResp.error, 'No se pudo generar la orden.'),
          type: 'error',
        });
        return;
      }
      const ocId = ocResp.data.id as string;
      const detalle = validas.map((l) => ({
        empresa_id: empresaId,
        orden_compra_id: ocId,
        partida_id: l.partidaId, // ← el fix F3: la OC hereda la partida → compromete presupuesto.
        producto_id: null,
        descripcion: l.descripcion.trim() || null,
        unidad: l.unidad,
        cantidad: l.cantidad,
        precio_unitario: l.precioEstimado,
        subtotal: l.cantidad * l.precioEstimado,
      }));
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const detResp = await (sb.schema('erp') as any)
        .from('ordenes_compra_detalle')
        .insert(detalle);
      if (detResp.error) {
        setAccionId(null);
        toast.add({
          title: 'Error',
          description: getSupabaseErrorMessage(detResp.error, 'OC creada pero faltaron líneas.'),
          type: 'error',
        });
        void cargar();
        return;
      }
      // Marca la requisición como autorizada/convertida.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (sb.schema('erp') as any)
        .from('requisiciones')
        .update({ autorizada_at: new Date().toISOString() })
        .eq('id', req.id);
      setAccionId(null);
      toast.add({
        title: 'Orden generada',
        description: `${folio} · desde ${req.codigo}`,
        type: 'success',
      });
      void cargar();
    },
    [empresaId, accionId, toast, cargar]
  );

  const columns: Column<ReqRow>[] = [
    { key: 'codigo', label: 'Folio', type: 'text', sticky: true, width: 'min-w-[120px]' },
    { key: 'solicitanteNombre', label: 'Solicitante', type: 'text', width: 'min-w-[160px]' },
    {
      key: 'estado',
      label: 'Estado',
      type: 'custom',
      accessor: (r) => deriveReqEstado(r),
      render: (r) => {
        const e = deriveReqEstado(r);
        return <Badge tone={ESTADO_TONE[e]}>{ESTADO_LABEL[e]}</Badge>;
      },
    },
    { key: 'ocCodigo', label: 'Orden', type: 'text', render: (r) => r.ocCodigo || '—' },
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
      label: 'Estimado',
      type: 'custom',
      align: 'right',
      accessor: (r) => reqTotal(r),
      render: (r) => formatCurrency(reqTotal(r)),
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
            render: (r: ReqRow) => {
              const estado = deriveReqEstado(r);
              return (
                <RowActions
                  ariaLabel={`Acciones para ${r.codigo}`}
                  onDelete={
                    estado !== 'con_oc'
                      ? {
                          onConfirm: () => cancelar(r),
                          label: 'Cancelar requisición',
                          confirmTitle: `¿Cancelar ${r.codigo}?`,
                          confirmDescription: 'La requisición quedará cancelada (borrado suave).',
                          confirmLabel: 'Cancelar requisición',
                        }
                      : undefined
                  }
                >
                  {estado === 'pendiente' ? (
                    <button
                      type="button"
                      onClick={() => void autorizar(r)}
                      disabled={accionId === r.id}
                      className="flex w-full items-center gap-2 px-2 py-1.5 text-left text-sm hover:bg-[var(--card)] disabled:opacity-50"
                    >
                      <ClipboardList className="h-3.5 w-3.5" /> Marcar autorizada
                    </button>
                  ) : null}
                  {puedeGenerarOc(r) ? (
                    <button
                      type="button"
                      onClick={() => void generarOC(r)}
                      disabled={accionId === r.id}
                      className="flex w-full items-center gap-2 px-2 py-1.5 text-left text-sm hover:bg-[var(--card)] disabled:opacity-50"
                    >
                      <ShoppingCart className="h-3.5 w-3.5" /> Generar orden de compra
                    </button>
                  ) : null}
                </RowActions>
              );
            },
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
          <h1 className="text-2xl font-semibold tracking-tight text-[var(--text)]">
            Requisiciones
          </h1>
          <p className="text-sm text-[var(--text)]/60">
            Solicitudes de compra ancladas a concepto + partida del presupuesto. Al autorizarse se
            generan en órdenes de compra con un clic (heredan la partida, comprometen presupuesto).
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
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text)]/40" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar folio, solicitante o partida…"
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
            {filtrados.length} de {rows.length} requisiciones
          </span>
          {puedeEscribir ? (
            <button
              type="button"
              onClick={abrirAlta}
              disabled={!puedeAlta}
              title={
                !puedeAlta ? 'Elige un fraccionamiento con presupuesto o “Gasto suelto”' : undefined
              }
              className="inline-flex h-9 items-center gap-1.5 rounded-md bg-[var(--accent)] px-3 text-sm font-medium text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Plus className="h-3.5 w-3.5" /> Nueva requisición
            </button>
          ) : null}
        </div>
      </div>

      {formOpen ? (
        <div className="rounded-md border border-[var(--border)] bg-[var(--card)] p-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 className="text-sm font-medium uppercase tracking-wider text-[var(--text)]/60">
              Nueva requisición ·{' '}
              {modoLibre
                ? 'Gasto suelto'
                : (proyectosPresentes.find((p) => p.id === proyectoActivo)?.nombre ?? 'Proyecto')}
            </h2>
            <Input
              value={justificacion}
              onChange={(e) => setJustificacion(e.target.value)}
              placeholder="Justificación (opcional)"
              className="w-80"
            />
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
                  placeholder={modoLibre ? '¿Qué se requiere?' : 'Detalle (opcional)'}
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
                  placeholder="P. est. (c/IVA)"
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
              Total estimado: {formatCurrency(draftTotal)}
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
              Crear requisición
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
        initialSort={{ key: 'fecha', dir: 'desc' }}
        emptyTitle="Sin requisiciones"
        emptyDescription="No hay requisiciones que coincidan. Crea una con “Nueva requisición”."
        emptyIcon={<ClipboardList className="h-6 w-6" />}
        maxHeight="calc(100vh - 320px)"
      />
    </div>
  );
}
