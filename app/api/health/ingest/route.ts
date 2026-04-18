import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getSupabaseAdminClient } from '@/lib/supabase-admin';
import { healthIngestRateLimiter, extractIdentifier } from '@/lib/ratelimit';
import type { Json } from '@/types/supabase';

// Envelope schema — validates only the top-level shape. Sample-level
// coercion/validation happens in the normalizers below, which already
// defend against malformed individual rows with runtime type guards.
// The payload wrapper is optional (some clients POST the `data` object
// at the root; others nest under `data`).
const HealthIngestEnvelopeSchema = z
  .object({
    data: z
      .object({
        metrics: z.array(z.unknown()).optional(),
        workouts: z.array(z.unknown()).optional(),
        ecg: z.array(z.unknown()).optional(),
        medications: z.array(z.unknown()).optional(),
      })
      .passthrough()
      .optional(),
    metrics: z.array(z.unknown()).optional(),
    workouts: z.array(z.unknown()).optional(),
    ecg: z.array(z.unknown()).optional(),
    medications: z.array(z.unknown()).optional(),
  })
  .passthrough();

// Hard limit on raw payload size. Apple Health Auto Export usually sends
// under 1 MB per batch. 5 MB gives ample headroom while rejecting
// obvious abuse (e.g. a flood of fabricated samples meant to fill the DB).
const MAX_PAYLOAD_BYTES = 5 * 1024 * 1024;

const METRIC_NAME_NORMALIZE: Record<string, string> = {
  resting_heart_rate: 'Resting Heart Rate',
  heart_rate_variability: 'Heart Rate Variability',
  blood_oxygen_saturation: 'Oxygen Saturation',
  blood_pressure_systolic: 'Blood Pressure Systolic',
  blood_pressure_diastolic: 'Blood Pressure Diastolic',
  step_count: 'Step Count',
  apple_exercise_time: 'Apple Exercise Time',
  weight_body_mass: 'Body Mass',
  heart_rate: 'Heart Rate',
  active_energy: 'Active Energy',
  basal_energy_burned: 'Basal Energy Burned',
  walking_heart_rate_average: 'Walking Heart Rate Average',
  respiratory_rate: 'Respiratory Rate',
  vo2_max: 'VO2 Max',
  body_fat_percentage: 'Body Fat Percentage',
  body_mass_index: 'Body Mass Index',
  flights_climbed: 'Flights Climbed',
  walking_running_distance: 'Walking Running Distance',
  walking_speed: 'Walking Speed',
  walking_step_length: 'Walking Step Length',
  walking_asymmetry_percentage: 'Walking Asymmetry Percentage',
  walking_double_support_percentage: 'Walking Double Support Percentage',
  stair_speed_up: 'Stair Speed Up',
  stair_speed_down: 'Stair Speed Down',
  cycling_distance: 'Cycling Distance',
  environmental_audio_exposure: 'Environmental Audio Exposure',
  headphone_audio_exposure: 'Headphone Audio Exposure',
  apple_stand_hour: 'Apple Stand Hour',
  apple_stand_time: 'Apple Stand Time',
  apple_sleeping_wrist_temperature: 'Apple Sleeping Wrist Temperature',
  time_in_daylight: 'Time In Daylight',
  physical_effort: 'Physical Effort',
  dietary_water: 'Dietary Water',
  mindful_minutes: 'Mindful Minutes',
  six_minute_walking_test_distance: 'Six Minute Walking Test Distance',
  breathing_disturbances: 'Breathing Disturbances',
  height: 'Height',
  blood_pressure: 'Blood Pressure',
  sleep_analysis: 'Sleep Analysis',
  test: 'test',
};

const METRIC_FIELD_MAP: Record<string, string[]> = {
  'Heart Rate': ['Avg', 'qty'],
  'Resting Heart Rate': ['qty'],
  'Heart Rate Variability': ['qty'],
  'Oxygen Saturation': ['qty'],
  'Blood Pressure Systolic': ['qty'],
  'Blood Pressure Diastolic': ['qty'],
  'Step Count': ['qty'],
  'Apple Exercise Time': ['qty'],
  'Body Mass': ['qty'],
  'Sleep Analysis': ['totalSleep', 'asleep', 'qty'],
  'Active Energy': ['qty'],
  'Basal Energy Burned': ['qty'],
  'Walking Heart Rate Average': ['qty'],
  'Respiratory Rate': ['qty'],
  'VO2 Max': ['qty'],
  'Body Fat Percentage': ['qty'],
  'Body Mass Index': ['qty'],
  'Flights Climbed': ['qty'],
  'Walking Running Distance': ['qty'],
  'Walking Speed': ['qty'],
  'Walking Step Length': ['qty'],
  'Walking Asymmetry Percentage': ['qty'],
  'Walking Double Support Percentage': ['qty'],
  'Stair Speed Up': ['qty'],
  'Stair Speed Down': ['qty'],
  'Cycling Distance': ['qty'],
  'Environmental Audio Exposure': ['qty'],
  'Headphone Audio Exposure': ['qty'],
  'Apple Stand Hour': ['qty'],
  'Apple Stand Time': ['qty'],
  'Apple Sleeping Wrist Temperature': ['qty'],
  'Time In Daylight': ['qty'],
  'Physical Effort': ['qty'],
  'Dietary Water': ['qty'],
  'Mindful Minutes': ['qty'],
  'Six Minute Walking Test Distance': ['qty'],
  'Breathing Disturbances': ['qty'],
  Height: ['qty'],
  test: ['qty'],
};

function unauthorized() {
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
}

function extractToken(request: NextRequest) {
  const header = request.headers.get('authorization');
  if (header?.toLowerCase().startsWith('bearer ')) {
    return header.slice(7).trim();
  }

  return request.headers.get('x-api-key')?.trim() ?? null;
}

function parseNumber(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function parseDate(value: unknown) {
  if (typeof value !== 'string' || !value.trim()) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function normalizeMetricRecords(metrics: unknown[]) {
  const records: Array<{
    metric_name: string;
    date: string;
    value: number;
    unit: string | null;
    source: string | null;
  }> = [];

  metrics.forEach((metricEntry) => {
    if (!metricEntry || typeof metricEntry !== 'object') return;

    const entry = metricEntry as Record<string, unknown>;
    const metricName = typeof entry.name === 'string' ? entry.name : null;
    const normalizedName = metricName ? (METRIC_NAME_NORMALIZE[metricName] ?? metricName) : null;
    const unit = typeof entry.units === 'string' ? entry.units : null;
    const data = Array.isArray(entry.data) ? entry.data : [];
    const fields = normalizedName
      ? (METRIC_FIELD_MAP[normalizedName] ??
        (metricName ? METRIC_FIELD_MAP[metricName] : undefined) ?? ['qty'])
      : ['qty'];

    if (!normalizedName) return;

    // Special handling: blood_pressure comes as { systolic, diastolic } — split into two metrics
    const isBloodPressure = metricName === 'blood_pressure' || normalizedName === 'Blood Pressure';

    data.forEach((sample) => {
      if (!sample || typeof sample !== 'object') return;
      const row = sample as Record<string, unknown>;
      const date = parseDate(row.date ?? row.startDate ?? row.sleepStart ?? row.start);
      if (!date) return;
      const sampleSource =
        typeof row.source === 'string'
          ? row.source
          : typeof entry.source === 'string'
            ? entry.source
            : 'Health Auto Export';

      if (isBloodPressure) {
        const systolic = parseNumber(row.systolic);
        const diastolic = parseNumber(row.diastolic);
        if (systolic != null) {
          records.push({
            metric_name: 'Blood Pressure Systolic',
            date,
            value: systolic,
            unit: 'mmHg',
            source: sampleSource,
          });
        }
        if (diastolic != null) {
          records.push({
            metric_name: 'Blood Pressure Diastolic',
            date,
            value: diastolic,
            unit: 'mmHg',
            source: sampleSource,
          });
        }
        return;
      }

      const field = fields.find((key) => parseNumber(row[key]) != null);
      const value = field ? parseNumber(row[field]) : null;
      if (value == null) return;

      records.push({
        metric_name: normalizedName,
        date,
        value,
        unit,
        source: sampleSource,
      });
    });
  });

  return records;
}

function toKilometers(value: number | null, units: unknown) {
  if (value == null) return null;
  if (units === 'mi') return value * 1.60934;
  return value;
}

function toKilocalories(value: number | null, units: unknown) {
  if (value == null) return null;
  if (units === 'kJ') return value / 4.184;
  return value;
}

function normalizeWorkouts(workouts: unknown[]) {
  return workouts.flatMap((workout) => {
    if (!workout || typeof workout !== 'object') return [];
    const row = workout as Record<string, unknown>;
    const name = typeof row.name === 'string' ? row.name : null;
    const start_time = parseDate(row.start);
    if (!name || !start_time) return [];

    const durationSeconds = parseNumber(row.duration);
    const distance =
      row.distance && typeof row.distance === 'object'
        ? (row.distance as Record<string, unknown>)
        : null;
    const totalEnergy =
      row.totalEnergy && typeof row.totalEnergy === 'object'
        ? (row.totalEnergy as Record<string, unknown>)
        : null;
    const activeEnergy =
      row.activeEnergyBurned && typeof row.activeEnergyBurned === 'object'
        ? (row.activeEnergyBurned as Record<string, unknown>)
        : null;
    const avgHeartRate =
      row.avgHeartRate && typeof row.avgHeartRate === 'object'
        ? (row.avgHeartRate as Record<string, unknown>)
        : null;
    const maxHeartRate =
      row.maxHeartRate && typeof row.maxHeartRate === 'object'
        ? (row.maxHeartRate as Record<string, unknown>)
        : null;
    const heartRate =
      row.heartRate && typeof row.heartRate === 'object'
        ? (row.heartRate as Record<string, unknown>)
        : null;

    const energyQty = parseNumber(totalEnergy?.qty) ?? parseNumber(activeEnergy?.qty);

    return [
      {
        name,
        start_time,
        end_time: parseDate(row.end),
        duration_minutes: durationSeconds == null ? null : durationSeconds / 60,
        distance_km: toKilometers(parseNumber(distance?.qty), distance?.units),
        energy_kcal: toKilocalories(energyQty, totalEnergy?.units ?? activeEnergy?.units),
        heart_rate_avg:
          parseNumber(avgHeartRate?.qty) ??
          parseNumber(
            heartRate?.avg && typeof heartRate.avg === 'object'
              ? (heartRate.avg as Record<string, unknown>).qty
              : null
          ),
        heart_rate_max:
          parseNumber(maxHeartRate?.qty) ??
          parseNumber(
            heartRate?.max && typeof heartRate.max === 'object'
              ? (heartRate.max as Record<string, unknown>).qty
              : null
          ),
        source: typeof row.source === 'string' ? row.source : 'Health Auto Export',
        raw_json: row as Json,
      },
    ];
  });
}

function normalizeEcg(ecg: unknown[]) {
  return ecg.flatMap((entry) => {
    if (!entry || typeof entry !== 'object') return [];
    const row = entry as Record<string, unknown>;
    const date = parseDate(row.start ?? row.date);
    if (!date) return [];

    return [
      {
        date,
        classification: typeof row.classification === 'string' ? row.classification : null,
        heart_rate: parseNumber(row.averageHeartRate),
        raw_json: row as Json,
      },
    ];
  });
}

function normalizeMedications(medications: unknown[]) {
  return medications.flatMap((entry) => {
    if (!entry || typeof entry !== 'object') return [];
    const row = entry as Record<string, unknown>;
    const date = parseDate(row.scheduledDate ?? row.start);
    if (!date) return [];

    return [
      {
        date,
        name:
          typeof row.displayText === 'string'
            ? row.displayText
            : typeof row.nickname === 'string'
              ? row.nickname
              : null,
        dose: row.dosage == null ? null : String(row.dosage),
        raw_json: row as Json,
      },
    ];
  });
}

export async function POST(request: NextRequest) {
  const expectedToken = process.env.HEALTH_INGEST_TOKEN;
  const providedToken = extractToken(request);

  if (!expectedToken || !providedToken || providedToken !== expectedToken) {
    return unauthorized();
  }

  // Rate limit AFTER auth so invalid tokens don't consume counter slots for
  // the legitimate shortcut. Identifier prefers the bearer token (stable),
  // falls back to IP.
  const rate = await healthIngestRateLimiter.check(extractIdentifier(request));
  if (!rate.ok) return rate.response;

  const supabase = getSupabaseAdminClient();
  if (!supabase) {
    return NextResponse.json(
      { error: 'Supabase admin client is not configured.' },
      { status: 503 }
    );
  }

  const rawBody = await request.text();
  const payloadSizeBytes = Buffer.byteLength(rawBody, 'utf8');

  if (payloadSizeBytes > MAX_PAYLOAD_BYTES) {
    return NextResponse.json(
      {
        error: 'Payload too large',
        maxBytes: MAX_PAYLOAD_BYTES,
        receivedBytes: payloadSizeBytes,
      },
      { status: 413 }
    );
  }

  let rawPayload: unknown;
  try {
    rawPayload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON payload.' }, { status: 400 });
  }

  const envelopeParsed = HealthIngestEnvelopeSchema.safeParse(rawPayload);
  if (!envelopeParsed.success) {
    return NextResponse.json(
      {
        error: 'Invalid envelope shape',
        issues: envelopeParsed.error.issues.map((i) => ({
          path: i.path.join('.') || '(root)',
          message: i.message,
        })),
      },
      { status: 400 }
    );
  }

  const payload = envelopeParsed.data;
  const data = payload.data ?? payload;
  const metrics = normalizeMetricRecords(Array.isArray(data.metrics) ? data.metrics : []);
  const workouts = normalizeWorkouts(Array.isArray(data.workouts) ? data.workouts : []);
  const ecg = normalizeEcg(Array.isArray(data.ecg) ? data.ecg : []);
  const medications = normalizeMedications(Array.isArray(data.medications) ? data.medications : []);

  const sourceIp = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';

  try {
    if (metrics.length) {
      const { error } = await supabase
        .from('health_metrics')
        .upsert(metrics, { onConflict: 'metric_name,date,source', ignoreDuplicates: false });
      if (error) throw error;
    }

    if (workouts.length) {
      const { error } = await supabase
        .from('health_workouts')
        .upsert(workouts, { onConflict: 'name,start_time,source', ignoreDuplicates: false });
      if (error) throw error;
    }

    if (ecg.length) {
      const { error } = await supabase.from('health_ecg').insert(ecg);
      if (error) throw error;
    }

    if (medications.length) {
      const { error } = await supabase.from('health_medications').insert(medications);
      if (error) throw error;
    }

    await supabase.from('health_ingest_log').insert({
      payload_size_bytes: payloadSizeBytes,
      metrics_count: metrics.length,
      workouts_count: workouts.length,
      source_ip: sourceIp,
      status: 'ok',
    });

    return NextResponse.json({
      ok: true,
      counts: {
        metrics: metrics.length,
        workouts: workouts.length,
        ecg: ecg.length,
        medications: medications.length,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown ingestion error';
    await supabase.from('health_ingest_log').insert({
      payload_size_bytes: payloadSizeBytes,
      metrics_count: metrics.length,
      workouts_count: workouts.length,
      source_ip: sourceIp,
      status: `error: ${message}`,
    });

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
// trigger deploy 1774837133
