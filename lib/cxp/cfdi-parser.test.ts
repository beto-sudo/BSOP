import { describe, expect, it } from 'vitest';
import { parseCfdiXml, CfdiParseError } from './cfdi-parser';

/**
 * Tests del parser CFDI (CxP Sprint 2). Lógica pura sobre XML estructurado del
 * SAT — env=node, sin DOM. Cubre: CFDI 4.0 completo, retenciones (servicios
 * profesionales), tasa frontera 8%, sin timbrar (uuid null), y errores.
 */

const CFDI_40_IVA16 = `<?xml version="1.0" encoding="UTF-8"?>
<cfdi:Comprobante xmlns:cfdi="http://www.sat.gob.mx/cfd/4" xmlns:tfd="http://www.sat.gob.mx/TimbreFiscalDigital"
  Version="4.0" Serie="A" Folio="1234" Fecha="2026-01-15T10:30:00"
  SubTotal="1000.00" Total="1160.00" Moneda="MXN" FormaPago="03" MetodoPago="PUE" TipoDeComprobante="I">
  <cfdi:Emisor Rfc="aaa010101aaa" Nombre="Proveedor Demo SA de CV" RegimenFiscal="601"/>
  <cfdi:Receptor Rfc="DIE030904866" Nombre="DESARROLLO INMOBILIARIO LOS ENCINOS" UsoCFDI="G03"/>
  <cfdi:Conceptos>
    <cfdi:Concepto ClaveProdServ="01010101" Cantidad="1" Descripcion="Servicio" ValorUnitario="1000.00" Importe="1000.00"/>
  </cfdi:Conceptos>
  <cfdi:Impuestos TotalImpuestosTrasladados="160.00">
    <cfdi:Traslados>
      <cfdi:Traslado Base="1000.00" Impuesto="002" TipoFactor="Tasa" TasaOCuota="0.160000" Importe="160.00"/>
    </cfdi:Traslados>
  </cfdi:Impuestos>
  <cfdi:Complemento>
    <tfd:TimbreFiscalDigital Version="1.1" UUID="a1b2c3d4-e5f6-7890-abcd-ef1234567890" FechaTimbrado="2026-01-15T10:31:00"/>
  </cfdi:Complemento>
</cfdi:Comprobante>`;

// Servicios profesionales: traslado IVA 16% + retenciones IVA (10.6667%) e ISR (10%).
const CFDI_40_RETENCIONES = `<?xml version="1.0" encoding="UTF-8"?>
<cfdi:Comprobante xmlns:cfdi="http://www.sat.gob.mx/cfd/4" xmlns:tfd="http://www.sat.gob.mx/TimbreFiscalDigital"
  Version="4.0" Folio="55" Fecha="2026-02-20T09:00:00" SubTotal="1000.00" Total="1053.33"
  Moneda="MXN" FormaPago="03" MetodoPago="PPD" TipoDeComprobante="I">
  <cfdi:Emisor Rfc="XAXX010101000" Nombre="Despacho Contable"/>
  <cfdi:Receptor Rfc="DIE030904866" Nombre="DESARROLLO INMOBILIARIO LOS ENCINOS" UsoCFDI="G03"/>
  <cfdi:Impuestos TotalImpuestosTrasladados="160.00" TotalImpuestosRetenidos="206.67">
    <cfdi:Retenciones>
      <cfdi:Retencion Impuesto="002" Importe="106.67"/>
      <cfdi:Retencion Impuesto="001" Importe="100.00"/>
    </cfdi:Retenciones>
    <cfdi:Traslados>
      <cfdi:Traslado Base="1000.00" Impuesto="002" TipoFactor="Tasa" TasaOCuota="0.160000" Importe="160.00"/>
    </cfdi:Traslados>
  </cfdi:Impuestos>
  <cfdi:Complemento>
    <tfd:TimbreFiscalDigital UUID="11111111-2222-3333-4444-555555555555"/>
  </cfdi:Complemento>
</cfdi:Comprobante>`;

// Frontera norte: IVA 8%, sin timbrar (borrador sin Complemento).
const CFDI_40_FRONTERA_SIN_TIMBRE = `<?xml version="1.0" encoding="UTF-8"?>
<cfdi:Comprobante xmlns:cfdi="http://www.sat.gob.mx/cfd/4" Version="4.0" Fecha="2026-03-01T12:00:00"
  SubTotal="500.00" Total="540.00" Moneda="MXN" FormaPago="01" MetodoPago="PUE" TipoDeComprobante="I">
  <cfdi:Emisor Rfc="BBB020202BB2" Nombre="Ferretería Frontera"/>
  <cfdi:Receptor Rfc="DIE030904866" UsoCFDI="G01"/>
  <cfdi:Impuestos TotalImpuestosTrasladados="40.00">
    <cfdi:Traslados>
      <cfdi:Traslado Base="500.00" Impuesto="002" TipoFactor="Tasa" TasaOCuota="0.080000" Importe="40.00"/>
    </cfdi:Traslados>
  </cfdi:Impuestos>
</cfdi:Comprobante>`;

describe('parseCfdiXml — CFDI 4.0 con IVA 16%', () => {
  const r = parseCfdiXml(CFDI_40_IVA16);

  it('extrae folio fiscal (UUID) en mayúsculas', () => {
    expect(r.uuid).toBe('A1B2C3D4-E5F6-7890-ABCD-EF1234567890');
  });
  it('extrae emisor y receptor (RFC normalizado a mayúsculas)', () => {
    expect(r.emisorRfc).toBe('AAA010101AAA');
    expect(r.emisorNombre).toBe('Proveedor Demo SA de CV');
    expect(r.receptorRfc).toBe('DIE030904866');
  });
  it('extrae montos y moneda', () => {
    expect(r.subtotal).toBe(1000);
    expect(r.total).toBe(1160);
    expect(r.moneda).toBe('MXN');
  });
  it('deriva IVA trasladado y tasa 16', () => {
    expect(r.ivaTrasladado).toBeCloseTo(160, 2);
    expect(r.tasaIva).toBe(16);
  });
  it('sin retenciones', () => {
    expect(r.retencionIva).toBe(0);
    expect(r.retencionIsr).toBe(0);
  });
  it('extrae forma/método de pago, uso CFDI, tipo y fecha (solo día)', () => {
    expect(r.formaPago).toBe('03');
    expect(r.metodoPago).toBe('PUE');
    expect(r.usoCfdi).toBe('G03');
    expect(r.tipoComprobante).toBe('I');
    expect(r.fecha).toBe('2026-01-15');
    expect(r.version).toBe('4.0');
  });
});

describe('parseCfdiXml — retenciones de servicios profesionales', () => {
  const r = parseCfdiXml(CFDI_40_RETENCIONES);
  it('separa retención de IVA (002) e ISR (001)', () => {
    expect(r.retencionIva).toBeCloseTo(106.67, 2);
    expect(r.retencionIsr).toBeCloseTo(100, 2);
  });
  it('mantiene el IVA trasladado y método PPD', () => {
    expect(r.ivaTrasladado).toBeCloseTo(160, 2);
    expect(r.metodoPago).toBe('PPD');
  });
});

describe('parseCfdiXml — frontera 8% sin timbrar', () => {
  const r = parseCfdiXml(CFDI_40_FRONTERA_SIN_TIMBRE);
  it('tasa 8 y uuid null (sin TimbreFiscalDigital)', () => {
    expect(r.tasaIva).toBe(8);
    expect(r.uuid).toBeNull();
  });
  it('receptorNombre null cuando no viene', () => {
    expect(r.receptorNombre).toBeNull();
    expect(r.emisorRfc).toBe('BBB020202BB2');
  });
});

describe('parseCfdiXml — errores', () => {
  it('lanza en XML vacío', () => {
    expect(() => parseCfdiXml('')).toThrow(CfdiParseError);
  });
  it('lanza si no hay nodo Comprobante', () => {
    expect(() => parseCfdiXml('<?xml version="1.0"?><foo><bar/></foo>')).toThrow(/Comprobante/);
  });
  it('lanza si falta RFC del emisor', () => {
    const sinEmisor = CFDI_40_IVA16.replace(/Rfc="aaa010101aaa"/, 'Rfc=""');
    expect(() => parseCfdiXml(sinEmisor)).toThrow(CfdiParseError);
  });
});
