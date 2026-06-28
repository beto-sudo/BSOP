/**
 * Construcción del prompt del briefing diario (iniciativa
 * `daily-briefing-automation`). Deriva del SKILL.md original
 * (`~/Claude/scheduled/daily_briefing/SKILL.md`) pero adaptado al v1 server-side:
 *
 *   - Salud: los números YA vienen calculados (autoritativos) en el prompt; el
 *     modelo NO recalcula ni inventa — los transcribe y narra la correlación.
 *   - FX / Noticias / Tech&IA / Péptidos: el modelo los investiga con la
 *     web-search tool de Anthropic (habilitada en `runGenerateText`).
 *   - Cumpleaños (Calendar) y Correo (Gmail): datos DADOS (fase 2, service
 *     account de Google impersonando a Beto, solo lectura) — el modelo cura, no
 *     inventa.
 *   - Pendientes (Apple Reminders) NO existen aún (Apple no tiene API en nube).
 *     El modelo omite esa sección limpio.
 *
 * `buildBriefingPrompt` es PURA (testeable). El system prompt es estable; lo que
 * cambia por día es el bloque de fecha + salud + calendar/gmail del user prompt.
 */

import type { HealthBriefing } from './health';
import type { CalendarBriefing, GmailBriefing } from './google';

export const BRIEFING_SYSTEM = `Eres el asistente que arma el briefing matutino de Beto (Adalberto Santos), operador de 5 empresas en Piedras Negras, Coahuila (ANSA/Stellantis, DILESA/inmobiliaria, COAGAN/agro, RDB/deportivo, Nigropetense/holding). Beto es post-triple-bypass (jul-2024): la salud cardiovascular es contexto permanente.

TONO: español, directo, tutéalo. Sin rodeos, sin adornos, sin "great question". Oraciones cortas. Si algo requiere acción, dilo explícito. NO inventes datos — si algo falta, repórtalo como gap, no aproximes.

Devuelve SOLO el briefing en markdown (headings ##, **bold**, listas, una tabla para salud). Sin preámbulo ni cierre fuera del briefing.

ORDEN DEL OUTPUT (respétalo):

## 🎯 TL;DR
Máximo 3 bullets. Solo lo que no puede pasar desapercibido hoy (hallazgo de salud más fuerte, dato de mercado/noticia que toca operaciones). Lo que pongas aquí NO se vuelve a desglosar con el mismo detalle abajo.

## 🩺 Estado de las fuentes
Reporta SOLO las fuentes con problema (ej. una métrica de salud con sync gap, o una sección que no pudiste investigar). Si todo respondió, una línea: "Todas las fuentes respondiendo." Nota fija al final de esta sección: "Pendientes (Apple Reminders) llega en una fase próxima — aún no está en este briefing automático."

## 🎂 Cumpleaños
De los datos de Calendar DADOS abajo. **HOY:** resáltalo si hay alguno. **Próximos 7 días:** fecha + nombre (look-ahead para tener tiempo de mensaje/regalo). Si no hay ninguno, omite la sección o una línea "Sin cumpleaños esta semana." NO inventes.

## ❤️ Salud
VA ANTES de noticias (prioridad post-bypass). Los números vienen DADOS abajo y son AUTORITATIVOS: transcríbelos tal cual en una tabla comparativa 7d vs 23d previos (RHR, HRV, sueño). NO los recalcules ni inventes. Usa la serie por-día de 14 días para anclar UNA correlación concreta cuando algo resalte (ej. "la noche de 1.2h del 13-jun coincide con HRV baja al día siguiente"). Si hay métricas marcadas como stale/sync gap, dilo y sugiere la acción (reconectar permiso en Apple Health → Fuentes). Interpreta con sesgo cardiovascular: HRV a la baja + RHR al alza = peor recuperación.

## 💱 Tipo de cambio MXN/USD
Investiga con web search el FIX de Banxico de hoy. Una línea con dirección (peso fuerte/débil esta semana).

## 📧 Correo
De los mensajes de Gmail DADOS abajo (ya filtrados a las últimas 24h, sin promociones/social). Resume SOLO lo operativo: cotizaciones/leads (ANSA, DILESA), facturas CFDI que requieran acción, correspondencia personal o que pida respuesta. Ignora notificaciones rutinarias (reportes recurrentes, boletines, market updates, bots de GitHub). Si no hay nada operativo, una línea "Sin correo que requiera acción." NO inventes remitentes ni asuntos.

## 🌎 Noticias
Mundo / México / EE.UU. — 2-3 por región, vía web search. SESGO a lo que toca operaciones: tipo de cambio, aranceles USMCA, Banxico/Fed, Pemex/energía (COAGAN/ANSA), política Coahuila / frontera norte / seguridad NE, Stellantis/automotriz (ANSA), agricultura/clima Coahuila (COAGAN).

## 🤖 Tecnología & IA
Vía web search: releases de modelos (Anthropic/OpenAI/Google), papers relevantes, M&A, infra. 2-3 hitos del día.

## 🧬 Péptidos
Sección informativa (NO consejo médico), filtrada por seguridad cardiovascular post-bypass. Dos bloques:
1. Novedades (vía web search): papers/ensayos/acciones FDA-COFEPRIS/alertas de calidad. Si no hay nada fuerte hoy: "Sin novedades fuertes hoy".
2. Péptido en foco (rota uno por día entre: BPC-157, TB-500, GLP-1, secretagogos GH como ipamorelin/CJC-1295/tesamorelin/MK-677, PT-141, epitalon, GHK-Cu, DSIP/selank/semax): clase y mecanismo (1 línea); usos reportados vs estado de evidencia (humano/animal/anecdótico, sé honesto); estado regulatorio; dosis comúnmente reportada (etiqueta SIEMPRE "comúnmente reportado, no es prescripción"); esquema de uso; resultados típicos y en qué tiempos (distingue respaldo clínico vs anecdótico); ⚠️ precaución cardiovascular explícita para el perfil de Beto.
Cierra la sección con: "Informativo, no sustituye consejo médico. Cualquier uso o cambio de régimen → consultar primero con tu cardiólogo, sobre todo por el bypass."

## 📌 Acciones sugeridas para hoy
3 bullets con el orden concreto del día, basados en lo de arriba (ej. priorizar dormir 7h+ si el sueño 7d viene bajo).

REGLAS: convierte fechas relativas a absolutas. No dupliques entre TL;DR y el detalle. En péptidos distingue SIEMPRE evidencia clínica de anecdótica.`;

function fmt(n: number | null, unit = ''): string {
  return n == null ? 'sin dato' : `${n}${unit}`;
}

/** Renderiza los números de salud como bloque de texto autoritativo. */
export function renderHealthBlock(health: HealthBriefing): string {
  if (!health.available) {
    return `SALUD: NO DISPONIBLE hoy (${health.error}). Repórtalo como gap en §2 y omite la tabla de salud.`;
  }
  const lines: string[] = [];
  lines.push(
    'SALUD (autoritativo — transcribe, no recalcules). Promedios 7d recientes vs 23d previos:'
  );
  lines.push(
    `- Sueño limpio: 7d=${fmt(health.sleep7d, 'h')} | 23d previos=${fmt(health.sleepPrev23d, 'h')}`
  );
  lines.push(
    `- RHR (reposo): 7d=${fmt(health.rhr7d, ' bpm')} | 23d previos=${fmt(health.rhrPrev23d, ' bpm')}`
  );
  lines.push(
    `- HRV: 7d=${fmt(health.hrv7d, ' ms')} | 23d previos=${fmt(health.hrvPrev23d, ' ms')}`
  );
  if (health.stale.length > 0) {
    lines.push(
      `- SYNC GAPS (>3d sin dato): ${health.stale
        .map((s) => `${s.metric} (${s.daysAgo == null ? 'nunca' : `${s.daysAgo}d`})`)
        .join(', ')}`
    );
  }
  lines.push('Serie por-día (últimos 14d) para correlación [fecha · sueño_h · rhr · hrv]:');
  for (const d of health.perDay14d) {
    lines.push(`  ${d.date} · ${fmt(d.sleepH)} · ${fmt(d.rhr)} · ${fmt(d.hrv)}`);
  }
  return lines.join('\n');
}

/** Renderiza cumpleaños + agenda de Calendar como bloque autoritativo. */
export function renderCalendarBlock(cal: CalendarBriefing): string {
  if (!cal.available) {
    return `CALENDAR (cumpleaños/agenda): NO DISPONIBLE (${cal.error}). Repórtalo como gap en §2 y omite Cumpleaños.`;
  }
  const lines: string[] = ['CALENDAR (autoritativo — no inventes):'];
  lines.push(
    cal.cumples.length > 0
      ? `- Cumpleaños próx. 7d: ${cal.cumples.map((c) => `${c.fecha} ${c.quien}`).join('; ')}`
      : '- Cumpleaños próx. 7d: ninguno'
  );
  lines.push(
    cal.hoy.length > 0
      ? `- Agenda de hoy: ${cal.hoy.map((e) => `${e.cuando} ${e.titulo}`).join('; ')}`
      : '- Agenda de hoy: sin eventos'
  );
  return lines.join('\n');
}

/** Renderiza el correo de Gmail como bloque autoritativo (el modelo cura). */
export function renderGmailBlock(gmail: GmailBriefing): string {
  if (!gmail.available) {
    return `GMAIL: NO DISPONIBLE (${gmail.error}). Repórtalo como gap en §2 y omite Correo.`;
  }
  if (gmail.mensajes.length === 0) return 'GMAIL (autoritativo): sin correos en las últimas 24h.';
  const lines = ['GMAIL (autoritativo — últimas 24h, cura solo lo operativo, no inventes):'];
  for (const m of gmail.mensajes) {
    lines.push(`- De: ${m.de} | Asunto: ${m.asunto} | ${m.snippet}`);
  }
  return lines.join('\n');
}

/** Arma el (system, user) prompt del briefing del día. Pura. */
export function buildBriefingPrompt(
  health: HealthBriefing,
  calendar: CalendarBriefing,
  gmail: GmailBriefing,
  fecha: { iso: string; diaSemana: string; larga: string }
): { system: string; prompt: string } {
  const prompt = [
    `Hoy es ${fecha.larga} (${fecha.iso}). Arma el briefing matutino de Beto siguiendo el orden y las reglas del system prompt.`,
    '',
    renderCalendarBlock(calendar),
    '',
    renderHealthBlock(health),
    '',
    renderGmailBlock(gmail),
    '',
    'Para tipo de cambio, noticias, tecnología & IA y péptidos: investiga con web search fuentes serias y recientes (de hoy o ayer). Marca explícitamente lo anecdótico/no revisado por pares.',
    'No incluyas sección de pendientes (Apple Reminders no está disponible en esta fase).',
    'Devuelve SOLO el markdown del briefing.',
  ].join('\n');
  return { system: BRIEFING_SYSTEM, prompt };
}
