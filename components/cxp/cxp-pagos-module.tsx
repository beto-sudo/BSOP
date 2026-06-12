'use client';

/**
 * CxP · Pagos — módulo compartido cross-empresa (ADR-011, SM1-SM6).
 *
 * Lista los pagos a proveedores (`erp.cxp_pagos`) por estado
 * (programado / aprobado / pagado / cancelado) con filtro de estado.
 * Acciones por pago según su estado, todas cableadas a las RPCs que ya
 * validan server-side (ADR-037):
 *
 *   - Aprobar (programado → aprobado): `cxp_pago_aprobar`. El RPC gatea
 *     rol "Dirección"; si el caller no lo es, se muestra el error del RPC
 *     con un toast claro. El botón NO se esconde por rol en cliente —
 *     defensa: manda el RPC.
 *   - Marcar pagado (aprobado → pagado): dialog con fecha + referencia +
 *     comprobante (imagen/PDF de la transferencia, `<FileAttachments>`
 *     sobre `erp.adjuntos`), `cxp_pago_marcar_pagado`. **Confirmación
 *     fuerte** (egreso real).
 *   - Cancelar (si no pagado): `cxp_pago_cancelar` con motivo.
 *
 * Filtro default `'pendientes'` = programados + aprobados: lo vivo que aún
 * no se ejecuta nunca sale de la vista hasta estar pagado.
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
import { CheckCircle2, RefreshCw, Wallet, XCircle } from 'lucide-react';

import { ModuleFilters, ModuleContent, ErrorBanner } from '@/components/module-page';
import { DesktopOnlyNotice } from '@/components/responsive';
import { DetailDrawer, DetailDrawerContent } from '@/components/detail-page';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
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
import { FileAttachments } from '@/components/file-attachments';
import type { EmpresaSlug } from '@/lib/empresa-branding';
import { HiloGastoSection } from '@/components/gasto/hilo-gasto-stepper';
import { useFocusDrilldown } from '@/hooks/use-focus-drilldown';

const TZ = 'America/Matamoros';

export type CxpPagosModuleProps = {
  /** UUID de la empresa (`core.empresas.id`). Filtra todas las queries. */
  empresaId: string;
  /** Slug de la empresa para armar links del hilo del gasto (dilesa, rdb, …). */
  empresa: EmpresaSlug;
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

// ── Módulo ─────────────────────────────────────────────────────────────────────

export function CxpPagosModule({ empresaId, empresa }: CxpPagosModuleProps) {
  const feedback = useActionFeedback();
  const [pagos, setPagos] = useState<Pago[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [estado, setEstado] = useState('pendientes');

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

  // Acción pendiente: aprobar / cancelar (confirm) o marcar pagado (dialog).
  const [aprobarPago, setAprobarPago] = useState<Pago | null>(null);
  const [cancelarPago, setCancelarPago] = useState<Pago | null>(null);
  const [pagarPago, setPagarPago] = useState<Pago | null>(null);

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

  const filtered = useMemo(() => filtrarPagosPorEstado(pagos, estado), [pagos, estado]);

  const openDetail = useCallback((p: Pago) => {
    setSelected(p);
    setDrawerOpen(true);
  }, []);

  // ── Acciones ───────────────────────────────────────────────────────────────

  const doAprobar = useCallback(
    async (pago: Pago) => {
      const sb = createSupabaseBrowserClient();
      const { error } = await sb.schema('erp').rpc('cxp_pago_aprobar', { p_pago_id: pago.id });
      if (error) {
        // El RPC valida Dirección server-side; muestra su error elegante.
        feedback.error(getSupabaseErrorMessage(error, 'No se pudo aprobar el pago.'), {
          title: 'No se pudo aprobar',
        });
        throw error; // mantiene el ConfirmDialog abierto
      }
      feedback.success('Pago aprobado');
      void fetchPagos();
    },
    [feedback, fetchPagos]
  );

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

        <ModuleContent>
          {loading ? (
            <p className="px-4 py-6 text-sm text-muted-foreground sm:px-6">Cargando…</p>
          ) : filtered.length === 0 ? (
            <div className="rounded-xl border bg-card px-6 py-12 text-center">
              <Wallet className="mx-auto h-8 w-8 text-muted-foreground" />
              <p className="mt-2 font-medium">Sin pagos en este estado</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Programa pagos desde la pestaña «Programación».
              </p>
            </div>
          ) : (
            <div className="overflow-auto rounded-xl border bg-card">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
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
                            {p.estado === 'programado' && (
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 gap-1 px-2 text-xs"
                                onClick={() => setAprobarPago(p)}
                              >
                                <CheckCircle2 className="h-3.5 w-3.5" />
                                Aprobar
                              </Button>
                            )}
                            {p.estado === 'aprobado' && (
                              <Button
                                size="sm"
                                className="h-7 gap-1 px-2 text-xs"
                                onClick={() => setPagarPago(p)}
                              >
                                <Wallet className="h-3.5 w-3.5" />
                                Marcar pagado
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
        onAprobar={(p) => {
          setDrawerOpen(false);
          setAprobarPago(p);
        }}
        onMarcarPagado={(p) => {
          setDrawerOpen(false);
          setPagarPago(p);
        }}
        onCancelar={(p) => {
          setDrawerOpen(false);
          setCancelarPago(p);
        }}
      />

      {/* Aprobar — confirmación (el RPC valida Dirección). */}
      <ConfirmDialog
        open={!!aprobarPago}
        onOpenChange={(v) => !v && setAprobarPago(null)}
        onConfirm={async () => {
          if (aprobarPago) await doAprobar(aprobarPago);
        }}
        title="¿Aprobar este pago?"
        description={
          aprobarPago ? (
            <>
              Vas a aprobar el pago de{' '}
              <strong>{aprobarPago.proveedor_nombre ?? '(sin proveedor)'}</strong> por{' '}
              <strong>{formatCurrency(aprobarPago.monto_total)}</strong>. Solo Dirección puede
              aprobar pagos; si no tienes ese rol, la acción será rechazada.
            </>
          ) : null
        }
        confirmLabel="Aprobar"
        confirmVariant="default"
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

      {/* Marcar pagado — egreso real, confirmación fuerte con fecha + referencia. */}
      {pagarPago && (
        <MarcarPagadoDialog
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
  onAprobar,
  onMarcarPagado,
  onCancelar,
}: {
  pago: Pago | null;
  empresaId: string;
  empresa: EmpresaSlug;
  open: boolean;
  onClose: () => void;
  onAprobar: (pago: Pago) => void;
  onMarcarPagado: (pago: Pago) => void;
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
            {pago.estado === 'programado' ? (
              <Button variant="outline" className="gap-1.5" onClick={() => onAprobar(pago)}>
                <CheckCircle2 className="h-4 w-4" />
                Aprobar
              </Button>
            ) : null}
            {pago.estado === 'aprobado' ? (
              <Button className="gap-1.5" onClick={() => onMarcarPagado(pago)}>
                <Wallet className="h-4 w-4" />
                Marcar pagado
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

function MarcarPagadoDialog({
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

  const handleSubmit = async () => {
    setSubmitting(true);
    const sb = createSupabaseBrowserClient();
    const { error } = await sb.schema('erp').rpc('cxp_pago_marcar_pagado', {
      p_pago_id: pago.id,
      p_fecha_pago: fecha || undefined,
      p_referencia: referencia || undefined,
    });
    setSubmitting(false);
    if (error) {
      feedback.error(getSupabaseErrorMessage(error, 'No se pudo marcar como pagado.'), {
        title: 'No se pudo marcar pagado',
      });
      return;
    }
    feedback.success('Pago marcado como pagado', {
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
          <DialogTitle>Marcar pago como pagado</DialogTitle>
          <DialogDescription>
            Confirma el egreso de <strong>{formatCurrency(pago.monto_total)}</strong> a{' '}
            <strong>{pago.proveedor_nombre ?? '(sin proveedor)'}</strong>.{' '}
            {pago.cuenta_nombre
              ? `Se emitirá un cargo en «${pago.cuenta_nombre}».`
              : 'Este pago no tiene cuenta bancaria: no se emitirá movimiento.'}{' '}
            Esta acción registra dinero saliendo y no es reversible automáticamente.
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
              Comprobante (imagen o PDF de la transferencia)
            </span>
            <FileAttachments
              empresaId={empresaId}
              empresaSlug={empresa}
              entidad="cxp_pagos"
              entidadId={pago.id}
              roles={COMPROBANTE_ROLES}
              variant="flat"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={submitting}>
            Cancelar
          </Button>
          <Button onClick={() => void handleSubmit()} disabled={submitting}>
            {submitting ? 'Registrando…' : 'Confirmar pago'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
