import { afterEach, describe, expect, it } from 'vitest';
import { shapeAgenda, shapeBirthdays, shapeGmail, loadSaKey } from './google';

describe('daily-briefing · google shapers', () => {
  it('shapeAgenda mapea título y hora (all-day vs con hora)', () => {
    const out = shapeAgenda([
      { summary: 'Junta', start: { dateTime: '2026-06-27T15:00:00Z' } },
      { summary: 'Feriado', start: { date: '2026-06-27' } },
      { start: { date: '2026-06-27' } }, // sin summary → se filtra
    ]);
    expect(out).toHaveLength(2);
    expect(out[0].titulo).toBe('Junta');
    expect(out[1].cuando).toBe('todo el día');
  });

  it('shapeBirthdays toma fecha (date) + nombre', () => {
    const out = shapeBirthdays([
      { summary: 'Cumpleaños de Grecia', start: { date: '2026-03-26' } },
    ]);
    expect(out).toEqual([{ fecha: '2026-03-26', quien: 'Cumpleaños de Grecia' }]);
  });

  it('shapeGmail extrae From/Subject de los headers y recorta snippet', () => {
    const out = shapeGmail([
      {
        snippet: 'hola '.repeat(60),
        payload: {
          headers: [
            { name: 'From', value: 'Lead <lead@x.com>' },
            { name: 'Subject', value: 'Cotización' },
            { name: 'Date', value: 'irrelevante' },
          ],
        },
      },
    ]);
    expect(out[0].de).toBe('Lead <lead@x.com>');
    expect(out[0].asunto).toBe('Cotización');
    expect(out[0].snippet.length).toBeLessThanOrEqual(200);
  });

  it('shapeGmail tolera headers/payload ausentes', () => {
    const out = shapeGmail([{}]);
    expect(out[0]).toEqual({ de: '', asunto: '', snippet: '' });
  });

  describe('loadSaKey', () => {
    const prev = process.env.GOOGLE_SA_KEY;
    afterEach(() => {
      if (prev === undefined) delete process.env.GOOGLE_SA_KEY;
      else process.env.GOOGLE_SA_KEY = prev;
    });

    it('null si falta el env', () => {
      delete process.env.GOOGLE_SA_KEY;
      expect(loadSaKey()).toBeNull();
    });

    it('null si el JSON es inválido o le faltan campos', () => {
      process.env.GOOGLE_SA_KEY = 'no-json';
      expect(loadSaKey()).toBeNull();
      process.env.GOOGLE_SA_KEY = JSON.stringify({ client_email: 'x@y.z' }); // sin private_key
      expect(loadSaKey()).toBeNull();
    });

    it('devuelve la llave si está completa', () => {
      process.env.GOOGLE_SA_KEY = JSON.stringify({ client_email: 'x@y.z', private_key: 'KEY' });
      expect(loadSaKey()).toEqual({ client_email: 'x@y.z', private_key: 'KEY' });
    });
  });
});
