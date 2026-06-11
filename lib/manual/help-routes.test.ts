import { describe, it, expect } from 'vitest';
import { normalizeHelpPathname, resolveHelpSlug } from './help-routes';

const UUID = '3f2a8c1e-5b4d-4e6f-9a0b-7c8d9e0f1a2b';

describe('normalizeHelpPathname', () => {
  it('reemplaza segmentos UUID/numéricos por [id]', () => {
    expect(normalizeHelpPathname(`/dilesa/ventas/${UUID}`)).toBe('/dilesa/ventas/[id]');
    expect(normalizeHelpPathname('/dilesa/proyectos/42/gasto')).toBe(
      '/dilesa/proyectos/[id]/gasto'
    );
  });

  it('NO toca segmentos legítimos que empiezan con número (4-solicitud-avaluo)', () => {
    expect(normalizeHelpPathname(`/dilesa/ventas/${UUID}/capturar/4-solicitud-avaluo`)).toBe(
      '/dilesa/ventas/[id]/capturar/4-solicitud-avaluo'
    );
  });
});

describe('resolveHelpSlug', () => {
  it('deriva la ruta del doc desde el módulo RBAC de la pantalla', () => {
    // El slug del módulo (con puntos) ↔ la ruta del .md (con slashes).
    expect(resolveHelpSlug('/dilesa/ventas')).toBe('dilesa/ventas/lista');
    expect(resolveHelpSlug('/dilesa/ventas/inventario')).toBe('dilesa/ventas/inventario');
    expect(resolveHelpSlug('/rdb/ventas')).toBe('rdb/ventas');
  });

  it('resuelve el Expediente de Operación (detalle de venta) a su doc propio', () => {
    expect(resolveHelpSlug(`/dilesa/ventas/${UUID}`)).toBe('dilesa/ventas/expediente');
  });

  it('resuelve las pantallas de captura por fase a su doc faseNN_*', () => {
    expect(resolveHelpSlug(`/dilesa/ventas/${UUID}/capturar/2-asignada`)).toBe(
      'dilesa/ventas/fase02_asignada'
    );
    expect(resolveHelpSlug(`/dilesa/ventas/${UUID}/capturar/10-firmas-programadas`)).toBe(
      'dilesa/ventas/fase10_firmas_programadas'
    );
    expect(resolveHelpSlug(`/dilesa/ventas/${UUID}/capturar/17-operacion-terminada`)).toBe(
      'dilesa/ventas/fase17_operacion_terminada'
    );
    // La F1 vive en /nueva (estática) y resuelve por módulo RBAC.
    expect(resolveHelpSlug('/dilesa/ventas/nueva')).toBe('dilesa/ventas/fase01_solicitud');
  });

  it('detalles dinámicos sin doc propio caen al doc del hub padre', () => {
    expect(resolveHelpSlug(`/dilesa/ventas/clientes/${UUID}`)).toBe('dilesa/ventas/clientes');
    expect(resolveHelpSlug(`/dilesa/ventas/vendedores/${UUID}`)).toBe('dilesa/ventas/vendedores');
    expect(resolveHelpSlug(`/dilesa/proyectos/${UUID}`)).toBe('dilesa/proyectos/activos');
    expect(resolveHelpSlug(`/dilesa/construccion/${UUID}`)).toBe('dilesa/construccion/obras');
    expect(resolveHelpSlug(`/dilesa/ruv/${UUID}`)).toBe('dilesa/ruv');
  });

  it('devuelve null para rutas sin módulo mapeado ni ancestro', () => {
    expect(resolveHelpSlug('/inicio')).toBeNull();
    expect(resolveHelpSlug('/')).toBeNull();
    expect(resolveHelpSlug('/no/existe')).toBeNull();
  });
});
