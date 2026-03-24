import { getClientOrError, jsonResponse, type UsageDailyModelRow } from '../_lib';

export async function GET(request: Request) {
  const { supabase, response } = getClientOrError();
  if (!supabase) return response;

  const { searchParams } = new URL(request.url);
  const days = Math.min(Math.max(Number(searchParams.get('days') ?? '14') || 14, 1), 90);
  const start = new Date();
  start.setDate(start.getDate() - (days - 1));
  const startDate = start.toISOString().slice(0, 10);

  try {
    const result = await supabase
      .from('usage_daily_models')
      .select('*')
      .gte('date', startDate)
      .order('date', { ascending: true })
      .order('cost', { ascending: false })
      .returns<UsageDailyModelRow[]>();

    if (result.error) {
      return jsonResponse({ days, rows: [], grouped: [], error: result.error.message }, 500);
    }

    const groupedMap = new Map<string, { date: string; models: { model: string; label: string; cost: number; messages: number; tokens: number }[] }>();
    for (const row of result.data ?? []) {
      const entry = groupedMap.get(row.date) ?? { date: row.date, models: [] };
      entry.models.push({
        model: row.model,
        label: row.label ?? row.model,
        cost: row.cost,
        messages: row.messages,
        tokens: row.tokens,
      });
      groupedMap.set(row.date, entry);
    }

    const grouped = Array.from(groupedMap.values());
    return jsonResponse({ days, rows: result.data ?? [], grouped });
  } catch (error) {
    return jsonResponse({ days, rows: [], grouped: [], error: error instanceof Error ? error.message : 'Unknown error' }, 500);
  }
}
