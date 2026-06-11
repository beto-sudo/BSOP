/**
 * Tokens firmados para que el cliente responda la Encuesta de Conformidad
 * posventa (Fase 16) desde el email/WhatsApp — sin login.
 *
 * Iniciativa `dilesa-ventas-expediente` · S5 final. Análogo a
 * `dictamen-token.ts` / `avaluo-token.ts` pero con
 * `purpose='encuesta_posventa_v1'`. Reusa el mismo secret
 * `AVALUO_UPLOAD_SECRET` (el "magic-link secret" de DILESA); el `purpose`
 * del payload diferencia uso.
 *
 * Estructura: `<payload-b64url>.<signature-b64url>` — JWT-like sin header.
 */

const PURPOSE = 'encuesta_posventa_v1';

export interface EncuestaTokenPayload {
  /** Venta cuya encuesta puede responder este token. */
  ventaId: string;
  /** Fecha de expiración (epoch segundos). */
  exp: number;
}

interface VerifyOk {
  ok: true;
  payload: EncuestaTokenPayload;
}

interface VerifyFail {
  ok: false;
  error: 'malformed' | 'bad_signature' | 'expired' | 'missing_secret';
}

export type VerifyResult = VerifyOk | VerifyFail;

/** TTL canónico = 90 días (el cliente puede responder tarde y sigue valiendo). */
export const ENCUESTA_TOKEN_TTL_SECONDS = 90 * 24 * 60 * 60;

export async function signEncuestaToken(
  payload: { ventaId: string },
  options?: { ttlSeconds?: number; now?: number }
): Promise<string> {
  const secret = process.env.AVALUO_UPLOAD_SECRET;
  if (!secret) {
    throw new Error('AVALUO_UPLOAD_SECRET no configurado');
  }
  const nowSec = options?.now ?? Math.floor(Date.now() / 1000);
  const exp = nowSec + (options?.ttlSeconds ?? ENCUESTA_TOKEN_TTL_SECONDS);

  const body = JSON.stringify({ v: payload.ventaId, exp, p: PURPOSE });
  const bodyB64 = base64urlEncode(new TextEncoder().encode(body));
  const sigB64 = await hmacSign(bodyB64, secret);
  return `${bodyB64}.${sigB64}`;
}

export async function verifyEncuestaToken(
  token: string,
  options?: { now?: number }
): Promise<VerifyResult> {
  const secret = process.env.AVALUO_UPLOAD_SECRET;
  if (!secret) return { ok: false, error: 'missing_secret' };

  const parts = token.split('.');
  if (parts.length !== 2) return { ok: false, error: 'malformed' };
  const [bodyB64, sigB64] = parts as [string, string];

  const expectedSig = await hmacSign(bodyB64, secret);
  if (!constantTimeEqual(sigB64, expectedSig)) {
    return { ok: false, error: 'bad_signature' };
  }

  let parsed: { v?: string; exp?: number; p?: string };
  try {
    const bodyBytes = base64urlDecode(bodyB64);
    parsed = JSON.parse(new TextDecoder().decode(bodyBytes));
  } catch {
    return { ok: false, error: 'malformed' };
  }

  if (typeof parsed.v !== 'string' || typeof parsed.exp !== 'number' || parsed.p !== PURPOSE) {
    return { ok: false, error: 'malformed' };
  }

  const nowSec = options?.now ?? Math.floor(Date.now() / 1000);
  if (parsed.exp <= nowSec) {
    return { ok: false, error: 'expired' };
  }

  return { ok: true, payload: { ventaId: parsed.v, exp: parsed.exp } };
}

// ── Helpers internos (idénticos a dictamen-token.ts) ──────────────────────

async function hmacSign(data: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(data));
  return base64urlEncode(new Uint8Array(sig));
}

function base64urlEncode(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i++) {
    bin += String.fromCharCode(bytes[i]!);
  }
  const b64 = btoa(bin);
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64urlDecode(s: string): Uint8Array {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4);
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}
