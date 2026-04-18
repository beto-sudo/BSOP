import { TZ } from './types';

/**
 * Pure helper: resolve a preset key (hoy/ayer/semana/…) to an inclusive
 * [from, to] date range expressed as YYYY-MM-DD strings in America/Matamoros.
 *
 * Returns null for unrecognized presets (e.g. 'custom') so the caller can
 * leave the dates untouched.
 */
export function resolvePresetRange(preset: string): { from: string; to: string } | null {
  const today = new Date();
  const formatter = new Intl.DateTimeFormat('sv-SE', { timeZone: TZ });

  if (preset === 'hoy') {
    const t = formatter.format(today);
    return { from: t, to: t };
  }
  if (preset === 'ayer') {
    const ayer = new Date(today.toLocaleString('en-US', { timeZone: TZ }));
    ayer.setDate(ayer.getDate() - 1);
    const t = formatter.format(ayer);
    return { from: t, to: t };
  }
  if (preset === 'semana') {
    const d = new Date(today.toLocaleString('en-US', { timeZone: TZ }));
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    const monday = new Date(d.setDate(diff));
    return { from: formatter.format(monday), to: formatter.format(today) };
  }
  if (preset === '7dias') {
    const d = new Date(today.toLocaleString('en-US', { timeZone: TZ }));
    d.setDate(d.getDate() - 7);
    return { from: formatter.format(d), to: formatter.format(today) };
  }
  if (preset === 'mes') {
    const d = new Date(today.toLocaleString('en-US', { timeZone: TZ }));
    const first = new Date(d.getFullYear(), d.getMonth(), 1);
    return { from: formatter.format(first), to: formatter.format(today) };
  }
  if (preset === '30dias') {
    const d = new Date(today.toLocaleString('en-US', { timeZone: TZ }));
    d.setDate(d.getDate() - 30);
    return { from: formatter.format(d), to: formatter.format(today) };
  }
  if (preset === 'ano') {
    const d = new Date(today.toLocaleString('en-US', { timeZone: TZ }));
    const first = new Date(d.getFullYear(), 0, 1);
    return { from: formatter.format(first), to: formatter.format(today) };
  }

  return null;
}
