import { describe, it, expect } from 'vitest';
import type { ManualDoc } from './load';
import { listManualDocs } from './load';
import { normalizeSearchText, stripMarkdown, searchManualDocs } from './search';

function doc(slug: string[], titulo: string, body: string): ManualDoc {
  return {
    slug,
    frontmatter: { titulo, version: '1.0.0', actualizado: '2026-06-11' },
    body,
  };
}

describe('normalizeSearchText', () => {
  it('quita acentos y baja a minúsculas', () => {
    expect(normalizeSearchText('Avalúo CERRADO')).toBe('avaluo cerrado');
    expect(normalizeSearchText('Señalización')).toBe('senalizacion');
  });
});

describe('stripMarkdown', () => {
  it('convierte headings, listas, links y tablas a texto plano', () => {
    const md = [
      '## ¿Qué es?',
      '',
      '- **Comprador** — quien compra. Ver [Fases](/dilesa/ventas/fases).',
      '',
      '| Campo | Uso |',
      '| --- | --- |',
      '| Precio | El valor `escriturado` |',
    ].join('\n');
    const plain = stripMarkdown(md);
    expect(plain).toContain('¿Qué es?');
    expect(plain).toContain('Comprador — quien compra. Ver Fases.');
    expect(plain).toContain('Precio El valor escriturado');
    expect(plain).not.toMatch(/[#|*`[\]]/);
  });
});

describe('searchManualDocs', () => {
  const docs = [
    doc(['dilesa', 'ventas', 'lista'], 'Ventas — Lista', 'El listado de ventas con su fase.'),
    doc(
      ['dilesa', 'ventas', 'fase05_avaluo_cerrado'],
      'Fase 5 — Avalúo cerrado',
      'Captura el resultado del avalúo: valor y fecha. El avalúo de ventas lo emite el valuador.'
    ),
    doc(['dilesa', 'rh', 'empleados'], 'RH — Personal', 'Altas y bajas de empleados.'),
  ];

  it('matchea sin acentos y arma snippet con contexto', () => {
    const results = searchManualDocs(docs, 'avaluo');
    expect(results.length).toBe(1);
    const r = results[0];
    expect(r.slug).toBe('dilesa/ventas/fase05_avaluo_cerrado');
    expect(r.grupoLabel).toBe('Ventas');
    expect(r.snippet).not.toBeNull();
    // El snippet sale del texto ORIGINAL (con acento), no del normalizado.
    expect(r.snippet!.match).toBe('avalúo');
    expect(r.snippet!.before + r.snippet!.match + r.snippet!.after).toContain(
      'resultado del avalúo'
    );
  });

  it('multi-palabra es AND: todas deben aparecer', () => {
    expect(searchManualDocs(docs, 'avaluo valuador').length).toBe(1);
    expect(searchManualDocs(docs, 'avaluo empleados').length).toBe(0);
  });

  it('match en título pesa más que en contenido', () => {
    const results = searchManualDocs(docs, 'ventas');
    expect(results.length).toBe(2);
    expect(results[0].slug).toBe('dilesa/ventas/lista'); // 'Ventas' en el título
  });

  it('query vacío o solo espacios devuelve []', () => {
    expect(searchManualDocs(docs, '')).toEqual([]);
    expect(searchManualDocs(docs, '   ')).toEqual([]);
  });

  it('match solo en título → snippet null', () => {
    const only = [doc(['dilesa', 'ruv'], 'RUV', 'Control de frentes y CUVs.')];
    const results = searchManualDocs(only, 'ruv');
    expect(results.length).toBe(1);
    expect(results[0].snippet).toBeNull();
  });

  it('smoke sobre el contenido real: términos operativos encuentran su doc', async () => {
    const real = await listManualDocs('dilesa');
    expect(searchManualDocs(real, 'avalúo').length).toBeGreaterThan(0);
    expect(searchManualDocs(real, 'estimacion').length).toBeGreaterThan(0);
    const expediente = searchManualDocs(real, 'expediente');
    expect(expediente.some((r) => r.slug === 'dilesa/ventas/expediente')).toBe(true);
  });
});
