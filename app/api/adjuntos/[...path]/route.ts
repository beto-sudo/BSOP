import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase-server';
import { getSupabaseAdminClient } from '@/lib/supabase-admin';

/**
 * GET /api/adjuntos/<path...>
 *
 * Same-origin, cookie-authenticated proxy that streams any object from the
 * private `adjuntos` bucket. Replaces the signed-URL-rewriter dance: instead
 * of mutating every <img src> on load to a short-lived signed URL, we leave
 * the src pointing at this endpoint and do the auth check + stream here.
 *
 * Why not signed URLs?
 *   - Client-side rewriting has race conditions with TipTap setContent.
 *   - Signed URLs expire; editing/refreshing after expiry breaks images.
 *   - Browser caching of error responses prevents recovery.
 *
 * Auth contract:
 *   - Caller must have a valid Supabase session cookie (i.e. be logged in).
 *   - Matches the storage.objects RLS policy `adjuntos_read` which grants
 *     SELECT on bucket=adjuntos to any `authenticated` role.
 *   - We do NOT enforce empresa-level access here because the RLS policy
 *     itself doesn't; this mirrors current bucket access rules. If finer
 *     control is needed later, read the path's owner row from erp.adjuntos
 *     and check against core.usuarios_empresas.
 *
 * Cache: 1h private — safe because objects are immutable once uploaded
 * (filenames include a timestamp + random suffix).
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  if (!path || path.length === 0) {
    return NextResponse.json({ error: 'Missing path' }, { status: 400 });
  }

  // Auth check via cookie-bound supabase client.
  const sessionClient = await createSupabaseServerClient();
  const {
    data: { user },
    error: authError,
  } = await sessionClient.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const admin = getSupabaseAdminClient();
  if (!admin) {
    return NextResponse.json({ error: 'Server config error' }, { status: 500 });
  }

  const objectPath = path.join('/');
  const { data, error } = await admin.storage.from('adjuntos').download(objectPath);

  if (error || !data) {
    console.error('[adjuntos-proxy] download failed', {
      objectPath,
      userId: user.id,
      errorMessage: error?.message,
    });
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  // `data` is a Blob. NextResponse can stream it directly.
  return new NextResponse(data, {
    headers: {
      'Content-Type': data.type || 'application/octet-stream',
      'Cache-Control': 'private, max-age=3600, must-revalidate',
      'Content-Length': String(data.size),
    },
  });
}
