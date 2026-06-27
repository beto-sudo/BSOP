/**
 * Envío del briefing por Resend (iniciativa `daily-briefing-automation`).
 *
 * Mismo canal que el resto de los correos del repo (dominio bsop.io verificado
 * en Resend). El `User-Agent` es OBLIGATORIO: sin él el WAF de Cloudflare de
 * Resend bloquea con 403/1010 (verificado en la corrida original del SKILL).
 */

const RESEND_ENDPOINT = 'https://api.resend.com/emails';
export const BRIEFING_FROM = 'Daily Briefing <briefing@bsop.io>';

export async function sendBriefingEmail(
  resendKey: string,
  payload: { html: string; subject: string; to: string; from?: string }
): Promise<{ ok: boolean; id?: string; error?: unknown }> {
  const res = await fetch(RESEND_ENDPOINT, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${resendKey}`,
      'Content-Type': 'application/json',
      'User-Agent': 'BSOP-DailyBriefing/1.0',
    },
    body: JSON.stringify({
      from: payload.from ?? BRIEFING_FROM,
      to: [payload.to],
      subject: payload.subject,
      html: payload.html,
    }),
  });
  if (!res.ok) {
    return { ok: false, error: await res.text().catch(() => res.statusText) };
  }
  const data = (await res.json()) as { id?: string };
  return { ok: true, id: data.id };
}
