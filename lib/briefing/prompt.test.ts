import { describe, expect, it } from 'vitest';
import { buildBriefingPrompt, renderHealthBlock, BRIEFING_SYSTEM } from './prompt';
import type { HealthBriefing } from './health';

const fecha = { iso: '2026-06-27', diaSemana: 'sábado', larga: 'sábado 27 de junio de 2026' };

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
  it('el system cubre salud, péptidos con disclaimer cardiovascular y orden', () => {
    expect(BRIEFING_SYSTEM).toMatch(/Salud/);
    expect(BRIEFING_SYSTEM).toMatch(/cardiólogo/);
    expect(BRIEFING_SYSTEM).toMatch(/web search/i);
    expect(BRIEFING_SYSTEM).toMatch(/AUTORITATIVOS/);
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

  it('buildBriefingPrompt arma system + user con fecha y salud', () => {
    const { system, prompt } = buildBriefingPrompt(healthOk, fecha);
    expect(system).toBe(BRIEFING_SYSTEM);
    expect(prompt).toContain('2026-06-27');
    expect(prompt).toContain('sábado 27 de junio de 2026');
    expect(prompt).toContain('7d=6.1h');
    expect(prompt).toContain('No incluyas secciones de pendientes, cumpleaños ni correo');
  });
});
