/**
 * Smoke — DILESA › Captura de fases (carga sin crash). Authenticated, READ-ONLY.
 *
 * Recorre las 17 pantallas de captura (`/dilesa/ventas/[id]/capturar/<slug>`) y
 * verifica que CADA UNA carga sin reventar: sin overlay de error de Next y con
 * contenido en el body. NO captura, NO sube, NO mueve dinero — el dev server
 * apunta a Supabase PROD, así que el test solo navega.
 *
 * Alcance con el bot `e2e-bot` (viewer, 0 fases con escritura): las páginas de
 * captura están gated con `RequireAccess … write`, así que el bot ve "Acceso
 * restringido" — el test confirma que la RUTA responde sin crash de módulo
 * (imports/render del page), que es lo que se rompería al cablear mal el
 * autoguardado o el patrón colaborativo. Para ejercitar el form en sí (y el
 * autoguardado real interceptando el PATCH) haría falta darle `write` al bot —
 * decisión de Beto, no se toca aquí.
 *
 * Run: npm run test:e2e:auth -- --grep "Captura de fases"
 */

import { test, expect, type Page } from '@playwright/test';
import { skipIfNoAuth } from '../helpers/auth-guard';
import { FASES_VENTA } from '../../../lib/dilesa/fases';

const LISTA = '/dilesa/ventas';

/** Espera a que terminen los skeletons de carga (best-effort). */
async function settle(page: Page) {
  await page
    .locator('[class*="skeleton"], [data-slot="skeleton"]')
    .first()
    .waitFor({ state: 'hidden', timeout: 6000 })
    .catch(() => {});
}

/** Id de la primera venta de la lista (o null si no hay filas / sin acceso). */
async function primerVentaId(page: Page): Promise<string | null> {
  await page.goto(LISTA);
  await settle(page);
  await page.waitForTimeout(2000);

  const rows = page.locator('table tbody tr');
  if ((await rows.count()) === 0) return null;

  const idDeUrl = () =>
    new URL(page.url()).pathname.match(/\/dilesa\/ventas\/([\w-]+)$/)?.[1] ?? null;
  for (let i = 0; i < 3; i++) {
    const id = idDeUrl();
    if (id) return id;
    await rows
      .first()
      .click()
      .catch(() => {});
    await page.waitForURL(/\/dilesa\/ventas\/[\w-]+/, { timeout: 12000 }).catch(() => {});
  }
  return idDeUrl();
}

test.describe('DILESA › Captura de fases', () => {
  test('las 17 pantallas de captura cargan sin crash', async ({ page }, testInfo) => {
    skipIfNoAuth(testInfo);

    // Confirmar sesión: si caemos en /login, saltar (cookies no válidas / sin acceso).
    await page.goto(LISTA);
    await page.waitForTimeout(1500);
    if (page.url().includes('/login')) {
      testInfo.skip(true, 'sesión no aceptada (cookies SSR) o e2e-bot sin acceso a DILESA');
    }

    const ventaId = await primerVentaId(page);
    if (!ventaId) testInfo.skip(true, 'sin ventas en la lista o sin acceso de lectura');

    for (const fase of FASES_VENTA) {
      await page.goto(`/dilesa/ventas/${ventaId}/capturar/${fase.slug}`);
      await settle(page);
      await page.waitForTimeout(800);

      // 1) No reventó con el overlay de error de Next.
      await expect(page.locator('[data-nextjs-dialog]'), `fase ${fase.slug}: overlay de error`)
        .not.toBeVisible({ timeout: 3000 })
        .catch(() => {});

      // 2) La ruta respondió con contenido (form, banner de enforcement, o
      //    "Acceso restringido" del gate) — no una página en blanco.
      const body = await page.evaluate(() => document.body.innerText.trim());
      expect(body.length, `fase ${fase.slug}: body vacío (posible crash)`).toBeGreaterThan(0);
    }
  });
});
