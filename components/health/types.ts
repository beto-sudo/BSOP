import type { HeartPulse } from 'lucide-react';
import type { HealthDashboardData } from '@/lib/health';
import type { ToneKey } from './tones';

export type { ToneKey };

export type Point = { date: string; value: number };

export type HeroCard = {
  key: string;
  label: string;
  value: string;
  unit?: string;
  helper: string;
  tone: string;
  icon: typeof HeartPulse;
  stale?: boolean;
  staleLabel?: string;
  // Recovery warning surfaced next to the label when the vital has shifted
  // unfavorably vs its 7-day baseline (e.g. HRV drop > 10%, RHR rise > 5
  // bpm). Set by getRecoveryFlag in helpers.
  flag?: { tone: 'warning'; label: string };
};

export type ChartConfig = {
  key: ToneKey;
  title: string;
  unit: string;
  tone: ToneKey;
  icon: typeof HeartPulse;
  kind?: 'line' | 'dual-line';
  data: Point[];
  secondaryData?: Point[];
  secondaryLabel?: string;
  primaryLabel?: string;
  emptyTitle: string;
  emptyCopy: string;
  formatter?: (value: number) => string;
};

export type HealthDashboardViewProps = HealthDashboardData;
