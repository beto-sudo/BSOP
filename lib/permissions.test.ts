import { describe, it, expect, vi } from 'vitest';

import {
  ADMIN_ONLY_ROUTES,
  ROUTE_TO_EMPRESA,
  ROUTE_TO_MODULE,
  canAccessEmpresa,
  canAccessModulo,
  fetchPermissionsForUserId,
  fetchUserPermissions,
  isAdminOnly,
  type UserPermissions,
} from './permissions';

/**
 * RBAC unit tests for lib/permissions.ts.
 *
 * BSOP gates every page and every mutation through these helpers, so the
 * pure-logic branches (admin bypass, empresa membership, module read/write,
 * exception overrides, admin-only route matching) are the primary target.
 * Supabase-coupled fetchers are covered with a hand-rolled mock client that
 * captures the typical query-chain shape (schema → from → select → eq …).
 */

// ── Pure helpers ──────────────────────────────────────────────────────────

function makePerms(partial: Partial<UserPermissions> = {}): UserPermissions {
  return {
    isAdmin: false,
    loading: false,
    email: null,
    empresas: new Map(),
    modulos: new Map(),
    ...partial,
  };
}

describe('canAccessEmpresa', () => {
  it('returns true for admin regardless of empresas map', () => {
    const perms = makePerms({ isAdmin: true });
    expect(canAccessEmpresa(perms, 'rdb')).toBe(true);
    expect(canAccessEmpresa(perms, 'does-not-exist')).toBe(true);
  });

  it('returns true when the user has the empresa slug', () => {
    const perms = makePerms({
      empresas: new Map([['rdb', { read: true, write: true }]]),
    });
    expect(canAccessEmpresa(perms, 'rdb')).toBe(true);
  });

  it('returns false when the empresa slug is missing', () => {
    const perms = makePerms({
      empresas: new Map([['rdb', { read: true, write: true }]]),
    });
    expect(canAccessEmpresa(perms, 'coda')).toBe(false);
  });

  it('returns false for an empty empresas map on a non-admin', () => {
    expect(canAccessEmpresa(makePerms(), 'rdb')).toBe(false);
  });

  it('returns false for an empty-string slug on a non-admin', () => {
    expect(canAccessEmpresa(makePerms(), '')).toBe(false);
  });
});

describe('canAccessModulo', () => {
  it('returns true for admin regardless of mode or module', () => {
    const perms = makePerms({ isAdmin: true });
    expect(canAccessModulo(perms, 'rdb.ventas')).toBe(true);
    expect(canAccessModulo(perms, 'rdb.ventas', 'write')).toBe(true);
    expect(canAccessModulo(perms, 'anything.at.all', 'write')).toBe(true);
  });

  it('defaults mode to "read" when not provided', () => {
    const perms = makePerms({
      modulos: new Map([['rdb.ventas', { read: true, write: false }]]),
    });
    expect(canAccessModulo(perms, 'rdb.ventas')).toBe(true);
  });

  it('returns false for unknown module', () => {
    expect(canAccessModulo(makePerms(), 'nope.nothing')).toBe(false);
    expect(canAccessModulo(makePerms(), 'nope.nothing', 'write')).toBe(false);
  });

  it('respects the read flag in read mode', () => {
    const perms = makePerms({
      modulos: new Map([['rdb.ventas', { read: false, write: true }]]),
    });
    expect(canAccessModulo(perms, 'rdb.ventas', 'read')).toBe(false);
  });

  it('respects the write flag in write mode', () => {
    const readOnly = makePerms({
      modulos: new Map([['rdb.ventas', { read: true, write: false }]]),
    });
    expect(canAccessModulo(readOnly, 'rdb.ventas', 'write')).toBe(false);

    const readWrite = makePerms({
      modulos: new Map([['rdb.ventas', { read: true, write: true }]]),
    });
    expect(canAccessModulo(readWrite, 'rdb.ventas', 'write')).toBe(true);
  });

  it('treats a module with both flags false as no access', () => {
    const perms = makePerms({
      modulos: new Map([['rdb.ventas', { read: false, write: false }]]),
    });
    expect(canAccessModulo(perms, 'rdb.ventas', 'read')).toBe(false);
    expect(canAccessModulo(perms, 'rdb.ventas', 'write')).toBe(false);
  });
});

describe('isAdminOnly', () => {
  it('matches an exact admin-only route', () => {
    for (const route of ADMIN_ONLY_ROUTES) {
      expect(isAdminOnly(route)).toBe(true);
    }
  });

  it('matches a child of an admin-only route', () => {
    expect(isAdminOnly('/agents/foo')).toBe(true);
    expect(isAdminOnly('/usage/2026')).toBe(true);
    expect(isAdminOnly('/rnd/experiments/42')).toBe(true);
  });

  it('returns false for non-admin routes', () => {
    expect(isAdminOnly('/')).toBe(false);
    expect(isAdminOnly('/rdb')).toBe(false);
    expect(isAdminOnly('/rdb/ventas')).toBe(false);
    expect(isAdminOnly('/settings/acceso')).toBe(false);
  });

  it('does not match a prefix that only shares the first characters', () => {
    // `/agents-admin` starts with `/agents` but isn't under the route.
    expect(isAdminOnly('/agents-admin')).toBe(false);
    expect(isAdminOnly('/usagelogs')).toBe(false);
  });

  it('treats empty string as not admin-only', () => {
    expect(isAdminOnly('')).toBe(false);
  });
});

describe('route maps', () => {
  it('maps DILESA, RDB, and settings pages to module slugs', () => {
    expect(ROUTE_TO_MODULE['/rdb/ventas']).toBe('rdb.ventas');
    expect(ROUTE_TO_MODULE['/rdb/admin/juntas']).toBe('rdb.admin.juntas');
    expect(ROUTE_TO_MODULE['/dilesa/rh/empleados']).toBe('dilesa.rh.empleados');
    expect(ROUTE_TO_MODULE['/settings/acceso']).toBe('settings.acceso');
  });

  it('maps nav hrefs to empresa slugs (family/travel/health all → familia)', () => {
    expect(ROUTE_TO_EMPRESA['/rdb']).toBe('rdb');
    expect(ROUTE_TO_EMPRESA['/family']).toBe('familia');
    expect(ROUTE_TO_EMPRESA['/travel']).toBe('familia');
    expect(ROUTE_TO_EMPRESA['/health']).toBe('familia');
  });
});

// ── Supabase-coupled fetchers ─────────────────────────────────────────────

/**
 * Build a minimal chainable mock that reproduces the shape used in
 * permissions.ts: `supabase.schema(s).from(t).select(...).eq(...).eq(...)`
 * and optional `.maybeSingle()`.
 *
 * Each script entry targets a `schema.table` pair and returns whatever
 * `data` the test wants. `.eq()` always returns the same scriptable thenable;
 * `.maybeSingle()` resolves the single-row variant.
 */
type ScriptEntry = {
  data?: unknown;
  single?: unknown;
};
type Script = Record<string, ScriptEntry>;

function makeSupabaseMock(
  script: Script,
  getUserResult: { data: { user: { email: string } | null } } = {
    data: { user: null },
  },
) {
  const build = (schemaName: string) => ({
    from(tableName: string) {
      const key = `${schemaName}.${tableName}`;
      const entry = script[key] ?? {};
      const result = { data: entry.data ?? [], error: null };
      const singleResult = { data: entry.single ?? null, error: null };
      const chain: {
        select: (..._args: unknown[]) => typeof chain;
        eq: (..._args: unknown[]) => typeof chain;
        maybeSingle: () => Promise<typeof singleResult>;
        then: Promise<typeof result>['then'];
      } = {
        select: () => chain,
        eq: () => chain,
        maybeSingle: () => Promise.resolve(singleResult),
        // Make the chain awaitable directly (for queries without maybeSingle).
        then: (onFulfilled, onRejected) =>
          Promise.resolve(result).then(onFulfilled, onRejected),
      };
      return chain;
    },
  });

  return {
    auth: {
      getUser: vi.fn().mockResolvedValue(getUserResult),
    },
    schema: (s: string) => build(s),
  };
}

describe('fetchPermissionsForUserId', () => {
  it('returns the empty shape when the user row is missing', async () => {
    const supabase = makeSupabaseMock({
      'core.usuarios': { single: null },
    });
    const perms = await fetchPermissionsForUserId(
      supabase as unknown as Parameters<typeof fetchPermissionsForUserId>[0],
      'u-missing',
    );
    expect(perms).toEqual({
      isAdmin: false,
      loading: false,
      email: null,
      empresas: new Map(),
      modulos: new Map(),
    });
  });

  it('returns empty when the user row is marked inactive', async () => {
    const supabase = makeSupabaseMock({
      'core.usuarios': {
        single: {
          id: 'u1',
          email: 'x@y.com',
          rol: 'user',
          activo: false,
        },
      },
    });
    const perms = await fetchPermissionsForUserId(
      supabase as unknown as Parameters<typeof fetchPermissionsForUserId>[0],
      'u1',
    );
    expect(perms.email).toBe(null); // by-id fetcher returns the generic empty
    expect(perms.isAdmin).toBe(false);
  });

  it('short-circuits to isAdmin=true for the admin role', async () => {
    const supabase = makeSupabaseMock({
      'core.usuarios': {
        single: {
          id: 'u-admin',
          email: 'boss@bsop.test',
          rol: 'admin',
          activo: true,
        },
      },
    });
    const perms = await fetchPermissionsForUserId(
      supabase as unknown as Parameters<typeof fetchPermissionsForUserId>[0],
      'u-admin',
    );
    expect(perms.isAdmin).toBe(true);
    expect(perms.email).toBe('boss@bsop.test');
    expect(perms.empresas.size).toBe(0);
    expect(perms.modulos.size).toBe(0);
  });

  it('assembles empresas and module access from role permissions', async () => {
    const supabase = makeSupabaseMock({
      'core.usuarios': {
        single: {
          id: 'u1',
          email: 'alice@bsop.test',
          rol: 'user',
          activo: true,
        },
      },
      'core.usuarios_empresas': {
        data: [
          { empresa_id: 'e-rdb', rol_id: 'r-sales', activo: true },
          { empresa_id: 'e-coda', rol_id: null, activo: true },
        ],
      },
      'core.modulos': {
        data: [
          { id: 'm-ventas', slug: 'rdb.ventas' },
          { id: 'm-productos', slug: 'rdb.productos' },
          { id: 'm-orphan', slug: 'unused' },
        ],
      },
      'core.permisos_rol': {
        data: [
          {
            rol_id: 'r-sales',
            modulo_id: 'm-ventas',
            acceso_lectura: true,
            acceso_escritura: true,
          },
          {
            rol_id: 'r-sales',
            modulo_id: 'm-productos',
            acceso_lectura: true,
            acceso_escritura: false,
          },
          {
            // Other role — should be ignored for this user.
            rol_id: 'r-admin',
            modulo_id: 'm-ventas',
            acceso_lectura: false,
            acceso_escritura: false,
          },
          {
            // Unknown module id — silently dropped.
            rol_id: 'r-sales',
            modulo_id: 'm-ghost',
            acceso_lectura: true,
            acceso_escritura: true,
          },
        ],
      },
      'core.permisos_usuario_excepcion': { data: [] },
      'core.empresas': {
        data: [
          { id: 'e-rdb', slug: 'rdb' },
          { id: 'e-coda', slug: 'coda' },
          { id: 'e-missing', slug: 'missing' }, // not tied to this user
        ],
      },
    });

    const perms = await fetchPermissionsForUserId(
      supabase as unknown as Parameters<typeof fetchPermissionsForUserId>[0],
      'u1',
    );

    expect(perms.isAdmin).toBe(false);
    expect(perms.email).toBe('alice@bsop.test');
    expect(perms.empresas.get('rdb')).toEqual({ read: true, write: true });
    expect(perms.empresas.get('coda')).toEqual({ read: true, write: true });
    expect(perms.empresas.has('missing')).toBe(false);
    expect(perms.modulos.get('rdb.ventas')).toEqual({ read: true, write: true });
    expect(perms.modulos.get('rdb.productos')).toEqual({ read: true, write: false });
    // Orphan slug (no rol link) stays absent.
    expect(perms.modulos.has('unused')).toBe(false);
  });

  it('applies user exceptions that override role grants', async () => {
    const supabase = makeSupabaseMock({
      'core.usuarios': {
        single: { id: 'u1', email: 'a@b.c', rol: 'user', activo: true },
      },
      'core.usuarios_empresas': {
        data: [{ empresa_id: 'e-rdb', rol_id: 'r-sales', activo: true }],
      },
      'core.modulos': {
        data: [
          { id: 'm-ventas', slug: 'rdb.ventas' },
          { id: 'm-cortes', slug: 'rdb.cortes' },
        ],
      },
      'core.permisos_rol': {
        data: [
          {
            rol_id: 'r-sales',
            modulo_id: 'm-ventas',
            acceso_lectura: true,
            acceso_escritura: true,
          },
        ],
      },
      'core.permisos_usuario_excepcion': {
        data: [
          // Revoke write on ventas via exception.
          {
            empresa_id: 'e-rdb',
            modulo_id: 'm-ventas',
            acceso_lectura: true,
            acceso_escritura: false,
          },
          // Grant read-only on cortes via exception (role didn't grant it).
          {
            empresa_id: 'e-rdb',
            modulo_id: 'm-cortes',
            acceso_lectura: true,
            acceso_escritura: false,
          },
          // Unknown module → dropped.
          {
            empresa_id: 'e-rdb',
            modulo_id: 'm-ghost',
            acceso_lectura: true,
            acceso_escritura: true,
          },
        ],
      },
      'core.empresas': { data: [{ id: 'e-rdb', slug: 'rdb' }] },
    });

    const perms = await fetchPermissionsForUserId(
      supabase as unknown as Parameters<typeof fetchPermissionsForUserId>[0],
      'u1',
    );

    expect(perms.modulos.get('rdb.ventas')).toEqual({ read: true, write: false });
    expect(perms.modulos.get('rdb.cortes')).toEqual({ read: true, write: false });
  });

  it('coerces null acceso_lectura / acceso_escritura to false', async () => {
    const supabase = makeSupabaseMock({
      'core.usuarios': {
        single: { id: 'u1', email: 'a@b.c', rol: 'user', activo: true },
      },
      'core.usuarios_empresas': {
        data: [{ empresa_id: 'e1', rol_id: 'r1', activo: true }],
      },
      'core.modulos': { data: [{ id: 'm1', slug: 'x.y' }] },
      'core.permisos_rol': {
        data: [
          {
            rol_id: 'r1',
            modulo_id: 'm1',
            acceso_lectura: null,
            acceso_escritura: null,
          },
        ],
      },
      'core.permisos_usuario_excepcion': { data: [] },
      'core.empresas': { data: [{ id: 'e1', slug: 'ex' }] },
    });

    const perms = await fetchPermissionsForUserId(
      supabase as unknown as Parameters<typeof fetchPermissionsForUserId>[0],
      'u1',
    );
    expect(perms.modulos.get('x.y')).toEqual({ read: false, write: false });
  });
});

describe('fetchUserPermissions', () => {
  it('returns empty when there is no authenticated user', async () => {
    const supabase = makeSupabaseMock({}, { data: { user: null } });
    const perms = await fetchUserPermissions(
      supabase as unknown as Parameters<typeof fetchUserPermissions>[0],
    );
    expect(perms.email).toBe(null);
    expect(perms.isAdmin).toBe(false);
  });

  it('returns inactive-user shape with email populated when row exists but activo=false', async () => {
    const supabase = makeSupabaseMock(
      {
        'core.usuarios': {
          single: { id: 'u1', rol: 'user', activo: false },
        },
      },
      { data: { user: { email: 'Beta@BSOP.TEST' } } },
    );
    const perms = await fetchUserPermissions(
      supabase as unknown as Parameters<typeof fetchUserPermissions>[0],
    );
    // email is preserved (lowercased) and the rest is the empty shape.
    expect(perms.email).toBe('beta@bsop.test');
    expect(perms.isAdmin).toBe(false);
    expect(perms.empresas.size).toBe(0);
    expect(perms.modulos.size).toBe(0);
  });

  it('returns isAdmin=true (and lowercases email) for admin role', async () => {
    const supabase = makeSupabaseMock(
      {
        'core.usuarios': { single: { id: 'u1', rol: 'admin', activo: true } },
      },
      { data: { user: { email: 'Boss@BSOP.Test' } } },
    );
    const perms = await fetchUserPermissions(
      supabase as unknown as Parameters<typeof fetchUserPermissions>[0],
    );
    expect(perms.isAdmin).toBe(true);
    expect(perms.email).toBe('boss@bsop.test');
  });

  it('returns empty when there is no core.usuarios row for the email', async () => {
    const supabase = makeSupabaseMock(
      { 'core.usuarios': { single: null } },
      { data: { user: { email: 'ghost@bsop.test' } } },
    );
    const perms = await fetchUserPermissions(
      supabase as unknown as Parameters<typeof fetchUserPermissions>[0],
    );
    // ...email still populated because the function returns { ...empty, email }.
    expect(perms.email).toBe('ghost@bsop.test');
    expect(perms.isAdmin).toBe(false);
    expect(perms.empresas.size).toBe(0);
  });

  it('builds full empresa+module access for a normal user', async () => {
    const supabase = makeSupabaseMock(
      {
        'core.usuarios': { single: { id: 'u1', rol: 'user', activo: true } },
        'core.usuarios_empresas': {
          data: [{ empresa_id: 'e-rdb', rol_id: 'r-sales', activo: true }],
        },
        'core.modulos': { data: [{ id: 'm-ventas', slug: 'rdb.ventas' }] },
        'core.permisos_rol': {
          data: [
            {
              rol_id: 'r-sales',
              modulo_id: 'm-ventas',
              acceso_lectura: true,
              acceso_escritura: true,
            },
          ],
        },
        'core.permisos_usuario_excepcion': { data: [] },
        'core.empresas': { data: [{ id: 'e-rdb', slug: 'rdb' }] },
      },
      { data: { user: { email: 'alice@bsop.test' } } },
    );

    const perms = await fetchUserPermissions(
      supabase as unknown as Parameters<typeof fetchUserPermissions>[0],
    );

    expect(perms.isAdmin).toBe(false);
    expect(perms.email).toBe('alice@bsop.test');
    expect(canAccessEmpresa(perms, 'rdb')).toBe(true);
    expect(canAccessModulo(perms, 'rdb.ventas', 'write')).toBe(true);
    // And the helper should refuse modules we didn't grant.
    expect(canAccessModulo(perms, 'rdb.cortes')).toBe(false);
  });

  it('applies exception overrides on top of role grants', async () => {
    const supabase = makeSupabaseMock(
      {
        'core.usuarios': { single: { id: 'u1', rol: 'user', activo: true } },
        'core.usuarios_empresas': {
          data: [{ empresa_id: 'e-rdb', rol_id: 'r-sales', activo: true }],
        },
        'core.modulos': {
          data: [
            { id: 'm-ventas', slug: 'rdb.ventas' },
            { id: 'm-cortes', slug: 'rdb.cortes' },
          ],
        },
        'core.permisos_rol': {
          data: [
            {
              rol_id: 'r-sales',
              modulo_id: 'm-ventas',
              acceso_lectura: true,
              acceso_escritura: true,
            },
          ],
        },
        'core.permisos_usuario_excepcion': {
          data: [
            // Revoke write on ventas.
            {
              empresa_id: 'e-rdb',
              modulo_id: 'm-ventas',
              acceso_lectura: true,
              acceso_escritura: false,
            },
            // Unknown module → dropped silently.
            {
              empresa_id: 'e-rdb',
              modulo_id: 'm-nope',
              acceso_lectura: true,
              acceso_escritura: true,
            },
            // Null read/write coerced to false.
            {
              empresa_id: 'e-rdb',
              modulo_id: 'm-cortes',
              acceso_lectura: null,
              acceso_escritura: null,
            },
          ],
        },
        'core.empresas': { data: [{ id: 'e-rdb', slug: 'rdb' }] },
      },
      { data: { user: { email: 'alice@bsop.test' } } },
    );

    const perms = await fetchUserPermissions(
      supabase as unknown as Parameters<typeof fetchUserPermissions>[0],
    );

    expect(perms.modulos.get('rdb.ventas')).toEqual({ read: true, write: false });
    expect(perms.modulos.get('rdb.cortes')).toEqual({ read: false, write: false });
  });
});
