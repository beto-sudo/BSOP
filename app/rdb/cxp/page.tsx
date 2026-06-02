'use client';

/**
 * CxP · Facturas — lista de facturas de egreso (RDB golden, Sprint 3).
 *
 * Lista las facturas de egreso (`erp.facturas` con `flujo='egreso'`) con
 * <DataTable> (ADR-010): proveedor, folio fiscal, fechas, total, saldo,
 * estado (badge) y OC enlazada. Filtros con `useUrlFilters` (ADR-007):
 * búsqueda de proveedor, estado, rango de fecha de emisión. Header con
 * "Cargar XML" (dispara el endpoint de Sprint 2 con 1..N archivos).
 *
 * El drawer de detalle (`<DetailDrawer>`, ADR-018/026) muestra cabecera,
 * montos con retenciones, OC enlazada, pagos aplicados
 * (`erp.cxp_pago_aplicaciones`) y el link al XML adjunto.
 *
 * @module CxP — Facturas (RDB)
 * @responsive desktop-only — reportería/captura administrativa en escritorio.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { FileUp, Link2, RefreshCw, Search, Upload } from 'lucide-react';

import { RequireAccess } from '@/components/require-access';
import { DesktopOnlyNotice } from '@/components/responsive';
import {
  ModuleFilters,
  ModuleContent,
  ErrorBanner,
  ActiveFiltersChip,
  DataTable,
  type Column,
} from '@/components/module-page';
import { DetailDrawer, DetailDrawerContent } from '@/components/detail-page';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Combobox } from '@/components/ui/combobox';
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

const RDB_EMPRESA_ID = 'e52ac307-9373-4115-b65e-1178f0c4e1aa';
const TZ = 'America/Matamoros';

const FILTER_DEFAULTS = {
  search: '',
  estado: '',
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

// ── Helpers ────────────────────────────────────────────────────────────────────

function formatDate(value: string | null | undefined): string {
  if (!value) return '—';
  // Las columnas son `date` (sin hora). Parsear como fecha local fija para
  // evitar el corrimiento de un día por timezone.
  const d = new Date(`${value}T12:00:00`);
  if (isNaN(d.getTime())) return '—';
  return new Intl.DateTimeFormat('es-MX', { timeZone: TZ, dateStyle: 'medium' }).format(d);
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

// ── Page ─────────────────────────────────────────────────────────────────────

export default function CxpFacturasPage() {
  return (
    <RequireAccess empresa="rdb" modulo="rdb.cxp.facturas">
      <CxpFacturasBody />
    </RequireAccess>
  );
}

function CxpFacturasBody() {
  const feedback = useActionFeedback();
  const [facturas, setFacturas] = useState<Factura[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const { filters, setFilter, clearAll, activeCount } = useUrlFilters(FILTER_DEFAULTS);
  const { search, estado } = filters;

  const [selected, setSelected] = useState<Factura | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);

  const fetchFacturas = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const sb = createSupabaseBrowserClient();
      const { data, error: qErr } = await sb
        .schema('erp')
        .from('facturas')
        .select(
          'id, uuid_sat, emisor_nombre, emisor_rfc, proveedor_id, orden_compra_id, fecha_emision, fecha_vencimiento, fecha_pago_programada, subtotal, iva, tasa_iva, retencion_iva, retencion_isr, total, monto_pagado, saldo, estado_cxp, forma_pago_sat, metodo_pago_sat, uso_cfdi, xml_url, pdf_url'
        )
        .eq('empresa_id', RDB_EMPRESA_ID)
        .eq('flujo', 'egreso')
        .order('fecha_emision', { ascending: false });
      if (qErr) throw qErr;

      const rows = (data ?? []) as Omit<Factura, 'proveedor_nombre' | 'oc_codigo'>[];

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

      setFacturas(
        rows.map((r) => ({
          ...r,
          proveedor_nombre: r.proveedor_id ? (nombrePorPersona.get(r.proveedor_id) ?? null) : null,
          oc_codigo: r.orden_compra_id ? (ocPorId.get(r.orden_compra_id) ?? null) : null,
        }))
      );
    } catch (e) {
      setError(getSupabaseErrorMessage(e, 'No se pudieron cargar las facturas.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchFacturas();
  }, [fetchFacturas]);

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

  const openDetail = useCallback((f: Factura) => {
    setSelected(f);
    setDrawerOpen(true);
  }, []);

  return (
    <>
      <DesktopOnlyNotice module="Cuentas por Pagar" />
      <div className="hidden sm:block">
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
            columns={columns}
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

      <FacturaDrawer factura={selected} open={drawerOpen} onClose={() => setDrawerOpen(false)} />

      <UploadXmlDialog
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
    </>
  );
}

// ── Drawer de factura ──────────────────────────────────────────────────────────

function FacturaDrawer({
  factura,
  open,
  onClose,
}: {
  factura: Factura | null;
  open: boolean;
  onClose: () => void;
}) {
  const [pagos, setPagos] = useState<PagoAplicado[]>([]);
  const [adjuntos, setAdjuntos] = useState<Adjunto[]>([]);
  const [loading, setLoading] = useState(false);

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

  // El xml_url de la factura puede ser un path de storage (Sprint 2) o estar
  // ausente; los adjuntos `cxp_factura` cubren ambos. Construir el link al
  // proxy autenticado /api/adjuntos/<path>.
  const xmlAdjunto = adjuntos.find((a) => a.rol === 'xml_cfdi') ?? null;
  const xmlPath = xmlAdjunto?.url ?? factura?.xml_url ?? null;
  const xmlHref = xmlPath ? `/api/adjuntos/${xmlPath}` : null;
  const pdfHref = factura?.pdf_url ? `/api/adjuntos/${factura.pdf_url}` : null;

  const b = factura ? estadoBadge(factura) : null;

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
                <MoneyRow label="Subtotal" value={factura.subtotal} />
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

            {/* OC enlazada */}
            {factura.orden_compra_id && (
              <>
                <Separator />
                <section className="space-y-2 text-sm">
                  <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Orden de compra
                  </div>
                  <a
                    href={`/rdb/ordenes-compra?focus=${factura.orden_compra_id}`}
                    className="inline-flex items-center gap-1.5 font-medium text-primary underline-offset-2 hover:underline"
                  >
                    <Link2 className="h-4 w-4" />
                    {factura.oc_codigo ?? 'Ver OC enlazada'} →
                  </a>
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
          </div>
        )}
      </DetailDrawerContent>
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
  open,
  onOpenChange,
  onDone,
}: {
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
      const res = await fetch('/api/rdb/cxp/facturas/upload-xml', {
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
            Selecciona uno o varios XML de facturas de egreso. Se valida que el receptor sea RDB, se
            evita duplicar por folio fiscal y se enlaza el proveedor por RFC.
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
