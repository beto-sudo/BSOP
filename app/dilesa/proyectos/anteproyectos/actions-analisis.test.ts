import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Tests para server actions del Sprint 4A (`promoteAnteproyecto` con
 * rol Dirección por empresa) + Sprint 4B (análisis financiero). Mock
 * ligero del cliente Supabase — solo lo necesario para verificar que
 * las validaciones y normalizaciones funcionen end-to-end y que los
 * errores de DB se propaguen correctamente.
 */

// ── State del test ─────────────────────────────────────────────────────

let lastTable: string | null = null;
let lastPatch: Record<string, unknown> | null = null;
let lastEqId: string | null = null;
let updateError: { message: string } | null = null;

// Sprint 4A `promoteAnteproyecto` mock state.
let authUserEmail: string | null = 'beto@anorte.com';
let authError: { message: string } | null = null;
let coreUserRow: { id: string; rol: string } | null = {
  id: 'user-1',
  rol: 'admin',
};
let coreUserError: { message: string } | null = null;
let anteproyectoRow: { empresa_id: string } | null = {
  empresa_id: 'empresa-dilesa',
};
let anteproyectoError: { message: string } | null = null;
let rolesData: Array<{ id: string }> = [];
let asignacionesData: Array<{ rol_id: string }> = [];
let rpcResult: { data: string | null; error: { message: string } | null } = {
  data: 'desarrollo-1',
  error: null,
};

// Sprint 4B refinamiento — lookup de producto para autopopulate.
let productoRow: {
  valor_comercial_referencia: number | null;
  costo_referencia: number | null;
} | null = { valor_comercial_referencia: 900_000, costo_referencia: null };
let productoError: { message: string } | null = null;

// ── Mocks ──────────────────────────────────────────────────────────────

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
      getUser: async () => ({
        data: { user: authUserEmail ? { email: authUserEmail } : null },
        error: authError,
      }),
    },
    schema: (schemaName: string) => ({
      from: (table: string) => {
        lastTable = table;
        // Helper para queries de promoteAnteproyecto.
        if (schemaName === 'core' && table === 'usuarios') {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: async () => ({ data: coreUserRow, error: coreUserError }),
              }),
            }),
          };
        }
        if (schemaName === 'core' && table === 'roles') {
          return {
            select: () => ({
              eq: () => ({
                ilike: () => Promise.resolve({ data: rolesData, error: null }),
              }),
            }),
          };
        }
        if (schemaName === 'core' && table === 'usuarios_empresas') {
          return {
            select: () => ({
              eq: () => ({
                eq: () => ({
                  eq: () => ({
                    in: () => Promise.resolve({ data: asignacionesData, error: null }),
                  }),
                }),
              }),
            }),
          };
        }
        if (schemaName === 'dilesa' && table === 'productos') {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: async () => ({ data: productoRow, error: productoError }),
              }),
            }),
          };
        }
        if (schemaName === 'dilesa' && table === 'proyectos') {
          // Distinguir entre SELECT (promote: leer empresa) y UPDATE (Sprint 4B análisis).
          const chain = {
            update: (patch: Record<string, unknown>) => {
              lastPatch = patch;
              return {
                eq: (_col: string, id: string) => {
                  lastEqId = id;
                  return Promise.resolve({ error: updateError });
                },
              };
            },
            select: () => ({
              eq: () => ({
                maybeSingle: async () => ({ data: anteproyectoRow, error: anteproyectoError }),
              }),
            }),
          };
          return chain;
        }
        return {
          update: (patch: Record<string, unknown>) => {
            lastPatch = patch;
            return {
              eq: (_col: string, id: string) => {
                lastEqId = id;
                return Promise.resolve({ error: updateError });
              },
            };
          },
        };
      },
      rpc: async () => rpcResult,
    }),
    rpc: async () => rpcResult,
  }),
}));

beforeEach(() => {
  lastTable = null;
  lastPatch = null;
  lastEqId = null;
  updateError = null;
  authUserEmail = 'beto@anorte.com';
  authError = null;
  coreUserRow = { id: 'user-1', rol: 'admin' };
  coreUserError = null;
  anteproyectoRow = { empresa_id: 'empresa-dilesa' };
  anteproyectoError = null;
  rolesData = [];
  asignacionesData = [];
  rpcResult = { data: 'desarrollo-1', error: null };
  productoRow = { valor_comercial_referencia: 900_000, costo_referencia: null };
  productoError = null;
});

describe('updateAnteproyectoClasificaciones (Sprint 4B refinamiento)', () => {
  it('rechaza proyectoId vacío', async () => {
    const { updateAnteproyectoClasificaciones } = await import('./actions');
    const r = await updateAnteproyectoClasificaciones('', ['interes_social']);
    expect(r.ok).toBe(false);
    expect(lastTable).toBeNull();
  });

  it('rechaza no-array', async () => {
    const { updateAnteproyectoClasificaciones } = await import('./actions');
    // @ts-expect-error — input inválido
    const r = await updateAnteproyectoClasificaciones('p1', 'interes_social');
    expect(r.ok).toBe(false);
    expect(lastTable).toBeNull();
  });

  it('persiste array de códigos válidos del catálogo', async () => {
    const { updateAnteproyectoClasificaciones } = await import('./actions');
    const r = await updateAnteproyectoClasificaciones('p1', [
      'interes_social',
      'residencial_medio',
    ]);
    expect(r.ok).toBe(true);
    expect(lastPatch).toEqual({
      clasificaciones_inmobiliarias: ['interes_social', 'residencial_medio'],
    });
  });

  it('filtra códigos fuera del catálogo (no rompe)', async () => {
    const { updateAnteproyectoClasificaciones } = await import('./actions');
    const r = await updateAnteproyectoClasificaciones('p1', ['interes_social', 'no_existe']);
    expect(r.ok).toBe(true);
    expect(lastPatch).toEqual({ clasificaciones_inmobiliarias: ['interes_social'] });
  });

  it('persiste array vacío', async () => {
    const { updateAnteproyectoClasificaciones } = await import('./actions');
    const r = await updateAnteproyectoClasificaciones('p1', []);
    expect(r.ok).toBe(true);
    expect(lastPatch).toEqual({ clasificaciones_inmobiliarias: [] });
  });
});

describe('updateAnteproyectoPrototipoReferencia (Sprint 4B refinamiento)', () => {
  it('rechaza proyectoId vacío', async () => {
    const { updateAnteproyectoPrototipoReferencia } = await import('./actions');
    const r = await updateAnteproyectoPrototipoReferencia('', 'prod-1');
    expect(r.ok).toBe(false);
  });

  it('productoId=null limpia el FK sin autopopulate', async () => {
    const { updateAnteproyectoPrototipoReferencia } = await import('./actions');
    const r = await updateAnteproyectoPrototipoReferencia('p1', null);
    expect(r.ok).toBe(true);
    expect(lastPatch).toEqual({ prototipo_referencia_id: null });
  });

  it('productoId válido autopopula valor_comercial_referencia', async () => {
    productoRow = { valor_comercial_referencia: 1_200_000, costo_referencia: null };
    const { updateAnteproyectoPrototipoReferencia } = await import('./actions');
    const r = await updateAnteproyectoPrototipoReferencia('p1', 'prod-1');
    expect(r.ok).toBe(true);
    expect(lastPatch).toEqual({
      prototipo_referencia_id: 'prod-1',
      valor_comercial_referencia: 1_200_000,
    });
  });

  it('producto sin valor_comercial_referencia → solo setea el FK', async () => {
    productoRow = { valor_comercial_referencia: null, costo_referencia: null };
    const { updateAnteproyectoPrototipoReferencia } = await import('./actions');
    const r = await updateAnteproyectoPrototipoReferencia('p1', 'prod-1');
    expect(r.ok).toBe(true);
    expect(lastPatch).toEqual({ prototipo_referencia_id: 'prod-1' });
  });

  it('producto no encontrado → error', async () => {
    productoRow = null;
    const { updateAnteproyectoPrototipoReferencia } = await import('./actions');
    const r = await updateAnteproyectoPrototipoReferencia('p1', 'prod-bad');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/no encontrado/i);
  });
});

describe('promoteAnteproyecto (Sprint 4A — rol Dirección por empresa)', () => {
  it('rechaza anteproyectoId vacío', async () => {
    const { promoteAnteproyecto } = await import('./actions');
    const r = await promoteAnteproyecto('');
    expect(r.ok).toBe(false);
  });

  it('rechaza usuario no autenticado', async () => {
    authUserEmail = null;
    const { promoteAnteproyecto } = await import('./actions');
    const r = await promoteAnteproyecto('ap-1');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/autenticado/i);
  });

  it('admin global puede promover sin validar rol Dirección', async () => {
    coreUserRow = { id: 'user-1', rol: 'admin' };
    const { promoteAnteproyecto } = await import('./actions');
    const r = await promoteAnteproyecto('ap-1');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.proyectoId).toBe('desarrollo-1');
  });

  it('user con rol Dirección en la empresa puede promover', async () => {
    coreUserRow = { id: 'user-2', rol: 'viewer' };
    rolesData = [{ id: 'rol-direccion-dilesa' }];
    asignacionesData = [{ rol_id: 'rol-direccion-dilesa' }];
    const { promoteAnteproyecto } = await import('./actions');
    const r = await promoteAnteproyecto('ap-1');
    expect(r.ok).toBe(true);
  });

  it('viewer sin rol Dirección NO puede promover', async () => {
    coreUserRow = { id: 'user-3', rol: 'viewer' };
    rolesData = []; // empresa sin rol "Dirección"
    asignacionesData = [];
    const { promoteAnteproyecto } = await import('./actions');
    const r = await promoteAnteproyecto('ap-1');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/dirección/i);
  });

  it('user con rol Dirección en OTRA empresa NO puede promover', async () => {
    coreUserRow = { id: 'user-4', rol: 'viewer' };
    rolesData = [{ id: 'rol-direccion-dilesa' }];
    asignacionesData = []; // user no asignado
    const { promoteAnteproyecto } = await import('./actions');
    const r = await promoteAnteproyecto('ap-1');
    expect(r.ok).toBe(false);
  });

  it('rechaza si el anteproyecto no existe', async () => {
    coreUserRow = { id: 'user-5', rol: 'viewer' };
    anteproyectoRow = null;
    const { promoteAnteproyecto } = await import('./actions');
    const r = await promoteAnteproyecto('ap-bad');
    expect(r.ok).toBe(false);
  });

  it('rechaza si user no aparece en core.usuarios', async () => {
    coreUserRow = null;
    const { promoteAnteproyecto } = await import('./actions');
    const r = await promoteAnteproyecto('ap-1');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/no encontrado/i);
  });

  it('propaga error de la RPC fn_proyecto_promote_anteproyecto', async () => {
    rpcResult = { data: null, error: { message: 'gate fallido' } };
    const { promoteAnteproyecto } = await import('./actions');
    const r = await promoteAnteproyecto('ap-1');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/gate fallido/);
  });
});

describe('updateAnteproyectoAnalisisCampo (Sprint 4B)', () => {
  it('rechaza proyectoId vacío sin tocar DB', async () => {
    const { updateAnteproyectoAnalisisCampo } = await import('./actions');
    const r = await updateAnteproyectoAnalisisCampo('', 'costo_urbanizacion', 100);
    expect(r.ok).toBe(false);
    expect(lastTable).toBeNull();
  });

  it('rechaza campo fuera de whitelist sin tocar DB', async () => {
    const { updateAnteproyectoAnalisisCampo } = await import('./actions');
    // @ts-expect-error — probamos un campo inválido a propósito.
    const r = await updateAnteproyectoAnalisisCampo('p1', 'rol_secreto', 100);
    expect(r.ok).toBe(false);
    expect(lastTable).toBeNull();
  });

  it('rechaza valor negativo sin tocar DB', async () => {
    const { updateAnteproyectoAnalisisCampo } = await import('./actions');
    const r = await updateAnteproyectoAnalisisCampo('p1', 'costo_urbanizacion', -10);
    expect(r.ok).toBe(false);
    expect(lastTable).toBeNull();
  });

  it('escribe en dilesa.proyectos cuando inputs son válidos', async () => {
    const { updateAnteproyectoAnalisisCampo } = await import('./actions');
    const r = await updateAnteproyectoAnalisisCampo('p1', 'costo_urbanizacion', 5_000_000);
    expect(r.ok).toBe(true);
    expect(lastTable).toBe('proyectos');
    expect(lastPatch).toEqual({ costo_urbanizacion: 5_000_000 });
    expect(lastEqId).toBe('p1');
  });

  it('valor=null pasa válido y limpia la columna', async () => {
    const { updateAnteproyectoAnalisisCampo } = await import('./actions');
    const r = await updateAnteproyectoAnalisisCampo('p1', 'valor_predio', null);
    expect(r.ok).toBe(true);
    expect(lastPatch).toEqual({ valor_predio: null });
  });

  it('propaga error de DB', async () => {
    updateError = { message: 'RLS denied' };
    const { updateAnteproyectoAnalisisCampo } = await import('./actions');
    const r = await updateAnteproyectoAnalisisCampo('p1', 'valor_predio', 100);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/RLS denied/);
  });
});

describe('updateAnteproyectoInfraCabecera (Sprint 4B)', () => {
  it('rechaza proyectoId vacío', async () => {
    const { updateAnteproyectoInfraCabecera } = await import('./actions');
    const r = await updateAnteproyectoInfraCabecera('', true);
    expect(r.ok).toBe(false);
    expect(lastTable).toBeNull();
  });

  it('escribe boolean true en infraestructura_cabecera_necesaria', async () => {
    const { updateAnteproyectoInfraCabecera } = await import('./actions');
    const r = await updateAnteproyectoInfraCabecera('p1', true);
    expect(r.ok).toBe(true);
    expect(lastPatch).toEqual({ infraestructura_cabecera_necesaria: true });
  });

  it('escribe boolean false', async () => {
    const { updateAnteproyectoInfraCabecera } = await import('./actions');
    const r = await updateAnteproyectoInfraCabecera('p1', false);
    expect(r.ok).toBe(true);
    expect(lastPatch).toEqual({ infraestructura_cabecera_necesaria: false });
  });

  it('propaga error de DB', async () => {
    updateError = { message: 'check constraint failed' };
    const { updateAnteproyectoInfraCabecera } = await import('./actions');
    const r = await updateAnteproyectoInfraCabecera('p1', true);
    expect(r.ok).toBe(false);
  });
});

describe('updateAnteproyectoPrototiposReferencia (Sprint 4B)', () => {
  it('rechaza proyectoId vacío', async () => {
    const { updateAnteproyectoPrototiposReferencia } = await import('./actions');
    const r = await updateAnteproyectoPrototiposReferencia('', ['Casa A']);
    expect(r.ok).toBe(false);
    expect(lastTable).toBeNull();
  });

  it('rechaza no-array', async () => {
    const { updateAnteproyectoPrototiposReferencia } = await import('./actions');
    // @ts-expect-error — probamos input inválido.
    const r = await updateAnteproyectoPrototiposReferencia('p1', 'no-soy-array');
    expect(r.ok).toBe(false);
    expect(lastTable).toBeNull();
  });

  it('persiste array normalizado (trim + dedup)', async () => {
    const { updateAnteproyectoPrototiposReferencia } = await import('./actions');
    const r = await updateAnteproyectoPrototiposReferencia('p1', ['  Casa A ', '', 'Casa A']);
    expect(r.ok).toBe(true);
    expect(lastPatch).toEqual({ prototipos_referencia: ['Casa A'] });
  });

  it('persiste array vacío correctamente', async () => {
    const { updateAnteproyectoPrototiposReferencia } = await import('./actions');
    const r = await updateAnteproyectoPrototiposReferencia('p1', []);
    expect(r.ok).toBe(true);
    expect(lastPatch).toEqual({ prototipos_referencia: [] });
  });
});
