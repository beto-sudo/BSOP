/**
 * Smoke tests — Login page & unauthenticated access
 * These run WITHOUT any auth session (project: anon).
 */

import { test, expect } from '@playwright/test';

test.describe('Login page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
  });

  test('renders the login card', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible();
  });

  test('has a visible Google sign-in button', async ({ page }) => {
    const btn = page.getByRole('button', { name: /sign in with google/i });
    await expect(btn).toBeVisible();
    await expect(btn).toBeEnabled();
  });

  test('shows the BSOP logo image', async ({ page }) => {
    const logo = page.getByRole('img', { name: 'BSOP' });
    await expect(logo).toBeVisible();
  });

  test('shows "Private access" badge', async ({ page }) => {
    await expect(page.getByText(/private access/i)).toBeVisible();
  });

  test('shows unauthorized banner when ?error=unauthorized', async ({ page }) => {
    await page.goto('/login?error=unauthorized');
    await expect(
      page.getByText(/this google account is not authorized/i)
    ).toBeVisible();
  });

  test('does NOT show unauthorized banner on clean visit', async ({ page }) => {
    await expect(
      page.getByText(/this google account is not authorized/i)
    ).not.toBeVisible();
  });
});

test.describe('Unauthenticated access to protected routes', () => {
  // Without auth, the app-shell shows the login page or access-denied.
  // We validate the user is not accidentally let into a protected module.

  const PROTECTED_ROUTES = [
    '/rdb/ventas',
    '/rdb/cortes',
    '/rh/empleados',
    '/settings/acceso',
    '/inicio/tasks',
  ];

  for (const route of PROTECTED_ROUTES) {
    test(`${route} — shows login or access guard`, async ({ page }) => {
      await page.goto(route);

      // Give the app-shell time to check auth state
      await page.waitForTimeout(2000);

      const url = page.url();

      // Acceptable outcomes:
      //  (a) redirected to /login
      //  (b) the login heading is visible (SPA navigation)
      //  (c) "Acceso restringido" guard is visible
      //  (d) "Verificando acceso…" spinner is still showing

      const onLoginPage =
        url.includes('/login') ||
        (await page.getByRole('heading', { name: 'Welcome back' }).count()) > 0;

      const hasAccessGuard =
        (await page.getByText('Acceso restringido').count()) > 0 ||
        (await page.getByText(/verificando acceso/i).count()) > 0;

      expect(onLoginPage || hasAccessGuard).toBeTruthy();
    });
  }
});
