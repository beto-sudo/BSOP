/**
 * Parser determinista de CFDI (4.0 / 3.3) para la ingesta de facturas de
 * egreso de CxP (iniciativa `cxp`, Sprint 2). El CFDI es XML estructurado del
 * SAT — NO se usa LLM aquí (eso queda para el path opcional de PDF sin XML).
 *
 * Extrae los campos que consume `erp.cxp_factura_alta`: folio fiscal (UUID del
 * TimbreFiscalDigital), emisor/receptor, montos, impuestos (IVA trasladado +
 * retenciones IVA/ISR), forma/método de pago y uso CFDI.
 *
 * Namespaces: parseamos con `removeNSPrefix` para que `cfdi:Comprobante`,
 * `tfd:TimbreFiscalDigital`, etc. queden como `Comprobante` /
 * `TimbreFiscalDigital`. Claves SAT de impuestos: IVA = '002', ISR = '001'.
 */

import { XMLParser } from 'fast-xml-parser';

export type CfdiParsed = {
  /** Versión del CFDI ('4.0' | '3.3' | ...). */
  version: string;
  /** Folio fiscal (UUID del TimbreFiscalDigital). null si no está timbrado. */
  uuid: string | null;
  serie: string | null;
  folio: string | null;
  /** Fecha de emisión en ISO `YYYY-MM-DD` (la parte de fecha del atributo Fecha). */
  fecha: string;
  emisorRfc: string;
  emisorNombre: string | null;
  receptorRfc: string;
  receptorNombre: string | null;
  /** Clave de uso CFDI del receptor (G01, G03, ...). */
  usoCfdi: string | null;
  subtotal: number;
  total: number;
  moneda: string;
  /** Clave SAT de forma de pago (01 efectivo, 03 transferencia, ...). */
  formaPago: string | null;
  /** Método de pago: 'PUE' (una exhibición) | 'PPD' (parcialidades/diferido). */
  metodoPago: string | null;
  /** Tipo de comprobante: 'I' ingreso, 'E' egreso (nota de crédito), 'P' pago, etc. */
  tipoComprobante: string;
  /** IVA trasladado total. */
  ivaTrasladado: number;
  /** Tasa de IVA dominante derivada de los traslados (0, 8 o 16). null si no hay. */
  tasaIva: number | null;
  /** Retención de IVA total (impuesto 002). */
  retencionIva: number;
  /** Retención de ISR total (impuesto 001). */
  retencionIsr: number;
  /**
   * CFDI relacionados (nodo CfdiRelacionados): UUIDs en mayúsculas con su
   * tipo de relación ('01' nota de crédito, '03' devolución, ...). Vacío si
   * el comprobante no relaciona otros. Lo usa la validación NC → factura de
   * ventas DILESA (`dilesa-ventas-captura-colaborativa` S2).
   */
  relacionados: { tipoRelacion: string | null; uuids: string[] }[];
};

/** Error de parseo de CFDI con mensaje legible para el operador. */
export class CfdiParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CfdiParseError';
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

function str(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s.length ? s : null;
}

/**
 * Parsea el texto XML de un CFDI y devuelve los campos normalizados.
 * @throws {CfdiParseError} si el XML no es un CFDI válido (sin nodo Comprobante,
 *   sin emisor/receptor, o sin total).
 */
export function parseCfdiXml(xml: string): CfdiParsed {
  if (!xml || !xml.trim()) {
    throw new CfdiParseError('El archivo XML está vacío.');
  }

  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    removeNSPrefix: true,
    parseAttributeValue: false, // mantener strings; convertimos nosotros
    trimValues: true,
  });

  let doc: Record<string, unknown>;
  try {
    doc = parser.parse(xml) as Record<string, unknown>;
  } catch (e) {
    throw new CfdiParseError(`XML mal formado: ${(e as Error).message}`);
  }

  const comp = doc.Comprobante as Record<string, unknown> | undefined;
  if (!comp) {
    throw new CfdiParseError('El XML no contiene un nodo Comprobante (¿es un CFDI?).');
  }

  const emisor = comp.Emisor as Record<string, unknown> | undefined;
  const receptor = comp.Receptor as Record<string, unknown> | undefined;
  const emisorRfc = str(emisor?.['@_Rfc']);
  const receptorRfc = str(receptor?.['@_Rfc']);
  if (!emisorRfc) throw new CfdiParseError('El CFDI no tiene RFC del emisor.');
  if (!receptorRfc) throw new CfdiParseError('El CFDI no tiene RFC del receptor.');

  const totalRaw = comp['@_Total'];
  if (totalRaw == null || totalRaw === '') {
    throw new CfdiParseError('El CFDI no tiene Total.');
  }

  // UUID del timbre. Complemento puede ser objeto o arreglo; el TFD también.
  let uuid: string | null = null;
  const complementos = asArray(comp.Complemento as unknown);
  for (const c of complementos) {
    const tfd = (c as Record<string, unknown>)?.TimbreFiscalDigital;
    const first = asArray(tfd)[0] as Record<string, unknown> | undefined;
    const u = str(first?.['@_UUID']);
    if (u) {
      uuid = u.toUpperCase();
      break;
    }
  }

  // Impuestos: trasladado IVA (002) + retenciones IVA (002) / ISR (001).
  const impuestos = comp.Impuestos as Record<string, unknown> | undefined;
  let ivaTrasladado = 0;
  let tasaIva: number | null = null;
  let retencionIva = 0;
  let retencionIsr = 0;

  if (impuestos) {
    const traslados = asArray(
      (impuestos.Traslados as Record<string, unknown> | undefined)?.Traslado as unknown
    );
    for (const t of traslados) {
      const tr = t as Record<string, unknown>;
      if (str(tr['@_Impuesto']) === '002') {
        ivaTrasladado += num(tr['@_Importe']);
        const tasa = num(tr['@_TasaOCuota']); // 0.160000 / 0.080000 / 0.000000
        // Tasa dominante = la del traslado de mayor importe (o la primera 16/8/0).
        const tasaPct = Math.round(tasa * 100);
        if (tasaIva === null || tasaPct > 0) tasaIva = tasaPct;
      }
    }

    const retenciones = asArray(
      (impuestos.Retenciones as Record<string, unknown> | undefined)?.Retencion as unknown
    );
    for (const r of retenciones) {
      const rr = r as Record<string, unknown>;
      const imp = str(rr['@_Impuesto']);
      if (imp === '002') retencionIva += num(rr['@_Importe']);
      else if (imp === '001') retencionIsr += num(rr['@_Importe']);
    }
  }

  const fechaRaw = str(comp['@_Fecha']) ?? '';
  const fecha = fechaRaw.split('T')[0]; // "2026-01-15T10:30:00" → "2026-01-15"

  // CFDI relacionados (la NC referencia a su factura con TipoRelacion 01).
  // En 4.0 puede haber varios nodos CfdiRelacionados, cada uno con 1..N hijos.
  const relacionados = asArray(comp.CfdiRelacionados as unknown).map((nodo) => {
    const n = nodo as Record<string, unknown>;
    const uuids = asArray(n.CfdiRelacionado as unknown)
      .map((h) => str((h as Record<string, unknown>)['@_UUID'])?.toUpperCase() ?? null)
      .filter((u): u is string => !!u);
    return { tipoRelacion: str(n['@_TipoRelacion']), uuids };
  });

  return {
    version: str(comp['@_Version']) ?? str(comp['@_version']) ?? '',
    uuid,
    serie: str(comp['@_Serie']),
    folio: str(comp['@_Folio']),
    fecha,
    emisorRfc: emisorRfc.toUpperCase(),
    emisorNombre: str(emisor?.['@_Nombre']),
    receptorRfc: receptorRfc.toUpperCase(),
    receptorNombre: str(receptor?.['@_Nombre']),
    usoCfdi: str(receptor?.['@_UsoCFDI']),
    subtotal: num(comp['@_SubTotal']),
    total: num(totalRaw),
    moneda: str(comp['@_Moneda']) ?? 'MXN',
    formaPago: str(comp['@_FormaPago']),
    metodoPago: str(comp['@_MetodoPago']),
    tipoComprobante: str(comp['@_TipoDeComprobante']) ?? '',
    ivaTrasladado,
    tasaIva,
    retencionIva,
    retencionIsr,
    relacionados,
  };
}
