import { describe, it, expect } from 'vitest';
import { resolveHelpSlug } from './help-routes';

describe('resolveHelpSlug', () => {
  it('deriva la ruta del doc desde el módulo RBAC de la pantalla', () => {
    // El slug del módulo (con puntos) ↔ la ruta del .md (con slashes).
    expect(resolveHelpSlug('/dilesa/ventas')).toBe('dilesa/ventas/lista');
    expect(resolveHelpSlug('/dilesa/ventas/inventario')).toBe('dilesa/ventas/inventario');
    expect(resolveHelpSlug('/rdb/ventas')).toBe('rdb/ventas');
  });

  it('devuelve null para rutas sin módulo mapeado', () => {
    expect(resolveHelpSlug('/inicio')).toBeNull();
    expect(resolveHelpSlug('/')).toBeNull();
    expect(resolveHelpSlug('/no/existe')).toBeNull();
  });
});
