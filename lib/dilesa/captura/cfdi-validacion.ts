/**
 * Validación determinista de CFDI para la Fase 13 de ventas DILESA
 * (iniciativa `dilesa-ventas-captura-colaborativa`, Sprint 2).
 *
 * Aquí DILESA es el EMISOR (factura de ingreso al cliente) — al revés de
 * CxP, donde es receptor. Sin LLM: el CFDI es XML estructurado del SAT y el
 * parser (`lib/cxp/cfdi-parser.ts`) ya lo normaliza; estas funciones puras
 * solo cruzan contra la operación.
 *
 * Severidades: `error` bloquea la subida del XML (documento de otra
 * operación u otro tipo); `warning` deja subir pero queda visible en el
 * slot y persistido en `erp.adjuntos.metadata` para la revisión.
 */

import type { CfdiParsed } from '@/lib/cxp/cfdi-parser';

export type CfdiCheck = {
  clave: string;
  label: string;
  ok: boolean;
  severidad: 'error' | 'warning';
  detalle?: string;
};

export type ContextoCfdiVenta = {
  /** RFC de la empresa (emisor esperado). */
  empresaRfc: string;
  /** RFC del cliente de la venta (receptor esperado); null si no está capturado. */
  clienteRfc: string | null;
};

const ok = (clave: string, label: string, severidad: CfdiCheck['severidad']): CfdiCheck => ({
  clave,
  label,
  ok: true,
  severidad,
});
const falla = (
  clave: string,
  label: string,
  severidad: CfdiCheck['severidad'],
  detalle: string
): CfdiCheck => ({ clave, label, ok: false, severidad, detalle });

function checksComunes(cfdi: CfdiParsed, ctx: ContextoCfdiVenta): CfdiCheck[] {
  const checks: CfdiCheck[] = [];

  checks.push(
    cfdi.uuid
      ? ok('timbre', 'CFDI timbrado (folio fiscal)', 'error')
      : falla(
          'timbre',
          'CFDI timbrado (folio fiscal)',
          'error',
          'El XML no trae TimbreFiscalDigital — no está timbrado.'
        )
  );

  const emisorOk = cfdi.emisorRfc === ctx.empresaRfc.toUpperCase().trim();
  checks.push(
    emisorOk
      ? ok('emisor', 'Emisor = DILESA', 'error')
      : falla(
          'emisor',
          'Emisor = DILESA',
          'error',
          `El CFDI lo emite ${cfdi.emisorRfc}, no ${ctx.empresaRfc}.`
        )
  );

  if (ctx.clienteRfc) {
    const receptorOk = cfdi.receptorRfc === ctx.clienteRfc.toUpperCase().trim();
    checks.push(
      receptorOk
        ? ok('receptor', 'Receptor = cliente de la venta', 'error')
        : falla(
            'receptor',
            'Receptor = cliente de la venta',
            'error',
            `El CFDI es para ${cfdi.receptorRfc} (${cfdi.receptorNombre ?? 'sin nombre'}); el cliente de la venta tiene RFC ${ctx.clienteRfc}.`
          )
    );
  } else {
    checks.push(
      falla(
        'receptor',
        'Receptor = cliente de la venta',
        'warning',
        'El cliente de la venta no tiene RFC capturado — no se pudo validar el receptor.'
      )
    );
  }

  checks.push(
    cfdi.total > 0
      ? ok('total', 'Total mayor a cero', 'error')
      : falla('total', 'Total mayor a cero', 'error', 'El CFDI trae total 0.')
  );

  checks.push(
    cfdi.moneda === 'MXN'
      ? ok('moneda', 'Moneda MXN', 'warning')
      : falla('moneda', 'Moneda MXN', 'warning', `El CFDI está en ${cfdi.moneda}.`)
  );

  return checks;
}

/** Checks para el XML de la factura de la venta (tipo de comprobante I). */
export function validarCfdiFacturaVenta(cfdi: CfdiParsed, ctx: ContextoCfdiVenta): CfdiCheck[] {
  const checks: CfdiCheck[] = [];
  checks.push(
    cfdi.tipoComprobante === 'I'
      ? ok('tipo', 'Tipo de comprobante: Ingreso (factura)', 'error')
      : falla(
          'tipo',
          'Tipo de comprobante: Ingreso (factura)',
          'error',
          `El CFDI es tipo "${cfdi.tipoComprobante}" — no es una factura de ingreso.`
        )
  );
  checks.push(...checksComunes(cfdi, ctx));
  return checks;
}

/**
 * Checks para el XML de la nota de crédito (tipo E). `uuidFactura` es el
 * folio fiscal del XML de factura vigente en el expediente — la NC debe
 * relacionarlo (CfdiRelacionados, normalmente TipoRelacion 01).
 */
export function validarCfdiNotaCredito(
  cfdi: CfdiParsed,
  ctx: ContextoCfdiVenta,
  uuidFactura: string | null
): CfdiCheck[] {
  const checks: CfdiCheck[] = [];
  checks.push(
    cfdi.tipoComprobante === 'E'
      ? ok('tipo', 'Tipo de comprobante: Egreso (nota de crédito)', 'error')
      : falla(
          'tipo',
          'Tipo de comprobante: Egreso (nota de crédito)',
          'error',
          `El CFDI es tipo "${cfdi.tipoComprobante}" — no es una nota de crédito.`
        )
  );
  checks.push(...checksComunes(cfdi, ctx));

  const uuidsRelacionados = cfdi.relacionados.flatMap((r) => r.uuids);
  if (!uuidFactura) {
    checks.push(
      falla(
        'relacion',
        'Relacionada a la factura de la venta',
        'warning',
        'Aún no hay XML de factura en el expediente — sube primero la factura para validar la relación.'
      )
    );
  } else if (uuidsRelacionados.includes(uuidFactura.toUpperCase())) {
    checks.push(ok('relacion', 'Relacionada a la factura de la venta', 'error'));
    const tipo01 = cfdi.relacionados.some(
      (r) => r.tipoRelacion === '01' && r.uuids.includes(uuidFactura.toUpperCase())
    );
    if (!tipo01) {
      checks.push(
        falla(
          'tipo_relacion',
          'Tipo de relación 01 (nota de crédito)',
          'warning',
          `La relación existe pero con tipo distinto a 01 (${cfdi.relacionados.map((r) => r.tipoRelacion).join(', ')}).`
        )
      );
    }
  } else {
    checks.push(
      falla(
        'relacion',
        'Relacionada a la factura de la venta',
        'error',
        uuidsRelacionados.length
          ? `La NC relaciona ${uuidsRelacionados.join(', ')} — la factura de esta venta es ${uuidFactura}.`
          : 'La NC no trae CfdiRelacionados — no referencia la factura de esta venta.'
      )
    );
  }

  return checks;
}

export function hayErrores(checks: CfdiCheck[]): boolean {
  return checks.some((c) => !c.ok && c.severidad === 'error');
}

/** Resumen del CFDI persistido en `erp.adjuntos.metadata` (ver `cfdiAdjuntoMetadata`). */
export type CfdiResumen = {
  uuid: string | null;
  serie: string | null;
  folio: string | null;
  fecha: string | null;
  total: number;
  checks: CfdiCheck[];
};

/**
 * Lee el snapshot CFDI de la metadata de un adjunto. null si el adjunto no
 * trae CFDI (PDF, o XML subido antes del Sprint 2).
 */
export function leerCfdiMetadata(
  metadata: Record<string, unknown> | null | undefined
): CfdiResumen | null {
  const c = metadata?.cfdi as Record<string, unknown> | undefined;
  if (!c) return null;
  return {
    uuid: (c.uuid as string | null) ?? null,
    serie: (c.serie as string | null) ?? null,
    folio: (c.folio as string | null) ?? null,
    fecha: (c.fecha as string | null) ?? null,
    total: Number(c.total ?? 0),
    checks: (metadata?.checks as CfdiCheck[] | undefined) ?? [],
  };
}

/**
 * Metadata para `erp.adjuntos.metadata` del XML subido: snapshot del CFDI +
 * resultado de los checks (la revisión de la fase los pinta sin re-parsear).
 */
export function cfdiAdjuntoMetadata(
  cfdi: CfdiParsed,
  checks: CfdiCheck[]
): Record<string, unknown> {
  return {
    cfdi: {
      uuid: cfdi.uuid,
      serie: cfdi.serie,
      folio: cfdi.folio,
      fecha: cfdi.fecha,
      tipoComprobante: cfdi.tipoComprobante,
      emisorRfc: cfdi.emisorRfc,
      receptorRfc: cfdi.receptorRfc,
      receptorNombre: cfdi.receptorNombre,
      subtotal: cfdi.subtotal,
      total: cfdi.total,
      moneda: cfdi.moneda,
      metodoPago: cfdi.metodoPago,
      relacionados: cfdi.relacionados,
    },
    checks,
  };
}
