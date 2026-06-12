import { describe, expect, it } from 'vitest';
import type { CfdiParsed } from '@/lib/cxp/cfdi-parser';
import {
  cfdiAdjuntoMetadata,
  hayErrores,
  validarCfdiFacturaVenta,
  validarCfdiNotaCredito,
  type CfdiCheck,
} from './cfdi-validacion';

const CTX = { empresaRfc: 'DIE030904866', clienteRfc: 'CUVJ0102087M1' };
const UUID_FACTURA = 'C381D054-B2B4-4E4C-915F-642AE2BAC9D1';

function cfdi(partial: Partial<CfdiParsed>): CfdiParsed {
  return {
    version: '4.0',
    uuid: 'AAAAAAAA-BBBB-CCCC-DDDD-EEEEEEEEEEEE',
    serie: 'A',
    folio: '1',
    fecha: '2026-06-11',
    emisorRfc: 'DIE030904866',
    emisorNombre: 'DESARROLLO INMOBILIARIO LOS ENCINOS',
    receptorRfc: 'CUVJ0102087M1',
    receptorNombre: 'JOSUE DANIEL CRUZ VALVERDE',
    usoCfdi: 'G02',
    subtotal: 899000,
    total: 899000,
    moneda: 'MXN',
    formaPago: '03',
    metodoPago: 'PUE',
    tipoComprobante: 'I',
    ivaTrasladado: 0,
    tasaIva: null,
    retencionIva: 0,
    retencionIsr: 0,
    relacionados: [],
    ...partial,
  };
}

const porClave = (checks: CfdiCheck[], clave: string) => checks.find((c) => c.clave === clave);

describe('validarCfdiFacturaVenta', () => {
  it('todo verde con factura emitida por DILESA al cliente de la venta', () => {
    const checks = validarCfdiFacturaVenta(cfdi({}), CTX);
    expect(hayErrores(checks)).toBe(false);
    expect(checks.every((c) => c.ok)).toBe(true);
  });

  it('error si el emisor no es DILESA (factura de otra empresa)', () => {
    const checks = validarCfdiFacturaVenta(cfdi({ emisorRfc: 'XAXX010101000' }), CTX);
    expect(hayErrores(checks)).toBe(true);
    expect(porClave(checks, 'emisor')?.ok).toBe(false);
  });

  it('error si el receptor no es el cliente de la venta', () => {
    const checks = validarCfdiFacturaVenta(cfdi({ receptorRfc: 'OTRO010101AAA' }), CTX);
    expect(hayErrores(checks)).toBe(true);
    expect(porClave(checks, 'receptor')?.detalle).toContain('OTRO010101AAA');
  });

  it('warning (no error) si la venta no tiene RFC del cliente', () => {
    const checks = validarCfdiFacturaVenta(cfdi({}), { ...CTX, clienteRfc: null });
    expect(hayErrores(checks)).toBe(false);
    const receptor = porClave(checks, 'receptor');
    expect(receptor?.ok).toBe(false);
    expect(receptor?.severidad).toBe('warning');
  });

  it('error si no está timbrado o no es tipo I', () => {
    expect(hayErrores(validarCfdiFacturaVenta(cfdi({ uuid: null }), CTX))).toBe(true);
    expect(hayErrores(validarCfdiFacturaVenta(cfdi({ tipoComprobante: 'E' }), CTX))).toBe(true);
  });

  it('moneda extranjera es warning, no bloqueo', () => {
    const checks = validarCfdiFacturaVenta(cfdi({ moneda: 'USD' }), CTX);
    expect(hayErrores(checks)).toBe(false);
    expect(porClave(checks, 'moneda')?.severidad).toBe('warning');
  });
});

describe('validarCfdiNotaCredito', () => {
  const NC_OK = cfdi({
    tipoComprobante: 'E',
    total: 50000,
    relacionados: [{ tipoRelacion: '01', uuids: [UUID_FACTURA] }],
  });

  it('todo verde con NC tipo E relacionada a la factura', () => {
    const checks = validarCfdiNotaCredito(NC_OK, CTX, UUID_FACTURA);
    expect(hayErrores(checks)).toBe(false);
  });

  it('error si la NC no relaciona la factura de la venta', () => {
    const nc = cfdi({
      tipoComprobante: 'E',
      relacionados: [{ tipoRelacion: '01', uuids: ['99999999-0000-0000-0000-000000000000'] }],
    });
    const checks = validarCfdiNotaCredito(nc, CTX, UUID_FACTURA);
    expect(hayErrores(checks)).toBe(true);
    expect(porClave(checks, 'relacion')?.detalle).toContain(UUID_FACTURA);
  });

  it('error si la NC no trae CfdiRelacionados', () => {
    const checks = validarCfdiNotaCredito(cfdi({ tipoComprobante: 'E' }), CTX, UUID_FACTURA);
    expect(hayErrores(checks)).toBe(true);
  });

  it('warning si aún no hay XML de factura para validar la relación', () => {
    const checks = validarCfdiNotaCredito(NC_OK, CTX, null);
    expect(hayErrores(checks)).toBe(false);
    expect(porClave(checks, 'relacion')?.severidad).toBe('warning');
  });

  it('warning si la relación existe pero con tipo distinto a 01', () => {
    const nc = cfdi({
      tipoComprobante: 'E',
      relacionados: [{ tipoRelacion: '03', uuids: [UUID_FACTURA] }],
    });
    const checks = validarCfdiNotaCredito(nc, CTX, UUID_FACTURA);
    expect(hayErrores(checks)).toBe(false);
    expect(porClave(checks, 'tipo_relacion')?.ok).toBe(false);
  });

  it('error si el comprobante no es tipo E', () => {
    const checks = validarCfdiNotaCredito(cfdi({}), CTX, UUID_FACTURA);
    expect(porClave(checks, 'tipo')?.ok).toBe(false);
    expect(hayErrores(checks)).toBe(true);
  });
});

describe('cfdiAdjuntoMetadata', () => {
  it('snapshotea los campos del CFDI y los checks', () => {
    const checks = validarCfdiFacturaVenta(cfdi({}), CTX);
    const meta = cfdiAdjuntoMetadata(cfdi({}), checks);
    const c = meta.cfdi as Record<string, unknown>;
    expect(c.uuid).toBe('AAAAAAAA-BBBB-CCCC-DDDD-EEEEEEEEEEEE');
    expect(c.total).toBe(899000);
    expect(c.tipoComprobante).toBe('I');
    expect(meta.checks).toBe(checks);
  });
});
