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
 *   - **Sprint 3B** (este PR): bump a 33% lines/statements, 67%
 *     functions, 80% branches. Coverage medido tras 3B: 35.29% lines,
 *     69.27% functions, 83.82% branches — buffer ~2-3%.
 *   - **Sprint 3C**: integration tests para `cortes/actions` y
 *     `levantamientos/actions` → target final 40-45% lines.
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
    exclude: ['node_modules/**', '.next/**', 'tests/e2e/**'],
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
        // Sprint 3B — sube en 3C. Buffer ~2-3% sobre el medido actual
        // para tolerar variación natural y bitir si alguien agrega
        // código sin tests.
        lines: 33,
        statements: 33,
        functions: 67,
        branches: 80,
      },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
});
