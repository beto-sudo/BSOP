import { createRequire } from 'module';
import prettier from 'eslint-config-prettier';

const require = createRequire(import.meta.url);
const nextCoreWebVitals = require('eslint-config-next/core-web-vitals');
const nextTypeScript = require('eslint-config-next/typescript');

/** @type {import('eslint').Linter.Config[]} */
const eslintConfig = [
  {
    ignores: [
      '.next/**',
      'node_modules/**',
      'docs/archive/**',
      'coverage/**',
      'playwright-report/**',
      'test-results/**',
      'supabase/functions/**',
      'next-env.d.ts',
      // One-off historical migration scripts — kept for reference only, not
      // part of the active codebase. Per CONTRIBUTING.md they are not touched.
      'scripts/archive/**',
      // One-off backfill scripts run ad-hoc from node; use CommonJS require().
      'scripts/backfill_coda_*.js',
    ],
  },
  ...nextCoreWebVitals,
  ...nextTypeScript,
  prettier,
];

export default eslintConfig;
