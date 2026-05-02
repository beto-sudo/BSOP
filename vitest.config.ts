import { defineConfig } from 'vitest/config';
import path from 'node:path';

/**
 * Vitest configuration for BSOP unit tests.
 *
 * Scope: `lib/` y los Server Actions / API routes bajo `app/**` son el
 * target primario de unit tests. End-to-end tests viven bajo
 * `tests/e2e/` y corren via Playwright (`test:e2e`), por eso se
 * excluyen aquí.
 *
 * Coverage threshold (gradual — Sprint 3 de `tech-debt-h1-2026`):
 *   - **Sprint 3A**: baseline 30% lines/statements, 65% functions,
 *     75% branches. Coverage medido tras 3A: ~32% lines, ~69%
 *     functions, ~84% branches.
 *   - **Sprint 3B**: bump a 33% lines/statements, 67% functions, 80%
 *     branches. Coverage medido tras 3B: 35.29% / 69.27% / 83.82%.
 *   - **Sprint 3C** (este PR): bump a 40% lines/statements, 70%
 *     functions, 82% branches. Coverage medido tras unit tests 3C:
 *     42.1% lines, 72.08% functions, 84.21% branches — buffer ~2%.
 *     Los integration tests (cortes + levantamientos contra DB real)
 *     corren via `npm run test:integration` (config separado), opt-in
 *     local — no en CI default.
 *
 * El threshold solo bloquea CI cuando se corre `npm run test:coverage`
 * (lo hace el workflow `.github/workflows/ci.yml`). `npm run test:run`
 * sigue siendo rápido sin coverage, útil para iteración local.
 */
export default defineConfig({
  test: {
    // Default Node environment — these are pure-logic tests, no DOM needed.
    environment: 'node',
    globals: false,
    include: ['**/*.test.ts', '**/*.test.tsx'],
    // Integration tests viven en `tests/integration/**` y corren via
    // `npm run test:integration` (config separado). Excluirlos aquí
    // evita que `test:run` los ejecute sin DB local arriba.
    exclude: [
      'node_modules/**',
      '.next/**',
      'tests/e2e/**',
      'tests/integration/**',
      '**/*.integration.test.ts',
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['lib/**/*.ts', 'app/api/**/*.ts', 'app/**/actions.ts'],
      exclude: [
        '**/*.test.ts',
        '**/*.d.ts',
        // Helpers internos que solo sirven a tests.
        'app/api/**/_test-helpers.ts',
      ],
      thresholds: {
        // Sprint 3C — buffer ~2% sobre el medido (42.1 / 72.08 / 84.21).
        // Bita si alguien agrega código sin tests.
        lines: 40,
        statements: 40,
        functions: 70,
        branches: 82,
      },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
});
