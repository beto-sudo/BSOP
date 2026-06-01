'use client';

/**
 * ReciboCajaPrintable — recibo de caja imprimible por abono CxC (iniciativa
 * `cxc`). Reemplaza el PDF de recibo del módulo Coda "Depositos Clientes".
 * Ampara un pago individual; NO sustituye al CFDI, que CONTPAQi emite por
 * separado (ADR-037 / planning cxc).
 *
 * Patrón de impresión (ADR-021): igual que <EstadoCuentaPrintable> —
 * `hidden print:block` + aislamiento por `visibility` (todo lo demás del
 * DOM se oculta al imprimir). El caller monta UN solo printable a la vez.
 */

import { formatMontoEnLetras } from '@/lib/format/numero-a-letras';
import { getEmpresaBranding, type EmpresaSlug } from '@/lib/empresa-branding';

export type ReciboCajaPrintableProps = {
  empresa?: EmpresaSlug;
  /** Folio mostrado (derivado del id del abono — no persistido). */
  folio: string;
  /** Fecha del abono ISO (`YYYY-MM-DD`) o null. */
  fechaISO: string | null;
  cliente: string;
  /** Concepto del pago — p.ej. "Abono a cuenta — Proyecto · Unidad". */
  concepto: string;
  monto: number;
  formaPago?: string | null;
  referencia?: string | null;
  /** `'cliente' | 'institucion'`. */
  fuente: string;
  /** Quién recibe el pago (nombre del capturista/cajero). Opcional. */
  recibidoPor?: string | null;
};

function fmtFechaLarga(s: string | null): string {
  if (!s) return '—';
  const d = new Date(`${s}T00:00:00`);
  if (isNaN(d.getTime())) return s;
  return d.toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' });
}

function capitalizar(s: string): string {
  return s.length ? s[0].toUpperCase() + s.slice(1) : s;
}

const money = (n: number | null | undefined): string =>
  new Intl.NumberFormat('es-MX', {
    style: 'currency',
    currency: 'MXN',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n ?? 0);

export function ReciboCajaPrintable({
  empresa = 'dilesa',
  folio,
  fechaISO,
  cliente,
  concepto,
  monto,
  formaPago,
  referencia,
  fuente,
  recibidoPor,
}: ReciboCajaPrintableProps) {
  const branding = getEmpresaBranding(empresa);

  return (
    <article className="recibo-caja-print-root hidden bg-white text-black print:block">
      <style>{`
        .recibo-caja-print-root { font-family: ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif; color: #000; }
        .recibo-caja-print-root h1 { font-size: 17px; font-weight: 700; margin: 0; letter-spacing: 0.5px; text-transform: uppercase; }
        .recibo-caja-print-root .rc-membrete { width: 100%; max-width: 540px; height: auto; }
        .recibo-caja-print-root .rc-footer-img { width: 100%; max-width: 540px; height: auto; }
        .recibo-caja-print-root .rc-folio { font-size: 12px; font-weight: 700; color: #b00; }
        .recibo-caja-print-root .rc-box { border: 1px solid #999; border-radius: 8px; padding: 14px 16px; margin: 12px 0; }
        .recibo-caja-print-root .rc-row { display: flex; gap: 8px; margin: 6px 0; font-size: 13px; }
        .recibo-caja-print-root .rc-label { color: #555; min-width: 130px; }
        .recibo-caja-print-root .rc-value { font-weight: 600; }
        .recibo-caja-print-root .rc-monto { font-size: 22px; font-weight: 700; font-variant-numeric: tabular-nums; }
        .recibo-caja-print-root .rc-letra { font-size: 12px; font-style: italic; color: #333; margin-top: 2px; }
        .recibo-caja-print-root .rc-firma { margin-top: 56px; width: 260px; margin-left: auto; margin-right: auto; border-top: 1px solid #000; padding-top: 4px; text-align: center; font-size: 11px; }
        @media print {
          body * { visibility: hidden !important; }
          .recibo-caja-print-root, .recibo-caja-print-root * { visibility: visible !important; }
          .recibo-caja-print-root { position: absolute; left: 0; top: 0; width: 100%; max-width: none; margin: 0; padding: 16mm 18mm; box-shadow: none; }
          .no-print { display: none !important; }
        }
      `}</style>

      <header className="mb-3 flex items-start justify-between gap-4 border-b border-black/20 pb-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={branding.logoPath} alt={branding.membreteAlt} className="rc-membrete" />
        <div className="text-right">
          <h1>Recibo de caja</h1>
          <p className="mt-1 rc-folio">Folio {folio}</p>
          <p className="text-[11px] text-black/70">{fmtFechaLarga(fechaISO)}</p>
        </div>
      </header>

      <div className="rc-box">
        <div className="rc-row">
          <span className="rc-label">Recibí de</span>
          <span className="rc-value">{cliente || '—'}</span>
        </div>
        <div className="rc-row" style={{ alignItems: 'flex-start' }}>
          <span className="rc-label">La cantidad de</span>
          <span>
            <span className="rc-monto">{money(monto)}</span>
            <div className="rc-letra">{formatMontoEnLetras(monto)}</div>
          </span>
        </div>
        <div className="rc-row">
          <span className="rc-label">Por concepto de</span>
          <span className="rc-value">{concepto}</span>
        </div>
        <div className="rc-row">
          <span className="rc-label">Forma de pago</span>
          <span className="rc-value">
            {formaPago ? capitalizar(formaPago) : '—'}
            {referencia ? ` · Ref. ${referencia}` : ''}
          </span>
        </div>
        <div className="rc-row">
          <span className="rc-label">Origen</span>
          <span className="rc-value">{fuente === 'institucion' ? 'Institución' : 'Cliente'}</span>
        </div>
      </div>

      <div className="rc-firma">{recibidoPor || 'Recibió'}</div>

      <p className="mt-6 text-[9px] leading-relaxed text-black/55">
        Este recibo ampara el pago referido y no sustituye al Comprobante Fiscal Digital (CFDI), que
        se emite por separado. Emitido por {branding.membreteAlt.replace('Membrete ', '')}.
      </p>

      <footer className="mt-4">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={`/brand/${empresa}/footer-doc.png`} alt="" className="rc-footer-img" />
      </footer>
    </article>
  );
}
