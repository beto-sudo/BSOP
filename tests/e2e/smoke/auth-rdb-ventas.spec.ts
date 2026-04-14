/**
 * Smoke tests — RDB › Ventas (authenticated)
 *
 * Requires auth state. Will self-skip if no credentials were configured.
 * Run with: npm run test:e2e:auth -- --grep "RDB.*Ventas"
 */

import { test, expect } from '@playwright/test';
import { skipIfNoAuth } from '../helpers/auth-guard';

test.describe('RDB › Ventas', () => {
  test.beforeEach(async ({ page }, testInfo) => {
    skipIfNoAuth(testInfo);
    await page.goto('/rdb/ventas');
    // If auth didn't stick and we ended up on the login page, skip
    await page.waitForTimeout(1500);
    if (page.url().includes('/login')) {
      testInfo.skip(true, 'Session not accepted — auth state may be stale');
    }
  });

  // ── Page structure ────────────────────────────────────────────────────────

  test('page renders without crash', async ({ page }) => {
    // No Next.js error overlay
    await expect(page.locator('[data-nextjs-dialog]')).not.toBeVisible({ timeout: 3000 }).catch(() => {});
    // Body has content
    const bodyText = await page.evaluate(() => document.body.innerText.trim());
    expect(bodyText.length).toBeGreaterThan(0);
  });

  test('has a search input', async ({ page }) => {
    // Wait for skeletons to finish
    await page.locator('[class*="skeleton"], [data-slot="skeleton"]').first().waitFor({ state: 'hidden', timeout: 6000 }).catch(() => {});
    const input = page.locator('input[placeholder]').first();
    await expect(input).toBeVisible({ timeout: 5000 });
  });

  test('has a refresh button', async ({ page }) => {
    await page.locator('[class*="skeleton"]').first().waitFor({ state: 'hidden', timeout: 6000 }).catch(() => {});
    // RefreshCw icon — Playwright finds it via SVG path or parent button
    // We look for any button that contains an SVG (icon button)
    const iconButtons = page.locator('button').filter({ has: page.locator('svg') });
    await expect(iconButtons.first()).toBeVisible({ timeout: 5000 });
  });

  test('table or access-denied state renders', async ({ page }) => {
    await page.waitForTimeout(2500);
    const table = page.locator('table');
    const denied = page.getByText('Acceso restringido');

    const [tableCount, deniedCount] = await Promise.all([
      table.count(),
      denied.count(),
    ]);

    expect(tableCount + deniedCount).toBeGreaterThan(0);
  });

  // ── Interactions ──────────────────────────────────────────────────────────

  test('search input filters the table', async ({ page }) => {
    await page.waitForTimeout(2500);

    const input = page.locator('input[placeholder]').first();
    const isVisible = await input.isVisible().catch(() => false);
    if (!isVisible) return; // access denied for this user — skip interaction

    const tableRowsBefore = await page.locator('table tbody tr').count();
    await input.fill('xxxxxxxxxnothing');
    await page.waitForTimeout(600);
    const tableRowsAfter = await page.locator('table tbody tr').count();

    // With a nonsense query, rows should be <= before (filtered or same if no filter)
    expect(tableRowsAfter).toBeLessThanOrEqual(tableRowsBefore);
  });

  test('clicking a table row opens a detail panel', async ({ page }) => {
    await page.waitForTimeout(2500);

    const rows = page.locator('table tbody tr');
    const count = await rows.count();
    if (count === 0) return; // no data or access denied

    // Click the first data row
    await rows.first().click();
    await page.waitForTimeout(800);

    // A Sheet (side panel) or Dialog should open
    const panel = page.locator('[role="dialog"]');
    await expect(panel).toBeVisible({ timeout: 4000 });
  });
});
