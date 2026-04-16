import { defineConfig } from 'vitest/config';
import path from 'node:path';

/**
 * Vitest configuration for BSOP unit tests.
 *
 * Scope: the library code under `lib/` is the primary target for unit tests.
 * End-to-end tests continue to live under `tests/e2e/` and run via Playwright
 * (see `test:e2e` script in package.json), so we exclude that folder here to
 * avoid Vitest trying to execute Playwright specs.
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
      include: ['lib/**/*.ts'],
      exclude: ['lib/**/*.test.ts', 'lib/**/*.d.ts'],
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
});
