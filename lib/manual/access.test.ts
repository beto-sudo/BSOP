import { describe, it, expect } from 'vitest';
import type { UserPermissions } from '@/lib/permissions';
import type { ManualDoc } from './load';
import { listManualDocs } from './load';
import { canReadManualDoc, filterManualDocs, manualDocModulo } from './access';

function perms(modulos: Record<string, boolean>, isAdmin = false): UserPermissions {
  return {
    isAdmin,
    loading: false,
    email: 'test@dilesa.mx',
    empresas: new Map([['dilesa', { read: true, write: true }]]),
    modulos: new Map(Object.entries(modulos).map(([slug, read]) => [slug, { read, write: false }])),
  };
}

function doc(slug: string[], modulo?: string): ManualDoc {
  return {
    slug,
    frontmatter: { titulo: 'T', version: '1.0.0', actualizado: '2026-06-12', modulo },
    body: 'cuerpo',
  };
}

describe('canReadManualDoc', () => {
  it('admin global ve todo (política admin-nunca-bloqueado)', () => {
    expect(
      canReadManualDoc(perms({}, true), doc(['dilesa', 'saldos-bancos'], 'dilesa.saldos-bancos'))
    ).toBe(true);
  });

  it('sin permiso del módulo NO ve el doc (Tesorería/RH ocultos a Ventas)', () => {
    const ventas = perms({ 'dilesa.ventas.lista': true });
    expect(canReadManualDoc(ventas, doc(['dilesa', 'saldos-bancos'], 'dilesa.saldos-bancos'))).toBe(
      false
    );
    expect(
      canReadManualDoc(ventas, doc(['dilesa', 'rh', 'empleados'], 'dilesa.rh.empleados'))
    ).toBe(false);
    expect(
      canReadManualDoc(ventas, doc(['dilesa', 'ventas', 'lista'], 'dilesa.ventas.lista'))
    ).toBe(true);
  });

  it('doc de hub umbrella visible con acceso a CUALQUIER sub-slug (SS8)', () => {
    const soloUnTab = perms({ 'dilesa.ventas.fases': true });
    expect(
      canReadManualDoc(soloUnTab, doc(['dilesa', 'ventas', 'expediente'], 'dilesa.ventas'))
    ).toBe(true);
    const otroModulo = perms({ 'dilesa.cxp.facturas': true });
    expect(
      canReadManualDoc(otroModulo, doc(['dilesa', 'ventas', 'expediente'], 'dilesa.ventas'))
    ).toBe(false);
  });

  it('lectura=false equivale a sin acceso', () => {
    expect(
      canReadManualDoc(perms({ 'dilesa.ruv': false }), doc(['dilesa', 'ruv'], 'dilesa.ruv'))
    ).toBe(false);
  });

  it('fallback sin frontmatter.modulo: deriva del path del slug', () => {
    expect(manualDocModulo(doc(['dilesa', 'cobranza', 'aging']))).toBe('dilesa.cobranza.aging');
  });
});

describe('filterManualDocs sobre el contenido real', () => {
  it('todos los docs reales declaran modulo y el filtro particiona el catálogo', async () => {
    const real = await listManualDocs('dilesa');
    for (const d of real) {
      expect(d.frontmatter.modulo, d.slug.join('/')).toBeTruthy();
    }
    // Un rol solo-ventas ve los docs de ventas (incl. expediente vía umbrella)
    // y el del propio manual, nada de tesorería/RH/compras.
    const ventas = perms({
      'dilesa.ventas.lista': true,
      'dilesa.manual': true,
    });
    const visibles = filterManualDocs(ventas, real).map((d) => d.slug.join('/'));
    expect(visibles).toContain('dilesa/ventas/lista');
    expect(visibles).toContain('dilesa/ventas/expediente'); // umbrella vía sub-slug
    expect(visibles).toContain('dilesa/manual');
    expect(visibles).not.toContain('dilesa/saldos-bancos');
    expect(visibles.some((s) => s.startsWith('dilesa/rh/'))).toBe(false);
    expect(visibles.some((s) => s.startsWith('dilesa/cxp/'))).toBe(false);
    // Admin ve el catálogo completo.
    expect(filterManualDocs(perms({}, true), real).length).toBe(real.length);
  });
});
