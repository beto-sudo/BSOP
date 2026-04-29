/**
 * Smoke tests — RDB › Productos · Recetas (modo edición)
 *
 * Sprint 3 de iniciativa `rdb-productos-config-reportes`. Editor inline en
 * el drawer de Recetas — sin tener que abrir cada producto desde Catálogo.
 *
 * Requires auth state. Will self-skip if no credentials were configured.
 * Run with: npm run test:e2e:auth -- --grep "RDB.*Recetas.*edición"
 */

import { test, expect } from '@playwright/test';
import { skipIfNoAuth } from '../helpers/auth-guard';

test.describe('RDB › Productos · Recetas (modo edición)', () => {
  test.beforeEach(async ({ page }, testInfo) => {
    skipIfNoAuth(testInfo);
    await page.goto('/rdb/productos/recetas');
    await page.waitForTimeout(1500);
    if (page.url().includes('/login')) {
      testInfo.skip(true, 'Session not accepted — auth state may be stale');
    }
  });

  test('drawer shows "Editar receta" button when opened', async ({ page }) => {
    await page.waitForTimeout(2500);
    const rows = page.locator('table tbody tr');
    const count = await rows.count();
    if (count === 0) return; // sin recetas — no aplica

    await rows.first().click();
    await page.waitForTimeout(500);

    const editBtn = page.getByRole('button', { name: /Editar receta/i });
    await expect(editBtn).toBeVisible({ timeout: 4000 });
  });

  test('clicking "Editar" reveals the editor with Save/Cancel', async ({ page }) => {
    await page.waitForTimeout(2500);
    const rows = page.locator('table tbody tr');
    const count = await rows.count();
    if (count === 0) return;

    await rows.first().click();
    await page.waitForTimeout(500);

    const editBtn = page.getByRole('button', { name: /Editar receta/i });
    if (!(await editBtn.isVisible().catch(() => false))) return;

    await editBtn.click();
    await page.waitForTimeout(500);

    await expect(page.getByRole('button', { name: /Guardar receta/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /Cancelar/i })).toBeVisible();
  });

  test('"Cancelar" without changes returns to read mode', async ({ page }) => {
    await page.waitForTimeout(2500);
    const rows = page.locator('table tbody tr');
    const count = await rows.count();
    if (count === 0) return;

    await rows.first().click();
    await page.waitForTimeout(500);

    const editBtn = page.getByRole('button', { name: /Editar receta/i });
    if (!(await editBtn.isVisible().catch(() => false))) return;

    await editBtn.click();
    await page.waitForTimeout(400);
    await page.getByRole('button', { name: /Cancelar/i }).click();
    await page.waitForTimeout(400);

    // Editor cerrado → "Editar receta" vuelve a aparecer.
    await expect(page.getByRole('button', { name: /Editar receta/i })).toBeVisible();
  });
});
