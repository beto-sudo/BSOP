import { describe, it, expect } from 'vitest';
import { loadManualDoc, listManualDocs } from './load';

/**
 * Tests de integración del loader del manual: leen los `.md` reales del repo.
 *
 * Guardan el bug que dejó el manual "vacío": `actualizado: 2026-06-07` sin
 * comillas lo parsea YAML como `Date`, no como string; el loader debe
 * normalizarlo. Sin esta cobertura, todo el manual renderiza "no hay ayuda"
 * sin que ningún check falle.
 */
describe('loadManualDoc', () => {
  it('carga los docs publicados de DILESA con frontmatter normalizado a string', async () => {
    const slugs = [
      ['dilesa', 'ventas', 'lista'],
      ['dilesa', 'proyectos', 'activos'],
      ['dilesa', 'construccion', 'obras'],
      ['dilesa', 'cxp', 'facturas'],
    ];
    for (const slug of slugs) {
      const doc = await loadManualDoc(slug);
      expect(doc, slug.join('/')).not.toBeNull();
      expect(typeof doc!.frontmatter.titulo).toBe('string');
      expect(typeof doc!.frontmatter.version).toBe('string');
      // YAML parsea la fecha sin comillas como Date — debe quedar 'YYYY-MM-DD'.
      expect(doc!.frontmatter.actualizado).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(doc!.body.length).toBeGreaterThan(0);
    }
  });

  it('rechaza path traversal y slugs inválidos', async () => {
    expect(await loadManualDoc(['..', 'etc'])).toBeNull();
    expect(await loadManualDoc([])).toBeNull();
    expect(await loadManualDoc(['no', 'existe'])).toBeNull();
  });

  it('listManualDocs solo devuelve docs con frontmatter válido', async () => {
    const docs = await listManualDocs('dilesa');
    expect(docs.length).toBeGreaterThan(0);
    for (const doc of docs) {
      expect(typeof doc.frontmatter.titulo).toBe('string');
      expect(typeof doc.frontmatter.version).toBe('string');
      expect(typeof doc.frontmatter.actualizado).toBe('string');
    }
  });
});
