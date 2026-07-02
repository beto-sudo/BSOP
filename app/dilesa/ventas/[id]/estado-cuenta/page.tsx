'use client';

/**
 * Tab "Estado de cuenta" del expediente de venta DILESA — CxC: cargos + abonos
 * + saldo/saldo a favor, generar plan de pagos, registrar abono, subir recibo
 * de caja, e impresión del estado de cuenta / recibo. Consume el
 * `VentaDetalleProvider` montado por el layout `[id]/layout.tsx`. Extraído de
 * Operación en el Sprint 2 de `dilesa-ventas-expediente-tabs`.
 *
 * @module Venta · Estado de cuenta (DILESA)
 * @responsive desktop-only
 */

import { AlertTriangle, Paperclip, Plus, Printer } from 'lucide-react';
import { RequireAccess } from '@/components/require-access';
import { Badge } from '@/components/ui/badge';
import { AbonoCaptureDrawer } from '@/components/dilesa/abono-capture-drawer';
import { EstadoCuentaPrintable } from '@/components/dilesa/estado-cuenta-printable';
import { ReciboCajaPrintable } from '@/components/dilesa/recibo-caja-printable';
import { DetailDrawer, DetailDrawerContent } from '@/components/detail-page';
import { useVentaDetalle } from '@/components/dilesa/venta-detalle/provider';
import { Section, ResumenItem, AdjuntoLink } from '@/components/dilesa/venta-detalle/ui';
import {
  moneyFmt,
  fmtFecha,
  capitalizar,
  fuenteLabel,
  fuenteTone,
  estadoTone,
} from '@/components/dilesa/venta-detalle/types';
import { hoyISOMatamoros } from '@/lib/fecha-mx';

export default function VentaEstadoCuentaPage() {
  return (
    <RequireAccess empresa="dilesa" modulo="dilesa.ventas.estado_cuenta">
      <EstadoCuentaBody />
    </RequireAccess>
  );
}

function EstadoCuentaBody() {
  const d = useVentaDetalle();
  const {
    ventaId: id,
    venta,
    persona,
    unidad,
    proyectoNombre,
    prototipoNombre,
    clienteNombre,
    cargos,
    abonos,
    aplicadoPorAbono,
    comprobantesPorAbono,
    totalACobrar,
    totalCobrado,
    saldoPendiente,
    saldoFavor,
    abonoOpen,
    setAbonoOpen,
    estadoCuentaOpen,
    setEstadoCuentaOpen,
    reciboAbono,
    setReciboAbono,
    subiendoReciboId,
    reciboFileInputRef,
    reciboUploadAbonoIdRef,
    triggerPrint,
    bumpRefresh,
    handleGenerarPlan,
    handleReciboFileChange,
  } = d;
  if (!venta) return null;

  return (
    <div className="space-y-6">
      <Section
        title="Estado de cuenta"
        description={
          cargos.length === 0
            ? 'sin plan de pagos'
            : `saldo ${moneyFmt.format(saldoPendiente)} de ${moneyFmt.format(totalACobrar)}`
        }
      >
        <div className="mb-4 flex flex-wrap justify-end gap-2">
          {cargos.length === 0 ? (
            <button
              type="button"
              onClick={handleGenerarPlan}
              className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 py-1.5 text-sm text-[var(--text)] hover:bg-[var(--panel)]"
            >
              Generar plan
            </button>
          ) : null}
          {cargos.length > 0 || abonos.length > 0 ? (
            <button
              type="button"
              onClick={() => setEstadoCuentaOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 py-1.5 text-sm text-[var(--text)] hover:bg-[var(--panel)]"
            >
              <Printer className="h-4 w-4" /> Imprimir estado de cuenta
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => setAbonoOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--text)] px-3 py-1.5 text-sm font-medium text-[var(--card)] hover:opacity-90"
          >
            <Plus className="h-4 w-4" /> Registrar abono
          </button>
        </div>
        {cargos.length === 0 && abonos.length === 0 ? (
          <p className="text-sm text-[var(--text)]/60">
            Sin plan de pagos generado para esta venta.
          </p>
        ) : (
          <div className="space-y-6">
            {saldoFavor > 0 ? (
              <div className="flex items-start gap-2 rounded-lg border border-amber-400/50 bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950/30 dark:text-amber-100">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <div className="space-y-1">
                  <p className="font-medium">
                    Hay {moneyFmt.format(saldoFavor)} en abonos sin aplicar (saldo a favor).
                  </p>
                  <p>
                    {cargos.length === 0
                      ? 'La venta no tiene plan de pagos, así que los abonos quedaron flotando: no bajaron saldo ni avanzaron la fase. Genera el plan de pagos; los abonos ya registrados deben re-aplicarse manualmente (revísalo con quien lleva CxC).'
                      : 'El monto excede los cargos abiertos. Verifica el plan de pagos o el monto capturado.'}
                  </p>
                </div>
              </div>
            ) : null}
            <div className="flex flex-wrap gap-x-8 gap-y-3">
              <ResumenItem label="A cobrar" value={moneyFmt.format(totalACobrar)} />
              <ResumenItem label="Cobrado" value={moneyFmt.format(totalCobrado)} />
              <ResumenItem label="Saldo" value={moneyFmt.format(saldoPendiente)} />
              {saldoFavor > 0 ? (
                <ResumenItem label="Saldo a favor" value={moneyFmt.format(saldoFavor)} warn />
              ) : null}
            </div>

            {cargos.length > 0 ? (
              <div>
                <div className="mb-1.5 text-xs font-medium uppercase tracking-wide text-[var(--text)]/50">
                  Cargos
                </div>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-[var(--border)] text-left text-xs uppercase tracking-wide text-[var(--text)]/50">
                      <th className="py-1 pr-2 font-medium">Concepto</th>
                      <th className="py-1 pr-2 font-medium">Vence</th>
                      <th className="py-1 pr-2 font-medium">Fuente</th>
                      <th className="py-1 pr-2 text-right font-medium">Monto</th>
                      <th className="py-1 pr-2 text-right font-medium">Pagado</th>
                      <th className="py-1 pr-2 text-right font-medium">Saldo</th>
                      <th className="py-1 pl-2 font-medium">Estado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {cargos.map((c) => (
                      <tr key={c.id} className="border-b border-[var(--border)]/40">
                        <td className="py-1.5 pr-2">{c.concepto ?? capitalizar(c.tipo_cargo)}</td>
                        <td className="py-1.5 pr-2 text-[var(--text)]/70">
                          {fmtFecha(c.fecha_vencimiento) ?? '—'}
                        </td>
                        <td className="py-1.5 pr-2">
                          <Badge tone={fuenteTone(c.fuente_esperada)}>
                            {fuenteLabel(c.fuente_esperada)}
                          </Badge>
                        </td>
                        <td className="py-1.5 pr-2 text-right tabular-nums">
                          {moneyFmt.format(c.monto)}
                        </td>
                        <td className="py-1.5 pr-2 text-right tabular-nums text-[var(--text)]/70">
                          {moneyFmt.format(c.monto_pagado)}
                        </td>
                        <td className="py-1.5 pr-2 text-right tabular-nums">
                          {moneyFmt.format(c.saldo)}
                        </td>
                        <td className="py-1.5 pl-2">
                          <Badge tone={estadoTone(c.estado)}>{capitalizar(c.estado)}</Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}

            {abonos.length > 0 ? (
              <div>
                <div className="mb-1.5 text-xs font-medium uppercase tracking-wide text-[var(--text)]/50">
                  Abonos
                </div>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-[var(--border)] text-left text-xs uppercase tracking-wide text-[var(--text)]/50">
                      <th className="py-1 pr-2 font-medium">Fecha</th>
                      <th className="py-1 pr-2 font-medium">Fuente</th>
                      <th className="py-1 pr-2 text-right font-medium">Monto</th>
                      <th className="py-1 pr-2 text-right font-medium">Aplicado</th>
                      <th className="py-1 pr-2 text-right font-medium">Saldo a favor</th>
                      <th className="py-1 pr-2 font-medium">Recibo fiscal</th>
                      <th className="py-1 pr-2 font-medium">Comprobante</th>
                      <th className="py-1 pl-2 font-medium"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {abonos.map((a) => {
                      const aplicado = aplicadoPorAbono.get(a.id) ?? 0;
                      const favor = a.monto_total - aplicado;
                      const tieneReciboCaja = (comprobantesPorAbono.get(a.id) ?? []).some(
                        (adj) => adj.rol === 'recibo_caja'
                      );
                      return (
                        <tr key={a.id} className="border-b border-[var(--border)]/40">
                          <td className="py-1.5 pr-2">{fmtFecha(a.fecha) ?? '—'}</td>
                          <td className="py-1.5 pr-2">
                            <Badge tone={fuenteTone(a.fuente)}>{fuenteLabel(a.fuente)}</Badge>
                          </td>
                          <td className="py-1.5 pr-2 text-right tabular-nums">
                            {moneyFmt.format(a.monto_total)}
                          </td>
                          <td className="py-1.5 pr-2 text-right tabular-nums text-[var(--text)]/70">
                            {moneyFmt.format(aplicado)}
                          </td>
                          <td className="py-1.5 pr-2 text-right tabular-nums">
                            {favor > 0 ? (
                              <span className="font-medium text-amber-600">
                                {moneyFmt.format(favor)}
                              </span>
                            ) : (
                              <span className="text-[var(--text)]/30">—</span>
                            )}
                          </td>
                          <td className="py-1.5 pr-2">
                            {a.uuid_sat ? (
                              <Badge tone="success">
                                <span title={`Folio fiscal ${a.uuid_sat}`}>
                                  XML ✓ …{a.uuid_sat.slice(-6)}
                                </span>
                              </Badge>
                            ) : (
                              <span
                                className="text-[var(--text)]/40"
                                title="Abono registrado sin XML del recibo de caja"
                              >
                                sin XML
                              </span>
                            )}
                          </td>
                          <td className="py-1.5 pr-2">
                            <div className="flex flex-wrap gap-1">
                              {(comprobantesPorAbono.get(a.id) ?? []).map((adj) => (
                                <AdjuntoLink key={adj.id} a={adj} compact />
                              ))}
                              {(comprobantesPorAbono.get(a.id) ?? []).length === 0 ? (
                                <span className="text-[var(--text)]/30">—</span>
                              ) : null}
                            </div>
                          </td>
                          <td className="py-1.5 pl-2 text-right">
                            <div className="inline-flex items-center gap-1">
                              {/* Un abono de institución (disposición del crédito) no
                                  lleva recibo de caja facturable: sumarlo duplicaría el
                                  Valor Facturado en la cuadratura (bug 2026-06-12). */}
                              {!tieneReciboCaja && a.fuente !== 'institucion' ? (
                                <button
                                  type="button"
                                  onClick={() => {
                                    reciboUploadAbonoIdRef.current = a.id;
                                    reciboFileInputRef.current?.click();
                                  }}
                                  disabled={subiendoReciboId === a.id}
                                  className="inline-flex items-center gap-1 rounded-lg border border-[var(--border)] bg-[var(--card)] px-2 py-1 text-xs text-[var(--text)] hover:bg-[var(--panel)] disabled:opacity-50"
                                  title="Adjuntar recibo de caja / factura (CxC)"
                                >
                                  <Paperclip className="h-3 w-3" />
                                  {subiendoReciboId === a.id ? 'Subiendo...' : 'Subir recibo'}
                                </button>
                              ) : null}
                              <button
                                type="button"
                                onClick={() => setReciboAbono(a)}
                                className="inline-flex items-center gap-1 rounded-lg border border-[var(--border)] bg-[var(--card)] px-2 py-1 text-xs text-[var(--text)] hover:bg-[var(--panel)]"
                                title="Imprimir recibo de caja"
                              >
                                <Printer className="h-3 w-3" /> Recibo
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                <input
                  ref={reciboFileInputRef}
                  type="file"
                  accept=".pdf,.jpg,.jpeg,.png,.webp,.heic"
                  className="hidden"
                  onChange={(e) => void handleReciboFileChange(e.target.files?.[0] ?? null)}
                />
              </div>
            ) : null}
          </div>
        )}
      </Section>

      <AbonoCaptureDrawer
        open={abonoOpen}
        onOpenChange={setAbonoOpen}
        ventaId={id}
        empresaId={venta.empresa_id}
        personaId={venta.persona_id}
        clienteNombre={clienteNombre}
        clienteRfc={persona?.rfc ?? null}
        onDone={bumpRefresh}
      />

      {/* Estado de cuenta imprimible — el documento vive dentro del drawer; el
          aislamiento de impresión lo da la maquinaria del repo
          (data-print-sheet-open + @media print en globals.css), igual que el
          kardex. El título del header va print:hidden para que el membrete del
          documento sea el encabezado impreso. */}
      <DetailDrawer
        open={estadoCuentaOpen}
        onOpenChange={setEstadoCuentaOpen}
        size="lg"
        title={<span className="print:hidden">Estado de cuenta</span>}
        description={<span className="print:hidden">{clienteNombre}</span>}
        actions={
          <button
            type="button"
            onClick={triggerPrint}
            className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--text)] px-3 py-1.5 text-sm font-medium text-[var(--card)] hover:opacity-90"
          >
            <Printer className="h-4 w-4" /> Imprimir
          </button>
        }
      >
        <DetailDrawerContent>
          <EstadoCuentaPrintable
            cliente={{
              nombre: clienteNombre,
              rfc: persona?.rfc,
              telefono: persona?.telefono,
              email: persona?.email,
            }}
            operacion={{
              proyecto: proyectoNombre,
              unidad: unidad?.identificador,
              prototipo: prototipoNombre,
              tipoCredito: venta.tipo_credito,
              valorEscrituracion: venta.valor_escrituracion,
              asesor: d.vendedorNombre ?? venta.vendedor,
            }}
            cargos={cargos.map((c) => ({
              concepto: c.concepto ?? capitalizar(c.tipo_cargo),
              vence: c.fecha_vencimiento,
              fuente: c.fuente_esperada,
              monto: c.monto,
              pagado: c.monto_pagado,
              saldo: c.saldo,
              estado: c.estado,
            }))}
            abonos={abonos.map((a) => ({
              fecha: a.fecha,
              fuente: a.fuente,
              formaPago: a.forma_pago,
              monto: a.monto_total,
              aplicado: aplicadoPorAbono.get(a.id) ?? 0,
            }))}
            totales={{
              aCobrar: totalACobrar,
              cobrado: totalCobrado,
              saldo: saldoPendiente,
              saldoFavor,
            }}
            fechaCorteISO={hoyISOMatamoros()}
          />
        </DetailDrawerContent>
      </DetailDrawer>

      <DetailDrawer
        open={!!reciboAbono}
        onOpenChange={(o) => !o && setReciboAbono(null)}
        size="md"
        title={<span className="print:hidden">Recibo de caja</span>}
        description={<span className="print:hidden">{clienteNombre}</span>}
        actions={
          <button
            type="button"
            onClick={triggerPrint}
            className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--text)] px-3 py-1.5 text-sm font-medium text-[var(--card)] hover:opacity-90"
          >
            <Printer className="h-4 w-4" /> Imprimir
          </button>
        }
      >
        <DetailDrawerContent>
          {reciboAbono ? (
            <ReciboCajaPrintable
              folio={`RC-${reciboAbono.id.slice(0, 8).toUpperCase()}`}
              fechaISO={reciboAbono.fecha}
              cliente={clienteNombre}
              concepto={
                [proyectoNombre, unidad?.identificador].filter(Boolean).join(' · ')
                  ? `Abono a cuenta — ${[proyectoNombre, unidad?.identificador]
                      .filter(Boolean)
                      .join(' · ')}`
                  : 'Abono a cuenta'
              }
              monto={reciboAbono.monto_total}
              formaPago={reciboAbono.forma_pago}
              referencia={reciboAbono.referencia}
              fuente={reciboAbono.fuente}
            />
          ) : null}
        </DetailDrawerContent>
      </DetailDrawer>
    </div>
  );
}
