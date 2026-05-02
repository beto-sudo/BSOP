import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

/**
 * Tests para `POST /api/welcome-email`.
 *
 * Sprint 3A de tech-debt-h1-2026 — fortifica el endpoint que dispara
 * correos de bienvenida via Resend. Sin tests, una regresión podría
 * desactivar el `requireAdmin` gate (cerrado en Sprint 1) y volver a
 * exponer el endpoint públicamente — permitiendo que cualquier llamador
 * dispare correos arbitrarios usando la cuenta Resend.
 *
 * Sprint 1 cerró el gate; este sprint asegura que se mantenga cerrado.
 *
 * Mocks: `requireAdmin` directo (no la chain del admin client — esa se
 * cubre en `app/api/empresas/[id]/route.test.ts` con el mismo helper),
 * + `fetch` global para Supabase REST y Resend, + rate limiter,
 * + `generateWelcomeHtml`.
 */

// ── State del test ─────────────────────────────────────────────────────

let adminAvailable = true;
let adminGuardResult:
  | { ok: true; usuario: { id: string; email: string; rol: 'admin' } }
  | { ok: false; status: 401 | 403; error: string } = {
  ok: true,
  usuario: { id: 'admin-uuid', email: 'admin@example.com', rol: 'admin' },
};
let rateLimitOk = true;
let fetchUsuarioEmpresas: unknown = [];
let fetchResendOk = true;
let fetchResendStatus = 200;
let fetchResendBody: unknown = { id: 'email-123' };

// ── Mocks ──────────────────────────────────────────────────────────────

vi.mock('@/lib/supabase-server', () => ({
  createSupabaseServerClient: async () => ({}),
}));

vi.mock('@/lib/supabase-admin', () => ({
  getSupabaseAdminClient: () => (adminAvailable ? {} : null),
}));

vi.mock('@/lib/empresas/admin-guard', () => ({
  requireAdmin: async () => adminGuardResult,
}));

vi.mock('@/lib/ratelimit', () => ({
  welcomeEmailRateLimiter: {
    check: async () =>
      rateLimitOk
        ? { ok: true }
        : {
            ok: false,
            response: NextResponse.json({ error: 'rate limit exceeded' }, { status: 429 }),
          },
  },
  extractIdentifier: () => 'test-identifier',
}));

vi.mock('@/lib/welcome-email', () => ({
  generateWelcomeHtml: (firstName: string) => `<html>Hola ${firstName}</html>`,
}));

// ── Setup ──────────────────────────────────────────────────────────────

const ORIGINAL_FETCH = global.fetch;
const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  // Reset state
  adminAvailable = true;
  adminGuardResult = {
    ok: true,
    usuario: { id: 'admin-uuid', email: 'admin@example.com', rol: 'admin' },
  };
  rateLimitOk = true;
  fetchUsuarioEmpresas = [];
  fetchResendOk = true;
  fetchResendStatus = 200;
  fetchResendBody = { id: 'email-123' };

  // Env vars
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-key';
  process.env.RESEND_API_KEY = 'test-resend-key';

  // Mock fetch global
  global.fetch = vi.fn().mockImplementation(async (url: string) => {
    if (url.includes('/rest/v1/usuarios_empresas')) {
      return new Response(JSON.stringify(fetchUsuarioEmpresas), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }
    if (url.includes('api.resend.com')) {
      return new Response(JSON.stringify(fetchResendBody), {
        status: fetchResendStatus,
        headers: { 'content-type': 'application/json' },
      });
    }
    throw new Error(`Unexpected fetch URL in test: ${url}`);
  }) as typeof fetch;
});

afterEach(() => {
  global.fetch = ORIGINAL_FETCH;
  process.env = { ...ORIGINAL_ENV };
});

// ── Test ───────────────────────────────────────────────────────────────

import { POST } from './route';

function makeReq(body: unknown): NextRequest {
  return new NextRequest(new URL('http://localhost/api/welcome-email'), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const VALID_PAYLOAD = {
  email: 'newuser@example.com',
  firstName: 'Juan',
  usuarioId: '550e8400-e29b-41d4-a716-446655440000',
};

describe('POST /api/welcome-email', () => {
  it('429 cuando el rate limiter rechaza', async () => {
    rateLimitOk = false;
    const res = await POST(makeReq(VALID_PAYLOAD));
    expect(res.status).toBe(429);
  });

  it('400 si email no es válido', async () => {
    const res = await POST(
      makeReq({
        ...VALID_PAYLOAD,
        email: 'not-an-email',
      })
    );
    expect(res.status).toBe(400);
  });

  it('400 si usuarioId no es UUID', async () => {
    const res = await POST(
      makeReq({
        ...VALID_PAYLOAD,
        usuarioId: 'not-a-uuid',
      })
    );
    expect(res.status).toBe(400);
  });

  it('500 si admin client no está disponible', async () => {
    adminAvailable = false;
    const res = await POST(makeReq(VALID_PAYLOAD));
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.error).toMatch(/admin client/i);
  });

  it('401 si requireAdmin retorna 401', async () => {
    adminGuardResult = { ok: false, status: 401, error: 'No autenticado' };
    const res = await POST(makeReq(VALID_PAYLOAD));
    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.error).toBe('No autenticado');
  });

  it('403 si requireAdmin retorna 403 (caller no admin)', async () => {
    adminGuardResult = {
      ok: false,
      status: 403,
      error: 'Esta acción requiere rol admin',
    };
    const res = await POST(makeReq(VALID_PAYLOAD));
    expect(res.status).toBe(403);
  });

  it('500 si RESEND_API_KEY no está configurado', async () => {
    delete process.env.RESEND_API_KEY;
    const res = await POST(makeReq(VALID_PAYLOAD));
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.error).toBe('RESEND_API_KEY not configured');
  });

  it('200 cuando todo OK con usuarios_empresas vacío (fallback BSOP)', async () => {
    fetchUsuarioEmpresas = [];
    const res = await POST(makeReq(VALID_PAYLOAD));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({ success: true, emailId: 'email-123' });
  });

  it('200 cuando el user pertenece a empresas conocidas', async () => {
    fetchUsuarioEmpresas = [
      {
        empresa_id: 'e1',
        roles: { nombre: 'Director' },
        empresas: { slug: 'rdb', nombre: 'Rincón del Bosque' },
      },
    ];
    const res = await POST(makeReq(VALID_PAYLOAD));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.emailId).toBe('email-123');
  });

  it('500 si Resend retorna error', async () => {
    fetchResendOk = false;
    fetchResendStatus = 500;
    fetchResendBody = { message: 'Resend internal error' };
    const res = await POST(makeReq(VALID_PAYLOAD));
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.error).toBe('Resend failed');
    expect(json.detail).toEqual({ message: 'Resend internal error' });
  });

  it('llama a Resend con el email correcto', async () => {
    const fetchMock = global.fetch as ReturnType<typeof vi.fn>;
    await POST(makeReq(VALID_PAYLOAD));
    const resendCall = fetchMock.mock.calls.find(
      (c: unknown[]) => typeof c[0] === 'string' && c[0].includes('api.resend.com')
    );
    expect(resendCall).toBeDefined();
    if (!resendCall) return;
    const opts = resendCall[1] as { body: string };
    const body = JSON.parse(opts.body);
    expect(body.to).toEqual(['newuser@example.com']);
    expect(body.from).toMatch(/bsop\.io/i);
    expect(body.subject).toMatch(/bienvenido/i);
  });

  it('respeta firstName provided en lugar de fallback al email', async () => {
    const fetchMock = global.fetch as ReturnType<typeof vi.fn>;
    await POST(makeReq({ ...VALID_PAYLOAD, firstName: 'Beto' }));
    const resendCall = fetchMock.mock.calls.find(
      (c: unknown[]) => typeof c[0] === 'string' && c[0].includes('api.resend.com')
    );
    if (!resendCall) throw new Error('Resend no fue llamado');
    const opts = resendCall[1] as { body: string };
    const body = JSON.parse(opts.body);
    // generateWelcomeHtml mock devuelve `<html>Hola ${firstName}</html>`
    expect(body.html).toContain('Hola Beto');
  });
});
