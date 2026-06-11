import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Tests de las server actions del gobierno presupuestal (S2 de
 * `dilesa-presupuesto-baseline`). Mock ligero del cliente Supabase +
 * `checkDireccionEmpresa` — verifican validaciones, gates, propagación de
 * errores de DB/RPC y los payloads que viajan (delta, solicitado_por,
 * guard de estado al cancelar).
 */

// ── State configurable por test ────────────────────────────────────────

let authUser: { id: string; email: string } | null;
let gateResult:
  | { ok: true; autorizado: boolean; authUserId: string; coreUserId: string }
  | { ok: false; error: string };
let proyectoRow: { id: string; empresa_id: string } | null;
let partidaRow: { id: string; empresa_id: string; proyecto_id: string } | null;
let cambioRow: { id: string; empresa_id: string; proyecto_id: string } | null;
let rpcResult: { data: unknown; error: { message: string } | null };
let insertResult: { data: { id: string } | null; error: { message: string } | null };
let updateResult: { data: { proyecto_id: string } | null; error: { message: string } | null };

let capturado: {
  insertPayload?: Record<string, unknown>;
  updatePatch?: Record<string, unknown>;
  updateFilters?: Array<[string, unknown]>;
  rpcName?: string;
  rpcArgs?: Record<string, unknown>;
};

vi.mock('next/headers', () => ({
  cookies: async () => ({ getAll: () => [], setAll: () => {} }),
}));
vi.mock('next/cache', () => ({ revalidatePath: () => {} }));
vi.mock('@/lib/auth/direccion-gate', () => ({
  checkDireccionEmpresa: async () => gateResult,
}));

vi.mock('@supabase/ssr', () => ({
  createServerClient: () => ({
    auth: {
      getUser: async () => ({
        data: { user: authUser },
        error: null,
      }),
    },
    schema: (schemaName: string) => ({
      rpc: async (name: string, args: Record<string, unknown>) => {
        capturado.rpcName = name;
        capturado.rpcArgs = args;
        return rpcResult;
      },
      from: (table: string) => {
        if (schemaName === 'dilesa' && table === 'proyectos') {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: async () => ({ data: proyectoRow, error: null }),
              }),
            }),
          };
        }
        if (schemaName === 'erp' && table === 'presupuesto_partidas') {
          return {
            select: () => ({
              eq: () => ({
                is: () => ({
                  maybeSingle: async () => ({ data: partidaRow, error: null }),
                }),
              }),
            }),
          };
        }
        if (schemaName === 'erp' && table === 'presupuesto_cambios') {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: async () => ({ data: cambioRow, error: null }),
              }),
            }),
            insert: (payload: Record<string, unknown>) => {
              capturado.insertPayload = payload;
              return {
                select: () => ({
                  single: async () => insertResult,
                }),
              };
            },
            update: (patch: Record<string, unknown>) => {
              capturado.updatePatch = patch;
              const filters: Array<[string, unknown]> = [];
              capturado.updateFilters = filters;
              const chain = {
                eq: (col: string, val: unknown) => {
                  filters.push([col, val]);
                  return chain;
                },
                select: () => ({
                  maybeSingle: async () => updateResult,
                }),
              };
              return chain;
            },
          };
        }
        throw new Error(`tabla inesperada: ${schemaName}.${table}`);
      },
    }),
  }),
}));

import { autorizarBaseline, cancelarCambio, resolverCambio, solicitarCambio } from './actions';

beforeEach(() => {
  authUser = { id: 'auth-1', email: 'beto@anorte.com' };
  gateResult = { ok: true, autorizado: true, authUserId: 'auth-1', coreUserId: 'auth-1' };
  proyectoRow = { id: 'proy-1', empresa_id: 'emp-1' };
  partidaRow = { id: 'pa-1', empresa_id: 'emp-1', proyecto_id: 'proy-1' };
  cambioRow = { id: 'cam-1', empresa_id: 'emp-1', proyecto_id: 'proy-1' };
  rpcResult = { data: 'baseline-1', error: null };
  insertResult = { data: { id: 'cam-1' }, error: null };
  updateResult = { data: { proyecto_id: 'proy-1' }, error: null };
  capturado = {};
});

// ── autorizarBaseline ──────────────────────────────────────────────────

describe('autorizarBaseline', () => {
  it('requiere proyectoId', async () => {
    const r = await autorizarBaseline('');
    expect(r.ok).toBe(false);
  });

  it('falla si el proyecto no existe', async () => {
    proyectoRow = null;
    const r = await autorizarBaseline('proy-x');
    expect(r).toEqual({ ok: false, error: 'Proyecto no encontrado' });
  });

  it('gate: rechaza sin rol Dirección', async () => {
    gateResult = { ok: true, autorizado: false, authUserId: 'a', coreUserId: 'c' };
    const r = await autorizarBaseline('proy-1');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/Dirección/);
    expect(capturado.rpcName).toBeUndefined();
  });

  it('propaga el error de la RPC', async () => {
    rpcResult = { data: null, error: { message: 'Hay 2 partida(s) en estado preliminar' } };
    const r = await autorizarBaseline('proy-1');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/preliminar/);
  });

  it('éxito: invoca la RPC con notas normalizadas y devuelve baselineId', async () => {
    const r = await autorizarBaseline('proy-1', '  aprobado en junta  ');
    expect(r).toEqual({ ok: true, baselineId: 'baseline-1' });
    expect(capturado.rpcName).toBe('fn_presupuesto_baseline_autorizar');
    expect(capturado.rpcArgs).toEqual({
      p_proyecto_id: 'proy-1',
      p_notas: 'aprobado en junta',
    });
  });
});

// ── solicitarCambio ────────────────────────────────────────────────────

const inputBase = {
  proyectoId: 'proy-1',
  partidaId: 'pa-1',
  tipo: 'aditiva' as const,
  monto: 1500,
  categoria: 'alcance' as const,
  motivo: 'ampliación de red',
};

describe('solicitarCambio', () => {
  it('valida tipo', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r = await solicitarCambio({ ...inputBase, tipo: 'x' as any });
    expect(r.ok).toBe(false);
  });

  it('valida monto > 0 y finito', async () => {
    expect((await solicitarCambio({ ...inputBase, monto: 0 })).ok).toBe(false);
    expect((await solicitarCambio({ ...inputBase, monto: -5 })).ok).toBe(false);
    expect((await solicitarCambio({ ...inputBase, monto: NaN })).ok).toBe(false);
  });

  it('valida categoría y motivo obligatorio', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((await solicitarCambio({ ...inputBase, categoria: 'zzz' as any })).ok).toBe(false);
    expect((await solicitarCambio({ ...inputBase, motivo: '   ' })).ok).toBe(false);
  });

  it('rechaza partida de otro proyecto', async () => {
    partidaRow = { id: 'pa-1', empresa_id: 'emp-1', proyecto_id: 'OTRO' };
    const r = await solicitarCambio(inputBase);
    expect(r.ok).toBe(false);
  });

  it('éxito: inserta con solicitado_por del auth user y motivo trimmeado', async () => {
    const r = await solicitarCambio({ ...inputBase, motivo: '  ampliación  ' });
    expect(r).toEqual({ ok: true, cambioId: 'cam-1' });
    expect(capturado.insertPayload).toMatchObject({
      empresa_id: 'emp-1',
      proyecto_id: 'proy-1',
      partida_id: 'pa-1',
      tipo: 'aditiva',
      monto_delta: 1500,
      motivo_categoria: 'alcance',
      motivo: 'ampliación',
      solicitado_por: 'auth-1',
    });
  });

  it('propaga el error del INSERT (p. ej. trigger sin baseline)', async () => {
    insertResult = {
      data: null,
      error: { message: 'El proyecto aún no tiene presupuesto inicial autorizado' },
    };
    const r = await solicitarCambio(inputBase);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/baseline|inicial/);
  });
});

// ── resolverCambio ─────────────────────────────────────────────────────

describe('resolverCambio', () => {
  it('valida decisión', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r = await resolverCambio('cam-1', 'x' as any);
    expect(r.ok).toBe(false);
  });

  it('rechazo exige motivo', async () => {
    const r = await resolverCambio('cam-1', 'rechazada', '  ');
    expect(r.ok).toBe(false);
  });

  it('gate: solo Dirección resuelve', async () => {
    gateResult = { ok: true, autorizado: false, authUserId: 'a', coreUserId: 'c' };
    const r = await resolverCambio('cam-1', 'autorizada');
    expect(r.ok).toBe(false);
    expect(capturado.rpcName).toBeUndefined();
  });

  it('éxito: invoca la RPC con la decisión', async () => {
    rpcResult = { data: { estado: 'autorizada' }, error: null };
    const r = await resolverCambio('cam-1', 'autorizada');
    expect(r).toEqual({ ok: true });
    expect(capturado.rpcName).toBe('fn_presupuesto_cambio_resolver');
    expect(capturado.rpcArgs).toMatchObject({
      p_cambio_id: 'cam-1',
      p_decision: 'autorizada',
      p_motivo_rechazo: null,
    });
  });

  it('propaga error de la RPC (p. ej. deductiva deja negativo)', async () => {
    rpcResult = { data: null, error: { message: 'dejaría la partida en negativo' } };
    const r = await resolverCambio('cam-1', 'autorizada');
    expect(r.ok).toBe(false);
  });
});

// ── cancelarCambio ─────────────────────────────────────────────────────

describe('cancelarCambio', () => {
  it('requiere autenticación', async () => {
    authUser = null;
    const r = await cancelarCambio('cam-1');
    expect(r).toEqual({ ok: false, error: 'No autenticado' });
  });

  it('éxito: marca cancelada con guard de estado solicitada', async () => {
    const r = await cancelarCambio('cam-1');
    expect(r).toEqual({ ok: true });
    expect(capturado.updatePatch).toMatchObject({
      estado: 'cancelada',
      cancelada_por: 'auth-1',
    });
    expect(capturado.updateFilters).toEqual([
      ['id', 'cam-1'],
      ['estado', 'solicitada'],
    ]);
  });

  it('reporta si la orden ya no está solicitada', async () => {
    updateResult = { data: null, error: null };
    const r = await cancelarCambio('cam-1');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/solicitada/);
  });
});
