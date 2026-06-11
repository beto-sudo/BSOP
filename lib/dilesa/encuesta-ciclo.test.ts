import { describe, expect, it } from 'vitest';
import { accionParaEncuesta, type EncuestaCicloRow } from './encuesta-ciclo';

const base: EncuestaCicloRow = {
  estado: 'programada',
  programada_para: '2026-06-12',
  intentos: 0,
  ultimo_envio_at: null,
};

describe('accionParaEncuesta — timeline de Beto (D+2, +1, +1, → AC)', () => {
  it('programada: espera hasta programada_para y entonces envía', () => {
    expect(accionParaEncuesta(base, '2026-06-11')).toBe(null);
    expect(accionParaEncuesta(base, '2026-06-12')).toBe('enviar_inicial');
    expect(accionParaEncuesta(base, '2026-06-15')).toBe('enviar_inicial'); // catch-up si el cron falló días
  });

  it('enviada con 1 intento: recordatorio al día siguiente, no el mismo día', () => {
    const e: EncuestaCicloRow = {
      ...base,
      estado: 'enviada',
      intentos: 1,
      ultimo_envio_at: '2026-06-12T16:00:00.000Z',
    };
    expect(accionParaEncuesta(e, '2026-06-12')).toBe(null);
    expect(accionParaEncuesta(e, '2026-06-13')).toBe('recordatorio');
  });

  it('enviada con 2 intentos: último aviso al día siguiente', () => {
    const e: EncuestaCicloRow = {
      ...base,
      estado: 'enviada',
      intentos: 2,
      ultimo_envio_at: '2026-06-13T16:00:00.000Z',
    };
    expect(accionParaEncuesta(e, '2026-06-14')).toBe('ultimo_aviso');
  });

  it('enviada con 3 intentos: al día siguiente pasa a Atención a Clientes', () => {
    const e: EncuestaCicloRow = {
      ...base,
      estado: 'enviada',
      intentos: 3,
      ultimo_envio_at: '2026-06-14T16:00:00.000Z',
    };
    expect(accionParaEncuesta(e, '2026-06-14')).toBe(null);
    expect(accionParaEncuesta(e, '2026-06-15')).toBe('pasar_a_atencion');
  });

  it('estados terminales no generan acción', () => {
    for (const estado of ['respondida', 'atencion_clientes', 'manual', 'sin_respuesta']) {
      expect(
        accionParaEncuesta(
          { ...base, estado, intentos: 1, ultimo_envio_at: '2026-06-01T00:00:00Z' },
          '2026-06-15'
        )
      ).toBe(null);
    }
  });
});
