import { describe, it, expect } from 'vitest';

import {
  validarRolParaEmpresa,
  accesosSinRol,
  expandirPermisosConRequisitos,
  resolverPermisosDePlantilla,
} from './acceso-rules';
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

describe('expandirPermisosConRequisitos', () => {
  it('adds the missing navigation requirement in read-only', () => {
    // `dilesa.ventas.autorizar` requiere `dilesa.ventas.lista` (MODULE_DEPS).
    const out = expandirPermisosConRequisitos([
      { slug: 'dilesa.ventas.autorizar', acceso_lectura: true, acceso_escritura: true },
    ]);
    expect(out).toContainEqual({
      slug: 'dilesa.ventas.lista',
      acceso_lectura: true,
      acceso_escritura: false,
    });
  });

  it('upgrades an existing write-only requirement to read without touching write', () => {
    const out = expandirPermisosConRequisitos([
      { slug: 'dilesa.ventas.autorizar', acceso_lectura: true, acceso_escritura: false },
      { slug: 'dilesa.ventas.lista', acceso_lectura: false, acceso_escritura: true },
    ]);
    expect(out).toContainEqual({
      slug: 'dilesa.ventas.lista',
      acceso_lectura: true,
      acceso_escritura: true,
    });
    expect(out).toHaveLength(2);
  });

  it('drops all-false items and never adds write implicitly', () => {
    const out = expandirPermisosConRequisitos([
      { slug: 'dilesa.ventas.fase03_formalizada', acceso_lectura: true, acceso_escritura: true },
      { slug: 'dilesa.manual', acceso_lectura: false, acceso_escritura: false },
    ]);
    expect(out.map((p) => p.slug).sort()).toEqual([
      'dilesa.ventas.fase03_formalizada',
      'dilesa.ventas.lista',
    ]);
    const lista = out.find((p) => p.slug === 'dilesa.ventas.lista');
    expect(lista?.acceso_escritura).toBe(false);
  });

  it('keeps an already-coherent set unchanged', () => {
    const coherente = [
      { slug: 'dilesa.ventas.lista', acceso_lectura: true, acceso_escritura: false },
      { slug: 'dilesa.ventas.fase01_solicitud', acceso_lectura: true, acceso_escritura: true },
    ];
    expect(expandirPermisosConRequisitos(coherente)).toEqual(coherente);
  });
});

describe('resolverPermisosDePlantilla', () => {
  const MODULOS = [
    { id: 'm-lista', slug: 'dilesa.ventas.lista' },
    { id: 'm-autorizar', slug: 'dilesa.ventas.autorizar' },
  ];

  it('round-trips ids through slugs adding the missing requirement', () => {
    const out = resolverPermisosDePlantilla(
      [{ modulo_id: 'm-autorizar', acceso_lectura: true, acceso_escritura: true }],
      MODULOS
    );
    expect(out).toContainEqual({
      modulo_id: 'm-autorizar',
      acceso_lectura: true,
      acceso_escritura: true,
    });
    expect(out).toContainEqual({
      modulo_id: 'm-lista',
      acceso_lectura: true,
      acceso_escritura: false,
    });
  });

  it('drops items whose módulo no longer exists instead of throwing', () => {
    const out = resolverPermisosDePlantilla(
      [
        { modulo_id: 'm-borrado', acceso_lectura: true, acceso_escritura: true },
        { modulo_id: 'm-lista', acceso_lectura: true, acceso_escritura: false },
      ],
      MODULOS
    );
    expect(out).toEqual([{ modulo_id: 'm-lista', acceso_lectura: true, acceso_escritura: false }]);
  });
});
