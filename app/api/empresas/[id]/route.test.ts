import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

import { buildAdminMock, type AdminScript } from '../_test-helpers';

// ── Mocks ──────────────────────────────────────────────────────────────

let serverUser: { email: string } | null = null;
let adminScript: AdminScript = {};
let adminAvailable = true;

vi.mock('@/lib/supabase-server', () => ({
  createSupabaseServerClient: async () => ({
    auth: { getUser: async () => ({ data: { user: serverUser } }) },
  }),
}));

vi.mock('@/lib/supabase-admin', () => ({
  getSupabaseAdminClient: () => (adminAvailable ? buildAdminMock(adminScript) : null),
}));

// ── Test ───────────────────────────────────────────────────────────────

import { PATCH } from './route';

beforeEach(() => {
  serverUser = { email: 'admin@example.com' };
  adminScript = {
    callerUser: { id: 'admin-uuid', email: 'admin@example.com', rol: 'admin', activo: true },
    empresaById: { id: 'e1', slug: 'rdb', rfc: null },
  };
  adminAvailable = true;
});

function makeReq(
  body: unknown,
  id = 'e1'
): { req: NextRequest; ctx: { params: Promise<{ id: string }> } } {
  const req = new NextRequest(new URL(`http://localhost/api/empresas/${id}`), {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { req, ctx: { params: Promise.resolve({ id }) } };
}

describe('PATCH /api/empresas/[id]', () => {
  it('401 si no hay user en JWT', async () => {
    serverUser = null;
    const { req, ctx } = makeReq({ registro_patronal_imss: 'A0000000000' });
    const res = await PATCH(req, ctx);
    expect(res.status).toBe(401);
  });

  it('403 si el caller no es admin', async () => {
    adminScript.callerUser = {
      id: 'u1',
      email: 'beto@anorte.com',
      rol: 'usuario',
      activo: true,
    };
    const { req, ctx } = makeReq({ registro_patronal_imss: 'A0000000000' });
    const res = await PATCH(req, ctx);
    expect(res.status).toBe(403);
  });

  it('500 si no hay admin client', async () => {
    adminAvailable = false;
    const { req, ctx } = makeReq({ registro_patronal_imss: 'A0000000000' });
    const res = await PATCH(req, ctx);
    expect(res.status).toBe(500);
  });

  it('400 si registro_patronal_imss tiene formato inválido', async () => {
    const { req, ctx } = makeReq({ registro_patronal_imss: '12345' });
    const res = await PATCH(req, ctx);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/payload inválido/i);
  });

  it('400 si el body trae llaves desconocidas (strict)', async () => {
    const { req, ctx } = makeReq({ campo_random: 'x' });
    const res = await PATCH(req, ctx);
    expect(res.status).toBe(400);
  });

  it('400 si el body está vacío', async () => {
    const { req, ctx } = makeReq({});
    const res = await PATCH(req, ctx);
    expect(res.status).toBe(400);
  });

  it('404 si la empresa no existe', async () => {
    adminScript.empresaById = null;
    const { req, ctx } = makeReq({ registro_patronal_imss: 'A0000000000' });
    const res = await PATCH(req, ctx);
    expect(res.status).toBe(404);
  });

  it('200 con un registro_patronal_imss válido', async () => {
    const { req, ctx } = makeReq({ registro_patronal_imss: 'C8520138108' });
    const res = await PATCH(req, ctx);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.empresa_id).toBe('e1');
    expect(json.fields_updated).toContain('registro_patronal_imss');
  });

  it('200 con cadena vacía limpia el campo (transforma a null)', async () => {
    const { req, ctx } = makeReq({ registro_patronal_imss: '' });
    const res = await PATCH(req, ctx);
    expect(res.status).toBe(200);
  });

  it('200 con null limpia el campo', async () => {
    const { req, ctx } = makeReq({ registro_patronal_imss: null });
    const res = await PATCH(req, ctx);
    expect(res.status).toBe(200);
  });

  it('200 con varios campos editables a la vez (override manual)', async () => {
    const { req, ctx } = makeReq({
      razon_social: 'NUEVA RAZÓN SOCIAL',
      domicilio_calle: 'Av. Reforma',
      domicilio_numero_ext: '100',
      regimen_fiscal: 'General de Ley Personas Morales',
    });
    const res = await PATCH(req, ctx);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.fields_updated).toContain('razon_social');
    expect(json.fields_updated).toContain('domicilio_calle');
    expect(json.fields_updated).toContain('domicilio_numero_ext');
    expect(json.fields_updated).toContain('regimen_fiscal');
  });

  it('200 con cadena vacía en cualquier campo editable lo limpia (→ null)', async () => {
    const { req, ctx } = makeReq({ domicilio_numero_int: '' });
    const res = await PATCH(req, ctx);
    expect(res.status).toBe(200);
  });

  it('400 si llega una llave fuera del set permitido (strict)', async () => {
    const { req, ctx } = makeReq({
      razon_social: 'X',
      campo_inventado: 'Y',
    });
    const res = await PATCH(req, ctx);
    expect(res.status).toBe(400);
  });
});
