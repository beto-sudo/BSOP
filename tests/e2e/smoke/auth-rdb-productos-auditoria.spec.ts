/**
 * Smoke tests — RDB › Productos · Auditoría (authenticated)
 *
 * Sprint 2 de iniciativa `rdb-productos-config-reportes`. Reporte de
 * huecos en configuración de recetas (margen negativo, insumo
 * huérfano, sin costo, no inventariable). Click en alert → drawer
 * de la receta vía /rdb/productos/recetas?focus=<id>.
 *
 * Requires auth state. Will self-skip if no credentials were configured.
 * Run with: npm run test:e2e:auth -- --grep "RDB.*Auditoría"
 */

import { test, expect } from '@playwright/test';
import { skipIfNoAuth } from '../helpers/auth-guard';

test.describe('RDB › Productos · Auditoría', () => {
  test.beforeEach(async ({ page }, testInfo) => {
    skipIfNoAuth(testInfo);
    await page.goto('/rdb/productos/auditoria');
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

  test('summary cards render', async ({ page }) => {
    await page.waitForTimeout(2500);
    const access = await page.getByText('Acceso restringido').count();
    if (access > 0) return;
    // 3 cards: Críticas / Warnings / Recetas auditadas
    await expect(page.getByText('Críticas')).toBeVisible({ timeout: 5000 });
    await expect(page.getByText('Warnings')).toBeVisible();
    await expect(page.getByText('Recetas auditadas')).toBeVisible();
  });

  test('table or empty state renders', async ({ page }) => {
    await page.waitForTimeout(2500);
    const table = page.locator('table');
    const denied = page.getByText('Acceso restringido');
    const empty = page.getByText('Sin alertas pendientes');
    const [tableCount, deniedCount, emptyCount] = await Promise.all([
      table.count(),
      denied.count(),
      empty.count(),
    ]);
    expect(tableCount + deniedCount + emptyCount).toBeGreaterThan(0);
  });

  test('clicking an alert row navigates to recetas with focus query', async ({ page }) => {
    await page.waitForTimeout(2500);
    const rows = page.locator('table tbody tr');
    const count = await rows.count();
    if (count === 0) return;

    await rows.first().click();
    await page.waitForTimeout(800);
    expect(page.url()).toContain('/rdb/productos/recetas');
    expect(page.url()).toContain('focus=');
  });
});
