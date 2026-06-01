'use client';

/**
 * EstadoCuentaPrintable — estado de cuenta imprimible de una venta DILESA
 * (CxC, iniciativa `cxc`). Documento informativo por venta: membrete +
 * datos del cliente + datos de la operación + plan de cargos + abonos +
 * resumen de saldos al corte. NO es comprobante fiscal — el CFDI lo emite
 * CONTPAQi por separado (ADR-037 / planning cxc).
 *
 * Patrón de impresión (ADR-021): el documento se oculta en pantalla con
 * `display:none` PROPIO (en el `<style>`, no la clase Tailwind `hidden`) y
 * al imprimir aísla la página con el truco de `visibility` heredado de
 * <FiniquitoPrintable>: `@media print` lo vuelve `display:block` + visible y
 * oculta todo lo demás del DOM, posicionado al tope de la hoja. El caller
 * monta UN solo printable a la vez (estado de cuenta o recibo).
 *
 * ⚠️ NO usar las clases Tailwind `hidden`/`print:block` para el toggle: en
 * este build (Tailwind v4) `.hidden` (display:none) le gana a `.print:block`
 * en media print, así que el documento salía EN BLANCO. Por eso controlamos
 * `display` con CSS propio + `!important` en `@media print`.
 */

import { getEmpresaBranding, type EmpresaSlug } from '@/lib/empresa-branding';

export type EstadoCuentaCargoRow = {
  /** Concepto ya resuelto (`concepto ?? capitalizar(tipo_cargo)`). */
  concepto: string;
  /** Fecha de vencimiento ISO (`YYYY-MM-DD`) o null. */
  vence: string | null;
  /** `'cliente' | 'institucion'`. */
  fuente: string;
  monto: number;
  pagado: number;
  saldo: number;
  /** `'pendiente' | 'parcial' | 'liquidado' | 'cancelado'`. */
  estado: string;
};

export type EstadoCuentaAbonoRow = {
  /** Fecha del abono ISO o null. */
  fecha: string | null;
  fuente: string;
  formaPago: string | null;
  monto: number;
  /** Monto del abono ya aplicado a cargos. */
  aplicado: number;
};

export type EstadoCuentaPrintableProps = {
  empresa?: EmpresaSlug;
  cliente: {
    nombre: string;
    rfc?: string | null;
    telefono?: string | null;
    email?: string | null;
  };
  operacion: {
    proyecto?: string | null;
    unidad?: string | null;
    prototipo?: string | null;
    tipoCredito?: string | null;
    valorEscrituracion?: number | null;
    asesor?: string | null;
  };
  cargos: EstadoCuentaCargoRow[];
  abonos: EstadoCuentaAbonoRow[];
  totales: { aCobrar: number; cobrado: number; saldo: number; saldoFavor: number };
  /** Fecha de corte ISO (`YYYY-MM-DD`). */
  fechaCorteISO: string;
};

const money = (n: number | null | undefined): string =>
  new Intl.NumberFormat('es-MX', {
    style: 'currency',
    currency: 'MXN',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n ?? 0);

function fmtFecha(s: string | null): string {
  if (!s) return '—';
  const d = new Date(`${s}T00:00:00`);
  if (isNaN(d.getTime())) return s;
  return d.toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' });
}

function fmtFechaLarga(s: string): string {
  const d = new Date(`${s}T00:00:00`);
  if (isNaN(d.getTime())) return s;
  return d.toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' });
}

function fuenteLabel(f: string): string {
  return f === 'institucion' ? 'Institución' : 'Cliente';
}

function estadoLabel(e: string): string {
  return e.length ? e[0].toUpperCase() + e.slice(1) : e;
}

export function EstadoCuentaPrintable({
  empresa = 'dilesa',
  cliente,
  operacion,
  cargos,
  abonos,
  totales,
  fechaCorteISO,
}: EstadoCuentaPrintableProps) {
  const branding = getEmpresaBranding(empresa);

  const fichaOperacion: { label: string; value: string }[] = (
    [
      ['Proyecto', operacion.proyecto],
      ['Unidad', operacion.unidad],
      ['Prototipo', operacion.prototipo],
      ['Tipo de crédito', operacion.tipoCredito],
      ['Asesor de ventas', operacion.asesor],
      [
        'Valor de escrituración',
        operacion.valorEscrituracion != null ? money(operacion.valorEscrituracion) : null,
      ],
    ] as [string, string | null | undefined][]
  )
    .filter((r): r is [string, string] => r[1] != null && r[1] !== '')
    .map(([label, value]) => ({ label, value }));

  const fichaCliente: { label: string; value: string }[] = (
    [
      ['RFC', cliente.rfc],
      ['Teléfono', cliente.telefono],
      ['Correo', cliente.email],
    ] as [string, string | null | undefined][]
  )
    .filter((r): r is [string, string] => r[1] != null && r[1] !== '')
    .map(([label, value]) => ({ label, value }));

  return (
    <article className="estado-cuenta-print-root">
      <style>{`
        .estado-cuenta-print-root { display: none; background: #fff; font-family: ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif; color: #000; }
        .estado-cuenta-print-root h1 { font-size: 16px; font-weight: 700; margin: 0; letter-spacing: 0.3px; text-transform: uppercase; }
        .estado-cuenta-print-root h2 { font-size: 11px; font-weight: 700; margin: 14px 0 4px; text-transform: uppercase; letter-spacing: 0.4px; color: #444; }
        .estado-cuenta-print-root table { width: 100%; border-collapse: collapse; margin: 4px 0; font-size: 11px; }
        .estado-cuenta-print-root th, .estado-cuenta-print-root td { border: 1px solid #bbb; padding: 4px 8px; text-align: left; }
        .estado-cuenta-print-root th { background: #f0f0f0; font-weight: 700; }
        .estado-cuenta-print-root td.num, .estado-cuenta-print-root th.num { text-align: right; font-variant-numeric: tabular-nums; }
        .estado-cuenta-print-root tr { break-inside: avoid; }
        .estado-cuenta-print-root .ec-membrete { width: 100%; max-width: 540px; height: auto; }
        .estado-cuenta-print-root .ec-footer-img { width: 100%; max-width: 540px; height: auto; }
        .estado-cuenta-print-root .ec-datos { display: grid; grid-template-columns: 1fr 1fr; gap: 4px 24px; font-size: 11px; }
        .estado-cuenta-print-root .ec-dato-label { color: #666; }
        .estado-cuenta-print-root .ec-resumen { display: flex; flex-wrap: wrap; gap: 8px; margin: 6px 0; }
        .estado-cuenta-print-root .ec-resumen-item { border: 1px solid #bbb; border-radius: 6px; padding: 6px 12px; min-width: 120px; }
        .estado-cuenta-print-root .ec-resumen-label { font-size: 9px; text-transform: uppercase; letter-spacing: 0.4px; color: #666; }
        .estado-cuenta-print-root .ec-resumen-value { font-size: 14px; font-weight: 700; font-variant-numeric: tabular-nums; }
        .estado-cuenta-print-root .ec-total-row td { background: #f6f6f6; font-weight: 700; }
        @media print {
          body * { visibility: hidden !important; }
          .estado-cuenta-print-root, .estado-cuenta-print-root * { visibility: visible !important; }
          .estado-cuenta-print-root { display: block !important; position: absolute; left: 0; top: 0; width: 100%; max-width: none; margin: 0; padding: 14mm 16mm; box-shadow: none; }
          .no-print { display: none !important; }
        }
      `}</style>

      <header className="mb-3 flex items-start justify-between gap-4 border-b border-black/20 pb-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={branding.logoPath} alt={branding.membreteAlt} className="ec-membrete" />
        <div className="text-right">
          <h1>Estado de cuenta</h1>
          <p className="mt-1 text-[11px] text-black/70">
            Al corte del {fmtFechaLarga(fechaCorteISO)}
          </p>
        </div>
      </header>

      <div className="ec-datos">
        <div>
          <h2>Cliente</h2>
          <p className="text-[12px] font-semibold">{cliente.nombre || '—'}</p>
          {fichaCliente.map((d) => (
            <p key={d.label} className="text-[11px]">
              <span className="ec-dato-label">{d.label}:</span> {d.value}
            </p>
          ))}
        </div>
        <div>
          <h2>Operación</h2>
          {fichaOperacion.length === 0 ? (
            <p className="text-[11px] text-black/50">—</p>
          ) : (
            fichaOperacion.map((d) => (
              <p key={d.label} className="text-[11px]">
                <span className="ec-dato-label">{d.label}:</span> {d.value}
              </p>
            ))
          )}
        </div>
      </div>

      <h2>Resumen de saldos</h2>
      <div className="ec-resumen">
        <div className="ec-resumen-item">
          <div className="ec-resumen-label">A cobrar</div>
          <div className="ec-resumen-value">{money(totales.aCobrar)}</div>
        </div>
        <div className="ec-resumen-item">
          <div className="ec-resumen-label">Cobrado</div>
          <div className="ec-resumen-value">{money(totales.cobrado)}</div>
        </div>
        <div className="ec-resumen-item">
          <div className="ec-resumen-label">Saldo</div>
          <div className="ec-resumen-value">{money(totales.saldo)}</div>
        </div>
        {totales.saldoFavor > 0 ? (
          <div className="ec-resumen-item">
            <div className="ec-resumen-label">Saldo a favor</div>
            <div className="ec-resumen-value">{money(totales.saldoFavor)}</div>
          </div>
        ) : null}
      </div>

      {cargos.length > 0 ? (
        <>
          <h2>Cargos</h2>
          <table>
            <thead>
              <tr>
                <th>Concepto</th>
                <th>Vence</th>
                <th>Fuente</th>
                <th className="num">Monto</th>
                <th className="num">Pagado</th>
                <th className="num">Saldo</th>
                <th>Estado</th>
              </tr>
            </thead>
            <tbody>
              {cargos.map((c, i) => (
                <tr key={i}>
                  <td>{c.concepto}</td>
                  <td>{fmtFecha(c.vence)}</td>
                  <td>{fuenteLabel(c.fuente)}</td>
                  <td className="num">{money(c.monto)}</td>
                  <td className="num">{money(c.pagado)}</td>
                  <td className="num">{money(c.saldo)}</td>
                  <td>{estadoLabel(c.estado)}</td>
                </tr>
              ))}
              <tr className="ec-total-row">
                <td colSpan={3}>Total</td>
                <td className="num">{money(totales.aCobrar)}</td>
                <td className="num">{money(totales.cobrado)}</td>
                <td className="num">{money(totales.saldo)}</td>
                <td />
              </tr>
            </tbody>
          </table>
        </>
      ) : null}

      {abonos.length > 0 ? (
        <>
          <h2>Abonos</h2>
          <table>
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Fuente</th>
                <th>Forma de pago</th>
                <th className="num">Monto</th>
                <th className="num">Aplicado</th>
                <th className="num">Saldo a favor</th>
              </tr>
            </thead>
            <tbody>
              {abonos.map((a, i) => {
                const favor = Math.max(0, a.monto - a.aplicado);
                return (
                  <tr key={i}>
                    <td>{fmtFecha(a.fecha)}</td>
                    <td>{fuenteLabel(a.fuente)}</td>
                    <td>{a.formaPago ? estadoLabel(a.formaPago) : '—'}</td>
                    <td className="num">{money(a.monto)}</td>
                    <td className="num">{money(a.aplicado)}</td>
                    <td className="num">{favor > 0 ? money(favor) : '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </>
      ) : null}

      {cargos.length === 0 && abonos.length === 0 ? (
        <p className="mt-3 text-[11px] text-black/60">
          Sin plan de pagos ni abonos registrados para esta operación.
        </p>
      ) : null}

      <p className="mt-6 text-[9px] leading-relaxed text-black/55">
        Documento informativo emitido por {branding.membreteAlt.replace('Membrete ', '')}. Refleja
        el saldo al corte indicado y no constituye comprobante fiscal (CFDI). El CFDI de cada pago
        se emite por separado. Para cualquier aclaración, contacte a la administración.
      </p>

      <footer className="mt-4">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={`/brand/${empresa}/footer-doc.png`} alt="" className="ec-footer-img" />
      </footer>
    </article>
  );
}
