import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  DICTAMEN_TOKEN_TTL_SECONDS,
  signDictamenToken,
  verifyDictamenToken,
} from './dictamen-token';

const SECRET = 'test-secret-32-bytes-long-padding-padding';

describe('dictamen-token', () => {
  beforeEach(() => {
    process.env.AVALUO_UPLOAD_SECRET = SECRET;
  });
  afterEach(() => {
    delete process.env.AVALUO_UPLOAD_SECRET;
  });

  it('sign + verify roundtrip', async () => {
    const token = await signDictamenToken({ ventaId: 'v-1', notarioId: 'n-1' }, { now: 1_000_000 });
    const res = await verifyDictamenToken(token, { now: 1_000_000 });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.payload.ventaId).toBe('v-1');
      expect(res.payload.notarioId).toBe('n-1');
      expect(res.payload.exp).toBe(1_000_000 + DICTAMEN_TOKEN_TTL_SECONDS);
    }
  });

  it('TTL default = 60 días', () => {
    expect(DICTAMEN_TOKEN_TTL_SECONDS).toBe(60 * 24 * 60 * 60);
  });

  it('rechaza token expirado', async () => {
    const t = await signDictamenToken(
      { ventaId: 'v', notarioId: 'n' },
      { now: 1000, ttlSeconds: 60 }
    );
    const res = await verifyDictamenToken(t, { now: 1100 });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toBe('expired');
  });

  it('rechaza firma manipulada', async () => {
    const t = await signDictamenToken({ ventaId: 'v', notarioId: 'n' }, { now: 1000 });
    const tampered = t.slice(0, -1) + (t.endsWith('a') ? 'b' : 'a');
    const res = await verifyDictamenToken(tampered, { now: 1000 });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toBe('bad_signature');
  });

  it('rechaza token avaluo (purpose distinto)', async () => {
    // Firmamos un token con MIS keys pero con purpose 'avaluo_upload_v1' —
    // verifyDictamenToken debe rechazarlo aunque la firma sea válida.
    // Implementación: armamos manualmente el body, firmamos, y verificamos.
    const body = JSON.stringify({
      v: 'venta-1',
      n: 'not-1',
      exp: 9_999_999_999,
      p: 'avaluo_upload_v1',
    });
    const bodyB64 = btoa(body).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    const key = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(SECRET),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );
    const sigBytes = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(bodyB64));
    let bin = '';
    const arr = new Uint8Array(sigBytes);
    for (let i = 0; i < arr.length; i++) bin += String.fromCharCode(arr[i]!);
    const sigB64 = btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    const tokenConPurposeDistinto = `${bodyB64}.${sigB64}`;
    const res = await verifyDictamenToken(tokenConPurposeDistinto, { now: 1000 });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toBe('malformed');
  });

  it('rechaza si no hay secret', async () => {
    delete process.env.AVALUO_UPLOAD_SECRET;
    const res = await verifyDictamenToken('a.b', { now: 1000 });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toBe('missing_secret');
  });

  it('rechaza token malformed', async () => {
    const res = await verifyDictamenToken('sin-punto', { now: 1000 });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toBe('malformed');
  });

  it('token URL-safe', async () => {
    const t = await signDictamenToken({ ventaId: 'v-uuid', notarioId: 'n-uuid' }, { now: 1000 });
    expect(t).toMatch(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
  });
});
