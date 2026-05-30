import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Tests para `planos-actions.ts` (Sprint 4D). Mock ligero del cliente
 * Supabase — cubre validaciones, normalización y flujo "fetch +
 * incrementar versión" del crear.
 */

let lastTable: string | null = null;
let lastSchema: string | null = null;
let lastPatch: Record<string, unknown> | null = null;
let lastInsertRow: Record<string, unknown> | null = null;
let lastRpcName: string | null = null;
let lastRpcParams: Record<string, unknown> | null = null;
let updateError: { message: string } | null = null;
let insertError: { message: string } | null = null;
let rpcError: { message: string } | null = null;

let proyectoRow: { id: string; empresa_id: string } | null = {
  id: 'p1',
  empresa_id: 'e-dilesa',
};
let proyectoError: { message: string } | null = null;
let maxVersionRow: { version: number } | null = null;
let maxVersionError: { message: string } | null = null;
let coreUserRow: { id: string } | null = { id: 'user-1' };
let insertReturn: { id: string; version: number } = { id: 'plano-new', version: 1 };

vi.mock('next/headers', () => ({
  cookies: async () => ({
    getAll: () => [],
    setAll: () => {},
  }),
}));

vi.mock('next/cache', () => ({
  revalidatePath: () => {},
}));

vi.mock('@supabase/ssr', () => ({
  createServerClient: () => ({
    auth: {
      getUser: async () => ({ data: { user: { email: 'beto@anorte.com' } } }),
    },
    schema: (schemaName: string) => ({
      from: (table: string) => {
        lastSchema = schemaName;
        lastTable = table;
        if (schemaName === 'dilesa' && table === 'proyectos') {
          return {
            select: () => ({
              eq: () => ({
                is: () => ({
                  maybeSingle: async () => ({ data: proyectoRow, error: proyectoError }),
                }),
              }),
            }),
          };
        }
        if (schemaName === 'core' && table === 'usuarios') {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: async () => ({ data: coreUserRow, error: null }),
              }),
            }),
          };
        }
        // proyecto_planos: select+insert+update
        if (schemaName === 'dilesa' && table === 'proyecto_planos') {
          return {
            select: () => ({
              eq: () => ({
                is: () => ({
                  order: () => ({
                    limit: () => ({
                      maybeSingle: async () => ({
                        data: maxVersionRow,
                        error: maxVersionError,
                      }),
                    }),
                  }),
                }),
              }),
            }),
            insert: (row: Record<string, unknown>) => {
              lastInsertRow = row;
              return {
                select: () => ({
                  single: async () => ({
                    data: insertError ? null : insertReturn,
                    error: insertError,
                  }),
                }),
              };
            },
            update: (patch: Record<string, unknown>) => {
              lastPatch = patch;
              return {
                eq: () => Promise.resolve({ error: updateError }),
              };
            },
          };
        }
        return {};
      },
      rpc: async (name: string, params: Record<string, unknown>) => {
        lastRpcName = name;
        lastRpcParams = params;
        return { data: null, error: rpcError };
      },
    }),
  }),
}));

beforeEach(() => {
  lastTable = null;
  lastSchema = null;
  lastPatch = null;
  lastInsertRow = null;
  lastRpcName = null;
  lastRpcParams = null;
  updateError = null;
  insertError = null;
  rpcError = null;
  proyectoRow = { id: 'p1', empresa_id: 'e-dilesa' };
  proyectoError = null;
  maxVersionRow = null;
  maxVersionError = null;
  coreUserRow = { id: 'user-1' };
  insertReturn = { id: 'plano-new', version: 1 };
});

describe('crearPlanoVersion (Sprint 4D)', () => {
  it('rechaza proyectoId vacío', async () => {
    const { crearPlanoVersion } = await import('./planos-actions');
    const r = await crearPlanoVersion('', null);
    expect(r.ok).toBe(false);
  });

  it('rechaza proyecto inexistente', async () => {
    proyectoRow = null;
    const { crearPlanoVersion } = await import('./planos-actions');
    const r = await crearPlanoVersion('p-bad', null);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/no encontrado/i);
  });

  it('primera versión arranca en 1', async () => {
    maxVersionRow = null; // sin versiones previas
    insertReturn = { id: 'plano-1', version: 1 };
    const { crearPlanoVersion } = await import('./planos-actions');
    const r = await crearPlanoVersion('p1', 'V1 inicial');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.version).toBe(1);
    expect(lastInsertRow?.version).toBe(1);
    expect(lastInsertRow?.proyecto_id).toBe('p1');
    expect(lastInsertRow?.empresa_id).toBe('e-dilesa');
    expect(lastInsertRow?.vigente).toBe(false);
    expect(lastInsertRow?.descripcion).toBe('V1 inicial');
  });

  it('siguiente versión incrementa el max actual', async () => {
    maxVersionRow = { version: 7 };
    insertReturn = { id: 'plano-8', version: 8 };
    const { crearPlanoVersion } = await import('./planos-actions');
    const r = await crearPlanoVersion('p1', null);
    expect(r.ok).toBe(true);
    expect(lastInsertRow?.version).toBe(8);
    expect(lastInsertRow?.descripcion).toBeNull();
  });

  it('descripción vacía/whitespace → null en DB', async () => {
    const { crearPlanoVersion } = await import('./planos-actions');
    await crearPlanoVersion('p1', '   ');
    expect(lastInsertRow?.descripcion).toBeNull();
  });

  it('descripción >500 chars se trunca', async () => {
    const { crearPlanoVersion } = await import('./planos-actions');
    await crearPlanoVersion('p1', 'X'.repeat(600));
    expect((lastInsertRow?.descripcion as string).length).toBe(500);
  });

  it('propaga error de DB en INSERT', async () => {
    insertError = { message: 'unique conflict version' };
    const { crearPlanoVersion } = await import('./planos-actions');
    const r = await crearPlanoVersion('p1', null);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/conflict/i);
  });
});

describe('marcarPlanoVigente (Sprint 4D)', () => {
  it('rechaza planoId vacío', async () => {
    const { marcarPlanoVigente } = await import('./planos-actions');
    const r = await marcarPlanoVigente('');
    expect(r.ok).toBe(false);
  });

  it('llama la RPC con el id correcto', async () => {
    const { marcarPlanoVigente } = await import('./planos-actions');
    const r = await marcarPlanoVigente('plano-3');
    expect(r.ok).toBe(true);
    expect(lastRpcName).toBe('fn_marcar_plano_vigente');
    expect(lastRpcParams?.p_plano_id).toBe('plano-3');
  });

  it('propaga error de la RPC', async () => {
    rpcError = { message: 'Plano X no encontrado' };
    const { marcarPlanoVigente } = await import('./planos-actions');
    const r = await marcarPlanoVigente('plano-bad');
    expect(r.ok).toBe(false);
  });
});

describe('actualizarPlanoDescripcion (Sprint 4D)', () => {
  it('rechaza planoId vacío', async () => {
    const { actualizarPlanoDescripcion } = await import('./planos-actions');
    const r = await actualizarPlanoDescripcion('', 'X');
    expect(r.ok).toBe(false);
  });

  it('trim + truncate >500', async () => {
    const { actualizarPlanoDescripcion } = await import('./planos-actions');
    await actualizarPlanoDescripcion('p1', '  ' + 'X'.repeat(600) + '  ');
    expect((lastPatch?.descripcion as string).length).toBe(500);
  });

  it('descripción vacía → null', async () => {
    const { actualizarPlanoDescripcion } = await import('./planos-actions');
    await actualizarPlanoDescripcion('p1', '   ');
    expect(lastPatch?.descripcion).toBeNull();
  });

  it('persiste descripción válida', async () => {
    const { actualizarPlanoDescripcion } = await import('./planos-actions');
    const r = await actualizarPlanoDescripcion('p1', 'V2: ajuste áreas verdes');
    expect(r.ok).toBe(true);
    expect(lastPatch?.descripcion).toBe('V2: ajuste áreas verdes');
    expect(lastPatch?.updated_at).toBeDefined();
  });
});

describe('eliminarPlanoVersion (Sprint 4D)', () => {
  it('rechaza planoId vacío', async () => {
    const { eliminarPlanoVersion } = await import('./planos-actions');
    const r = await eliminarPlanoVersion('');
    expect(r.ok).toBe(false);
  });

  it('soft-delete con deleted_at + vigente=false', async () => {
    const { eliminarPlanoVersion } = await import('./planos-actions');
    const r = await eliminarPlanoVersion('p-1');
    expect(r.ok).toBe(true);
    expect(lastPatch?.deleted_at).toBeDefined();
    expect(lastPatch?.vigente).toBe(false);
  });

  it('propaga error de DB', async () => {
    updateError = { message: 'RLS denied' };
    const { eliminarPlanoVersion } = await import('./planos-actions');
    const r = await eliminarPlanoVersion('p-1');
    expect(r.ok).toBe(false);
  });
});
