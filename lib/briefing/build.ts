/**
 * Generación del markdown del briefing vía Claude + web search (iniciativa
 * `daily-briefing-automation`). Thin: toda la lógica pura vive en `prompt.ts`;
 * aquí solo se invoca el modelo a través de la capa única `lib/ai` (ADR-046).
 */

import { runGenerateText } from '@/lib/ai';
import { buildBriefingPrompt } from './prompt';
import type { HealthBriefing } from './health';
import type { CalendarBriefing, GmailBriefing } from './google';

/** Tope de búsquedas web del modelo por corrida (FX + noticias + tech + péptidos). */
export const WEB_SEARCH_MAX_USES = 8;

export async function generateBriefingMarkdown(
  health: HealthBriefing,
  calendar: CalendarBriefing,
  gmail: GmailBriefing,
  fecha: { iso: string; diaSemana: string; larga: string }
): Promise<string> {
  const { system, prompt } = buildBriefingPrompt(health, calendar, gmail, fecha);
  return runGenerateText({
    usoId: 'daily-briefing',
    system,
    prompt,
    webSearchMaxUses: WEB_SEARCH_MAX_USES,
    maxRetries: 2,
  });
}
