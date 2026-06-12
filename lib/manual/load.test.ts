import { readdirSync } from 'node:fs';
import path from 'node:path';
import { describe, it, expect } from 'vitest';
import { loadManualDoc, listManualDocs } from './load';

/**
 * Descubre TODOS los `.md` servibles bajo content/manual como arrays de
 * segmentos. Espejo del contrato del walker real: ignora `_*` (plantilla) y
 * nombres fuera de `[a-z0-9_-]+` (p.ej. `README.md`, que es documentación del
 * patrón, no contenido del manual).
 */
const SERVIBLE_RE = /^[a-z0-9_-]+$/;

function allManualSlugs(): string[][] {
  const root = path.join(process.cwd(), 'content', 'manual');
  const out: string[][] = [];
  const walk = (dir: string, base: string[]) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) walk(path.join(dir, entry.name), [...base, entry.name]);
      else if (entry.name.endsWith('.md') && !entry.name.startsWith('_')) {
        const name = entry.name.replace(/\.md$/, '');
        if (SERVIBLE_RE.test(name)) out.push([...base, name]);
      }
    }
  };
  walk(root, []);
  return out;
}

/**
 * Tests de integración del loader del manual: leen los `.md` reales del repo.
 *
 * Guardan el bug que dejó el manual "vacío": `actualizado: 2026-06-07` sin
 * comillas lo parsea YAML como `Date`, no como string; el loader debe
 * normalizarlo. Sin esta cobertura, todo el manual renderiza "no hay ayuda"
 * sin que ningún check falle.
 */
describe('loadManualDoc', () => {
  it('TODOS los .md del manual cargan con frontmatter normalizado a string', async () => {
    const slugs = allManualSlugs();
    expect(slugs.length).toBeGreaterThan(0);
    for (const slug of slugs) {
      const doc = await loadManualDoc(slug);
      // Si esto falla, ese doc renderizaría "no hay ayuda" en producción.
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
