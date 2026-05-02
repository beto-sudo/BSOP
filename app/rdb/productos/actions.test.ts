import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Tests para `app/rdb/productos/actions.ts` (Server Actions).
 *
 * Sprint 3B de tech-debt-h1-2026 — fortifica `upsertReceta` y
 * `updateCategoria`. La receta define el costo de venta de un
 * producto: bug ahí bloquea reportes financieros. Sin tests, una
 * regresión podría:
 *
 *   - Permitir self-reference (A→A) que rompe el cálculo de costo.
 *   - Insertar receta con cantidades inválidas (≤ 0).
 *   - Linkear insumos de otras empresas (RLS/RBAC bypass).
 *   - Asignar categoría de otra empresa al producto.
 *
 * Patrón canónico del repo: mocks inline de `supabase-server` +
 * `assertNotInPreview`. La chain del cliente Supabase se mockea con un
 * builder fluent que captura `(schema, table, op)` y resuelve según
 * fixtures definidos por test.
 *
 * Gap conocido (no cubierto en este sprint, anotado en bitácora):
 * detección de **ciclo indirecto** (A→B→A) NO está implementada en el
 * código fuente. El test "self-reference" cubre solo ciclo directo.
 */

// ── State del test ─────────────────────────────────────────────────────

let serverUser: { email: string } | null = null;
let preventInPreview = false;
let validInsumos: { id: string }[] = [];
let validInsumosError: { message: string } | null = null;
let categoriaResult: { id: string } | null = null;
let categoriaError: { message: string } | null = null;
let deleteRecetaError: { message: string } | null = null;
let insertRecetaError: { message: string } | null = null;
let updateProductoError: { message: string } | null = null;

// Captura de las llamadas que hizo el test, para verificaciones.
let capturedCalls: Array<{
  schema: string;
  table: string;
  op: string;
  filters: Record<string, unknown>;
  payload?: unknown;
}> = [];

// ── Mocks ──────────────────────────────────────────────────────────────

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}));

vi.mock('@/lib/auth/preview-guard', () => ({
  assertNotInPreview: async () => {
    if (preventInPreview) throw new Error('Mutation bloqueada en preview');
  },
}));

/* eslint-disable @typescript-eslint/no-explicit-any -- test doubles */
function buildSupabaseMock(): any {
  return {
    auth: {
      getUser: async () => ({ data: { user: serverUser } }),
    },
    schema(schemaName: string) {
      return {
        from(tableName: string) {
          const filters: Record<string, unknown> = {};
          let pendingPayload: unknown = null;
          let currentOp = '';

          const builder: any = {
            select(_cols: string) {
              currentOp = currentOp || 'select';
              return builder;
            },
            insert(rows: unknown) {
              currentOp = 'insert';
              pendingPayload = rows;
              capturedCalls.push({
                schema: schemaName,
                table: tableName,
                op: 'insert',
                filters: { ...filters },
                payload: rows,
              });
              return {
                then(onFulfilled: (r: { error: unknown }) => unknown) {
                  return Promise.resolve({
                    error:
                      schemaName === 'erp' && tableName === 'producto_receta'
                        ? insertRecetaError
                        : null,
                  }).then(onFulfilled);
                },
              };
            },
            update(payload: unknown) {
              currentOp = 'update';
              pendingPayload = payload;
              return builder;
            },
            delete() {
              currentOp = 'delete';
              return builder;
            },
            in(col: string, vals: unknown[]) {
              filters[col] = vals;
              return builder;
            },
            eq(col: string, val: unknown) {
              filters[col] = val;
              return builder;
            },
            async maybeSingle() {
              capturedCalls.push({
                schema: schemaName,
                table: tableName,
                op: 'select-maybeSingle',
                filters: { ...filters },
              });
              if (schemaName === 'erp' && tableName === 'categorias_producto') {
                return { data: categoriaResult, error: categoriaError };
              }
              return { data: null, error: null };
            },
            then(onFulfilled: (r: { data: unknown; error: unknown }) => unknown) {
              capturedCalls.push({
                schema: schemaName,
                table: tableName,
                op: currentOp || 'select',
                filters: { ...filters },
                payload: pendingPayload,
              });
              if (currentOp === 'select') {
                if (schemaName === 'erp' && tableName === 'productos') {
                  return Promise.resolve({
                    data: validInsumos,
                    error: validInsumosError,
                  }).then(onFulfilled);
                }
              }
              if (currentOp === 'delete') {
                if (schemaName === 'erp' && tableName === 'producto_receta') {
                  return Promise.resolve({
                    data: null,
                    error: deleteRecetaError,
                  }).then(onFulfilled);
                }
              }
              if (currentOp === 'update') {
                if (schemaName === 'erp' && tableName === 'productos') {
                  return Promise.resolve({
                    data: null,
                    error: updateProductoError,
                  }).then(onFulfilled);
                }
              }
              return Promise.resolve({ data: null, error: null }).then(onFulfilled);
            },
          };
          return builder;
        },
      };
    },
  };
}

vi.mock('@/lib/supabase-server', () => ({
  createSupabaseServerClient: async () => buildSupabaseMock(),
}));

// ── Test ───────────────────────────────────────────────────────────────

import { upsertReceta, updateCategoria } from './actions';

beforeEach(() => {
  serverUser = { email: 'admin@example.com' };
  preventInPreview = false;
  validInsumos = [];
  validInsumosError = null;
  categoriaResult = null;
  categoriaError = null;
  deleteRecetaError = null;
  insertRecetaError = null;
  updateProductoError = null;
  capturedCalls = [];
});

// ─────────────────────────────────────────────────────────────────────
// upsertReceta
// ─────────────────────────────────────────────────────────────────────

describe('upsertReceta', () => {
  it('falla con "No autenticado" si no hay user en JWT', async () => {
    serverUser = null;
    const res = await upsertReceta({
      producto_venta_id: 'p1',
      insumos: [{ insumo_id: 'i1', cantidad: 1, unidad: 'kg' }],
    });
    expect(res).toEqual({ ok: false, error: 'No autenticado.' });
  });

  it('falla si cantidad ≤ 0', async () => {
    const res = await upsertReceta({
      producto_venta_id: 'p1',
      insumos: [{ insumo_id: 'i1', cantidad: 0, unidad: 'kg' }],
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/cantidad.*inv[áa]lida/i);
  });

  it('falla si cantidad es negativa', async () => {
    const res = await upsertReceta({
      producto_venta_id: 'p1',
      insumos: [{ insumo_id: 'i1', cantidad: -5, unidad: 'kg' }],
    });
    expect(res.ok).toBe(false);
  });

  it('falla si cantidad es NaN o Infinity', async () => {
    const r1 = await upsertReceta({
      producto_venta_id: 'p1',
      insumos: [{ insumo_id: 'i1', cantidad: NaN, unidad: 'kg' }],
    });
    expect(r1.ok).toBe(false);
    const r2 = await upsertReceta({
      producto_venta_id: 'p1',
      insumos: [{ insumo_id: 'i1', cantidad: Infinity, unidad: 'kg' }],
    });
    expect(r2.ok).toBe(false);
  });

  it('falla si insumo_id está vacío', async () => {
    const res = await upsertReceta({
      producto_venta_id: 'p1',
      insumos: [{ insumo_id: '', cantidad: 1, unidad: 'kg' }],
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/insumo sin id/i);
  });

  it('falla con self-reference (ciclo directo A→A)', async () => {
    const res = await upsertReceta({
      producto_venta_id: 'p1',
      insumos: [{ insumo_id: 'p1', cantidad: 1, unidad: 'kg' }],
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/insumo de s[ií] mismo/i);
  });

  it('falla si insumo no es inventariable o no pertenece a RDB', async () => {
    // Validación: pedimos 2 insumos pero la query devuelve solo 1.
    validInsumos = [{ id: 'i1' }];
    const res = await upsertReceta({
      producto_venta_id: 'p1',
      insumos: [
        { insumo_id: 'i1', cantidad: 1, unidad: 'kg' },
        { insumo_id: 'i2', cantidad: 2, unidad: 'kg' },
      ],
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/inventariables.*RDB|RDB.*inventariables/i);
  });

  it('falla si la query de validación de insumos lanza error', async () => {
    validInsumosError = { message: 'connection lost' };
    const res = await upsertReceta({
      producto_venta_id: 'p1',
      insumos: [{ insumo_id: 'i1', cantidad: 1, unidad: 'kg' }],
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/Error validando insumos/i);
  });

  it('falla si DELETE de receta previa lanza error', async () => {
    validInsumos = [{ id: 'i1' }];
    deleteRecetaError = { message: 'rls violation' };
    const res = await upsertReceta({
      producto_venta_id: 'p1',
      insumos: [{ insumo_id: 'i1', cantidad: 1, unidad: 'kg' }],
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/Error borrando receta/i);
  });

  it('falla si INSERT de receta nueva lanza error', async () => {
    validInsumos = [{ id: 'i1' }];
    insertRecetaError = { message: 'check constraint' };
    const res = await upsertReceta({
      producto_venta_id: 'p1',
      insumos: [{ insumo_id: 'i1', cantidad: 1, unidad: 'kg' }],
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/Error guardando receta/i);
  });

  it('success con insumos válidos: borra previa e inserta nueva', async () => {
    validInsumos = [{ id: 'i1' }, { id: 'i2' }];
    const res = await upsertReceta({
      producto_venta_id: 'p1',
      insumos: [
        { insumo_id: 'i1', cantidad: 2, unidad: 'kg' },
        { insumo_id: 'i2', cantidad: 0.5, unidad: 'L' },
      ],
    });
    expect(res).toEqual({ ok: true });
    // Se ejecutó el DELETE.
    expect(capturedCalls.some((c) => c.op === 'delete' && c.table === 'producto_receta')).toBe(
      true
    );
    // Se ejecutó el INSERT con los insumos.
    const insertCall = capturedCalls.find(
      (c) => c.op === 'insert' && c.table === 'producto_receta'
    );
    expect(insertCall).toBeDefined();
    expect(insertCall?.payload).toMatchObject([
      { producto_venta_id: 'p1', insumo_id: 'i1', cantidad: 2, unidad: 'kg' },
      { producto_venta_id: 'p1', insumo_id: 'i2', cantidad: 0.5, unidad: 'L' },
    ]);
  });

  it('success con insumos vacíos: solo borra (sin insert)', async () => {
    const res = await upsertReceta({
      producto_venta_id: 'p1',
      insumos: [],
    });
    expect(res).toEqual({ ok: true });
    // DELETE sí, INSERT no.
    expect(capturedCalls.some((c) => c.op === 'delete' && c.table === 'producto_receta')).toBe(
      true
    );
    expect(capturedCalls.some((c) => c.op === 'insert' && c.table === 'producto_receta')).toBe(
      false
    );
  });

  it('lanza si está en preview (assertNotInPreview)', async () => {
    preventInPreview = true;
    await expect(
      upsertReceta({
        producto_venta_id: 'p1',
        insumos: [{ insumo_id: 'i1', cantidad: 1, unidad: 'kg' }],
      })
    ).rejects.toThrow(/preview/i);
  });
});

// ─────────────────────────────────────────────────────────────────────
// updateCategoria
// ─────────────────────────────────────────────────────────────────────

describe('updateCategoria', () => {
  it('falla con "No autenticado" si no hay user', async () => {
    serverUser = null;
    const res = await updateCategoria({ producto_id: 'p1', categoria_id: 'c1' });
    expect(res).toEqual({ ok: false, error: 'No autenticado.' });
  });

  it('falla si la categoría no pertenece a RDB', async () => {
    categoriaResult = null; // maybeSingle devuelve null = no encontrada
    const res = await updateCategoria({ producto_id: 'p1', categoria_id: 'c-otra-empresa' });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/Categor[ií]a no pertenece/i);
  });

  it('success al limpiar categoría (categoria_id=null no requiere validación)', async () => {
    const res = await updateCategoria({ producto_id: 'p1', categoria_id: null });
    expect(res).toEqual({ ok: true });
    // Se hizo update con categoria_id: null.
    const updateCall = capturedCalls.find((c) => c.op === 'update' && c.table === 'productos');
    expect(updateCall).toBeDefined();
  });

  it('success con categoría válida de RDB', async () => {
    categoriaResult = { id: 'c1' };
    const res = await updateCategoria({ producto_id: 'p1', categoria_id: 'c1' });
    expect(res).toEqual({ ok: true });
  });

  it('falla si UPDATE del producto lanza error', async () => {
    categoriaResult = { id: 'c1' };
    updateProductoError = { message: 'rls violation' };
    const res = await updateCategoria({ producto_id: 'p1', categoria_id: 'c1' });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toBe('rls violation');
  });

  it('lanza si está en preview', async () => {
    preventInPreview = true;
    await expect(updateCategoria({ producto_id: 'p1', categoria_id: null })).rejects.toThrow(
      /preview/i
    );
  });
});
