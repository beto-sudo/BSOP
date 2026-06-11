import { describe, it, expect } from 'vitest';

import { nestModulosByHub, shortChildName } from './modulos-tree';
import type { Modulo } from './actions';

/**
 * Helpers puros de la matriz jerárquica de Roles y Permisos
 * (settings/acceso). La regla crítica: solo anidar bajo un padre que EXISTE
 * como módulo — los slugs planos de 3 segmentos (`dilesa.admin.tasks`) no
 * tienen jerarquía RBAC y deben quedar top-level.
 */

let counter = 0;
function mod(slug: string, nombre: string): Modulo {
  counter += 1;
  return {
    id: `m-${counter}`,
    slug,
    nombre,
    descripcion: null,
    empresa_id: 'e-1',
    seccion: 'operaciones',
  };
}

describe('nestModulosByHub', () => {
  it('nests sub-slugs under their hub parent preserving order', () => {
    const compras = mod('dilesa.compras', 'Compras');
    const ordenes = mod('dilesa.compras.ordenes', 'Compras · Órdenes');
    const requisiciones = mod('dilesa.compras.requisiciones', 'Compras · Requisiciones');
    const proveedores = mod('dilesa.proveedores', 'Proveedores');

    const nodes = nestModulosByHub([compras, ordenes, requisiciones, proveedores]);

    expect(nodes.map((n) => n.modulo.slug)).toEqual(['dilesa.compras', 'dilesa.proveedores']);
    expect(nodes[0].hijos.map((h) => h.slug)).toEqual([
      'dilesa.compras.ordenes',
      'dilesa.compras.requisiciones',
    ]);
    expect(nodes[1].hijos).toEqual([]);
  });

  it('keeps 3-segment flat slugs top-level when no parent module exists', () => {
    // `dilesa.admin` no es un módulo — tasks/juntas son hermanos planos, no tabs.
    const tasks = mod('dilesa.admin.tasks', 'Tareas');
    const juntas = mod('dilesa.admin.juntas', 'Juntas');

    const nodes = nestModulosByHub([tasks, juntas]);

    expect(nodes.map((n) => n.modulo.slug)).toEqual(['dilesa.admin.tasks', 'dilesa.admin.juntas']);
    expect(nodes.every((n) => n.hijos.length === 0)).toBe(true);
  });

  it('does not treat shared string prefixes without a dot as hierarchy', () => {
    const compras = mod('dilesa.compras', 'Compras');
    const comprasx = mod('dilesa.comprasx', 'Comprasx');

    const nodes = nestModulosByHub([compras, comprasx]);

    expect(nodes).toHaveLength(2);
    expect(nodes[0].hijos).toEqual([]);
  });

  it('never drops modules: top-levels plus nested children cover the input', () => {
    const input = [
      mod('dilesa.compras', 'Compras'),
      mod('dilesa.compras.ordenes', 'Compras · Órdenes'),
      mod('dilesa.admin.tasks', 'Tareas'),
      mod('dilesa.manual', 'Manual'),
    ];
    const nodes = nestModulosByHub(input);
    const total = nodes.length + nodes.reduce((sum, n) => sum + n.hijos.length, 0);
    expect(total).toBe(input.length);
  });
});

describe('shortChildName', () => {
  it('strips the "Padre · " prefix when the DB name follows the convention', () => {
    const padre = mod('dilesa.compras', 'Compras');
    const hijo = mod('dilesa.compras.ordenes', 'Compras · Órdenes');
    expect(shortChildName(hijo, padre)).toBe('Órdenes');
  });

  it('returns the full name when the convention does not match', () => {
    const padre = mod('dilesa.ventas', 'Ventas');
    const hijo = mod('dilesa.ventas.lista', 'Listado de ventas');
    expect(shortChildName(hijo, padre)).toBe('Listado de ventas');
  });
});
