'use client';

/**
 * Tab "Operación" del expediente de venta DILESA — el home del detalle.
 *
 * Copiloto de cierre + documentos PDF + movimientos administrativos + datos del
 * cliente/venta (+ desglose del precio) + Pipeline (las 17 fases) + Estado de
 * cuenta (CxC) + Expediente digital. La cabecera persistente (cliente, ficha,
 * tabs) la monta el layout `[id]/layout.tsx` vía `VentaExpedienteShell`; aquí
 * solo vive el cuerpo del tab, que consume el `VentaDetalleProvider`.
 *
 * (En el Sprint 2 de `dilesa-ventas-expediente-tabs`, Pipeline y Estado de
 * cuenta se mudan a tab propio; por ahora siguen aquí.)
 *
 * @module Venta · Operación (DILESA)
 * @responsive desktop-only
 */

import Link from 'next/link';
import {
  AlertTriangle,
  Check,
  Circle,
  FileText,
  Paperclip,
  Pencil,
  Plus,
  Printer,
} from 'lucide-react';
import { RequireAccess } from '@/components/require-access';
import { Badge } from '@/components/ui/badge';
import { AbonoCaptureDrawer } from '@/components/dilesa/abono-capture-drawer';
import { CopilotoCierre } from '@/components/dilesa/copiloto-cierre';
import { EstadoCuentaPrintable } from '@/components/dilesa/estado-cuenta-printable';
import { ReciboCajaPrintable } from '@/components/dilesa/recibo-caja-printable';
import { DetailDrawer, DetailDrawerContent } from '@/components/detail-page';
import { ROL_LABEL } from '@/lib/dilesa/captura/fase-roles';
import { camposCapturadosPorFase } from '@/lib/dilesa/captura/campos-capturados';
import { useVentaDetalle } from '@/components/dilesa/venta-detalle/provider';
import {
  Section,
  FichaGrid,
  ResumenItem,
  AdjuntoLink,
  PdfDownloadLink,
  EscrituracionEmailButton,
  MovimientosAdministrativos,
} from '@/components/dilesa/venta-detalle/ui';
import {
  moneyFmt,
  fmtMoney,
  fmtFecha,
  capitalizar,
  fuenteLabel,
  fuenteTone,
  estadoTone,
  MACRO_ETAPAS,
} from '@/components/dilesa/venta-detalle/types';

export default function VentaOperacionPage() {
  return (
    <RequireAccess empresa="dilesa" modulo="dilesa.ventas.operacion">
      <OperacionBody />
    </RequireAccess>
  );
}

function OperacionBody() {
  const d = useVentaDetalle();
  const {
    ventaId: id,
    venta,
    persona,
    unidad,
    proyectoNombre,
    prototipoNombre,
    clienteNombre,
    pipelineRows,
    pipelineAlcanzadas,
    copiloto,
    fichaPersona,
    fichaVenta,
    kyc,
    calculo,
    cargos,
    abonos,
    aplicadoPorAbono,
    comprobantesPorAbono,
    adjuntosVenta,
    adjuntosPorRol,
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

  // El Shell del layout no monta el cuerpo del tab sin venta; el guard
  // satisface el tipado (venta posiblemente null en el context).
  if (!venta) return null;

  return (
    <div className="space-y-6">
      <CopilotoCierre
        resultado={copiloto}
        ventaId={venta.id}
        fase17Cerrada={pipelineRows.find((r) => r.pos === 17)?.alcanzada === true}
        fecha17={pipelineRows.find((r) => r.pos === 17)?.fecha ?? null}
      />
      <div className="flex flex-wrap gap-2">
        <PdfDownloadLink
          ventaId={venta.id}
          tipo="solicitud-asignacion"
          label="Solicitud de Asignación"
        />
        <PdfDownloadLink ventaId={venta.id} tipo="aviso-privacidad" label="Aviso de Privacidad" />
        <PdfDownloadLink ventaId={venta.id} tipo="ficu" label="FICU" />
        {/* La promesa se imprime para firmarse en F3 — solo desde que la unidad
            quedó asignada (F2 autorizada). */}
        {(venta.fase_posicion ?? 0) >= 2 ? (
          <PdfDownloadLink
            ventaId={venta.id}
            tipo="promesa-compraventa"
            label="Promesa de Compraventa"
          />
        ) : null}
        {venta.valuador_id ? (
          <PdfDownloadLink ventaId={venta.id} tipo="solicitud-avaluo" label="Solicitud de Avalúo" />
        ) : null}
        {venta.notario_id ? (
          <PdfDownloadLink
            ventaId={venta.id}
            tipo="solicitud-dictamen"
            label="Solicitud de Dictaminación"
          />
        ) : null}
        {/* La póliza lleva la fecha de firma (Fase 10) como fecha del documento,
            así que se expide una vez programada la firma. Las ventas ya
            escrituradas (F11+) siempre la conservan accesible aun sin fecha
            programada — el route cae a la fecha de escrituración (expedientes
            históricos de Coda; LFPIORPI). */}
        {venta.unidad_id && (venta.fecha_firma_programada || (venta.fase_posicion ?? 0) >= 11) ? (
          <PdfDownloadLink ventaId={venta.id} tipo="poliza-garantia" label="Póliza de Garantía" />
        ) : null}
        {venta.monto_credito_directo != null && Number(venta.monto_credito_directo) > 0 ? (
          <PdfDownloadLink
            ventaId={venta.id}
            tipo="pagare-credito-directo"
            label="Pagaré (crédito directo)"
          />
        ) : null}
        {(venta.fase_posicion ?? 0) >= 11 ? (
          <PdfDownloadLink
            ventaId={venta.id}
            tipo="checklist-entrega"
            label="Checklist Pre-Entrega"
          />
        ) : null}
        {/* El correo de escrituración se dispara solo al cerrar F11; este botón
            cubre reenvíos y ventas escrituradas antes de la notificación. */}
        {(venta.fase_posicion ?? 0) >= 11 ? (
          <EscrituracionEmailButton
            ventaId={venta.id}
            lastSentAt={venta.notif_escrituracion_at ?? null}
          />
        ) : null}
        {(venta.fase_posicion ?? 0) >= 14 ? (
          <PdfDownloadLink
            ventaId={venta.id}
            tipo="checklist-entrega-cliente"
            label="Checklist de Entrega (cliente)"
          />
        ) : null}
      </div>

      <MovimientosAdministrativos
        ventaId={venta.id}
        estado={venta.estado}
        fasePosicion={venta.fase_posicion}
        personaId={venta.persona_id}
      />

      <Section title="Datos del cliente">
        {fichaPersona.length === 0 ? (
          <p className="text-sm text-[var(--text)]/60">Sin datos del cliente.</p>
        ) : (
          <FichaGrid rows={fichaPersona} cols={3} />
        )}
      </Section>

      <Section title="Datos de la venta">
        {fichaVenta.length === 0 ? (
          <p className="text-sm text-[var(--text)]/60">—</p>
        ) : (
          <FichaGrid rows={fichaVenta} cols={3} />
        )}
        {calculo ? (
          <div className="mt-5 border-t border-[var(--border)] pt-5">
            <h3 className="mb-3 text-xs font-medium uppercase tracking-wide text-[var(--text)]/50">
              Desglose del precio
            </h3>
            {calculo.componentes_detallados ? (
              <FichaGrid
                rows={[
                  { label: 'Valor comercial', value: fmtMoney(calculo.valor_comercial) ?? '—' },
                  {
                    label: `Excedente terreno (${(calculo.metros_excedentes ?? 0).toFixed(1)} m²)`,
                    value: fmtMoney(calculo.valor_excedente_terreno) ?? '—',
                  },
                  { label: 'Frente verde', value: fmtMoney(calculo.valor_frente_verde) ?? '—' },
                  {
                    label: `Esquina (${((calculo.pct_esquina_aplicado ?? 0) * 100).toFixed(1)}%)`,
                    value: fmtMoney(calculo.valor_esquina) ?? '—',
                  },
                  { label: 'Venta futuro', value: fmtMoney(calculo.valor_venta_futuro) ?? '—' },
                  {
                    label: calculo.zcu_exento
                      ? 'Costo crédito adicional (exento — problema ZCU)'
                      : 'Costo crédito adicional',
                    value: fmtMoney(calculo.costo_credito_adicional) ?? '—',
                  },
                  {
                    label: 'Productos adicionales',
                    value: fmtMoney(calculo.productos_adicionales) ?? '—',
                  },
                  {
                    label: 'Precio de venta total',
                    value: fmtMoney(calculo.precio_venta_total) ?? '—',
                  },
                  { label: 'Apoyo Infonavit', value: fmtMoney(calculo.apoyo_infonavit) ?? '—' },
                  { label: 'Pago directo cliente', value: fmtMoney(calculo.pago_directo) ?? '—' },
                  { label: 'Enganche 1%', value: fmtMoney(calculo.enganche_1pct) ?? '—' },
                  { label: 'ISAI 2%', value: fmtMoney(calculo.isai_2pct) ?? '—' },
                  {
                    label: 'Gastos notariales 6%',
                    value: fmtMoney(calculo.gastos_notariales_6pct) ?? '—',
                  },
                ]}
                cols={3}
              />
            ) : (
              <>
                <FichaGrid
                  rows={[
                    { label: 'Valor comercial', value: fmtMoney(calculo.valor_comercial) ?? '—' },
                    {
                      label: 'Precio de venta (contrato)',
                      value: fmtMoney(calculo.precio_venta_total) ?? '—',
                    },
                  ]}
                  cols={3}
                />
                <p className="mt-2 text-xs text-[var(--text)]/50">
                  Precio congelado del contrato. Venta anterior al desglose por componente — no se
                  re-tarifa.
                </p>
              </>
            )}
          </div>
        ) : null}
        {venta.motivo_desasignacion ? (
          <div className="mt-4 border-t border-[var(--border)] pt-4">
            <div className="text-xs font-medium uppercase tracking-wide text-[var(--text)]/50">
              Motivo de desasignación
            </div>
            <p className="mt-0.5 text-sm text-[var(--text)]/80">{venta.motivo_desasignacion}</p>
          </div>
        ) : null}
        {kyc.length > 0 ? (
          <div className="mt-6 border-t border-[var(--border)] pt-4">
            <div className="mb-2 text-xs font-medium uppercase tracking-wide text-[var(--text)]/50">
              KYC / PLD
            </div>
            <FichaGrid rows={kyc} cols={3} />
          </div>
        ) : null}
        {venta.notas ? (
          <div className="mt-4 border-t border-[var(--border)] pt-4">
            <div className="text-xs font-medium uppercase tracking-wide text-[var(--text)]/50">
              Notas
            </div>
            <p className="mt-0.5 whitespace-pre-wrap text-sm text-[var(--text)]/80">
              {venta.notas}
            </p>
          </div>
        ) : null}
      </Section>

      <Section title="Pipeline" description={`${pipelineAlcanzadas} de 17 fases alcanzadas`}>
        <div className="space-y-4">
          {MACRO_ETAPAS.map((etapa) => {
            const filas = pipelineRows.filter((r) => r.pos >= etapa.desde && r.pos <= etapa.hasta);
            const cerradas = filas.filter((r) => r.alcanzada).length;
            return (
              <div key={etapa.nombre}>
                <div className="mb-1.5 flex items-center gap-2">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--text)]/55">
                    {etapa.nombre}
                  </h3>
                  <span
                    className={`text-[10px] ${cerradas === filas.length ? 'text-emerald-600 dark:text-emerald-400' : 'text-[var(--text)]/40'}`}
                  >
                    {cerradas}/{filas.length}
                  </span>
                </div>
                <ol className="space-y-1 border-l-2 border-[var(--border)] pl-2">
                  {filas.map((r) => {
                    const capturados =
                      r.alcanzada && venta ? camposCapturadosPorFase(r.pos, venta, fmtMoney) : [];
                    return (
                      <li
                        key={r.pos}
                        className={
                          'rounded-md px-2 py-1.5 ' +
                          (r.alcanzada ? 'bg-[var(--bg)]/40' : 'opacity-60')
                        }
                      >
                        <div className="flex items-start gap-3">
                          {/* Status circle + posición */}
                          <div className="flex w-8 shrink-0 items-center gap-1.5 pt-0.5">
                            {r.alcanzada ? (
                              <Check className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                            ) : (
                              <Circle className="h-3.5 w-3.5 text-[var(--text)]/30" />
                            )}
                            <span className="font-mono text-[10px] tabular-nums text-[var(--text)]/40">
                              {r.pos}
                            </span>
                          </div>

                          {/* Nombre + fecha */}
                          <div className="min-w-[200px] shrink-0">
                            <div className="text-sm font-medium text-[var(--text)]">{r.nombre}</div>
                            <div className="text-[11px] text-[var(--text)]/50">
                              {r.fecha ? fmtFecha(r.fecha) : '—'}
                            </div>
                          </div>

                          {/* Docs cargados + faltantes */}
                          <div className="flex flex-1 flex-wrap items-center gap-1">
                            {r.cargados.map((a) => (
                              <AdjuntoLink key={a.id} a={a} compact />
                            ))}
                            {r.faltantes.map((rol) => (
                              <span
                                key={rol}
                                className="inline-flex items-center gap-1 rounded border border-dashed border-[var(--border)] px-1.5 py-0.5 text-[10px] text-[var(--text)]/40"
                                title={`Falta cargar: ${ROL_LABEL[rol] ?? rol}`}
                              >
                                <FileText className="h-2.5 w-2.5" />
                                {ROL_LABEL[rol] ?? rol}
                              </span>
                            ))}
                            {r.cargados.length === 0 && r.faltantes.length === 0 ? (
                              <span className="text-[10px] text-[var(--text)]/30">—</span>
                            ) : null}
                          </div>

                          {/* Capturar fase — solo si la página está implementada y aplica */}
                          {r.slugCaptura ? (
                            <div className="shrink-0">
                              {r.puedeCapturar ? (
                                <Link
                                  href={`/dilesa/ventas/${id}/capturar/${r.slugCaptura}`}
                                  className="inline-flex items-center gap-1 rounded-md border border-[var(--accent)] bg-[var(--accent)]/10 px-2 py-0.5 text-[10px] font-medium text-[var(--accent)] hover:bg-[var(--accent)]/20"
                                >
                                  <Pencil className="h-2.5 w-2.5" />
                                  Capturar fase
                                </Link>
                              ) : r.alcanzada ? (
                                <Link
                                  href={`/dilesa/ventas/${id}/capturar/${r.slugCaptura}`}
                                  className="inline-flex items-center gap-1 rounded-md border border-[var(--border)] px-2 py-0.5 text-[10px] font-medium text-[var(--text)]/60 hover:bg-[var(--bg)]/40 hover:text-[var(--text)]"
                                  title="Ver la fase cerrada; algunas permiten corregir datos o reemplazar documentos."
                                >
                                  <Pencil className="h-2.5 w-2.5" />
                                  Ver / corregir
                                </Link>
                              ) : (
                                <span
                                  className="inline-flex cursor-not-allowed items-center gap-1 rounded-md border border-[var(--border)] px-2 py-0.5 text-[10px] text-[var(--text)]/30"
                                  title={`Falta cerrar la fase ${r.pos - 1} primero.`}
                                >
                                  <Pencil className="h-2.5 w-2.5" />
                                  Capturar
                                </span>
                              )}
                            </div>
                          ) : null}
                        </div>

                        {/* Qué se capturó en esta fase (expandible) */}
                        {capturados.length > 0 ? (
                          <details className="ml-11 mt-0.5">
                            <summary className="cursor-pointer select-none text-[10px] text-[var(--text)]/45 hover:text-[var(--text)]/70">
                              Datos capturados ({capturados.length})
                            </summary>
                            <dl className="mt-1 grid grid-cols-1 gap-x-6 gap-y-0.5 sm:grid-cols-2 lg:grid-cols-3">
                              {capturados.map(([label, value]) => (
                                <div key={label} className="flex items-baseline gap-2 text-[11px]">
                                  <dt className="shrink-0 text-[var(--text)]/45">{label}:</dt>
                                  <dd className="font-medium tabular-nums text-[var(--text)]/85">
                                    {value.match(/^\d{4}-\d{2}-\d{2}$/) ? fmtFecha(value) : value}
                                  </dd>
                                </div>
                              ))}
                            </dl>
                          </details>
                        ) : null}
                      </li>
                    );
                  })}
                </ol>
              </div>
            );
          })}
        </div>
      </Section>

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

      <Section
        title="Expediente digital"
        description={
          adjuntosVenta.length === 0 ? 'sin documentos' : `${adjuntosVenta.length} documentos`
        }
      >
        {adjuntosPorRol.length === 0 ? (
          <p className="text-sm text-[var(--text)]/60">
            Sin documentos en el expediente para esta venta.
          </p>
        ) : (
          <div className="space-y-4">
            {adjuntosPorRol.map(([rol, ads]) => (
              <div key={rol}>
                <div className="mb-1.5 text-xs font-medium uppercase tracking-wide text-[var(--text)]/50">
                  {ROL_LABEL[rol] ?? rol}
                </div>
                <ul className="flex flex-wrap gap-2">
                  {ads.map((a) => (
                    <li key={a.id}>
                      <AdjuntoLink a={a} />
                    </li>
                  ))}
                </ul>
              </div>
            ))}
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
            fechaCorteISO={new Date().toISOString().slice(0, 10)}
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
