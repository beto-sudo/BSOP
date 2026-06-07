/**
 * Tokens firmados para que el valuador suba el dictamen del avalúo
 * directamente desde el email — sin login.
 *
 * Iniciativa `dilesa-portafolio-activos` Sprint 7d (post-merge).
 *
 * Estructura del token: `<payload>.<signature>`
 *   - payload: base64url(JSON({ v, a, exp }))
 *     - v: ventaId
 *     - a: valuadorId
 *     - exp: epoch segundos cuando expira
 *   - signature: base64url(HMAC-SHA256(payload, AVALUO_UPLOAD_SECRET))
 *
 * Por qué no JWT real:
 *   - No necesitamos header (alg fijo HS256, sin variantes)
 *   - Más corto en URL (caben en `https://bsop.io/dilesa/valuador/avaluo/<token>`)
 *   - Sin dependencias (Web Crypto API directo)
 *
 * Seguridad:
 *   - Secret de 32 bytes (base64) en `AVALUO_UPLOAD_SECRET`
 *   - Validación constant-time del HMAC para evitar timing attacks
 *   - Verificación de expiración explícita
 *   - El token NO carga permisos — el caller debe re-verificar
 *     `ventaId` + `valuadorId` contra la DB y la fase de la venta.
 */

const PURPOSE = 'avaluo_upload_v1';

export interface AvaluoTokenPayload {
  /** Venta sobre la que el valuador puede subir el avalúo. */
  ventaId: string;
  /** Valuador autorizado por este token. */
  valuadorId: string;
  /** Fecha de expiración (epoch segundos). */
  exp: number;
}

interface VerifyOk {
  ok: true;
  payload: AvaluoTokenPayload;
}

interface VerifyFail {
  ok: false;
  error: 'malformed' | 'bad_signature' | 'expired' | 'missing_secret';
}

export type VerifyResult = VerifyOk | VerifyFail;

/** TTL canónico = 30 días en segundos. Decision Beto. */
export const AVALUO_TOKEN_TTL_SECONDS = 30 * 24 * 60 * 60;

/**
 * Genera un token firmado para subir el avalúo de una venta.
 *
 * `now` permite testear deterministicamente; en prod no se pasa.
 */
export async function signAvaluoToken(
  payload: { ventaId: string; valuadorId: string },
  options?: { ttlSeconds?: number; now?: number }
): Promise<string> {
  const secret = process.env.AVALUO_UPLOAD_SECRET;
  if (!secret) {
    throw new Error('AVALUO_UPLOAD_SECRET no configurado');
  }
  const nowSec = options?.now ?? Math.floor(Date.now() / 1000);
  const exp = nowSec + (options?.ttlSeconds ?? AVALUO_TOKEN_TTL_SECONDS);

  // Compactamos las keys del JSON: 'v', 'a', 'exp'. Reduce ~20 chars el token.
  const body = JSON.stringify({
    v: payload.ventaId,
    a: payload.valuadorId,
    exp,
    p: PURPOSE,
  });
  const bodyB64 = base64urlEncode(new TextEncoder().encode(body));
  const sigB64 = await hmacSign(bodyB64, secret);
  return `${bodyB64}.${sigB64}`;
}

/**
 * Verifica el token. Retorna `payload` si es válido y no expiró,
 * o un `error` específico para mostrar mensaje claro al valuador.
 */
export async function verifyAvaluoToken(
  token: string,
  options?: { now?: number }
): Promise<VerifyResult> {
  const secret = process.env.AVALUO_UPLOAD_SECRET;
  if (!secret) return { ok: false, error: 'missing_secret' };

  const parts = token.split('.');
  if (parts.length !== 2) return { ok: false, error: 'malformed' };
  const [bodyB64, sigB64] = parts as [string, string];

  // Validación constant-time del HMAC. Si la firma no calza no decodificamos
  // el body (defensa contra payloads tóxicos).
  const expectedSig = await hmacSign(bodyB64, secret);
  if (!constantTimeEqual(sigB64, expectedSig)) {
    return { ok: false, error: 'bad_signature' };
  }

  let parsed: { v?: string; a?: string; exp?: number; p?: string };
  try {
    const bodyBytes = base64urlDecode(bodyB64);
    parsed = JSON.parse(new TextDecoder().decode(bodyBytes));
  } catch {
    return { ok: false, error: 'malformed' };
  }

  if (
    typeof parsed.v !== 'string' ||
    typeof parsed.a !== 'string' ||
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
    payload: { ventaId: parsed.v, valuadorId: parsed.a, exp: parsed.exp },
  };
}

// ── Helpers internos ──────────────────────────────────────────────────────

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
  // btoa requiere binary string; convertimos byte a byte.
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

/**
 * Comparación constant-time de strings — clave para validación de
 * firmas. Si las longitudes difieren, se devuelve `false` inmediatamente
 * (no es leak — la longitud de la firma es pública).
 */
function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}
