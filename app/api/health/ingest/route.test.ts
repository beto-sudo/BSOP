import { describe, expect, it } from 'vitest';
import { normalizeMetricRecords } from './route';

describe('normalizeMetricRecords — sleep_analysis', () => {
  it('handles segmented shape (older Apple Watch: value+qty per stage)', () => {
    const out = normalizeMetricRecords([
      {
        name: 'sleep_analysis',
        units: 'hr',
        data: [
          {
            date: '2026-04-22 03:32:00 -0500',
            source: "Adalberto's Apple Watch",
            value: 'Core',
            qty: 0.95,
          },
          {
            date: '2026-04-22 04:11:00 -0500',
            source: "Adalberto's Apple Watch",
            value: 'Deep',
            qty: 0.18,
          },
        ],
      },
    ]);

    expect(out).toEqual([
      {
        metric_name: 'Sleep Core',
        date: new Date('2026-04-22T03:32:00-05:00').toISOString(),
        value: 0.95,
        unit: 'hr',
        source: "Adalberto's Apple Watch",
      },
      {
        metric_name: 'Sleep Deep',
        date: new Date('2026-04-22T04:11:00-05:00').toISOString(),
        value: 0.18,
        unit: 'hr',
        source: "Adalberto's Apple Watch",
      },
    ]);
  });

  it('handles aggregated shape (current HAE: one row per night with stage props)', () => {
    const out = normalizeMetricRecords([
      {
        name: 'sleep_analysis',
        units: 'hr',
        data: [
          {
            date: '2026-04-24 00:00:00 -0500',
            source: 'Sleeptracker®',
            sleepStart: '2026-04-23 23:16:00 -0500',
            sleepEnd: '2026-04-24 08:01:00 -0500',
            core: 5.6,
            deep: 0.85,
            rem: 2.13,
            awake: 0.11,
            inBed: 8.75,
            asleep: 0,
            totalSleep: 8.58,
          },
        ],
      },
    ]);

    expect(out).toHaveLength(5);
    const byMetric = Object.fromEntries(out.map((r) => [r.metric_name, r]));
    expect(byMetric['Sleep Core']?.value).toBe(5.6);
    expect(byMetric['Sleep Deep']?.value).toBe(0.85);
    expect(byMetric['Sleep REM']?.value).toBe(2.13);
    expect(byMetric['Sleep Awake']?.value).toBe(0.11);
    expect(byMetric['Sleep In Bed']?.value).toBe(8.75);
    // asleep: 0 must be skipped to keep dashboard averages clean
    expect(byMetric['Sleep Asleep']).toBeUndefined();
    // sleepStart wins over date so the timestamp reflects bedtime, not midnight
    expect(byMetric['Sleep Core']?.date).toBe(new Date('2026-04-23T23:16:00-05:00').toISOString());
    expect(byMetric['Sleep Core']?.source).toBe('Sleeptracker®');
    expect(byMetric['Sleep Core']?.unit).toBe('hr');
  });

  it('skips an aggregated row that has every stage at 0', () => {
    const out = normalizeMetricRecords([
      {
        name: 'sleep_analysis',
        units: 'hr',
        data: [
          {
            date: '2026-04-29 00:00:00 -0500',
            source: 'Sleeptracker®',
            core: 0,
            deep: 0,
            rem: 0,
            awake: 0,
            inBed: 0,
            asleep: 0,
            totalSleep: 0,
          },
        ],
      },
    ]);
    expect(out).toEqual([]);
  });

  it('falls back to date when sleepStart is missing in aggregated shape', () => {
    const out = normalizeMetricRecords([
      {
        name: 'sleep_analysis',
        units: 'hr',
        data: [
          {
            date: '2026-04-29 00:00:00 -0500',
            source: 'Sleeptracker®',
            core: 4.5,
          },
        ],
      },
    ]);
    expect(out).toHaveLength(1);
    expect(out[0]?.date).toBe(new Date('2026-04-29T00:00:00-05:00').toISOString());
  });

  it('drops sample with no stage data and no value/qty (the silent-drop bug)', () => {
    const out = normalizeMetricRecords([
      {
        name: 'sleep_analysis',
        units: 'hr',
        data: [{ date: '2026-04-29 00:00:00 -0500', source: 'X', value: null, qty: null }],
      },
    ]);
    expect(out).toEqual([]);
  });
});

describe('normalizeMetricRecords — blood_pressure', () => {
  it('splits systolic and diastolic into separate metrics', () => {
    const out = normalizeMetricRecords([
      {
        name: 'blood_pressure',
        units: 'mmHg',
        data: [
          {
            date: '2026-04-23 18:30:00 -0500',
            source: 'Connect',
            systolic: 143,
            diastolic: 97,
          },
        ],
      },
    ]);
    expect(out).toHaveLength(2);
    const systolic = out.find((r) => r.metric_name === 'Blood Pressure Systolic');
    const diastolic = out.find((r) => r.metric_name === 'Blood Pressure Diastolic');
    expect(systolic?.value).toBe(143);
    expect(systolic?.unit).toBe('mmHg');
    expect(diastolic?.value).toBe(97);
    expect(diastolic?.unit).toBe('mmHg');
  });
});

describe('normalizeMetricRecords — generic qty path', () => {
  it('uses qty for simple metrics like step_count', () => {
    const out = normalizeMetricRecords([
      {
        name: 'step_count',
        units: 'steps',
        data: [{ date: '2026-04-29 12:00:00 -0500', qty: 1234, source: 'iPhone' }],
      },
    ]);
    expect(out).toHaveLength(1);
    expect(out[0]?.metric_name).toBe('Step Count');
    expect(out[0]?.value).toBe(1234);
  });

  it('prefers Avg over qty for heart_rate (segmented stat)', () => {
    const out = normalizeMetricRecords([
      {
        name: 'heart_rate',
        units: 'count/min',
        data: [{ date: '2026-04-29 12:00:00 -0500', Avg: 72, Min: 60, Max: 90 }],
      },
    ]);
    expect(out).toHaveLength(1);
    expect(out[0]?.value).toBe(72);
  });
});
