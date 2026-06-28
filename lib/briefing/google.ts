/**
 * Lectura de Gmail + Calendar para el briefing (iniciativa
 * `daily-briefing-automation`, fase 2).
 *
 * Auth = service account con domain-wide delegation impersonando a
 * `beto@anorte.com` (scopes SOLO lectura). Flujo JWT-bearer con puro
 * `node:crypto` + `fetch` — sin dependencia de `googleapis`. La llave vive en
 * `process.env.GOOGLE_SA_KEY` (Vercel, sensitive) / `op://Infrastructure/GOOGLE_SA_BRIEFING`.
 *
 * Todo es fail-open: sin llave o con error de API, la pieza devuelve
 * `available:false` con el motivo y el briefing lo reporta en §2 sin abortar.
 * Las funciones de shape (`shapeGmail`/`shapeBirthdays`) son puras (testeadas);
 * el resto es IO fino.
 */

import crypto from 'node:crypto';

const SUBJECT = 'beto@anorte.com';
const SCOPES = [
  'https://www.googleapis.com/auth/calendar.readonly',
  'https://www.googleapis.com/auth/gmail.readonly',
].join(' ');

const GMAIL_QUERY = 'newer_than:1d -category:promotions -category:social';
const GMAIL_MAX = 12;

type SaKey = { client_email: string; private_key: string };

export type CalEvento = { cuando: string; titulo: string };
export type Cumple = { fecha: string; quien: string };
export type GmailMsg = { de: string; asunto: string; snippet: string };

export type CalendarBriefing =
  | { available: true; hoy: CalEvento[]; cumples: Cumple[] }
  | { available: false; error: string };

export type GmailBriefing =
  | { available: true; mensajes: GmailMsg[] }
  | { available: false; error: string };

export type GoogleBriefing = { calendar: CalendarBriefing; gmail: GmailBriefing };

function b64url(input: crypto.BinaryLike): string {
  return Buffer.from(input as Buffer | string)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

/** Lee y valida la llave del SA desde el env. `null` si falta o es inválida. */
export function loadSaKey(): SaKey | null {
  const raw = process.env.GOOGLE_SA_KEY;
  if (!raw) return null;
  try {
    const k = JSON.parse(raw) as Partial<SaKey>;
    return k.client_email && k.private_key
      ? { client_email: k.client_email, private_key: k.private_key }
      : null;
  } catch {
    return null;
  }
}

async function getAccessToken(key: SaKey): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claim = b64url(
    JSON.stringify({
      iss: key.client_email,
      sub: SUBJECT,
      scope: SCOPES,
      aud: 'https://oauth2.googleapis.com/token',
      iat: now,
      exp: now + 3600,
    })
  );
  const signer = crypto.createSign('RSA-SHA256');
  signer.update(`${header}.${claim}`);
  const jwt = `${header}.${claim}.${b64url(signer.sign(key.private_key))}`;

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  });
  const json = (await res.json()) as {
    access_token?: string;
    error_description?: string;
    error?: string;
  };
  if (!res.ok || !json.access_token) {
    throw new Error(`token: ${json.error_description ?? json.error ?? res.statusText}`);
  }
  return json.access_token;
}

/** Hora local de Matamoros HH:MM de un ISO/fecha de Google (o '' si all-day). */
function horaMatamoros(ev: { dateTime?: string; date?: string }): string {
  if (!ev.dateTime) return ev.date ? 'todo el día' : '';
  return new Intl.DateTimeFormat('es-MX', {
    timeZone: 'America/Matamoros',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(ev.dateTime));
}

type RawEvent = {
  summary?: string;
  start?: { dateTime?: string; date?: string };
};

/** Pura: agenda de hoy desde los eventos crudos de Calendar. */
export function shapeAgenda(items: RawEvent[]): CalEvento[] {
  return items
    .filter((e) => e.summary)
    .map((e) => ({ cuando: horaMatamoros(e.start ?? {}), titulo: e.summary as string }));
}

/** Pura: cumpleaños desde eventos tipo birthday (fecha + nombre). */
export function shapeBirthdays(items: RawEvent[]): Cumple[] {
  return items
    .filter((e) => e.summary)
    .map((e) => ({
      fecha: e.start?.date ?? e.start?.dateTime?.slice(0, 10) ?? '',
      quien: e.summary as string,
    }));
}

type RawGmailMsg = {
  snippet?: string;
  payload?: { headers?: { name: string; value: string }[] };
};

/** Pura: shape de un mensaje de Gmail (metadata + snippet) a {de, asunto, snippet}. */
export function shapeGmail(messages: RawGmailMsg[]): GmailMsg[] {
  return messages.map((m) => {
    const h = m.payload?.headers ?? [];
    const get = (n: string) => h.find((x) => x.name.toLowerCase() === n.toLowerCase())?.value ?? '';
    return { de: get('From'), asunto: get('Subject'), snippet: (m.snippet ?? '').slice(0, 200) };
  });
}

async function fetchCalendar(token: string): Promise<CalendarBriefing> {
  try {
    const auth = { Authorization: `Bearer ${token}` };
    const startHoy = new Date();
    startHoy.setHours(0, 0, 0, 0);
    const endHoy = new Date();
    endHoy.setHours(23, 59, 59, 999);
    const in7 = new Date(Date.now() + 7 * 86_400_000);

    const agendaUrl =
      `https://www.googleapis.com/calendar/v3/calendars/primary/events?` +
      `timeMin=${startHoy.toISOString()}&timeMax=${endHoy.toISOString()}&singleEvents=true&orderBy=startTime&maxResults=20`;
    const cumplesUrl =
      `https://www.googleapis.com/calendar/v3/calendars/primary/events?` +
      `timeMin=${startHoy.toISOString()}&timeMax=${in7.toISOString()}&singleEvents=true&orderBy=startTime&eventTypes=birthday&maxResults=30`;

    const [aRes, cRes] = await Promise.all([
      fetch(agendaUrl, { headers: auth }),
      fetch(cumplesUrl, { headers: auth }),
    ]);
    const aJson = (await aRes.json()) as { items?: RawEvent[]; error?: { message?: string } };
    if (!aRes.ok) return { available: false, error: aJson.error?.message ?? 'Calendar agenda' };
    const cJson = (await cRes.json()) as { items?: RawEvent[] };
    return {
      available: true,
      hoy: shapeAgenda(aJson.items ?? []),
      cumples: shapeBirthdays(cRes.ok ? (cJson.items ?? []) : []),
    };
  } catch (e) {
    return { available: false, error: e instanceof Error ? e.message : String(e) };
  }
}

async function fetchGmail(token: string): Promise<GmailBriefing> {
  try {
    const auth = { Authorization: `Bearer ${token}` };
    const listUrl =
      `https://gmail.googleapis.com/gmail/v1/users/me/messages?` +
      `q=${encodeURIComponent(GMAIL_QUERY)}&maxResults=${GMAIL_MAX}`;
    const listRes = await fetch(listUrl, { headers: auth });
    const listJson = (await listRes.json()) as {
      messages?: { id: string }[];
      error?: { message?: string };
    };
    if (!listRes.ok) return { available: false, error: listJson.error?.message ?? 'Gmail list' };
    const ids = (listJson.messages ?? []).map((m) => m.id);
    const msgs = await Promise.all(
      ids.map(async (id) => {
        const r = await fetch(
          `https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject`,
          { headers: auth }
        );
        return r.ok ? ((await r.json()) as RawGmailMsg) : null;
      })
    );
    return {
      available: true,
      mensajes: shapeGmail(msgs.filter((m): m is RawGmailMsg => m !== null)),
    };
  } catch (e) {
    return { available: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * Lee Gmail + Calendar impersonando a Beto. Fail-open por pieza: si falta la
 * llave, ambas devuelven el gap; si falla solo una API, la otra sigue.
 */
export async function getGoogleBriefing(): Promise<GoogleBriefing> {
  const key = loadSaKey();
  if (!key) {
    const error = 'Sin GOOGLE_SA_KEY (service account de Google).';
    return { calendar: { available: false, error }, gmail: { available: false, error } };
  }
  let token: string;
  try {
    token = await getAccessToken(key);
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    return { calendar: { available: false, error }, gmail: { available: false, error } };
  }
  const [calendar, gmail] = await Promise.all([fetchCalendar(token), fetchGmail(token)]);
  return { calendar, gmail };
}
