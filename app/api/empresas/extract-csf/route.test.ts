import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

import { buildAdminMock, buildCsfFormData, type AdminScript } from '../_test-helpers';

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

// extract-csf llama a Anthropic + Ghostscript-WASM. Mockeamos ambos.
vi.mock('@/lib/documentos/extraction-core', () => ({
  ensurePdfFitsForClaude: async (b: Uint8Array) => b,
}));

vi.mock('@/lib/proveedores/extract-csf', async () => {
  // Re-export schemas + mock the LLM call.
  const actual = await vi.importActual<typeof import('@/lib/proveedores/extract-csf')>(
    '@/lib/proveedores/extract-csf'
  );
  return {
    ...actual,
    extractCsfWithClaude: async () => ({
      tipo_persona: 'moral',
      rfc: 'ANO8509243H3',
      curp: null,
      nombre: null,
      apellido_paterno: null,
      apellido_materno: null,
      razon_social: 'AUTOS DEL NORTE',
      nombre_comercial: null,
      regimen_fiscal_codigo: '601',
      regimen_fiscal_nombre: 'General de Ley Personas Morales',
      regimenes_adicionales: [],
      domicilio_calle: null,
      domicilio_num_ext: null,
      domicilio_num_int: null,
      domicilio_colonia: null,
      domicilio_cp: null,
      domicilio_municipio: null,
      domicilio_estado: null,
      obligaciones: [],
      fecha_inicio_operaciones: null,
      fecha_emision: '2026-04-01',
      id_cif: '14110980997',
      estatus_sat: 'ACTIVO',
      regimen_capital: 'SOCIEDAD ANONIMA DE CAPITAL VARIABLE',
      actividades_economicas: [],
    }),
  };
});

import { POST } from './route';

beforeEach(() => {
  serverUser = { email: 'admin@example.com' };
  adminScript = {
    callerUser: { id: 'admin-uuid', email: 'admin@example.com', rol: 'admin', activo: true },
  };
  adminAvailable = true;
  process.env.ANTHROPIC_API_KEY = 'test-key';
});

function makeReq(formData: FormData): NextRequest {
  return new NextRequest(new URL('http://localhost/api/empresas/extract-csf'), {
    method: 'POST',
    body: formData,
  });
}

describe('POST /api/empresas/extract-csf', () => {
  it('500 si no hay ANTHROPIC_API_KEY', async () => {
    delete process.env.ANTHROPIC_API_KEY;
    const fd = buildCsfFormData({});
    const res = await POST(makeReq(fd));
    expect(res.status).toBe(500);
  });

  it('401 si no hay user', async () => {
    serverUser = null;
    const fd = buildCsfFormData({});
    const res = await POST(makeReq(fd));
    expect(res.status).toBe(401);
  });

  it('403 si el caller no es admin', async () => {
    adminScript.callerUser = {
      id: 'u1',
      email: 'beto@anorte.com',
      rol: 'usuario',
      activo: true,
    };
    const fd = buildCsfFormData({});
    const res = await POST(makeReq(fd));
    expect(res.status).toBe(403);
  });

  it('400 si falta el campo "file"', async () => {
    const fd = new FormData();
    const res = await POST(makeReq(fd));
    expect(res.status).toBe(400);
  });

  it('415 si el archivo no es PDF', async () => {
    const fd = buildCsfFormData({ fileType: 'image/png', filename: 'csf.png' });
    const res = await POST(makeReq(fd));
    expect(res.status).toBe(415);
  });

  it('413 si el archivo excede 50 MB', async () => {
    // 51 MB
    const fd = buildCsfFormData({ fileSize: 51 * 1024 * 1024 });
    const res = await POST(makeReq(fd));
    expect(res.status).toBe(413);
  });

  it('200 con extracción cuando todo cuadra', async () => {
    const fd = buildCsfFormData({});
    const res = await POST(makeReq(fd));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.extraccion.rfc).toBe('ANO8509243H3');
    expect(json.extraccion.id_cif).toBe('14110980997');
    expect(json.extraccion.estatus_sat).toBe('ACTIVO');
  });
});
