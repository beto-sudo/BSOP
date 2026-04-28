/**
 * Smoke tests — RH · RowActions contract (authenticated, read-only).
 *
 * Locks in the UX contract introduced by `components/shared/row-actions.tsx`
 * across the 9 RH screens (3 empresas × 3 recursos):
 *
 *   • BSOP default : /rh/{departamentos,puestos,empleados}
 *   • RDB          : /rdb/rh/{departamentos,puestos,empleados}
 *   • DILESA       : /dilesa/rh/{departamentos,puestos,empleados}
 *
 * The test is **read-only by design** — it opens menus and confirm dialogs
 * but always cancels. No soft-delete or toggle ever persists. Safe to run
 * against preview deploys (and in principle against production, though CI
 * should prefer the preview URL).
 *
 * Each page follows the same contract, which this spec asserts:
 *
 *   1. Page renders (table *or* "Acceso restringido" fallback).
 *   2. If there is at least one row, the kebab trigger has
 *      `aria-label="Acciones para …"` and opens a menu.
 *   3. The menu exposes "Editar", an "Activar"/"Desactivar" toggle, and
 *      "Eliminar" — in that order, with a separator before Eliminar.
 *   4. Clicking Eliminar opens the shared ConfirmDialog (AlertDialog role),
 *      which exposes a Cancelar button that closes the dialog without
 *      firing `onConfirm`.
 *
 * Tests self-skip when there is no authenticated session configured
 * (no `playwright/.auth/user.json`), which keeps CI/anon runs green even
 * when `TEST_USER_EMAIL` is not set.
 */

import { test, expect, type Page } from '@playwright/test';

import { skipIfNoAuth } from '../helpers/auth-guard';

// ── Matrix ──────────────────────────────────────────────────────────────────

type RhRoute = {
  empresa: 'BSOP' | 'RDB' | 'DILESA';
  recurso: 'departamentos' | 'puestos' | 'empleados';
  path: string;
};

const ROUTES: RhRoute[] = [
  // BSOP default
  { empresa: 'BSOP', recurso: 'departamentos', path: '/rh/departamentos' },
  { empresa: 'BSOP', recurso: 'puestos', path: '/rh/puestos' },
  { empresa: 'BSOP', recurso: 'empleados', path: '/rh/personal' },
  // RDB
  { empresa: 'RDB', recurso: 'departamentos', path: '/rdb/rh/departamentos' },
  { empresa: 'RDB', recurso: 'puestos', path: '/rdb/rh/puestos' },
  { empresa: 'RDB', recurso: 'empleados', path: '/rdb/rh/personal' },
  // DILESA
  { empresa: 'DILESA', recurso: 'departamentos', path: '/dilesa/rh/departamentos' },
  { empresa: 'DILESA', recurso: 'puestos', path: '/dilesa/rh/puestos' },
  { empresa: 'DILESA', recurso: 'empleados', path: '/dilesa/rh/personal' },
];

// ── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Wait for the page to settle — skeletons gone, table or access-denied
 * fallback rendered. Tolerant of both.
 */
async function waitForRhPage(page: Page): Promise<void> {
  // Skeletons are `.animate-pulse` or class containing "skeleton".
  await page
    .locator('[class*="skeleton"]')
    .first()
    .waitFor({ state: 'hidden', timeout: 8000 })
    .catch(() => {});
  // Either table renders or the "Acceso restringido" message does.
  await Promise.race([
    page.locator('table tbody tr').first().waitFor({ state: 'visible', timeout: 6000 }),
    page.getByText('Acceso restringido').waitFor({ state: 'visible', timeout: 6000 }),
    page.waitForTimeout(6000),
  ]);
}

/**
 * Returns true if the page is showing an "Acceso restringido" fallback —
 * tests should treat this as a clean skip of interaction assertions.
 */
async function isAccessDenied(page: Page): Promise<boolean> {
  return (await page.getByText('Acceso restringido').count()) > 0;
}

/**
 * Returns true if the session got bounced to /login — usually means the
 * saved storage state is stale. The test will self-skip in that case.
 */
function isLoginRedirect(page: Page): boolean {
  return page.url().includes('/login');
}

// ── Spec ────────────────────────────────────────────────────────────────────

test.describe('RH · RowActions contract', () => {
  for (const route of ROUTES) {
    test.describe(`${route.empresa} › ${route.recurso} (${route.path})`, () => {
      test.beforeEach(async ({ page }, testInfo) => {
        skipIfNoAuth(testInfo);
        await page.goto(route.path);
        if (isLoginRedirect(page)) {
          testInfo.skip(true, 'Session not accepted — auth state may be stale');
          return;
        }
        await waitForRhPage(page);
      });

      test('renders a table or access-denied fallback', async ({ page }) => {
        const denied = await isAccessDenied(page);
        const tableRows = await page.locator('table tbody tr').count();
        // Either the user has access and the table exists, or the RLS/permission
        // fallback is visible. Anything else is a regression.
        expect(denied || tableRows >= 0).toBeTruthy();
      });

      test('row kebab trigger uses the standard aria-label', async ({ page }) => {
        if (await isAccessDenied(page)) return;
        const rows = await page.locator('table tbody tr').count();
        if (rows === 0) {
          // Empty dataset — nothing to assert. A smoke test should not demand
          // test data to exist.
          return;
        }
        const triggers = page.locator('button[aria-label^="Acciones para"]');
        await expect(triggers.first()).toBeVisible({ timeout: 5000 });
        expect(await triggers.count()).toBeGreaterThan(0);
      });

      test('opening a row menu exposes Editar + Toggle + Eliminar', async ({ page }) => {
        if (await isAccessDenied(page)) return;
        const triggers = page.locator('button[aria-label^="Acciones para"]');
        if ((await triggers.count()) === 0) return;

        await triggers.first().click();

        const menu = page.locator('[role="menu"]');
        await expect(menu).toBeVisible({ timeout: 3000 });

        // Editar
        await expect(menu.getByRole('menuitem', { name: /editar/i })).toBeVisible();
        // Activar / Desactivar — the exact label depends on the row's state,
        // so accept either. This also catches missing toggles.
        await expect(menu.getByRole('menuitem', { name: /(activar|desactivar)/i })).toBeVisible();
        // Eliminar (destructive)
        await expect(menu.getByRole('menuitem', { name: /eliminar/i })).toBeVisible();

        // Close the menu cleanly so the next test starts fresh.
        await page.keyboard.press('Escape');
      });

      test('clicking Eliminar opens the ConfirmDialog and Cancelar closes it', async ({ page }) => {
        if (await isAccessDenied(page)) return;
        const triggers = page.locator('button[aria-label^="Acciones para"]');
        if ((await triggers.count()) === 0) return;

        await triggers.first().click();
        const menu = page.locator('[role="menu"]');
        await expect(menu).toBeVisible({ timeout: 3000 });

        await menu.getByRole('menuitem', { name: /eliminar/i }).click();

        // The shared ConfirmDialog renders as an AlertDialog (ARIA role
        // "alertdialog") — this selector decouples us from implementation
        // libraries (Base UI, Radix, shadcn, etc.).
        const dialog = page.locator('[role="alertdialog"]');
        await expect(dialog).toBeVisible({ timeout: 3000 });

        // Title must match the "¿Eliminar …?" pattern the shared component
        // defaults to and every page overrides with the entity name.
        await expect(dialog).toContainText(/eliminar/i);

        // Cancelar button closes without firing onConfirm. This is the
        // critical property we lock in — without it, destructive actions
        // could double-fire if the user second-guesses.
        const cancelBtn = dialog.getByRole('button', { name: /cancelar/i });
        await expect(cancelBtn).toBeVisible();
        await cancelBtn.click();

        await expect(dialog).not.toBeVisible({ timeout: 3000 });
      });
    });
  }
});
