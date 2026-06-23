import { describe, it, expect } from 'vitest';
import {
  camposKycFaltantes,
  kycPersonaCompleto,
  buildPersonaKycPayload,
  type PersonaKycSnapshot,
} from './kyc-persona';

/** Persona con el expediente KYC obligatorio completo. */
function personaCompleta(over: Partial<PersonaKycSnapshot> = {}): PersonaKycSnapshot {
  return {
    nombre: 'JUAN ANGEL',
    apellido_paterno: 'FLORES',
    apellido_materno: 'FRAUSTO',
    curp: 'FOFJ991018HDGLRN04',
    rfc: 'FOFJ991018KV6',
    telefono: '8721398418',
    email: 'juan@example.com',
    fecha_nacimiento: '1999-10-18',
    nss: '31149920329',
    numero_credencial_ine: '1659206621',
    domicilio_calle: 'HUITRON',
    domicilio_numero_exterior: 'S/N',
    domicilio_numero_interior: null,
    domicilio_colonia: 'EJIDO HUITRON',
    domicilio_codigo_postal: '35117',
    domicilio_ciudad: 'GOMEZ PALACIO',
    domicilio_estado: 'DURANGO',
    tipo_persona: 'fisica',
    nacionalidad: 'Mexicana',
    estado_civil: 'Soltero',
    ocupacion: 'ALIMENTOS Y BEBIDAS',
    es_pep: false,
    forma_pago_kyc: 'FINANCIAMIENTO HIPOTECARIO',
    uso_efectivo_kyc: 'No',
    conocimiento_dueno_beneficiario: 'No',
    ...over,
  };
}

describe('camposKycFaltantes', () => {
  it('persona completa no tiene faltantes', () => {
    expect(camposKycFaltantes(personaCompleta())).toEqual([]);
  });

  it('null/undefined → sin faltantes (no hay persona que evaluar)', () => {
    expect(camposKycFaltantes(null)).toEqual([]);
    expect(camposKycFaltantes(undefined)).toEqual([]);
  });

  it('detecta el INE faltante (caso Juan Angel migrado)', () => {
    expect(camposKycFaltantes(personaCompleta({ numero_credencial_ine: null }))).toEqual([
      'Número de credencial INE',
    ]);
  });

  it('trata whitespace como vacío', () => {
    expect(camposKycFaltantes(personaCompleta({ numero_credencial_ine: '   ' }))).toEqual([
      'Número de credencial INE',
    ]);
  });

  it('lista todos los obligatorios faltantes', () => {
    const vacia: PersonaKycSnapshot = {
      nombre: null,
      apellido_paterno: null,
      apellido_materno: null,
      curp: null,
      rfc: null,
      telefono: null,
      email: null,
      fecha_nacimiento: null,
      nss: null,
      numero_credencial_ine: null,
      domicilio_calle: null,
      domicilio_numero_exterior: null,
      domicilio_numero_interior: null,
      domicilio_colonia: null,
      domicilio_codigo_postal: null,
      domicilio_ciudad: null,
      domicilio_estado: null,
      tipo_persona: null,
      nacionalidad: null,
      estado_civil: null,
      ocupacion: null,
      es_pep: null,
      forma_pago_kyc: null,
      uso_efectivo_kyc: null,
      conocimiento_dueno_beneficiario: null,
    };
    expect(camposKycFaltantes(vacia)).toHaveLength(19);
  });

  it('apellido_materno y número interior son opcionales (no bloquean)', () => {
    expect(
      camposKycFaltantes(
        personaCompleta({ apellido_materno: null, domicilio_numero_interior: null })
      )
    ).toEqual([]);
  });

  it('campos con default (tipo_persona, nacionalidad, es_pep, conocimiento) no bloquean', () => {
    expect(
      camposKycFaltantes(
        personaCompleta({
          tipo_persona: null,
          nacionalidad: null,
          es_pep: null,
          conocimiento_dueno_beneficiario: null,
        })
      )
    ).toEqual([]);
  });
});

describe('kycPersonaCompleto', () => {
  it('true para persona completa', () => {
    expect(kycPersonaCompleto(personaCompleta())).toBe(true);
  });
  it('false si falta el INE', () => {
    expect(kycPersonaCompleto(personaCompleta({ numero_credencial_ine: null }))).toBe(false);
  });
  it('false para null', () => {
    expect(kycPersonaCompleto(null)).toBe(false);
  });
});

describe('buildPersonaKycPayload', () => {
  it('normaliza strings vacíos a null y aplica trim', () => {
    const payload = buildPersonaKycPayload(personaCompleta({ telefono: '  ', email: ' a@b.com ' }));
    expect(payload.telefono).toBeNull();
    expect(payload.email).toBe('a@b.com');
  });

  it('CURP, RFC e INE vacíos quedan en null (no string vacío)', () => {
    const payload = buildPersonaKycPayload(
      personaCompleta({ curp: '', rfc: '   ', numero_credencial_ine: null })
    );
    expect(payload.curp).toBeNull();
    expect(payload.rfc).toBeNull();
    expect(payload.numero_credencial_ine).toBeNull();
  });

  it('CURP, RFC e INE se guardan en mayúsculas', () => {
    const payload = buildPersonaKycPayload(
      personaCompleta({
        curp: 'fofj991018hdglrn04',
        rfc: 'fofj991018kv6',
        numero_credencial_ine: 'ab12',
      })
    );
    expect(payload.curp).toBe('FOFJ991018HDGLRN04');
    expect(payload.rfc).toBe('FOFJ991018KV6');
    expect(payload.numero_credencial_ine).toBe('AB12');
  });

  it('aplica defaults de tipo_persona, es_pep y conocimiento', () => {
    const payload = buildPersonaKycPayload(
      personaCompleta({ tipo_persona: null, es_pep: null, conocimiento_dueno_beneficiario: '' })
    );
    expect(payload.tipo_persona).toBe('fisica');
    expect(payload.es_pep).toBe(false);
    expect(payload.conocimiento_dueno_beneficiario).toBe('No');
  });

  it('preserva es_pep verdadero', () => {
    expect(buildPersonaKycPayload(personaCompleta({ es_pep: true })).es_pep).toBe(true);
  });
});
