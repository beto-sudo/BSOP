import { describe, it, expect } from 'vitest';
import {
  calcularExpiraAt,
  snapshotHold,
  formatearVencimiento,
  HOLD_DIAS_HABILES,
  AVISO_HOLD_4H_MS,
  type ColaItem,
} from './hold-cola';

describe('calcularExpiraAt — días hábiles MX', () => {
  it('lunes 10 am MX → miércoles 23:59:59 MX (2 hábiles)', () => {
    // 2026-05-25 (lunes) 10:00 MX = 16:00 UTC
    const created = new Date('2026-05-25T16:00:00Z');
    const expira = calcularExpiraAt(created);
    // Esperado: miércoles 27-may 23:59:59 MX = 28-may 05:59:59 UTC
    expect(expira.toISOString()).toBe('2026-05-28T05:59:59.999Z');
  });

  it('viernes 10 am MX → martes 23:59:59 MX (sáb/dom no cuentan)', () => {
    // 2026-05-29 (viernes) 10:00 MX = 16:00 UTC
    const created = new Date('2026-05-29T16:00:00Z');
    const expira = calcularExpiraAt(created);
    // Esperado: martes 2-jun 23:59:59 MX = 3-jun 05:59:59 UTC
    expect(expira.toISOString()).toBe('2026-06-03T05:59:59.999Z');
  });

  it('jueves antes de festivo 1-may → corrige por festivo viernes', () => {
    // 2026-04-30 (jueves) 12:00 MX. 1-may (viernes) es Día del Trabajo.
    const created = new Date('2026-04-30T18:00:00Z');
    const expira = calcularExpiraAt(created);
    // Día 1 (siguiente hábil del jueves 30): viernes festivo → salta al lunes 4
    // Día 2 (siguiente hábil del lunes 4): martes 5
    // Deadline = martes 5-may 23:59:59 MX = miércoles 6-may 05:59:59 UTC.
    expect(expira.toISOString()).toBe('2026-05-06T05:59:59.999Z');
  });

  it('sábado → arranca conteo desde lunes (2 hábiles adicionales)', () => {
    // 2026-05-23 (sábado) 10:00 MX
    const created = new Date('2026-05-23T16:00:00Z');
    const expira = calcularExpiraAt(created);
    // Día 1: lunes 25; Día 2: martes 26
    // Pero como sábado NO es hábil, siguienteDiaHabil(sábado) = lunes,
    // siguienteDiaHabil(lunes) = martes. Deadline = martes 26-may.
    expect(expira.toISOString()).toBe('2026-05-27T05:59:59.999Z');
  });

  it('día calendar MX vs UTC: viernes 23h MX (sáb 5h UTC) → cuenta como viernes', () => {
    // 2026-05-29 (viernes) 23:00 MX = sábado 30-may 05:00 UTC
    const created = new Date('2026-05-30T05:00:00Z');
    const expira = calcularExpiraAt(created);
    // El día MX es viernes 29. Hábiles: viernes + lunes = martes
    // Deadline martes 2-jun 23:59:59 MX = miércoles 3-jun 05:59:59 UTC
    expect(expira.toISOString()).toBe('2026-06-03T05:59:59.999Z');
  });

  it('constante HOLD_DIAS_HABILES = 2', () => {
    expect(HOLD_DIAS_HABILES).toBe(2);
  });

  it('AVISO_HOLD_4H_MS = 4h en ms', () => {
    expect(AVISO_HOLD_4H_MS).toBe(4 * 60 * 60 * 1000);
  });
});

describe('snapshotHold — estados de la cola', () => {
  const ventaId = 'venta-1';
  const otroId = 'venta-2';
  const tercerId = 'venta-3';
  const ahora = new Date('2026-05-25T16:00:00Z');

  function colaCon(items: Array<{ id: string; pos: number }>): ColaItem[] {
    return items.map(({ id, pos }) => ({
      venta_id: id,
      posicion: pos,
      created_at: ahora.toISOString(),
      expira_at: null,
    }));
  }

  it('líder con > 4h restantes → lider_ok', () => {
    const expira = new Date(ahora.getTime() + 10 * 60 * 60 * 1000); // +10h
    const snap = snapshotHold({
      ventaId,
      estado: 'activa',
      expiraAt: expira,
      cola: colaCon([{ id: ventaId, pos: 1 }]),
      ahora,
    });
    expect(snap.estado).toBe('lider_ok');
    expect(snap.posicion).toBe(1);
    expect(snap.esperando).toBe(0);
  });

  it('líder con ≤ 4h restantes → lider_warning', () => {
    const expira = new Date(ahora.getTime() + 3 * 60 * 60 * 1000); // +3h
    const snap = snapshotHold({
      ventaId,
      estado: 'activa',
      expiraAt: expira,
      cola: colaCon([{ id: ventaId, pos: 1 }]),
      ahora,
    });
    expect(snap.estado).toBe('lider_warning');
  });

  it('líder con expira_at en el pasado → lider_expirado', () => {
    const expira = new Date(ahora.getTime() - 60_000);
    const snap = snapshotHold({
      ventaId,
      estado: 'activa',
      expiraAt: expira,
      cola: colaCon([{ id: ventaId, pos: 1 }]),
      ahora,
    });
    expect(snap.estado).toBe('lider_expirado');
    expect(snap.restante_ms).toBeLessThan(0);
  });

  it('líder cuenta esperando correctamente con N en cola', () => {
    const expira = new Date(ahora.getTime() + 10 * 60 * 60 * 1000);
    const snap = snapshotHold({
      ventaId,
      estado: 'activa',
      expiraAt: expira,
      cola: colaCon([
        { id: ventaId, pos: 1 },
        { id: otroId, pos: 2 },
        { id: tercerId, pos: 3 },
      ]),
      ahora,
    });
    expect(snap.estado).toBe('lider_ok');
    expect(snap.esperando).toBe(2);
  });

  it('posición 2 → en_cola', () => {
    const snap = snapshotHold({
      ventaId,
      estado: 'activa',
      expiraAt: null,
      cola: colaCon([
        { id: otroId, pos: 1 },
        { id: ventaId, pos: 2 },
      ]),
      ahora,
    });
    expect(snap.estado).toBe('en_cola');
    expect(snap.posicion).toBe(2);
    expect(snap.esperando).toBe(1);
  });

  it('estado expirada → expirada', () => {
    const snap = snapshotHold({
      ventaId,
      estado: 'expirada',
      expiraAt: new Date(ahora.getTime() - 60_000),
      cola: [],
      ahora,
    });
    expect(snap.estado).toBe('expirada');
  });

  it('no en cola (probablemente histórica Coda) → no_aplica', () => {
    const snap = snapshotHold({
      ventaId,
      estado: 'activa',
      expiraAt: null,
      cola: [],
      ahora,
    });
    expect(snap.estado).toBe('no_aplica');
  });

  it('estado distinto a activa/expirada → no_aplica (ej. desasignada)', () => {
    const snap = snapshotHold({
      ventaId,
      estado: 'desasignada',
      expiraAt: null,
      cola: colaCon([{ id: ventaId, pos: 1 }]),
      ahora,
    });
    expect(snap.estado).toBe('no_aplica');
  });
});

describe('formatearVencimiento', () => {
  it('formato fecha legible cuando > 24h restantes', () => {
    const expira = new Date('2026-05-30T05:59:59Z'); // viernes 29 23:59 MX
    const out = formatearVencimiento(expira);
    expect(out).toMatch(/viernes/);
    expect(out).toMatch(/29/);
    expect(out).toMatch(/may/);
  });

  it('muestra horas restantes cuando mostrarRestante=true y < 24h', () => {
    const ahora = new Date('2026-05-28T20:00:00Z');
    const expira = new Date(ahora.getTime() + 3 * 60 * 60 * 1000 + 15 * 60 * 1000); // +3h15min
    const out = formatearVencimiento(expira, { mostrarRestante: true, ahora });
    expect(out).toBe('expira en 3 h 15 min');
  });

  it('< 1h → muestra solo minutos', () => {
    const ahora = new Date('2026-05-28T20:00:00Z');
    const expira = new Date(ahora.getTime() + 25 * 60 * 1000); // +25min
    const out = formatearVencimiento(expira, { mostrarRestante: true, ahora });
    expect(out).toBe('expira en 25 min');
  });

  it('ya expiró → "ya expiró"', () => {
    const ahora = new Date('2026-05-28T20:00:00Z');
    const expira = new Date(ahora.getTime() - 60_000);
    const out = formatearVencimiento(expira, { mostrarRestante: true, ahora });
    expect(out).toBe('ya expiró');
  });
});
