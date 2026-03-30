import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@/lib/supabase-admin';

const METRIC_FIELD_MAP: Record<string, string[]> = {
  'Heart Rate': ['Avg'],
  'Resting Heart Rate': ['qty'],
  'Heart Rate Variability': ['qty'],
  'Oxygen Saturation': ['qty'],
  'Step Count': ['qty'],
  'Apple Exercise Time': ['qty'],
  'Body Mass': ['qty'],
  'Sleep Analysis': ['totalSleep', 'asleep', 'qty'],
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
  const records: Array<{ metric_name: string; date: string; value: number; unit: string | null; source: string | null }> = [];

  metrics.forEach((metricEntry) => {
    if (!metricEntry || typeof metricEntry !== 'object') return;

    const entry = metricEntry as Record<string, unknown>;
    const metricName = typeof entry.name === 'string' ? entry.name : null;
    const unit = typeof entry.units === 'string' ? entry.units : null;
    const source = typeof entry.source === 'string' ? entry.source : 'Health Auto Export';
    const data = Array.isArray(entry.data) ? entry.data : [];
    const fields = metricName ? (METRIC_FIELD_MAP[metricName] ?? ['qty']) : ['qty'];

    if (!metricName) return;

    data.forEach((sample) => {
      if (!sample || typeof sample !== 'object') return;
      const row = sample as Record<string, unknown>;
      const date = parseDate(row.date ?? row.startDate ?? row.sleepStart ?? row.start);
      if (!date) return;

      const field = fields.find((key) => parseNumber(row[key]) != null);
      const value = field ? parseNumber(row[field]) : null;
      if (value == null) return;

      records.push({
        metric_name: metricName,
        date,
        value,
        unit,
        source,
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
    const distance = row.distance && typeof row.distance === 'object' ? (row.distance as Record<string, unknown>) : null;
    const totalEnergy = row.totalEnergy && typeof row.totalEnergy === 'object' ? (row.totalEnergy as Record<string, unknown>) : null;
    const activeEnergy = row.activeEnergyBurned && typeof row.activeEnergyBurned === 'object' ? (row.activeEnergyBurned as Record<string, unknown>) : null;
    const avgHeartRate = row.avgHeartRate && typeof row.avgHeartRate === 'object' ? (row.avgHeartRate as Record<string, unknown>) : null;
    const maxHeartRate = row.maxHeartRate && typeof row.maxHeartRate === 'object' ? (row.maxHeartRate as Record<string, unknown>) : null;
    const heartRate = row.heartRate && typeof row.heartRate === 'object' ? (row.heartRate as Record<string, unknown>) : null;

    const energyQty = parseNumber(totalEnergy?.qty) ?? parseNumber(activeEnergy?.qty);

    return [{
      name,
      start_time,
      end_time: parseDate(row.end),
      duration_minutes: durationSeconds == null ? null : durationSeconds / 60,
      distance_km: toKilometers(parseNumber(distance?.qty), distance?.units),
      energy_kcal: toKilocalories(energyQty, totalEnergy?.units ?? activeEnergy?.units),
      heart_rate_avg: parseNumber(avgHeartRate?.qty) ?? parseNumber(heartRate?.avg && typeof heartRate.avg === 'object' ? (heartRate.avg as Record<string, unknown>).qty : null),
      heart_rate_max: parseNumber(maxHeartRate?.qty) ?? parseNumber(heartRate?.max && typeof heartRate.max === 'object' ? (heartRate.max as Record<string, unknown>).qty : null),
      source: typeof row.source === 'string' ? row.source : 'Health Auto Export',
      raw_json: row,
    }];
  });
}

function normalizeEcg(ecg: unknown[]) {
  return ecg.flatMap((entry) => {
    if (!entry || typeof entry !== 'object') return [];
    const row = entry as Record<string, unknown>;
    const date = parseDate(row.start ?? row.date);
    if (!date) return [];

    return [{
      date,
      classification: typeof row.classification === 'string' ? row.classification : null,
      heart_rate: parseNumber(row.averageHeartRate),
      raw_json: row,
    }];
  });
}

function normalizeMedications(medications: unknown[]) {
  return medications.flatMap((entry) => {
    if (!entry || typeof entry !== 'object') return [];
    const row = entry as Record<string, unknown>;
    const date = parseDate(row.scheduledDate ?? row.start);
    if (!date) return [];

    return [{
      date,
      name: typeof row.displayText === 'string' ? row.displayText : typeof row.nickname === 'string' ? row.nickname : null,
      dose: row.dosage == null ? null : String(row.dosage),
      raw_json: row,
    }];
  });
}

export async function POST(request: NextRequest) {
  const expectedToken = process.env.HEALTH_INGEST_TOKEN;
  const providedToken = extractToken(request);

  if (!expectedToken || !providedToken || providedToken !== expectedToken) {
    return unauthorized();
  }

  const supabase = getSupabaseAdminClient();
  if (!supabase) {
    return NextResponse.json({ error: 'Supabase admin client is not configured.' }, { status: 503 });
  }

  const rawBody = await request.text();
  const payloadSizeBytes = Buffer.byteLength(rawBody, 'utf8');

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(rawBody) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON payload.' }, { status: 400 });
  }

  const data = payload.data && typeof payload.data === 'object' ? (payload.data as Record<string, unknown>) : payload;
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
