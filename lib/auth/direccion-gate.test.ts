import { describe, it, expect } from 'vitest';
import { checkDireccionEmpresa } from './direccion-gate';
import type { SupabaseClient } from '@supabase/supabase-js';

type Script = {
  authUser?: { id: string; email?: string } | null;
  coreUser?: { id: string; rol: string } | null;
  direccionRoles?: { id: string }[];
  asignaciones?: { rol_id: string }[];
};

function makeClient(script: Script): SupabaseClient {
  const client = {
    auth: {
      getUser: async () =>
        script.authUser
          ? { data: { user: script.authUser }, error: null }
          : { data: { user: null }, error: null },
    },
    schema() {
      return {
        from(table: string) {
          const ctx = { filterCols: [] as string[] };
          const chain = {
            select: () => chain,
            eq: (col: string) => {
              ctx.filterCols.push(col);
              return chain;
            },
            ilike: () => chain,
            in: () => chain,
            maybeSingle: async () => ({ data: script.coreUser ?? null, error: null }),
            then: (resolve: (v: { data: unknown[]; error: null }) => void) => {
              if (table === 'roles') {
                resolve({ data: script.direccionRoles ?? [], error: null });
              } else if (table === 'usuarios_empresas') {
                resolve({ data: script.asignaciones ?? [], error: null });
              } else {
                resolve({ data: [], error: null });
              }
            },
          };
          return chain;
        },
      };
    },
  };
  return client as unknown as SupabaseClient;
}

const EMPRESA = 'emp-1';

describe('checkDireccionEmpresa', () => {
  it('rechaza sin empresaId', async () => {
    const r = await checkDireccionEmpresa(makeClient({}), '');
    expect(r.ok).toBe(false);
  });

  it('rechaza sin sesión', async () => {
    const r = await checkDireccionEmpresa(makeClient({ authUser: null }), EMPRESA);
    expect(r).toEqual({ ok: false, error: 'No autenticado' });
  });

  it('rechaza JWT sin email', async () => {
    const r = await checkDireccionEmpresa(makeClient({ authUser: { id: 'a1' } }), EMPRESA);
    expect(r).toEqual({ ok: false, error: 'JWT sin email' });
  });

  it('rechaza usuario inexistente en core.usuarios', async () => {
    const r = await checkDireccionEmpresa(
      makeClient({ authUser: { id: 'a1', email: 'x@y.z' }, coreUser: null }),
      EMPRESA
    );
    expect(r.ok).toBe(false);
  });

  it('autoriza admin global sin consultar roles', async () => {
    const r = await checkDireccionEmpresa(
      makeClient({ authUser: { id: 'a1', email: 'x@y.z' }, coreUser: { id: 'u1', rol: 'admin' } }),
      EMPRESA
    );
    expect(r).toEqual({ ok: true, autorizado: true, authUserId: 'a1', coreUserId: 'u1' });
  });

  it('autoriza rol Dirección activo en la empresa', async () => {
    const r = await checkDireccionEmpresa(
      makeClient({
        authUser: { id: 'a1', email: 'x@y.z' },
        coreUser: { id: 'u1', rol: 'usuario' },
        direccionRoles: [{ id: 'rol-dir' }],
        asignaciones: [{ rol_id: 'rol-dir' }],
      }),
      EMPRESA
    );
    expect(r).toEqual({ ok: true, autorizado: true, authUserId: 'a1', coreUserId: 'u1' });
  });

  it('no autoriza si la empresa no tiene rol Dirección', async () => {
    const r = await checkDireccionEmpresa(
      makeClient({
        authUser: { id: 'a1', email: 'x@y.z' },
        coreUser: { id: 'u1', rol: 'usuario' },
        direccionRoles: [],
      }),
      EMPRESA
    );
    expect(r.ok && r.autorizado).toBe(false);
    expect(r.ok).toBe(true);
  });

  it('no autoriza sin asignación activa al rol Dirección', async () => {
    const r = await checkDireccionEmpresa(
      makeClient({
        authUser: { id: 'a1', email: 'x@y.z' },
        coreUser: { id: 'u1', rol: 'usuario' },
        direccionRoles: [{ id: 'rol-dir' }],
        asignaciones: [],
      }),
      EMPRESA
    );
    expect(r.ok && r.autorizado).toBe(false);
    expect(r.ok).toBe(true);
  });
});
