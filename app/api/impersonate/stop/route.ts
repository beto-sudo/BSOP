import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { PREVIEW_COOKIE_NAME } from '@/lib/auth/preview-guard';

/**
 * Ends the "Viendo como" preview session by clearing the `bsop_preview_as`
 * cookie. Idempotent — safe to call when no preview is active.
 *
 * Exempt from the read-only mutation block in proxy.ts so admins can always
 * exit preview, even mid-session.
 */
export async function POST() {
  const cookieStore = await cookies();
  cookieStore.delete(PREVIEW_COOKIE_NAME);
  return NextResponse.json({ ok: true });
}
