import { describe, it, expect, vi, beforeEach } from 'vitest';

let cookieStoreState: { value: string | null };

vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) => {
      if (name === 'bsop_preview_as' && cookieStoreState.value) {
        return { name, value: cookieStoreState.value };
      }
      return undefined;
    },
  }),
}));

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let adminClient: any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let adminClientOverride: any;
let adminClientOverrideActive = false;

vi.mock('@/lib/supabase-admin', () => ({
  getSupabaseAdminClient: () => (adminClientOverrideActive ? adminClientOverride : adminClient),
}));

type Script = {
  caller?: { id: string; email: string; rol: string; activo: boolean } | null;
  target?: { id: string; email: string; rol: string; activo: boolean } | null;
};

function installAdmin(script: Script) {
  adminClient = {
    schema() {
      return {
        from() {
          const ctx: { filterCols: string[] } = { filterCols: [] };
          const chain = {
            select: () => chain,
            eq: (col: string) => {
              ctx.filterCols.push(col);
              return chain;
            },
            maybeSingle: async () => {
              if (ctx.filterCols.includes('email')) {
                return { data: script.caller ?? null, error: null };
              }
              if (ctx.filterCols.includes('id')) {
                return { data: script.target ?? null, error: null };
              }
              return { data: null, error: null };
            },
          };
          return chain;
        },
      };
    },
  };
}

const CALLER_UUID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const TARGET_UUID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const fakeSupabase = (email: string | null): any => ({
  auth: {
    getUser: async () => ({ data: { user: email ? { email } : null } }),
  },
});

beforeEach(() => {
  cookieStoreState = { value: null };
  adminClientOverrideActive = false;
  adminClientOverride = null;
  installAdmin({
    caller: { id: CALLER_UUID, email: 'caller@bsop.test', rol: 'user', activo: true },
  });
});

describe('getEffectiveUser', () => {
  it('returns null when caller is not authenticated', async () => {
    const { getEffectiveUser } = await import('./effective-user');
    const result = await getEffectiveUser(fakeSupabase(null));
    expect(result).toBeNull();
  });

  it('returns null when caller is not in core.usuarios', async () => {
    installAdmin({ caller: null });
    const { getEffectiveUser } = await import('./effective-user');
    const result = await getEffectiveUser(fakeSupabase('orphan@bsop.test'));
    expect(result).toBeNull();
  });

  it('returns the caller when not admin and no cookie', async () => {
    const { getEffectiveUser } = await import('./effective-user');
    const result = await getEffectiveUser(fakeSupabase('caller@bsop.test'));
    expect(result).toEqual({
      id: CALLER_UUID,
      email: 'caller@bsop.test',
      isAdmin: false,
      isPreviewing: false,
    });
  });

  it('ignores cookie when caller is not admin', async () => {
    cookieStoreState.value = TARGET_UUID;
    const { getEffectiveUser } = await import('./effective-user');
    const result = await getEffectiveUser(fakeSupabase('caller@bsop.test'));
    expect(result?.id).toBe(CALLER_UUID);
    expect(result?.isPreviewing).toBe(false);
  });

  it('returns the caller when admin and no cookie', async () => {
    installAdmin({
      caller: { id: CALLER_UUID, email: 'admin@bsop.test', rol: 'admin', activo: true },
    });
    const { getEffectiveUser } = await import('./effective-user');
    const result = await getEffectiveUser(fakeSupabase('admin@bsop.test'));
    expect(result).toEqual({
      id: CALLER_UUID,
      email: 'admin@bsop.test',
      isAdmin: true,
      isPreviewing: false,
    });
  });

  it('returns the target when admin with valid cookie', async () => {
    cookieStoreState.value = TARGET_UUID;
    installAdmin({
      caller: { id: CALLER_UUID, email: 'admin@bsop.test', rol: 'admin', activo: true },
      target: { id: TARGET_UUID, email: 'target@bsop.test', rol: 'user', activo: true },
    });
    const { getEffectiveUser } = await import('./effective-user');
    const result = await getEffectiveUser(fakeSupabase('admin@bsop.test'));
    expect(result).toEqual({
      id: TARGET_UUID,
      email: 'target@bsop.test',
      isAdmin: false,
      isPreviewing: true,
    });
  });

  it('falls back to caller when admin and cookie target is not found', async () => {
    cookieStoreState.value = TARGET_UUID;
    installAdmin({
      caller: { id: CALLER_UUID, email: 'admin@bsop.test', rol: 'admin', activo: true },
      target: null,
    });
    const { getEffectiveUser } = await import('./effective-user');
    const result = await getEffectiveUser(fakeSupabase('admin@bsop.test'));
    expect(result?.id).toBe(CALLER_UUID);
    expect(result?.isPreviewing).toBe(false);
  });

  it('returns null when admin client is unavailable', async () => {
    adminClientOverrideActive = true;
    adminClientOverride = null;
    const { getEffectiveUser } = await import('./effective-user');
    const result = await getEffectiveUser(fakeSupabase('caller@bsop.test'));
    expect(result).toBeNull();
  });
});
