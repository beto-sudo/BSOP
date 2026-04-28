import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

import {
  buildAdminMock,
  buildCsfFormData,
  SAMPLE_EXTRACCION,
  type AdminScript,
} from '../_test-helpers';

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
    empresaByRfc: null,
    empresaBySlug: null,
    insertEmpresaResult: { data: { id: 'new-emp-id', slug: 'test-empresa' }, error: null },
    insertAdjuntoResult: { data: { id: 'new-adj-id' }, error: null },
    updateEmpresaResult: { error: null },
    storageUploadResult: { error: null },
  };
  adminAvailable = true;
});

function makeReq(formData: FormData): NextRequest {
  return new NextRequest(new URL('http://localhost/api/empresas/create-with-csf'), {
    method: 'POST',
    body: formData,
  });
}

describe('POST /api/empresas/create-with-csf', () => {
  it('401 si no hay user', async () => {
    serverUser = null;
    const fd = buildCsfFormData({
      payload: {
        extraccion: SAMPLE_EXTRACCION,
        slug: 'test-empresa',
        nombre: 'Test',
      },
    });
    const res = await POST(makeReq(fd));
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
      payload: {
        extraccion: SAMPLE_EXTRACCION,
        slug: 'test-empresa',
        nombre: 'Test',
      },
    });
    const res = await POST(makeReq(fd));
    expect(res.status).toBe(403);
  });

  it('400 si falta payload', async () => {
    const fd = buildCsfFormData({});
    const res = await POST(makeReq(fd));
    expect(res.status).toBe(400);
  });

  it('400 si el slug no es kebab-case', async () => {
    const fd = buildCsfFormData({
      payload: {
        extraccion: SAMPLE_EXTRACCION,
        slug: 'BadSlug',
        nombre: 'Test',
      },
    });
    const res = await POST(makeReq(fd));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/payload inválido/i);
  });

  it('409 si el RFC ya existe en core.empresas', async () => {
    adminScript.empresaByRfc = { id: 'old-emp', slug: 'rdb' };
    const fd = buildCsfFormData({
      payload: {
        extraccion: SAMPLE_EXTRACCION,
        slug: 'test-empresa',
        nombre: 'Test',
      },
    });
    const res = await POST(makeReq(fd));
    expect(res.status).toBe(409);
    const json = await res.json();
    expect(json.error).toBe('rfc_duplicado');
    expect(json.existing_empresa_id).toBe('old-emp');
    expect(json.existing_slug).toBe('rdb');
  });

  it('409 si el slug ya existe en core.empresas', async () => {
    adminScript.empresaBySlug = { id: 'other-emp' };
    const fd = buildCsfFormData({
      payload: {
        extraccion: SAMPLE_EXTRACCION,
        slug: 'test-empresa',
        nombre: 'Test',
      },
    });
    const res = await POST(makeReq(fd));
    expect(res.status).toBe(409);
    const json = await res.json();
    expect(json.error).toBe('slug_duplicado');
  });

  it('500 si el upload del PDF falla (con partial)', async () => {
    adminScript.storageUploadResult = { error: { message: 'storage broke' } };
    const fd = buildCsfFormData({
      payload: {
        extraccion: SAMPLE_EXTRACCION,
        slug: 'test-empresa',
        nombre: 'Test',
      },
    });
    const res = await POST(makeReq(fd));
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.partial?.empresa_id).toBe('new-emp-id');
  });

  it('200 con flujo completo OK', async () => {
    const fd = buildCsfFormData({
      payload: {
        extraccion: SAMPLE_EXTRACCION,
        slug: 'test-empresa',
        nombre: 'Test',
      },
    });
    const res = await POST(makeReq(fd));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.empresa_id).toBe('new-emp-id');
    expect(json.slug).toBe('test-empresa');
    expect(json.adjunto_id).toBe('new-adj-id');
  });
});
