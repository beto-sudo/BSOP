import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Tests para `app/rdb/cortes/actions.ts` (Server Actions).
 *
 * Sprint 3C de tech-debt-h1-2026 — fortifica el flujo financiero de
 * Cortes (efectivo en caja, vouchers de terminal, conciliación). Este
 * es el archivo MÁS hot del repo (9 cambios en 6 meses) y maneja dinero
 * real. Sin tests, regresiones podrían:
 *
 *   - Permitir 2 turnos abiertos simultáneos en la misma caja.
 *   - Insertar movimientos en cortes cerrados (audit trail roto).
 *   - Aceptar vouchers >10MB o mime types no permitidos.
 *   - Pasar silenciosamente cuando RLS bloquea un UPDATE
 *     (regresión histórica de cuando se agregaron columnas editables
 *     sin policy).
 *
 * Estos son **unit tests con mocks** — cubren validaciones que viven
 * en TS. Los integration tests (Sprint 3C parte 2, en este mismo PR)
 * cubren el flujo end-to-end contra DB real.
 */

// ── State del test ─────────────────────────────────────────────────────

let session: { user: { id: string; email: string; user_metadata?: { full_name?: string } } } | null;
let preventInPreview = false;

// Cortes lookup — reused by registrarMovimiento, subirVoucher.
let corteLookup: { id: string; estado?: string } | null = null;
let corteLookupError: { message: string } | null = null;

// abrirCaja state.
let existingOpenCorte: { id: string } | null = null;
let existingOpenError: { message: string } | null = null;
let ultimoCorte: { id: string; efectivo_contado: number | null; cerrado_at: string } | null = null;
let ultimoCorteError: { message: string } | null = null;
let insertCorteResult: { data: { id: string } | null; error: { message: string } | null } = {
  data: { id: 'corte-new' },
  error: null,
};

// cerrarCaja state.
let updateCorteError: { message: string } | null = null;
let upsertDenomError: { message: string } | null = null;

// registrarMovimiento state.
let insertMovimientoResult: { data: { id: string } | null; error: { message: string } | null } = {
  data: { id: 'mov-1' },
  error: null,
};

// previewEfectivoInicial state.
let previewData: { efectivo_contado: number | null; cerrado_at: string } | null = null;
let previewError: { message: string } | null = null;

// Voucher state.
let voucherLookup: { storage_path: string } | null = null;
let voucherLookupError: { message: string } | null = null;
let storageUploadError: { message: string } | null = null;
let insertVoucherResult: { data: { id: string } | null; error: { message: string } | null } = {
  data: { id: 'voucher-1' },
  error: null,
};
let signedUrlResult: { data: { signedUrl: string } | null; error: { message: string } | null } = {
  data: { signedUrl: 'https://signed.url/voucher-1' },
  error: null,
};
let removeStorageCalled: string[][] = [];
let updateVoucherResult: { data: { id: string }[]; error: { message: string } | null } = {
  data: [{ id: 'voucher-1' }],
  error: null,
};
let deleteVoucherError: { message: string } | null = null;
let vouchersListResult: { data: unknown[]; error: { message: string } | null } = {
  data: [],
  error: null,
};
let bancosListResult: { data: unknown[]; error: { message: string } | null } = {
  data: [],
  error: null,
};

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
      getSession: async () => ({ data: { session } }),
    },
    schema(schemaName: string) {
      return {
        from(tableName: string) {
          let _op = '';
          const _filters: Record<string, unknown> = {};
          let _payload: unknown = null;

          const builder: any = {
            select(_cols: string) {
              _op = _op || 'select';
              return builder;
            },
            insert(payload: unknown) {
              _op = 'insert';
              _payload = payload;
              return builder;
            },
            update(payload: unknown) {
              _op = 'update';
              _payload = payload;
              return builder;
            },
            upsert(payload: unknown, _opts?: unknown) {
              _op = 'upsert';
              _payload = payload;
              return builder;
            },
            delete() {
              _op = 'delete';
              return builder;
            },
            eq(col: string, val: unknown) {
              _filters[col] = val;
              return builder;
            },
            in(col: string, vals: unknown[]) {
              _filters[col] = vals;
              return builder;
            },
            order(_col: string, _opts?: unknown) {
              return builder;
            },
            limit(_n: number) {
              return builder;
            },
            async maybeSingle() {
              if (
                schemaName === 'erp' &&
                tableName === 'cortes_caja' &&
                _filters.estado === 'abierto'
              ) {
                return { data: existingOpenCorte, error: existingOpenError };
              }
              if (
                schemaName === 'erp' &&
                tableName === 'cortes_caja' &&
                _filters.estado === 'cerrado'
              ) {
                return { data: ultimoCorte, error: ultimoCorteError };
              }
              if (schemaName === 'erp' && tableName === 'cortes_caja') {
                return { data: corteLookup, error: corteLookupError };
              }
              if (schemaName === 'erp' && tableName === 'cortes_vouchers') {
                return { data: voucherLookup, error: voucherLookupError };
              }
              return { data: null, error: null };
            },
            async single() {
              if (schemaName === 'erp' && tableName === 'cortes_caja' && _op === 'insert') {
                return insertCorteResult;
              }
              if (schemaName === 'erp' && tableName === 'movimientos_caja' && _op === 'insert') {
                return insertMovimientoResult;
              }
              if (schemaName === 'erp' && tableName === 'cortes_vouchers' && _op === 'insert') {
                return insertVoucherResult;
              }
              return { data: null, error: null };
            },
            then(onFulfilled: (r: { data: unknown; error: unknown }) => unknown) {
              // Resolver lecturas terminales (.eq().eq().order().limit().maybeSingle())
              // o updates / deletes / upserts via await directo.
              if (
                schemaName === 'erp' &&
                tableName === 'cortes_caja' &&
                _op === 'select' &&
                _filters.estado === 'cerrado'
              ) {
                // previewEfectivoInicial usa .limit(1).maybeSingle() — ya cubierto arriba,
                // pero por si acaso la chain remata aquí.
                return Promise.resolve({ data: previewData, error: previewError }).then(
                  onFulfilled
                );
              }
              if (schemaName === 'erp' && tableName === 'cortes_caja' && _op === 'update') {
                return Promise.resolve({ data: null, error: updateCorteError }).then(onFulfilled);
              }
              if (
                schemaName === 'erp' &&
                tableName === 'corte_conteo_denominaciones' &&
                _op === 'upsert'
              ) {
                return Promise.resolve({ data: null, error: upsertDenomError }).then(onFulfilled);
              }
              if (schemaName === 'erp' && tableName === 'cortes_vouchers' && _op === 'update') {
                // .update().eq().select('id') — devuelve array.
                return Promise.resolve(updateVoucherResult).then(onFulfilled);
              }
              if (schemaName === 'erp' && tableName === 'cortes_vouchers' && _op === 'delete') {
                return Promise.resolve({ data: null, error: deleteVoucherError }).then(onFulfilled);
              }
              if (schemaName === 'erp' && tableName === 'cortes_vouchers' && _op === 'select') {
                return Promise.resolve(vouchersListResult).then(onFulfilled);
              }
              if (schemaName === 'core' && tableName === 'bancos' && _op === 'select') {
                return Promise.resolve(bancosListResult).then(onFulfilled);
              }
              return Promise.resolve({ data: null, error: null }).then(onFulfilled);
            },
          };
          return builder;
        },
      };
    },
    storage: {
      from(_bucket: string) {
        return {
          async upload(_path: string, _file: unknown, _opts: unknown) {
            return { data: null, error: storageUploadError };
          },
          async remove(paths: string[]) {
            removeStorageCalled.push(paths);
            return { data: null, error: null };
          },
          async createSignedUrl(_path: string, _expiresIn: number) {
            return signedUrlResult;
          },
          async createSignedUrls(paths: string[], _expiresIn: number) {
            return {
              data: paths.map((p) => ({ path: p, signedUrl: `https://signed.url/${p}` })),
              error: null,
            };
          },
        };
      },
    },
  };
}

vi.mock('@/lib/supabase-server', () => ({
  createSupabaseServerClient: async () => buildSupabaseMock(),
}));

// ── Test ───────────────────────────────────────────────────────────────

import {
  abrirCaja,
  previewEfectivoInicial,
  cerrarCaja,
  registrarMovimiento,
  subirVoucher,
  eliminarVoucher,
  obtenerVouchersDelCorte,
  cargarBancos,
  confirmarVoucher,
  actualizarCategoriaVoucher,
} from './actions';

beforeEach(() => {
  session = {
    user: {
      id: 'user-uuid',
      email: 'beto@anorte.com',
      user_metadata: { full_name: 'Beto Santos' },
    },
  };
  preventInPreview = false;
  corteLookup = { id: 'corte-1', estado: 'abierto' };
  corteLookupError = null;
  existingOpenCorte = null;
  existingOpenError = null;
  ultimoCorte = null;
  ultimoCorteError = null;
  insertCorteResult = { data: { id: 'corte-new' }, error: null };
  updateCorteError = null;
  upsertDenomError = null;
  insertMovimientoResult = { data: { id: 'mov-1' }, error: null };
  previewData = null;
  previewError = null;
  voucherLookup = { storage_path: 'rdb/corte-1/abc.jpg' };
  voucherLookupError = null;
  storageUploadError = null;
  insertVoucherResult = { data: { id: 'voucher-1' }, error: null };
  signedUrlResult = { data: { signedUrl: 'https://signed.url/voucher-1' }, error: null };
  removeStorageCalled = [];
  updateVoucherResult = { data: [{ id: 'voucher-1' }], error: null };
  deleteVoucherError = null;
  vouchersListResult = { data: [], error: null };
  bancosListResult = { data: [], error: null };
});

const ABRIR_INPUT = {
  caja_id: 'caja-1',
  caja_nombre: 'Caja Principal',
  responsable_apertura: 'Beto Santos',
  fecha_operativa: '2026-05-02',
};

// ─────────────────────────────────────────────────────────────────────
// abrirCaja
// ─────────────────────────────────────────────────────────────────────

describe('abrirCaja', () => {
  it('falla sin auth', async () => {
    session = null;
    const res = await abrirCaja(ABRIR_INPUT);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/No autenticado/i);
  });

  it('falla si error al verificar turno existente', async () => {
    existingOpenError = { message: 'connection lost' };
    const res = await abrirCaja(ABRIR_INPUT);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/verificar turno/i);
  });

  it('falla si ya hay turno abierto en la misma caja', async () => {
    existingOpenCorte = { id: 'corte-existing' };
    const res = await abrirCaja(ABRIR_INPUT);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/turno abierto.*Ci[ée]rralo/i);
  });

  it('falla si error consultando último corte cerrado', async () => {
    ultimoCorteError = { message: 'rls violation' };
    const res = await abrirCaja(ABRIR_INPUT);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/último corte/i);
  });

  it('success heredando efectivo del último corte cerrado', async () => {
    ultimoCorte = { id: 'corte-prev', efectivo_contado: 5000, cerrado_at: '2026-05-01' };
    const res = await abrirCaja(ABRIR_INPUT);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.efectivo_inicial).toBe(5000);
      expect(res.heredado).toBe(true);
      expect(res.previo_sin_contar).toBe(false);
    }
  });

  it('success con previo_sin_contar=true cuando último corte no tenía conteo', async () => {
    ultimoCorte = { id: 'corte-prev', efectivo_contado: null, cerrado_at: '2026-05-01' };
    const res = await abrirCaja(ABRIR_INPUT);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.efectivo_inicial).toBe(0);
      expect(res.heredado).toBe(true);
      expect(res.previo_sin_contar).toBe(true);
    }
  });

  it('success en primer turno (sin corte previo)', async () => {
    ultimoCorte = null;
    const res = await abrirCaja(ABRIR_INPUT);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.efectivo_inicial).toBe(0);
      expect(res.heredado).toBe(false);
      expect(res.previo_sin_contar).toBe(false);
    }
  });

  it('falla si error al insertar', async () => {
    insertCorteResult = { data: null, error: { message: 'check constraint violation' } };
    const res = await abrirCaja(ABRIR_INPUT);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/abrir turno/i);
  });

  it('lanza si está en preview', async () => {
    preventInPreview = true;
    await expect(abrirCaja(ABRIR_INPUT)).rejects.toThrow(/preview/i);
  });
});

// ─────────────────────────────────────────────────────────────────────
// cerrarCaja
// ─────────────────────────────────────────────────────────────────────

describe('cerrarCaja', () => {
  it('throws sin auth', async () => {
    session = null;
    await expect(
      cerrarCaja({
        corte_id: 'corte-1',
        denominaciones: [{ denominacion: 100, tipo: 'billete', cantidad: 5 }],
      })
    ).rejects.toThrow(/No autenticado/i);
  });

  it('throws si update del corte falla', async () => {
    updateCorteError = { message: 'rls violation' };
    await expect(
      cerrarCaja({
        corte_id: 'corte-1',
        denominaciones: [{ denominacion: 100, tipo: 'billete', cantidad: 5 }],
      })
    ).rejects.toThrow(/rls violation/);
  });

  it('throws si upsert de denominaciones falla', async () => {
    upsertDenomError = { message: 'unique constraint' };
    await expect(
      cerrarCaja({
        corte_id: 'corte-1',
        denominaciones: [{ denominacion: 100, tipo: 'billete', cantidad: 5 }],
      })
    ).rejects.toThrow(/unique constraint/);
  });

  it('success calculando total desde denominaciones', async () => {
    await expect(
      cerrarCaja({
        corte_id: 'corte-1',
        denominaciones: [
          { denominacion: 100, tipo: 'billete', cantidad: 10 }, // 1000
          { denominacion: 50, tipo: 'billete', cantidad: 4 }, // 200
          { denominacion: 0, tipo: 'moneda', cantidad: 0 }, // 0 (filter)
        ],
      })
    ).resolves.toBeUndefined();
  });

  it('omite upsert si todas las denominaciones tienen cantidad 0', async () => {
    upsertDenomError = { message: 'should not be called' };
    await expect(
      cerrarCaja({
        corte_id: 'corte-1',
        denominaciones: [{ denominacion: 100, tipo: 'billete', cantidad: 0 }],
      })
    ).resolves.toBeUndefined();
  });
});

// ─────────────────────────────────────────────────────────────────────
// registrarMovimiento
// ─────────────────────────────────────────────────────────────────────

describe('registrarMovimiento', () => {
  const VALID = {
    corte_id: 'corte-1',
    tipo: 'entrada' as const,
    tipo_detalle: 'efectivo',
    monto: 100,
    concepto: 'Pago en efectivo',
  };

  it('throws sin auth', async () => {
    session = null;
    await expect(registrarMovimiento(VALID)).rejects.toThrow(/No autenticado/);
  });

  it('throws si user no tiene full_name ni email', async () => {
    session = { user: { id: 'u', email: '', user_metadata: {} } };
    await expect(registrarMovimiento(VALID)).rejects.toThrow(/sin nombre ni email/i);
  });

  it('throws si corte_id falta', async () => {
    await expect(registrarMovimiento({ ...VALID, corte_id: '' })).rejects.toThrow(/corte_id/);
  });

  it('throws si monto ≤ 0', async () => {
    await expect(registrarMovimiento({ ...VALID, monto: 0 })).rejects.toThrow(/mayor a 0/);
    await expect(registrarMovimiento({ ...VALID, monto: -10 })).rejects.toThrow(/mayor a 0/);
  });

  it('throws si concepto vacío', async () => {
    await expect(registrarMovimiento({ ...VALID, concepto: '   ' })).rejects.toThrow(/Concepto/);
  });

  it('throws si tipo no es entrada ni salida', async () => {
    await expect(registrarMovimiento({ ...VALID, tipo: 'invalido' as 'entrada' })).rejects.toThrow(
      /tipo inv[áa]lido/i
    );
  });

  it('throws si corte no existe', async () => {
    corteLookup = null;
    await expect(registrarMovimiento(VALID)).rejects.toThrow(/Corte no encontrado/);
  });

  it('throws si corte está cerrado', async () => {
    corteLookup = { id: 'corte-1', estado: 'cerrado' };
    await expect(registrarMovimiento(VALID)).rejects.toThrow(/Solo cortes abiertos|cerrado/i);
  });

  it('throws si insert falla', async () => {
    insertMovimientoResult = { data: null, error: { message: 'fk violation' } };
    await expect(registrarMovimiento(VALID)).rejects.toThrow(/fk violation/);
  });

  it('success retorna {id} con realizado_por_nombre del JWT', async () => {
    const result = await registrarMovimiento(VALID);
    expect(result).toEqual({ id: 'mov-1' });
  });
});

// ─────────────────────────────────────────────────────────────────────
// subirVoucher
// ─────────────────────────────────────────────────────────────────────

describe('subirVoucher', () => {
  function makeFile(opts: { size?: number; type?: string; name?: string } = {}): File {
    const size = opts.size ?? 1024;
    const type = opts.type ?? 'image/jpeg';
    return new File([new Uint8Array(size)], opts.name ?? 'voucher.jpg', { type });
  }

  it('throws sin auth', async () => {
    session = null;
    await expect(subirVoucher({ corte_id: 'corte-1', file: makeFile() })).rejects.toThrow(
      /No autenticado/
    );
  });

  it('throws si archivo > 10 MB', async () => {
    await expect(
      subirVoucher({ corte_id: 'corte-1', file: makeFile({ size: 11 * 1024 * 1024 }) })
    ).rejects.toThrow(/10 MB/i);
  });

  it('throws si mime type no permitido (PDF)', async () => {
    await expect(
      subirVoucher({
        corte_id: 'corte-1',
        file: makeFile({ type: 'application/pdf' }),
      })
    ).rejects.toThrow(/Tipo no permitido/);
  });

  it('throws si corte no existe', async () => {
    corteLookup = null;
    await expect(subirVoucher({ corte_id: 'corte-1', file: makeFile() })).rejects.toThrow(
      /Corte no encontrado/
    );
  });

  it('rollback de archivo si insert falla', async () => {
    insertVoucherResult = { data: null, error: { message: 'rls violation' } };
    await expect(subirVoucher({ corte_id: 'corte-1', file: makeFile() })).rejects.toThrow(
      /rls violation/
    );
    // Storage remove se llamó para limpiar el archivo huérfano.
    expect(removeStorageCalled.length).toBeGreaterThan(0);
  });

  it('success retorna {id, signed_url}', async () => {
    const res = await subirVoucher({ corte_id: 'corte-1', file: makeFile() });
    expect(res.id).toBe('voucher-1');
    expect(res.signed_url).toBe('https://signed.url/voucher-1');
  });

  it('acepta image/png, image/webp, image/heic', async () => {
    for (const type of ['image/png', 'image/webp', 'image/heic']) {
      const res = await subirVoucher({ corte_id: 'corte-1', file: makeFile({ type }) });
      expect(res.id).toBe('voucher-1');
    }
  });
});

// ─────────────────────────────────────────────────────────────────────
// eliminarVoucher
// ─────────────────────────────────────────────────────────────────────

describe('eliminarVoucher', () => {
  it('throws sin auth', async () => {
    session = null;
    await expect(eliminarVoucher('voucher-1')).rejects.toThrow(/No autenticado/);
  });

  it('throws si voucher no existe (o sin permisos)', async () => {
    voucherLookup = null;
    await expect(eliminarVoucher('voucher-1')).rejects.toThrow(/no encontrado.*permisos/i);
  });

  it('throws si delete row falla', async () => {
    deleteVoucherError = { message: 'rls violation' };
    await expect(eliminarVoucher('voucher-1')).rejects.toThrow(/rls violation/);
  });

  it('success: borra row e intenta remover archivo (best-effort)', async () => {
    await expect(eliminarVoucher('voucher-1')).resolves.toBeUndefined();
    // Storage remove se invocó con el path correcto.
    expect(removeStorageCalled).toEqual([['rdb/corte-1/abc.jpg']]);
  });
});

// ─────────────────────────────────────────────────────────────────────
// confirmarVoucher
// ─────────────────────────────────────────────────────────────────────

describe('confirmarVoucher', () => {
  const VALID = { voucher_id: 'voucher-1', banco_id: 'banco-1', monto: 1000, afiliacion: '12345' };

  it('throws sin auth', async () => {
    session = null;
    await expect(confirmarVoucher(VALID)).rejects.toThrow(/No autenticado/);
  });

  it('throws si monto null', async () => {
    await expect(confirmarVoucher({ ...VALID, monto: null as unknown as number })).rejects.toThrow(
      /monto es requerido/
    );
  });

  it('throws si monto NaN', async () => {
    await expect(confirmarVoucher({ ...VALID, monto: NaN })).rejects.toThrow(/monto es requerido/);
  });

  it('throws si monto negativo', async () => {
    await expect(confirmarVoucher({ ...VALID, monto: -5 })).rejects.toThrow(
      /no puede ser negativo/
    );
  });

  it('throws si update no afecta filas (RLS bloqueando)', async () => {
    updateVoucherResult = { data: [], error: null };
    await expect(confirmarVoucher(VALID)).rejects.toThrow(/RLS bloqueando|inexistente/i);
  });

  it('success', async () => {
    await expect(confirmarVoucher(VALID)).resolves.toBeUndefined();
  });
});

// ─────────────────────────────────────────────────────────────────────
// actualizarCategoriaVoucher
// ─────────────────────────────────────────────────────────────────────

describe('actualizarCategoriaVoucher', () => {
  it('throws sin auth', async () => {
    session = null;
    await expect(
      actualizarCategoriaVoucher({
        voucher_id: 'v1',
        categoria: 'voucher_tarjeta',
        movimiento_caja_id: null,
      })
    ).rejects.toThrow(/No autenticado/);
  });

  it('throws si comprobante_movimiento sin movimiento_caja_id', async () => {
    await expect(
      actualizarCategoriaVoucher({
        voucher_id: 'v1',
        categoria: 'comprobante_movimiento',
        movimiento_caja_id: null,
      })
    ).rejects.toThrow(/seleccionar el movimiento/i);
  });

  it('throws si update no afecta filas (RLS bloqueando)', async () => {
    updateVoucherResult = { data: [], error: null };
    await expect(
      actualizarCategoriaVoucher({
        voucher_id: 'v1',
        categoria: 'voucher_tarjeta',
        movimiento_caja_id: null,
      })
    ).rejects.toThrow(/RLS bloqueando|inexistente/i);
  });

  it('success voucher_tarjeta', async () => {
    await expect(
      actualizarCategoriaVoucher({
        voucher_id: 'v1',
        categoria: 'voucher_tarjeta',
        movimiento_caja_id: null,
      })
    ).resolves.toBeUndefined();
  });

  it('success comprobante_movimiento con movimiento_caja_id', async () => {
    await expect(
      actualizarCategoriaVoucher({
        voucher_id: 'v1',
        categoria: 'comprobante_movimiento',
        movimiento_caja_id: 'mov-1',
      })
    ).resolves.toBeUndefined();
  });
});

// ─────────────────────────────────────────────────────────────────────
// previewEfectivoInicial
// ─────────────────────────────────────────────────────────────────────

describe('previewEfectivoInicial', () => {
  it('returns heredado=false cuando no hay corte previo', async () => {
    ultimoCorte = null;
    const res = await previewEfectivoInicial('Caja Principal');
    expect(res).toEqual({ monto: 0, heredado: false, previo_sin_contar: false, cerrado_at: null });
  });

  it('returns heredado=true con efectivo previo', async () => {
    ultimoCorte = { id: 'c1', efectivo_contado: 3000, cerrado_at: '2026-05-01' };
    const res = await previewEfectivoInicial('Caja Principal');
    expect(res).toEqual({
      monto: 3000,
      heredado: true,
      previo_sin_contar: false,
      cerrado_at: '2026-05-01',
    });
  });
});

// ─────────────────────────────────────────────────────────────────────
// cargarBancos / obtenerVouchersDelCorte (lecturas)
// ─────────────────────────────────────────────────────────────────────

describe('cargarBancos', () => {
  it('returns lista vacía si no hay bancos', async () => {
    bancosListResult = { data: [], error: null };
    const res = await cargarBancos();
    expect(res).toEqual([]);
  });

  it('returns bancos activos', async () => {
    bancosListResult = {
      data: [
        { id: 'b1', codigo: 'BBVA', nombre: 'BBVA México', patron_ocr: '', activo: true },
        { id: 'b2', codigo: 'BNX', nombre: 'Banamex', patron_ocr: '', activo: true },
      ],
      error: null,
    };
    const res = await cargarBancos();
    expect(res.length).toBe(2);
    expect(res[0].codigo).toBe('BBVA');
  });
});

describe('obtenerVouchersDelCorte', () => {
  it('returns vacío si el corte no tiene vouchers', async () => {
    vouchersListResult = { data: [], error: null };
    const res = await obtenerVouchersDelCorte('corte-1');
    expect(res).toEqual([]);
  });

  it('throws si error en query', async () => {
    vouchersListResult = { data: [], error: { message: 'connection' } };
    await expect(obtenerVouchersDelCorte('corte-1')).rejects.toThrow(/connection/);
  });
});
