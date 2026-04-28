import { describe, it, expect } from 'vitest';

import {
  CsfExtraccionSchema,
  CreateProveedorPayloadSchema,
  UpdateCsfPayloadSchema,
  RegimenSchema,
  ObligacionSchema,
  ActividadEconomicaSchema,
} from './extract-csf';

/**
 * Tests del schema Zod para la extracción CSF.
 *
 * Estos son tests de la forma de los datos, no de la llamada a Claude.
 * Validan que un objeto bien formado parsea, que los campos opcionales
 * aceptan null, y que los discriminadores (tipo_persona) rechazan
 * valores fuera del enum.
 *
 * La extracción real con Claude requiere PDFs + API key — eso vive
 * como integration test fuera de la suite unitaria.
 */

describe('CsfExtraccionSchema — persona moral', () => {
  it('parsea una CSF de persona moral mínima válida', () => {
    const input = {
      tipo_persona: 'moral',
      rfc: 'ABC010101AB1',
      curp: null,
      nombre: null,
      apellido_paterno: null,
      apellido_materno: null,
      razon_social: 'EJEMPLO SA DE CV',
      nombre_comercial: null,
      regimen_fiscal_codigo: '601',
      regimen_fiscal_nombre: 'General de Ley Personas Morales',
      regimenes_adicionales: [
        {
          codigo: '601',
          nombre: 'General de Ley Personas Morales',
          fecha_inicio: '2020-01-01',
          fecha_fin: null,
        },
      ],
      domicilio_calle: 'Av. Reforma',
      domicilio_num_ext: '100',
      domicilio_num_int: null,
      domicilio_colonia: 'Centro',
      domicilio_cp: '06000',
      domicilio_municipio: 'Cuauhtémoc',
      domicilio_estado: 'CDMX',
      obligaciones: [],
      fecha_inicio_operaciones: '2020-01-01',
      fecha_emision: '2026-04-27',
    };
    const parsed = CsfExtraccionSchema.parse(input);
    expect(parsed.tipo_persona).toBe('moral');
    expect(parsed.razon_social).toBe('EJEMPLO SA DE CV');
    expect(parsed.curp).toBeNull();
    expect(parsed.regimenes_adicionales).toHaveLength(1);
  });

  it('acepta nombre_comercial y un domicilio parcial', () => {
    const input = {
      tipo_persona: 'moral',
      rfc: 'XYZ010101XY9',
      curp: null,
      nombre: null,
      apellido_paterno: null,
      apellido_materno: null,
      razon_social: 'EMPRESA EJEMPLO',
      nombre_comercial: 'EjemploCo',
      regimen_fiscal_codigo: '601',
      regimen_fiscal_nombre: 'General de Ley Personas Morales',
      regimenes_adicionales: [
        {
          codigo: '601',
          nombre: 'General de Ley Personas Morales',
          fecha_inicio: null,
          fecha_fin: null,
        },
      ],
      domicilio_calle: null,
      domicilio_num_ext: null,
      domicilio_num_int: null,
      domicilio_colonia: null,
      domicilio_cp: '64000',
      domicilio_municipio: 'Monterrey',
      domicilio_estado: 'NL',
      obligaciones: [],
      fecha_inicio_operaciones: null,
      fecha_emision: null,
    };
    const parsed = CsfExtraccionSchema.parse(input);
    expect(parsed.nombre_comercial).toBe('EjemploCo');
    expect(parsed.domicilio_calle).toBeNull();
    expect(parsed.domicilio_cp).toBe('64000');
  });
});

describe('CsfExtraccionSchema — persona física', () => {
  it('parsea una CSF de persona física con CURP y apellidos', () => {
    const input = {
      tipo_persona: 'fisica',
      rfc: 'PEPJ800101AB1',
      curp: 'PEPJ800101HCLRRN09',
      nombre: 'JUAN',
      apellido_paterno: 'PEREZ',
      apellido_materno: 'PEREZ',
      razon_social: null,
      nombre_comercial: null,
      regimen_fiscal_codigo: '612',
      regimen_fiscal_nombre:
        'Régimen de las Personas Físicas con Actividades Empresariales y Profesionales',
      regimenes_adicionales: [
        {
          codigo: '612',
          nombre: 'Régimen de las Personas Físicas con Actividades Empresariales y Profesionales',
          fecha_inicio: '2018-06-01',
          fecha_fin: null,
        },
      ],
      domicilio_calle: 'Calle Falsa',
      domicilio_num_ext: '123',
      domicilio_num_int: 'A',
      domicilio_colonia: 'Las Flores',
      domicilio_cp: '26000',
      domicilio_municipio: 'Piedras Negras',
      domicilio_estado: 'Coahuila',
      obligaciones: [
        {
          descripcion: 'Declaración anual de ISR',
          fecha_inicio: '2018-06-01',
          fecha_fin: null,
        },
      ],
      fecha_inicio_operaciones: '2018-06-01',
      fecha_emision: '2026-04-27',
    };
    const parsed = CsfExtraccionSchema.parse(input);
    expect(parsed.tipo_persona).toBe('fisica');
    expect(parsed.nombre).toBe('JUAN');
    expect(parsed.apellido_paterno).toBe('PEREZ');
    expect(parsed.curp).toBe('PEPJ800101HCLRRN09');
    expect(parsed.razon_social).toBeNull();
    expect(parsed.obligaciones).toHaveLength(1);
  });

  it('acepta apellido_materno null (madre desconocida o solo un apellido)', () => {
    const input = {
      tipo_persona: 'fisica',
      rfc: 'PEX800101AB1',
      curp: null,
      nombre: 'PEDRO',
      apellido_paterno: 'PEREZ',
      apellido_materno: null,
      razon_social: null,
      nombre_comercial: null,
      regimen_fiscal_codigo: null,
      regimen_fiscal_nombre: null,
      regimenes_adicionales: [],
      domicilio_calle: null,
      domicilio_num_ext: null,
      domicilio_num_int: null,
      domicilio_colonia: null,
      domicilio_cp: null,
      domicilio_municipio: null,
      domicilio_estado: null,
      obligaciones: [],
      fecha_inicio_operaciones: null,
      fecha_emision: null,
    };
    const parsed = CsfExtraccionSchema.parse(input);
    expect(parsed.apellido_materno).toBeNull();
  });
});

describe('CsfExtraccionSchema — múltiples regímenes y obligaciones', () => {
  it('soporta varios regímenes (uno con fecha_fin)', () => {
    const input = {
      tipo_persona: 'moral',
      rfc: 'ABC010101AB1',
      curp: null,
      nombre: null,
      apellido_paterno: null,
      apellido_materno: null,
      razon_social: 'EJEMPLO SA DE CV',
      nombre_comercial: null,
      regimen_fiscal_codigo: '601',
      regimen_fiscal_nombre: 'General de Ley Personas Morales',
      regimenes_adicionales: [
        {
          codigo: '601',
          nombre: 'General de Ley Personas Morales',
          fecha_inicio: '2020-01-01',
          fecha_fin: null,
        },
        {
          codigo: '624',
          nombre: 'Coordinados',
          fecha_inicio: '2020-01-01',
          fecha_fin: '2022-12-31',
        },
      ],
      domicilio_calle: null,
      domicilio_num_ext: null,
      domicilio_num_int: null,
      domicilio_colonia: null,
      domicilio_cp: null,
      domicilio_municipio: null,
      domicilio_estado: null,
      obligaciones: [
        {
          descripcion: 'DIOT (Declaración informativa de operaciones con terceros)',
          fecha_inicio: '2020-01-01',
          fecha_fin: null,
        },
        {
          descripcion: 'Declaración anual de ISR',
          fecha_inicio: '2020-01-01',
          fecha_fin: null,
        },
      ],
      fecha_inicio_operaciones: '2020-01-01',
      fecha_emision: null,
    };
    const parsed = CsfExtraccionSchema.parse(input);
    expect(parsed.regimenes_adicionales).toHaveLength(2);
    expect(parsed.regimenes_adicionales[1]?.fecha_fin).toBe('2022-12-31');
    expect(parsed.obligaciones).toHaveLength(2);
  });
});

describe('CsfExtraccionSchema — rechazos', () => {
  it('rechaza tipo_persona fuera del enum', () => {
    const input = {
      tipo_persona: 'fideicomiso',
      rfc: 'XYZ010101XY9',
      curp: null,
      nombre: null,
      apellido_paterno: null,
      apellido_materno: null,
      razon_social: 'X',
      nombre_comercial: null,
      regimen_fiscal_codigo: null,
      regimen_fiscal_nombre: null,
      regimenes_adicionales: [],
      domicilio_calle: null,
      domicilio_num_ext: null,
      domicilio_num_int: null,
      domicilio_colonia: null,
      domicilio_cp: null,
      domicilio_municipio: null,
      domicilio_estado: null,
      obligaciones: [],
      fecha_inicio_operaciones: null,
      fecha_emision: null,
    };
    expect(() => CsfExtraccionSchema.parse(input)).toThrow();
  });

  it('rechaza si falta el RFC (campo obligatorio)', () => {
    const input = {
      tipo_persona: 'moral',
      curp: null,
      nombre: null,
      apellido_paterno: null,
      apellido_materno: null,
      razon_social: 'EJEMPLO SA DE CV',
      nombre_comercial: null,
      regimen_fiscal_codigo: null,
      regimen_fiscal_nombre: null,
      regimenes_adicionales: [],
      domicilio_calle: null,
      domicilio_num_ext: null,
      domicilio_num_int: null,
      domicilio_colonia: null,
      domicilio_cp: null,
      domicilio_municipio: null,
      domicilio_estado: null,
      obligaciones: [],
      fecha_inicio_operaciones: null,
      fecha_emision: null,
    };
    expect(() => CsfExtraccionSchema.parse(input)).toThrow();
  });
});

describe('CsfExtraccionSchema — campos extendidos (consumidos por empresas)', () => {
  const baseInput = {
    tipo_persona: 'moral',
    rfc: 'ANO8509243H3',
    curp: null,
    nombre: null,
    apellido_paterno: null,
    apellido_materno: null,
    razon_social: 'AUTOS DEL NORTE',
    nombre_comercial: null,
    regimen_fiscal_codigo: '601',
    regimen_fiscal_nombre: 'General de Ley Personas Morales',
    regimenes_adicionales: [
      {
        codigo: '601',
        nombre: 'General de Ley Personas Morales',
        fecha_inicio: '1958-12-01',
        fecha_fin: null,
      },
    ],
    domicilio_calle: null,
    domicilio_num_ext: null,
    domicilio_num_int: null,
    domicilio_colonia: null,
    domicilio_cp: null,
    domicilio_municipio: null,
    domicilio_estado: null,
    obligaciones: [],
    fecha_inicio_operaciones: '1958-12-01',
    fecha_emision: '2026-04-01',
  };

  it('los campos extendidos son opcionales y default a null/[]', () => {
    const parsed = CsfExtraccionSchema.parse(baseInput);
    expect(parsed.id_cif).toBeNull();
    expect(parsed.estatus_sat).toBeNull();
    expect(parsed.regimen_capital).toBeNull();
    expect(parsed.actividades_economicas).toEqual([]);
  });

  it('parsea CSF de empresa moral con id_cif, estatus_sat, regimen_capital y actividades', () => {
    const input = {
      ...baseInput,
      id_cif: '14110980997',
      estatus_sat: 'ACTIVO',
      regimen_capital: 'SOCIEDAD ANONIMA DE CAPITAL VARIABLE',
      actividades_economicas: [
        {
          orden: 1,
          actividad: 'Comercio al por menor de automóviles y camionetas nuevos',
          porcentaje: '90%',
          fecha_inicio: '1999-04-09',
          fecha_fin: null,
        },
        {
          orden: 2,
          actividad: 'Reparación mecánica en general de automóviles y camiones',
          porcentaje: '2%',
          fecha_inicio: '2023-05-24',
          fecha_fin: null,
        },
      ],
    };
    const parsed = CsfExtraccionSchema.parse(input);
    expect(parsed.id_cif).toBe('14110980997');
    expect(parsed.estatus_sat).toBe('ACTIVO');
    expect(parsed.regimen_capital).toBe('SOCIEDAD ANONIMA DE CAPITAL VARIABLE');
    expect(parsed.actividades_economicas).toHaveLength(2);
    expect(parsed.actividades_economicas[0]?.orden).toBe(1);
    expect(parsed.actividades_economicas[0]?.porcentaje).toBe('90%');
  });

  it('rechaza una actividad económica sin "orden" (campo obligatorio)', () => {
    const input = {
      ...baseInput,
      actividades_economicas: [
        {
          actividad: 'Sin orden',
          porcentaje: '100%',
          fecha_inicio: null,
          fecha_fin: null,
        },
      ],
    };
    expect(() => CsfExtraccionSchema.parse(input)).toThrow();
  });
});

describe('ActividadEconomicaSchema standalone', () => {
  it('parsea actividad con todos los campos', () => {
    expect(
      ActividadEconomicaSchema.parse({
        orden: 1,
        actividad: 'Comercio al por menor',
        porcentaje: '90%',
        fecha_inicio: '2020-01-01',
        fecha_fin: null,
      })
    ).toMatchObject({ orden: 1, porcentaje: '90%' });
  });

  it('acepta porcentaje null cuando la CSF no lo muestra', () => {
    expect(
      ActividadEconomicaSchema.parse({
        orden: 1,
        actividad: 'X',
        porcentaje: null,
        fecha_inicio: null,
        fecha_fin: null,
      })
    ).toMatchObject({ porcentaje: null });
  });
});

describe('RegimenSchema y ObligacionSchema standalone', () => {
  it('RegimenSchema parsea con fechas o sin fechas', () => {
    expect(
      RegimenSchema.parse({
        codigo: '601',
        nombre: 'General de Ley Personas Morales',
        fecha_inicio: null,
        fecha_fin: null,
      })
    ).toMatchObject({ codigo: '601' });
  });

  it('ObligacionSchema parsea con descripción y fechas', () => {
    expect(
      ObligacionSchema.parse({
        descripcion: 'DIOT',
        fecha_inicio: '2020-01-01',
        fecha_fin: null,
      })
    ).toMatchObject({ descripcion: 'DIOT' });
  });
});

describe('CreateProveedorPayloadSchema', () => {
  const validExtraccion = {
    tipo_persona: 'moral',
    rfc: 'ABC010101AB1',
    curp: null,
    nombre: null,
    apellido_paterno: null,
    apellido_materno: null,
    razon_social: 'EJEMPLO SA DE CV',
    nombre_comercial: null,
    regimen_fiscal_codigo: '601',
    regimen_fiscal_nombre: 'General de Ley Personas Morales',
    regimenes_adicionales: [
      {
        codigo: '601',
        nombre: 'General de Ley Personas Morales',
        fecha_inicio: '2020-01-01',
        fecha_fin: null,
      },
    ],
    domicilio_calle: null,
    domicilio_num_ext: null,
    domicilio_num_int: null,
    domicilio_colonia: null,
    domicilio_cp: null,
    domicilio_municipio: null,
    domicilio_estado: null,
    obligaciones: [],
    fecha_inicio_operaciones: null,
    fecha_emision: null,
  };

  it('parsea payload completo con proveedor_extras', () => {
    const payload = {
      empresa_id: 'e52ac307-9373-4115-b65e-1178f0c4e1aa',
      extraccion: validExtraccion,
      proveedor_extras: {
        codigo: 'PROV-001',
        condiciones_pago: '30 días',
        limite_credito: 50000,
        categoria: 'Ferretería',
      },
    };
    expect(CreateProveedorPayloadSchema.parse(payload)).toMatchObject({
      empresa_id: 'e52ac307-9373-4115-b65e-1178f0c4e1aa',
      proveedor_extras: { codigo: 'PROV-001' },
    });
  });

  it('parsea payload sin proveedor_extras (opcional)', () => {
    const payload = {
      empresa_id: 'e52ac307-9373-4115-b65e-1178f0c4e1aa',
      extraccion: validExtraccion,
    };
    const parsed = CreateProveedorPayloadSchema.parse(payload);
    expect(parsed.proveedor_extras).toBeUndefined();
  });

  it('rechaza empresa_id que no es UUID', () => {
    const payload = {
      empresa_id: 'no-es-uuid',
      extraccion: validExtraccion,
    };
    expect(() => CreateProveedorPayloadSchema.parse(payload)).toThrow();
  });

  it('rechaza si extraccion es inválida (RFC faltante)', () => {
    const { rfc: _rfc, ...extraccionSinRfc } = validExtraccion;
    void _rfc;
    const payload = {
      empresa_id: 'e52ac307-9373-4115-b65e-1178f0c4e1aa',
      extraccion: extraccionSinRfc,
    };
    expect(() => CreateProveedorPayloadSchema.parse(payload)).toThrow();
  });

  it('rechaza si falta empresa_id', () => {
    const payload = { extraccion: validExtraccion };
    expect(() => CreateProveedorPayloadSchema.parse(payload)).toThrow();
  });
});

describe('UpdateCsfPayloadSchema', () => {
  const validExtraccion = {
    tipo_persona: 'moral',
    rfc: 'ABC010101AB1',
    curp: null,
    nombre: null,
    apellido_paterno: null,
    apellido_materno: null,
    razon_social: 'EJEMPLO SA DE CV (NUEVA)',
    nombre_comercial: null,
    regimen_fiscal_codigo: '601',
    regimen_fiscal_nombre: 'General de Ley Personas Morales',
    regimenes_adicionales: [
      {
        codigo: '601',
        nombre: 'General de Ley Personas Morales',
        fecha_inicio: '2020-01-01',
        fecha_fin: null,
      },
    ],
    domicilio_calle: 'Nueva Calle',
    domicilio_num_ext: '500',
    domicilio_num_int: null,
    domicilio_colonia: 'Centro',
    domicilio_cp: '06000',
    domicilio_municipio: 'Cuauhtémoc',
    domicilio_estado: 'CDMX',
    obligaciones: [],
    fecha_inicio_operaciones: '2020-01-01',
    fecha_emision: '2026-04-27',
  };

  it('parsea payload con accepted_fields no vacío (aplicación parcial)', () => {
    const payload = {
      empresa_id: 'e52ac307-9373-4115-b65e-1178f0c4e1aa',
      extraccion: validExtraccion,
      accepted_fields: ['razon_social', 'domicilio_calle', 'domicilio_num_ext'],
    };
    const parsed = UpdateCsfPayloadSchema.parse(payload);
    expect(parsed.accepted_fields).toHaveLength(3);
    expect(parsed.accepted_fields).toContain('razon_social');
  });

  it('parsea payload con accepted_fields vacío (solo archiva PDF)', () => {
    const payload = {
      empresa_id: 'e52ac307-9373-4115-b65e-1178f0c4e1aa',
      extraccion: validExtraccion,
      accepted_fields: [],
    };
    const parsed = UpdateCsfPayloadSchema.parse(payload);
    expect(parsed.accepted_fields).toHaveLength(0);
  });

  it('rechaza accepted_fields con un key no listado en CSF_UPDATABLE_FIELDS', () => {
    const payload = {
      empresa_id: 'e52ac307-9373-4115-b65e-1178f0c4e1aa',
      extraccion: validExtraccion,
      accepted_fields: ['razon_social', 'campo_inventado'],
    };
    expect(() => UpdateCsfPayloadSchema.parse(payload)).toThrow();
  });

  it('rechaza si falta accepted_fields', () => {
    const payload = {
      empresa_id: 'e52ac307-9373-4115-b65e-1178f0c4e1aa',
      extraccion: validExtraccion,
    };
    expect(() => UpdateCsfPayloadSchema.parse(payload)).toThrow();
  });

  it('rechaza empresa_id no UUID', () => {
    const payload = {
      empresa_id: 'no-uuid',
      extraccion: validExtraccion,
      accepted_fields: [],
    };
    expect(() => UpdateCsfPayloadSchema.parse(payload)).toThrow();
  });
});
