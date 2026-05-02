import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Tests para `app/rdb/inventario/levantamientos/actions.ts`.
 *
 * Sprint 3C de tech-debt-h1-2026 — fortifica el flujo de levantamientos
 * de inventario (firma, transiciones de estado, aplicación a stock).
 *
 * **8 de 9 funciones delegan a RPCs PL/pgSQL** (`fn_iniciar_captura`,
 * `fn_guardar_conteo`, `fn_cerrar_captura`, `fn_firmar_levantamiento`,
 * `fn_cancelar_levantamiento`, `fn_get_lineas_*`). Estos unit tests
 * cubren:
 *
 *   - La capa TS (validaciones que viven en `actions.ts`).
 *   - Que las RPCs se invoquen con los argumentos correctos.
 *   - Propagación de errores RPC al caller.
 *   - El parser de `fn_firmar_levantamiento` (`parseFirmarPasoResult`).
 *
 * La lógica DENTRO de las RPCs (transiciones de estado, conteo de
 * firmas, aplicación a movimientos) se cubre en los integration tests
 * (parte 2 de este PR, contra DB real con `supabase start`).
 *
 * `actualizarNotaDiferencia` es la única función con lógica TS rica
 * (state guards, lookup de línea + levantamiento, validación de
 * contador) — recibe el grueso de los tests aquí.
 */

// ── State del test ─────────────────────────────────────────────────────

let session: { user: { id: string } } | null;
let preventInPreview = false;
let adminAvailable = true;

// crearLevantamiento.
let insertLevantamientoResult: {
  data: { id: string; folio: string | null } | null;
  error: { message: string } | null;
} = { data: { id: 'lev-1', folio: 'LEV-2026-001' }, error: null };

// RPCs.
let rpcResults: Record<string, { data: unknown; error: { message: string } | null }> = {};

// actualizarNotaDiferencia: admin lookups.
let lineaLookup: { id: string; levantamiento_id: string } | null = null;
let lineaLookupError: { message: string } | null = null;
let levLookup: { id: string; estado: string; contador_id: string } | null = null;
let levLookupError: { message: string } | null = null;
let updateNotaError: { message: string } | null = null;
let lastNotaWritten: string | null | undefined;

// Captura de las RPCs llamadas, para verificación.
let rpcCallLog: Array<{ fn: string; args: Record<string, unknown> }> = [];

// ── Mocks ──────────────────────────────────────────────────────────────

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}));

vi.mock('next/headers', () => ({
  headers: async () => ({
    get: (key: string) => {
      if (key === 'x-forwarded-for') return '192.168.1.1';
      if (key === 'user-agent') return 'TestAgent/1.0';
      return null;
    },
  }),
}));

vi.mock('@/lib/auth/preview-guard', () => ({
  assertNotInPreview: async () => {
    if (preventInPreview) throw new Error('Mutation bloqueada en preview');
  },
}));

/* eslint-disable @typescript-eslint/no-explicit-any -- test doubles */
function buildSupabaseUserMock(): any {
  return {
    auth: {
      getSession: async () => ({ data: { session } }),
    },
    schema(schemaName: string) {
      return {
        from(tableName: string) {
          let _payload: unknown = null;
          const builder: any = {
            insert(payload: unknown) {
              _payload = payload;
              return builder;
            },
            select(_cols: string) {
              return builder;
            },
            async single() {
              if (schemaName === 'erp' && tableName === 'inventario_levantamientos' && _payload) {
                return insertLevantamientoResult;
              }
              return { data: null, error: null };
            },
          };
          return builder;
        },
        rpc(fn: string, args: Record<string, unknown>) {
          rpcCallLog.push({ fn, args });
          const result = rpcResults[fn] ?? { data: null, error: null };
          return Promise.resolve(result);
        },
      };
    },
  };
}

function buildSupabaseAdminMock(): any {
  return {
    schema(_schemaName: string) {
      return {
        from(tableName: string) {
          const _filters: Record<string, unknown> = {};
          let _op = '';
          let _payload: unknown = null;

          const builder: any = {
            select(_cols: string) {
              _op = 'select';
              return builder;
            },
            update(payload: unknown) {
              _op = 'update';
              _payload = payload;
              return builder;
            },
            eq(col: string, val: unknown) {
              _filters[col] = val;
              return builder;
            },
            async maybeSingle() {
              if (tableName === 'inventario_levantamiento_lineas') {
                return { data: lineaLookup, error: lineaLookupError };
              }
              if (tableName === 'inventario_levantamientos') {
                return { data: levLookup, error: levLookupError };
              }
              return { data: null, error: null };
            },
            then(onFulfilled: (r: { data: unknown; error: unknown }) => unknown) {
              if (_op === 'update' && tableName === 'inventario_levantamiento_lineas') {
                const p = _payload as { notas_diferencia?: string | null };
                lastNotaWritten = p?.notas_diferencia;
                return Promise.resolve({ data: null, error: updateNotaError }).then(onFulfilled);
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
  createSupabaseServerClient: async () => buildSupabaseUserMock(),
}));

vi.mock('@/lib/supabase-admin', () => ({
  getSupabaseAdminClient: () => (adminAvailable ? buildSupabaseAdminMock() : null),
}));

// ── Test ───────────────────────────────────────────────────────────────

import {
  crearLevantamiento,
  iniciarCaptura,
  guardarConteo,
  cerrarCaptura,
  firmarPaso,
  cancelarLevantamiento,
  getLineasParaCapturar,
  getLineasParaRevisar,
  actualizarNotaDiferencia,
} from './actions';

beforeEach(() => {
  session = { user: { id: 'user-uuid' } };
  preventInPreview = false;
  adminAvailable = true;
  insertLevantamientoResult = {
    data: { id: 'lev-1', folio: 'LEV-2026-001' },
    error: null,
  };
  rpcResults = {};
  lineaLookup = { id: 'linea-1', levantamiento_id: 'lev-1' };
  lineaLookupError = null;
  levLookup = { id: 'lev-1', estado: 'capturado', contador_id: 'user-uuid' };
  levLookupError = null;
  updateNotaError = null;
  lastNotaWritten = undefined;
  rpcCallLog = [];
});

// ─────────────────────────────────────────────────────────────────────
// crearLevantamiento
// ─────────────────────────────────────────────────────────────────────

describe('crearLevantamiento', () => {
  const VALID = {
    almacen_id: 'almacen-1',
    fecha_programada: '2026-05-15',
    notas: 'Conteo mensual',
  };

  it('falla sin auth', async () => {
    session = null;
    const res = await crearLevantamiento(VALID);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/No autenticado/i);
  });

  it('falla si insert lanza error', async () => {
    insertLevantamientoResult = { data: null, error: { message: 'check constraint' } };
    const res = await crearLevantamiento(VALID);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toBe('check constraint');
  });

  it('falla si insert no devuelve datos', async () => {
    insertLevantamientoResult = { data: null, error: null };
    const res = await crearLevantamiento(VALID);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/Sin datos/i);
  });

  it('success retorna {id, folio}', async () => {
    const res = await crearLevantamiento(VALID);
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.data).toEqual({ id: 'lev-1', folio: 'LEV-2026-001' });
  });

  it('lanza si está en preview', async () => {
    preventInPreview = true;
    await expect(crearLevantamiento(VALID)).rejects.toThrow(/preview/i);
  });
});

// ─────────────────────────────────────────────────────────────────────
// RPCs simples (delegación + propagación de error)
// ─────────────────────────────────────────────────────────────────────

describe('iniciarCaptura', () => {
  it('llama RPC con el levantamiento_id', async () => {
    rpcResults['fn_iniciar_captura_levantamiento'] = { data: 42, error: null };
    const res = await iniciarCaptura('lev-1');
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.data).toEqual({ lineasSembradas: 42 });
    expect(rpcCallLog).toContainEqual({
      fn: 'fn_iniciar_captura_levantamiento',
      args: { p_levantamiento_id: 'lev-1' },
    });
  });

  it('propaga error de RPC', async () => {
    rpcResults['fn_iniciar_captura_levantamiento'] = {
      data: null,
      error: { message: 'estado inválido' },
    };
    const res = await iniciarCaptura('lev-1');
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toBe('estado inválido');
  });

  it('retorna lineasSembradas: 0 cuando RPC retorna null', async () => {
    rpcResults['fn_iniciar_captura_levantamiento'] = { data: null, error: null };
    const res = await iniciarCaptura('lev-1');
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.data.lineasSembradas).toBe(0);
  });
});

describe('guardarConteo', () => {
  it('llama RPC con los 3 args', async () => {
    rpcResults['fn_guardar_conteo'] = { data: null, error: null };
    const res = await guardarConteo('lev-1', 'prod-1', 5.5);
    expect(res.ok).toBe(true);
    expect(rpcCallLog).toContainEqual({
      fn: 'fn_guardar_conteo',
      args: { p_levantamiento_id: 'lev-1', p_producto_id: 'prod-1', p_cantidad: 5.5 },
    });
  });

  it('propaga error de RPC', async () => {
    rpcResults['fn_guardar_conteo'] = { data: null, error: { message: 'línea bloqueada' } };
    const res = await guardarConteo('lev-1', 'prod-1', 5);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toBe('línea bloqueada');
  });
});

describe('cerrarCaptura', () => {
  it('llama RPC con el id y propaga success', async () => {
    rpcResults['fn_cerrar_captura_levantamiento'] = { data: null, error: null };
    const res = await cerrarCaptura('lev-1');
    expect(res.ok).toBe(true);
  });

  it('propaga error de RPC', async () => {
    rpcResults['fn_cerrar_captura_levantamiento'] = {
      data: null,
      error: { message: 'líneas pendientes' },
    };
    const res = await cerrarCaptura('lev-1');
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toBe('líneas pendientes');
  });
});

// ─────────────────────────────────────────────────────────────────────
// firmarPaso
// ─────────────────────────────────────────────────────────────────────

describe('firmarPaso', () => {
  const VALID_INPUT = {
    levantamiento_id: 'lev-1',
    paso: 1,
    rol: 'operacion',
    comentario: 'OK',
  };

  it('llama RPC con args + headers (ip + user-agent)', async () => {
    rpcResults['fn_firmar_levantamiento'] = {
      data: {
        firmas_actuales: 1,
        firmas_requeridas: 2,
        aplicado: false,
        movimientos_generados: 0,
      },
      error: null,
    };
    const res = await firmarPaso(VALID_INPUT);
    expect(res.ok).toBe(true);
    const call = rpcCallLog.find((c) => c.fn === 'fn_firmar_levantamiento');
    expect(call?.args).toMatchObject({
      p_levantamiento_id: 'lev-1',
      p_paso: 1,
      p_rol: 'operacion',
      p_comentario: 'OK',
      p_ip: '192.168.1.1',
      p_user_agent: 'TestAgent/1.0',
    });
  });

  it('parsea correctamente firmas_actuales/requeridas/aplicado', async () => {
    rpcResults['fn_firmar_levantamiento'] = {
      data: {
        firmas_actuales: 2,
        firmas_requeridas: 2,
        aplicado: true,
        movimientos_generados: 15,
      },
      error: null,
    };
    const res = await firmarPaso(VALID_INPUT);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.data).toEqual({
        firmas_actuales: 2,
        firmas_requeridas: 2,
        aplicado: true,
        movimientos_generados: 15,
      });
    }
  });

  it('falla si la respuesta de RPC tiene shape inválido', async () => {
    rpcResults['fn_firmar_levantamiento'] = {
      data: { firmas_actuales: 'not-a-number' },
      error: null,
    };
    const res = await firmarPaso(VALID_INPUT);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/Respuesta inesperada/i);
  });

  it('falla si la respuesta de RPC es null', async () => {
    rpcResults['fn_firmar_levantamiento'] = { data: null, error: null };
    const res = await firmarPaso(VALID_INPUT);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/Respuesta inesperada/i);
  });

  it('propaga error de RPC', async () => {
    rpcResults['fn_firmar_levantamiento'] = {
      data: null,
      error: { message: 'rol no autorizado' },
    };
    const res = await firmarPaso(VALID_INPUT);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toBe('rol no autorizado');
  });

  it('movimientos_generados default 0 si no viene en respuesta', async () => {
    rpcResults['fn_firmar_levantamiento'] = {
      data: { firmas_actuales: 1, firmas_requeridas: 2, aplicado: false },
      error: null,
    };
    const res = await firmarPaso(VALID_INPUT);
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.data.movimientos_generados).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────
// cancelarLevantamiento
// ─────────────────────────────────────────────────────────────────────

describe('cancelarLevantamiento', () => {
  it('falla si motivo está vacío', async () => {
    const res = await cancelarLevantamiento('lev-1', '');
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/motivo.*requerido/i);
  });

  it('falla si motivo es solo whitespace', async () => {
    const res = await cancelarLevantamiento('lev-1', '   ');
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/motivo.*requerido/i);
  });

  it('llama RPC con motivo trimmed', async () => {
    rpcResults['fn_cancelar_levantamiento'] = { data: null, error: null };
    await cancelarLevantamiento('lev-1', '  Cancelado por error  ');
    const call = rpcCallLog.find((c) => c.fn === 'fn_cancelar_levantamiento');
    expect(call?.args).toEqual({ p_levantamiento_id: 'lev-1', p_motivo: 'Cancelado por error' });
  });

  it('propaga error de RPC', async () => {
    rpcResults['fn_cancelar_levantamiento'] = {
      data: null,
      error: { message: 'estado inválido' },
    };
    const res = await cancelarLevantamiento('lev-1', 'Motivo');
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toBe('estado inválido');
  });
});

// ─────────────────────────────────────────────────────────────────────
// getLineasPara* (lecturas)
// ─────────────────────────────────────────────────────────────────────

describe('getLineasParaCapturar / getLineasParaRevisar', () => {
  it('getLineasParaCapturar retorna data del RPC', async () => {
    const lineas = [{ producto_id: 'p1', producto_nombre: 'X', cantidad_capturada: 5 }];
    rpcResults['fn_get_lineas_para_capturar'] = { data: lineas, error: null };
    const res = await getLineasParaCapturar('lev-1');
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.data.length).toBe(1);
  });

  it('getLineasParaRevisar retorna data del RPC', async () => {
    rpcResults['fn_get_lineas_para_revisar'] = { data: [], error: null };
    const res = await getLineasParaRevisar('lev-1');
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.data).toEqual([]);
  });

  it('propaga errores', async () => {
    rpcResults['fn_get_lineas_para_capturar'] = {
      data: null,
      error: { message: 'permission denied' },
    };
    const res = await getLineasParaCapturar('lev-1');
    expect(res.ok).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────
// actualizarNotaDiferencia (lógica TS rica)
// ─────────────────────────────────────────────────────────────────────

describe('actualizarNotaDiferencia', () => {
  it('falla sin auth', async () => {
    session = null;
    const res = await actualizarNotaDiferencia('linea-1', 'nota');
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/No autenticado/i);
  });

  it('falla si admin client no disponible', async () => {
    adminAvailable = false;
    const res = await actualizarNotaDiferencia('linea-1', 'nota');
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/service-role no disponible/i);
  });

  it('falla si línea no existe', async () => {
    lineaLookup = null;
    const res = await actualizarNotaDiferencia('linea-1', 'nota');
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/L[ií]nea no encontrada/i);
  });

  it('falla si lookup de línea lanza error', async () => {
    lineaLookupError = { message: 'db error' };
    const res = await actualizarNotaDiferencia('linea-1', 'nota');
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toBe('db error');
  });

  it('falla si levantamiento no existe', async () => {
    levLookup = null;
    const res = await actualizarNotaDiferencia('linea-1', 'nota');
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/Levantamiento no encontrado/i);
  });

  it('falla si estado del levantamiento no es `capturado`', async () => {
    levLookup = { id: 'lev-1', estado: 'aplicado', contador_id: 'user-uuid' };
    const res = await actualizarNotaDiferencia('linea-1', 'nota');
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/en revisi[óo]n/i);
  });

  it('falla si user no es contador del levantamiento', async () => {
    levLookup = { id: 'lev-1', estado: 'capturado', contador_id: 'otro-user' };
    const res = await actualizarNotaDiferencia('linea-1', 'nota');
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/Solo el contador/i);
  });

  it('falla si update lanza error', async () => {
    updateNotaError = { message: 'rls violation' };
    const res = await actualizarNotaDiferencia('linea-1', 'nota');
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toBe('rls violation');
  });

  it('success con nota válida', async () => {
    const res = await actualizarNotaDiferencia('linea-1', '  Falto producto  ');
    expect(res.ok).toBe(true);
    expect(lastNotaWritten).toBe('Falto producto');
  });

  it('limpia nota a null cuando viene whitespace solo', async () => {
    const res = await actualizarNotaDiferencia('linea-1', '   ');
    expect(res.ok).toBe(true);
    expect(lastNotaWritten).toBe(null);
  });
});
