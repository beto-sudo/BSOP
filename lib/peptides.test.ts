import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getPeptidesData } from './peptides';
import { getSupabaseAdminClient } from './supabase-admin';

vi.mock('./supabase-admin', () => ({ getSupabaseAdminClient: vi.fn() }));

type Canned = Record<string, { data: unknown[] | null; error: { message: string } | null }>;

function fakeClient(byTable: Canned) {
  return {
    schema: () => ({
      from: (t: string) => ({
        select: () => ({
          order: () => Promise.resolve(byTable[t] ?? { data: [], error: null }),
        }),
      }),
    }),
  };
}

const mockAdmin = (value: unknown) =>
  vi
    .mocked(getSupabaseAdminClient)
    .mockReturnValue(value as ReturnType<typeof getSupabaseAdminClient>);

describe('getPeptidesData', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns empty with error when service role is not configured', async () => {
    mockAdmin(null);
    const data = await getPeptidesData();
    expect(data.tests).toEqual([]);
    expect(data.vendors).toEqual([]);
    expect(data.errors.length).toBeGreaterThan(0);
  });

  it('coerces numeric strings, computes asOf and links shape', async () => {
    mockAdmin(
      fakeClient({
        peptidos: { data: [{ id: 'p1', nombre: 'Retatrutide', aliases: null }], error: null },
        vendors: {
          data: [
            {
              id: 'v1',
              codigo: 'ACR',
              nombre: 'Aavant',
              estado: 'activo',
              precio_mg: '0.70',
              precio_mg_sale: '0.60',
              imported_at: '2026-06-04T00:00:00Z',
            },
          ],
          error: null,
        },
        tests: {
          data: [
            {
              id: 't1',
              peptido: 'Retatrutide',
              vendor_codigo: 'ACR',
              purity_pct: '99.5',
              mass_mg: '10.2',
              expected_mass_mg: '10',
            },
          ],
          error: null,
        },
        insumos: {
          data: [{ id: 'i1', proveedor: 'West End', url: null, productos: 'vials' }],
          error: null,
        },
        notas: { data: [], error: null },
      })
    );

    const data = await getPeptidesData();

    expect(data.errors).toEqual([]);
    expect(data.peptidos).toHaveLength(1);
    // numéricos llegan como string desde PostgREST → se coercionan a number
    expect(data.vendors[0].precio_mg).toBe(0.7);
    expect(data.tests[0].purity_pct).toBe(99.5);
    expect(data.tests[0].mass_mg).toBe(10.2);
    expect(data.asOf).toBe('2026-06-04T00:00:00Z');
  });

  it('collects per-table errors without throwing', async () => {
    mockAdmin(
      fakeClient({
        peptidos: { data: [], error: null },
        vendors: { data: null, error: { message: 'boom vendors' } },
        tests: { data: [], error: null },
        insumos: { data: [], error: null },
        notas: { data: [], error: null },
      })
    );

    const data = await getPeptidesData();
    expect(data.errors.length).toBeGreaterThan(0);
    expect(data.vendors).toEqual([]);
  });
});
