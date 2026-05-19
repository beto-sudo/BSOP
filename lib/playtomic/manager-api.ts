/**
 * Cliente del API web de Playtomic Manager (`manager.playtomic.io`).
 *
 * Razón de existir: el third-party API de Playtomic NO expone `payment_method`
 * (veredicto del equipo de API de Playtomic, 2026-05-11 — ver
 * `docs/planning/rdb-pagos-cancha-conciliacion.md`). El único origen de
 * Wellhub / Club wallet / Free payment / Cash es el CSV de Playtomic Manager.
 * Este módulo automatiza la descarga de ese CSV reproduciendo el flujo del
 * panel web:
 *
 *   1. POST /api/v3/auth/login        email+password → access + refresh token
 *   2. POST /api/v3/auth/token        refresh → token con scope ROLE_TENANT_MANAGER
 *   3. GET  /api/v1/club_payments/export   → CSV (mismo formato que parsea
 *                                            `lib/playtomic/csv-import.ts`)
 *
 * El endpoint de export fue verificado verbatim de una captura del navegador.
 * El flujo de auth fue mapeado de la misma sesión; el parseo de tokens es
 * defensivo (acepta snake_case y camelCase) y falla ruidoso si la forma de la
 * respuesta cambia, en vez de devolver un token vacío en silencio.
 *
 * SECRETS: credenciales sólo vía env (`PLAYTOMIC_MANAGER_EMAIL` /
 * `PLAYTOMIC_MANAGER_PASSWORD`), cargadas Beto-first en 1Password → Vercel.
 * Nunca se loguean el password ni los tokens.
 */

const MANAGER_BASE = 'https://manager.playtomic.io';

/** Tenant RDB. No es secreto (visible en la URL del Manager). Override por env. */
const RDB_TENANT_ID = '8a9d9070-ec3e-4ac8-88af-4706ecbe5d8a';

/** Mimetiza la app del Manager; algunos endpoints lo exigen. */
const REQUESTED_WITH = 'com.playtomic.manager 1.283.0+build.5343';

const REQUEST_TIMEOUT_MS = 30_000;

export type PlaytomicCsvWindow = {
  /** Instante UTC inicial del filtro `start_payment_date` (inclusive). */
  startDate: Date;
  /** Instante UTC final del filtro `end_payment_date` (inclusive). */
  endDate: Date;
};

function readCredentials(): { email: string; password: string; tenantId: string } {
  const email = process.env.PLAYTOMIC_MANAGER_EMAIL?.trim();
  const password = process.env.PLAYTOMIC_MANAGER_PASSWORD;
  const tenantId = process.env.PLAYTOMIC_TENANT_ID?.trim() || RDB_TENANT_ID;
  if (!email || !password) {
    throw new Error(
      'Faltan credenciales: define PLAYTOMIC_MANAGER_EMAIL y PLAYTOMIC_MANAGER_PASSWORD en el entorno.'
    );
  }
  return { email, password, tenantId };
}

/** Extrae un token sin asumir el casing exacto de la respuesta de Playtomic. */
function pickToken(payload: unknown, keys: string[]): string | null {
  if (!payload || typeof payload !== 'object') return null;
  const obj = payload as Record<string, unknown>;
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === 'string' && v.length > 0) return v;
  }
  return null;
}

async function postJson(path: string, body: unknown): Promise<unknown> {
  const res = await fetch(`${MANAGER_BASE}${path}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      accept: 'application/json',
      'x-requested-with': REQUESTED_WITH,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!res.ok) {
    // El body de error de Playtomic es genérico (no credenciales). Cap corto.
    const snippet = (await res.text().catch(() => '')).slice(0, 200);
    throw new Error(`Playtomic ${path} respondió ${res.status}. ${snippet}`);
  }
  return res.json();
}

/** Paso 1: login con email+password → access + refresh token (ROLE_CUSTOMER). */
async function login(email: string, password: string): Promise<{ refreshToken: string }> {
  const data = await postJson('/api/v3/auth/login', {
    email,
    password,
    requested_user_roles: ['ROLE_CUSTOMER'],
  });
  const refreshToken = pickToken(data, ['refresh_token', 'refreshToken']);
  if (!refreshToken) {
    throw new Error('Login de Playtomic OK pero la respuesta no trae refresh_token reconocible.');
  }
  return { refreshToken };
}

/** Paso 2: canjea el refresh token por uno con scope ROLE_TENANT_MANAGER. */
async function exchangeForTenantManager(
  refreshToken: string,
  tenantId: string
): Promise<{ accessToken: string }> {
  const data = await postJson('/api/v3/auth/token', {
    refresh_token: refreshToken,
    requested_user_roles: ['ROLE_TENANT_MANAGER'],
    requested_user_scopes: [{ role: 'ROLE_TENANT_MANAGER', scope_id: tenantId }],
  });
  const accessToken = pickToken(data, ['access_token', 'accessToken']);
  if (!accessToken) {
    throw new Error(
      'Canje de token de Playtomic OK pero la respuesta no trae access_token reconocible.'
    );
  }
  return { accessToken };
}

/** Paso 3: descarga el CSV de pagos del periodo dado. */
async function fetchPaymentsCsv(
  accessToken: string,
  tenantId: string,
  window: PlaytomicCsvWindow
): Promise<string> {
  const params = new URLSearchParams({
    tenant_id: tenantId,
    start_payment_date: window.startDate.toISOString(),
    end_payment_date: window.endDate.toISOString(),
    payment_status: 'PAID,REFUNDED',
  });
  const res = await fetch(`${MANAGER_BASE}/api/v1/club_payments/export?${params.toString()}`, {
    method: 'GET',
    headers: {
      authorization: `Bearer ${accessToken}`,
      'x-authorization-scope': `tenant:${tenantId}`,
      'x-requested-with': REQUESTED_WITH,
      accept: 'text/csv,application/octet-stream,*/*',
    },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!res.ok) {
    const snippet = (await res.text().catch(() => '')).slice(0, 200);
    throw new Error(`Export de Playtomic respondió ${res.status}. ${snippet}`);
  }
  const csv = await res.text();
  // Sanity: el reporte real siempre incluye el header de columnas. Si el
  // endpoint devolvió HTML de login o un error suave, lo cortamos acá.
  if (!csv.includes('Corporate Name')) {
    throw new Error(
      `El export no parece un CSV de pagos válido (no contiene el header esperado). Recibido: ${csv.slice(0, 120)}`
    );
  }
  return csv;
}

/**
 * Orquesta los 3 pasos y devuelve el CSV crudo, listo para
 * `parsePaymentsCsv()`. Lanza Error con mensaje accionable si algo falla;
 * nunca incluye password ni tokens en el mensaje.
 */
export async function downloadPlaytomicPaymentsCsv(
  window: PlaytomicCsvWindow
): Promise<{ csv: string; tenantId: string }> {
  const { email, password, tenantId } = readCredentials();
  const { refreshToken } = await login(email, password);
  const { accessToken } = await exchangeForTenantManager(refreshToken, tenantId);
  const csv = await fetchPaymentsCsv(accessToken, tenantId, window);
  return { csv, tenantId };
}
