'use client';

import { createBrowserClient } from '@supabase/ssr';
import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Default browser client — uses public schema.
 * Use for core, shared, and generic queries.
 */
export function createSupabaseBrowserClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}

/**
 * ERP browser client — defaults to erp schema.
 * Tables queried without explicit .schema() will use 'erp'.
 */
export function createSupabaseERPClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { db: { schema: 'erp' } },
  ) as unknown as SupabaseClient<any, 'public', any>;
}
