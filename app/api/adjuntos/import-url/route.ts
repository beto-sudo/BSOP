import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { createSupabaseServerClient } from '@/lib/supabase-server';
import { getSupabaseAdminClient } from '@/lib/supabase-admin';

/**
 * POST /api/adjuntos/import-url
 *
 * Body: { url: string, juntaId: string }
 *
 * Downloads an external image (e.g. codahosted.io) server-side and stores it
 * under `adjuntos/juntas/<juntaId>/<random>.<ext>`. Returns the new proxy URL
 * `{ ok: true, url: "/api/adjuntos/juntas/<juntaId>/..." }`.
 *
 * Used by the junta editor's paste handler to pull Coda canvas images into
 * BSOP storage when the user pastes a copied-from-Coda HTML block. Replaces
 * each `<img src="codahosted.io/...">` with the returned proxy URL so the
 * DB never stores an external link that can expire.
 *
 * Security:
 *   - Requires an authenticated BSOP session (cookie-based).
 *   - Restricts source host to a small allowlist to prevent SSRF.
 *   - Caps max download size at 25 MB.
 */

const ALLOWED_HOSTS = new Set(['codahosted.io', 'images-codaio.imgix.net', 'codaio.imgix.net']);
const MAX_BYTES = 25 * 1024 * 1024;

export async function POST(req: NextRequest) {
  // Auth via cookie-bound session
  const sessionClient = await createSupabaseServerClient();
  const {
    data: { user },
    error: authError,
  } = await sessionClient.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const { url, juntaId } = (body ?? {}) as { url?: string; juntaId?: string };
  if (!url || typeof url !== 'string') {
    return NextResponse.json({ error: 'Missing url' }, { status: 400 });
  }
  if (!juntaId || typeof juntaId !== 'string' || !/^[0-9a-f-]{36}$/.test(juntaId)) {
    return NextResponse.json({ error: 'Missing or invalid juntaId' }, { status: 400 });
  }

  // Validate host against allowlist
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return NextResponse.json({ error: 'Invalid URL' }, { status: 400 });
  }
  if (!ALLOWED_HOSTS.has(parsed.host)) {
    return NextResponse.json({ error: `Host not allowed: ${parsed.host}` }, { status: 400 });
  }

  const admin = getSupabaseAdminClient();
  if (!admin) {
    return NextResponse.json({ error: 'Server config error' }, { status: 500 });
  }

  // Download with timeout
  let upstream: Response;
  try {
    upstream = await fetch(url, {
      redirect: 'follow',
      headers: { 'User-Agent': 'BSOP-ImportUrl/1.0' },
      signal: AbortSignal.timeout(30_000),
    });
  } catch (e) {
    return NextResponse.json(
      { error: `Fetch failed: ${(e as Error).message.slice(0, 120)}` },
      { status: 502 }
    );
  }
  if (!upstream.ok) {
    return NextResponse.json({ error: `Upstream HTTP ${upstream.status}` }, { status: 502 });
  }
  const contentLength = Number(upstream.headers.get('content-length') ?? '0');
  if (contentLength > MAX_BYTES) {
    return NextResponse.json({ error: 'File too large' }, { status: 413 });
  }

  const arrayBuf = await upstream.arrayBuffer();
  if (arrayBuf.byteLength > MAX_BYTES) {
    return NextResponse.json({ error: 'File too large' }, { status: 413 });
  }
  const bytes = new Uint8Array(arrayBuf);

  // Detect extension from content (magic bytes) with fallback to URL
  const ext = detectExt(bytes) || detectExtFromUrl(parsed.pathname) || 'png';
  const contentType = extToMime(ext);

  const filename = `${Date.now()}-imported-${randomUUID().slice(0, 6)}.${ext}`;
  const storagePath = `juntas/${juntaId}/${filename}`;

  const { error: uploadErr } = await admin.storage
    .from('adjuntos')
    .upload(storagePath, bytes, { contentType, upsert: false });
  if (uploadErr) {
    console.error('[adjuntos/import-url] upload failed', {
      storagePath,
      errorMessage: uploadErr.message,
    });
    return NextResponse.json({ error: `Upload failed: ${uploadErr.message}` }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    url: `/api/adjuntos/${storagePath}`,
    sizeBytes: bytes.byteLength,
    contentType,
  });
}

function detectExt(buf: Uint8Array): string | null {
  if (buf.length < 12) return null;
  // PNG
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return 'png';
  // JPEG
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpg';
  // GIF
  if (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46) return 'gif';
  // WebP (RIFF....WEBP)
  if (
    buf[0] === 0x52 &&
    buf[1] === 0x49 &&
    buf[2] === 0x46 &&
    buf[3] === 0x46 &&
    buf[8] === 0x57 &&
    buf[9] === 0x45 &&
    buf[10] === 0x42 &&
    buf[11] === 0x50
  )
    return 'webp';
  return null;
}

function detectExtFromUrl(pathname: string): string | null {
  const m = pathname.toLowerCase().match(/\.(png|jpe?g|gif|webp|bmp|svg)($|[?#])/);
  if (!m) return null;
  const e = m[1];
  return e === 'jpeg' ? 'jpg' : e;
}

function extToMime(ext: string): string {
  switch (ext) {
    case 'jpg':
      return 'image/jpeg';
    case 'png':
      return 'image/png';
    case 'gif':
      return 'image/gif';
    case 'webp':
      return 'image/webp';
    case 'bmp':
      return 'image/bmp';
    case 'svg':
      return 'image/svg+xml';
    default:
      return 'application/octet-stream';
  }
}
