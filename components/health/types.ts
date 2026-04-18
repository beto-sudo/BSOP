import type { HeartPulse } from 'lucide-react';
import type { HealthDashboardRange, HealthMetricRow, HealthWorkoutRow } from '@/lib/health';

export type Point = { date: string; value: number };

export type MetricKey = 'sleep' | 'hr' | 'bp' | 'weight' | 'steps' | 'spo2' | 'hrv';

export type HeroCard = {
  key: string;
  label: string;
  value: string;
  unit?: string;
  helper: string;
  tone: string;
  icon: typeof HeartPulse;
};

export type ChartConfig = {
  key: MetricKey;
  title: string;
  unit: string;
  tone: string;
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

export type HealthDashboardViewProps = {
  vitals: HealthMetricRow[];
  summaryMetrics: HealthMetricRow[];
  hrvDaily: HealthMetricRow[];
  spo2Daily: HealthMetricRow[];
  stepsDaily: HealthMetricRow[];
  bpSystolic: HealthMetricRow[];
  bpDiastolic: HealthMetricRow[];
  restingHrDaily: HealthMetricRow[];
  weightDaily: HealthMetricRow[];
  sleepDaily: HealthMetricRow[];
  workouts: HealthWorkoutRow[];
  errors: string[];
  range: HealthDashboardRange;
};
