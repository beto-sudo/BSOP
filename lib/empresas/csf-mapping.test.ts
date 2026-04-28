import { describe, it, expect } from 'vitest';

import type { CsfExtraccion } from '@/lib/proveedores/extract-csf';
import {
  buildEmpresaInsertFromExtraccion,
  buildEmpresaUpdateFromAccepted,
  EMPRESA_DIFFABLE_FIELDS,
  EMPRESA_FIELD_MAP,
} from './csf-mapping';

const extraccionAnsa: CsfExtraccion = {
  tipo_persona: 'moral',
  rfc: '  ano8509243h3  ',
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
  domicilio_calle: 'CALLE HIDALGO NORTE',
  domicilio_num_ext: '100',
  domicilio_num_int: null,
  domicilio_colonia: 'PIEDRAS NEGRAS CENTRO',
  domicilio_cp: '26000',
  domicilio_municipio: 'PIEDRAS NEGRAS',
  domicilio_estado: 'COAHUILA DE ZARAGOZA',
  obligaciones: [
    {
      descripcion: 'Pago provisional mensual de ISR personas morales régimen general',
      fecha_inicio: '2002-03-31',
      fecha_fin: null,
    },
  ],
  fecha_inicio_operaciones: '1958-12-01',
  fecha_emision: '2026-04-01',
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
      actividad: 'Reparación mecánica',
      porcentaje: '2%',
      fecha_inicio: '2023-05-24',
      fecha_fin: null,
    },
  ],
};

describe('buildEmpresaInsertFromExtraccion', () => {
  it('produce un row completo para alta de empresa moral', () => {
    const row = buildEmpresaInsertFromExtraccion({
      extraccion: extraccionAnsa,
      slug: 'ansa',
      nombre: 'ANSA',
    });
    expect(row.slug).toBe('ansa');
    expect(row.nombre).toBe('ANSA');
    expect(row.tipo_contribuyente).toBe('persona_moral');
    expect(row.rfc).toBe('ANO8509243H3'); // trim + uppercase
    expect(row.razon_social).toBe('AUTOS DEL NORTE');
    expect(row.regimen_fiscal).toBe('General de Ley Personas Morales');
    expect(row.regimen_capital).toBe('SOCIEDAD ANONIMA DE CAPITAL VARIABLE');
    expect(row.id_cif).toBe('14110980997');
    expect(row.estatus_sat).toBe('ACTIVO');
    expect(row.domicilio_numero_ext).toBe('100');
    expect(row.domicilio_numero_int).toBeNull();
    expect(row.csf_fecha_emision).toBe('2026-04-01');
  });

  it('mapea actividades económicas a shape de empresa (porcentaje string vacío si null)', () => {
    const row = buildEmpresaInsertFromExtraccion({
      extraccion: {
        ...extraccionAnsa,
        actividades_economicas: [
          {
            orden: 1,
            actividad: 'Sin porcentaje',
            porcentaje: null,
            fecha_inicio: null,
            fecha_fin: null,
          },
        ],
      },
      slug: 'x',
      nombre: 'X',
    });
    expect(row.actividades_economicas).toEqual([
      {
        orden: 1,
        actividad: 'Sin porcentaje',
        porcentaje: '',
        fecha_inicio: '',
        fecha_fin: null,
      },
    ]);
  });

  it('mapea obligaciones a shape de empresa (vencimiento queda en cadena vacía)', () => {
    const row = buildEmpresaInsertFromExtraccion({
      extraccion: extraccionAnsa,
      slug: 'ansa',
      nombre: 'ANSA',
    });
    expect(row.obligaciones_fiscales).toEqual([
      {
        descripcion: 'Pago provisional mensual de ISR personas morales régimen general',
        vencimiento: '',
        fecha_inicio: '2002-03-31',
        fecha_fin: null,
      },
    ]);
  });

  it('respeta override de tipo_contribuyente cuando se pasa explícito', () => {
    const row = buildEmpresaInsertFromExtraccion({
      extraccion: { ...extraccionAnsa, tipo_persona: 'fisica' },
      slug: 'pf',
      nombre: 'Persona Física',
      tipo_contribuyente: 'persona_moral',
    });
    expect(row.tipo_contribuyente).toBe('persona_moral');
  });

  it('default tipo_contribuyente desde tipo_persona del extractor', () => {
    const row = buildEmpresaInsertFromExtraccion({
      extraccion: { ...extraccionAnsa, tipo_persona: 'fisica', razon_social: null },
      slug: 'pf',
      nombre: 'Persona Física',
    });
    expect(row.tipo_contribuyente).toBe('persona_fisica');
  });
});

describe('buildEmpresaUpdateFromAccepted', () => {
  it('aplica solo los campos en accepted_fields', () => {
    const update = buildEmpresaUpdateFromAccepted({
      extraccion: extraccionAnsa,
      accepted: ['domicilio_calle', 'fecha_emision'],
    });
    expect(update).toEqual({
      domicilio_calle: 'CALLE HIDALGO NORTE',
      csf_fecha_emision: '2026-04-01',
    });
  });

  it('renombra num_ext / num_int en el update', () => {
    const update = buildEmpresaUpdateFromAccepted({
      extraccion: extraccionAnsa,
      accepted: ['domicilio_num_ext', 'domicilio_num_int'],
    });
    expect(Object.keys(update)).toEqual(['domicilio_numero_ext', 'domicilio_numero_int']);
  });

  it('aplica id_cif y estatus_sat (extras de empresa)', () => {
    const update = buildEmpresaUpdateFromAccepted({
      extraccion: extraccionAnsa,
      accepted: ['id_cif', 'estatus_sat', 'regimen_capital'],
    });
    expect(update.id_cif).toBe('14110980997');
    expect(update.estatus_sat).toBe('ACTIVO');
    expect(update.regimen_capital).toBe('SOCIEDAD ANONIMA DE CAPITAL VARIABLE');
  });

  it('aplica actividades_economicas como array transformado', () => {
    const update = buildEmpresaUpdateFromAccepted({
      extraccion: extraccionAnsa,
      accepted: ['actividades_economicas'],
    });
    expect(update.actividades_economicas).toHaveLength(2);
    expect(update.actividades_economicas?.[0]).toMatchObject({
      orden: 1,
      porcentaje: '90%',
    });
  });

  it('ignora campos de personas físicas (nombre/apellido_*) sin romper', () => {
    const update = buildEmpresaUpdateFromAccepted({
      extraccion: extraccionAnsa,
      accepted: ['nombre', 'apellido_paterno', 'apellido_materno', 'tipo_persona', 'razon_social'],
    });
    expect(update).toEqual({ razon_social: 'AUTOS DEL NORTE' });
  });

  it('normaliza RFC a uppercase + trim al actualizar', () => {
    const update = buildEmpresaUpdateFromAccepted({
      extraccion: extraccionAnsa,
      accepted: ['rfc'],
    });
    expect(update.rfc).toBe('ANO8509243H3');
  });

  it('regresa objeto vacío si no se aceptó nada', () => {
    const update = buildEmpresaUpdateFromAccepted({
      extraccion: extraccionAnsa,
      accepted: [],
    });
    expect(update).toEqual({});
  });
});

describe('EMPRESA_DIFFABLE_FIELDS', () => {
  it('incluye los 4 campos extra de empresa', () => {
    expect(EMPRESA_DIFFABLE_FIELDS).toContain('id_cif');
    expect(EMPRESA_DIFFABLE_FIELDS).toContain('estatus_sat');
    expect(EMPRESA_DIFFABLE_FIELDS).toContain('regimen_capital');
    expect(EMPRESA_DIFFABLE_FIELDS).toContain('actividades_economicas');
  });

  it('no incluye campos de personas físicas (no aplican a empresa)', () => {
    expect(EMPRESA_DIFFABLE_FIELDS).not.toContain('nombre');
    expect(EMPRESA_DIFFABLE_FIELDS).not.toContain('apellido_paterno');
    expect(EMPRESA_DIFFABLE_FIELDS).not.toContain('tipo_persona');
  });

  it('todos los keys mapeables del extractor que sí aplican aparecen', () => {
    const mapeables = (Object.entries(EMPRESA_FIELD_MAP) as [string, { column: string | null }][])
      .filter(([, v]) => v.column !== null)
      .map(([k]) => k);
    for (const k of mapeables) {
      expect(EMPRESA_DIFFABLE_FIELDS).toContain(k);
    }
  });
});
