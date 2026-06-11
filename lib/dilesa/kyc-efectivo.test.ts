import { describe, expect, it } from 'vitest';
import {
  domicilioEstructurado,
  domicilioTexto,
  kycEfectivo,
  type KycPersonaFuente,
  type KycVentaFuente,
} from './kyc-efectivo';

// Población 1: venta capturada en BSOP (form Sprint 7c-2) — todo en persona.
const personaBsop: KycPersonaFuente = {
  ocupacion: 'OPERADOR DE MAQUINARIA',
  forma_pago_kyc: 'FINANCIAMIENTO HIPOTECARIO',
  uso_efectivo_kyc: 'SIN USO DE EFECTIVO',
  conocimiento_dueno_beneficiario: 'No',
  es_pep: false,
  numero_credencial_ine: '2149282219',
  domicilio: null,
  domicilio_calle: 'EULALIO GUTIERREZ',
  domicilio_numero_exterior: '105',
  domicilio_numero_interior: null,
  domicilio_colonia: 'FRAC GOBERNADORES',
  domicilio_codigo_postal: '26090',
  domicilio_ciudad: 'PIEDRAS NEGRAS',
  domicilio_estado: 'COAHUILA',
};
const ventaBsop: KycVentaFuente = {
  ocupacion: null,
  forma_pago: null,
  uso_efectivo: null,
  conocimiento_dueno_beneficiario: null,
  es_pep: null,
  ine_numero: null,
};

// Población 2: venta importada de Coda — KYC + INE per-venta, blob en persona.
const personaCoda: KycPersonaFuente = {
  ocupacion: null,
  forma_pago_kyc: null,
  uso_efectivo_kyc: null,
  conocimiento_dueno_beneficiario: 'No',
  es_pep: false,
  numero_credencial_ine: null,
  domicilio: 'PASEO DE LA REV 1006, REAL DEL NORTE, PIEDRAS NEGRAS, COAHUILA, CP 26070',
};
const ventaCoda: KycVentaFuente = {
  ocupacion: 'COMERCIANTE',
  forma_pago: 'RECURSOS PROPIOS',
  uso_efectivo: 'HASTA 1604 UMAS',
  conocimiento_dueno_beneficiario: 'No',
  es_pep: false,
  ine_numero: '2906427095',
};

describe('kycEfectivo', () => {
  it('venta BSOP-nativa: resuelve todo desde persona (incl. INE)', () => {
    const k = kycEfectivo(personaBsop, ventaBsop);
    expect(k.ocupacion).toBe('OPERADOR DE MAQUINARIA');
    expect(k.formaPago).toBe('FINANCIAMIENTO HIPOTECARIO');
    expect(k.usoEfectivo).toBe('SIN USO DE EFECTIVO');
    expect(k.ineNumero).toBe('2149282219');
    expect(k.esPep).toBe(false);
  });

  it('venta Coda: resuelve KYC + INE desde la venta', () => {
    const k = kycEfectivo(personaCoda, ventaCoda);
    expect(k.ocupacion).toBe('COMERCIANTE');
    expect(k.formaPago).toBe('RECURSOS PROPIOS');
    expect(k.usoEfectivo).toBe('HASTA 1604 UMAS');
    expect(k.ineNumero).toBe('2906427095');
  });

  it('la INE per-venta (Coda) gana sobre la de la persona', () => {
    const k = kycEfectivo(
      { ...personaBsop, numero_credencial_ine: '1111111111' },
      { ...ventaBsop, ine_numero: '2222222222' }
    );
    expect(k.ineNumero).toBe('2222222222');
  });

  it('PEP es OR: true en cualquiera de las dos fuentes gana', () => {
    expect(
      kycEfectivo({ ...personaBsop, es_pep: false }, { ...ventaBsop, es_pep: true }).esPep
    ).toBe(true);
    expect(
      kycEfectivo({ ...personaBsop, es_pep: true }, { ...ventaBsop, es_pep: false }).esPep
    ).toBe(true);
    expect(kycEfectivo(personaBsop, ventaBsop).esPep).toBe(false);
  });

  it('tolera persona/venta null', () => {
    const k = kycEfectivo(null, null);
    expect(k.ocupacion).toBeNull();
    expect(k.ineNumero).toBeNull();
    expect(k.esPep).toBe(false);
  });
});

describe('domicilioEstructurado', () => {
  it('mapea municipio←ciudad y entidadFederativa←estado', () => {
    const d = domicilioEstructurado(personaBsop);
    expect(d?.municipio).toBe('PIEDRAS NEGRAS');
    expect(d?.entidadFederativa).toBe('COAHUILA');
    expect(d?.calle).toBe('EULALIO GUTIERREZ');
  });

  it('null cuando no hay ningún campo estructurado (persona Coda)', () => {
    expect(domicilioEstructurado(personaCoda)).toBeNull();
    expect(domicilioEstructurado(null)).toBeNull();
  });
});

describe('domicilioTexto', () => {
  it('usa el blob histórico si existe', () => {
    expect(domicilioTexto(personaCoda)).toBe(
      'PASEO DE LA REV 1006, REAL DEL NORTE, PIEDRAS NEGRAS, COAHUILA, CP 26070'
    );
  });

  it('compone desde estructurado cuando no hay blob', () => {
    expect(domicilioTexto(personaBsop)).toBe(
      'EULALIO GUTIERREZ 105, FRAC GOBERNADORES, PIEDRAS NEGRAS, COAHUILA, CP 26090'
    );
  });

  it('incluye número interior cuando existe', () => {
    expect(domicilioTexto({ ...personaBsop, domicilio_numero_interior: '4B' })).toBe(
      'EULALIO GUTIERREZ 105 INT 4B, FRAC GOBERNADORES, PIEDRAS NEGRAS, COAHUILA, CP 26090'
    );
  });

  it('null cuando no hay blob ni estructurado', () => {
    expect(domicilioTexto(personaCoda && { ...personaCoda, domicilio: null })).toBeNull();
    expect(domicilioTexto(null)).toBeNull();
  });
});
