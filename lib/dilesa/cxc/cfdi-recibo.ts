/**
 * Recibo de caja (CFDI) de un abono CxC — parse + verificación contra la venta.
 *
 * CONTPAQi emite el comprobante fiscal de cada pago del cliente (decisión de
 * la iniciativa `cxc`: BSOP no timbra, solo referencia `uuid_sat`). Desde
 * 2026-06-12 el drawer de "Registrar abono" acepta el XML y EXTRAE los datos
 * (fecha, monto, forma de pago, folio) en lugar de capturarlos a mano, y
 * verifica que el recibo sea del cliente correcto.
 *
 * Dos formas válidas de recibo:
 *   - CFDI tipo `P` (REP / complemento de pagos 2.0): el dato vive en
 *     `Pagos/Pago` (FechaPago, Monto, FormaDePagoP). El Total del comprobante
 *     es 0 por regla SAT.
 *   - CFDI tipo `I` (factura PUE de contado): fecha de emisión + Total.
 *
 * Construye sobre `parseCfdiXml` de CxP sin modificarlo (el complemento de
 * pagos se extrae aquí; ver PR #862 que extiende ese parser por su lado para
 * la factura de Fase 13 — dominios separados a propósito).
 */

import { XMLParser } from 'fast-xml-parser';
import { CfdiParseError, parseCfdiXml, type CfdiParsed } from '@/lib/cxp/cfdi-parser';

export type ReciboPagoParsed = {
  /** Folio fiscal (UUID del timbre), siempre presente y en mayúsculas. */
  uuid: string;
  /** 'P' = REP (complemento de pagos) | 'I' = factura de contado. */
  tipoComprobante: 'P' | 'I';
  /** Fecha del pago en `YYYY-MM-DD` (FechaPago del complemento, o emisión). */
  fecha: string;
  /** Monto del pago (suma de `Pago/@Monto` en tipo P; Total en tipo I). */
  monto: number;
  /** Clave SAT de forma de pago (01 efectivo, 03 transferencia, ...). */
  formaPagoSat: string | null;
  receptorRfc: string;
  receptorNombre: string | null;
  emisorRfc: string;
  emisorNombre: string | null;
  serie: string | null;
  folio: string | null;
  moneda: string;
  /** Snapshot del parse base (para `erp.adjuntos.metadata`). */
  base: CfdiParsed;
};

/** RFC genérico del SAT — no identifica a una persona. */
const RFC_GENERICO = new Set(['XAXX010101000', 'XEXX010101000']);

/**
 * Clave SAT de forma de pago → opción del drawer de abono
 * (`transferencia | deposito | efectivo | cheque | tarjeta | otro`).
 */
export function mapFormaPagoSat(clave: string | null): string | null {
  if (!clave) return null;
  switch (clave.padStart(2, '0')) {
    case '01':
      return 'efectivo';
    case '02':
      return 'cheque';
    case '03':
      return 'transferencia';
    case '04': // tarjeta de crédito
    case '28': // tarjeta de débito
      return 'tarjeta';
    default:
      return 'otro';
  }
}

function asArray<T>(v: T | T[] | undefined | null): T[] {
  if (v == null) return [];
  return Array.isArray(v) ? v : [v];
}

function num(v: unknown): number {
  if (v == null || v === '') return 0;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Extrae los nodos `Pago` del complemento de pagos (Pagos 2.0 / 1.0).
 * Devuelve [] si el CFDI no trae complemento de pagos.
 */
function extraerPagosComplemento(
  xml: string
): Array<{ fechaPago: string | null; monto: number; formaDePagoP: string | null }> {
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    removeNSPrefix: true,
    parseAttributeValue: false,
    trimValues: true,
  });
  let doc: Record<string, unknown>;
  try {
    doc = parser.parse(xml) as Record<string, unknown>;
  } catch {
    return [];
  }
  const comp = doc.Comprobante as Record<string, unknown> | undefined;
  if (!comp) return [];

  const out: Array<{ fechaPago: string | null; monto: number; formaDePagoP: string | null }> = [];
  for (const c of asArray(comp.Complemento as unknown)) {
    const pagos = (c as Record<string, unknown>)?.Pagos;
    for (const p of asArray(pagos)) {
      for (const pago of asArray((p as Record<string, unknown>)?.Pago as unknown)) {
        const row = pago as Record<string, unknown>;
        const fechaRaw = row['@_FechaPago'];
        out.push({
          fechaPago: fechaRaw ? String(fechaRaw).split('T')[0] : null,
          monto: num(row['@_Monto']),
          formaDePagoP: row['@_FormaDePagoP'] ? String(row['@_FormaDePagoP']) : null,
        });
      }
    }
  }
  return out;
}

/**
 * Parsea el XML de un recibo de caja y lo normaliza al shape del abono.
 * @throws {CfdiParseError} si no es CFDI, no está timbrado, no es tipo P/I,
 *   o (tipo P) no trae complemento de pagos.
 */
export function parseReciboCfdi(xml: string): ReciboPagoParsed {
  const base = parseCfdiXml(xml);

  if (!base.uuid) {
    throw new CfdiParseError(
      'El recibo no está timbrado (sin folio fiscal). Sube el XML timbrado que emitió CONTPAQi.'
    );
  }

  const tipo = base.tipoComprobante.toUpperCase();
  if (tipo !== 'P' && tipo !== 'I') {
    throw new CfdiParseError(
      `El XML es un CFDI tipo "${base.tipoComprobante}" — un recibo de pago debe ser tipo P (recibo electrónico de pago) o tipo I (factura de contado).`
    );
  }

  let fecha = base.fecha;
  let monto = base.total;
  let formaPagoSat = base.formaPago;

  if (tipo === 'P') {
    const pagos = extraerPagosComplemento(xml);
    if (pagos.length === 0) {
      throw new CfdiParseError(
        'El CFDI tipo P no trae complemento de pagos — no se puede extraer el monto del abono.'
      );
    }
    // Un REP puede amparar varios nodos Pago; el abono es la suma. La fecha
    // y forma de pago se toman del primero (caso normal: uno solo).
    monto = pagos.reduce((s, p) => s + p.monto, 0);
    fecha = pagos[0].fechaPago ?? base.fecha;
    formaPagoSat = pagos[0].formaDePagoP ?? base.formaPago;
  }

  if (monto <= 0) {
    throw new CfdiParseError('El recibo no ampara un monto mayor a 0.');
  }

  return {
    uuid: base.uuid,
    tipoComprobante: tipo,
    fecha,
    monto,
    formaPagoSat,
    receptorRfc: base.receptorRfc,
    receptorNombre: base.receptorNombre,
    emisorRfc: base.emisorRfc,
    emisorNombre: base.emisorNombre,
    serie: base.serie,
    folio: base.folio,
    moneda: base.moneda,
    base,
  };
}

/**
 * Normaliza un nombre para comparación: sin acentos (Ñ→N incluida, robusto a
 * typos), mayúsculas, sin puntuación, espacios colapsados.
 */
export function normalizarNombre(s: string | null | undefined): string {
  if (!s) return '';
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export type VerificacionRecibo = {
  /** El receptor del recibo es el cliente de la venta (RFC o nombre). */
  receptorCoincide: boolean;
  /** Cómo se verificó: 'rfc' | 'nombre' | 'sin_datos' (cliente sin RFC ni match). */
  verificadoPor: 'rfc' | 'nombre' | 'sin_datos';
  /** Avisos no bloqueantes (emisor distinto, moneda extranjera, etc.). */
  warnings: string[];
};

/**
 * Verifica el recibo contra el cliente de la venta. El mismatch de receptor
 * NO es error duro (con coacreditados el recibo puede venir a nombre del
 * cónyuge): el drawer exige confirmación explícita cuando
 * `receptorCoincide === false`.
 */
export function verificarReciboVsCliente(
  recibo: ReciboPagoParsed,
  cliente: { rfc: string | null; nombre: string },
  emisorEsperadoRfc?: string | null
): VerificacionRecibo {
  const warnings: string[] = [];

  if (emisorEsperadoRfc && recibo.emisorRfc !== emisorEsperadoRfc.toUpperCase().trim()) {
    warnings.push(
      `El emisor del recibo (${recibo.emisorRfc}) no es el RFC de la empresa (${emisorEsperadoRfc}).`
    );
  }
  if (recibo.moneda && recibo.moneda !== 'MXN') {
    warnings.push(`El recibo está en ${recibo.moneda}, no en MXN.`);
  }

  const clienteRfc = cliente.rfc?.toUpperCase().trim() || null;
  const reciboRfcUtil = !RFC_GENERICO.has(recibo.receptorRfc);

  // 1) RFC contra RFC — la verificación fuerte.
  if (clienteRfc && reciboRfcUtil) {
    if (recibo.receptorRfc === clienteRfc) {
      return { receptorCoincide: true, verificadoPor: 'rfc', warnings };
    }
    return { receptorCoincide: false, verificadoPor: 'rfc', warnings };
  }

  // 2) Fallback por nombre normalizado (cliente sin RFC capturado, o recibo
  //    con RFC genérico del SAT).
  const nCliente = normalizarNombre(cliente.nombre);
  const nRecibo = normalizarNombre(recibo.receptorNombre);
  if (nCliente && nRecibo) {
    const coincide =
      nCliente === nRecibo || nCliente.includes(nRecibo) || nRecibo.includes(nCliente);
    if (!clienteRfc) {
      warnings.push('Cliente sin RFC capturado — se verificó por nombre.');
    }
    return { receptorCoincide: coincide, verificadoPor: 'nombre', warnings };
  }

  warnings.push('No se pudo verificar el receptor (cliente sin RFC y sin nombre comparable).');
  return { receptorCoincide: false, verificadoPor: 'sin_datos', warnings };
}
