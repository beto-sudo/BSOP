import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Tests para `aplicarAiAlAnalisisFinanciero` (Sprint 4E).
 * Mock separado del de `planos-actions.test.ts` porque el shape de la
 * chain es distinto (no necesita order/limit, sí necesita un select
 * con columnas específicas en proyectos).
 */

let lastPatch: Record<string, unknown> | null = null;
let planoRow: {
  id: string;
  proyecto_id: string;
  ai_analisis: Record<string, unknown> | null;
} | null = null;
let proyectoRow: Record<string, number | null> | null = null;
let updateError: { message: string } | null = null;

vi.mock('next/headers', () => ({
  cookies: async () => ({ getAll: () => [], setAll: () => {} }),
}));

vi.mock('next/cache', () => ({ revalidatePath: () => {} }));

vi.mock('@supabase/ssr', () => ({
  createServerClient: () => ({
    auth: { getUser: async () => ({ data: { user: { email: 'beto@anorte.com' } } }) },
    schema: (_schemaName: string) => ({
      from: (table: string) => {
        if (table === 'proyecto_planos') {
          return {
            select: () => ({
              eq: () => ({
                is: () => ({
                  maybeSingle: async () => ({ data: planoRow, error: null }),
                }),
              }),
            }),
          };
        }
        if (table === 'proyectos') {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: async () => ({ data: proyectoRow, error: null }),
              }),
            }),
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
    }),
  }),
}));

beforeEach(() => {
  lastPatch = null;
  updateError = null;
  planoRow = {
    id: 'plano-1',
    proyecto_id: 'p1',
    ai_analisis: {
      area_total_m2: 50_000,
      area_vendible_m2: 30_000,
      areas_verdes_m2: 5_000,
      area_vialidades_m2: 8_000,
      lotes_proyectados: 150,
      tamano_lote_promedio_m2: 200,
    },
  };
  proyectoRow = {
    area_m2: null,
    area_vendible_m2: null,
    areas_verdes_m2: null,
    area_vialidades_m2: null,
    lotes_proyectados: null,
    tamano_lote_promedio: null,
  };
});

describe('aplicarAiAlAnalisisFinanciero (Sprint 4E)', () => {
  it('rechaza planoId vacío', async () => {
    const { aplicarAiAlAnalisisFinanciero } = await import('./planos-actions');
    const r = await aplicarAiAlAnalisisFinanciero('');
    expect(r.ok).toBe(false);
  });

  it('rechaza plano sin análisis AI todavía', async () => {
    planoRow = { id: 'plano-1', proyecto_id: 'p1', ai_analisis: null };
    const { aplicarAiAlAnalisisFinanciero } = await import('./planos-actions');
    const r = await aplicarAiAlAnalisisFinanciero('plano-1');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/análisis ai/i);
  });

  it('rechaza plano no encontrado', async () => {
    planoRow = null;
    const { aplicarAiAlAnalisisFinanciero } = await import('./planos-actions');
    const r = await aplicarAiAlAnalisisFinanciero('p-bad');
    expect(r.ok).toBe(false);
  });

  it('llena todos los campos cuando proyecto está vacío', async () => {
    const { aplicarAiAlAnalisisFinanciero } = await import('./planos-actions');
    const r = await aplicarAiAlAnalisisFinanciero('plano-1');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.aplicados).toHaveLength(6);
    expect(lastPatch).toEqual({
      area_m2: 50_000,
      area_vendible_m2: 30_000,
      areas_verdes_m2: 5_000,
      area_vialidades_m2: 8_000,
      lotes_proyectados: 150,
      tamano_lote_promedio: 200,
    });
  });

  it('NO machaca valores ya capturados (sin overwrite)', async () => {
    proyectoRow = {
      area_m2: 99_999, // ya capturado
      area_vendible_m2: null,
      areas_verdes_m2: null,
      area_vialidades_m2: null,
      lotes_proyectados: null,
      tamano_lote_promedio: null,
    };
    const { aplicarAiAlAnalisisFinanciero } = await import('./planos-actions');
    const r = await aplicarAiAlAnalisisFinanciero('plano-1');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.aplicados).toHaveLength(5);
    expect((lastPatch as Record<string, unknown>)?.area_m2).toBeUndefined();
    expect((lastPatch as Record<string, unknown>)?.area_vendible_m2).toBe(30_000);
  });

  it('overwrite=true pisa valores existentes', async () => {
    proyectoRow = {
      area_m2: 99_999,
      area_vendible_m2: 88_888,
      areas_verdes_m2: null,
      area_vialidades_m2: null,
      lotes_proyectados: null,
      tamano_lote_promedio: null,
    };
    const { aplicarAiAlAnalisisFinanciero } = await import('./planos-actions');
    const r = await aplicarAiAlAnalisisFinanciero('plano-1', { overwrite: true });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.aplicados).toHaveLength(6);
    expect((lastPatch as Record<string, unknown>)?.area_m2).toBe(50_000);
    expect((lastPatch as Record<string, unknown>)?.area_vendible_m2).toBe(30_000);
  });

  it('campos AI null se saltan', async () => {
    planoRow = {
      id: 'plano-1',
      proyecto_id: 'p1',
      ai_analisis: {
        area_total_m2: 50_000,
        // resto null/undefined
      },
    };
    const { aplicarAiAlAnalisisFinanciero } = await import('./planos-actions');
    const r = await aplicarAiAlAnalisisFinanciero('plano-1');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.aplicados).toEqual(['area_m2']);
    expect((lastPatch as Record<string, unknown>)?.area_m2).toBe(50_000);
  });

  it('cero aplicados cuando todo el proyecto ya está completo', async () => {
    proyectoRow = {
      area_m2: 1,
      area_vendible_m2: 1,
      areas_verdes_m2: 1,
      area_vialidades_m2: 1,
      lotes_proyectados: 1,
      tamano_lote_promedio: 1,
    };
    const { aplicarAiAlAnalisisFinanciero } = await import('./planos-actions');
    const r = await aplicarAiAlAnalisisFinanciero('plano-1');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.aplicados).toHaveLength(0);
    expect(lastPatch).toBeNull(); // no UPDATE disparado
  });

  it('propaga error de DB en UPDATE', async () => {
    updateError = { message: 'RLS denied' };
    const { aplicarAiAlAnalisisFinanciero } = await import('./planos-actions');
    const r = await aplicarAiAlAnalisisFinanciero('plano-1');
    expect(r.ok).toBe(false);
  });
});
