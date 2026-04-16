'use client';

import { createBrowserClient } from '@supabase/ssr';
import type { Database } from '@/types/supabase';

export function createSupabaseBrowserClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}

/**
 * Alias — same singleton client.
 * Pages that need non-public schemas must use .schema('erp'|'rdb'|...) explicitly.
 */
export const createSupabaseERPClient = createSupabaseBrowserClient;
