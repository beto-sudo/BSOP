import { describe, it, expect } from 'vitest';
import {
  classifyImportSource,
  computeSyncTone,
  formatRelativeFromNow,
  type PaymentsImportStatus,
} from './import-status';

describe('classifyImportSource', () => {
  it('marca como auto si empieza con "auto:cron@"', () => {
    expect(classifyImportSource('auto:cron@2026-05-20T01:05:47.976Z')).toBe('auto');
  });

  it('marca como manual si es un filename normal', () => {
    expect(classifyImportSource('playtomic-payments-202604.csv')).toBe('manual');
    expect(classifyImportSource('Reporte de pagos.csv')).toBe('manual');
  });

  it('marca como unknown si es null, undefined o vacío', () => {
    expect(classifyImportSource(null)).toBe('unknown');
    expect(classifyImportSource(undefined)).toBe('unknown');
    expect(classifyImportSource('')).toBe('unknown');
  });
});

describe('formatRelativeFromNow', () => {
  const NOW = new Date('2026-05-20T12:00:00Z').getTime();

  it('devuelve null cuando el ISO es null o inválido', () => {
    expect(formatRelativeFromNow(NOW, null)).toBeNull();
    expect(formatRelativeFromNow(NOW, 'no es fecha')).toBeNull();
  });

  it('< 1 min', () => {
    expect(formatRelativeFromNow(NOW, '2026-05-20T11:59:59Z')).toBe('hace menos de 1 min');
  });

  it('minutos (1–59)', () => {
    expect(formatRelativeFromNow(NOW, '2026-05-20T11:30:00Z')).toBe('hace 30 min');
    expect(formatRelativeFromNow(NOW, '2026-05-20T11:01:00Z')).toBe('hace 59 min');
  });

  it('horas (1h–47h)', () => {
    expect(formatRelativeFromNow(NOW, '2026-05-20T08:00:00Z')).toBe('hace 4h');
    expect(formatRelativeFromNow(NOW, '2026-05-18T13:00:00Z')).toBe('hace 47h');
  });

  it('días (≥ 48h)', () => {
    expect(formatRelativeFromNow(NOW, '2026-05-18T12:00:00Z')).toBe('hace 2d');
    expect(formatRelativeFromNow(NOW, '2026-05-15T12:00:00Z')).toBe('hace 5d');
  });

  it('en el futuro (clock skew)', () => {
    expect(formatRelativeFromNow(NOW, '2026-05-20T13:00:00Z')).toBe('en el futuro');
  });
});

describe('computeSyncTone', () => {
  const NOW = new Date('2026-05-20T12:00:00Z').getTime();
  const base: PaymentsImportStatus = {
    lastSyncAt: null,
    lastSyncSource: null,
    totalRows: 0,
    paymentDateMin: null,
    paymentDateMax: null,
  };

  it('err si la tabla nunca tuvo sync', () => {
    expect(computeSyncTone(base, NOW)).toBe('err');
  });

  it('err si lastSyncAt es inválido', () => {
    expect(computeSyncTone({ ...base, lastSyncAt: 'no es fecha' }, NOW)).toBe('err');
  });

  it('ok: cron + < 36h', () => {
    expect(
      computeSyncTone(
        {
          ...base,
          lastSyncAt: '2026-05-19T03:00:00Z',
          lastSyncSource: 'auto:cron@2026-05-19T03:00:00.000Z',
        },
        NOW
      )
    ).toBe('ok');
  });

  it('warn: cron pero ≥ 36h (sospecha de cron caído)', () => {
    expect(
      computeSyncTone(
        {
          ...base,
          lastSyncAt: '2026-05-18T20:00:00Z', // 40h antes
          lastSyncSource: 'auto:cron@2026-05-18T20:00:00.000Z',
        },
        NOW
      )
    ).toBe('warn');
  });

  it('warn: último sync fue manual aunque sea reciente', () => {
    expect(
      computeSyncTone(
        {
          ...base,
          lastSyncAt: '2026-05-20T11:00:00Z',
          lastSyncSource: 'reporte-mayo.csv',
        },
        NOW
      )
    ).toBe('warn');
  });
});
