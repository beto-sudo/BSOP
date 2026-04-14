#!/usr/bin/env npx tsx
/**
 * BSOP — UI Consistency Audit
 *
 * Scans every app/[module]/page.tsx and reports on pattern coverage and inconsistencies.
 *
 * Usage:
 *   npm run audit:ui          → pretty markdown report in terminal
 *   npm run audit:ui:json     → machine-readable JSON (pipe to file)
 *   npx tsx scripts/audit-ui.ts --module rdb/ventas   → single module
 */

import * as fs from 'fs';
import * as path from 'path';

// ── CLI flags ─────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const JSON_OUTPUT = args.includes('--json');
const MODULE_FILTER = (() => {
  const idx = args.indexOf('--module');
  return idx >= 0 ? args[idx + 1] : null;
})();

// ── Check definitions ─────────────────────────────────────────────────────────

type Check = {
  key: string;
  label: string;
  /** Returns true when the pattern is satisfied in the file content */
  test: (src: string) => boolean;
  /** When true, absence of this check in a page that uses a sibling is a WARNING */
  warnIfMissing?: string; // e.g. "sheet" means warn if sheet present but this missing
  critical?: boolean;     // issues reported as CRITICAL
};

const CHECKS: Check[] = [
  {
    key: 'requireAccess',
    label: 'RequireAccess',
    // Client-side RequireAccess component OR server-side auth via cookies()/createServerClient
    test: (s) =>
      /RequireAccess/.test(s) ||
      /createServerClient|createSupabaseServerClient|getSupabaseAdminClient/.test(s) ||
      /await\s+cookies\(\)/.test(s),
    critical: true,
  },
  {
    key: 'skeleton',
    label: 'Skeleton loader',
    test: (s) => /Skeleton/.test(s),
  },
  {
    key: 'search',
    label: 'Search / filter',
    test: (s) => /<Search[\s/>]|Search\b.*lucide|placeholder.*buscar|placeholder.*search|placeholder.*filtrar/i.test(s),
  },
  {
    key: 'refresh',
    label: 'Refresh button',
    test: (s) => /RefreshCw/.test(s),
  },
  {
    key: 'emptyState',
    label: 'Empty state',
    test: (s) =>
      /\.length\s*===?\s*0\s*[&|?]|\.length\s*==\s*0|!data\.length|data\.length\s*<\s*1|sin\s+datos|no\s+(hay|results|data)|PlaceholderSection|empty.*state/i.test(s),
  },
  {
    key: 'createBtn',
    label: 'Create button',
    test: (s) => /\bPlus[^a-zA-Z]|PlusCircle|PlusSquare/.test(s),
  },
  {
    key: 'printBtn',
    label: 'Print button',
    test: (s) => /\bPrinter\b/.test(s),
  },
  {
    key: 'table',
    label: 'Table',
    test: (s) => /<Table[\s>]|TableBody|TableRow/.test(s),
  },
  {
    key: 'tableRowClick',
    label: 'Table row clickable',
    test: (s) => {
      // Has both TableRow and onClick in the same file
      return /<TableRow[\s>]/.test(s) && /onClick/.test(s);
    },
    warnIfMissing: 'table',
  },
  {
    key: 'sheet',
    label: 'Sheet (side panel)',
    test: (s) => /<Sheet[\s>]/.test(s),
  },
  {
    key: 'sheetTitle',
    label: 'SheetTitle',
    test: (s) => /SheetTitle/.test(s),
    warnIfMissing: 'sheet',
    critical: true,
  },
  {
    key: 'sheetDescription',
    label: 'SheetDescription',
    test: (s) => /SheetDescription/.test(s),
    warnIfMissing: 'sheet',
  },
  {
    key: 'dialog',
    label: 'Dialog (modal)',
    test: (s) => /<Dialog[\s>]/.test(s),
  },
  {
    key: 'dialogTitle',
    label: 'DialogTitle',
    test: (s) => /DialogTitle/.test(s),
    warnIfMissing: 'dialog',
    critical: true,
  },
  {
    key: 'dialogDescription',
    label: 'DialogDescription',
    test: (s) => /DialogDescription/.test(s),
    warnIfMissing: 'dialog',
  },
  {
    key: 'dialogFooter',
    label: 'DialogFooter',
    test: (s) => /DialogFooter/.test(s),
    warnIfMissing: 'dialog',
  },
  {
    key: 'errorBoundary',
    label: 'Error boundary',
    test: (s) => /error\.tsx|ErrorBoundary|try\s*\{/.test(s),
  },
  {
    key: 'useTransition',
    label: 'useTransition',
    test: (s) => /useTransition/.test(s),
  },
];

// Pages that are legitimately public / minimal (skip RequireAccess warning).
// These pages either have no protected data, or auth is handled at the app-shell
// level rather than with RequireAccess.
const PUBLIC_PAGES = new Set([
  'login',
  'login/login-card',
  'compartir/[token]',
  'auth/callback',
  'page',          // root /  — nav hub, no raw data; app-shell handles auth state
  'rh',            // RH index — section landing page, no sensitive data
  'settings',      // Settings index — section landing, routes to protected sub-pages
  'rdb',           // RDB index — dashboard overview
  'health',        // Health — personal data, app-shell handles auth
  'family',        // Family — personal data
  'travel',        // Travel — personal data
  'usage',         // Usage stats — admin visible only via nav permission
]);

// ── File discovery ─────────────────────────────────────────────────────────────

function findPages(dir: string): string[] {
  const results: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...findPages(full));
    } else if (entry.isFile() && entry.name === 'page.tsx') {
      results.push(full);
    }
  }
  return results;
}

// ── Analysis ───────────────────────────────────────────────────────────────────

type ModuleReport = {
  module: string;      // e.g. "rdb/ventas"
  file: string;        // absolute path
  isPublic: boolean;
  checks: Record<string, boolean>;
  issues: { level: 'critical' | 'warning' | 'info'; message: string }[];
  score: number;       // 0-100
};

function analyseFile(filePath: string, appRoot: string): ModuleReport {
  const rel = path.relative(appRoot, filePath).replace(/\\/g, '/');
  // "rdb/ventas/page.tsx" → "rdb/ventas" | "page.tsx" (root) → "page"
  const moduleName = rel.replace(/\/?page\.tsx$/, '') || 'page';
  const src = fs.readFileSync(filePath, 'utf8');

  const isPublic = PUBLIC_PAGES.has(moduleName) ||
    moduleName === 'page' ||
    moduleName.startsWith('compartir') ||
    moduleName === 'login';

  // Run all checks
  const checks: Record<string, boolean> = {};
  for (const c of CHECKS) {
    checks[c.key] = c.test(src);
  }

  const issues: ModuleReport['issues'] = [];

  // ── Issue rules ────────────────────────────────────────────────────────────

  // 1. Missing RequireAccess on non-public pages
  if (!isPublic && !checks.requireAccess) {
    issues.push({
      level: 'critical',
      message: 'Missing RequireAccess — page may be accessible without permission',
    });
  }

  // 2. Sheet without SheetTitle (accessibility)
  if (checks.sheet && !checks.sheetTitle) {
    issues.push({ level: 'critical', message: 'Sheet used without SheetTitle (accessibility)' });
  }

  // 3. Dialog without DialogTitle
  if (checks.dialog && !checks.dialogTitle) {
    issues.push({ level: 'critical', message: 'Dialog used without DialogTitle (accessibility)' });
  }

  // 4. Sheet without SheetDescription
  if (checks.sheet && !checks.sheetDescription) {
    issues.push({ level: 'warning', message: 'Sheet missing SheetDescription' });
  }

  // 5. Dialog without DialogDescription
  if (checks.dialog && !checks.dialogDescription) {
    issues.push({ level: 'warning', message: 'Dialog missing DialogDescription' });
  }

  // 6. Dialog without DialogFooter
  if (checks.dialog && !checks.dialogFooter) {
    issues.push({ level: 'warning', message: 'Dialog missing DialogFooter (may lack action buttons)' });
  }

  // 7. Table with no clickable rows
  if (checks.table && !checks.tableRowClick) {
    issues.push({ level: 'info', message: 'Table rows have no onClick — rows may not be interactive' });
  }

  // 8. Table with no empty state
  if (checks.table && !checks.emptyState) {
    issues.push({ level: 'warning', message: 'Table has no empty-state handler' });
  }

  // 9. No Skeleton loader
  if (!isPublic && checks.table && !checks.skeleton) {
    issues.push({ level: 'warning', message: 'No Skeleton loader — table may flash on load' });
  }

  // 10. No refresh button on data pages
  if (!isPublic && checks.table && !checks.refresh) {
    issues.push({ level: 'info', message: 'No refresh button — user cannot force reload' });
  }

  // 11. No search on tables with data
  if (!isPublic && checks.table && !checks.search) {
    issues.push({ level: 'info', message: 'No search/filter input on table page' });
  }

  // 12. No create button on crud-looking pages
  if (!isPublic && checks.table && checks.dialog && !checks.createBtn) {
    issues.push({ level: 'info', message: 'Has Dialog+Table but no visible create (Plus) button' });
  }

  // ── Score ──────────────────────────────────────────────────────────────────

  const criticals = issues.filter((i) => i.level === 'critical').length;
  const warnings = issues.filter((i) => i.level === 'warning').length;
  const infos = issues.filter((i) => i.level === 'info').length;
  const score = Math.max(0, 100 - criticals * 25 - warnings * 10 - infos * 3);

  return { module: moduleName, file: filePath, isPublic, checks, issues, score };
}

// ── Rendering ─────────────────────────────────────────────────────────────────

const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const GREEN = '\x1b[32m';
const CYAN = '\x1b[36m';
const DIM = '\x1b[2m';

function levelIcon(level: string) {
  if (level === 'critical') return `${RED}✖ CRITICAL${RESET}`;
  if (level === 'warning') return `${YELLOW}⚠ warning${RESET}`;
  return `${DIM}ℹ info${RESET}`;
}

function scoreColor(n: number) {
  if (n >= 80) return `${GREEN}${n}${RESET}`;
  if (n >= 55) return `${YELLOW}${n}${RESET}`;
  return `${RED}${n}${RESET}`;
}

function checkMark(val: boolean, applicable: boolean) {
  if (!applicable) return ' — ';
  return val ? `${GREEN}✔${RESET}` : `${DIM}·${RESET}`;
}

function printReport(reports: ModuleReport[]) {
  const now = new Date().toLocaleString('es-MX', { timeZone: 'America/Matamoros' });

  console.log(`\n${BOLD}╔══════════════════════════════════════════════════════════════════╗${RESET}`);
  console.log(`${BOLD}║         BSOP — UI Consistency Audit Report                      ║${RESET}`);
  console.log(`${BOLD}╚══════════════════════════════════════════════════════════════════╝${RESET}`);
  console.log(`${DIM}  Generated: ${now}${RESET}\n`);

  // ── Summary ────────────────────────────────────────────────────────────────

  const allIssues = reports.flatMap((r) => r.issues.map((i) => ({ ...i, module: r.module })));
  const criticals = allIssues.filter((i) => i.level === 'critical');
  const warnings = allIssues.filter((i) => i.level === 'warning');
  const infos = allIssues.filter((i) => i.level === 'info');
  const avgScore = Math.round(reports.reduce((s, r) => s + r.score, 0) / reports.length);

  console.log(`${BOLD}  Summary${RESET}`);
  console.log(`  Modules scanned : ${reports.length}`);
  console.log(`  Average score   : ${scoreColor(avgScore)} / 100`);
  console.log(`  Criticals       : ${RED}${criticals.length}${RESET}`);
  console.log(`  Warnings        : ${YELLOW}${warnings.length}${RESET}`);
  console.log(`  Infos           : ${DIM}${infos.length}${RESET}\n`);

  // ── Per-module table ────────────────────────────────────────────────────────

  // Columns: module, score, RequireAccess, Skel, Search, Refresh, EmptyState,
  //          CreateBtn, Table, RowClick, Sheet, Dialog, Issues
  const COL_W = 30;
  const header = [
    'Module'.padEnd(COL_W),
    'Score'.padEnd(6),
    'Auth'.padEnd(5),
    'Skel'.padEnd(5),
    'Srch'.padEnd(5),
    'Rfsh'.padEnd(5),
    'Empty'.padEnd(6),
    'Add'.padEnd(4),
    'Tbl'.padEnd(4),
    'Click'.padEnd(6),
    'Sheet'.padEnd(6),
    'Dlg'.padEnd(4),
    'Issues',
  ].join(' ');

  console.log(`${BOLD}${header}${RESET}`);
  console.log('─'.repeat(header.length + 20));

  for (const r of reports) {
    const c = r.checks;
    const issueCount = r.issues.length;
    const issueStr =
      issueCount === 0
        ? `${GREEN}✔ clean${RESET}`
        : `${r.issues.some((i) => i.level === 'critical') ? RED : YELLOW}${issueCount} issue${issueCount > 1 ? 's' : ''}${RESET}`;

    const hasTable = c.table;

    const row = [
      r.module.padEnd(COL_W),
      scoreColor(r.score).padEnd(6 + 11), // account for ANSI codes
      checkMark(c.requireAccess, !r.isPublic).padEnd(5 + 11),
      checkMark(c.skeleton, !r.isPublic).padEnd(5 + 11),
      checkMark(c.search, hasTable).padEnd(5 + 11),
      checkMark(c.refresh, hasTable).padEnd(5 + 11),
      checkMark(c.emptyState, hasTable).padEnd(6 + 11),
      checkMark(c.createBtn, hasTable).padEnd(4 + 11),
      checkMark(c.table, true).padEnd(4 + 11),
      checkMark(c.tableRowClick, hasTable).padEnd(6 + 11),
      checkMark(c.sheet, true).padEnd(6 + 11),
      checkMark(c.dialog, true).padEnd(4 + 11),
      issueStr,
    ].join(' ');

    console.log(row);
  }

  // ── Issues detail ──────────────────────────────────────────────────────────

  if (allIssues.length > 0) {
    console.log(`\n${BOLD}  Issues Detail${RESET}`);
    console.log('─'.repeat(70));

    if (criticals.length) {
      console.log(`\n${RED}${BOLD}  ✖ CRITICAL  (fix before shipping)${RESET}`);
      for (const i of criticals) {
        console.log(`    ${DIM}[${i.module}]${RESET} ${i.message}`);
      }
    }

    if (warnings.length) {
      console.log(`\n${YELLOW}${BOLD}  ⚠ Warnings  (should fix)${RESET}`);
      for (const i of warnings) {
        console.log(`    ${DIM}[${i.module}]${RESET} ${i.message}`);
      }
    }

    if (infos.length) {
      console.log(`\n${DIM}${BOLD}  ℹ Info  (review / nice-to-have)${RESET}`);
      for (const i of infos) {
        console.log(`    ${DIM}[${i.module}]${RESET} ${i.message}`);
      }
    }
  }

  // ── Pattern stats ──────────────────────────────────────────────────────────

  console.log(`\n${BOLD}  Pattern Coverage${RESET}`);
  console.log('─'.repeat(70));

  const nonPublic = reports.filter((r) => !r.isPublic);

  const stats = [
    { label: 'Sheet (side panel)', count: nonPublic.filter((r) => r.checks.sheet).length },
    { label: 'Dialog (modal)', count: nonPublic.filter((r) => r.checks.dialog).length },
    { label: 'Has table', count: nonPublic.filter((r) => r.checks.table).length },
    { label: 'Table + clickable rows', count: nonPublic.filter((r) => r.checks.tableRowClick).length },
    { label: 'Has create button', count: nonPublic.filter((r) => r.checks.createBtn).length },
    { label: 'Has print button', count: nonPublic.filter((r) => r.checks.printBtn).length },
    { label: 'useTransition (optimistic UI)', count: nonPublic.filter((r) => r.checks.useTransition).length },
    { label: 'Has error boundary file', count: nonPublic.filter((r) => r.checks.errorBoundary).length },
  ];

  for (const s of stats) {
    const pct = Math.round((s.count / nonPublic.length) * 100);
    const bar = '█'.repeat(Math.round(pct / 5)).padEnd(20, '░');
    console.log(`  ${s.label.padEnd(35)} ${bar} ${pct}% (${s.count}/${nonPublic.length})`);
  }

  // ── Consistency notes ──────────────────────────────────────────────────────

  const sheetModules = nonPublic.filter((r) => r.checks.sheet).map((r) => r.module);
  const dialogModules = nonPublic.filter((r) => r.checks.dialog).map((r) => r.module);

  console.log(`\n${BOLD}  Panel Pattern Split${RESET}`);
  console.log(`  Sheet (side panel) : ${sheetModules.join(', ') || 'none'}`);
  console.log(`  Dialog (modal)     : ${dialogModules.join(', ') || 'none'}`);
  const both = nonPublic.filter((r) => r.checks.sheet && r.checks.dialog).map((r) => r.module);
  if (both.length) {
    console.log(`  Both Sheet+Dialog  : ${YELLOW}${both.join(', ')}${RESET} — ${DIM}verify each usage is intentional${RESET}`);
  }

  console.log(`\n${DIM}  Run "npm run audit:ui:json > audit-report.json" for machine-readable output.${RESET}`);
  console.log(`  Tip: annotate pages with data-testid for richer Playwright selectors.\n`);
}

// ── Main ───────────────────────────────────────────────────────────────────────

function main() {
  const appRoot = path.join(__dirname, '../app');

  if (!fs.existsSync(appRoot)) {
    console.error('Could not find app/ directory at', appRoot);
    process.exit(1);
  }

  const files = findPages(appRoot);
  let reports = files.map((f) => analyseFile(f, appRoot));

  if (MODULE_FILTER) {
    reports = reports.filter((r) => r.module.includes(MODULE_FILTER));
    if (reports.length === 0) {
      console.error(`No modules matched "--module ${MODULE_FILTER}"`);
      process.exit(1);
    }
  }

  // Sort: criticals first, then by score ascending
  reports.sort((a, b) => {
    const aC = a.issues.filter((i) => i.level === 'critical').length;
    const bC = b.issues.filter((i) => i.level === 'critical').length;
    if (bC !== aC) return bC - aC;
    return a.score - b.score;
  });

  if (JSON_OUTPUT) {
    console.log(JSON.stringify(reports, null, 2));
    return;
  }

  printReport(reports);

  const criticalCount = reports.flatMap((r) => r.issues).filter((i) => i.level === 'critical').length;
  process.exit(criticalCount > 0 ? 1 : 0);
}

main();
