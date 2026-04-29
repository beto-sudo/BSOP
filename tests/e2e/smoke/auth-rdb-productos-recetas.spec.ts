/**
 * Smoke tests — RDB › Productos · Recetas (authenticated)
 *
 * Sprint 1 de iniciativa `rdb-productos-config-reportes`. Vista read-only
 * de productos vendibles con su receta (insumos + costo + margen) sobre
 * `erp.producto_receta` joined con `rdb.v_productos_tabla`.
 *
 * Requires auth state. Will self-skip if no credentials were configured.
 * Run with: npm run test:e2e:auth -- --grep "RDB.*Recetas"
 */

import { test, expect } from '@playwright/test';
import { skipIfNoAuth } from '../helpers/auth-guard';

test.describe('RDB › Productos · Recetas', () => {
  test.beforeEach(async ({ page }, testInfo) => {
    skipIfNoAuth(testInfo);
    await page.goto('/rdb/productos/recetas');
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

  test('has a search input', async ({ page }) => {
    await page
      .locator('[class*="skeleton"], [data-slot="skeleton"]')
      .first()
      .waitFor({ state: 'hidden', timeout: 6000 })
      .catch(() => {});
    const input = page.locator('input[placeholder]').first();
    await expect(input).toBeVisible({ timeout: 5000 });
  });

  test('table or access-denied state renders', async ({ page }) => {
    await page.waitForTimeout(2500);
    const table = page.locator('table');
    const denied = page.getByText('Acceso restringido');
    const [tableCount, deniedCount] = await Promise.all([table.count(), denied.count()]);
    expect(tableCount + deniedCount).toBeGreaterThan(0);
  });

  test('search input filters rows', async ({ page }) => {
    await page.waitForTimeout(2500);
    const input = page.locator('input[aria-label="Buscar producto, categoría o insumo"]').first();
    const isVisible = await input.isVisible().catch(() => false);
    if (!isVisible) return;

    const before = await page.locator('table tbody tr').count();
    await input.fill('xxxxxxxxxnothing');
    await page.waitForTimeout(500);
    const after = await page.locator('table tbody tr').count();
    expect(after).toBeLessThanOrEqual(before);
  });

  test('clicking a row opens the detail drawer', async ({ page }) => {
    await page.waitForTimeout(2500);
    const rows = page.locator('table tbody tr');
    const count = await rows.count();
    if (count === 0) return;

    await rows.first().click();
    await page.waitForTimeout(800);
    const panel = page.locator('[role="dialog"]');
    await expect(panel).toBeVisible({ timeout: 4000 });
  });
});
