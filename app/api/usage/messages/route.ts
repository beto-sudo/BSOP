import { getClientOrError, jsonResponse, type UsageMessageRow, type UsageMessageTotals } from '../_lib';

type FilterOptions = {
  model: string;
  status: string;
  search: string;
  range: string;
};

function applyFilters(query: any, options: FilterOptions) {
  const { model, status, search, range } = options;

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

  return query;
}

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

  const filterOptions = { model, status, search, range };

  const pagedQuery = applyFilters(
    supabase
      .from('usage_messages')
      .select('*', { count: 'exact' })
      .order('timestamp', { ascending: false })
      .range((page - 1) * limit, page * limit - 1),
    filterOptions,
  );

  const totalsQuery = applyFilters(
    supabase
      .from('usage_messages')
      .select('input_tokens, output_tokens, cache_read_tokens, cache_creation_tokens, cost'),
    filterOptions,
  );

  try {
    const [result, totalsResult] = await Promise.all([pagedQuery, totalsQuery]);

    const typedRows = (result.data ?? []) as UsageMessageRow[];
    const typedTotalsRows = (totalsResult.data ?? []) as Pick<UsageMessageRow, 'input_tokens' | 'output_tokens' | 'cache_read_tokens' | 'cache_creation_tokens' | 'cost'>[];
    const error = result.error || totalsResult.error;
    if (error) {
      return jsonResponse({ page, limit, total: 0, totalPages: 1, rows: [], totals: null, error: error.message }, 500);
    }

    const totals = typedTotalsRows.reduce<UsageMessageTotals>((acc, row) => ({
      count: acc.count + 1,
      input_tokens: acc.input_tokens + row.input_tokens,
      output_tokens: acc.output_tokens + row.output_tokens,
      cache_read_tokens: acc.cache_read_tokens + row.cache_read_tokens,
      cache_creation_tokens: acc.cache_creation_tokens + row.cache_creation_tokens,
      cost: acc.cost + row.cost,
    }), {
      count: 0,
      input_tokens: 0,
      output_tokens: 0,
      cache_read_tokens: 0,
      cache_creation_tokens: 0,
      cost: 0,
    });

    return jsonResponse({
      page,
      limit,
      total: result.count ?? 0,
      totalPages: Math.max(1, Math.ceil((result.count ?? 0) / limit)),
      rows: typedRows,
      totals,
    });
  } catch (error) {
    return jsonResponse({ page, limit, total: 0, totalPages: 1, rows: [], totals: null, error: error instanceof Error ? error.message : 'Unknown error' }, 500);
  }
}
