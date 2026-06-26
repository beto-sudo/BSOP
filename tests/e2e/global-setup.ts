/**
 * Playwright global setup — crea playwright/.auth/user.json con cookies
 * REALES de sesión Supabase SSR (no localStorage).
 *
 * Por qué cookies y no localStorage:
 *   BSOP autentica con @supabase/ssr cookie-based. El middleware (proxy.ts)
 *   lee las cookies `sb-<ref>-auth-token`, llama getUser() y, si no hay user,
 *   redirige a /login ANTES de que corra cualquier JS de cliente. Un token en
 *   localStorage no sirve: el SSR nunca lo ve. Por eso acuñamos aquí las
 *   cookies SSR con la MISMA librería/versión que la app (@supabase/ssr), así
 *   el formato (chunking + base64) siempre coincide con lo que el proxy espera.
 *
 * Requisitos en .env.test.local:  TEST_USER_EMAIL, TEST_USER_PASSWORD.
 *   NEXT_PUBLIC_SUPABASE_URL / ANON_KEY se leen de .env.local.
 *
 * IMPORTANTE — el usuario de prueba debe ADEMÁS existir en `core.usuarios`
 *   con activo=true, o el proxy lo rechaza con ?error=unauthorized aunque las
 *   cookies sean válidas (ver proxy.ts). Dale acceso de lectura desde
 *   /settings/acceso. Sin esto, los tests auth se auto-saltan.
 *
 * Si faltan credenciales o algo falla, se escribe un estado vacío y los specs
 * `auth-*` se auto-saltan (no fallan) vía skipIfNoAuth.
 */

import { test as setup } from '@playwright/test';
import { createServerClient } from '@supabase/ssr';
import * as fs from 'fs';
import * as path from 'path';

const AUTH_FILE = path.join(__dirname, '../../playwright/.auth/user.json');
const EMPTY_STATE = { cookies: [], origins: [] };

function writeEmpty(reason: string) {
  console.warn(`\n[auth-setup] ${reason}\n  → Los tests auth se SALTARÁN.\n`);
  fs.mkdirSync(path.dirname(AUTH_FILE), { recursive: true });
  fs.writeFileSync(AUTH_FILE, JSON.stringify(EMPTY_STATE, null, 2));
}

setup('create authenticated session', async ({ request }) => {
  fs.mkdirSync(path.dirname(AUTH_FILE), { recursive: true });

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const email = process.env.TEST_USER_EMAIL;
  const password = process.env.TEST_USER_PASSWORD;

  const missing = [
    !supabaseUrl && 'NEXT_PUBLIC_SUPABASE_URL',
    !anonKey && 'NEXT_PUBLIC_SUPABASE_ANON_KEY',
    !email && 'TEST_USER_EMAIL',
    !password && 'TEST_USER_PASSWORD',
  ].filter(Boolean);
  if (missing.length) {
    writeEmpty(
      `Faltan variables: ${missing.join(', ')}. Copia .env.test.local.example → .env.test.local.`
    );
    return;
  }

  // ── 1) Password grant ──────────────────────────────────────────────────
  const tokenRes = await request.post(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
    headers: { apikey: anonKey!, 'Content-Type': 'application/json' },
    data: { email, password },
  });
  if (!tokenRes.ok()) {
    const body = await tokenRes.text().catch(() => '');
    writeEmpty(
      `Sign-in Supabase falló (HTTP ${tokenRes.status()}): ${body.slice(0, 160)}. ` +
        `Revisa TEST_USER_* y que el provider email+password esté habilitado.`
    );
    return;
  }
  const session = (await tokenRes.json()) as {
    access_token?: string;
    refresh_token?: string;
  };
  if (!session.access_token || !session.refresh_token) {
    writeEmpty('La respuesta de sign-in no trae access_token/refresh_token.');
    return;
  }

  // ── 2) Acuñar las cookies SSR con la misma @supabase/ssr de la app ───────
  // createServerClient con un cookie-store en memoria: setSession dispara
  // setAll con las cookies en el formato exacto (nombre + chunking + base64)
  // que el proxy luego sabe leer.
  const minted: Array<{ name: string; value: string }> = [];
  const writer = createServerClient(supabaseUrl!, anonKey!, {
    cookies: {
      getAll: () => [],
      setAll: (toSet) => {
        for (const { name, value } of toSet) minted.push({ name, value });
      },
    },
  });
  await writer.auth.setSession({
    access_token: session.access_token,
    refresh_token: session.refresh_token,
  });
  if (minted.length === 0) {
    writeEmpty('setSession no produjo cookies (inesperado).');
    return;
  }

  // ── 3) Self-check: ¿estas cookies autentican? (round-trip getUser) ───────
  // Lee la sesión DESDE las cookies acuñadas y valida el token contra Supabase.
  // Aísla "las cookies sirven" de "el usuario está/no en core.usuarios".
  const reader = createServerClient(supabaseUrl!, anonKey!, {
    cookies: {
      getAll: () => minted.map((c) => ({ name: c.name, value: c.value })),
      setAll: () => {},
    },
  });
  const {
    data: { user },
    error,
  } = await reader.auth.getUser();
  if (error || !user) {
    writeEmpty(`Las cookies acuñadas NO autenticaron (getUser: ${error?.message ?? 'sin user'}).`);
    return;
  }

  // ── 4) Escribir el storageState con las cookies ──────────────────────────
  const baseUrl = process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3000';
  const domain = new URL(baseUrl).hostname;
  const expires = Math.floor(Date.now() / 1000) + 60 * 60; // 1h alcanza para una corrida
  const state = {
    cookies: minted.map((c) => ({
      name: c.name,
      value: c.value,
      domain,
      path: '/',
      expires,
      httpOnly: false,
      secure: false,
      sameSite: 'Lax' as const,
    })),
    origins: [],
  };
  fs.writeFileSync(AUTH_FILE, JSON.stringify(state, null, 2));
  console.log(
    `[auth-setup] Cookies SSR guardadas (${minted.length}) para ${user.email} → ` +
      `${path.relative(process.cwd(), AUTH_FILE)}`
  );
});
