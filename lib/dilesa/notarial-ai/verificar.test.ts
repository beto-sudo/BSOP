import { describe, expect, it } from 'vitest';
import { norm, soloDigitos, verificarNotarial, type ContextoVenta } from './verificar';
import type { NotarialExtraccion } from './extraer';

// Basado en el documento real del expediente Arizpe Luna (carta de
// instrucción INFONAVIT, 2026-05-07).
const EXTRACCION: NotarialExtraccion = {
  tipo_documento: 'carta_instruccion',
  nombre_titular: 'ARIZPE LUNA LUIS GERARDO',
  nss: '63169350517',
  numero_credito: '0526096361',
  institucion_credito: 'INFONAVIT',
  precio_compraventa: 909000,
  monto_credito: 835566.99,
  gastos_titulacion: 0,
  impuestos_derechos: 0,
  costo_avaluo: 0,
  domicilio_inmueble:
    'PASEO DE LA GAVIOTA 147 SMZ 112 MZ 10 LT 34 EDIF CASA HABITACION NIV 03, FRACCIONAMIENTO LOMAS DE LOS ENCINOS, C.P: 26170, NAVA, COAHUILA',
  vendedor: 'DESARROLLO INMOBILIARIO LOS ENCINOS S.A. DE C.V.',
  clabe_beneficiario: '012068001415024927',
  banco_beneficiario: 'BBVA BANCOMER',
};

const CTX: ContextoVenta = {
  clienteNombre: 'Luis Gerardo Arizpe Luna', // orden NOMBRE APELLIDOS (BSOP)
  clienteNss: '63169350517',
  unidadManzana: '10',
  unidadLote: '34',
  clabesEmpresa: ['012068001415024927', '012345678901234567'],
  razonesEmpresa: ['Desarrollo Inmobiliario Los Encinos S.A de C.V.', 'DILESA'],
};

describe('verificarNotarial', () => {
  it('todo coincide con el expediente real (orden de nombre distinto)', () => {
    const v = verificarNotarial(EXTRACCION, CTX);
    expect(v).toEqual({
      nss_coincide: true,
      nombre_coincide: true,
      domicilio_coincide: true,
      clabe_es_dilesa: true,
      vendedor_es_dilesa: true,
    });
  });

  it('NSS distinto → false; sin NSS del cliente → null', () => {
    expect(verificarNotarial(EXTRACCION, { ...CTX, clienteNss: '99999999999' }).nss_coincide).toBe(
      false
    );
    expect(verificarNotarial(EXTRACCION, { ...CTX, clienteNss: null }).nss_coincide).toBe(null);
    expect(verificarNotarial({ ...EXTRACCION, nss: '' }, CTX).nss_coincide).toBe(null);
  });

  it('manzana/lote: tolera ceros a la izquierda y detecta mismatch', () => {
    // Unidad con cero a la izquierda ("010") sigue matcheando "MZ 10".
    expect(verificarNotarial(EXTRACCION, { ...CTX, unidadManzana: '010' }).domicilio_coincide).toBe(
      true
    );
    // Lote distinto → false (es otra vivienda).
    expect(verificarNotarial(EXTRACCION, { ...CTX, unidadLote: '35' }).domicilio_coincide).toBe(
      false
    );
    // Sin manzana en la unidad → null (no hay con qué comparar).
    expect(verificarNotarial(EXTRACCION, { ...CTX, unidadManzana: null }).domicilio_coincide).toBe(
      null
    );
  });

  it('CLABE foránea → false (alerta anti-fraude); sin CLABE extraída → null', () => {
    expect(
      verificarNotarial({ ...EXTRACCION, clabe_beneficiario: '999999999999999999' }, CTX)
        .clabe_es_dilesa
    ).toBe(false);
    expect(verificarNotarial({ ...EXTRACCION, clabe_beneficiario: '' }, CTX).clabe_es_dilesa).toBe(
      null
    );
    expect(verificarNotarial(EXTRACCION, { ...CTX, clabesEmpresa: [] }).clabe_es_dilesa).toBe(null);
  });

  it('vendedor: tolera variantes de razón social ("S.A. DE C.V." vs "S.A DE C.V")', () => {
    expect(verificarNotarial(EXTRACCION, CTX).vendedor_es_dilesa).toBe(true);
    expect(
      verificarNotarial({ ...EXTRACCION, vendedor: 'INMOBILIARIA PIRATA SA DE CV' }, CTX)
        .vendedor_es_dilesa
    ).toBe(false);
  });

  it('nombre con token faltante → false', () => {
    expect(
      verificarNotarial({ ...EXTRACCION, nombre_titular: 'ARIZPE LUNA JOSE' }, CTX).nombre_coincide
    ).toBe(false);
  });
});

describe('helpers', () => {
  it('norm quita acentos, símbolos y normaliza espacios', () => {
    expect(norm('  Desarrollo  Inmobiliário, S.A. de C.V. ')).toBe(
      'DESARROLLO INMOBILIARIO S A DE C V'
    );
  });
  it('soloDigitos', () => {
    expect(soloDigitos('012-068 001415024927')).toBe('012068001415024927');
  });
});
