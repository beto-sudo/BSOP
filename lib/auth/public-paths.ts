/**
 * Allowlist de rutas públicas del proxy (middleware de auth).
 *
 * Única fuente de verdad de qué URLs se sirven SIN sesión de Supabase.
 * `proxy.ts` la consume; el contrato vive en `public-paths.test.ts`.
 *
 * Revisión general 2026-06 (§5 Limpieza): antes los magic links funcionaban
 * de chiripa — los tokens firmados llevan un punto (`payload.signature`) y el
 * matcher del proxy (`/((?!.*\\..*).*)`) excluye paths con punto, así que
 * nunca pasaban por el middleware. Esta allowlist los hace explícitos: si el
 * matcher cambia, los links de terceros (clientes, notarios, valuadores)
 * siguen vivos.
 *
 * Reglas para agregar una entrada:
 *   - Páginas/APIs de magic link: SOLO si la ruta valida su propio token
 *     firmado server-side (patrón `lib/dilesa/*-token.ts`).
 *   - `/api/cron/*`: protegidas por header secret de Vercel Cron, no por
 *     sesión.
 *   - Assets/branding: estáticos sin datos.
 */

/** Rutas públicas por igualdad exacta. */
const PUBLIC_EXACT_PATHS = new Set([
  '/login',
  '/auth/callback',
  '/api/auth/google',
  // Ingesta de Health Auto Export (iPhone) — autentica por token propio.
  '/api/health/ingest',
  '/favicon.ico',
  '/logo-bs.png',
  '/logo-bs.jpg',
  '/logo-bsop.jpg',
]);

/** Prefijos públicos (la ruta y todo lo que cuelgue de ella). */
const PUBLIC_PREFIXES = [
  // Magic links firmados — cada superficie verifica su token server-side:
  //   encuesta de satisfacción (cliente), dictamen notarial (notario),
  //   carga de avalúo (valuador). Página + API por cada uno.
  '/dilesa/encuesta/',
  '/dilesa/notario/dictamen/',
  '/dilesa/valuador/avaluo/',
  '/api/dilesa/encuesta/',
  '/api/dilesa/notario/dictamen/',
  '/api/dilesa/valuador/avaluo/',
  // Crons de Vercel — validan su propio secret.
  '/api/cron/',
  // Assets de Next y branding.
  '/_next',
  '/brand/',
];

export function isPublicPath(pathname: string): boolean {
  return (
    PUBLIC_EXACT_PATHS.has(pathname) ||
    PUBLIC_PREFIXES.some((prefix) => pathname.startsWith(prefix))
  );
}
