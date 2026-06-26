'use client';

/**
 * CxP · Facturas — módulo compartido cross-empresa (ADR-011, SM1-SM6).
 *
 * Lista las facturas de egreso (`erp.facturas` con `flujo='egreso'`) con
 * <DataTable> (ADR-010): proveedor, folio fiscal, fechas, total, saldo,
 * estado (badge) y OC enlazada. Filtros con `useUrlFilters` (ADR-007):
 * búsqueda de proveedor, estado, rango de fecha de emisión. Header con
 * "Cargar XML" (dispara el endpoint de Sprint 2 con 1..N archivos, URL
 * por empresa: `/api/<empresa>/cxp/facturas/upload-xml`).
 *
 * El drawer de detalle (`<DetailDrawer>`, ADR-018/026) muestra cabecera,
 * montos con retenciones, OC enlazada, pagos aplicados
 * (`erp.cxp_pago_aplicaciones`) y el link al XML adjunto.
 *
 * Parametrizado por `empresa` (slug) + `empresaId` (UUID). RDB y DILESA
 * lo reusan con pages delgados (SM1). El uploader y la URL de la OC se
 * derivan del slug; las queries filtran por `empresaId`.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Ban,
  BookText,
  Check,
  Copy,
  FileUp,
  Link2,
  RefreshCw,
  Search,
  Upload,
  Wallet,
} from 'lucide-react';

import {
  ModuleFilters,
  ModuleContent,
  ErrorBanner,
  ActiveFiltersChip,
  DataTable,
  type Column,
} from '@/components/module-page';
import { DesktopOnlyNotice } from '@/components/responsive';
import { DetailDrawer, DetailDrawerContent } from '@/components/detail-page';
import { CancelarConMotivoDialog } from '@/components/shared/cancelar-con-motivo-dialog';
import { usePermissions } from '@/components/providers';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Combobox, type ComboboxOption } from '@/components/ui/combobox';
import { Separator } from '@/components/ui/separator';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useActionFeedback } from '@/hooks/use-action-feedback';
import { useUrlFilters } from '@/hooks/use-url-filters';
import { createSupabaseBrowserClient } from '@/lib/supabase-browser';
import { getSupabaseErrorMessage } from '@/lib/supabase-error';
import { formatCurrency } from '@/lib/format';
import type { EmpresaSlug } from '@/lib/empresa-branding';
import { HiloGastoSection } from '@/components/gasto/hilo-gasto-stepper';
import { useFocusDrilldown } from '@/hooks/use-focus-drilldown';
import { hrefDoc } from '@/lib/gasto/hilo';
import { buildPartidaIndex, type PartidaGrupo } from '@/lib/compras/partidas';
import { buildProyectoOptions, type ProyectoSelectorRow } from '@/lib/dilesa/proyectos-selector';

const TZ = 'America/Matamoros';

const FILTER_DEFAULTS = {
  search: '',
  estado: '',
};

export type CxpFacturasModuleProps = {
  /** UUID de la empresa (`core.empresas.id`). Filtra todas las queries. */
  empresaId: string;
  /** Slug de la empresa. Construye la URL del uploader y de la OC enlazada. */
  empresa: EmpresaSlug;
};

// ── Types ────────────────────────────────────────────────────────────────────

type EstadoCxp = 'borrador' | 'por_pagar' | 'parcial' | 'pagada' | 'cancelada';

type Factura = {
  id: string;
  uuid_sat: string | null;
  emisor_nombre: string | null;
  emisor_rfc: string | null;
  proveedor_id: string | null;
  proveedor_nombre: string | null;
  orden_compra_id: string | null;
  oc_codigo: string | null;
  fecha_emision: string | null;
  fecha_vencimiento: string | null;
  fecha_pago_programada: string | null;
  subtotal: number | null;
  iva: number | null;
  tasa_iva: number | null;
  retencion_iva: number | null;
  retencion_isr: number | null;
  total: number | null;
  monto_pagado: number | null;
  saldo: number | null;
  estado_cxp: EstadoCxp;
  forma_pago_sat: string | null;
  metodo_pago_sat: string | null;
  uso_cfdi: string | null;
  xml_url: string | null;
  pdf_url: string | null;
  partida_id: string | null;
  /** Clasificación contable: cuenta del catálogo erp.cuentas_contables (DILESA). */
  cuenta_contable_id: string | null;
  /** Destajo de origen (dilesa.estimaciones) si la factura nació de uno. */
  estimacion_id: string | null;
  /** Código del destajo de origen (para la bandeja "en espera"). */
  destajo_codigo: string | null;
};

type PagoAplicado = {
  id: string;
  monto_aplicado: number;
  created_at: string | null;
  pago_estado: string | null;
  pago_fecha_pago: string | null;
  pago_metodo: string | null;
  pago_referencia: string | null;
};

type Adjunto = { id: string; nombre: string; url: string; rol: string };

/** Línea del CFDI parseada on-read por /api/<empresa>/cxp/facturas/<id>/cfdi. */
type CfdiConcepto = {
  claveProdServ: string | null;
  noIdentificacion: string | null;
  cantidad: number;
  unidad: string | null;
  claveUnidad: string | null;
  descripcion: string;
  valorUnitario: number;
  importe: number;
  descuento: number;
};

/** Delta del CFDI sobre lo que ya trae la fila de `erp.facturas`. */
type FacturaCfdi = {
  serie: string | null;
  folio: string | null;
  fechaTimbrado: string | null;
  regimenFiscalEmisor: string | null;
  lugarExpedicion: string | null;
  tipoComprobante: string;
  moneda: string;
  tipoCambio: number | null;
  descuento: number;
  conceptos: CfdiConcepto[];
  relacionados: { tipoRelacion: string | null; uuids: string[] }[];
};

// ── Helpers ────────────────────────────────────────────────────────────────────

function formatDate(value: string | null | undefined): string {
  if (!value) return '—';
  // Las columnas son `date` (sin hora). Parsear como fecha local fija para
  // evitar el corrimiento de un día por timezone.
  const d = new Date(`${value}T12:00:00`);
  if (isNaN(d.getTime())) return '—';
  return new Intl.DateTimeFormat('es-MX', { timeZone: TZ, dateStyle: 'medium' }).format(d);
}

/**
 * Fecha + hora de timbrado. El atributo viene sin offset (hora local del SAT),
 * así que troceamos el ISO en lugar de `new Date()` para no introducir corrimientos.
 */
function formatFechaHora(iso: string | null): string {
  if (!iso) return '—';
  const [d, t] = iso.split('T');
  const fecha = formatDate(d);
  const hhmm = t ? t.slice(0, 5) : '';
  return hhmm ? `${fecha}, ${hhmm}` : fecha;
}

const TIPO_COMPROBANTE_LABEL: Record<string, string> = {
  I: 'Ingreso',
  E: 'Egreso (nota de crédito)',
  P: 'Pago',
  N: 'Nómina',
  T: 'Traslado',
};

const TIPO_RELACION_LABEL: Record<string, string> = {
  '01': 'Nota de crédito',
  '02': 'Nota de débito',
  '03': 'Devolución',
  '04': 'Sustitución',
  '05': 'Traslados previos',
  '06': 'Factura por traslados',
  '07': 'Aplicación de anticipo',
};

function tipoRelacionLabel(t: string | null): string {
  if (!t) return 'Relacionado';
  return TIPO_RELACION_LABEL[t] ? `${TIPO_RELACION_LABEL[t]} (${t})` : `Relación ${t}`;
}

/** Línea secundaria de un concepto: cantidad × valor unitario · claves SAT. */
function formatConceptoMeta(c: CfdiConcepto): string {
  const cant = c.unidad ? `${c.cantidad} ${c.unidad}` : String(c.cantidad);
  const parts = [`${cant} × ${formatCurrency(c.valorUnitario)}`];
  if (c.descuento > 0) parts.push(`desc. ${formatCurrency(c.descuento)}`);
  if (c.claveProdServ) parts.push(c.claveProdServ);
  if (c.noIdentificacion) parts.push(c.noIdentificacion);
  return parts.join(' · ');
}

/** Etiqueta visible del proveedor: prefiere el nombre del emisor del CFDI. */
function proveedorLabel(f: Factura): string {
  return f.emisor_nombre || f.proveedor_nombre || f.emisor_rfc || '(sin proveedor)';
}

/** Días para el vencimiento (o desde él): negativo = vencida. null = sin fecha base. */
function diasParaVencer(f: Factura): number | null {
  const base = f.fecha_pago_programada ?? f.fecha_vencimiento;
  if (!base) return null;
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  const venc = new Date(`${base}T00:00:00`);
  if (isNaN(venc.getTime())) return null;
  return Math.floor((venc.getTime() - hoy.getTime()) / 86400000);
}

type BadgeVariant = 'default' | 'secondary' | 'destructive' | 'outline';

function estadoBadge(f: Factura): { label: string; variant: BadgeVariant; className?: string } {
  if (f.estado_cxp === 'cancelada') return { label: 'Cancelada', variant: 'outline' };
  if (f.estado_cxp === 'pagada') return { label: 'Pagada', variant: 'default' };
  if (f.estado_cxp === 'borrador') return { label: 'Borrador', variant: 'outline' };

  // por_pagar / parcial: derivar urgencia por vencimiento.
  const dias = diasParaVencer(f);
  const prefijo = f.estado_cxp === 'parcial' ? 'Parcial' : 'Por pagar';
  if (dias == null) return { label: prefijo, variant: 'secondary' };
  if (dias < 0) {
    return {
      label: `Vencida ${Math.abs(dias)}d`,
      variant: 'destructive',
    };
  }
  if (dias <= 7) {
    return {
      label: `${prefijo} · vence ${dias}d`,
      variant: 'secondary',
      className: 'border-amber-500/50 text-amber-600',
    };
  }
  return { label: `${prefijo} · ${dias}d`, variant: 'secondary' };
}

const ESTADO_OPTIONS = [
  { value: 'por_pagar', label: 'Por pagar' },
  { value: 'parcial', label: 'Parcial' },
  { value: 'pagada', label: 'Pagada' },
  { value: 'borrador', label: 'Borrador' },
  { value: 'cancelada', label: 'Cancelada' },
];

// ── Columns ────────────────────────────────────────────────────────────────────

const columns: Column<Factura>[] = [
  {
    key: 'proveedor',
    label: 'Proveedor',
    accessor: (f) => proveedorLabel(f),
    render: (f) => (
      <div className="min-w-0">
        <div className="truncate font-medium">{proveedorLabel(f)}</div>
        {f.emisor_rfc ? (
          <div className="font-mono text-xs text-muted-foreground">{f.emisor_rfc}</div>
        ) : null}
      </div>
    ),
  },
  {
    key: 'uuid_sat',
    label: 'Folio fiscal',
    cellClassName: 'font-mono text-xs text-muted-foreground',
    render: (f) =>
      f.uuid_sat ? (
        <span title={f.uuid_sat}>{f.uuid_sat.slice(0, 8)}…</span>
      ) : (
        <span className="text-muted-foreground/40">Sin UUID</span>
      ),
  },
  {
    key: 'fecha_emision',
    label: 'Emisión',
    type: 'date',
    accessor: (f) => f.fecha_emision ?? '',
    render: (f) => formatDate(f.fecha_emision),
  },
  {
    key: 'fecha_pago_programada',
    label: 'Vence',
    type: 'date',
    accessor: (f) => f.fecha_pago_programada ?? f.fecha_vencimiento ?? '',
    render: (f) => formatDate(f.fecha_pago_programada ?? f.fecha_vencimiento),
  },
  {
    key: 'total',
    label: 'Total',
    type: 'currency',
    accessor: (f) => f.total ?? 0,
    render: (f) => formatCurrency(f.total),
    cellClassName: 'font-medium',
  },
  {
    key: 'saldo',
    label: 'Saldo',
    type: 'currency',
    accessor: (f) => f.saldo ?? 0,
    render: (f) => {
      const saldo = f.saldo ?? 0;
      return (
        <span className={saldo > 0 ? 'font-semibold text-amber-600' : 'text-muted-foreground'}>
          {formatCurrency(saldo)}
        </span>
      );
    },
  },
  {
    key: 'estado_cxp',
    label: 'Estado',
    accessor: (f) => f.estado_cxp,
    render: (f) => {
      const b = estadoBadge(f);
      return (
        <Badge variant={b.variant} className={b.className}>
          {b.label}
        </Badge>
      );
    },
  },
  {
    key: 'oc',
    label: 'OC',
    sortable: false,
    render: (f) =>
      f.oc_codigo ? (
        <span className="inline-flex items-center gap-1 font-mono text-xs text-muted-foreground">
          <Link2 className="h-3 w-3" />
          {f.oc_codigo}
        </span>
      ) : (
        <span className="text-xs text-muted-foreground/40">—</span>
      ),
  },
];

// ── Módulo ─────────────────────────────────────────────────────────────────────

export function CxpFacturasModule({ empresaId, empresa }: CxpFacturasModuleProps) {
  const feedback = useActionFeedback();
  const [facturas, setFacturas] = useState<Factura[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const { filters, setFilter, clearAll, activeCount } = useUrlFilters(FILTER_DEFAULTS);
  const { search, estado } = filters;

  const [selected, setSelected] = useState<Factura | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Drill-down (?focus=<factura_id>) desde el hilo del gasto de otros módulos.
  useFocusDrilldown(
    facturas,
    (f) => f.id,
    (row) => {
      setSelected(row);
      setDrawerOpen(true);
    }
  );
  const [uploadOpen, setUploadOpen] = useState(false);
  // Factura en espera destino de la subida de XML (bandeja destajo → CxP).
  const [recibirTarget, setRecibirTarget] = useState<Factura | null>(null);

  // Binding de partida de presupuesto — solo empresas con presupuesto de obra (DILESA-first).
  const usaPartidas = empresa === 'dilesa';
  const [partidaGrupos, setPartidaGrupos] = useState<Map<string, PartidaGrupo[]>>(new Map());
  const [proyectoOpts, setProyectoOpts] = useState<{ id: string; nombre: string }[]>([]);
  const [partidaLabelMap, setPartidaLabelMap] = useState<Map<string, string>>(new Map());
  const [proyectoNombreMap, setProyectoNombreMap] = useState<Map<string, string>>(new Map());
  const [partidaProyectoMap, setPartidaProyectoMap] = useState<Map<string, string>>(new Map());
  // Cuentas contables afectables (DILESA) para clasificar el egreso: opciones
  // del <Combobox> + mapa id→etiqueta. Iniciativa dilesa-catalogo-contable.
  const [cuentaOpts, setCuentaOpts] = useState<ComboboxOption[]>([]);
  const [cuentaLabelMap, setCuentaLabelMap] = useState<Map<string, string>>(new Map());

  // Columna "Partida" solo para empresas con presupuesto de obra (DILESA):
  // hace visible el gasto que NO suma al control presupuestal — una factura
  // de egreso sin OC y sin partida es invisible para `v_partida_control`
  // (riesgo "gasto invisible", iniciativa dilesa-flujo-gasto S3).
  const columnsConPartida = useMemo<Column<Factura>[]>(() => {
    if (!usaPartidas) return columns;
    const out = [...columns];
    const idx = out.findIndex((c) => c.key === 'estado_cxp');
    out.splice(Math.max(idx, 0) + 1, 0, {
      key: 'partida',
      label: 'Partida',
      sortable: false,
      render: (f) => {
        if (f.partida_id) {
          const label = partidaLabelMap.get(f.partida_id) ?? 'Ligada';
          return (
            <span className="block max-w-[180px] truncate text-xs text-muted-foreground">
              {label}
            </span>
          );
        }
        if (f.orden_compra_id) return <span className="text-xs text-muted-foreground">Vía OC</span>;
        if (f.estado_cxp === 'cancelada' || f.estado_cxp === 'borrador')
          return <span className="text-muted-foreground">—</span>;
        return (
          <Badge variant="outline" className="border-amber-500/60 text-amber-600">
            Sin partida
          </Badge>
        );
      },
    });
    // Columna "Cuenta" (clasificación contable): hace visible el egreso sin
    // clasificar para impulsar la captura. Iniciativa dilesa-catalogo-contable.
    out.splice(out.findIndex((c) => c.key === 'partida') + 1, 0, {
      key: 'cuenta_contable',
      label: 'Cuenta',
      sortable: false,
      render: (f) =>
        f.cuenta_contable_id ? (
          <span className="block max-w-[180px] truncate text-xs text-muted-foreground">
            {cuentaLabelMap.get(f.cuenta_contable_id) ?? 'Clasificada'}
          </span>
        ) : f.estado_cxp === 'cancelada' ? (
          <span className="text-muted-foreground">—</span>
        ) : (
          <Badge variant="outline" className="border-amber-500/60 text-amber-600">
            Sin clasificar
          </Badge>
        ),
    });
    return out;
  }, [usaPartidas, partidaLabelMap, cuentaLabelMap]);

  const fetchFacturas = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const sb = createSupabaseBrowserClient();
      const { data, error: qErr } = await sb
        .schema('erp')
        .from('facturas')
        .select(
          'id, uuid_sat, emisor_nombre, emisor_rfc, proveedor_id, orden_compra_id, fecha_emision, fecha_vencimiento, fecha_pago_programada, subtotal, iva, tasa_iva, retencion_iva, retencion_isr, total, monto_pagado, saldo, estado_cxp, forma_pago_sat, metodo_pago_sat, uso_cfdi, xml_url, pdf_url, partida_id, cuenta_contable_id'
        )
        .eq('empresa_id', empresaId)
        .eq('flujo', 'egreso')
        .order('fecha_emision', { ascending: false });
      if (qErr) throw qErr;

      const rows = (data ?? []) as Omit<
        Factura,
        'proveedor_nombre' | 'oc_codigo' | 'estimacion_id' | 'destajo_codigo'
      >[];

      // Nombres de proveedor (erp.personas) para filas con proveedor_id y sin
      // emisor_nombre, y códigos de OC enlazada. Dos queries puntuales con
      // .in() (vol. bajo en RDB; chunk defensivo a 150 por límite de URL).
      const proveedorIds = [
        ...new Set(rows.map((r) => r.proveedor_id).filter((x): x is string => !!x)),
      ];
      const ocIds = [
        ...new Set(rows.map((r) => r.orden_compra_id).filter((x): x is string => !!x)),
      ];

      const nombrePorPersona = new Map<string, string>();
      for (let i = 0; i < proveedorIds.length; i += 150) {
        const chunk = proveedorIds.slice(i, i + 150);
        const { data: personas } = await sb
          .schema('erp')
          .from('personas')
          .select('id, nombre, apellido_paterno, apellido_materno')
          .in('id', chunk);
        for (const p of personas ?? []) {
          const nombre = [p.nombre, p.apellido_paterno, p.apellido_materno]
            .filter(Boolean)
            .join(' ');
          if (nombre) nombrePorPersona.set(p.id as string, nombre);
        }
      }

      const ocPorId = new Map<string, string>();
      for (let i = 0; i < ocIds.length; i += 150) {
        const chunk = ocIds.slice(i, i + 150);
        const { data: ocs } = await sb
          .schema('erp')
          .from('ordenes_compra')
          .select('id, codigo')
          .in('id', chunk);
        for (const o of ocs ?? []) ocPorId.set(o.id as string, (o.codigo as string | null) ?? '');
      }

      // Liga a destajo (facturas.estimacion_id, columna nueva aún no en types)
      // + código del destajo — para la bandeja "en espera del XML". Solo se
      // consulta para las facturas en borrador (las en espera).
      const borradorIds = rows.filter((r) => r.estado_cxp === 'borrador').map((r) => r.id);
      const estimacionPorFactura = new Map<string, string>();
      const codigoPorEstimacion = new Map<string, string>();
      if (borradorIds.length > 0) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: facEst } = await (sb.schema('erp') as any)
          .from('facturas')
          .select('id, estimacion_id')
          .in('id', borradorIds);
        const estIds = [
          ...new Set(
            ((facEst ?? []) as { id: string; estimacion_id: string | null }[])
              .map((f) => f.estimacion_id)
              .filter((x): x is string => !!x)
          ),
        ];
        for (const f of (facEst ?? []) as { id: string; estimacion_id: string | null }[]) {
          if (f.estimacion_id) estimacionPorFactura.set(f.id, f.estimacion_id);
        }
        if (estIds.length > 0) {
          const { data: ests } = await sb
            .schema('dilesa')
            .from('estimaciones')
            .select('id, codigo')
            .in('id', estIds);
          for (const e of ests ?? [])
            codigoPorEstimacion.set(e.id as string, (e.codigo as string | null) ?? '');
        }
      }

      setFacturas(
        rows.map((r) => {
          const estimacionId = estimacionPorFactura.get(r.id) ?? null;
          return {
            ...r,
            proveedor_nombre: r.proveedor_id
              ? (nombrePorPersona.get(r.proveedor_id) ?? null)
              : null,
            oc_codigo: r.orden_compra_id ? (ocPorId.get(r.orden_compra_id) ?? null) : null,
            estimacion_id: estimacionId,
            destajo_codigo: estimacionId ? (codigoPorEstimacion.get(estimacionId) ?? null) : null,
          };
        })
      );
    } catch (e) {
      setError(getSupabaseErrorMessage(e, 'No se pudieron cargar las facturas.'));
    } finally {
      setLoading(false);
    }
  }, [empresaId]);

  useEffect(() => {
    void fetchFacturas();
  }, [fetchFacturas]);

  // Índice de partidas para el selector del drawer (una vez; solo DILESA-first).
  useEffect(() => {
    if (!usaPartidas) return;
    let activo = true;
    void (async () => {
      const sb = createSupabaseBrowserClient();
      const [partRes, proyRes, catRes] = await Promise.all([
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (sb.schema('erp') as any)
          .from('presupuesto_partidas')
          .select('id, proyecto_id, concepto_id, concepto_texto')
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
      ]);
      if (!activo) return;
      const { partidaLabel, partidaProyecto, gruposByProyecto } = buildPartidaIndex(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (partRes.data ?? []) as any[],
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (catRes.data ?? []) as any[]
      );
      const proyNombre = new Map<string, string>();
      for (const p of proyRes.data ?? [])
        proyNombre.set(p.id as string, (p.nombre as string) ?? '');
      // Solo proyectos con presupuesto (consistente con el selector de Compras).
      const opts = buildProyectoOptions((proyRes.data ?? []) as unknown as ProyectoSelectorRow[])
        .filter((o) => gruposByProyecto.has(o.id))
        .map((o) => ({ id: o.id, nombre: o.nombre }));
      setPartidaGrupos(gruposByProyecto);
      setPartidaLabelMap(partidaLabel);
      setProyectoNombreMap(proyNombre);
      setPartidaProyectoMap(partidaProyecto);
      setProyectoOpts(opts);
    })();
    return () => {
      activo = false;
    };
  }, [usaPartidas, empresaId]);

  const asignarPartida = useCallback(
    async (facturaId: string, partidaId: string | null) => {
      const sb = createSupabaseBrowserClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error: e } = await (sb.schema('erp') as any)
        .from('facturas')
        .update({ partida_id: partidaId })
        .eq('id', facturaId);
      if (e) {
        feedback.error(getSupabaseErrorMessage(e, 'No se pudo asignar la partida.'));
        return;
      }
      feedback.success(partidaId ? 'Partida asignada' : 'Partida quitada');
      setSelected((s) => (s && s.id === facturaId ? { ...s, partida_id: partidaId } : s));
      void fetchFacturas();
    },
    [feedback, fetchFacturas]
  );

  // Carga del catálogo de cuentas afectables (solo DILESA) para el selector +
  // la columna. El estado (cuentaOpts / cuentaLabelMap) vive arriba, junto a
  // partidaProyectoMap, porque columnsConPartida lo consume.
  useEffect(() => {
    if (!usaPartidas) return;
    let activo = true;
    void (async () => {
      const sb = createSupabaseBrowserClient();
      const { data } = await sb
        .schema('erp')
        .from('cuentas_contables')
        .select('id, numero, nombre, codigo_contpaqi, tipo')
        .eq('empresa_id', empresaId)
        .eq('afectable', true)
        .eq('activa', true)
        .is('deleted_at', null)
        .order('numero', { ascending: true });
      if (!activo) return;
      const filas = data ?? [];
      setCuentaOpts(
        filas.map((c) => ({
          value: c.id,
          label: `${c.numero} · ${c.nombre}`,
          searchLabel: `${c.numero.replace(/-/g, ' ')} ${c.nombre}`,
          keywords: [c.numero, c.codigo_contpaqi ?? '', c.tipo].filter(Boolean),
        }))
      );
      setCuentaLabelMap(new Map(filas.map((c) => [c.id, `${c.numero} · ${c.nombre}`])));
    })();
    return () => {
      activo = false;
    };
  }, [usaPartidas, empresaId]);

  const asignarCuenta = useCallback(
    async (facturaId: string, cuentaId: string | null) => {
      const sb = createSupabaseBrowserClient();
      const { error: e } = await sb
        .schema('erp')
        .from('facturas')
        .update({ cuenta_contable_id: cuentaId })
        .eq('id', facturaId);
      if (e) {
        feedback.error(getSupabaseErrorMessage(e, 'No se pudo asignar la cuenta.'));
        return;
      }
      feedback.success(cuentaId ? 'Cuenta asignada' : 'Cuenta quitada');
      setSelected((s) => (s && s.id === facturaId ? { ...s, cuenta_contable_id: cuentaId } : s));
      void fetchFacturas();
    },
    [feedback, fetchFacturas]
  );

  const filtered = useMemo(() => {
    return facturas.filter((f) => {
      if (estado && f.estado_cxp !== estado) return false;
      if (!search) return true;
      const q = search.toLowerCase();
      return (
        proveedorLabel(f).toLowerCase().includes(q) ||
        (f.emisor_rfc ?? '').toLowerCase().includes(q) ||
        (f.uuid_sat ?? '').toLowerCase().includes(q) ||
        (f.oc_codigo ?? '').toLowerCase().includes(q)
      );
    });
  }, [facturas, search, estado]);

  // Facturas EN ESPERA del XML: destajos aprobados en construcción cuya
  // factura nació en borrador. Administración sube aquí el XML del contratista
  // (sin teclear folio). Iniciativa dilesa-estimaciones-cxp.
  const enEspera = useMemo(
    () => facturas.filter((f) => f.estado_cxp === 'borrador' && !!f.estimacion_id),
    [facturas]
  );

  const openDetail = useCallback((f: Factura) => {
    setSelected(f);
    setDrawerOpen(true);
  }, []);

  return (
    <>
      <DesktopOnlyNotice module="Cuentas por Pagar" />
      <div className="hidden sm:block">
        {enEspera.length > 0 && (
          <div className="mb-4 rounded-lg border border-amber-500/40 bg-amber-500/5 p-4">
            <div className="mb-1 flex items-center gap-2 text-sm font-semibold text-foreground">
              <FileUp className="h-4 w-4 text-amber-600" />
              Facturas en espera del XML · {enEspera.length}
            </div>
            <p className="mb-3 text-xs text-muted-foreground">
              Destajos aprobados en construcción. Sube el XML del contratista para pasarlas a por
              pagar — sin teclear folio.
            </p>
            <ul className="space-y-1.5">
              {enEspera.map((f) => (
                <li
                  key={f.id}
                  className="flex items-center justify-between gap-3 rounded-md border bg-background px-3 py-2"
                >
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium">{proveedorLabel(f)}</div>
                    <div className="text-xs text-muted-foreground">
                      {f.destajo_codigo && f.estimacion_id ? (
                        <a
                          href={`/dilesa/construccion/estimaciones/${f.estimacion_id}`}
                          className="font-mono hover:underline"
                        >
                          {f.destajo_codigo}
                        </a>
                      ) : (
                        'Destajo'
                      )}{' '}
                      · neto {formatCurrency(f.total)}
                    </div>
                  </div>
                  <Button size="sm" className="gap-2" onClick={() => setRecibirTarget(f)}>
                    <FileUp className="h-3.5 w-3.5" />
                    Subir XML
                  </Button>
                </li>
              ))}
            </ul>
          </div>
        )}

        <ModuleFilters
          count={
            loading ? 'Cargando…' : `${filtered.length} factura${filtered.length !== 1 ? 's' : ''}`
          }
          actions={
            <Button size="sm" onClick={() => setUploadOpen(true)} className="gap-2">
              <FileUp className="h-3.5 w-3.5" />
              Cargar XML
            </Button>
          }
        >
          <div className="relative min-w-52">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Proveedor, RFC, folio u OC…"
              value={search}
              onChange={(e) => setFilter('search', e.target.value)}
              className="pl-9"
            />
          </div>

          <Combobox
            value={estado}
            onChange={(value) => setFilter('estado', value ?? '')}
            options={ESTADO_OPTIONS}
            placeholder="Estado"
            allowClear
            size="sm"
            className="w-44"
          />

          <ActiveFiltersChip count={activeCount} onClearAll={clearAll} />

          <Button
            variant="outline"
            size="icon"
            onClick={() => void fetchFacturas()}
            aria-label="Actualizar"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
        </ModuleFilters>

        {error && <ErrorBanner error={error} onRetry={() => void fetchFacturas()} />}

        <ModuleContent>
          <DataTable<Factura>
            data={filtered}
            columns={columnsConPartida}
            rowKey="id"
            loading={loading}
            onRowClick={openDetail}
            initialSort={{ key: 'fecha_emision', dir: 'desc' }}
            emptyIcon={<FileUp className="h-8 w-8" />}
            emptyTitle={
              activeCount > 0
                ? 'Ninguna factura coincide con los filtros'
                : 'Aún no hay facturas de egreso'
            }
            emptyDescription={
              activeCount > 0
                ? 'Limpia los filtros para ver todas las facturas.'
                : 'Carga un XML CFDI para registrar la primera cuenta por pagar.'
            }
            showDensityToggle={false}
          />
        </ModuleContent>
      </div>

      <FacturaDrawer
        factura={selected}
        empresa={empresa}
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        usaPartidas={usaPartidas}
        partidaGrupos={partidaGrupos}
        proyectoOpts={proyectoOpts}
        partidaLabelMap={partidaLabelMap}
        proyectoNombreMap={proyectoNombreMap}
        partidaProyectoMap={partidaProyectoMap}
        cuentaOpts={cuentaOpts}
        cuentaLabelMap={cuentaLabelMap}
        onAsignar={async (partidaId) => {
          if (selected) await asignarPartida(selected.id, partidaId);
        }}
        onAsignarCuenta={async (cuentaId) => {
          if (selected) await asignarCuenta(selected.id, cuentaId);
        }}
        onCancelada={() => {
          setDrawerOpen(false);
          void fetchFacturas();
        }}
      />

      <UploadXmlDialog
        empresa={empresa}
        open={uploadOpen}
        onOpenChange={setUploadOpen}
        onDone={(exitosos) => {
          if (exitosos > 0) {
            feedback.success(
              `${exitosos} factura${exitosos !== 1 ? 's' : ''} cargada${exitosos !== 1 ? 's' : ''}`
            );
            void fetchFacturas();
          }
        }}
      />

      <RecibirXmlDialog
        empresa={empresa}
        factura={recibirTarget}
        onClose={() => setRecibirTarget(null)}
        onDone={(warning) => {
          feedback.success(
            warning ? 'XML recibido (con aviso)' : 'XML recibido · factura por pagar'
          );
          void fetchFacturas();
        }}
      />
    </>
  );
}

// ── Drawer de factura ──────────────────────────────────────────────────────────

function FacturaDrawer({
  factura,
  empresa,
  open,
  onClose,
  usaPartidas,
  partidaGrupos,
  proyectoOpts,
  partidaLabelMap,
  proyectoNombreMap,
  partidaProyectoMap,
  cuentaOpts,
  cuentaLabelMap,
  onAsignar,
  onAsignarCuenta,
  onCancelada,
}: {
  factura: Factura | null;
  empresa: EmpresaSlug;
  open: boolean;
  onClose: () => void;
  usaPartidas: boolean;
  partidaGrupos: Map<string, PartidaGrupo[]>;
  proyectoOpts: { id: string; nombre: string }[];
  partidaLabelMap: Map<string, string>;
  proyectoNombreMap: Map<string, string>;
  partidaProyectoMap: Map<string, string>;
  cuentaOpts: ComboboxOption[];
  cuentaLabelMap: Map<string, string>;
  onAsignar: (partidaId: string | null) => Promise<void>;
  onAsignarCuenta: (cuentaId: string | null) => Promise<void>;
  /** Refresca la lista + cierra el drawer tras cancelar la factura. */
  onCancelada: () => void;
}) {
  const { permissions } = usePermissions();
  const feedback = useActionFeedback();
  const [mostrarCancelar, setMostrarCancelar] = useState(false);
  const [pagos, setPagos] = useState<PagoAplicado[]>([]);
  const [adjuntos, setAdjuntos] = useState<Adjunto[]>([]);
  const [cfdi, setCfdi] = useState<FacturaCfdi | null>(null);
  const [cfdiLoading, setCfdiLoading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [editPartida, setEditPartida] = useState(false);
  const [selProy, setSelProy] = useState('');
  const [selPart, setSelPart] = useState('');
  const [guardandoPartida, setGuardandoPartida] = useState(false);
  const [editCuenta, setEditCuenta] = useState(false);
  const [selCuenta, setSelCuenta] = useState('');
  const [guardandoCuenta, setGuardandoCuenta] = useState(false);

  // Cierra el editor cuando cambia la factura (ajuste de estado en render, no en effect).
  const [trackedFacturaId, setTrackedFacturaId] = useState<string | null>(null);
  if ((factura?.id ?? null) !== trackedFacturaId) {
    setTrackedFacturaId(factura?.id ?? null);
    setEditPartida(false);
    setGuardandoPartida(false);
    setEditCuenta(false);
    setGuardandoCuenta(false);
  }

  useEffect(() => {
    if (!open || !factura) return;
    let activo = true;
    (async () => {
      setLoading(true);
      setPagos([]);
      setAdjuntos([]);
      const sb = createSupabaseBrowserClient();
      const [aplRes, adjRes] = await Promise.all([
        sb
          .schema('erp')
          .from('cxp_pago_aplicaciones')
          .select(
            'id, monto_aplicado, created_at, pago:cxp_pagos!pago_id(estado, fecha_pago, metodo_pago, referencia, deleted_at)'
          )
          .eq('factura_id', factura.id),
        sb
          .schema('erp')
          .from('adjuntos')
          .select('id, nombre, url, rol')
          .eq('entidad_tipo', 'cxp_factura')
          .eq('entidad_id', factura.id),
      ]);
      if (!activo) return;

      type RawApl = {
        id: string;
        monto_aplicado: number;
        created_at: string | null;
        pago: {
          estado: string | null;
          fecha_pago: string | null;
          metodo_pago: string | null;
          referencia: string | null;
          deleted_at: string | null;
        } | null;
      };
      const apl = ((aplRes.data ?? []) as unknown as RawApl[])
        .filter((a) => !a.pago?.deleted_at)
        .map((a) => ({
          id: a.id,
          monto_aplicado: Number(a.monto_aplicado),
          created_at: a.created_at,
          pago_estado: a.pago?.estado ?? null,
          pago_fecha_pago: a.pago?.fecha_pago ?? null,
          pago_metodo: a.pago?.metodo_pago ?? null,
          pago_referencia: a.pago?.referencia ?? null,
        }));
      setPagos(apl);
      setAdjuntos((adjRes.data ?? []) as Adjunto[]);
      setLoading(false);
    })();
    return () => {
      activo = false;
    };
  }, [open, factura]);

  // Desglose del CFDI (conceptos + metadata fiscal) parseado on-read desde el
  // XML en storage. Es opcional: si la factura no tiene XML o no parsea, el
  // drawer simplemente no muestra el desglose (sin error ruidoso).
  useEffect(() => {
    if (!open || !factura) return;
    let activo = true;
    setCfdi(null);
    setCfdiLoading(true);
    (async () => {
      try {
        const res = await fetch(`/api/${empresa}/cxp/facturas/${factura.id}/cfdi`);
        if (!activo) return;
        if (res.ok) {
          const body = (await res.json()) as { cfdi: FacturaCfdi };
          if (activo) setCfdi(body.cfdi);
        }
      } catch {
        /* desglose opcional — silencioso */
      } finally {
        if (activo) setCfdiLoading(false);
      }
    })();
    return () => {
      activo = false;
    };
  }, [open, factura, empresa]);

  // El xml_url de la factura puede ser un path de storage (Sprint 2) o estar
  // ausente; los adjuntos `cxp_factura` cubren ambos. Construir el link al
  // proxy autenticado /api/adjuntos/<path>.
  const xmlAdjunto = adjuntos.find((a) => a.rol === 'xml_cfdi') ?? null;
  const xmlPath = xmlAdjunto?.url ?? factura?.xml_url ?? null;
  const xmlHref = xmlPath ? `/api/adjuntos/${xmlPath}` : null;
  const pdfHref = factura?.pdf_url ? `/api/adjuntos/${factura.pdf_url}` : null;

  const b = factura ? estadoBadge(factura) : null;

  // Cancelar factura (RPC con motivo, audit trail · p2p-cancelaciones D1). Solo
  // admin (D2), y solo antes de cualquier pago aplicado (el RPC bloquea D3 si
  // hay pagos). Cancelar revierte la cuenta por pagar.
  const puedeCancelar =
    permissions.isAdmin &&
    factura != null &&
    (factura.estado_cxp === 'borrador' || factura.estado_cxp === 'por_pagar');

  const doCancelar = async (motivo: string) => {
    if (!factura) return;
    const sb = createSupabaseBrowserClient();
    const { error } = await sb
      .schema('erp')
      .rpc('cxp_factura_cancelar', { p_factura_id: factura.id, p_motivo: motivo });
    if (error) {
      feedback.error(getSupabaseErrorMessage(error, 'No se pudo cancelar la factura.'), {
        title: 'No se pudo cancelar',
      });
      throw error; // mantiene abierto el diálogo de motivo
    }
    feedback.success('Factura cancelada');
    onCancelada();
  };

  return (
    <DetailDrawer
      open={open}
      onOpenChange={(v) => !v && onClose()}
      size="lg"
      title={factura ? proveedorLabel(factura) : 'Factura'}
      description={
        factura
          ? `${factura.uuid_sat ? `${factura.uuid_sat.slice(0, 8)}… · ` : ''}Emitida ${formatDate(factura.fecha_emision)}`
          : undefined
      }
      meta={
        b ? (
          <Badge variant={b.variant} className={b.className}>
            {b.label}
          </Badge>
        ) : null
      }
    >
      <DetailDrawerContent>
        {!factura ? null : (
          <div className="space-y-6">
            {/* Cabecera: proveedor + datos fiscales */}
            <section className="space-y-2 text-sm">
              <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Proveedor
              </div>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
                <Field label="Nombre" value={proveedorLabel(factura)} />
                <Field label="RFC" value={factura.emisor_rfc ?? '—'} mono />
                <Field label="Uso CFDI" value={factura.uso_cfdi ?? '—'} />
                <Field
                  label="Forma / método"
                  value={
                    [factura.forma_pago_sat, factura.metodo_pago_sat].filter(Boolean).join(' · ') ||
                    '—'
                  }
                />
              </div>
            </section>

            <Separator />

            <HiloGastoSection empresa={empresa} documento={{ tipo: 'factura', id: factura.id }} />

            <Separator />

            {/* Fechas */}
            <section className="space-y-2 text-sm">
              <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Fechas
              </div>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
                <Field label="Emisión" value={formatDate(factura.fecha_emision)} />
                <Field label="Vencimiento" value={formatDate(factura.fecha_vencimiento)} />
                <Field label="Pago programado" value={formatDate(factura.fecha_pago_programada)} />
              </div>
            </section>

            <Separator />

            {/* Montos */}
            <section className="space-y-2 text-sm">
              <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Montos
              </div>
              <dl className="space-y-1">
                {cfdi && cfdi.moneda !== 'MXN' && (
                  <div className="flex items-center justify-between text-muted-foreground">
                    <span>Moneda</span>
                    <span className="tabular-nums">
                      {cfdi.moneda}
                      {cfdi.tipoCambio ? ` · TC ${cfdi.tipoCambio}` : ''}
                    </span>
                  </div>
                )}
                <MoneyRow label="Subtotal" value={factura.subtotal} />
                {cfdi && cfdi.descuento > 0 && (
                  <MoneyRow label="Descuento" value={-cfdi.descuento} muted />
                )}
                <MoneyRow
                  label={`IVA${factura.tasa_iva != null ? ` (${factura.tasa_iva}%)` : ''}`}
                  value={factura.iva}
                />
                {(factura.retencion_iva ?? 0) > 0 && (
                  <MoneyRow label="Ret. IVA" value={-(factura.retencion_iva ?? 0)} muted />
                )}
                {(factura.retencion_isr ?? 0) > 0 && (
                  <MoneyRow label="Ret. ISR" value={-(factura.retencion_isr ?? 0)} muted />
                )}
                <div className="flex items-center justify-between border-t pt-1.5 font-semibold">
                  <span>Total</span>
                  <span className="tabular-nums">{formatCurrency(factura.total)}</span>
                </div>
                <MoneyRow label="Pagado" value={factura.monto_pagado} muted />
                <div className="flex items-center justify-between font-semibold">
                  <span>Saldo</span>
                  <span
                    className={`tabular-nums ${(factura.saldo ?? 0) > 0 ? 'text-amber-600' : ''}`}
                  >
                    {formatCurrency(factura.saldo)}
                  </span>
                </div>
              </dl>
            </section>

            {/* Conceptos (líneas del CFDI, parseadas on-read del XML) */}
            <Separator />
            <section className="space-y-2 text-sm">
              <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Conceptos
              </div>
              {cfdiLoading ? (
                <p className="text-muted-foreground">Cargando…</p>
              ) : !cfdi || cfdi.conceptos.length === 0 ? (
                <p className="text-muted-foreground">
                  {cfdi ? 'El CFDI no desglosa conceptos.' : 'Desglose no disponible (sin XML).'}
                </p>
              ) : (
                <ul className="max-h-72 divide-y overflow-y-auto rounded-lg border">
                  {cfdi.conceptos.map((c, i) => (
                    <li key={`${c.claveProdServ ?? ''}-${i}`} className="px-3 py-2">
                      <div className="flex items-start justify-between gap-3">
                        <span className="min-w-0">{c.descripcion || '(sin descripción)'}</span>
                        <span className="shrink-0 font-medium tabular-nums">
                          {formatCurrency(c.importe)}
                        </span>
                      </div>
                      <div className="mt-0.5 text-xs text-muted-foreground">
                        {formatConceptoMeta(c)}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {/* OC enlazada */}
            {factura.orden_compra_id && (
              <>
                <Separator />
                <section className="space-y-2 text-sm">
                  <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Orden de compra
                  </div>
                  <a
                    href={hrefDoc(empresa, 'oc', factura.orden_compra_id) ?? '#'}
                    className="inline-flex items-center gap-1.5 font-medium text-primary underline-offset-2 hover:underline"
                  >
                    <Link2 className="h-4 w-4" />
                    {factura.oc_codigo ?? 'Ver OC enlazada'} →
                  </a>
                </section>
              </>
            )}

            {/* Partida del presupuesto (DILESA-first): liga el gasto a una partida.
                Para gasto directo (sin OC) esto lo hace devengar contra el presupuesto. */}
            {usaPartidas && (
              <>
                <Separator />
                <section className="space-y-2 text-sm">
                  <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Partida del presupuesto
                  </div>
                  {!editPartida ? (
                    <div className="flex items-center justify-between gap-2">
                      {factura.partida_id ? (
                        <span className="inline-flex items-center gap-1.5 font-medium">
                          <Wallet className="h-4 w-4 text-muted-foreground" />
                          {proyectoNombreMap.get(
                            partidaProyectoMap.get(factura.partida_id) ?? ''
                          ) ?? '—'}{' '}
                          › {partidaLabelMap.get(factura.partida_id) ?? '—'}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">Sin asignar a presupuesto.</span>
                      )}
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setSelProy(
                            factura.partida_id
                              ? (partidaProyectoMap.get(factura.partida_id) ?? '')
                              : ''
                          );
                          setSelPart(factura.partida_id ?? '');
                          setEditPartida(true);
                        }}
                      >
                        {factura.partida_id ? 'Cambiar' : 'Asignar partida'}
                      </Button>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <select
                        value={selProy}
                        onChange={(e) => {
                          setSelProy(e.target.value);
                          setSelPart('');
                        }}
                        className="h-9 w-full rounded-md border bg-background px-3 text-sm"
                      >
                        <option value="">Proyecto…</option>
                        {proyectoOpts.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.nombre}
                          </option>
                        ))}
                      </select>
                      <select
                        value={selPart}
                        onChange={(e) => setSelPart(e.target.value)}
                        disabled={!selProy}
                        className="h-9 w-full rounded-md border bg-background px-3 text-sm disabled:opacity-50"
                      >
                        <option value="">Partida…</option>
                        {(partidaGrupos.get(selProy) ?? []).map((g) => (
                          <optgroup key={g.key} label={g.label}>
                            {g.partidas.map((pp) => (
                              <option key={pp.id} value={pp.id}>
                                {pp.label}
                              </option>
                            ))}
                          </optgroup>
                        ))}
                      </select>
                      <div className="flex items-center justify-end gap-2">
                        {factura.partida_id && (
                          <Button
                            variant="ghost"
                            size="sm"
                            disabled={guardandoPartida}
                            onClick={async () => {
                              setGuardandoPartida(true);
                              await onAsignar(null);
                              setGuardandoPartida(false);
                              setEditPartida(false);
                            }}
                          >
                            Quitar
                          </Button>
                        )}
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={guardandoPartida}
                          onClick={() => setEditPartida(false)}
                        >
                          Cancelar
                        </Button>
                        <Button
                          size="sm"
                          disabled={!selPart || guardandoPartida}
                          onClick={async () => {
                            setGuardandoPartida(true);
                            await onAsignar(selPart);
                            setGuardandoPartida(false);
                            setEditPartida(false);
                          }}
                        >
                          {guardandoPartida ? 'Guardando…' : 'Asignar'}
                        </Button>
                      </div>
                    </div>
                  )}
                </section>
              </>
            )}

            {/* Cuenta contable (clasificación contable del egreso, DILESA).
                Iniciativa dilesa-catalogo-contable. La cuenta vive en
                erp.facturas.cuenta_contable_id; el selector ofrece solo cuentas
                afectables del catálogo. */}
            {usaPartidas && (
              <>
                <Separator />
                <section className="space-y-2 text-sm">
                  <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Cuenta contable
                  </div>
                  {!editCuenta ? (
                    <div className="flex items-center justify-between gap-2">
                      {factura.cuenta_contable_id ? (
                        <span className="inline-flex items-center gap-1.5 font-medium">
                          <BookText className="h-4 w-4 text-muted-foreground" />
                          {cuentaLabelMap.get(factura.cuenta_contable_id) ?? '—'}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">Sin clasificar.</span>
                      )}
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setSelCuenta(factura.cuenta_contable_id ?? '');
                          setEditCuenta(true);
                        }}
                      >
                        {factura.cuenta_contable_id ? 'Cambiar' : 'Clasificar'}
                      </Button>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <Combobox
                        value={selCuenta}
                        onChange={setSelCuenta}
                        options={cuentaOpts}
                        placeholder="Cuenta contable…"
                        searchPlaceholder="Buscar por número o nombre…"
                        allowClear
                      />
                      <div className="flex items-center justify-end gap-2">
                        {factura.cuenta_contable_id ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            disabled={guardandoCuenta}
                            onClick={async () => {
                              setGuardandoCuenta(true);
                              await onAsignarCuenta(null);
                              setGuardandoCuenta(false);
                              setEditCuenta(false);
                            }}
                          >
                            Quitar
                          </Button>
                        ) : null}
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={guardandoCuenta}
                          onClick={() => setEditCuenta(false)}
                        >
                          Cancelar
                        </Button>
                        <Button
                          size="sm"
                          disabled={!selCuenta || guardandoCuenta}
                          onClick={async () => {
                            setGuardandoCuenta(true);
                            await onAsignarCuenta(selCuenta);
                            setGuardandoCuenta(false);
                            setEditCuenta(false);
                          }}
                        >
                          {guardandoCuenta ? 'Guardando…' : 'Clasificar'}
                        </Button>
                      </div>
                    </div>
                  )}
                </section>
              </>
            )}

            {/* Pagos aplicados */}
            <Separator />
            <section className="space-y-2 text-sm">
              <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Pagos aplicados
              </div>
              {loading ? (
                <p className="text-muted-foreground">Cargando…</p>
              ) : pagos.length === 0 ? (
                <p className="text-muted-foreground">Sin pagos aplicados todavía.</p>
              ) : (
                <ul className="space-y-1.5">
                  {pagos.map((p) => (
                    <li
                      key={p.id}
                      className="flex items-center justify-between rounded-lg border bg-muted/30 px-3 py-1.5"
                    >
                      <div>
                        <div className="font-medium tabular-nums">
                          {formatCurrency(p.monto_aplicado)}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {[
                            p.pago_estado,
                            p.pago_metodo,
                            p.pago_referencia,
                            p.pago_fecha_pago ? formatDate(p.pago_fecha_pago) : null,
                          ]
                            .filter(Boolean)
                            .join(' · ') || '—'}
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {/* Comprobante: datos fiscales del CFDI (UUID copiable + metadata on-read) */}
            <Separator />
            <section className="space-y-2 text-sm">
              <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Comprobante
              </div>
              <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                <div className="col-span-2">
                  <CopyableField label="Folio fiscal (UUID)" value={factura.uuid_sat} />
                </div>
                {cfdi && (
                  <>
                    <Field
                      label="Serie · Folio"
                      value={[cfdi.serie, cfdi.folio].filter(Boolean).join(' · ') || '—'}
                    />
                    <Field label="Régimen emisor" value={cfdi.regimenFiscalEmisor ?? '—'} />
                    <Field label="Timbrado" value={formatFechaHora(cfdi.fechaTimbrado)} />
                    {cfdi.lugarExpedicion && (
                      <Field label="Lugar exp. (CP)" value={cfdi.lugarExpedicion} mono />
                    )}
                    {cfdi.tipoComprobante && cfdi.tipoComprobante !== 'I' && (
                      <Field
                        label="Tipo"
                        value={TIPO_COMPROBANTE_LABEL[cfdi.tipoComprobante] ?? cfdi.tipoComprobante}
                      />
                    )}
                  </>
                )}
              </div>
              {cfdi && cfdi.relacionados.length > 0 && (
                <div className="rounded-lg border bg-muted/30 px-3 py-2 text-xs">
                  <div className="font-medium text-foreground">CFDI relacionados</div>
                  {cfdi.relacionados.map((rel, i) => (
                    <div key={i} className="mt-1 text-muted-foreground">
                      {tipoRelacionLabel(rel.tipoRelacion)}:{' '}
                      <span className="break-all font-mono">{rel.uuids.join(', ')}</span>
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* Adjuntos */}
            {(xmlHref || pdfHref) && (
              <>
                <Separator />
                <section className="space-y-2 text-sm">
                  <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Archivos
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {xmlHref && (
                      <a
                        href={xmlHref}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm text-foreground hover:bg-muted"
                      >
                        <FileUp className="h-4 w-4" /> XML CFDI
                      </a>
                    )}
                    {pdfHref && (
                      <a
                        href={pdfHref}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm text-foreground hover:bg-muted"
                      >
                        <FileUp className="h-4 w-4" /> PDF
                      </a>
                    )}
                  </div>
                </section>
              </>
            )}

            {/* Cancelar factura — destructivo, solo admin, antes de pagos */}
            {puedeCancelar && (
              <>
                <Separator />
                <section className="space-y-2">
                  <Button
                    variant="ghost"
                    className="text-red-600 hover:bg-red-50 hover:text-red-700"
                    onClick={() => setMostrarCancelar(true)}
                  >
                    <Ban className="h-4 w-4" /> Cancelar factura
                  </Button>
                  <p className="text-[11px] text-muted-foreground">
                    Revierte la cuenta por pagar. Solo disponible antes de programar pagos; queda
                    registro del motivo para auditoría.
                  </p>
                </section>
              </>
            )}
          </div>
        )}
      </DetailDrawerContent>

      {mostrarCancelar && factura && (
        <CancelarConMotivoDialog
          key={factura.id}
          title={`¿Cancelar factura de ${proveedorLabel(factura)}?`}
          description="La factura quedará cancelada y dejará de contar como cuenta por pagar. Se preserva el historial para auditoría."
          confirmLabel="Cancelar factura"
          onClose={() => setMostrarCancelar(false)}
          onConfirm={doCancelar}
        />
      )}
    </DetailDrawer>
  );
}

function Field({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={mono ? 'font-mono text-sm' : 'text-sm'}>{value}</div>
    </div>
  );
}

/** Campo de solo lectura con botón para copiar el valor (UUID/folio fiscal). */
function CopyableField({ label, value }: { label: string; value: string | null }) {
  const feedback = useActionFeedback();
  const [copied, setCopied] = useState(false);

  if (!value) return <Field label={label} value="—" />;

  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      feedback.success(`${label} copiado`);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      feedback.error('No se pudo copiar.');
    }
  };

  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="flex items-center gap-1.5">
        <span className="break-all font-mono text-sm">{value}</span>
        <button
          type="button"
          onClick={() => void copiar()}
          aria-label={`Copiar ${label}`}
          className="shrink-0 text-muted-foreground transition-colors hover:text-foreground"
        >
          {copied ? (
            <Check className="h-3.5 w-3.5 text-emerald-500" />
          ) : (
            <Copy className="h-3.5 w-3.5" />
          )}
        </button>
      </div>
    </div>
  );
}

function MoneyRow({
  label,
  value,
  muted = false,
}: {
  label: string;
  value: number | null;
  muted?: boolean;
}) {
  return (
    <div className={`flex items-center justify-between ${muted ? 'text-muted-foreground' : ''}`}>
      <span>{label}</span>
      <span className="tabular-nums">{formatCurrency(value)}</span>
    </div>
  );
}

// ── Dialog: cargar XML (1..N) ──────────────────────────────────────────────────

function UploadXmlDialog({
  empresa,
  open,
  onOpenChange,
  onDone,
}: {
  empresa: EmpresaSlug;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDone: (exitosos: number) => void;
}) {
  const [files, setFiles] = useState<File[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [results, setResults] = useState<
    { filename: string; ok: boolean; error?: string }[] | null
  >(null);

  // Reset al cerrar.
  useEffect(() => {
    if (!open) {
      setFiles([]);
      setResults(null);
      setSubmitting(false);
    }
  }, [open]);

  const handleSubmit = async () => {
    if (files.length === 0) return;
    setSubmitting(true);
    setResults(null);
    try {
      const fd = new FormData();
      for (const f of files) fd.append('file', f);
      const res = await fetch(`/api/${empresa}/cxp/facturas/upload-xml`, {
        method: 'POST',
        body: fd,
      });
      const json = (await res.json()) as {
        ok: boolean;
        exitosos?: number;
        results?: { filename: string; ok: boolean; error?: string }[];
        error?: string;
      };
      if (!res.ok && !json.results) {
        setResults([{ filename: '(lote)', ok: false, error: json.error ?? 'Error en la carga.' }]);
        return;
      }
      setResults(json.results ?? []);
      onDone(json.exitosos ?? 0);
    } catch (e) {
      setResults([
        { filename: '(lote)', ok: false, error: (e as Error).message ?? 'Error de red.' },
      ]);
    } finally {
      setSubmitting(false);
    }
  };

  const exitosos = results?.filter((r) => r.ok).length ?? 0;
  const empresaLabel = empresa.toUpperCase();

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) onOpenChange(false);
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Cargar facturas (XML CFDI)</DialogTitle>
          <DialogDescription>
            Selecciona uno o varios XML de facturas de egreso. Se valida que el receptor sea{' '}
            {empresaLabel}, se evita duplicar por folio fiscal y se enlaza el proveedor por RFC.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <label className="flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed bg-muted/30 px-4 py-6 text-sm text-muted-foreground hover:bg-muted/50">
            <Upload className="h-4 w-4" />
            {files.length > 0
              ? `${files.length} archivo${files.length !== 1 ? 's' : ''} seleccionado${files.length !== 1 ? 's' : ''}`
              : 'Elegir archivos XML…'}
            <input
              type="file"
              accept=".xml,application/xml,text/xml"
              multiple
              className="hidden"
              onChange={(e) => {
                setFiles(Array.from(e.target.files ?? []));
                setResults(null);
              }}
            />
          </label>

          {files.length > 0 && !results && (
            <ul className="max-h-32 space-y-0.5 overflow-y-auto text-xs text-muted-foreground">
              {files.map((f) => (
                <li key={f.name} className="truncate font-mono">
                  {f.name}
                </li>
              ))}
            </ul>
          )}

          {results && (
            <div className="space-y-1.5">
              <p className="text-sm font-medium">
                {exitosos} de {results.length} cargada{results.length !== 1 ? 's' : ''}.
              </p>
              <ul className="max-h-40 space-y-1 overflow-y-auto text-xs">
                {results.map((r, i) => (
                  <li
                    key={`${r.filename}-${i}`}
                    className={r.ok ? 'text-emerald-600' : 'text-destructive'}
                  >
                    <span className="font-mono">{r.filename}</span>
                    {r.ok ? ' · OK' : ` · ${r.error ?? 'error'}`}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <DialogFooter>
          {results ? (
            <Button onClick={() => onOpenChange(false)}>Cerrar</Button>
          ) : (
            <>
              <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
                Cancelar
              </Button>
              <Button
                onClick={() => void handleSubmit()}
                disabled={files.length === 0 || submitting}
              >
                {submitting ? 'Cargando…' : `Cargar ${files.length || ''}`.trim()}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Dialog: recibir el XML sobre una factura en espera (destajo → CxP) ──────────

function RecibirXmlDialog({
  empresa,
  factura,
  onClose,
  onDone,
}: {
  empresa: EmpresaSlug;
  /** Factura en espera destino; null = diálogo cerrado. */
  factura: Factura | null;
  onClose: () => void;
  onDone: (warning: string | null) => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{
    ok: boolean;
    error?: string;
    warning?: string | null;
  } | null>(null);

  const open = factura != null;

  useEffect(() => {
    if (!open) {
      setFile(null);
      setResult(null);
      setSubmitting(false);
    }
  }, [open]);

  const handleSubmit = async () => {
    if (!file || !factura) return;
    setSubmitting(true);
    setResult(null);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('factura_id', factura.id);
      const res = await fetch(`/api/${empresa}/cxp/facturas/upload-xml`, {
        method: 'POST',
        body: fd,
      });
      const json = (await res.json()) as { ok: boolean; error?: string; warning?: string | null };
      if (!res.ok || !json.ok) {
        setResult({ ok: false, error: json.error ?? 'No se pudo asociar el XML.' });
        return;
      }
      setResult({ ok: true, warning: json.warning ?? null });
      onDone(json.warning ?? null);
    } catch (e) {
      setResult({ ok: false, error: (e as Error).message ?? 'Error de red.' });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) onClose();
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Subir XML del contratista</DialogTitle>
          <DialogDescription>
            {factura ? proveedorLabel(factura) : ''}
            {factura?.destajo_codigo ? ` · ${factura.destajo_codigo}` : ''} · neto{' '}
            {formatCurrency(factura?.total ?? 0)}. El folio fiscal y los montos se leen del CFDI; la
            factura pasa a por pagar.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <label className="flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed bg-muted/30 px-4 py-6 text-sm text-muted-foreground hover:bg-muted/50">
            <Upload className="h-4 w-4" />
            {file ? file.name : 'Elegir el XML del CFDI…'}
            <input
              type="file"
              accept=".xml,application/xml,text/xml"
              className="hidden"
              onChange={(e) => {
                setFile(e.target.files?.[0] ?? null);
                setResult(null);
              }}
            />
          </label>

          {result && !result.ok && <p className="text-sm text-destructive">{result.error}</p>}
          {result && result.ok && (
            <div className="space-y-1 text-sm">
              <p className="text-emerald-600">XML asociado · la factura quedó por pagar.</p>
              {result.warning && (
                <p className="rounded-md border border-amber-500/40 bg-amber-500/5 px-3 py-2 text-xs text-amber-700">
                  {result.warning}
                </p>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          {result?.ok ? (
            <Button onClick={onClose}>Cerrar</Button>
          ) : (
            <>
              <Button variant="outline" onClick={onClose} disabled={submitting}>
                Cancelar
              </Button>
              <Button onClick={() => void handleSubmit()} disabled={!file || submitting}>
                {submitting ? 'Subiendo…' : 'Subir XML'}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
