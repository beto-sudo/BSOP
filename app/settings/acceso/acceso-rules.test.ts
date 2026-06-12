import { describe, it, expect } from 'vitest';

import { validarRolParaEmpresa, accesosSinRol } from './acceso-rules';
import type { UsuarioEmpresa } from './actions';

/**
 * Reglas del alta de acceso usuario↔empresa (accesos-intuitivos S2). La
 * regla crítica: nunca otorgar acceso sin rol — `rol_id NULL` deja al
 * usuario viendo la empresa sin ningún módulo (caso Nelcy).
 */

const ROLES = [
  { id: 'rol-dilesa-ventas', empresa_id: 'emp-dilesa' },
  { id: 'rol-rdb-cajero', empresa_id: 'emp-rdb' },
];

describe('validarRolParaEmpresa', () => {
  it('rejects empty, null and undefined rol with the business explanation', () => {
    for (const rolId of ['', null, undefined] as const) {
      const err = validarRolParaEmpresa(rolId, 'emp-dilesa', ROLES);
      expect(err).toMatch(/sin ningún módulo/);
    }
  });

  it('rejects a rol id that does not exist', () => {
    expect(validarRolParaEmpresa('rol-fantasma', 'emp-dilesa', ROLES)).toBe(
      'El rol seleccionado no existe.'
    );
  });

  it('rejects a rol that belongs to another empresa', () => {
    expect(validarRolParaEmpresa('rol-rdb-cajero', 'emp-dilesa', ROLES)).toBe(
      'El rol seleccionado pertenece a otra empresa.'
    );
  });

  it('accepts a rol of the same empresa', () => {
    expect(validarRolParaEmpresa('rol-dilesa-ventas', 'emp-dilesa', ROLES)).toBeNull();
  });
});

describe('accesosSinRol', () => {
  it('returns only the accesses with rol_id NULL', () => {
    const accesos: UsuarioEmpresa[] = [
      { usuario_id: 'u-1', empresa_id: 'emp-dilesa', rol_id: 'rol-dilesa-ventas' },
      { usuario_id: 'u-1', empresa_id: 'emp-rdb', rol_id: null },
      { usuario_id: 'u-2', empresa_id: 'emp-dilesa', rol_id: null },
    ];
    expect(accesosSinRol(accesos)).toEqual([
      { usuario_id: 'u-1', empresa_id: 'emp-rdb', rol_id: null },
      { usuario_id: 'u-2', empresa_id: 'emp-dilesa', rol_id: null },
    ]);
  });

  it('returns empty for complete accesses', () => {
    expect(
      accesosSinRol([{ usuario_id: 'u-1', empresa_id: 'emp-dilesa', rol_id: 'rol-dilesa-ventas' }])
    ).toEqual([]);
  });
});
