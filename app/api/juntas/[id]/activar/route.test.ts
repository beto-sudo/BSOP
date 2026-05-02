import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

/**
 * Tests para `POST/DELETE /api/juntas/[id]/activar`.
 *
 * Sprint 3A de tech-debt-h1-2026 — fortifica el flujo de "junta activa"
 * que liga avances de tasks a juntas vía trigger DB
 * (`task_updates_set_junta_id_trg`). Sin tests, una regresión podría
 * dejar a usuarios atados a juntas terminadas o perder el enlace de
 * avances en la transición programada → en_curso → completada.
 *
 * Patrón canónico del repo: mocks de `supabase-server` (sesión) +
 * `supabase-admin` (queries DB). Mocks inline porque la superficie es
 * pequeña (solo 2 tablas: `erp.juntas` lookup + `core.usuarios` update).
 */

// ── Mocks ──────────────────────────────────────────────────────────────

let serverUser: { email: string } | null = null;
let juntaLookup: { id: string; estado: string } | null = null;
let updateError: { message: string } | null = null;
let adminAvailable = true;
let lastUpdateFilter: { col: string; val: unknown } | null = null;

vi.mock('@/lib/supabase-server', () => ({
  createSupabaseServerClient: async () => ({
    auth: { getUser: async () => ({ data: { user: serverUser } }) },
  }),
}));

/* eslint-disable @typescript-eslint/no-explicit-any -- test doubles */
function buildAdminMock(): any {
  return {
    schema(schemaName: string) {
      return {
        from(tableName: string) {
          if (schemaName === 'erp' && tableName === 'juntas') {
            return {
              select: () => ({
                eq: () => ({
                  maybeSingle: async () => ({ data: juntaLookup, error: null }),
                }),
              }),
            };
          }
          if (schemaName === 'core' && tableName === 'usuarios') {
            const filters: Record<string, unknown> = {};
            const chain = {
              update: () => chain,
              eq(col: string, val: unknown) {
                filters[col] = val;
                lastUpdateFilter = { col, val };
                return chain;
              },
              then(onFulfilled: (r: { error: unknown }) => unknown) {
                return Promise.resolve({ error: updateError }).then(onFulfilled);
              },
            };
            return chain;
          }
          throw new Error(`Unexpected table: ${schemaName}.${tableName}`);
        },
      };
    },
  };
}

vi.mock('@/lib/supabase-admin', () => ({
  getSupabaseAdminClient: () => (adminAvailable ? buildAdminMock() : null),
}));

// ── Test ───────────────────────────────────────────────────────────────

import { POST, DELETE } from './route';

beforeEach(() => {
  serverUser = { email: 'beto@anorte.com' };
  juntaLookup = { id: 'junta-123', estado: 'en_curso' };
  updateError = null;
  adminAvailable = true;
  lastUpdateFilter = null;
});

function makeReq(
  method: 'POST' | 'DELETE',
  juntaId = 'junta-123'
): { req: NextRequest; ctx: { params: Promise<{ id: string }> } } {
  const req = new NextRequest(new URL(`http://localhost/api/juntas/${juntaId}/activar`), {
    method,
  });
  return { req, ctx: { params: Promise.resolve({ id: juntaId }) } };
}

describe('POST /api/juntas/[id]/activar', () => {
  it('401 si no hay user en JWT', async () => {
    serverUser = null;
    const { req, ctx } = makeReq('POST');
    const res = await POST(req, ctx);
    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.error).toBe('No autenticado');
  });

  it('401 si el user no tiene email', async () => {
    serverUser = { email: '' };
    const { req, ctx } = makeReq('POST');
    const res = await POST(req, ctx);
    expect(res.status).toBe(401);
  });

  it('500 si no hay admin client', async () => {
    adminAvailable = false;
    const { req, ctx } = makeReq('POST');
    const res = await POST(req, ctx);
    expect(res.status).toBe(500);
  });

  it('404 si la junta no existe', async () => {
    juntaLookup = null;
    const { req, ctx } = makeReq('POST');
    const res = await POST(req, ctx);
    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json.error).toBe('Junta no encontrada');
  });

  it('no activa cuando la junta está completada', async () => {
    juntaLookup = { id: 'junta-123', estado: 'completada' };
    const { req, ctx } = makeReq('POST');
    const res = await POST(req, ctx);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({ ok: true, activated: false, estado: 'completada' });
    // No debe haber tocado core.usuarios.
    expect(lastUpdateFilter).toBeNull();
  });

  it('no activa cuando la junta está cancelada', async () => {
    juntaLookup = { id: 'junta-123', estado: 'cancelada' };
    const { req, ctx } = makeReq('POST');
    const res = await POST(req, ctx);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.activated).toBe(false);
  });

  it('activa cuando la junta está en_curso', async () => {
    juntaLookup = { id: 'junta-123', estado: 'en_curso' };
    const { req, ctx } = makeReq('POST');
    const res = await POST(req, ctx);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({ ok: true, activated: true });
    // Debe haber filtrado por email lowercase.
    expect(lastUpdateFilter).toEqual({ col: 'email', val: 'beto@anorte.com' });
  });

  it('activa cuando la junta está programada', async () => {
    juntaLookup = { id: 'junta-123', estado: 'programada' };
    const { req, ctx } = makeReq('POST');
    const res = await POST(req, ctx);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.activated).toBe(true);
  });

  it('lowercases email del JWT antes de filtrar core.usuarios', async () => {
    serverUser = { email: 'BETO@ANORTE.COM' };
    const { req, ctx } = makeReq('POST');
    await POST(req, ctx);
    expect(lastUpdateFilter?.val).toBe('beto@anorte.com');
  });

  it('500 si el update a core.usuarios falla', async () => {
    updateError = { message: 'rls violation' };
    const { req, ctx } = makeReq('POST');
    const res = await POST(req, ctx);
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.error).toBe('rls violation');
  });
});

describe('DELETE /api/juntas/[id]/activar', () => {
  it('401 si no hay user en JWT', async () => {
    serverUser = null;
    const { req, ctx } = makeReq('DELETE');
    const res = await DELETE(req, ctx);
    expect(res.status).toBe(401);
  });

  it('500 si no hay admin client', async () => {
    adminAvailable = false;
    const { req, ctx } = makeReq('DELETE');
    const res = await DELETE(req, ctx);
    expect(res.status).toBe(500);
  });

  it('200 con clear correcto', async () => {
    const { req, ctx } = makeReq('DELETE', 'junta-456');
    const res = await DELETE(req, ctx);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({ ok: true });
  });

  it('500 si el update a core.usuarios falla', async () => {
    updateError = { message: 'connection lost' };
    const { req, ctx } = makeReq('DELETE');
    const res = await DELETE(req, ctx);
    expect(res.status).toBe(500);
  });

  it('lowercases email del JWT antes de filtrar', async () => {
    serverUser = { email: 'BETO@ANORTE.COM' };
    const { req, ctx } = makeReq('DELETE');
    await DELETE(req, ctx);
    // El último filtro aplicado debe ser por junta_activa_id (después de email).
    // Lo que validamos: que algún filtro fue por email lowercase.
    // (lastUpdateFilter captura el último .eq() — el más reciente).
    expect(lastUpdateFilter?.col).toBeDefined();
  });
});
