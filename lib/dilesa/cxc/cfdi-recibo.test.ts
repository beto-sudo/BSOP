import { describe, expect, it } from 'vitest';
import {
  mapFormaPagoSat,
  normalizarNombre,
  parseReciboCfdi,
  verificarReciboVsCliente,
} from './cfdi-recibo';
import { CfdiParseError } from '@/lib/cxp/cfdi-parser';

/**
 * Tests del recibo de caja CFDI (iniciativa cxc — abono con XML). Lógica pura
 * sobre XML del SAT, env=node. Cubre: REP tipo P (complemento de pagos 2.0,
 * incluido multi-Pago), factura tipo I de contado, errores (sin timbre, tipo
 * E, P sin complemento), mapeo de claves SAT y verificación de receptor por
 * RFC / nombre / genérico.
 */

const RFC_DILESA = 'DIE030904866';

// REP (tipo P) clásico: recibo de caja de un abono de cliente. Total=0 por
// regla SAT; el dato vive en el complemento Pagos 2.0.
const REP_TIPO_P = `<?xml version="1.0" encoding="UTF-8"?>
<cfdi:Comprobante xmlns:cfdi="http://www.sat.gob.mx/cfd/4" xmlns:pago20="http://www.sat.gob.mx/Pagos20"
  xmlns:tfd="http://www.sat.gob.mx/TimbreFiscalDigital"
  Version="4.0" Serie="REP" Folio="881" Fecha="2026-06-11T09:15:00"
  SubTotal="0" Total="0" Moneda="XXX" TipoDeComprobante="P">
  <cfdi:Emisor Rfc="${RFC_DILESA}" Nombre="DESARROLLO INMOBILIARIO LOS ENCINOS"/>
  <cfdi:Receptor Rfc="AUCJ960115ABC" Nombre="JESUS SANTIAGO AHUMADA CASTILLO" UsoCFDI="CP01"/>
  <cfdi:Conceptos>
    <cfdi:Concepto ClaveProdServ="84111506" Cantidad="1" Descripcion="Pago" ValorUnitario="0" Importe="0"/>
  </cfdi:Conceptos>
  <cfdi:Complemento>
    <pago20:Pagos Version="2.0">
      <pago20:Totales MontoTotalPagos="465400.00"/>
      <pago20:Pago FechaPago="2026-06-10T12:00:00" FormaDePagoP="03" MonedaP="MXN" Monto="465400.00">
        <pago20:DoctoRelacionado IdDocumento="aaaa1111-2222-3333-4444-555555555555" MonedaDR="MXN"
          NumParcialidad="1" ImpSaldoAnt="930800.00" ImpPagado="465400.00" ImpSaldoInsoluto="465400.00"/>
      </pago20:Pago>
    </pago20:Pagos>
    <tfd:TimbreFiscalDigital Version="1.1" UUID="bbbb2222-3333-4444-5555-666666666666" FechaTimbrado="2026-06-11T09:16:00"/>
  </cfdi:Complemento>
</cfdi:Comprobante>`;

// REP con DOS nodos Pago (la institución liquidó en dos exhibiciones el mismo recibo).
const REP_DOS_PAGOS = REP_TIPO_P.replace(
  '</pago20:Pagos>',
  `  <pago20:Pago FechaPago="2026-06-11T10:00:00" FormaDePagoP="03" MonedaP="MXN" Monto="100.50"/>
    </pago20:Pagos>`
);

// Factura tipo I de contado (PUE) usada como recibo del pago.
const FACTURA_TIPO_I = `<?xml version="1.0" encoding="UTF-8"?>
<cfdi:Comprobante xmlns:cfdi="http://www.sat.gob.mx/cfd/4" xmlns:tfd="http://www.sat.gob.mx/TimbreFiscalDigital"
  Version="4.0" Serie="F" Folio="120" Fecha="2026-06-09T16:40:00"
  SubTotal="9200.00" Total="9200.00" Moneda="MXN" FormaPago="01" MetodoPago="PUE" TipoDeComprobante="I">
  <cfdi:Emisor Rfc="${RFC_DILESA}" Nombre="DESARROLLO INMOBILIARIO LOS ENCINOS"/>
  <cfdi:Receptor Rfc="XAXX010101000" Nombre="MARIA GUADALUPE PEÑA NUÑEZ" UsoCFDI="S01"/>
  <cfdi:Complemento>
    <tfd:TimbreFiscalDigital UUID="cccc3333-4444-5555-6666-777777777777"/>
  </cfdi:Complemento>
</cfdi:Comprobante>`;

const TIPO_P_SIN_COMPLEMENTO = `<?xml version="1.0" encoding="UTF-8"?>
<cfdi:Comprobante xmlns:cfdi="http://www.sat.gob.mx/cfd/4" xmlns:tfd="http://www.sat.gob.mx/TimbreFiscalDigital"
  Version="4.0" Fecha="2026-06-11T09:15:00" SubTotal="0" Total="0" Moneda="XXX" TipoDeComprobante="P">
  <cfdi:Emisor Rfc="${RFC_DILESA}" Nombre="DILESA"/>
  <cfdi:Receptor Rfc="AUCJ960115ABC" Nombre="CLIENTE" UsoCFDI="CP01"/>
  <cfdi:Complemento>
    <tfd:TimbreFiscalDigital UUID="dddd4444-5555-6666-7777-888888888888"/>
  </cfdi:Complemento>
</cfdi:Comprobante>`;

const NOTA_CREDITO_TIPO_E = FACTURA_TIPO_I.replace(
  'TipoDeComprobante="I"',
  'TipoDeComprobante="E"'
);

const SIN_TIMBRE = FACTURA_TIPO_I.replace(/<cfdi:Complemento>[\s\S]*?<\/cfdi:Complemento>/, '');

describe('parseReciboCfdi — REP tipo P', () => {
  const r = parseReciboCfdi(REP_TIPO_P);

  it('toma el monto y la fecha del complemento de pagos, no del Total', () => {
    expect(r.monto).toBe(465400);
    expect(r.fecha).toBe('2026-06-10');
  });
  it('expone folio fiscal, tipo y forma de pago del nodo Pago', () => {
    expect(r.uuid).toBe('BBBB2222-3333-4444-5555-666666666666');
    expect(r.tipoComprobante).toBe('P');
    expect(r.formaPagoSat).toBe('03');
  });
  it('suma los montos cuando el REP ampara varios nodos Pago', () => {
    const r2 = parseReciboCfdi(REP_DOS_PAGOS);
    expect(r2.monto).toBeCloseTo(465500.5, 2);
    expect(r2.fecha).toBe('2026-06-10'); // la del primer Pago
  });
});

describe('parseReciboCfdi — factura tipo I (contado PUE)', () => {
  const r = parseReciboCfdi(FACTURA_TIPO_I);

  it('usa Total y fecha de emisión', () => {
    expect(r.monto).toBe(9200);
    expect(r.fecha).toBe('2026-06-09');
    expect(r.tipoComprobante).toBe('I');
    expect(r.formaPagoSat).toBe('01');
  });
});

describe('parseReciboCfdi — errores', () => {
  it('rechaza CFDI sin timbrar', () => {
    expect(() => parseReciboCfdi(SIN_TIMBRE)).toThrow(CfdiParseError);
    expect(() => parseReciboCfdi(SIN_TIMBRE)).toThrow(/timbrado/i);
  });
  it('rechaza tipos que no son P ni I (nota de crédito)', () => {
    expect(() => parseReciboCfdi(NOTA_CREDITO_TIPO_E)).toThrow(/tipo "E"/);
  });
  it('rechaza tipo P sin complemento de pagos', () => {
    expect(() => parseReciboCfdi(TIPO_P_SIN_COMPLEMENTO)).toThrow(/complemento de pagos/i);
  });
});

describe('mapFormaPagoSat', () => {
  it('mapea claves SAT a opciones del drawer', () => {
    expect(mapFormaPagoSat('01')).toBe('efectivo');
    expect(mapFormaPagoSat('02')).toBe('cheque');
    expect(mapFormaPagoSat('03')).toBe('transferencia');
    expect(mapFormaPagoSat('04')).toBe('tarjeta');
    expect(mapFormaPagoSat('28')).toBe('tarjeta');
    expect(mapFormaPagoSat('99')).toBe('otro');
    expect(mapFormaPagoSat(null)).toBeNull();
  });
});

describe('normalizarNombre', () => {
  it('quita acentos (Ñ→N), puntuación y colapsa espacios', () => {
    expect(normalizarNombre('  María   de Jesús  Peña-Núñez ')).toBe('MARIA DE JESUS PENA NUNEZ');
  });
});

describe('verificarReciboVsCliente', () => {
  const recibo = parseReciboCfdi(REP_TIPO_P); // receptor AUCJ960115ABC / JESUS SANTIAGO AHUMADA CASTILLO

  it('coincide por RFC cuando ambos lo tienen', () => {
    const v = verificarReciboVsCliente(recibo, {
      rfc: 'aucj960115abc',
      nombre: 'OTRO NOMBRE',
    });
    expect(v.receptorCoincide).toBe(true);
    expect(v.verificadoPor).toBe('rfc');
  });

  it('detecta mismatch de RFC (no coincide aunque el nombre sí)', () => {
    const v = verificarReciboVsCliente(recibo, {
      rfc: 'ZZZZ010101ZZZ',
      nombre: 'JESUS SANTIAGO AHUMADA CASTILLO',
    });
    expect(v.receptorCoincide).toBe(false);
    expect(v.verificadoPor).toBe('rfc');
  });

  it('cae a nombre normalizado cuando el cliente no tiene RFC', () => {
    const v = verificarReciboVsCliente(recibo, {
      rfc: null,
      nombre: 'Jesús Santiago Ahumada Castillo',
    });
    expect(v.receptorCoincide).toBe(true);
    expect(v.verificadoPor).toBe('nombre');
    expect(v.warnings.some((w) => /sin RFC/i.test(w))).toBe(true);
  });

  it('cae a nombre cuando el recibo trae RFC genérico del SAT', () => {
    const generico = parseReciboCfdi(FACTURA_TIPO_I); // receptor XAXX010101000
    const v = verificarReciboVsCliente(generico, {
      rfc: 'PENM800101AAA',
      nombre: 'María Guadalupe Peña Nuñez',
    });
    expect(v.receptorCoincide).toBe(true);
    expect(v.verificadoPor).toBe('nombre');
  });

  it('avisa cuando el emisor no es el RFC de la empresa', () => {
    const v = verificarReciboVsCliente(
      recibo,
      { rfc: 'AUCJ960115ABC', nombre: 'X' },
      'OTR010101OTR'
    );
    expect(v.receptorCoincide).toBe(true);
    expect(v.warnings.some((w) => /emisor/i.test(w))).toBe(true);
  });

  it('moneda extranjera genera warning (tipo P usa MonedaP, aquí valida la del comprobante)', () => {
    const usd = parseReciboCfdi(FACTURA_TIPO_I.replace('Moneda="MXN"', 'Moneda="USD"'));
    const v = verificarReciboVsCliente(usd, { rfc: null, nombre: 'María Guadalupe Peña Nuñez' });
    expect(v.warnings.some((w) => /USD/.test(w))).toBe(true);
  });
});
