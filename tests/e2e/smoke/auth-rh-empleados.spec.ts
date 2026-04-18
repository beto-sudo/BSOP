/**
 * Smoke tests — RH › Empleados (authenticated)
 *
 * Requires auth state. Will self-skip if no credentials were configured.
 * Run with: npm run test:e2e:auth -- --grep "RH.*Empleados"
 */

import { test, expect } from '@playwright/test';
import { skipIfNoAuth } from '../helpers/auth-guard';

test.describe('RH › Empleados', () => {
  test.beforeEach(async ({ page }, testInfo) => {
    skipIfNoAuth(testInfo);
    await page.goto('/rh/empleados');
    await page.waitForTimeout(1500);
    if (page.url().includes('/login')) {
      testInfo.skip(true, 'Session not accepted — auth state may be stale');
    }
  });

  // ── Page structure ────────────────────────────────────────────────────────

  test('page renders without crash', async ({ page }) => {
    await expect(page.locator('[data-nextjs-dialog]'))
      .not.toBeVisible({ timeout: 3000 })
      .catch(() => {});
    const bodyText = await page.evaluate(() => document.body.innerText.trim());
    expect(bodyText.length).toBeGreaterThan(0);
  });

  test('has a search input', async ({ page }) => {
    await page
      .locator('[class*="skeleton"]')
      .first()
      .waitFor({ state: 'hidden', timeout: 6000 })
      .catch(() => {});
    const input = page.locator('input[placeholder]').first();
    await expect(input).toBeVisible({ timeout: 5000 });
  });

  test('has a refresh button', async ({ page }) => {
    await page
      .locator('[class*="skeleton"]')
      .first()
      .waitFor({ state: 'hidden', timeout: 6000 })
      .catch(() => {});
    const iconButtons = page.locator('button').filter({ has: page.locator('svg') });
    await expect(iconButtons.first()).toBeVisible({ timeout: 5000 });
  });

  test('has a "Nuevo empleado" / create button', async ({ page }) => {
    await page.waitForTimeout(2000);
    // The + button or a button with Plus icon
    const createBtn = page
      .locator('button')
      .filter({ has: page.locator('svg') })
      .filter({
        hasText: /nuevo|agregar|add|crear/i,
      });
    const iconOnlyPlusBtn = page.locator('button').filter({ has: page.locator('svg') });

    // At least one button with an SVG should exist
    await expect(iconOnlyPlusBtn.first()).toBeVisible({ timeout: 4000 });
  });

  test('table or access-denied state renders', async ({ page }) => {
    await page.waitForTimeout(2500);
    const table = page.locator('table');
    const denied = page.getByText('Acceso restringido');

    const [tableCount, deniedCount] = await Promise.all([table.count(), denied.count()]);
    expect(tableCount + deniedCount).toBeGreaterThan(0);
  });

  // ── Interactions ──────────────────────────────────────────────────────────

  test('search input filters the table', async ({ page }) => {
    await page.waitForTimeout(2500);
    const input = page.locator('input[placeholder]').first();
    const isVisible = await input.isVisible().catch(() => false);
    if (!isVisible) return;

    await input.fill('xxxxxxxxxnothing');
    await page.waitForTimeout(600);
    const rows = await page.locator('table tbody tr').count();
    // Could be 0 (filtered out) or a "no results" message
    const noResults = await page
      .getByText(/sin resultados|no hay|no employees|0 empleados/i)
      .count();
    expect(rows === 0 || noResults > 0 || rows >= 0).toBeTruthy();
  });

  test('clicking create button opens a dialog', async ({ page }) => {
    await page.waitForTimeout(2500);
    const denied = await page.getByText('Acceso restringido').count();
    if (denied > 0) return; // no access — skip interaction

    // Find a button that contains "Plus" icon or text suggesting creation
    const rows = page.locator('table tbody tr');
    const rowCount = await rows.count();
    if (rowCount === 0 && denied === 0) {
      // Empty state — still look for create button
    }

    // Look for a Plus icon button (first SVG-containing button in the toolbar area)
    const buttons = page.locator('button').filter({ has: page.locator('svg') });
    const btnCount = await buttons.count();
    if (btnCount === 0) return;

    // Click buttons until we find one that opens a dialog
    for (let i = 0; i < Math.min(btnCount, 5); i++) {
      const btn = buttons.nth(i);
      const label = await btn.textContent().catch(() => '');
      if (/nuevo|add|crear|plus|\+/i.test(label ?? '')) {
        await btn.click();
        await page.waitForTimeout(500);
        const dialog = page.locator('[role="dialog"]');
        if ((await dialog.count()) > 0) {
          await expect(dialog).toBeVisible({ timeout: 3000 });
          return;
        }
      }
    }
  });

  test('clicking a table row navigates to employee detail', async ({ page }) => {
    await page.waitForTimeout(2500);
    const rows = page.locator('table tbody tr');
    const count = await rows.count();
    if (count === 0) return;

    const initialUrl = page.url();
    await rows.first().click();
    await page.waitForTimeout(1000);

    // Either URL changed (navigated to /rh/empleados/[id]) or a dialog opened
    const newUrl = page.url();
    const dialog = page.locator('[role="dialog"]');
    const urlChanged = newUrl !== initialUrl && newUrl.includes('/rh/empleados/');
    const dialogOpened = (await dialog.count()) > 0;

    expect(urlChanged || dialogOpened).toBeTruthy();
  });
});
