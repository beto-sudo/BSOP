'use client';

/**
 * Tab "Operación" del expediente de venta DILESA — el home del detalle.
 *
 * Copiloto de cierre + documentos PDF + movimientos administrativos + datos del
 * cliente/venta (+ desglose del precio) + expediente digital. La cabecera
 * persistente (cliente, ficha, tabs) la monta el layout `[id]/layout.tsx` vía
 * `VentaExpedienteShell`; aquí solo vive el cuerpo del tab, que consume el
 * `VentaDetalleProvider`.
 *
 * Pipeline y Estado de cuenta viven en sus propios tabs (`pipeline/`,
 * `estado-cuenta/`) desde el Sprint 2 de `dilesa-ventas-expediente-tabs`.
 *
 * @module Venta · Operación (DILESA)
 * @responsive desktop-only
 */

import { RequireAccess } from '@/components/require-access';
import { CopilotoCierre } from '@/components/dilesa/copiloto-cierre';
import { ROL_LABEL } from '@/lib/dilesa/captura/fase-roles';
import { useVentaDetalle } from '@/components/dilesa/venta-detalle/provider';
import {
  Section,
  FichaGrid,
  AdjuntoLink,
  PdfDownloadLink,
  EscrituracionEmailButton,
  MovimientosAdministrativos,
} from '@/components/dilesa/venta-detalle/ui';
import { fmtMoney } from '@/components/dilesa/venta-detalle/types';

export default function VentaOperacionPage() {
  return (
    <RequireAccess empresa="dilesa" modulo="dilesa.ventas.operacion">
      <OperacionBody />
    </RequireAccess>
  );
}

function OperacionBody() {
  const {
    venta,
    pipelineRows,
    copiloto,
    fichaPersona,
    fichaVenta,
    kyc,
    calculo,
    adjuntosVenta,
    adjuntosPorRol,
  } = useVentaDetalle();

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
                    label: 'Sobreprecio gastos escrituración',
                    value: fmtMoney(calculo.sobreprecio_gastos_escrituracion) ?? '—',
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
    </div>
  );
}
