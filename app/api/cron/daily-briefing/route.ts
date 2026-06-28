/**
 * Daily briefing matutino de Beto — cron server-side (iniciativa
 * `daily-briefing-automation`).
 *
 * Reemplaza la scheduled action de Claude Desktop (corría en la Mac de Beto con
 * MCPs + OAuth que caducaban → se atoraba; 22 días caído al migrar). Ahora vive
 * 100% en Vercel: cero dependencia de su compu, credenciales durables (env vars,
 * no OAuth personal).
 *
 * Pipeline: salud (Supabase service role, reusa los helpers vetados de health) →
 * Claude redacta con web search (lib/ai, ADR-046) FX/noticias/IA/péptidos →
 * markdown→HTML → Resend a beto@anorte.com.
 *
 * Schedule: `0 12,13 * * *` (12:00 y 13:00 UTC). Ver vercel.json. Vercel corre
 * los crons en UTC sin ajustar DST; Matamoros sí observa DST. Disparamos en las
 * dos horas UTC candidatas y el guard de hora local deja pasar solo la que cae a
 * las 07:00 de Matamoros → llega a las 7am todo el año sin editar el cron.
 *
 * Fuentes: Salud (Supabase), Cumpleaños + agenda (Calendar) y Correo (Gmail) vía
 * service account de Google con domain-wide delegation (solo lectura). NO incluye
 * Pendientes (Apple Reminders no tiene API en nube). Cada fuente es fail-open: si
 * falla, el briefing lo nota en §2 y sigue.
 *
 * Security: requiere `Authorization: Bearer ${CRON_SECRET}` (lo manda Vercel).
 */

import { NextRequest, NextResponse } from 'next/server';
import { getHealthBriefing } from '@/lib/briefing/health';
import { getGoogleBriefing } from '@/lib/briefing/google';
import { generateBriefingMarkdown } from '@/lib/briefing/build';
import { mdToEmailHtml } from '@/lib/briefing/markdown';
import { sendBriefingEmail } from '@/lib/briefing/email';
import { matamorosFecha } from '@/lib/briefing/fecha';

// Web search + generación con Opus puede tomar > 60s; damos holgura.
export const maxDuration = 300;

const BRIEFING_TO = 'beto@anorte.com';
const HORA_ENVIO_LOCAL = 7;

/** Hora local de Matamoros (TZ real, auto-DST) para el guard del cron. */
function horaMatamoros(now: Date): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Matamoros',
    hour: '2-digit',
    hour12: false,
  }).formatToParts(now);
  return Number(parts.find((p) => p.type === 'hour')?.value ?? '0') % 24;
}

export async function GET(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET?.trim();
  const authHeader = req.headers.get('authorization');
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const now = new Date();
  // El cron dispara a las 12:00 y 13:00 UTC; solo la corrida que cae a las 07:00
  // de Matamoros envía (la otra se salta). Auto-ajuste a DST sin doble envío.
  const hora = horaMatamoros(now);
  if (hora !== HORA_ENVIO_LOCAL) {
    const skip = { status: 'skipped', reason: `hora local ${hora}:00 != ${HORA_ENVIO_LOCAL}:00` };
    console.log('[daily-briefing]', JSON.stringify(skip));
    return NextResponse.json(skip);
  }

  const resendKey = process.env.RESEND_API_KEY;
  if (!resendKey) {
    return NextResponse.json({ error: 'RESEND_API_KEY missing' }, { status: 500 });
  }

  const fecha = matamorosFecha(now);

  // Fuentes en paralelo (cada una fail-open: si falla, el briefing lo nota en §2).
  const [health, google] = await Promise.all([getHealthBriefing(), getGoogleBriefing()]);

  // Redacción con Claude + web search. Si el modelo truena, no hay correo que
  // mandar — devolvemos 500 para que el log/alerta de Vercel lo capte.
  let markdown: string;
  try {
    markdown = await generateBriefingMarkdown(health, google.calendar, google.gmail, fecha);
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    console.error('[daily-briefing] generación falló:', error);
    return NextResponse.json({ status: 'error', stage: 'generate', error }, { status: 500 });
  }

  const html = mdToEmailHtml(markdown);
  const subject = `Daily Briefing — ${fecha.iso} (${fecha.diaSemana})`;
  const sent = await sendBriefingEmail(resendKey, { html, subject, to: BRIEFING_TO });

  if (!sent.ok) {
    console.error('[daily-briefing] Resend falló:', sent.error);
    return NextResponse.json(
      { status: 'error', stage: 'send', error: String(sent.error) },
      { status: 502 }
    );
  }

  const result = {
    status: 'sent',
    resendId: sent.id,
    to: BRIEFING_TO,
    fecha: fecha.iso,
    healthAvailable: health.available,
  };
  console.log('[daily-briefing]', JSON.stringify(result));
  return NextResponse.json(result);
}
