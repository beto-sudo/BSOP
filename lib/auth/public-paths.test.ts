import { describe, expect, it } from 'vitest';
import { isPublicPath } from './public-paths';

/**
 * Contrato de la allowlist pública del proxy.
 *
 * Si un test de PP1-PP3 rompe, un magic link enviado a un tercero (cliente,
 * notario, valuador) va a redirigir a /login — revisar antes de mergear.
 */
describe('isPublicPath', () => {
  // PP1 — magic links: página + API públicas para cada superficie firmada.
  it.each([
    '/dilesa/encuesta/eyJ2IjoiLi4ifQ.c2ln',
    '/dilesa/notario/dictamen/eyJ2IjoiLi4ifQ.c2ln',
    '/dilesa/valuador/avaluo/eyJ2IjoiLi4ifQ.c2ln',
    '/api/dilesa/encuesta/eyJ2IjoiLi4ifQ.c2ln',
    '/api/dilesa/notario/dictamen/eyJ2IjoiLi4ifQ.c2ln',
    '/api/dilesa/valuador/avaluo/eyJ2IjoiLi4ifQ.c2ln',
  ])('PP1: magic link público — %s', (path) => {
    expect(isPublicPath(path)).toBe(true);
  });

  // PP2 — infraestructura pública: auth, crons, ingesta de salud, assets.
  it.each([
    '/login',
    '/auth/callback',
    '/api/auth/google',
    '/api/cron/daily-briefing',
    '/api/health/ingest',
    '/_next/static/chunk.js',
    '/favicon.ico',
    '/brand/dilesa/logo.svg',
  ])('PP2: infraestructura pública — %s', (path) => {
    expect(isPublicPath(path)).toBe(true);
  });

  // PP3 — todo lo demás exige sesión. Incluye los padres de los magic links
  // (sin token no hay acceso) y rutas de app operativa.
  it.each([
    '/',
    '/dilesa',
    '/dilesa/ventas',
    '/dilesa/encuesta', // sin token ni slash final → privada
    '/dilesa/notario/dictamen',
    '/dilesa/valuador/avaluo',
    '/api/dilesa/ventas/abc/encuesta', // API interna (genera el link) — privada
    '/rdb/pos',
    '/settings/acceso',
    '/api/impersonate',
  ])('PP3: privada — %s', (path) => {
    expect(isPublicPath(path)).toBe(false);
  });

  // PP4 — /compartir/ se retiró de la allowlist (la ruta no existe en app/).
  it('PP4: /compartir/ ya no es pública', () => {
    expect(isPublicPath('/compartir/loquesea')).toBe(false);
  });
});
