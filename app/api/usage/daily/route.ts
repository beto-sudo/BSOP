import { getClientOrError, jsonResponse, type UsageDailyRow } from '../_lib';

export async function GET(request: Request) {
  const { supabase, response } = getClientOrError();
  if (!supabase) return response;

  const { searchParams } = new URL(request.url);
  const days = Math.min(Math.max(Number(searchParams.get('days') ?? '14') || 14, 1), 90);

  try {
    const result = await supabase
      .from('usage_daily')
      .select('*')
      .order('date', { ascending: false })
      .limit(days)
      .returns<UsageDailyRow[]>();

    if (result.error) {
      return jsonResponse({ days, rows: [], error: result.error.message }, 500);
    }

    return jsonResponse({ days, rows: (result.data ?? []).slice().reverse() });
  } catch (error) {
    return jsonResponse({ days, rows: [], error: error instanceof Error ? error.message : 'Unknown error' }, 500);
  }
}
