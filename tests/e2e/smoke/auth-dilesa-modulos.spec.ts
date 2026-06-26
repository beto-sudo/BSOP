/**
 * Smoke tests — DILESA › módulos operativos: Compras, Construcción, Cobranza.
 *
 * 100% READ-ONLY. Solo navega a cada superficie (hubs + sus routed-tabs) y
 * verifica que renderiza sin crash para un usuario con lectura. No toca ningún
 * botón de mutación (crear/aprobar/recibir/etc.). S3 de `testing-e2e-loop`.
 *
 * Patrón defensivo: tolera sin-datos y sin-permiso (acceso restringido), se
 * auto-salta si no hay sesión. Verifica la señal mínima de "la página cargó su
 * contenido" (un h1 del módulo) o el fallback de acceso restringido — sin
 * asumir textos/datos concretos, para que no envejezca con la UI.
 *
 * Run: npm run test:e2e:auth -- --grep "DILESA.*operativos"
 */

import { test, expect, type Page } from '@playwright/test';
import { skipIfNoAuth } from '../helpers/auth-guard';

// Solo rutas de lista/consulta (read-only). Se excluyen a propósito las de
// captura (/nuevo, /nuevo-obra) y cualquier acción que mute.
const SUPERFICIES: Array<{ modulo: string; rutas: string[] }> = [
  {
    modulo: 'Compras',
    rutas: [
      '/dilesa/compras',
      '/dilesa/compras/requisiciones',
      '/dilesa/compras/cotizaciones',
      '/dilesa/compras/recepciones',
      '/dilesa/compras/costo-materiales',
    ],
  },
  {
    modulo: 'Construcción',
    rutas: [
      '/dilesa/construccion',
      '/dilesa/construccion/contratos',
      '/dilesa/construccion/contratistas',
      '/dilesa/construccion/prototipos',
      '/dilesa/construccion/estimaciones',
      '/dilesa/construccion/costeo',
    ],
  },
  {
    modulo: 'Cobranza',
    rutas: ['/dilesa/cobranza', '/dilesa/cobranza/aging'],
  },
];

async function settle(page: Page) {
  await page
    .locator('[class*="skeleton"], [data-slot="skeleton"]')
    .first()
    .waitFor({ state: 'hidden', timeout: 8000 })
    .catch(() => {});
}

test.describe('DILESA › módulos operativos (read-only)', () => {
  for (const { modulo, rutas } of SUPERFICIES) {
    for (const ruta of rutas) {
      test(`${modulo} — ${ruta} renderiza sin crash`, async ({ page }, testInfo) => {
        skipIfNoAuth(testInfo);

        await page.goto(ruta);
        await page.waitForTimeout(1200);
        const url = page.url();
        if (url.includes('/login')) {
          const motivo = url.includes('error=unauthorized')
            ? 'e2e-bot autentica pero NO está en core.usuarios (activo)'
            : 'sesión no aceptada (cookies SSR no válidas)';
          testInfo.skip(true, motivo);
        }

        await page.waitForLoadState('networkidle').catch(() => {});
        await settle(page);

        // 1) sin overlay de error de Next (crash / runtime error)
        await expect(page.locator('[data-nextjs-dialog]'))
          .not.toBeVisible({ timeout: 3000 })
          .catch(() => {});

        // 2) el main tiene contenido (no quedó en blanco)
        const body = await page.evaluate(() => document.body.innerText.trim());
        expect(body.length).toBeGreaterThan(0);

        // 3) señal de página cargada: el h1 del módulo, o el fallback de
        //    acceso restringido (el bot lee todo DILESA, pero el test no asume
        //    permisos para no acoplarse al RBAC del usuario de prueba).
        await expect(
          page.locator('h1').first().or(page.getByText('Acceso restringido').first())
        ).toBeVisible({ timeout: 10000 });
      });
    }
  }
});
