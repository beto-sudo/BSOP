import { describe, it, expect } from 'vitest';

import {
  ExtraccionSchema,
  ParteSchema,
  PredioSchema,
  SubtipoMetaEscrituraSchema,
  extraccionToDocumentoUpdates,
  type Extraccion,
} from './extraction-core';

/**
 * Tests del schema Zod del extractor de documentos legales.
 *
 * No prueban la llamada a Claude (eso vive como integration test fuera de
 * la suite unitaria) — solo el shape de los datos que entran/salen.
 *
 * Convención del schema (post-fix 21 unions, 2026-04-29):
 * - Top-level nullables: tipo_operacion, monto, fecha_emision, numero_documento.
 * - Sub-objetos nullables como BLOQUE: predio, subtipo_meta. Sus campos
 *   internos NO son nullable (la IA emite "" o 0 en ausencia).
 * - `extraccionToDocumentoUpdates()` normaliza "" → null y 0 → null antes
 *   de persistir, para mantener `null = ausente` en DB.
 */

const baseExtraccionPayload = {
  descripcion: 'Resumen del doc',
  contenido_texto: 'Texto completo del documento.',
  tipo_operacion: 'compraventa',
  monto: 1500000,
  moneda: 'MXN',
  predio: null,
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
        tipo_poder: '',
        alcance: '',
      },
    };
    const parsed = ExtraccionSchema.parse(input);
    expect(parsed.subtipo_meta?.numero_escritura).toBe('12345');
    expect(parsed.subtipo_meta?.fecha_escritura).toBe('2010-05-15');
    expect(parsed.subtipo_meta?.notario_nombre).toBe('JUAN PÉREZ');
    expect(parsed.subtipo_meta?.tipo_poder).toBe('');
  });

  it('parsea subtipo_meta de un poder con tipo_poder + alcance', () => {
    const input = {
      ...baseExtraccionPayload,
      tipo_operacion: 'poder',
      subtipo_meta: {
        numero_escritura: '6789',
        fecha_escritura: '2021-03-03',
        fecha_texto: '',
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

  it('rechaza si subtipo_meta omite un campo del shape', () => {
    const input = {
      ...baseExtraccionPayload,
      subtipo_meta: {
        // falta numero_escritura, fecha_escritura, fecha_texto, etc.
        notario_nombre: 'X',
      },
    };
    expect(() => ExtraccionSchema.parse(input)).toThrow();
  });

  it('rechaza si un campo interno de subtipo_meta es null (no nullable)', () => {
    const input = {
      ...baseExtraccionPayload,
      subtipo_meta: {
        numero_escritura: null,
        fecha_escritura: '',
        fecha_texto: '',
        notario_nombre: '',
        notaria_numero: '',
        distrito_notarial: '',
        tipo_poder: '',
        alcance: '',
      },
    };
    expect(() => ExtraccionSchema.parse(input)).toThrow();
  });
});

describe('SubtipoMetaEscrituraSchema standalone', () => {
  it('null es válido (doc no notarial)', () => {
    expect(SubtipoMetaEscrituraSchema.parse(null)).toBeNull();
  });

  it('todos los campos son string no-nullable (la IA usa "" para ausencia)', () => {
    const empty = {
      numero_escritura: '',
      fecha_escritura: '',
      fecha_texto: '',
      notario_nombre: '',
      notaria_numero: '',
      distrito_notarial: '',
      tipo_poder: '',
      alcance: '',
    };
    const parsed = SubtipoMetaEscrituraSchema.parse(empty);
    expect(parsed).toEqual(empty);
  });

  it('rechaza valores no-string en cualquier campo', () => {
    const input = {
      numero_escritura: 12345 as unknown as string,
      fecha_escritura: '',
      fecha_texto: '',
      notario_nombre: '',
      notaria_numero: '',
      distrito_notarial: '',
      tipo_poder: '',
      alcance: '',
    };
    expect(() => SubtipoMetaEscrituraSchema.parse(input)).toThrow();
  });
});

describe('PredioSchema standalone', () => {
  it('null es válido (doc no involucra predio)', () => {
    expect(PredioSchema.parse(null)).toBeNull();
  });

  it('parsea un predio completo', () => {
    const input = {
      ubicacion: 'Carretera 57 km 3',
      municipio: 'Piedras Negras',
      estado: 'Coahuila',
      folio_real: '123456',
      libro_tomo: 'Libro 12, Tomo 3',
      superficie_m2: 5000,
    };
    const parsed = PredioSchema.parse(input);
    expect(parsed?.superficie_m2).toBe(5000);
  });

  it('acepta strings vacíos y 0 como ausencia', () => {
    const input = {
      ubicacion: '',
      municipio: '',
      estado: '',
      folio_real: '',
      libro_tomo: '',
      superficie_m2: 0,
    };
    const parsed = PredioSchema.parse(input);
    expect(parsed?.superficie_m2).toBe(0);
    expect(parsed?.ubicacion).toBe('');
  });
});

describe('ParteSchema', () => {
  it('parsea una parte moral con representante', () => {
    const parsed = ParteSchema.parse({
      rol: 'vendedor',
      nombre: 'AUTOS DEL NORTE, SA DE CV',
      rfc: 'ANO850924XXX',
      representante: 'ADALBERTO SANTOS',
    });
    expect(parsed.representante).toBe('ADALBERTO SANTOS');
  });

  it('parsea una parte física sin RFC ("" en lugar de null)', () => {
    const parsed = ParteSchema.parse({
      rol: 'comprador',
      nombre: 'JUAN PÉREZ',
      rfc: '',
      representante: '',
    });
    expect(parsed.rfc).toBe('');
  });
});

describe('extraccionToDocumentoUpdates — normalización para persistir', () => {
  const baseExtraccion: Extraccion = {
    descripcion: 'doc',
    contenido_texto: 'texto',
    tipo_operacion: 'compraventa',
    monto: 100000,
    moneda: 'MXN',
    predio: null,
    partes: [],
    fecha_emision: '2024-03-15',
    numero_documento: '12345',
    subtipo_meta: null,
  };

  it('predio null se aplana a columnas null', () => {
    const out = extraccionToDocumentoUpdates({ ...baseExtraccion, predio: null });
    expect(out.superficie_m2).toBeNull();
    expect(out.ubicacion_predio).toBeNull();
    expect(out.municipio).toBeNull();
    expect(out.estado).toBeNull();
    expect(out.folio_real).toBeNull();
    expect(out.libro_tomo).toBeNull();
  });

  it('predio con campos vacíos normaliza "" → null y 0 → null', () => {
    const out = extraccionToDocumentoUpdates({
      ...baseExtraccion,
      predio: {
        ubicacion: '',
        municipio: 'Piedras Negras',
        estado: '',
        folio_real: '   ',
        libro_tomo: '',
        superficie_m2: 0,
      },
    });
    expect(out.superficie_m2).toBeNull();
    expect(out.ubicacion_predio).toBeNull();
    expect(out.municipio).toBe('Piedras Negras');
    expect(out.estado).toBeNull();
    expect(out.folio_real).toBeNull(); // whitespace-only también
    expect(out.libro_tomo).toBeNull();
  });

  it('predio con superficie > 0 se preserva', () => {
    const out = extraccionToDocumentoUpdates({
      ...baseExtraccion,
      predio: {
        ubicacion: 'Carretera 57',
        municipio: 'PN',
        estado: 'Coahuila',
        folio_real: '123',
        libro_tomo: '',
        superficie_m2: 5000,
      },
    });
    expect(out.superficie_m2).toBe(5000);
    expect(out.ubicacion_predio).toBe('Carretera 57');
    expect(out.libro_tomo).toBeNull();
  });

  it('subtipo_meta null se preserva como null', () => {
    const out = extraccionToDocumentoUpdates({ ...baseExtraccion, subtipo_meta: null });
    expect(out.subtipo_meta).toBeNull();
  });

  it('subtipo_meta normaliza campos "" → null preservando los poblados', () => {
    const out = extraccionToDocumentoUpdates({
      ...baseExtraccion,
      subtipo_meta: {
        numero_escritura: '12345',
        fecha_escritura: '2024-03-15',
        fecha_texto: '',
        notario_nombre: 'JUAN PÉREZ',
        notaria_numero: '5',
        distrito_notarial: '',
        tipo_poder: '',
        alcance: '',
      },
    });
    expect(out.subtipo_meta).not.toBeNull();
    expect(out.subtipo_meta?.numero_escritura).toBe('12345');
    expect(out.subtipo_meta?.fecha_texto).toBeNull();
    expect(out.subtipo_meta?.distrito_notarial).toBeNull();
    expect(out.subtipo_meta?.tipo_poder).toBeNull();
  });

  it('partes normaliza rfc/representante "" → null', () => {
    const out = extraccionToDocumentoUpdates({
      ...baseExtraccion,
      partes: [
        { rol: 'vendedor', nombre: 'X SA', rfc: 'XXX850101AAA', representante: 'Juan' },
        { rol: 'comprador', nombre: 'María', rfc: '', representante: '' },
      ],
    });
    expect(out.partes[0].rfc).toBe('XXX850101AAA');
    expect(out.partes[0].representante).toBe('Juan');
    expect(out.partes[1].rfc).toBeNull();
    expect(out.partes[1].representante).toBeNull();
  });

  it('top-level nullables se preservan', () => {
    const out = extraccionToDocumentoUpdates({
      ...baseExtraccion,
      tipo_operacion: null,
      monto: null,
      fecha_emision: null,
      numero_documento: null,
    });
    expect(out.tipo_operacion).toBeNull();
    expect(out.monto).toBeNull();
    expect(out.fecha_emision).toBeNull();
    expect(out.numero_documento).toBeNull();
  });
});
