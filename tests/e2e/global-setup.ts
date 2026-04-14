/**
 * Playwright global setup — creates playwright/.auth/user.json.
 *
 * Auth strategy:
 *   The app uses Google OAuth (Supabase). For E2E tests we need a dedicated
 *   test user with email+password auth enabled in the Supabase dashboard.
 *
 *   Required env vars in .env.test.local:
 *     TEST_USER_EMAIL    — email of the test user
 *     TEST_USER_PASSWORD — password of the test user (email/password provider)
 *     NEXT_PUBLIC_SUPABASE_URL  — already in .env.local, re-read automatically
 *     NEXT_PUBLIC_SUPABASE_ANON_KEY — same
 *
 *   If credentials are missing, an empty auth state is written so auth tests
 *   self-skip gracefully (via testInfo.skip() in beforeEach).
 *
 * Setup a test user once:
 *   1. Supabase Dashboard → Authentication → Users → Invite user
 *   2. Set a password via "Update user" (email+password provider must be on)
 *   3. In settings/acceso, grant the test user read access to the modules you
 *      want to test (or use an admin account for full coverage).
 */

import { test as setup, expect } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

const AUTH_FILE = path.join(__dirname, '../../playwright/.auth/user.json');

setup('create authenticated session', async ({ page, request }) => {
  // Ensure directory exists
  fs.mkdirSync(path.dirname(AUTH_FILE), { recursive: true });

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const email = process.env.TEST_USER_EMAIL;
  const password = process.env.TEST_USER_PASSWORD;

  const missingVars = [
    !supabaseUrl && 'NEXT_PUBLIC_SUPABASE_URL',
    !anonKey && 'NEXT_PUBLIC_SUPABASE_ANON_KEY',
    !email && 'TEST_USER_EMAIL',
    !password && 'TEST_USER_PASSWORD',
  ].filter(Boolean);

  if (missingVars.length) {
    console.warn(
      `\n[auth-setup] Missing env vars: ${missingVars.join(', ')}\n` +
      `  Auth tests will be SKIPPED. To enable them:\n` +
      `  1. Copy .env.test.local.example → .env.test.local\n` +
      `  2. Fill in the test credentials\n` +
      `  3. Ensure the test user has email+password auth in Supabase\n`
    );
    fs.writeFileSync(AUTH_FILE, JSON.stringify({ cookies: [], origins: [] }, null, 2));
    return;
  }

  // ── Sign in via Supabase password grant ──────────────────────────────────
  const tokenRes = await request.post(
    `${supabaseUrl}/auth/v1/token?grant_type=password`,
    {
      headers: {
        apikey: anonKey!,
        'Content-Type': 'application/json',
      },
      data: { email, password },
    }
  );

  if (!tokenRes.ok()) {
    const body = await tokenRes.text().catch(() => '');
    console.warn(
      `\n[auth-setup] Supabase sign-in failed (HTTP ${tokenRes.status()}).\n` +
      `  Response: ${body.slice(0, 200)}\n` +
      `  Check TEST_USER_EMAIL / TEST_USER_PASSWORD and that email+password\n` +
      `  provider is enabled in Supabase Authentication settings.\n`
    );
    fs.writeFileSync(AUTH_FILE, JSON.stringify({ cookies: [], origins: [] }, null, 2));
    return;
  }

  const session = await tokenRes.json() as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
  };

  if (!session.access_token) {
    console.warn('[auth-setup] No access_token in response — writing empty auth state.');
    fs.writeFileSync(AUTH_FILE, JSON.stringify({ cookies: [], origins: [] }, null, 2));
    return;
  }

  // ── Inject session into browser localStorage ────────────────────────────
  // Supabase browser client (@supabase/ssr createBrowserClient) reads from
  // a localStorage key named: sb-<project-ref>-auth-token
  const projectRef = (supabaseUrl!.match(/https?:\/\/([^.]+)\./) ?? [])[1] ?? 'unknown';
  const storageKey = `sb-${projectRef}-auth-token`;

  await page.goto('/');
  // Wait for the page JS to initialise so localStorage writes persist
  await page.waitForLoadState('domcontentloaded');

  await page.evaluate(
    ({ key, value }: { key: string; value: string }) => {
      localStorage.setItem(key, value);
    },
    {
      key: storageKey,
      value: JSON.stringify({
        access_token: session.access_token,
        refresh_token: session.refresh_token ?? '',
        token_type: 'bearer',
        expires_in: session.expires_in ?? 3600,
        expires_at: Math.floor(Date.now() / 1000) + (session.expires_in ?? 3600),
      }),
    }
  );

  // Brief pause so the auth state listener fires before we snapshot
  await page.waitForTimeout(800);
  await page.context().storageState({ path: AUTH_FILE });
  console.log('[auth-setup] Auth state saved →', path.relative(process.cwd(), AUTH_FILE));
});
