import { describe, expect, it } from 'vitest';

import { buildAdjuntoPath, slugifyFilename } from './path';

describe('slugifyFilename', () => {
  it('lowercases ASCII filenames', () => {
    expect(slugifyFilename('Contrato.pdf')).toBe('contrato.pdf');
  });

  it('strips diacritics', () => {
    expect(slugifyFilename('Acción Constitutiva.docx')).toBe('accion-constitutiva.docx');
  });

  it('replaces special chars with dashes', () => {
    expect(slugifyFilename('foo bar (copia 2).pdf')).toBe('foo-bar-copia-2.pdf');
  });

  it('collapses repeated dashes', () => {
    expect(slugifyFilename('foo----bar.pdf')).toBe('foo-bar.pdf');
  });

  it('trims leading/trailing dashes from the base', () => {
    expect(slugifyFilename('---foo---.pdf')).toBe('foo.pdf');
  });

  it('preserves extension while sluggifying base', () => {
    expect(slugifyFilename('Año 2026 — Reporte.PDF')).toBe('ano-2026-reporte.pdf');
  });

  it('falls back to "file" when base is empty after stripping', () => {
    expect(slugifyFilename('!!!.png')).toBe('file.png');
  });

  it('handles names without an extension', () => {
    expect(slugifyFilename('README')).toBe('readme');
  });
});

describe('buildAdjuntoPath', () => {
  it('builds the canonical 4-segment path with timestamp prefix', () => {
    const path = buildAdjuntoPath({
      empresa: 'dilesa',
      entidad: 'documentos',
      entidadId: 'abc-123',
      filename: 'contrato.pdf',
      timestamp: 1700000000000,
    });
    expect(path).toBe('dilesa/documentos/abc-123/1700000000000-contrato.pdf');
  });

  it('sluggifies the filename', () => {
    const path = buildAdjuntoPath({
      empresa: 'rdb',
      entidad: 'empleados',
      entidadId: 'xyz-789',
      filename: 'INE Frente.JPG',
      timestamp: 1700000000000,
    });
    expect(path).toBe('rdb/empleados/xyz-789/1700000000000-ine-frente.jpg');
  });

  it('uses Date.now() when timestamp is omitted', () => {
    const before = Date.now();
    const path = buildAdjuntoPath({
      empresa: 'rdb',
      entidad: 'vouchers',
      entidadId: 'cut-1',
      filename: 'voucher.png',
    });
    const after = Date.now();
    const match = path.match(/^rdb\/vouchers\/cut-1\/(\d+)-voucher\.png$/);
    expect(match).not.toBeNull();
    const ts = Number(match![1]);
    expect(ts).toBeGreaterThanOrEqual(before);
    expect(ts).toBeLessThanOrEqual(after);
  });
});
