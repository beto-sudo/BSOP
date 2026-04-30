import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import { getEffectiveUser } from '@/lib/auth/effective-user';

/**
 * Returns the effective user for "personal" widgets (`/inicio`, "mis tareas",
 * etc). Resolves to the impersonated user when an admin is in preview mode,
 * otherwise to the caller.
 *
 * Used by the `useEffectiveUser()` hook. Must NOT be called as a substitute
 * for `auth.getUser()` for permission decisions — it only swaps identity for
 * personal-data reads.
 */
export async function GET() {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        },
      },
    }
  );

  const effective = await getEffectiveUser(supabase);
  if (!effective) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  return NextResponse.json(effective);
}
