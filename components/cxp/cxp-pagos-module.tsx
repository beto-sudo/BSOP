'use client';

/**
 * CxP · Pagos — módulo compartido cross-empresa (ADR-011, SM1-SM6).
 *
 * Lista los pagos a proveedores (`erp.cxp_pagos`) por estado
 * (programado / aprobado / pagado / cancelado) con filtro de estado.
 * Acciones por pago según su estado, todas cableadas a las RPCs que ya
 * validan server-side (ADR-037):
 *
 *   - Autorizar y registrar pago (programado|aprobado → pagado): un solo paso
 *     (decisión 2026-06-29) — Contabilidad programa en la pestaña Facturas y
 *     **Dirección** autoriza+registra aquí. Dialog con fecha + referencia +
 *     comprobante (imagen/PDF, `<FileAttachments>` sobre `erp.adjuntos`),
 *     `cxp_pago_autorizar_y_pagar`. El RPC gatea rol "Dirección"; el botón NO
 *     se esconde por rol en cliente — defensa: manda el RPC. **Confirmación
 *     fuerte** (egreso real).
 *   - Pagar juntos (Fase 2): selección múltiple de pagos del mismo proveedor →
 *     `cxp_pago_consolidar` los funde en uno (mueve aplicaciones, saldo-neutral)
 *     y abre el diálogo de pago sobre el sobreviviente — una transferencia, un
 *     comprobante. Solo en la pestaña Programación.
 *   - Cancelar (si no pagado): `cxp_pago_cancelar` con motivo.
 *
 * Filtro default `'pendientes'` = programados + aprobados: lo vivo que aún
 * no se ejecuta nunca sale de la vista hasta estar pagado. La pestaña
 * Programación añade un filtro por **horizonte de vencimiento** (default
 * "hoy + vencidos"; presets semana/15 días/mes/todos).
 *
 * El drawer de detalle muestra las facturas aplicadas
 * (`cxp_pago_aplicaciones` → `facturas`), montos, quién aprobó/pagó, los
 * comprobantes adjuntos y el **control por partida**: por cada partida
 * presupuestal de las facturas, qué hay contratado contra ella
 * (`dilesa.contratos_construccion.valor_total`, fallback presupuesto
 * aprobado), los abonos EJECUTADOS previos, lo que aplica este pago y cómo
 * quedará (`armarControlPorPartida`).
 *
 * No inventa lógica financiera: solo cablea las RPCs con buenas
 * confirmaciones. Parametrizado por `empresaId` (UUID). RDB y DILESA lo
 * reusan con pages delgados (SM1).
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { RefreshCw, Wallet, XCircle } from 'lucide-react';

import { ModuleFilters, ModuleContent, ErrorBanner } from '@/components/module-page';
import { DesktopOnlyNotice } from '@/components/responsive';
import { DetailDrawer, DetailDrawerContent } from '@/components/detail-page';
import { CancelarConMotivoDialog } from '@/components/shared/cancelar-con-motivo-dialog';
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
import { createSupabaseBrowserClient } from '@/lib/supabase-browser';
import { getSupabaseErrorMessage } from '@/lib/supabase-error';
import { formatCurrency } from '@/lib/format';
import { FileAttachments, useAdjuntos } from '@/components/file-attachments';
import type { EmpresaSlug } from '@/lib/empresa-branding';
import { HiloGastoSection } from '@/components/gasto/hilo-gasto-stepper';
import { useFocusDrilldown } from '@/hooks/use-focus-drilldown';

const TZ = 'America/Matamoros';

export type CxpPagosModuleProps = {
  /** UUID de la empresa (`core.empresas.id`). Filtra todas las queries. */
  empresaId: string;
  /** Slug de la empresa para armar links del hilo del gasto (dilesa, rdb, …). */
  empresa: EmpresaSlug;
  /**
   * Filtro de estado inicial (pipeline S2). 'pendientes' (default) = pagos por
   * ejecutar (pestaña Programación: marcar pagado + comprobante); 'pagado' =
   * histórico (pestaña Pagos). El usuario puede cambiarlo con el filtro.
   */
  estadoInicial?: string;
};

// ── Types ────────────────────────────────────────────────────────────────────

type EstadoPago = 'programado' | 'aprobado' | 'pagado' | 'rechazado' | 'cancelado';

type Pago = {
  id: string;
  proveedor_id: string | null;
  proveedor_nombre: string | null;
  monto_total: number;
  estado: EstadoPago;
  metodo_pago: string | null;
  referencia: string | null;
  fecha_programada: string | null;
  fecha_pago: string | null;
  cuenta_bancaria_id: string | null;
  cuenta_nombre: string | null;
  aprobado_at: string | null;
  pagado_at: string | null;
  notas: string | null;
  /** Cuántas facturas cubre el pago (Programación agrupa por proveedor). */
  facturas_count: number;
};

type FacturaAplicada = {
  id: string;
  monto_aplicado: number;
  factura_id: string;
  uuid_sat: string | null;
  emisor_nombre: string | null;
  total: number | null;
  saldo: number | null;
  partida_id: string | null;
};

// ── Control por partida (estado de cuenta al momento de pagar) ───────────────

export type AbonoEjecutado = {
  pago_id: string;
  partida_id: string;
  monto: number;
  fecha: string | null;
  referencia: string | null;
};

export type PartidaControlCard = {
  partida_id: string;
  concepto: string;
  /** Σ valor_total de contratos vivos ligados a la partida. null = sin contrato. */
  contratado: number | null;
  /** Código del contrato si la partida tiene exactamente uno. */
  contratoCodigo: string | null;
  presupuesto: number | null;
  /** Abonado ejecutado a la partida ANTES de este pago. */
  abonadoPrevio: number;
  /** Lo que este pago aplica a la partida. */
  estePago: number;
  /** Abonos ejecutados previos (agrupados por pago), más reciente primero. */
  abonos: { pago_id: string; fecha: string | null; referencia: string | null; monto: number }[];
};

/**
 * Arma el estado de cuenta por partida de un pago: qué hay contratado contra
 * la partida, cuánto se le ha abonado (solo pagos EJECUTADOS — los
 * programados/aprobados son compromiso, no abono), cuánto aplica este pago y
 * cómo quedará. Si el pago ya está pagado, sus propias aplicaciones se
 * excluyen de "abonadoPrevio" para no contarlo doble contra "estePago".
 */
export function armarControlPorPartida(opts: {
  pagoId: string;
  aplicacionesDelPago: { monto_aplicado: number; partida_id: string | null }[];
  partidas: { id: string; concepto_texto: string | null; presupuesto_aprobado: number | null }[];
  contratos: { partida_id: string | null; codigo: string; valor_total: number | null }[];
  abonosEjecutados: AbonoEjecutado[];
}): PartidaControlCard[] {
  const { pagoId, aplicacionesDelPago, partidas, contratos, abonosEjecutados } = opts;

  const estePagoPorPartida = new Map<string, number>();
  for (const a of aplicacionesDelPago) {
    if (!a.partida_id) continue;
    estePagoPorPartida.set(
      a.partida_id,
      (estePagoPorPartida.get(a.partida_id) ?? 0) + Number(a.monto_aplicado ?? 0)
    );
  }

  const cards: PartidaControlCard[] = [];
  for (const p of partidas) {
    const estePago = estePagoPorPartida.get(p.id);
    if (estePago == null) continue;

    const contratosPartida = contratos.filter((c) => c.partida_id === p.id);
    const contratado =
      contratosPartida.length > 0
        ? contratosPartida.reduce((acc, c) => acc + Number(c.valor_total ?? 0), 0)
        : null;

    // Abonos previos: ejecutados, agrupados por pago, sin este pago.
    const porPago = new Map<
      string,
      { pago_id: string; fecha: string | null; referencia: string | null; monto: number }
    >();
    for (const ab of abonosEjecutados) {
      if (ab.partida_id !== p.id || ab.pago_id === pagoId) continue;
      const g = porPago.get(ab.pago_id) ?? {
        pago_id: ab.pago_id,
        fecha: ab.fecha,
        referencia: ab.referencia,
        monto: 0,
      };
      g.monto += Number(ab.monto ?? 0);
      porPago.set(ab.pago_id, g);
    }
    const abonos = [...porPago.values()].sort((a, b) =>
      (b.fecha ?? '').localeCompare(a.fecha ?? '')
    );

    cards.push({
      partida_id: p.id,
      concepto: p.concepto_texto ?? '(partida)',
      contratado,
      contratoCodigo: contratosPartida.length === 1 ? contratosPartida[0].codigo : null,
      presupuesto: p.presupuesto_aprobado != null ? Number(p.presupuesto_aprobado) : null,
      abonadoPrevio: abonos.reduce((acc, a) => acc + a.monto, 0),
      estePago,
      abonos,
    });
  }
  return cards.sort((a, b) => a.concepto.localeCompare(b.concepto));
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function formatDate(value: string | null | undefined): string {
  if (!value) return '—';
  const d = new Date(value.length <= 10 ? `${value}T12:00:00` : value);
  if (isNaN(d.getTime())) return '—';
  return new Intl.DateTimeFormat('es-MX', { timeZone: TZ, dateStyle: 'medium' }).format(d);
}

type BadgeVariant = 'default' | 'secondary' | 'destructive' | 'outline';

function estadoBadge(estado: EstadoPago): {
  label: string;
  variant: BadgeVariant;
  className?: string;
} {
  switch (estado) {
    case 'pagado':
      return { label: 'Pagado', variant: 'default' };
    case 'aprobado':
      return {
        label: 'Aprobado',
        variant: 'secondary',
        className: 'border-emerald-500/50 text-emerald-600',
      };
    case 'programado':
      return { label: 'Programado', variant: 'secondary' };
    case 'cancelado':
      return { label: 'Cancelado', variant: 'outline' };
    case 'rechazado':
      return { label: 'Rechazado', variant: 'outline' };
  }
}

const METODO_LABEL: Record<string, string> = {
  transferencia: 'Transferencia',
  cheque: 'Cheque',
  efectivo: 'Efectivo',
  tarjeta: 'Tarjeta',
};

/** Rol canónico del adjunto (ADR-022 FA4) para `erp.adjuntos.rol`. */
const COMPROBANTE_ROLES = [{ id: 'comprobante', label: 'Comprobante de pago' }];

const ESTADO_OPTIONS = [
  { value: 'pendientes', label: 'Pendientes (programados + aprobados)' },
  { value: 'programado', label: 'Programado' },
  { value: 'aprobado', label: 'Aprobado' },
  { value: 'pagado', label: 'Pagado' },
  { value: 'cancelado', label: 'Cancelado' },
  { value: 'rechazado', label: 'Rechazado' },
];

/**
 * Filtro de la lista. `'pendientes'` (default) = todo lo vivo que aún no se
 * ejecuta — programados Y aprobados — para que un pago aprobado no desaparezca
 * de la vista hasta estar pagado. `''` = todos los estados.
 */
export function filtrarPagosPorEstado<T extends { estado: EstadoPago }>(
  pagos: T[],
  estado: string
): T[] {
  if (!estado) return pagos;
  if (estado === 'pendientes') {
    return pagos.filter((p) => p.estado === 'programado' || p.estado === 'aprobado');
  }
  return pagos.filter((p) => p.estado === estado);
}

// ── Filtro por horizonte de vencimiento (pestaña Programación) ────────────────
// Cada preset es acumulativo "vence dentro de N días" e INCLUYE lo vencido
// (fecha ≤ hoy). Default 'hoy_vencidos' = solo lo que toca hoy o ya se pasó; el
// resto se esconde hasta cambiar el filtro. Los pagos SIN fecha programada
// siempre se muestran (necesitan atención, no deben desaparecer).
const HORIZONTE_DIAS: Record<string, number> = {
  hoy_vencidos: 0,
  semana: 7,
  quincena: 15,
  mes: 30,
};

export const HORIZONTE_OPTIONS = [
  { value: 'hoy_vencidos', label: 'Hoy + vencidos' },
  { value: 'semana', label: 'Próxima semana' },
  { value: 'quincena', label: 'Próximos 15 días' },
  { value: 'mes', label: 'Próximo mes' },
  { value: 'todos', label: 'Todos' },
];

/** Suma `dias` a una fecha ISO `YYYY-MM-DD` sin arrastre de zona horaria. */
function sumarDiasISO(iso: string, dias: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + dias);
  return dt.toISOString().slice(0, 10);
}

export function filtrarPagosPorHorizonte<T extends { fecha_programada: string | null }>(
  pagos: T[],
  horizonte: string,
  hoyISO: string
): T[] {
  if (!horizonte || horizonte === 'todos') return pagos;
  const dias = HORIZONTE_DIAS[horizonte];
  if (dias == null) return pagos;
  const limite = sumarDiasISO(hoyISO, dias);
  // Sin fecha → siempre visible; con fecha → vence en/antes del límite.
  return pagos.filter((p) => !p.fecha_programada || p.fecha_programada <= limite);
}

// ── Módulo ─────────────────────────────────────────────────────────────────────

export function CxpPagosModule({
  empresaId,
  empresa,
  estadoInicial = 'pendientes',
}: CxpPagosModuleProps) {
  const feedback = useActionFeedback();
  const [pagos, setPagos] = useState<Pago[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [estado, setEstado] = useState(estadoInicial);

  // La pestaña Programación (estadoInicial='pendientes') trae el filtro por
  // horizonte de vencimiento, con default "hoy + vencidos". La de Pagos (histórico)
  // no lo necesita.
  const esProgramacion = estadoInicial === 'pendientes';
  const [horizonte, setHorizonte] = useState(esProgramacion ? 'hoy_vencidos' : 'todos');
  const hoyISO = useMemo(
    () => new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date()),
    []
  );

  const [selected, setSelected] = useState<Pago | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Drill-down (?focus=<pago_id>) desde el hilo del gasto de otros módulos.
  useFocusDrilldown(
    pagos,
    (p) => p.id,
    (row) => {
      setSelected(row);
      setDrawerOpen(true);
    }
  );

  // Acción pendiente: cancelar (confirm) o autorizar+registrar pago (dialog).
  const [cancelarPago, setCancelarPago] = useState<Pago | null>(null);
  const [pagarPago, setPagarPago] = useState<Pago | null>(null);

  // Selección múltiple para CONSOLIDAR varios pagos del mismo proveedor en uno
  // (Fase 2). Solo en la pestaña Programación. `pendingPayId` abre el diálogo de
  // pago sobre el sobreviviente apenas se refresca la lista tras consolidar.
  const [selectedPagoIds, setSelectedPagoIds] = useState<string[]>([]);
  const [pendingPayId, setPendingPayId] = useState<string | null>(null);

  const fetchPagos = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const sb = createSupabaseBrowserClient();
      const { data, error: qErr } = await sb
        .schema('erp')
        .from('cxp_pagos')
        .select(
          'id, proveedor_id, monto_total, estado, metodo_pago, referencia, fecha_programada, fecha_pago, cuenta_bancaria_id, aprobado_at, pagado_at, notas'
        )
        .eq('empresa_id', empresaId)
        .order('created_at', { ascending: false });
      if (qErr) throw qErr;

      type Raw = Omit<
        Pago,
        'proveedor_nombre' | 'cuenta_nombre' | 'monto_total' | 'facturas_count'
      > & {
        monto_total: number | null;
      };
      const rows = (data ?? []) as Raw[];

      // Cuántas facturas cubre cada pago — un pago por proveedor puede agrupar
      // varias (la duda "¿dónde quedó mi factura?" se responde aquí).
      const { data: apls } = await sb
        .schema('erp')
        .from('cxp_pago_aplicaciones')
        .select('pago_id')
        .eq('empresa_id', empresaId);
      const facturasPorPago = new Map<string, number>();
      for (const a of (apls ?? []) as { pago_id: string }[]) {
        facturasPorPago.set(a.pago_id, (facturasPorPago.get(a.pago_id) ?? 0) + 1);
      }

      // Nombres de proveedor (erp.personas) y de cuenta bancaria. Chunk a 150.
      const proveedorIds = [
        ...new Set(rows.map((r) => r.proveedor_id).filter((x): x is string => !!x)),
      ];
      const cuentaIds = [
        ...new Set(rows.map((r) => r.cuenta_bancaria_id).filter((x): x is string => !!x)),
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

      const cuentaPorId = new Map<string, string>();
      if (cuentaIds.length > 0) {
        const { data: cuentas } = await sb
          .schema('erp')
          .from('cuentas_bancarias')
          .select('id, nombre, banco')
          .in('id', cuentaIds);
        for (const c of cuentas ?? []) {
          const nombre = c.banco ? `${c.nombre} · ${c.banco}` : (c.nombre as string);
          cuentaPorId.set(c.id as string, nombre);
        }
      }

      setPagos(
        rows.map((r) => ({
          ...r,
          monto_total: Number(r.monto_total ?? 0),
          proveedor_nombre: r.proveedor_id ? (nombrePorPersona.get(r.proveedor_id) ?? null) : null,
          cuenta_nombre: r.cuenta_bancaria_id
            ? (cuentaPorId.get(r.cuenta_bancaria_id) ?? null)
            : null,
          facturas_count: facturasPorPago.get(r.id) ?? 0,
        }))
      );
    } catch (e) {
      setError(getSupabaseErrorMessage(e, 'No se pudieron cargar los pagos.'));
    } finally {
      setLoading(false);
    }
  }, [empresaId]);

  useEffect(() => {
    void fetchPagos();
  }, [fetchPagos]);

  const filtered = useMemo(() => {
    const porEstado = filtrarPagosPorEstado(pagos, estado);
    return esProgramacion ? filtrarPagosPorHorizonte(porEstado, horizonte, hoyISO) : porEstado;
  }, [pagos, estado, esProgramacion, horizonte, hoyISO]);

  const openDetail = useCallback((p: Pago) => {
    setSelected(p);
    setDrawerOpen(true);
  }, []);

  // ── Selección múltiple para consolidar (Fase 2) ─────────────────────────────
  const selectedPagos = useMemo(
    () => pagos.filter((p) => selectedPagoIds.includes(p.id)),
    [pagos, selectedPagoIds]
  );
  const selProveedorId = selectedPagos[0]?.proveedor_id ?? null;
  const selTotal = selectedPagos.reduce((s, p) => s + p.monto_total, 0);
  const togglePagoSel = useCallback((p: Pago) => {
    setSelectedPagoIds((prev) =>
      prev.includes(p.id) ? prev.filter((id) => id !== p.id) : [...prev, p.id]
    );
  }, []);
  const limpiarPagoSel = useCallback(() => setSelectedPagoIds([]), []);

  // La selección se limpia al cambiar de filtro/horizonte (la lista cambia).
  useEffect(() => {
    setSelectedPagoIds([]);
  }, [estado, horizonte]);

  // Tras consolidar, abre el diálogo de pago sobre el sobreviviente cuando la
  // lista refrescada ya lo contiene.
  useEffect(() => {
    if (!pendingPayId) return;
    const p = pagos.find((x) => x.id === pendingPayId);
    if (p) {
      setPagarPago(p);
      setPendingPayId(null);
    }
  }, [pendingPayId, pagos]);

  // ── Acciones ───────────────────────────────────────────────────────────────

  const doCancelar = useCallback(
    async (pago: Pago, motivo: string) => {
      const sb = createSupabaseBrowserClient();
      const { error } = await sb
        .schema('erp')
        .rpc('cxp_pago_cancelar', { p_pago_id: pago.id, p_motivo: motivo || undefined });
      if (error) {
        feedback.error(getSupabaseErrorMessage(error, 'No se pudo cancelar el pago.'), {
          title: 'No se pudo cancelar',
        });
        throw error;
      }
      feedback.success('Pago cancelado');
      void fetchPagos();
    },
    [feedback, fetchPagos]
  );

  // Consolida los pagos seleccionados (mismo proveedor) en uno y abre el diálogo
  // para autorizarlo y registrarlo con un solo comprobante.
  const doConsolidarYPagar = useCallback(async () => {
    if (selectedPagoIds.length < 2) return;
    const sb = createSupabaseBrowserClient();
    const { data: survivorId, error } = await sb
      .schema('erp')
      .rpc('cxp_pago_consolidar', { p_pago_ids: selectedPagoIds });
    if (error || !survivorId) {
      feedback.error(getSupabaseErrorMessage(error, 'No se pudieron consolidar los pagos.'), {
        title: 'No se pudo consolidar',
      });
      return;
    }
    feedback.success(`${selectedPagoIds.length} pagos consolidados en uno`, {
      description: 'Autorízalo y regístralo con un solo comprobante.',
    });
    setSelectedPagoIds([]);
    await fetchPagos();
    setPendingPayId(survivorId as string);
  }, [selectedPagoIds, feedback, fetchPagos]);

  return (
    <>
      <DesktopOnlyNotice module="Cuentas por Pagar" />
      <div className="hidden sm:block">
        <ModuleFilters
          count={
            loading ? 'Cargando…' : `${filtered.length} pago${filtered.length !== 1 ? 's' : ''}`
          }
        >
          <Combobox
            value={estado}
            onChange={(v) => setEstado(v ?? '')}
            options={ESTADO_OPTIONS}
            placeholder="Todos los estados"
            allowClear
            size="sm"
            className="w-48"
          />

          {esProgramacion && (
            <Combobox
              value={horizonte}
              onChange={(v) => setHorizonte(v ?? 'todos')}
              options={HORIZONTE_OPTIONS}
              placeholder="Horizonte"
              size="sm"
              className="w-44"
            />
          )}

          <Button
            variant="outline"
            size="icon"
            onClick={() => void fetchPagos()}
            aria-label="Actualizar"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
        </ModuleFilters>

        {error && <ErrorBanner error={error} onRetry={() => void fetchPagos()} />}

        {esProgramacion && selectedPagos.length >= 2 && (
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-primary/40 bg-primary/5 px-4 py-2.5">
            <div className="text-sm">
              <span className="font-semibold">{selectedPagos.length}</span> pagos de{' '}
              <span className="font-medium">
                {selectedPagos[0].proveedor_nombre ?? '(sin proveedor)'}
              </span>{' '}
              ·{' '}
              <span className="font-semibold tabular-nums text-amber-600">
                {formatCurrency(selTotal)}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="sm" onClick={limpiarPagoSel}>
                Limpiar
              </Button>
              <Button size="sm" className="gap-2" onClick={() => void doConsolidarYPagar()}>
                <Wallet className="h-3.5 w-3.5" />
                Pagar juntos
              </Button>
            </div>
          </div>
        )}

        <ModuleContent>
          {loading ? (
            <p className="px-4 py-6 text-sm text-muted-foreground sm:px-6">Cargando…</p>
          ) : filtered.length === 0 ? (
            <div className="rounded-xl border bg-card px-6 py-12 text-center">
              <Wallet className="mx-auto h-8 w-8 text-muted-foreground" />
              <p className="mt-2 font-medium">Sin pagos en este estado</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Programa pagos desde la pestaña «Facturas».
              </p>
            </div>
          ) : (
            <div className="overflow-auto rounded-xl border bg-card">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                    {esProgramacion && <th className="w-8 py-2 pl-3 pr-0" />}
                    <th className="py-2 pl-3 pr-2 font-medium">Proveedor</th>
                    <th className="py-2 pr-2 font-medium">Estado</th>
                    <th className="py-2 pr-2 font-medium">Método</th>
                    <th className="py-2 pr-2 font-medium">Programada</th>
                    <th className="py-2 pr-2 font-medium">Pagada</th>
                    <th className="py-2 pr-2 text-right font-medium">Monto</th>
                    <th className="py-2 pl-2 pr-3 text-right font-medium">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((p) => {
                    const b = estadoBadge(p.estado);
                    return (
                      <tr
                        key={p.id}
                        className="cursor-pointer border-b last:border-0 hover:bg-muted/40"
                        onClick={() => openDetail(p)}
                      >
                        {esProgramacion && (
                          <td className="py-2 pl-3 pr-0" onClick={(e) => e.stopPropagation()}>
                            {(() => {
                              const checked = selectedPagoIds.includes(p.id);
                              const elegible = p.estado === 'programado' || p.estado === 'aprobado';
                              const otroProv =
                                !!selProveedorId && p.proveedor_id !== selProveedorId;
                              const disabled = !elegible || (!checked && otroProv);
                              // Motivo del bloqueo (tooltip) para que se entienda al instante.
                              let motivo: string | undefined;
                              if (disabled && !checked) {
                                if (!elegible)
                                  motivo = 'Solo se consolidan pagos programados o aprobados';
                                else if (otroProv)
                                  motivo = `Selección limitada a ${selectedPagos[0]?.proveedor_nombre ?? 'un proveedor'}`;
                              }
                              return (
                                <span title={motivo} aria-label={motivo} className="flex">
                                  <input
                                    type="checkbox"
                                    checked={checked}
                                    disabled={disabled}
                                    onChange={() => togglePagoSel(p)}
                                    aria-label="Seleccionar pago para consolidar"
                                    className="h-4 w-4 cursor-pointer accent-foreground disabled:cursor-not-allowed disabled:opacity-30"
                                  />
                                </span>
                              );
                            })()}
                          </td>
                        )}
                        <td className="py-2 pl-3 pr-2">
                          <div className="truncate font-medium">
                            {p.proveedor_nombre ?? '(sin proveedor)'}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {p.facturas_count} factura{p.facturas_count !== 1 ? 's' : ''}
                            {p.referencia ? (
                              <span className="font-mono"> · {p.referencia}</span>
                            ) : null}
                          </div>
                        </td>
                        <td className="py-2 pr-2">
                          <Badge variant={b.variant} className={b.className}>
                            {b.label}
                          </Badge>
                        </td>
                        <td className="py-2 pr-2 text-muted-foreground">
                          {p.metodo_pago ? (METODO_LABEL[p.metodo_pago] ?? p.metodo_pago) : '—'}
                        </td>
                        <td className="py-2 pr-2 text-muted-foreground">
                          {formatDate(p.fecha_programada)}
                        </td>
                        <td className="py-2 pr-2 text-muted-foreground">
                          {formatDate(p.fecha_pago)}
                        </td>
                        <td className="py-2 pr-2 text-right font-semibold tabular-nums">
                          {formatCurrency(p.monto_total)}
                        </td>
                        <td
                          className="py-2 pl-2 pr-3 text-right"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <div className="flex items-center justify-end gap-1.5">
                            {(p.estado === 'programado' || p.estado === 'aprobado') && (
                              <Button
                                size="sm"
                                className="h-7 gap-1 px-2 text-xs"
                                onClick={() => setPagarPago(p)}
                              >
                                <Wallet className="h-3.5 w-3.5" />
                                Autorizar y registrar
                              </Button>
                            )}
                            {p.estado !== 'pagado' &&
                              p.estado !== 'cancelado' &&
                              p.estado !== 'rechazado' && (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-7 gap-1 px-2 text-xs text-muted-foreground hover:text-destructive"
                                  onClick={() => setCancelarPago(p)}
                                >
                                  <XCircle className="h-3.5 w-3.5" />
                                  Cancelar
                                </Button>
                              )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </ModuleContent>
      </div>

      <PagoDrawer
        pago={selected}
        empresaId={empresaId}
        empresa={empresa}
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        onAutorizarPagar={(p) => {
          setDrawerOpen(false);
          setPagarPago(p);
        }}
        onCancelar={(p) => {
          setDrawerOpen(false);
          setCancelarPago(p);
        }}
      />

      {/* Cancelar — confirmación con motivo (audit trail, p2p-cancelaciones D1).
          Se monta on-demand con key para arrancar con estado fresco. */}
      {cancelarPago && (
        <CancelarConMotivoDialog
          key={cancelarPago.id}
          title="¿Cancelar este pago?"
          description="Se revierten las aplicaciones a las facturas (sus saldos vuelven a abrirse). No se puede cancelar un pago ya ejecutado."
          confirmLabel="Cancelar pago"
          onClose={() => setCancelarPago(null)}
          onConfirm={(motivo) => doCancelar(cancelarPago, motivo)}
        />
      )}

      {/* Autorizar y registrar pago — Dirección. Egreso real: confirmación fuerte
          con fecha + referencia + comprobante. Aprueba (si venía programado) y
          marca pagado en un paso (RPC cxp_pago_autorizar_y_pagar). */}
      {pagarPago && (
        <AutorizarYPagarDialog
          key={pagarPago.id}
          pago={pagarPago}
          empresaId={empresaId}
          empresa={empresa}
          onClose={() => setPagarPago(null)}
          onDone={() => {
            setPagarPago(null);
            void fetchPagos();
          }}
        />
      )}
    </>
  );
}

// ── Drawer de detalle ────────────────────────────────────────────────────────

function PagoDrawer({
  pago,
  empresaId,
  empresa,
  open,
  onClose,
  onAutorizarPagar,
  onCancelar,
}: {
  pago: Pago | null;
  empresaId: string;
  empresa: EmpresaSlug;
  open: boolean;
  onClose: () => void;
  onAutorizarPagar: (pago: Pago) => void;
  onCancelar: (pago: Pago) => void;
}) {
  const [aplicaciones, setAplicaciones] = useState<FacturaAplicada[]>([]);
  const [controlPartidas, setControlPartidas] = useState<PartidaControlCard[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || !pago) return;
    let activo = true;
    (async () => {
      setLoading(true);
      setAplicaciones([]);
      setControlPartidas([]);
      const sb = createSupabaseBrowserClient();
      const { data } = await sb
        .schema('erp')
        .from('cxp_pago_aplicaciones')
        .select(
          'id, monto_aplicado, factura_id, factura:facturas!factura_id(uuid_sat, emisor_nombre, total, saldo, partida_id)'
        )
        .eq('pago_id', pago.id);
      if (!activo) return;

      type Raw = {
        id: string;
        monto_aplicado: number;
        factura_id: string;
        factura: {
          uuid_sat: string | null;
          emisor_nombre: string | null;
          total: number | null;
          saldo: number | null;
          partida_id: string | null;
        } | null;
      };
      const rows = (data ?? []) as unknown as Raw[];
      const apls: FacturaAplicada[] = rows.map((r) => ({
        id: r.id,
        monto_aplicado: Number(r.monto_aplicado),
        factura_id: r.factura_id,
        uuid_sat: r.factura?.uuid_sat ?? null,
        emisor_nombre: r.factura?.emisor_nombre ?? null,
        total: r.factura?.total ?? null,
        saldo: r.factura?.saldo ?? null,
        partida_id: r.factura?.partida_id ?? null,
      }));
      setAplicaciones(apls);

      // Estado de cuenta por partida: contratado / abonado / este pago.
      // Tolerante a fallas parciales — la sección se omite, el drawer vive.
      const partidaIds = [
        ...new Set(apls.map((a) => a.partida_id).filter((x): x is string => !!x)),
      ];
      if (partidaIds.length > 0) {
        const [partidasRes, contratosRes, abonosRes] = await Promise.all([
          sb
            .schema('erp')
            .from('presupuesto_partidas')
            .select('id, concepto_texto, presupuesto_aprobado')
            .in('id', partidaIds),
          sb
            .schema('dilesa')
            .from('contratos_construccion')
            .select('partida_id, codigo, valor_total')
            .in('partida_id', partidaIds)
            .is('deleted_at', null)
            .is('cancelada_at', null),
          sb
            .schema('erp')
            .from('cxp_pago_aplicaciones')
            .select(
              'monto_aplicado, pago_id, factura:facturas!factura_id!inner(partida_id), pago:cxp_pagos!pago_id!inner(estado, deleted_at, fecha_pago, referencia)'
            )
            .in('factura.partida_id', partidaIds)
            .eq('pago.estado', 'pagado')
            .is('pago.deleted_at', null),
        ]);
        if (!activo) return;

        type AbonoRaw = {
          monto_aplicado: number;
          pago_id: string;
          factura: { partida_id: string | null } | null;
          pago: { fecha_pago: string | null; referencia: string | null } | null;
        };
        const abonos: AbonoEjecutado[] = ((abonosRes.data ?? []) as unknown as AbonoRaw[])
          .filter((a) => !!a.factura?.partida_id)
          .map((a) => ({
            pago_id: a.pago_id,
            partida_id: a.factura!.partida_id as string,
            monto: Number(a.monto_aplicado ?? 0),
            fecha: a.pago?.fecha_pago ?? null,
            referencia: a.pago?.referencia ?? null,
          }));

        setControlPartidas(
          armarControlPorPartida({
            pagoId: pago.id,
            aplicacionesDelPago: apls,
            partidas: (partidasRes.data ?? []) as {
              id: string;
              concepto_texto: string | null;
              presupuesto_aprobado: number | null;
            }[],
            contratos: (contratosRes.data ?? []) as {
              partida_id: string | null;
              codigo: string;
              valor_total: number | null;
            }[],
            abonosEjecutados: abonos,
          })
        );
      }
      setLoading(false);
    })();
    return () => {
      activo = false;
    };
  }, [open, pago]);

  const b = pago ? estadoBadge(pago.estado) : null;

  // Set completo de acciones del documento en el footer (ADR-044) — los mismos
  // gates por estado que los botones de la fila; el RPC valida el rol al final.
  const puedeCancelar =
    !!pago &&
    pago.estado !== 'pagado' &&
    pago.estado !== 'cancelado' &&
    pago.estado !== 'rechazado';
  const conAcciones =
    !!pago && (pago.estado === 'programado' || pago.estado === 'aprobado' || puedeCancelar);

  return (
    <DetailDrawer
      open={open}
      onOpenChange={(v) => !v && onClose()}
      size="lg"
      title={pago?.proveedor_nombre ?? 'Pago'}
      description={pago ? `${formatCurrency(pago.monto_total)} · ${pago.estado}` : undefined}
      meta={
        b ? (
          <Badge variant={b.variant} className={b.className}>
            {b.label}
          </Badge>
        ) : null
      }
      footer={
        conAcciones ? (
          <div className="flex flex-wrap items-center gap-2">
            {pago.estado === 'programado' || pago.estado === 'aprobado' ? (
              <Button className="gap-1.5" onClick={() => onAutorizarPagar(pago)}>
                <Wallet className="h-4 w-4" />
                Autorizar y registrar pago
              </Button>
            ) : null}
            {puedeCancelar ? (
              <Button
                variant="ghost"
                className="ml-auto gap-1.5 text-muted-foreground hover:text-destructive"
                onClick={() => onCancelar(pago)}
              >
                <XCircle className="h-4 w-4" />
                Cancelar
              </Button>
            ) : null}
          </div>
        ) : null
      }
    >
      <DetailDrawerContent>
        {!pago ? null : (
          <div className="space-y-6">
            <HiloGastoSection empresa={empresa} documento={{ tipo: 'pago', id: pago.id }} />

            <Separator />

            {/* Datos del pago */}
            <section className="space-y-2 text-sm">
              <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Pago
              </div>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
                <Field
                  label="Método"
                  value={
                    pago.metodo_pago ? (METODO_LABEL[pago.metodo_pago] ?? pago.metodo_pago) : '—'
                  }
                />
                <Field label="Referencia" value={pago.referencia ?? '—'} mono />
                <Field label="Cuenta bancaria" value={pago.cuenta_nombre ?? '—'} />
                <Field label="Fecha programada" value={formatDate(pago.fecha_programada)} />
                <Field label="Fecha de pago" value={formatDate(pago.fecha_pago)} />
              </div>
            </section>

            <Separator />

            {/* Trazabilidad */}
            <section className="space-y-2 text-sm">
              <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Trazabilidad
              </div>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
                <Field label="Aprobado" value={formatDate(pago.aprobado_at)} />
                <Field label="Pagado" value={formatDate(pago.pagado_at)} />
              </div>
              {pago.notas ? (
                <p className="rounded-lg border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
                  {pago.notas}
                </p>
              ) : null}
            </section>

            <Separator />

            {/* Facturas aplicadas */}
            <section className="space-y-2 text-sm">
              <div className="flex items-center justify-between">
                <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Facturas aplicadas
                </div>
                <span className="tabular-nums text-xs font-medium">
                  {formatCurrency(pago.monto_total)}
                </span>
              </div>
              {loading ? (
                <p className="text-muted-foreground">Cargando…</p>
              ) : aplicaciones.length === 0 ? (
                <p className="text-muted-foreground">Sin aplicaciones.</p>
              ) : (
                <ul className="space-y-1.5">
                  {aplicaciones.map((a) => (
                    <li
                      key={a.id}
                      className="flex items-center justify-between rounded-lg border bg-muted/30 px-3 py-1.5"
                    >
                      <div className="min-w-0">
                        <div className="truncate font-medium">{a.emisor_nombre ?? '(factura)'}</div>
                        {a.uuid_sat ? (
                          <div className="font-mono text-xs text-muted-foreground">
                            {a.uuid_sat.slice(0, 8)}…
                          </div>
                        ) : null}
                      </div>
                      <span className="tabular-nums font-medium">
                        {formatCurrency(a.monto_aplicado)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {controlPartidas.length > 0 && (
              <>
                <Separator />

                {/* Estado de cuenta por partida: contratado / abonado / este pago */}
                <section className="space-y-2 text-sm">
                  <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Control por partida
                  </div>
                  <div className="space-y-2">
                    {controlPartidas.map((c) => {
                      const referencia = c.contratado ?? c.presupuesto;
                      const despues = c.abonadoPrevio + c.estePago;
                      const porAbonar = referencia != null ? referencia - despues : null;
                      const pct =
                        referencia != null && referencia > 0
                          ? Math.round((despues / referencia) * 100)
                          : null;
                      const yaPagado = pago.estado === 'pagado';
                      return (
                        <div key={c.partida_id} className="rounded-lg border bg-muted/30 px-3 py-2">
                          <div className="flex items-baseline justify-between gap-2">
                            <span className="font-medium">{c.concepto}</span>
                            <span className="whitespace-nowrap text-xs text-muted-foreground">
                              {c.contratado != null
                                ? `${c.contratoCodigo ? `Contrato ${c.contratoCodigo} · ` : ''}contratado ${formatCurrency(c.contratado)}`
                                : c.presupuesto != null
                                  ? `presupuesto ${formatCurrency(c.presupuesto)}`
                                  : 'sin contrato ni presupuesto'}
                            </span>
                          </div>
                          <dl className="mt-1.5 space-y-0.5 text-xs">
                            <div className="flex justify-between">
                              <dt className="text-muted-foreground">Abonado previo</dt>
                              <dd className="tabular-nums">{formatCurrency(c.abonadoPrevio)}</dd>
                            </div>
                            <div className="flex justify-between">
                              <dt className="text-muted-foreground">Este pago</dt>
                              <dd className="tabular-nums font-medium">
                                + {formatCurrency(c.estePago)}
                              </dd>
                            </div>
                            <div className="flex justify-between border-t pt-0.5 font-medium">
                              <dt>
                                {yaPagado ? 'Abonado (incluye este pago)' : 'Quedará abonado'}
                              </dt>
                              <dd className="tabular-nums">
                                {formatCurrency(despues)}
                                {pct != null ? ` (${pct}%)` : ''}
                              </dd>
                            </div>
                            {porAbonar != null && (
                              <div className="flex justify-between">
                                <dt className="text-muted-foreground">
                                  {c.contratado != null
                                    ? 'Por abonar del contrato'
                                    : 'Por abonar del presupuesto'}
                                </dt>
                                <dd className="tabular-nums">{formatCurrency(porAbonar)}</dd>
                              </div>
                            )}
                          </dl>
                          <div className="mt-1.5 border-t pt-1.5">
                            <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                              Abonos anteriores
                            </div>
                            {c.abonos.length === 0 ? (
                              <p className="text-xs text-muted-foreground">Sin abonos previos.</p>
                            ) : (
                              <ul className="mt-0.5 space-y-0.5 text-xs">
                                {c.abonos.map((a) => (
                                  <li key={a.pago_id} className="flex justify-between gap-2">
                                    <span className="truncate text-muted-foreground">
                                      {formatDate(a.fecha)}
                                      {a.referencia ? (
                                        <span className="font-mono"> · {a.referencia}</span>
                                      ) : null}
                                    </span>
                                    <span className="tabular-nums">{formatCurrency(a.monto)}</span>
                                  </li>
                                ))}
                              </ul>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </section>
              </>
            )}

            <Separator />

            {/* Comprobante (imagen/PDF de la transferencia o cheque) */}
            <section className="space-y-2 text-sm">
              <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Comprobante
              </div>
              <FileAttachments
                empresaId={empresaId}
                empresaSlug={empresa}
                entidad="cxp_pagos"
                entidadId={pago.id}
                roles={COMPROBANTE_ROLES}
                variant="flat"
                readOnly={pago.estado === 'cancelado' || pago.estado === 'rechazado'}
              />
            </section>
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

// ── Dialog: marcar pagado (egreso real) ────────────────────────────────────────

function AutorizarYPagarDialog({
  pago,
  empresaId,
  empresa,
  onClose,
  onDone,
}: {
  /** Siempre presente: el padre monta este dialog on-demand con key. */
  pago: Pago;
  empresaId: string;
  empresa: EmpresaSlug;
  onClose: () => void;
  onDone: () => void;
}) {
  const feedback = useActionFeedback();
  const [fecha, setFecha] = useState(() => new Date().toISOString().slice(0, 10));
  const [referencia, setReferencia] = useState(pago.referencia ?? '');
  const [submitting, setSubmitting] = useState(false);

  // Espejo del gate server (cxp_pago_autorizar_y_pagar): no se puede registrar el
  // pago sin fecha y sin comprobante cargado. `entidad_tipo='cxp_pago'` (singular)
  // es como FileAttachments guarda los adjuntos de 'cxp_pagos'.
  const { adjuntos, refresh } = useAdjuntos({
    empresaId,
    entidadTipo: 'cxp_pago',
    entidadId: pago.id,
  });
  const tieneComprobante = adjuntos.some((a) => a.rol === 'comprobante');
  const puedeRegistrar = !!fecha && tieneComprobante && !submitting;

  const handleSubmit = async () => {
    setSubmitting(true);
    const sb = createSupabaseBrowserClient();
    // Aprueba (si venía 'programado') y marca pagado en un paso. El RPC valida
    // rol Dirección server-side.
    const { error } = await sb.schema('erp').rpc('cxp_pago_autorizar_y_pagar', {
      p_pago_id: pago.id,
      p_fecha_pago: fecha || undefined,
      p_referencia: referencia || undefined,
    });
    setSubmitting(false);
    if (error) {
      feedback.error(getSupabaseErrorMessage(error, 'No se pudo autorizar y registrar el pago.'), {
        title: 'No se pudo registrar el pago',
      });
      return;
    }
    feedback.success('Pago autorizado y registrado', {
      description: pago.cuenta_nombre
        ? 'Se emitió el movimiento bancario (egreso) en la cuenta.'
        : 'Sin cuenta bancaria: no se emitió movimiento. Concílialo manualmente.',
    });
    onDone();
  };

  return (
    <Dialog open onOpenChange={(v) => !v && !submitting && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Autorizar y registrar pago</DialogTitle>
          <DialogDescription>
            Autoriza y registra el egreso de <strong>{formatCurrency(pago.monto_total)}</strong> a{' '}
            <strong>{pago.proveedor_nombre ?? '(sin proveedor)'}</strong>.{' '}
            {pago.cuenta_nombre
              ? `Se emitirá un cargo en «${pago.cuenta_nombre}».`
              : 'Este pago no tiene cuenta bancaria: no se emitirá movimiento.'}{' '}
            Solo Dirección puede hacerlo. Registra dinero saliendo y no es reversible
            automáticamente.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <label className="text-xs text-muted-foreground" htmlFor="fecha-pago">
              Fecha de pago
            </label>
            <Input
              id="fecha-pago"
              type="date"
              value={fecha}
              onChange={(e) => setFecha(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs text-muted-foreground" htmlFor="ref-pago">
              Referencia (folio cheque / # transferencia)
            </label>
            <Input
              id="ref-pago"
              value={referencia}
              onChange={(e) => setReferencia(e.target.value)}
              placeholder="Ej. SPEI 0123456789"
            />
          </div>
          <div className="space-y-1.5">
            <span className="text-xs text-muted-foreground">
              Comprobante (imagen o PDF de la transferencia) — obligatorio
            </span>
            <FileAttachments
              empresaId={empresaId}
              empresaSlug={empresa}
              entidad="cxp_pagos"
              entidadId={pago.id}
              roles={COMPROBANTE_ROLES}
              variant="flat"
              onChange={() => void refresh()}
            />
          </div>

          {!puedeRegistrar && !submitting && (
            <p className="text-[11px] text-amber-600">
              {!fecha
                ? 'Indica la fecha de pago para continuar.'
                : 'Sube el comprobante del pago para continuar.'}
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={submitting}>
            Cancelar
          </Button>
          <Button onClick={() => void handleSubmit()} disabled={!puedeRegistrar}>
            {submitting ? 'Registrando…' : 'Autorizar y registrar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
