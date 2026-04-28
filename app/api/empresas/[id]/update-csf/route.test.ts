import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

import {
  buildAdminMock,
  buildCsfFormData,
  SAMPLE_EXTRACCION,
  type AdminScript,
} from '../../_test-helpers';

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

import { POST } from './route';

beforeEach(() => {
  serverUser = { email: 'admin@example.com' };
  adminScript = {
    callerUser: { id: 'admin-uuid', email: 'admin@example.com', rol: 'admin', activo: true },
    empresaById: { id: 'e1', slug: 'rdb', rfc: 'OLD123456XX0' },
    insertAdjuntoResult: { data: { id: 'new-adj-id' }, error: null },
    updateEmpresaResult: { error: null },
    storageUploadResult: { error: null },
  };
  adminAvailable = true;
});

function makeReq(
  formData: FormData,
  id = 'e1'
): { req: NextRequest; ctx: { params: Promise<{ id: string }> } } {
  const req = new NextRequest(new URL(`http://localhost/api/empresas/${id}/update-csf`), {
    method: 'POST',
    body: formData,
  });
  return { req, ctx: { params: Promise.resolve({ id }) } };
}

describe('POST /api/empresas/[id]/update-csf', () => {
  it('401 si no hay user', async () => {
    serverUser = null;
    const fd = buildCsfFormData({
      payload: { extraccion: SAMPLE_EXTRACCION, accepted_fields: [] },
    });
    const { req, ctx } = makeReq(fd);
    const res = await POST(req, ctx);
    expect(res.status).toBe(401);
  });

  it('403 si el caller no es admin', async () => {
    adminScript.callerUser = {
      id: 'u1',
      email: 'x@y.com',
      rol: 'usuario',
      activo: true,
    };
    const fd = buildCsfFormData({
      payload: { extraccion: SAMPLE_EXTRACCION, accepted_fields: [] },
    });
    const { req, ctx } = makeReq(fd);
    const res = await POST(req, ctx);
    expect(res.status).toBe(403);
  });

  it('404 si la empresa no existe', async () => {
    adminScript.empresaById = null;
    const fd = buildCsfFormData({
      payload: { extraccion: SAMPLE_EXTRACCION, accepted_fields: [] },
    });
    const { req, ctx } = makeReq(fd);
    const res = await POST(req, ctx);
    expect(res.status).toBe(404);
  });

  it('400 si el accepted_fields trae un key no soportado', async () => {
    const fd = buildCsfFormData({
      payload: {
        extraccion: SAMPLE_EXTRACCION,
        accepted_fields: ['campo_inventado'],
      },
    });
    const { req, ctx } = makeReq(fd);
    const res = await POST(req, ctx);
    expect(res.status).toBe(400);
  });

  it('200 con accepted_fields vacío archiva PDF y NO actualiza csf_url', async () => {
    const fd = buildCsfFormData({
      payload: { extraccion: SAMPLE_EXTRACCION, accepted_fields: [] },
    });
    const { req, ctx } = makeReq(fd);
    const res = await POST(req, ctx);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.fields_updated).toBe(0);
    expect(json.csf_pointer_updated).toBe(false);
    expect(json.new_adjunto_id).toBe('new-adj-id');
  });

  it('200 con campos aceptados (incluye extras de empresa)', async () => {
    const fd = buildCsfFormData({
      payload: {
        extraccion: SAMPLE_EXTRACCION,
        accepted_fields: ['rfc', 'razon_social', 'id_cif', 'estatus_sat'],
      },
    });
    const { req, ctx } = makeReq(fd);
    const res = await POST(req, ctx);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.csf_pointer_updated).toBe(true);
    expect(json.fields_updated).toBeGreaterThan(0);
  });
});
