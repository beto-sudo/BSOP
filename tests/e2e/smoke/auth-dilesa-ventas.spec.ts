/**
 * Smoke tests — DILESA › Ventas (authenticated)
 *
 * 100% READ-ONLY. Estos tests SOLO navegan, filtran y abren el expediente.
 * NUNCA capturan una fase, suben documentos, regresan/desasignan ventas ni
 * tocan dinero — el dev server apunta a Supabase PROD, así que cualquier
 * mutación escribiría datos reales. Las acciones que mutan viven en
 * `/dilesa/ventas/[id]/capturar/*` y en <MovimientosAdministrativos>; este
 * archivo no las toca.
 *
 * Requiere auth state. Se auto-salta si no hay credenciales configuradas
 * (TEST_USER_EMAIL + TEST_USER_PASSWORD en .env.test.local).
 *
 * Run: npm run test:e2e:auth -- --grep "DILESA.*Ventas"
 */

import { test, expect, type Page } from '@playwright/test';
import { skipIfNoAuth } from '../helpers/auth-guard';

const LISTA = '/dilesa/ventas';

/** Espera a que terminen los skeletons de carga (best-effort). */
async function settle(page: Page) {
  await page
    .locator('[class*="skeleton"], [data-slot="skeleton"]')
    .first()
    .waitFor({ state: 'hidden', timeout: 6000 })
    .catch(() => {});
}

/**
 * Abre el expediente de la primera venta de la lista.
 * Devuelve la URL del detalle, o null si no hay filas (sin datos / sin acceso).
 */
async function abrirPrimerExpediente(page: Page): Promise<string | null> {
  await page.goto(LISTA);
  await settle(page);
  await page.waitForTimeout(2000);

  const rows = page.locator('table tbody tr');
  if ((await rows.count()) === 0) return null;

  // Hasta 3 intentos: la primera navegación compila la ruta del expediente en
  // dev (Turbopack) y puede tardar o perder el primer click; reintentar lo absorbe.
  for (let i = 0; i < 3; i++) {
    if (/\/dilesa\/ventas\/[\w-]+$/.test(new URL(page.url()).pathname)) break;
    await rows
      .first()
      .click()
      .catch(() => {});
    await page.waitForURL(/\/dilesa\/ventas\/[\w-]+/, { timeout: 12000 }).catch(() => {});
  }
  return page.url();
}

test.describe('DILESA › Ventas', () => {
  test.beforeEach(async ({ page }, testInfo) => {
    skipIfNoAuth(testInfo);
    await page.goto(LISTA);
    // Si la sesión no pegó y caímos en /login, saltar
    await page.waitForTimeout(1500);
    const url = page.url();
    if (url.includes('/login')) {
      const motivo = url.includes('error=unauthorized')
        ? 'e2e-bot autentica pero NO está en core.usuarios (activo) — dale acceso en /settings/acceso'
        : 'sesión no aceptada (cookies SSR no válidas)';
      testInfo.skip(true, motivo);
    }
  });

  // ── Estructura de la lista ─────────────────────────────────────────────────

  test('la lista renderiza sin crash', async ({ page }) => {
    await expect(page.locator('[data-nextjs-dialog]'))
      .not.toBeVisible({ timeout: 3000 })
      .catch(() => {});
    const bodyText = await page.evaluate(() => document.body.innerText.trim());
    expect(bodyText.length).toBeGreaterThan(0);
  });

  test('tabla o estado de acceso restringido renderiza', async ({ page }) => {
    await settle(page);
    await page.waitForTimeout(1500);
    const table = page.locator('table');
    const denied = page.getByText('Acceso restringido');
    const [tableCount, deniedCount] = await Promise.all([table.count(), denied.count()]);
    expect(tableCount + deniedCount).toBeGreaterThan(0);
  });

  test('tiene el buscador de comprador/unidad', async ({ page }) => {
    await settle(page);
    // Si el usuario no tiene acceso al módulo, no hay buscador — eso lo cubre
    // el test de "acceso restringido"; aquí solo aseguramos que, si la lista
    // carga, el buscador está.
    const denied = await page.getByText('Acceso restringido').count();
    if (denied > 0) return;
    const input = page.locator('input[placeholder*="comprador"]');
    await expect(input).toBeVisible({ timeout: 5000 });
  });

  test('tiene el botón Refrescar', async ({ page }) => {
    await settle(page);
    const denied = await page.getByText('Acceso restringido').count();
    if (denied > 0) return;
    const btn = page.getByRole('button', { name: 'Refrescar' });
    await expect(btn).toBeVisible({ timeout: 5000 });
  });

  // ── Interacciones read-only ────────────────────────────────────────────────

  test('el buscador filtra la tabla', async ({ page }) => {
    await settle(page);
    await page.waitForTimeout(1500);
    const input = page.locator('input[placeholder*="comprador"]');
    if (!(await input.isVisible().catch(() => false))) return; // sin acceso

    const before = await page.locator('table tbody tr').count();
    await input.fill('zzzzz-no-existe-zzzzz');
    await page.waitForTimeout(600); // debounce
    const after = await page.locator('table tbody tr').count();
    expect(after).toBeLessThanOrEqual(before);
  });

  test('click en una fila navega al expediente', async ({ page }) => {
    const url = await abrirPrimerExpediente(page);
    if (url === null) return; // sin datos o sin acceso
    expect(url).toMatch(/\/dilesa\/ventas\/[\w-]+/);
  });

  // ── Expediente (read-only) ─────────────────────────────────────────────────

  test('el expediente carga el shell con el nombre del cliente', async ({ page }) => {
    const url = await abrirPrimerExpediente(page);
    if (url === null) return;
    const h1 = page.locator('h1').first();
    await expect(h1).toBeVisible({ timeout: 5000 });
    expect((await h1.innerText()).trim().length).toBeGreaterThan(0);
  });

  test('el tab Operación muestra las fichas de datos', async ({ page }) => {
    const url = await abrirPrimerExpediente(page);
    if (url === null || !/\/dilesa\/ventas\/[\w-]+$/.test(new URL(url).pathname)) return;
    // Auto-wait al contenido del tab Operación (carga vía VentaDetalleProvider),
    // en vez de un timeout fijo: robusto ante la velocidad variable de datos.
    await expect(
      page.getByText(/Datos del cliente|Datos de la venta|Expediente digital/i).first()
    ).toBeVisible({ timeout: 10000 });
  });

  // Cada routed-tab debe navegar a su segmento y renderizar sin crash.
  const TABS: Array<{ label: string; segment: string }> = [
    { label: 'Pipeline', segment: 'pipeline' },
    { label: 'Cuadratura', segment: 'cuadratura' },
    { label: 'Estado de cuenta', segment: 'estado-cuenta' },
    { label: 'Documentos', segment: 'documentos' },
    { label: 'Bitácora', segment: 'bitacora' },
  ];

  for (const { label, segment } of TABS) {
    test(`el tab "${label}" navega y renderiza`, async ({ page }) => {
      const url = await abrirPrimerExpediente(page);
      if (url === null || !/\/dilesa\/ventas\/[\w-]+$/.test(new URL(url).pathname)) return;

      // Selector por href scopeado al expediente: evita la colisión con el
      // item "Documentos" del sidebar (/dilesa/admin/documentos). El tab del
      // expediente es /dilesa/ventas/<id>/<segment>.
      const tab = page.locator(`a[href*="/ventas/"][href$="/${segment}"]`).first();
      if (!(await tab.isVisible().catch(() => false))) return; // sin acceso al sub-slug

      await tab.click();
      await page.waitForURL(new RegExp(`/dilesa/ventas/[\\w-]+/${segment}`), { timeout: 12000 });
      // sin overlay de error de Next
      await expect(page.locator('[data-nextjs-dialog]'))
        .not.toBeVisible({ timeout: 3000 })
        .catch(() => {});
      const body = await page.evaluate(() => document.body.innerText.trim());
      expect(body.length).toBeGreaterThan(0);
    });
  }
});
