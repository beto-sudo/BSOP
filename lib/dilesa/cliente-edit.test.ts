import { describe, it, expect } from 'vitest';
import {
  normalizeClienteEdit,
  camposRequeridosVacios,
  diffClienteEdit,
  type ClienteEditInput,
} from './cliente-edit';

function input(over: Partial<ClienteEditInput> = {}): ClienteEditInput {
  return {
    nombre: 'JUAN ANGEL',
    apellido_paterno: 'FLORES',
    apellido_materno: 'FRAUSTO',
    curp: 'FOFJ991018HDGLRN04',
    rfc: 'FOFJ991018KV6',
    nss: '31149920329',
    numero_credencial_ine: '1659206621',
    fecha_nacimiento: '1999-10-18',
    estado_civil: 'Soltero',
    nacionalidad: 'Mexicana',
    tipo_persona: 'fisica',
    email: 'juan@example.com',
    telefono: '8721398418',
    domicilio_calle: 'HIDALGO',
    domicilio_numero_exterior: '123',
    domicilio_numero_interior: '',
    domicilio_colonia: 'CENTRO',
    domicilio_codigo_postal: '26000',
    domicilio_ciudad: 'PIEDRAS NEGRAS',
    domicilio_estado: 'COAHUILA',
    ocupacion: 'EMPLEADO',
    es_pep: false,
    forma_pago_kyc: 'FINANCIAMIENTO HIPOTECARIO',
    uso_efectivo_kyc: 'No',
    conocimiento_dueno_beneficiario: 'No',
    ...over,
  };
}

describe('normalizeClienteEdit', () => {
  it('trim + strings vacíos → null', () => {
    const n = normalizeClienteEdit(input({ telefono: '  ', domicilio_numero_interior: '   ' }));
    expect(n.telefono).toBeNull();
    expect(n.domicilio_numero_interior).toBeNull();
  });

  it('CURP, RFC e INE en mayúsculas', () => {
    const n = normalizeClienteEdit(
      input({ curp: 'fofj991018hdglrn04', rfc: 'fofj991018kv6', numero_credencial_ine: 'ab12' })
    );
    expect(n.curp).toBe('FOFJ991018HDGLRN04');
    expect(n.rfc).toBe('FOFJ991018KV6');
    expect(n.numero_credencial_ine).toBe('AB12');
  });

  it('email y nombre NO se uppercasean', () => {
    const n = normalizeClienteEdit(input({ email: ' Juan@Example.com ' }));
    expect(n.email).toBe('Juan@Example.com');
  });

  it('es_pep (boolean) pasa tal cual', () => {
    expect(normalizeClienteEdit(input({ es_pep: true })).es_pep).toBe(true);
    expect(normalizeClienteEdit(input({ es_pep: false })).es_pep).toBe(false);
  });
});

describe('camposRequeridosVacios', () => {
  it('nombre vacío se reporta', () => {
    expect(camposRequeridosVacios(normalizeClienteEdit(input({ nombre: '   ' })))).toEqual([
      'Nombre',
    ]);
  });
  it('nombre presente → sin faltantes', () => {
    expect(camposRequeridosVacios(normalizeClienteEdit(input()))).toEqual([]);
  });
});

describe('diffClienteEdit', () => {
  it('solo devuelve los campos que cambiaron, con antes/después', () => {
    const actual = {
      domicilio_calle: 'VIEJA',
      numero_credencial_ine: '1659206621',
      telefono: '8721398418',
    };
    const nuevo = normalizeClienteEdit(input({ domicilio_calle: 'HIDALGO' }));
    const { anteriores, nuevos } = diffClienteEdit(actual, nuevo);
    expect(nuevos.domicilio_calle).toBe('HIDALGO');
    expect(anteriores.domicilio_calle).toBe('VIEJA');
    // INE y teléfono no cambiaron → no aparecen.
    expect('numero_credencial_ine' in nuevos).toBe(false);
    expect('telefono' in nuevos).toBe(false);
  });

  it('sin cambios → objetos vacíos', () => {
    const norm = normalizeClienteEdit(input());
    const { anteriores, nuevos } = diffClienteEdit(norm, norm);
    expect(Object.keys(nuevos)).toHaveLength(0);
    expect(Object.keys(anteriores)).toHaveLength(0);
  });

  it('trata "campo ausente en actual" como null (cambio si el nuevo tiene valor)', () => {
    const nuevo = normalizeClienteEdit(input({ ocupacion: 'INGENIERO' }));
    const { anteriores, nuevos } = diffClienteEdit({}, nuevo);
    expect(nuevos.ocupacion).toBe('INGENIERO');
    expect(anteriores.ocupacion).toBeNull();
  });
});
