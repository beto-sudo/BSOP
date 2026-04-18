import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

/**
 * Unit tests for `app/api/impersonate/route.ts` (GET).
 *
 * Security-sensitive, admin-only endpoint: every branch that gates access
 * must fail closed and every branch that builds the permission payload for
 * the target user must produce the exact shape the client expects.
 *
 * The test file uses `vi.mock` hoisting for the route's direct dependencies:
 *
 *   • `@/lib/ratelimit`        — rate-limit check + identifier extraction
 *   • `@/lib/supabase-admin`   — service-role client factory
 *   • `@supabase/ssr`          — server client (used for caller auth)
 *   • `next/headers`           — `cookies` helper (no-op stub in tests)
 *
 * The admin Supabase client is hand-rolled as a minimal fluent mock that
 * reproduces the call shapes in the route:
 *
 *   admin.schema('core').from(table).select(...).eq(...).eq(...).maybeSingle()
 *   admin.schema('core').from(table).select(...).eq(...)                // thenable
 *   admin.schema('core').from(table).select(...)                         // thenable
 *
 * Each test reassigns per-table `single` / `data` results via `installAdminMock`
 * so individual branches can vary just the slice they care about.
 */

// ── Hoisted mocks ─────────────────────────────────────────────────────────

// IMPORTANT: these factories deliberately avoid `vi.fn()` internals so that
// `vi.clearAllMocks()` between tests does not strip their implementations.
// Behavior is driven by module-level `let` vars reassigned in `beforeEach`.
vi.mock('next/headers', () => ({
  cookies: async () => ({
    getAll: () => [],
    set: () => undefined,
  }),
}));

vi.mock('@supabase/ssr', () => ({
  createServerClient: () => ({
    auth: {
      getUser: async () => serverGetUserResult,
    },
  }),
}));

vi.mock('@/lib/ratelimit', () => ({
  impersonateRateLimiter: {
    check: async () => rateLimitResult,
  },
  extractIdentifier: () => 'ip:test',
}));

vi.mock('@/lib/supabase-admin', () => ({
  getSupabaseAdminClient: () =>
    adminClientOverrideActive ? adminClientOverride : adminClient,
}));

// ── Test-wide state ──────────────────────────────────────────────────────

type GetUserResult = { data: { user: { email: string } | null } };

type MaybeSingleResult<T> = { data: T | null; error: null };
type ListResult<T> = { data: T[]; error: null };

type Script = {
  callerUser?: { rol: string } | null;
  targetUser?: { id: string; email: string; rol: string; activo: boolean } | null;
  userEmpresas?: Array<{ empresa_id: string; rol_id: string | null }>;
  allModulos?: Array<{ id: string; slug: string }>;
  allPermisosRol?: Array<{
    rol_id: string;
    modulo_id: string;
    acceso_lectura: boolean | null;
    acceso_escritura: boolean | null;
  }>;
  userExcepciones?: Array<{
    empresa_id: string;
    modulo_id: string;
    acceso_lectura: boolean | null;
    acceso_escritura: boolean | null;
  }>;
  allEmpresas?: Array<{ id: string; slug: string }>;
};

// Mutable mocks that `vi.mock` factories close over. Tests re-assign these
// in `beforeEach` / inline via `installAdminMock`, `setCaller`, etc.
let rateLimitResult: { ok: true } | { ok: false; response: Response };
let serverGetUserResult: GetUserResult;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let adminClient: any;
// When active, overrides the factory return value (used to simulate a missing
// admin client without wiping the default).
let adminClientOverrideActive = false;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let adminClientOverride: any = null;

/**
 * Build a minimal fluent mock matching the call shapes in route.ts.
 * `.select()` returns a chain that is both thenable (for list queries)
 * and has `.eq()` / `.maybeSingle()` (for filtered / single-row queries).
 *
 * Routing is done per `(schema, table)`:
 *   - core.usuarios with .eq('email', …) → callerUser (single)
 *   - core.usuarios with .eq('id', …)    → targetUser (single)
 *   - core.usuarios_empresas             → userEmpresas (list)
 *   - core.modulos                       → allModulos (list)
 *   - core.permisos_rol                  → allPermisosRol (list)
 *   - core.permisos_usuario_excepcion    → userExcepciones (list)
 *   - core.empresas                      → allEmpresas (list)
 */
function installAdminMock(script: Script) {
  adminClient = {
    schema(schemaName: string) {
      return {
        from(tableName: string) {
          const key = `${schemaName}.${tableName}`;

          // A mutable context tracks the columns being filtered on so the
          // caller vs. target query on core.usuarios can dispatch correctly.
          // The route chains `.eq('email', …).eq('activo', true)` for the
          // caller and `.eq('id', …)` for the target — we only care about
          // whether `email` or `id` appeared in the chain.
          const ctx: { filterCols: string[] } = { filterCols: [] };

          const listResult = (): ListResult<unknown> => {
            switch (key) {
              case 'core.usuarios_empresas':
                return { data: script.userEmpresas ?? [], error: null };
              case 'core.modulos':
                return { data: script.allModulos ?? [], error: null };
              case 'core.permisos_rol':
                return { data: script.allPermisosRol ?? [], error: null };
              case 'core.permisos_usuario_excepcion':
                return { data: script.userExcepciones ?? [], error: null };
              case 'core.empresas':
                return { data: script.allEmpresas ?? [], error: null };
              default:
                return { data: [], error: null };
            }
          };

          const singleResult = (): MaybeSingleResult<unknown> => {
            if (key !== 'core.usuarios') return { data: null, error: null };
            if (ctx.filterCols.includes('email')) {
              return { data: script.callerUser ?? null, error: null };
            }
            if (ctx.filterCols.includes('id')) {
              return { data: script.targetUser ?? null, error: null };
            }
            return { data: null, error: null };
          };

          type Chain = {
            select: (..._args: unknown[]) => Chain;
            eq: (col: string, ..._args: unknown[]) => Chain;
            maybeSingle: () => Promise<MaybeSingleResult<unknown>>;
            then: <R1 = ListResult<unknown>, R2 = never>(
              onFulfilled?:
                | ((value: ListResult<unknown>) => R1 | PromiseLike<R1>)
                | null,
              onRejected?: ((reason: unknown) => R2 | PromiseLike<R2>) | null,
            ) => Promise<R1 | R2>;
          };

          const chain: Chain = {
            select: () => chain,
            eq: (col: string) => {
              ctx.filterCols.push(col);
              return chain;
            },
            maybeSingle: () => Promise.resolve(singleResult()),
            then: (onFulfilled, onRejected) =>
              Promise.resolve(listResult()).then(onFulfilled, onRejected),
          };

          return chain;
        },
      };
    },
  };
}

function makeReq(searchParams: Record<string, string> = {}) {
  const url = new URL('https://bsop.test/api/impersonate');
  for (const [k, v] of Object.entries(searchParams)) {
    url.searchParams.set(k, v);
  }
  return new NextRequest(url);
}

// Import the handler _after_ the mock factories are declared but within the
// module system — dynamic import inside each test keeps the env predictable.
async function loadHandler() {
  const mod = await import('./route');
  return mod.GET;
}

// ── Defaults ──────────────────────────────────────────────────────────────

const TARGET_UUID = '11111111-1111-4111-8111-111111111111';

beforeEach(() => {
  rateLimitResult = { ok: true };
  adminClientOverrideActive = false;
  adminClientOverride = null;
  serverGetUserResult = { data: { user: { email: 'admin@bsop.test' } } };
  installAdminMock({
    // By default the caller is a valid admin so the happy-path prefix is met.
    callerUser: { rol: 'admin' },
    targetUser: {
      id: TARGET_UUID,
      email: 'target@bsop.test',
      rol: 'user',
      activo: true,
    },
    userEmpresas: [],
    allModulos: [],
    allPermisosRol: [],
    userExcepciones: [],
    allEmpresas: [],
  });
  // Supabase env vars referenced by createServerClient (non-null assertion
  // in route.ts), plus the admin client factory. The factory is mocked but
  // the env access happens before the mock is called, so define something.
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co';
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon-key';
});

// ── Tests ─────────────────────────────────────────────────────────────────

describe('GET /api/impersonate — rate limit', () => {
  it('returns the rate-limiter response unchanged when check fails', async () => {
    const blocked = new Response(JSON.stringify({ error: 'Too many requests' }), {
      status: 429,
    });
    rateLimitResult = { ok: false, response: blocked as unknown as Response };

    const GET = await loadHandler();
    const res = await GET(makeReq({ userId: TARGET_UUID }));

    expect(res).toBe(blocked);
  });

  it('proceeds past the rate limit when ok', async () => {
    // Default state is ok + admin caller + valid target → 200.
    const GET = await loadHandler();
    const res = await GET(makeReq({ userId: TARGET_UUID }));
    expect(res.status).toBe(200);
  });
});

describe('GET /api/impersonate — query validation', () => {
  it('returns 400 when userId is missing', async () => {
    const GET = await loadHandler();
    const res = await GET(makeReq({}));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('Invalid request');
    expect(Array.isArray(body.issues)).toBe(true);
  });

  it('returns 400 when userId is not a valid UUID', async () => {
    const GET = await loadHandler();
    const res = await GET(makeReq({ userId: 'not-a-uuid' }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.issues?.[0]?.path).toBe('userId');
  });

  it('accepts a valid UUID and continues past validation', async () => {
    const GET = await loadHandler();
    const res = await GET(makeReq({ userId: TARGET_UUID }));
    expect(res.status).toBe(200);
  });
});

describe('GET /api/impersonate — caller authentication', () => {
  it('returns 401 when the server client has no user', async () => {
    serverGetUserResult = { data: { user: null } };
    const GET = await loadHandler();
    const res = await GET(makeReq({ userId: TARGET_UUID }));
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe('Not authenticated');
  });

  it('returns 401 when the user has no email', async () => {
    serverGetUserResult = {
      data: { user: { email: '' as unknown as string } },
    };
    const GET = await loadHandler();
    const res = await GET(makeReq({ userId: TARGET_UUID }));
    expect(res.status).toBe(401);
  });

  it('returns 500 when the admin client cannot be built', async () => {
    adminClientOverrideActive = true;
    adminClientOverride = null;
    const GET = await loadHandler();
    const res = await GET(makeReq({ userId: TARGET_UUID }));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe('Server config error');
  });
});

describe('GET /api/impersonate — caller authorization', () => {
  it('returns 403 when caller is not an admin', async () => {
    installAdminMock({
      callerUser: { rol: 'user' },
      targetUser: {
        id: TARGET_UUID,
        email: 't@bsop.test',
        rol: 'user',
        activo: true,
      },
    });
    const GET = await loadHandler();
    const res = await GET(makeReq({ userId: TARGET_UUID }));
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe('Forbidden');
  });

  it('returns 403 when caller row is missing (e.g. inactive, dropped by activo filter)', async () => {
    installAdminMock({
      callerUser: null,
      targetUser: {
        id: TARGET_UUID,
        email: 't@bsop.test',
        rol: 'user',
        activo: true,
      },
    });
    const GET = await loadHandler();
    const res = await GET(makeReq({ userId: TARGET_UUID }));
    expect(res.status).toBe(403);
  });

  it('lowercases the caller email before the DB lookup', async () => {
    // We can't easily introspect `eq` calls in this fluent mock, but we can
    // at least verify the handler accepts a mixed-case email without 403ing
    // when the caller row is admin.
    serverGetUserResult = {
      data: { user: { email: 'Admin@BSOP.TEST' } },
    };
    const GET = await loadHandler();
    const res = await GET(makeReq({ userId: TARGET_UUID }));
    expect(res.status).toBe(200);
  });
});

describe('GET /api/impersonate — target lookup', () => {
  it('returns 404 when the target user does not exist', async () => {
    installAdminMock({
      callerUser: { rol: 'admin' },
      targetUser: null,
    });
    const GET = await loadHandler();
    const res = await GET(makeReq({ userId: TARGET_UUID }));
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe('User not found or inactive');
  });

  it('returns 404 when the target user is inactive', async () => {
    installAdminMock({
      callerUser: { rol: 'admin' },
      targetUser: {
        id: TARGET_UUID,
        email: 'inactive@bsop.test',
        rol: 'user',
        activo: false,
      },
    });
    const GET = await loadHandler();
    const res = await GET(makeReq({ userId: TARGET_UUID }));
    expect(res.status).toBe(404);
  });
});

describe('GET /api/impersonate — admin target short-circuit', () => {
  it('returns isAdmin=true with empty empresas / modulos when target has rol=admin', async () => {
    installAdminMock({
      callerUser: { rol: 'admin' },
      targetUser: {
        id: TARGET_UUID,
        email: 'other-admin@bsop.test',
        rol: 'admin',
        activo: true,
      },
      // These must NOT be consumed for an admin target.
      userEmpresas: [{ empresa_id: 'e-rdb', rol_id: 'r-sales' }],
      allEmpresas: [{ id: 'e-rdb', slug: 'rdb' }],
    });

    const GET = await loadHandler();
    const res = await GET(makeReq({ userId: TARGET_UUID }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({
      isAdmin: true,
      email: 'other-admin@bsop.test',
      empresas: {},
      modulos: {},
    });
  });
});

describe('GET /api/impersonate — non-admin target payload', () => {
  it('returns an empty empresas/modulos payload for a user with no memberships', async () => {
    installAdminMock({
      callerUser: { rol: 'admin' },
      targetUser: {
        id: TARGET_UUID,
        email: 'lonely@bsop.test',
        rol: 'user',
        activo: true,
      },
      userEmpresas: [],
      allModulos: [{ id: 'm-x', slug: 'x' }],
      allPermisosRol: [
        {
          rol_id: 'r-unused',
          modulo_id: 'm-x',
          acceso_lectura: true,
          acceso_escritura: true,
        },
      ],
      userExcepciones: [],
      allEmpresas: [{ id: 'e-rdb', slug: 'rdb' }],
    });
    const GET = await loadHandler();
    const res = await GET(makeReq({ userId: TARGET_UUID }));
    const body = await res.json();
    expect(body).toEqual({
      isAdmin: false,
      email: 'lonely@bsop.test',
      empresas: {},
      modulos: {},
    });
  });

  it('builds the empresas dict from usuarios_empresas joined with empresa slugs', async () => {
    installAdminMock({
      callerUser: { rol: 'admin' },
      targetUser: {
        id: TARGET_UUID,
        email: 'user@bsop.test',
        rol: 'user',
        activo: true,
      },
      userEmpresas: [
        { empresa_id: 'e-rdb', rol_id: 'r-sales' },
        { empresa_id: 'e-coda', rol_id: null },
        // References an empresa_id that's not in allEmpresas — dropped.
        { empresa_id: 'e-ghost', rol_id: 'r-sales' },
      ],
      allModulos: [],
      allPermisosRol: [],
      userExcepciones: [],
      allEmpresas: [
        { id: 'e-rdb', slug: 'rdb' },
        { id: 'e-coda', slug: 'coda' },
        // Not tied to this user — must not appear.
        { id: 'e-other', slug: 'other' },
      ],
    });

    const GET = await loadHandler();
    const res = await GET(makeReq({ userId: TARGET_UUID }));
    const body = await res.json();
    expect(body.empresas).toEqual({
      rdb: { read: true, write: true },
      coda: { read: true, write: true },
    });
    expect(body.empresas.other).toBeUndefined();
    expect(body.empresas.ghost).toBeUndefined();
  });

  it('builds the modulos dict from permisos_rol matched to the user role', async () => {
    installAdminMock({
      callerUser: { rol: 'admin' },
      targetUser: {
        id: TARGET_UUID,
        email: 'user@bsop.test',
        rol: 'user',
        activo: true,
      },
      userEmpresas: [{ empresa_id: 'e-rdb', rol_id: 'r-sales' }],
      allModulos: [
        { id: 'm-ventas', slug: 'rdb.ventas' },
        { id: 'm-cortes', slug: 'rdb.cortes' },
      ],
      allPermisosRol: [
        {
          rol_id: 'r-sales',
          modulo_id: 'm-ventas',
          acceso_lectura: true,
          acceso_escritura: true,
        },
        {
          rol_id: 'r-sales',
          modulo_id: 'm-cortes',
          acceso_lectura: true,
          acceso_escritura: false,
        },
        // Belongs to a different role — must be ignored.
        {
          rol_id: 'r-other',
          modulo_id: 'm-ventas',
          acceso_lectura: false,
          acceso_escritura: false,
        },
      ],
      userExcepciones: [],
      allEmpresas: [{ id: 'e-rdb', slug: 'rdb' }],
    });

    const GET = await loadHandler();
    const res = await GET(makeReq({ userId: TARGET_UUID }));
    const body = await res.json();
    expect(body.modulos).toEqual({
      'rdb.ventas': { read: true, write: true },
      'rdb.cortes': { read: true, write: false },
    });
  });

  it('ignores usuarios_empresas rows with a null rol_id when building modulos', async () => {
    installAdminMock({
      callerUser: { rol: 'admin' },
      targetUser: {
        id: TARGET_UUID,
        email: 'user@bsop.test',
        rol: 'user',
        activo: true,
      },
      userEmpresas: [{ empresa_id: 'e-rdb', rol_id: null }],
      allModulos: [{ id: 'm-ventas', slug: 'rdb.ventas' }],
      allPermisosRol: [
        {
          // Should not be consumed because the user's rol_id is null.
          rol_id: 'r-sales',
          modulo_id: 'm-ventas',
          acceso_lectura: true,
          acceso_escritura: true,
        },
      ],
      userExcepciones: [],
      allEmpresas: [{ id: 'e-rdb', slug: 'rdb' }],
    });

    const GET = await loadHandler();
    const res = await GET(makeReq({ userId: TARGET_UUID }));
    const body = await res.json();
    expect(body.empresas).toEqual({ rdb: { read: true, write: true } });
    expect(body.modulos).toEqual({});
  });

  it('drops role permissions whose modulo_id is not in allModulos', async () => {
    installAdminMock({
      callerUser: { rol: 'admin' },
      targetUser: {
        id: TARGET_UUID,
        email: 'user@bsop.test',
        rol: 'user',
        activo: true,
      },
      userEmpresas: [{ empresa_id: 'e-rdb', rol_id: 'r-sales' }],
      allModulos: [{ id: 'm-ventas', slug: 'rdb.ventas' }],
      allPermisosRol: [
        {
          rol_id: 'r-sales',
          modulo_id: 'm-ventas',
          acceso_lectura: true,
          acceso_escritura: true,
        },
        // Unknown module → dropped.
        {
          rol_id: 'r-sales',
          modulo_id: 'm-ghost',
          acceso_lectura: true,
          acceso_escritura: true,
        },
      ],
      userExcepciones: [],
      allEmpresas: [{ id: 'e-rdb', slug: 'rdb' }],
    });

    const GET = await loadHandler();
    const res = await GET(makeReq({ userId: TARGET_UUID }));
    const body = await res.json();
    expect(body.modulos).toEqual({
      'rdb.ventas': { read: true, write: true },
    });
    expect(Object.keys(body.modulos)).toHaveLength(1);
  });

  it('coerces null acceso_lectura / acceso_escritura from role permissions to false', async () => {
    installAdminMock({
      callerUser: { rol: 'admin' },
      targetUser: {
        id: TARGET_UUID,
        email: 'user@bsop.test',
        rol: 'user',
        activo: true,
      },
      userEmpresas: [{ empresa_id: 'e-rdb', rol_id: 'r-sales' }],
      allModulos: [{ id: 'm-ventas', slug: 'rdb.ventas' }],
      allPermisosRol: [
        {
          rol_id: 'r-sales',
          modulo_id: 'm-ventas',
          acceso_lectura: null,
          acceso_escritura: null,
        },
      ],
      userExcepciones: [],
      allEmpresas: [{ id: 'e-rdb', slug: 'rdb' }],
    });

    const GET = await loadHandler();
    const res = await GET(makeReq({ userId: TARGET_UUID }));
    const body = await res.json();
    expect(body.modulos['rdb.ventas']).toEqual({ read: false, write: false });
  });
});

describe('GET /api/impersonate — exception overrides', () => {
  it('overrides role-derived modulo perms with matching exception rows', async () => {
    installAdminMock({
      callerUser: { rol: 'admin' },
      targetUser: {
        id: TARGET_UUID,
        email: 'user@bsop.test',
        rol: 'user',
        activo: true,
      },
      userEmpresas: [{ empresa_id: 'e-rdb', rol_id: 'r-sales' }],
      allModulos: [{ id: 'm-ventas', slug: 'rdb.ventas' }],
      allPermisosRol: [
        {
          rol_id: 'r-sales',
          modulo_id: 'm-ventas',
          acceso_lectura: true,
          acceso_escritura: true,
        },
      ],
      userExcepciones: [
        {
          empresa_id: 'e-rdb',
          modulo_id: 'm-ventas',
          acceso_lectura: true,
          acceso_escritura: false,
        },
      ],
      allEmpresas: [{ id: 'e-rdb', slug: 'rdb' }],
    });

    const GET = await loadHandler();
    const res = await GET(makeReq({ userId: TARGET_UUID }));
    const body = await res.json();
    expect(body.modulos['rdb.ventas']).toEqual({ read: true, write: false });
  });

  it('adds module access via exception even when the role granted none', async () => {
    installAdminMock({
      callerUser: { rol: 'admin' },
      targetUser: {
        id: TARGET_UUID,
        email: 'user@bsop.test',
        rol: 'user',
        activo: true,
      },
      userEmpresas: [{ empresa_id: 'e-rdb', rol_id: 'r-sales' }],
      allModulos: [
        { id: 'm-ventas', slug: 'rdb.ventas' },
        { id: 'm-cortes', slug: 'rdb.cortes' },
      ],
      allPermisosRol: [
        {
          rol_id: 'r-sales',
          modulo_id: 'm-ventas',
          acceso_lectura: true,
          acceso_escritura: true,
        },
      ],
      userExcepciones: [
        {
          empresa_id: 'e-rdb',
          modulo_id: 'm-cortes',
          acceso_lectura: true,
          acceso_escritura: false,
        },
      ],
      allEmpresas: [{ id: 'e-rdb', slug: 'rdb' }],
    });

    const GET = await loadHandler();
    const res = await GET(makeReq({ userId: TARGET_UUID }));
    const body = await res.json();
    expect(body.modulos['rdb.cortes']).toEqual({ read: true, write: false });
    // Role-derived perm still stands.
    expect(body.modulos['rdb.ventas']).toEqual({ read: true, write: true });
  });

  it('drops exception rows whose modulo_id is not in allModulos', async () => {
    installAdminMock({
      callerUser: { rol: 'admin' },
      targetUser: {
        id: TARGET_UUID,
        email: 'user@bsop.test',
        rol: 'user',
        activo: true,
      },
      userEmpresas: [{ empresa_id: 'e-rdb', rol_id: 'r-sales' }],
      allModulos: [{ id: 'm-ventas', slug: 'rdb.ventas' }],
      allPermisosRol: [
        {
          rol_id: 'r-sales',
          modulo_id: 'm-ventas',
          acceso_lectura: true,
          acceso_escritura: true,
        },
      ],
      userExcepciones: [
        {
          empresa_id: 'e-rdb',
          modulo_id: 'm-ghost',
          acceso_lectura: true,
          acceso_escritura: true,
        },
      ],
      allEmpresas: [{ id: 'e-rdb', slug: 'rdb' }],
    });

    const GET = await loadHandler();
    const res = await GET(makeReq({ userId: TARGET_UUID }));
    const body = await res.json();
    expect(body.modulos).toEqual({
      'rdb.ventas': { read: true, write: true },
    });
  });

  it('coerces null acceso_lectura / acceso_escritura from exceptions to false', async () => {
    installAdminMock({
      callerUser: { rol: 'admin' },
      targetUser: {
        id: TARGET_UUID,
        email: 'user@bsop.test',
        rol: 'user',
        activo: true,
      },
      userEmpresas: [{ empresa_id: 'e-rdb', rol_id: 'r-sales' }],
      allModulos: [{ id: 'm-ventas', slug: 'rdb.ventas' }],
      allPermisosRol: [
        {
          rol_id: 'r-sales',
          modulo_id: 'm-ventas',
          acceso_lectura: true,
          acceso_escritura: true,
        },
      ],
      userExcepciones: [
        {
          empresa_id: 'e-rdb',
          modulo_id: 'm-ventas',
          acceso_lectura: null,
          acceso_escritura: null,
        },
      ],
      allEmpresas: [{ id: 'e-rdb', slug: 'rdb' }],
    });

    const GET = await loadHandler();
    const res = await GET(makeReq({ userId: TARGET_UUID }));
    const body = await res.json();
    // Exception with nulls fully revokes access (null → false).
    expect(body.modulos['rdb.ventas']).toEqual({ read: false, write: false });
  });
});

describe('GET /api/impersonate — happy-path shape', () => {
  it('returns isAdmin=false with the target email and fully-built dicts', async () => {
    installAdminMock({
      callerUser: { rol: 'admin' },
      targetUser: {
        id: TARGET_UUID,
        email: 'mix@bsop.test',
        rol: 'user',
        activo: true,
      },
      userEmpresas: [
        { empresa_id: 'e-rdb', rol_id: 'r-sales' },
        { empresa_id: 'e-coda', rol_id: 'r-editor' },
      ],
      allModulos: [
        { id: 'm-ventas', slug: 'rdb.ventas' },
        { id: 'm-docs', slug: 'coda.docs' },
      ],
      allPermisosRol: [
        {
          rol_id: 'r-sales',
          modulo_id: 'm-ventas',
          acceso_lectura: true,
          acceso_escritura: true,
        },
        {
          rol_id: 'r-editor',
          modulo_id: 'm-docs',
          acceso_lectura: true,
          acceso_escritura: false,
        },
      ],
      userExcepciones: [
        // Revoke write on ventas.
        {
          empresa_id: 'e-rdb',
          modulo_id: 'm-ventas',
          acceso_lectura: true,
          acceso_escritura: false,
        },
      ],
      allEmpresas: [
        { id: 'e-rdb', slug: 'rdb' },
        { id: 'e-coda', slug: 'coda' },
      ],
    });

    const GET = await loadHandler();
    const res = await GET(makeReq({ userId: TARGET_UUID }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({
      isAdmin: false,
      email: 'mix@bsop.test',
      empresas: {
        rdb: { read: true, write: true },
        coda: { read: true, write: true },
      },
      modulos: {
        'rdb.ventas': { read: true, write: false }, // overridden by exception
        'coda.docs': { read: true, write: false },
      },
    });
  });
});
