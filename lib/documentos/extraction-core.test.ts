import { describe, it, expect } from 'vitest';

import { ExtraccionSchema, ParteSchema, SubtipoMetaEscrituraSchema } from './extraction-core';

/**
 * Tests del schema Zod del extractor de documentos legales.
 *
 * No prueban la llamada a Claude (eso vive como integration test fuera de
 * la suite unitaria) — solo el shape de los datos que entran/salen.
 *
 * Sprint 2 — empresa-documentos-legales agregó `subtipo_meta`. Estos
 * tests cubren el shape nuevo.
 */

const baseExtraccionPayload = {
  descripcion: 'Resumen del doc',
  contenido_texto: 'Texto completo del documento.',
  tipo_operacion: 'compraventa',
  monto: 1500000,
  moneda: 'MXN',
  superficie_m2: null,
  ubicacion_predio: null,
  municipio: 'Piedras Negras',
  estado: 'Coahuila',
  folio_real: null,
  libro_tomo: null,
  partes: [],
  fecha_emision: '2024-03-15',
  numero_documento: '12345',
};

describe('ExtraccionSchema — subtipo_meta opcional', () => {
  it('parsea con subtipo_meta = null para docs no notariales', () => {
    const input = { ...baseExtraccionPayload, subtipo_meta: null };
    const parsed = ExtraccionSchema.parse(input);
    expect(parsed.subtipo_meta).toBeNull();
  });

  it('parsea con subtipo_meta poblado para una escritura constitutiva', () => {
    const input = {
      ...baseExtraccionPayload,
      tipo_operacion: 'constitutiva',
      subtipo_meta: {
        numero_escritura: '12345',
        fecha_escritura: '2010-05-15',
        fecha_texto: 'quince de mayo del dos mil diez',
        notario_nombre: 'JUAN PÉREZ',
        notaria_numero: '5',
        distrito_notarial: 'PIEDRAS NEGRAS',
        tipo_poder: null,
        alcance: null,
      },
    };
    const parsed = ExtraccionSchema.parse(input);
    expect(parsed.subtipo_meta?.numero_escritura).toBe('12345');
    expect(parsed.subtipo_meta?.fecha_escritura).toBe('2010-05-15');
    expect(parsed.subtipo_meta?.notario_nombre).toBe('JUAN PÉREZ');
    expect(parsed.subtipo_meta?.tipo_poder).toBeNull();
  });

  it('parsea subtipo_meta de un poder con tipo_poder + alcance', () => {
    const input = {
      ...baseExtraccionPayload,
      tipo_operacion: 'poder',
      subtipo_meta: {
        numero_escritura: '6789',
        fecha_escritura: '2021-03-03',
        fecha_texto: null,
        notario_nombre: 'MARÍA LÓPEZ',
        notaria_numero: '12',
        distrito_notarial: 'COAHUILA',
        tipo_poder: 'general para actos de administracion',
        alcance: 'contratación laboral, IMSS, SAT, contratos comerciales generales',
      },
    };
    const parsed = ExtraccionSchema.parse(input);
    expect(parsed.subtipo_meta?.tipo_poder).toBe('general para actos de administracion');
    expect(parsed.subtipo_meta?.alcance).toContain('IMSS');
  });

  it('rechaza si subtipo_meta omite un campo del shape (debe ser explícito null)', () => {
    const input = {
      ...baseExtraccionPayload,
      subtipo_meta: {
        // falta numero_escritura, fecha_escritura, fecha_texto, etc.
        notario_nombre: 'X',
      },
    };
    expect(() => ExtraccionSchema.parse(input)).toThrow();
  });
});

describe('SubtipoMetaEscrituraSchema standalone', () => {
  it('null es válido (doc no notarial)', () => {
    expect(SubtipoMetaEscrituraSchema.parse(null)).toBeNull();
  });

  it('todos los campos pueden ser null individualmente', () => {
    const allNull = {
      numero_escritura: null,
      fecha_escritura: null,
      fecha_texto: null,
      notario_nombre: null,
      notaria_numero: null,
      distrito_notarial: null,
      tipo_poder: null,
      alcance: null,
    };
    const parsed = SubtipoMetaEscrituraSchema.parse(allNull);
    expect(parsed).toEqual(allNull);
  });

  it('todos los campos son string-or-null (no number, no boolean)', () => {
    const input = {
      numero_escritura: 12345 as unknown as string,
      fecha_escritura: null,
      fecha_texto: null,
      notario_nombre: null,
      notaria_numero: null,
      distrito_notarial: null,
      tipo_poder: null,
      alcance: null,
    };
    expect(() => SubtipoMetaEscrituraSchema.parse(input)).toThrow();
  });
});

describe('ParteSchema — sigue intacto tras Sprint 2', () => {
  it('parsea una parte moral con representante', () => {
    const parsed = ParteSchema.parse({
      rol: 'vendedor',
      nombre: 'AUTOS DEL NORTE, SA DE CV',
      rfc: 'ANO850924XXX',
      representante: 'ADALBERTO SANTOS',
    });
    expect(parsed.representante).toBe('ADALBERTO SANTOS');
  });

  it('parsea una parte física sin RFC', () => {
    const parsed = ParteSchema.parse({
      rol: 'comprador',
      nombre: 'JUAN PÉREZ',
      rfc: null,
      representante: null,
    });
    expect(parsed.rfc).toBeNull();
  });
});
