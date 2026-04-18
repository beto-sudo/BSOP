import { createRequire } from 'module';
import prettier from 'eslint-config-prettier';

const require = createRequire(import.meta.url);
const nextCoreWebVitals = require('eslint-config-next/core-web-vitals');
const nextTypeScript = require('eslint-config-next/typescript');

/** @type {import('eslint').Linter.Config[]} */
const eslintConfig = [
  {
    ignores: [
      // Build output (including nested inside git worktrees at .claude/worktrees/*/.next/).
      '**/.next/**',
      'node_modules/**',
      // Git worktrees created by agents — never lint checked-out copies of the repo.
      '.claude/worktrees/**',
      // Untracked ad-hoc scratch folder. Already .gitignore'd; mirror here so
      // local lint matches CI.
      'tmp/**',
      'docs/archive/**',
      'coverage/**',
      'playwright-report/**',
      'test-results/**',
      'supabase/functions/**',
      'next-env.d.ts',
      // One-off historical migration scripts — kept for reference only, not
      // part of the active codebase. Per CONTRIBUTING.md they are not touched.
      'scripts/archive/**',
      // Additional one-off migration / rescue scripts kept outside archive/
      // for historical reference; untracked in git, mirrored here for parity.
      'scripts/migrate_*.ts',
      'scripts/rescue_*.ts',
      'scripts/fix_*.mjs',
      // One-off backfill scripts run ad-hoc from node; use CommonJS require().
      'scripts/backfill_coda_*.js',
      'scripts/backfill_manual_*.js',
    ],
  },
  ...nextCoreWebVitals,
  ...nextTypeScript,
  prettier,
];

export default eslintConfig;
