import { getClientOrError, jsonResponse, type UsageMessageRow } from '../_lib';

export async function GET(request: Request) {
  const { supabase, response } = getClientOrError();
  if (!supabase) return response;

  const { searchParams } = new URL(request.url);
  const page = Math.max(Number(searchParams.get('page') ?? '1') || 1, 1);
  const limit = Math.min(Math.max(Number(searchParams.get('limit') ?? '25') || 25, 1), 100);
  const model = searchParams.get('model') ?? 'all';
  const status = searchParams.get('status') ?? 'all';
  const search = (searchParams.get('search') ?? '').trim();
  const range = searchParams.get('range') ?? '7d';

  let query = supabase
    .from('usage_messages')
    .select('*', { count: 'exact' })
    .order('timestamp', { ascending: false })
    .range((page - 1) * limit, page * limit - 1);

  if (model !== 'all') query = query.eq('model', model);
  if (status !== 'all') query = query.eq('status', status);
  if (search) query = query.ilike('description', `%${search}%`);

  if (range !== 'all') {
    const start = new Date();
    if (range === 'today') {
      start.setHours(0, 0, 0, 0);
    } else if (range === '30d') {
      start.setDate(start.getDate() - 30);
    } else {
      start.setDate(start.getDate() - 7);
    }
    query = query.gte('timestamp', start.toISOString());
  }

  try {
    const result = await query.returns<UsageMessageRow[]>();

    if (result.error) {
      return jsonResponse({ page, limit, total: 0, rows: [], error: result.error.message }, 500);
    }

    return jsonResponse({
      page,
      limit,
      total: result.count ?? 0,
      totalPages: Math.max(1, Math.ceil((result.count ?? 0) / limit)),
      rows: result.data ?? [],
    });
  } catch (error) {
    return jsonResponse({ page, limit, total: 0, rows: [], error: error instanceof Error ? error.message : 'Unknown error' }, 500);
  }
}
