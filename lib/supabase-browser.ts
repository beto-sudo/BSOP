'use client';

import { createBrowserClient } from '@supabase/ssr';

export function createSupabaseBrowserClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}

/**
 * Alias — same singleton client. 
 * Pages that need erp tables must use .schema('erp') explicitly.
 */
export const createSupabaseERPClient = createSupabaseBrowserClient;
