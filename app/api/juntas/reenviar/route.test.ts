import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

/**
 * Tests para `POST /api/juntas/reenviar`.
 *
 * Fija el auth gate agregado para cerrar el IDOR: antes el endpoint reenviaba
 * la minuta de cualquier junta a su consejo usando service-role, sin verificar
 * autenticación ni autorización — cualquier usuario logueado podía disparar el
 * reenvío de cualquier junta cross-empresa. Patrón canónico (igual que
 * `juntas/terminar`): auth.getUser() + lookup `core.usuarios` por email +
 * membresía en la empresa dueña de la junta; admin global pasa por encima.
 */

// ── Mocks ──────────────────────────────────────────────────────────────
let serverUser: { email: string } | null = null;
let juntaLookup: {
  estado: string;
  fecha_terminada: string | null;
  duracion_minutos: number | null;
  empresa_id: string;
} | null = null;
let coreUser: { id: string; rol: string; activo: boolean } | null = null;
let membership: { usuario_id: string } | null = null;
let adminAvailable = true;

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
                  single: async () => ({
                    data: juntaLookup,
                    error: juntaLookup ? null : { message: 'not found' },
                  }),
                }),
              }),
            };
          }
          if (schemaName === 'core' && tableName === 'usuarios') {
            return {
              select: () => ({
                eq: () => ({ maybeSingle: async () => ({ data: coreUser, error: null }) }),
              }),
            };
          }
          if (schemaName === 'core' && tableName === 'usuarios_empresas') {
            const chain: any = {
              eq: () => chain,
              maybeSingle: async () => ({ data: membership, error: null }),
            };
            return { select: () => chain };
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

// recipients vacío → el endpoint responde 200 emailsSent:0 sin tocar Resend,
// así el happy path no depende del envío real.
vi.mock('@/lib/juntas/email', () => ({
  buildMinutaEmailPayload: async () => ({ ok: true, recipients: [], empresaId: 'emp-1' }),
  sendMinutaEmail: async () => ({ ok: true, emailId: 'em-1' }),
}));

import { POST } from './route';

beforeEach(() => {
  serverUser = { email: 'beto@anorte.com' };
  juntaLookup = {
    estado: 'completada',
    fecha_terminada: null,
    duracion_minutos: null,
    empresa_id: 'emp-1',
  };
  coreUser = { id: 'u-1', rol: 'admin', activo: true };
  membership = null;
  adminAvailable = true;
  process.env.RESEND_API_KEY = 'test-key';
});

function makeReq(body: unknown = { juntaId: '550e8400-e29b-41d4-a716-446655440000' }): NextRequest {
  return new NextRequest(new URL('http://localhost/api/juntas/reenviar'), {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  });
}

describe('POST /api/juntas/reenviar — auth gate', () => {
  it('400 si juntaId no es UUID válido', async () => {
    const res = await POST(makeReq({ juntaId: 'no-uuid' }));
    expect(res.status).toBe(400);
  });

  it('401 si no hay user en el JWT', async () => {
    serverUser = null;
    const res = await POST(makeReq());
    expect(res.status).toBe(401);
  });

  it('401 si el user no tiene email', async () => {
    serverUser = { email: '' };
    const res = await POST(makeReq());
    expect(res.status).toBe(401);
  });

  it('500 si no hay admin client', async () => {
    adminAvailable = false;
    const res = await POST(makeReq());
    expect(res.status).toBe(500);
  });

  it('404 si la junta no existe', async () => {
    juntaLookup = null;
    const res = await POST(makeReq());
    expect(res.status).toBe(404);
  });

  it('403 si el usuario no está en core.usuarios', async () => {
    coreUser = null;
    const res = await POST(makeReq());
    expect(res.status).toBe(403);
  });

  it('403 si el usuario está inactivo', async () => {
    coreUser = { id: 'u-1', rol: 'consejero', activo: false };
    const res = await POST(makeReq());
    expect(res.status).toBe(403);
  });

  it('403 si no es admin y no tiene membresía en la empresa de la junta', async () => {
    coreUser = { id: 'u-1', rol: 'consejero', activo: true };
    membership = null;
    const res = await POST(makeReq());
    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.error).toBe('Sin acceso a esta empresa');
  });

  it('admin global pasa el gate sin requerir membresía', async () => {
    coreUser = { id: 'u-1', rol: 'admin', activo: true };
    membership = null;
    const res = await POST(makeReq());
    expect(res.status).toBe(200);
  });

  it('no-admin con membresía activa en la empresa pasa el gate', async () => {
    coreUser = { id: 'u-2', rol: 'consejero', activo: true };
    membership = { usuario_id: 'u-2' };
    const res = await POST(makeReq());
    expect(res.status).toBe(200);
  });

  it('400 si la junta no está completada (gate ya pasado)', async () => {
    juntaLookup = {
      estado: 'en_curso',
      fecha_terminada: null,
      duracion_minutos: null,
      empresa_id: 'emp-1',
    };
    const res = await POST(makeReq());
    expect(res.status).toBe(400);
  });
});
