import { describe, expect, it } from 'vitest';
import {
  buildBriefingPrompt,
  renderHealthBlock,
  renderCalendarBlock,
  renderGmailBlock,
  BRIEFING_SYSTEM,
} from './prompt';
import type { HealthBriefing } from './health';
import type { CalendarBriefing, GmailBriefing } from './google';

const fecha = { iso: '2026-06-27', diaSemana: 'sábado', larga: 'sábado 27 de junio de 2026' };

const calOk: CalendarBriefing = {
  available: true,
  hoy: [{ cuando: '09:00', titulo: 'Consejo DILESA' }],
  cumples: [{ fecha: '2026-06-29', quien: 'Cumpleaños de Memo' }],
};

const gmailOk: GmailBriefing = {
  available: true,
  mensajes: [{ de: 'lead@cliente.com', asunto: 'Cotización Jeep', snippet: 'Nos interesa…' }],
};

const healthOk: HealthBriefing = {
  available: true,
  sleep7d: 6.1,
  sleepPrev23d: 7.2,
  rhr7d: 61,
  rhrPrev23d: 58,
  hrv7d: 38,
  hrvPrev23d: 44,
  perDay14d: [{ date: '2026-06-26', sleepH: 5.4, rhr: 63, hrv: 35 }],
  stale: [{ metric: 'Sueño', daysAgo: 5 }],
};

describe('daily-briefing · prompt', () => {
  it('el system cubre salud, péptidos con disclaimer cardiovascular, cumpleaños, correo y orden', () => {
    expect(BRIEFING_SYSTEM).toMatch(/Salud/);
    expect(BRIEFING_SYSTEM).toMatch(/cardiólogo/);
    expect(BRIEFING_SYSTEM).toMatch(/web search/i);
    expect(BRIEFING_SYSTEM).toMatch(/AUTORITATIVOS/);
    expect(BRIEFING_SYSTEM).toMatch(/Cumpleaños/);
    expect(BRIEFING_SYSTEM).toMatch(/Correo/);
    // Reminders sigue siendo el único pendiente declarado.
    expect(BRIEFING_SYSTEM).toMatch(/Apple Reminders/);
  });

  it('renderCalendarBlock incluye cumpleaños y agenda; gap si no disponible', () => {
    const block = renderCalendarBlock(calOk);
    expect(block).toContain('2026-06-29 Cumpleaños de Memo');
    expect(block).toContain('09:00 Consejo DILESA');
    expect(renderCalendarBlock({ available: false, error: 'Sin GOOGLE_SA_KEY.' })).toContain(
      'NO DISPONIBLE'
    );
  });

  it('renderGmailBlock lista mensajes; gap si no disponible; vacío si 0', () => {
    expect(renderGmailBlock(gmailOk)).toContain('Cotización Jeep');
    expect(renderGmailBlock({ available: true, mensajes: [] })).toContain('sin correos');
    expect(renderGmailBlock({ available: false, error: 'Gmail list' })).toContain('NO DISPONIBLE');
  });

  it('renderHealthBlock incluye los números y los sync gaps', () => {
    const block = renderHealthBlock(healthOk);
    expect(block).toContain('7d=6.1h');
    expect(block).toContain('23d previos=7.2h');
    expect(block).toContain('61 bpm');
    expect(block).toContain('SYNC GAPS');
    expect(block).toContain('Sueño (5d)');
    expect(block).toContain('2026-06-26');
  });

  it('renderHealthBlock no disponible reporta el gap', () => {
    const block = renderHealthBlock({ available: false, error: 'Sin service role.' });
    expect(block).toContain('NO DISPONIBLE');
    expect(block).toContain('Sin service role.');
  });

  it('buildBriefingPrompt arma system + user con fecha, salud, calendar y gmail', () => {
    const { system, prompt } = buildBriefingPrompt(healthOk, calOk, gmailOk, fecha);
    expect(system).toBe(BRIEFING_SYSTEM);
    expect(prompt).toContain('2026-06-27');
    expect(prompt).toContain('sábado 27 de junio de 2026');
    expect(prompt).toContain('7d=6.1h');
    expect(prompt).toContain('Cumpleaños de Memo');
    expect(prompt).toContain('Cotización Jeep');
    expect(prompt).toContain('No incluyas sección de pendientes');
  });
});
