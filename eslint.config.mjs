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
      // (.claude/ = Claude Code, .Codex/ = Codex CLI.)
      '.claude/worktrees/**',
      '.Codex/worktrees/**',
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
  {
    // Guard fechas-tz: "hoy" NUNCA se deriva de toISOString() — es UTC (también
    // en el navegador) y a partir de las 18:00/19:00 de Matamoros ya es "mañana".
    // Usar hoyISOMatamoros()/fechaISOMatamoros()/inicioMesMatamoros() de
    // lib/fecha-mx.ts. Los tests quedan fuera (usan instantes fijos a propósito).
    files: ['app/**/*.{ts,tsx}', 'lib/**/*.{ts,tsx}', 'components/**/*.{ts,tsx}'],
    ignores: ['**/*.test.{ts,tsx}'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector:
            "CallExpression[callee.property.name='slice'][callee.object.callee.property.name='toISOString'][callee.object.callee.object.type='NewExpression'][callee.object.callee.object.callee.name='Date']",
          message:
            'new Date().toISOString().slice(...) recorta el calendario UTC ("hoy" se vuelve "mañana" después de las ~18:00 locales). Usa hoyISOMatamoros()/fechaISOMatamoros()/inicioMesMatamoros() de @/lib/fecha-mx.',
        },
        {
          selector:
            "CallExpression[callee.property.name='split'][callee.object.callee.property.name='toISOString'][callee.object.callee.object.type='NewExpression'][callee.object.callee.object.callee.name='Date']",
          message:
            "new Date().toISOString().split('T')[0] es el día UTC, no el local. Usa hoyISOMatamoros() de @/lib/fecha-mx.",
        },
      ],
    },
  },
];

export default eslintConfig;
