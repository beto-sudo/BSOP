import { describe, expect, it } from 'vitest';
import {
  NAV_ITEMS,
  filterHiddenNavItems,
  flattenNavChildren,
  getActiveEmpresaHref,
  getActiveSection,
  getSectionLabelKey,
  hasNavSubItems,
  isEmpresaNavItem,
  isItemActive,
  matchesPath,
  type NavItem,
} from '../nav-config';

describe('matchesPath', () => {
  it('matches root only when pathname is exactly "/"', () => {
    expect(matchesPath('/', '/')).toBe(true);
    expect(matchesPath('/rdb', '/')).toBe(false);
  });

  it('matches exact and sub-paths for non-root hrefs', () => {
    expect(matchesPath('/rdb', '/rdb')).toBe(true);
    expect(matchesPath('/rdb/ventas', '/rdb')).toBe(true);
    expect(matchesPath('/rdb-other', '/rdb')).toBe(false);
  });
});

describe('isItemActive', () => {
  it('uses href as the default match path', () => {
    const item = NAV_ITEMS.find((i) => i.href === '/rdb')!;
    expect(isItemActive('/rdb/ventas', item)).toBe(true);
    expect(isItemActive('/dilesa/proveedores', item)).toBe(false);
  });

  it('honors matchPaths overrides (SANREN matches /family and /health)', () => {
    const sanren = NAV_ITEMS.find((i) => i.labelKey === 'SANREN')!;
    expect(isItemActive('/health/labs', sanren)).toBe(true);
    expect(isItemActive('/family/members', sanren)).toBe(true);
    expect(isItemActive('/rdb', sanren)).toBe(false);
  });
});

describe('hasNavSubItems', () => {
  it('returns true for items with grouped sections (DILESA, RDB)', () => {
    expect(hasNavSubItems(NAV_ITEMS.find((i) => i.href === '/dilesa')!)).toBe(true);
    expect(hasNavSubItems(NAV_ITEMS.find((i) => i.href === '/rdb')!)).toBe(true);
  });

  it('returns true for items with flat children (Settings, SANREN)', () => {
    expect(hasNavSubItems(NAV_ITEMS.find((i) => i.href === '/settings')!)).toBe(true);
    expect(hasNavSubItems(NAV_ITEMS.find((i) => i.labelKey === 'SANREN')!)).toBe(true);
  });

  it('returns false for items with neither (overview, personas-fisicas)', () => {
    expect(hasNavSubItems(NAV_ITEMS.find((i) => i.href === '/')!)).toBe(false);
    expect(hasNavSubItems(NAV_ITEMS.find((i) => i.href === '/personas-fisicas')!)).toBe(false);
  });
});

describe('flattenNavChildren', () => {
  it('returns flat children unchanged', () => {
    const settings = NAV_ITEMS.find((i) => i.href === '/settings')!;
    const flat = flattenNavChildren(settings);
    expect(flat.map((c) => c.href)).toEqual([
      '/settings/acceso',
      '/settings/notificaciones',
      '/settings/ia',
      '/settings/empresas',
      '/settings/integraciones',
      '/settings/preferencias',
    ]);
  });

  it('flattens grouped sections preserving order', () => {
    const rdb = NAV_ITEMS.find((i) => i.href === '/rdb')!;
    const flat = flattenNavChildren(rdb);
    // First section first (Operativa → Home), last section last (Operaciones → Playtomic)
    expect(flat[0].href).toBe('/rdb/home');
    expect(flat.at(-1)?.href).toBe('/rdb/playtomic');
    // Includes a known item from a middle section
    expect(flat.some((c) => c.href === '/rdb/rh/personal')).toBe(true);
  });

  it('returns empty array when item has no sub-items', () => {
    const overview = NAV_ITEMS.find((i) => i.href === '/')!;
    expect(flattenNavChildren(overview)).toEqual([]);
  });
});

describe('getActiveSection', () => {
  it('returns the top-level href when path is in a section (RDB ventas)', () => {
    expect(getActiveSection('/rdb/ventas')).toBe('/rdb');
  });

  it('returns the top-level href when path is in a flat-children item (Settings)', () => {
    expect(getActiveSection('/settings/acceso')).toBe('/settings');
  });

  it('returns null when path matches a top-level item without sub-items (overview)', () => {
    expect(getActiveSection('/')).toBe(null);
  });
});

describe('isEmpresaNavItem', () => {
  it('is true for switchable empresas (DILESA, RDB, SANREN, Personas Físicas)', () => {
    expect(isEmpresaNavItem(NAV_ITEMS.find((i) => i.href === '/dilesa')!)).toBe(true);
    expect(isEmpresaNavItem(NAV_ITEMS.find((i) => i.href === '/rdb')!)).toBe(true);
    expect(isEmpresaNavItem(NAV_ITEMS.find((i) => i.labelKey === 'SANREN')!)).toBe(true);
    expect(isEmpresaNavItem(NAV_ITEMS.find((i) => i.href === '/personas-fisicas')!)).toBe(true);
  });

  it('is false for Inicio (no empresa mapping) and Configuración (system bucket)', () => {
    expect(isEmpresaNavItem(NAV_ITEMS.find((i) => i.href === '/')!)).toBe(false);
    expect(isEmpresaNavItem(NAV_ITEMS.find((i) => i.href === '/settings')!)).toBe(false);
  });
});

describe('getActiveEmpresaHref', () => {
  it('returns the empresa href for a route inside it', () => {
    expect(getActiveEmpresaHref('/dilesa/ventas')).toBe('/dilesa');
    expect(getActiveEmpresaHref('/rdb')).toBe('/rdb');
  });

  it('matches empresas without sub-items (Personas Físicas)', () => {
    expect(getActiveEmpresaHref('/personas-fisicas')).toBe('/personas-fisicas');
  });

  it('honors SANREN matchPaths (/health, /servicios, /peptides → /family)', () => {
    expect(getActiveEmpresaHref('/health/labs')).toBe('/family');
    expect(getActiveEmpresaHref('/servicios')).toBe('/family');
    expect(getActiveEmpresaHref('/peptides')).toBe('/family');
  });

  it('returns null on Inicio, Configuración, and unknown routes', () => {
    expect(getActiveEmpresaHref('/')).toBe(null);
    expect(getActiveEmpresaHref('/settings/acceso')).toBe(null);
    expect(getActiveEmpresaHref('/unknown/route')).toBe(null);
  });
});

describe('getSectionLabelKey', () => {
  it('returns the labelKey of the matching top-level item', () => {
    expect(getSectionLabelKey('/rdb/ventas')).toBe('Rincón del Bosque');
    expect(getSectionLabelKey('/dilesa/proveedores')).toBe('DILESA');
    expect(getSectionLabelKey('/settings/acceso')).toBe('nav.settings');
  });

  it('falls back to nav.overview when no match', () => {
    expect(getSectionLabelKey('/unknown/route')).toBe('nav.overview');
  });
});

describe('filterHiddenNavItems', () => {
  const slugOf = (items: NavItem[]) => items.map((i) => i.href);

  it('returns the same reference when nothing is hidden', () => {
    const out = filterHiddenNavItems(NAV_ITEMS, new Set());
    expect(out).toBe(NAV_ITEMS);
  });

  it('hides SANREN when its nav slug is in the denylist', () => {
    const out = filterHiddenNavItems(NAV_ITEMS, new Set(['sanren']));
    expect(slugOf(out)).not.toContain('/family');
    // Other empresas stay.
    expect(slugOf(out)).toContain('/dilesa');
    expect(slugOf(out)).toContain('/rdb');
  });

  it('hides Personas Físicas (a virtual item, not a real empresa)', () => {
    const out = filterHiddenNavItems(NAV_ITEMS, new Set(['personas_fisicas']));
    expect(slugOf(out)).not.toContain('/personas-fisicas');
  });

  it('hides multiple items at once and keeps the rest', () => {
    const out = filterHiddenNavItems(NAV_ITEMS, new Set(['sanren', 'personas_fisicas']));
    const hrefs = slugOf(out);
    expect(hrefs).not.toContain('/family');
    expect(hrefs).not.toContain('/personas-fisicas');
    expect(hrefs).toContain('/'); // Inicio (no slug) is never hidden
    expect(hrefs).toContain('/dilesa');
    expect(hrefs).toContain('/settings');
  });

  it('never hides items without a nav slug (e.g. Inicio)', () => {
    // Even a bogus slug set leaves slug-less items untouched.
    const out = filterHiddenNavItems(NAV_ITEMS, new Set(['nope', 'sanren']));
    expect(slugOf(out)).toContain('/');
  });
});

describe('NAV_ITEMS taxonomy invariants', () => {
  it('grouped items use sections (not flat children with dividers)', () => {
    const dilesa = NAV_ITEMS.find((i) => i.href === '/dilesa')!;
    const rdb = NAV_ITEMS.find((i) => i.href === '/rdb')!;
    expect(dilesa.sections).toBeDefined();
    expect(dilesa.children).toBeUndefined();
    expect(rdb.sections).toBeDefined();
    expect(rdb.children).toBeUndefined();
  });

  it('every section has at least one child (no empty sections at definition time)', () => {
    const itemsWithSections = NAV_ITEMS.filter(
      (i): i is NavItem & { sections: NonNullable<NavItem['sections']> } => Boolean(i.sections)
    );
    for (const item of itemsWithSections) {
      for (const section of item.sections) {
        expect(section.children.length).toBeGreaterThan(0);
      }
    }
  });

  it('children and sections are mutually exclusive on every item', () => {
    for (const item of NAV_ITEMS) {
      const hasBoth = Boolean(item.children?.length) && Boolean(item.sections?.length);
      expect(hasBoth).toBe(false);
    }
  });
});
