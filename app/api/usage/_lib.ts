import { NextResponse } from 'next/server';
import { getSupabaseClient } from '@/lib/supabase';

export type UsageSummaryRow = {
  id: number;
  session_count: number;
  total_cost: number;
  total_tokens: number;
  avg_cost_per_session: number;
  cost_today: number;
  cost_this_week: number;
  cost_this_month: number;
  messages: number;
  user_messages: number;
  assistant_messages: number;
  tool_calls: number;
  tool_results: number;
  cache_hit_rate: number;
  input_tokens: number;
  output_tokens: number;
  cache_read_tokens: number;
  cache_write_tokens: number;
  synced_at: string | null;
};

export type UsageDailyRow = {
  date: string;
  cost: number;
  tokens: number;
  sessions: number;
  messages: number;
  user_messages: number;
  assistant_messages: number;
  tool_calls: number;
  formatted_cost: string;
};

export type UsageByModelRow = {
  model: string;
  label: string | null;
  provider: string | null;
  cost: number;
  messages: number;
  tokens: number;
  formatted_cost: string | null;
};

export type UsageByProviderRow = {
  provider: string;
  cost: number;
  messages: number;
  tokens: number;
  formatted_cost: string | null;
};

export type UsageMessageRow = {
  id: number;
  timestamp: string | null;
  model: string | null;
  model_label: string | null;
  provider: string | null;
  input_tokens: number;
  output_tokens: number;
  cache_read_tokens: number;
  cache_creation_tokens: number;
  total_tokens: number;
  cost: number;
  formatted_cost: string | null;
  duration_ms: number;
  status: string | null;
  session_id: string | null;
  skill_name: string | null;
  description: string | null;
};

export type UsageDailyModelRow = {
  id: number;
  date: string;
  model: string;
  label: string | null;
  cost: number;
  messages: number;
  tokens: number;
};

export type UsageMessageTotals = {
  count: number;
  input_tokens: number;
  output_tokens: number;
  cache_read_tokens: number;
  cache_creation_tokens: number;
  cost: number;
};

export function jsonResponse(body: unknown, status = 200) {
  return new NextResponse(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=60',
    },
  });
}

export function getClientOrError() {
  const supabase = getSupabaseClient();
  if (!supabase) {
    return {
      supabase: null,
      response: jsonResponse({ error: 'Supabase is not configured.' }, 503),
    };
  }

  return { supabase, response: null };
}

export function formatMoney(value: number) {
  return value.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: value < 1 ? 4 : 2,
    maximumFractionDigits: value < 1 ? 4 : 2,
  });
}
