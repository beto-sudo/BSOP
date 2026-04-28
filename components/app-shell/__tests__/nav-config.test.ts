import { describe, expect, it } from 'vitest';
import {
  NAV_ITEMS,
  flattenNavChildren,
  getActiveSection,
  getSectionLabelKey,
  hasNavSubItems,
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
      '/settings/empresas',
      '/settings/integraciones',
      '/settings/preferencias',
    ]);
  });

  it('flattens grouped sections preserving order', () => {
    const rdb = NAV_ITEMS.find((i) => i.href === '/rdb')!;
    const flat = flattenNavChildren(rdb);
    // First section first, last section last
    expect(flat[0].href).toBe('/rdb/admin/tasks');
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

describe('getSectionLabelKey', () => {
  it('returns the labelKey of the matching top-level item', () => {
    expect(getSectionLabelKey('/rdb/ventas')).toBe('Rincón del Bosque');
    expect(getSectionLabelKey('/dilesa/proyectos')).toBe('DILESA');
    expect(getSectionLabelKey('/settings/acceso')).toBe('nav.settings');
  });

  it('falls back to nav.overview when no match', () => {
    expect(getSectionLabelKey('/unknown/route')).toBe('nav.overview');
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
