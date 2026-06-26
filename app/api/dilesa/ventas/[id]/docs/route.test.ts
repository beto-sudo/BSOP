import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

/**
 * Tests para `GET /api/dilesa/ventas/[id]/docs` (Sprint 1 de
 * `dilesa-ventas-captura-colaborativa`).
 *
 * El endpoint existe porque `core.usuarios` es RLS self-only: el "subido
 * por" de terceros solo se resuelve server-side. Cubre el gate de acceso
 * (miembro DILESA o admin) y el mapeo adjunto → DocFase con nombres.
 *
 * Mocks: supabase server (auth.getUser) + admin client con un builder
 * encadenable que enruta resultados por tabla.
 */

// ── State del test ─────────────────────────────────────────────────────

let currentUser: { id: string } | null = { id: 'user-1' };
let adminAvailable = true;
let usuarioRow: { rol: string } | null = null;
let membershipRow: { usuario_id: string } | null = { usuario_id: 'user-1' };
let adjuntosResult: { data: unknown; error: unknown } = { data: [], error: null };
let usuariosNombres: unknown[] = [];

// ── Mocks ──────────────────────────────────────────────────────────────

vi.mock('@/lib/supabase-server', () => ({
  createSupabaseServerClient: async () => ({
    auth: { getUser: async () => ({ data: { user: currentUser } }) },
  }),
}));

vi.mock('@/lib/supabase-admin', () => ({
  getSupabaseAdminClient: () => (adminAvailable ? makeAdmin() : null),
}));

/**
 * Builder encadenable: todos los métodos regresan el mismo objeto; el
 * resultado depende de la tabla. `usuarios` se usa de dos formas (rol del
 * caller via maybeSingle, nombres via await directo del builder) — el
 * thenable cubre la segunda.
 */
function makeTable(tabla: string) {
  const result =
    tabla === 'adjuntos' ? adjuntosResult : { data: tabla === 'usuarios' ? usuariosNombres : [] };
  const builder: Record<string, unknown> = {};
  for (const m of ['select', 'eq', 'in', 'is', 'order']) {
    builder[m] = vi.fn(() => builder);
  }
  builder.maybeSingle = vi.fn(async () =>
    tabla === 'usuarios' ? { data: usuarioRow } : { data: membershipRow }
  );
  builder.then = (resolve: (v: unknown) => unknown) => Promise.resolve(result).then(resolve);
  return builder;
}

function makeAdmin() {
  return { schema: () => ({ from: (tabla: string) => makeTable(tabla) }) };
}

import { GET } from './route';

// ── Helpers ────────────────────────────────────────────────────────────

const VENTA_ID = '11111111-2222-3333-4444-555555555555';

function req(ventaId: string, roles?: string) {
  const url = `http://localhost/api/dilesa/ventas/${ventaId}/docs${
    roles != null ? `?roles=${encodeURIComponent(roles)}` : ''
  }`;
  return GET(new NextRequest(url), { params: Promise.resolve({ id: ventaId }) });
}

beforeEach(() => {
  currentUser = { id: 'user-1' };
  adminAvailable = true;
  usuarioRow = null;
  membershipRow = { usuario_id: 'user-1' };
  adjuntosResult = { data: [], error: null };
  usuariosNombres = [];
});

// ── Tests ──────────────────────────────────────────────────────────────

describe('GET /api/dilesa/ventas/[id]/docs', () => {
  it('400 con ventaId que no es uuid', async () => {
    const res = await req('no-es-uuid', 'factura');
    expect(res.status).toBe(400);
  });

  it('400 sin roles válidos', async () => {
    expect((await req(VENTA_ID)).status).toBe(400);
    expect((await req(VENTA_ID, ' , ,DROP TABLE')).status).toBe(400);
  });

  it('401 sin sesión', async () => {
    currentUser = null;
    const res = await req(VENTA_ID, 'factura');
    expect(res.status).toBe(401);
  });

  it('403 sin membresía DILESA ni rol admin', async () => {
    membershipRow = null;
    usuarioRow = { rol: 'viewer' };
    const res = await req(VENTA_ID, 'factura');
    expect(res.status).toBe(403);
  });

  it('permite al admin global sin membresía', async () => {
    membershipRow = null;
    usuarioRow = { rol: 'admin' };
    const res = await req(VENTA_ID, 'factura');
    expect(res.status).toBe(200);
  });

  it('500 si la lectura de adjuntos falla', async () => {
    adjuntosResult = { data: null, error: { message: 'boom' } };
    const res = await req(VENTA_ID, 'factura');
    expect(res.status).toBe(500);
  });

  it('mapea adjuntos a DocFase con nombres resueltos server-side', async () => {
    adjuntosResult = {
      data: [
        {
          id: 'adj-1',
          rol: 'factura',
          nombre: 'factura.pdf',
          url: 'dilesa/ventas/v1/factura.pdf',
          tipo_mime: 'application/pdf',
          tamano_bytes: '5082',
          uploaded_by: 'user-norberto',
          created_at: '2026-06-12T16:00:00Z',
        },
        {
          id: 'adj-2',
          rol: 'aviso_pld',
          nombre: 'pld.pdf',
          url: 'dilesa/ventas/v1/pld.pdf',
          tipo_mime: null,
          tamano_bytes: null,
          uploaded_by: null,
          created_at: '2026-06-12T15:00:00Z',
        },
      ],
      error: null,
    };
    usuariosNombres = [
      { id: 'user-norberto', first_name: 'Norberto', last_name: 'Gutierrez', email: 'n@d.mx' },
    ];

    const res = await req(VENTA_ID, 'factura,aviso_pld');
    expect(res.status).toBe(200);
    const json = (await res.json()) as { ok: boolean; docs: Record<string, unknown>[] };
    expect(json.ok).toBe(true);
    expect(json.docs).toHaveLength(2);

    const factura = json.docs.find((d) => d.rol === 'factura')!;
    expect(factura.subidoPorNombre).toBe('Norberto Gutierrez');
    expect(factura.tamanoBytes).toBe(5082);
    expect(factura.subidoAt).toBe('2026-06-12T16:00:00Z');

    const pld = json.docs.find((d) => d.rol === 'aviso_pld')!;
    expect(pld.subidoPorNombre).toBeNull();
    expect(pld.tamanoBytes).toBeNull();
  });
});
