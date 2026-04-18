import {
  getClientOrError,
  jsonResponse,
  type UsageByModelRow,
  type UsageByProviderRow,
  type UsageSummaryRow,
} from '../_lib';

export async function GET() {
  const { supabase, response } = getClientOrError();
  if (!supabase) return response;

  try {
    const [summaryResult, modelsResult, providersResult] = await Promise.all([
      supabase.from('usage_summary').select('*').eq('id', 1).maybeSingle<UsageSummaryRow>(),
      supabase
        .from('usage_by_model')
        .select('*')
        .order('cost', { ascending: false })
        .returns<UsageByModelRow[]>(),
      supabase
        .from('usage_by_provider')
        .select('*')
        .order('cost', { ascending: false })
        .returns<UsageByProviderRow[]>(),
    ]);

    const error = summaryResult.error || modelsResult.error || providersResult.error;
    if (error) {
      return jsonResponse(
        { summary: null, costByModel: [], costByProvider: [], error: error.message },
        500
      );
    }

    return jsonResponse({
      summary: summaryResult.data,
      costByModel: modelsResult.data ?? [],
      costByProvider: providersResult.data ?? [],
    });
  } catch (error) {
    return jsonResponse(
      {
        summary: null,
        costByModel: [],
        costByProvider: [],
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      500
    );
  }
}
