'use client';

/**
 * ReciboCajaPrintable — contenido del recibo de caja por abono CxC (iniciativa
 * `cxc`). Reemplaza el PDF de recibo del módulo Coda "Depositos Clientes".
 * Ampara un pago individual; NO sustituye al CFDI, que CONTPAQi emite por
 * separado (ADR-037 / planning cxc).
 *
 * IMPRESIÓN (patrón del repo, ADR-021): igual que <EstadoCuentaPrintable> —
 * este componente es SOLO el contenido del documento y NO reimplementa el
 * aislamiento de impresión. Se monta dentro de un `<DetailDrawer>` y el
 * aislamiento lo provee la maquinaria del repo (`data-print-sheet-open` en
 * components/ui/sheet.tsx + `@media print` en app/globals.css), igual que el
 * kardex (`StockDetailDrawer`).
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
    <div className="recibo-caja-doc">
      <style>{`
        .recibo-caja-doc { color: #000; font-family: ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif; }
        .recibo-caja-doc h1 { font-size: 17px; font-weight: 700; margin: 0; letter-spacing: 0.5px; text-transform: uppercase; }
        .recibo-caja-doc .rc-membrete { display: block; width: 100%; height: auto; }
        .recibo-caja-doc .rc-footer-img { display: block; width: 100%; height: auto; margin-top: 12px; }
        .recibo-caja-doc .rc-folio { font-size: 12px; font-weight: 700; color: #b00; }
        .recibo-caja-doc .rc-box { border: 1px solid #999; border-radius: 8px; padding: 14px 16px; margin: 12px 0; }
        .recibo-caja-doc .rc-row { display: flex; gap: 8px; margin: 6px 0; font-size: 13px; }
        .recibo-caja-doc .rc-label { color: #555; min-width: 130px; }
        .recibo-caja-doc .rc-value { font-weight: 600; }
        .recibo-caja-doc .rc-monto { font-size: 22px; font-weight: 700; font-variant-numeric: tabular-nums; }
        .recibo-caja-doc .rc-letra { font-size: 12px; font-style: italic; color: #333; margin-top: 2px; }
        .recibo-caja-doc .rc-firma { margin-top: 56px; width: 260px; margin-left: auto; margin-right: auto; border-top: 1px solid #000; padding-top: 4px; text-align: center; font-size: 11px; }
      `}</style>

      <header className="mb-4">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={branding.logoPath} alt={branding.membreteAlt} className="rc-membrete" />
        <div className="mt-3 flex items-baseline justify-between border-b border-black/20 pb-2">
          <h1>Recibo de caja</h1>
          <div className="text-right">
            <p className="rc-folio">Folio {folio}</p>
            <p className="text-[11px] text-black/70">{fmtFechaLarga(fechaISO)}</p>
          </div>
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
    </div>
  );
}
