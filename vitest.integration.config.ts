import { defineConfig } from 'vitest/config';
import path from 'node:path';

/**
 * Vitest configuration for **integration tests** (Sprint 3C de
 * `tech-debt-h1-2026`).
 *
 * Diferencia clave vs `vitest.config.ts`:
 *   - Apunta a `tests/integration/**` exclusivamente.
 *   - **Single thread / single fork** — DB compartida entre tests, no
 *     paralelizar para evitar race conditions.
 *   - **Sin coverage** — los integration tests cubren paths que ya
 *     están en el coverage del unit test config; no doble-contamos.
 *   - **Opt-in**: corre con `npm run test:integration`, NO con
 *     `npm run test:run`. CI default no los corre.
 *
 * Pre-requisitos para correr (ver `docs/testing/integration-setup.md`):
 *   1. Docker corriendo (OrbStack / Docker Desktop).
 *   2. `supabase start` levantado en localhost:54321.
 *   3. `supabase db reset` aplicó las 211 migrations al DB local.
 *
 * Las env vars apuntan a la instancia local (no a producción) — los
 * defaults del CLI de Supabase generan llaves predecibles que se
 * inyectan en `tests/integration/setup.ts`.
 */
export default defineConfig({
  test: {
    environment: 'node',
    globals: false,
    include: ['tests/integration/**/*.integration.test.ts'],
    exclude: ['node_modules/**', '.next/**', 'tests/e2e/**'],
    pool: 'forks',
    poolOptions: {
      forks: {
        // DB compartida → un solo fork serial, sin tests paralelos.
        singleFork: true,
      },
    },
    // Tests integration suelen ser más lentos que unit (network + DB).
    testTimeout: 30000,
    hookTimeout: 30000,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
});
