/**
 * a11y smoke — Authenticated routes (auth, ADR-020 baseline).
 *
 * Self-skips when no auth state is configured (same pattern as the
 * other auth smoke tests). Runs axe-core on representative pages of
 * each empresa + the cross-empresa surfaces.
 */

import { test } from '@playwright/test';

import { skipIfNoAuth } from '../helpers/auth-guard';

import { expectNoCriticalA11yViolations } from './helpers';

const ROUTES: Array<{ name: string; path: string }> = [
  { name: 'inicio', path: '/inicio' },
  { name: 'rdb · inventario', path: '/rdb/inventario' },
  { name: 'dilesa · terrenos', path: '/dilesa/terrenos' },
  { name: 'dilesa · admin tasks', path: '/dilesa/admin/tasks' },
  { name: 'settings · empresas', path: '/settings/empresas' },
];

test.describe('a11y · auth routes', () => {
  for (const route of ROUTES) {
    test(`no critical/serious WCAG 2.1 AA violations · ${route.name}`, async ({
      page,
    }, testInfo) => {
      skipIfNoAuth(testInfo);
      await page.goto(route.path);
      await page.waitForLoadState('networkidle');
      // Auth state may be stale; skip rather than fail the whole audit.
      if (page.url().includes('/login')) {
        testInfo.skip(true, 'Session not accepted — auth state may be stale');
      }
      await expectNoCriticalA11yViolations(page);
    });
  }
});
