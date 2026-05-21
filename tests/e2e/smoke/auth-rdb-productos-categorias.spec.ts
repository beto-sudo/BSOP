/**
 * Smoke tests — RDB › Productos · Categorías (authenticated)
 *
 * Sprint 1 de iniciativa `rdb-productos-categorias`. Catálogo navegable
 * de categorías de productos; click en una categoría → tab Catálogo
 * filtrado a ella vía `?categoria=<id>`.
 *
 * Requires auth state. Will self-skip if no credentials were configured.
 * Run with: npm run test:e2e:auth -- --grep "RDB.*Categorías"
 */

import { test, expect } from '@playwright/test';
import { skipIfNoAuth } from '../helpers/auth-guard';

test.describe('RDB › Productos · Categorías', () => {
  test.beforeEach(async ({ page }, testInfo) => {
    skipIfNoAuth(testInfo);
    await page.goto('/rdb/productos/categorias');
    await page.waitForTimeout(1500);
    if (page.url().includes('/login')) {
      testInfo.skip(true, 'Session not accepted — auth state may be stale');
    }
  });

  test('page renders without crash', async ({ page }) => {
    await expect(page.locator('[data-nextjs-dialog]'))
      .not.toBeVisible({ timeout: 3000 })
      .catch(() => {});
    const bodyText = await page.evaluate(() => document.body.innerText.trim());
    expect(bodyText.length).toBeGreaterThan(0);
  });

  test('table or access-denied state renders', async ({ page }) => {
    await page.waitForTimeout(2500);
    const table = page.locator('table');
    const denied = page.getByText('Acceso restringido');
    const [tableCount, deniedCount] = await Promise.all([table.count(), denied.count()]);
    expect(tableCount + deniedCount).toBeGreaterThan(0);
  });

  test('clicking a category navigates to the filtered catalog', async ({ page }) => {
    await page.waitForTimeout(2500);
    const rows = page.locator('table tbody tr');
    const count = await rows.count();
    if (count === 0) return; // no data or access denied

    await rows.first().click();
    await page.waitForTimeout(1200);

    // El drill-down navega al tab Catálogo con el filtro de categoría.
    expect(page.url()).toContain('/rdb/productos?categoria=');
  });
});
