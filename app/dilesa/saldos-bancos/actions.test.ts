import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Tests para `app/dilesa/saldos-bancos/actions.ts` (iniciativa `tesoreria`,
 * Sprint 3). Cubre la capa TS de `capturarSaldo`:
 *   - Bloqueo en preview.
 *   - Validaciones (cuenta, fecha, saldo numérico).
 *   - Resolución del usuario autenticado → `capturado_por`.
 *   - Payload del INSERT a `erp.cuenta_saldos` (empresa fija DILESA, notas
 *     normalizadas a null).
 *   - Propagación de errores de Supabase.
 */

// ── State del test ─────────────────────────────────────────────────────────

let preventInPreview = false;
let user: { id: string } | null = { id: 'user-1' };
let insertError: { message: string } | null = null;
let lastInsertPayload: Record<string, unknown> | null = null;
let lastInsertTable: string | null = null;
let lastSchema: string | null = null;

// ── Mocks ──────────────────────────────────────────────────────────────────

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}));

vi.mock('@/lib/auth/preview-guard', () => ({
  assertNotInPreview: async () => {
    if (preventInPreview) throw new Error('Mutation bloqueada en preview');
  },
}));

vi.mock('@/lib/empresa-constants', () => ({
  DILESA_EMPRESA_ID: 'dilesa-empresa-id',
}));

/* eslint-disable @typescript-eslint/no-explicit-any -- test doubles */
vi.mock('@/lib/supabase-server', () => ({
  createSupabaseServerClient: async (): Promise<any> => ({
    auth: {
      getUser: async () => ({ data: { user } }),
    },
    schema(schemaName: string) {
      lastSchema = schemaName;
      return {
        from(tableName: string) {
          return {
            insert(payload: Record<string, unknown>) {
              lastInsertTable = tableName;
              lastInsertPayload = payload;
              return Promise.resolve({ error: insertError });
            },
          };
        },
      };
    },
  }),
}));

import { capturarSaldo } from './actions';

beforeEach(() => {
  preventInPreview = false;
  user = { id: 'user-1' };
  insertError = null;
  lastInsertPayload = null;
  lastInsertTable = null;
  lastSchema = null;
});

const validInput = {
  cuentaId: 'cuenta-1',
  fecha: '2026-06-07',
  saldo: '12345.67',
  notas: 'Corte del día',
};

describe('capturarSaldo', () => {
  it('bloquea cuando hay preview activo', async () => {
    preventInPreview = true;
    await expect(capturarSaldo(validInput)).rejects.toThrow('Mutation bloqueada en preview');
  });

  it('inserta en erp.cuenta_saldos con empresa DILESA y capturado_por del usuario', async () => {
    const res = await capturarSaldo(validInput);
    expect(res.ok).toBe(true);
    expect(lastSchema).toBe('erp');
    expect(lastInsertTable).toBe('cuenta_saldos');
    expect(lastInsertPayload).toMatchObject({
      empresa_id: 'dilesa-empresa-id',
      cuenta_id: 'cuenta-1',
      fecha: '2026-06-07',
      saldo: 12345.67,
      capturado_por: 'user-1',
      notas: 'Corte del día',
    });
    // saldo debe ir como number, no como string.
    expect(typeof (lastInsertPayload as Record<string, unknown>).saldo).toBe('number');
  });

  it('normaliza notas vacías a null', async () => {
    const res = await capturarSaldo({ ...validInput, notas: '   ' });
    expect(res.ok).toBe(true);
    expect((lastInsertPayload as Record<string, unknown>).notas).toBeNull();
  });

  it('rechaza cuenta faltante', async () => {
    const res = await capturarSaldo({ ...validInput, cuentaId: '  ' });
    expect(res).toEqual({ ok: false, error: 'Falta la cuenta a capturar.' });
    expect(lastInsertPayload).toBeNull();
  });

  it('rechaza fecha faltante', async () => {
    const res = await capturarSaldo({ ...validInput, fecha: '' });
    expect(res).toEqual({ ok: false, error: 'Indica la fecha del saldo.' });
  });

  it('rechaza saldo no numérico', async () => {
    const res = await capturarSaldo({ ...validInput, saldo: 'abc' });
    expect(res).toEqual({ ok: false, error: 'El saldo debe ser un número válido.' });
    expect(lastInsertPayload).toBeNull();
  });

  it('rechaza cuando no hay usuario autenticado', async () => {
    user = null;
    const res = await capturarSaldo(validInput);
    expect(res).toEqual({ ok: false, error: 'No autenticado. Vuelve a iniciar sesión.' });
  });

  it('propaga el error de Supabase con mensaje amigable', async () => {
    insertError = { message: 'duplicate key' };
    const res = await capturarSaldo(validInput);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toContain('duplicate key');
  });
});
