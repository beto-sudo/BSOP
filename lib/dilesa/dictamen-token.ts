/**
 * Tokens firmados para que el notario suba la Carta de Instrucción
 * Notarial directamente desde el email — sin login.
 *
 * Iniciativa `dilesa-portafolio-activos` Sprint 7f (post-Fase 6).
 * Análogo a `avaluo-token.ts` pero con `purpose='dictamen_upload_v1'`.
 *
 * Reusa el mismo secret `AVALUO_UPLOAD_SECRET` que ya tenemos en
 * 1Password + Vercel. Conceptualmente es el "magic-link secret" de
 * DILESA — un solo HMAC para todos los flujos (avalúo, dictamen,
 * futuros). El `purpose` del payload diferencia uso, así que firmar
 * un token de avalúo NO sirve para subir dictamen y viceversa.
 *
 * Estructura: `<payload-b64url>.<signature-b64url>` — JWT-like sin
 * header. Mismo formato que `avaluo-token.ts` para que un eventual
 * refactor a un helper común sea trivial.
 */

const PURPOSE = 'dictamen_upload_v1';

export interface DictamenTokenPayload {
  /** Venta sobre la que el notario puede subir el dictamen. */
  ventaId: string;
  /** Notario autorizado por este token. */
  notarioId: string;
  /** Fecha de expiración (epoch segundos). */
  exp: number;
}

interface VerifyOk {
  ok: true;
  payload: DictamenTokenPayload;
}

interface VerifyFail {
  ok: false;
  error: 'malformed' | 'bad_signature' | 'expired' | 'missing_secret';
}

export type VerifyResult = VerifyOk | VerifyFail;

/** TTL canónico = 60 días. El dictamen tarda más que el avalúo. */
export const DICTAMEN_TOKEN_TTL_SECONDS = 60 * 24 * 60 * 60;

export async function signDictamenToken(
  payload: { ventaId: string; notarioId: string },
  options?: { ttlSeconds?: number; now?: number }
): Promise<string> {
  const secret = process.env.AVALUO_UPLOAD_SECRET;
  if (!secret) {
    throw new Error('AVALUO_UPLOAD_SECRET no configurado');
  }
  const nowSec = options?.now ?? Math.floor(Date.now() / 1000);
  const exp = nowSec + (options?.ttlSeconds ?? DICTAMEN_TOKEN_TTL_SECONDS);

  const body = JSON.stringify({
    v: payload.ventaId,
    n: payload.notarioId,
    exp,
    p: PURPOSE,
  });
  const bodyB64 = base64urlEncode(new TextEncoder().encode(body));
  const sigB64 = await hmacSign(bodyB64, secret);
  return `${bodyB64}.${sigB64}`;
}

export async function verifyDictamenToken(
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

  let parsed: { v?: string; n?: string; exp?: number; p?: string };
  try {
    const bodyBytes = base64urlDecode(bodyB64);
    parsed = JSON.parse(new TextDecoder().decode(bodyBytes));
  } catch {
    return { ok: false, error: 'malformed' };
  }

  if (
    typeof parsed.v !== 'string' ||
    typeof parsed.n !== 'string' ||
    typeof parsed.exp !== 'number' ||
    parsed.p !== PURPOSE
  ) {
    return { ok: false, error: 'malformed' };
  }

  const nowSec = options?.now ?? Math.floor(Date.now() / 1000);
  if (parsed.exp <= nowSec) {
    return { ok: false, error: 'expired' };
  }

  return {
    ok: true,
    payload: { ventaId: parsed.v, notarioId: parsed.n, exp: parsed.exp },
  };
}

// ── Helpers internos (idénticos a avaluo-token.ts) ────────────────────────

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
