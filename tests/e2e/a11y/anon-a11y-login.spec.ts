/**
 * a11y smoke — Login page (anon, ADR-020 baseline).
 *
 * Runs axe-core on `/login` to enforce WCAG 2.1 AA. Fails on critical or
 * serious violations; moderate/minor are logged.
 */

import { test } from '@playwright/test';

import { expectNoCriticalA11yViolations } from './helpers';

test.describe('a11y · /login', () => {
  test('no critical/serious WCAG 2.1 AA violations', async ({ page }) => {
    await page.goto('/login');
    await page.waitForLoadState('networkidle');
    await expectNoCriticalA11yViolations(page);
  });
});
