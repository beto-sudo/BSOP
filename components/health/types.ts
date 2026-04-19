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
