/**
 * Adjuntos storage helpers — bucket is private, all reads go through
 * signed URLs. Write callers should store ONLY the object path (not a
 * public URL) in `erp.adjuntos.url` and in TipTap JSON image nodes.
 *
 * Backward compatibility: `getAdjuntoPath()` accepts either a bare
 * path (`dilesa/escrituras/foo.pdf`) or a legacy full public URL
 * (`https://ybklderteyhuugzfmxbi.supabase.co/storage/v1/object/public/adjuntos/dilesa/escrituras/foo.pdf`)
 * and always returns just the path. That lets the app keep working
 * with rows that were inserted before this refactor while new writes
 * settle on the clean format.
 */
import type { SupabaseClient } from '@supabase/supabase-js';

const PUBLIC_URL_MARKER = '/object/public/adjuntos/';
const SIGNED_URL_MARKER = '/object/sign/adjuntos/';
const AUTHENTICATED_URL_MARKER = '/object/authenticated/adjuntos/';
// Same-origin proxy path served by app/api/adjuntos/[...path]/route.ts.
// This is the preferred canonical format going forward because it avoids
// signed-URL expiry + client-side rewrite races.
const PROXY_PREFIX = '/api/adjuntos/';

/**
 * Builds the canonical same-origin URL for an adjunto from a bare object path.
 * Pass the result straight to <img src="…"> or <a href="…">. Loads go through
 * the cookie-authenticated proxy route, no signing needed.
 */
export function getAdjuntoProxyUrl(pathOrUrl: string | null | undefined): string {
  const path = getAdjuntoPath(pathOrUrl);
  return path ? `${PROXY_PREFIX}${path}` : '';
}

/**
 * Normalize a value that may be a bare path, a legacy public URL, a (stale)
 * signed URL, or an /api/adjuntos/ proxy URL into the object path inside
 * the `adjuntos` bucket.
 */
export function getAdjuntoPath(urlOrPath: string | null | undefined): string | null {
  if (!urlOrPath) return null;
  const value = String(urlOrPath).trim();
  if (!value) return null;

  for (const marker of [
    PUBLIC_URL_MARKER,
    SIGNED_URL_MARKER,
    AUTHENTICATED_URL_MARKER,
    PROXY_PREFIX,
  ]) {
    const idx = value.indexOf(marker);
    if (idx >= 0) {
      // Strip the host prefix and any query string (signed URLs have `?token=…`).
      const tail = value.slice(idx + marker.length);
      const q = tail.indexOf('?');
      return q >= 0 ? tail.slice(0, q) : tail;
    }
  }

  // Already a path. Trim any leading slash just in case.
  return value.replace(/^\/+/, '');
}

/**
 * Generate a short-lived signed URL for an attachment. Returns an empty
 * string if the input is falsy or if the storage call fails — callers
 * should fall back gracefully (hide the image, show a broken-file icon,
 * etc.).
 *
 * @param expiresInSeconds — default 1 hour. Align longer expiries with
 *   the page's cache policy; shorter is preferred when the URL is
 *   handed straight to an <img> tag that won't refresh.
 */
export async function getAdjuntoSignedUrl(
  supabase: SupabaseClient,
  urlOrPath: string | null | undefined,
  expiresInSeconds = 3600
): Promise<string> {
  const path = getAdjuntoPath(urlOrPath);
  if (!path) return '';
  const { data, error } = await supabase.storage
    .from('adjuntos')
    .createSignedUrl(path, expiresInSeconds);
  if (error || !data?.signedUrl) {
    console.warn('[adjuntos] createSignedUrl failed for', path, error?.message);
    return '';
  }
  return data.signedUrl;
}

/**
 * Batch variant — cheaper than calling `getAdjuntoSignedUrl` in a loop
 * because Supabase's `createSignedUrls` does one round-trip.
 */
export async function getAdjuntoSignedUrls(
  supabase: SupabaseClient,
  urlsOrPaths: Array<string | null | undefined>,
  expiresInSeconds = 3600
): Promise<Map<string, string>> {
  const pathByIndex = urlsOrPaths.map(getAdjuntoPath);
  const uniquePaths = Array.from(new Set(pathByIndex.filter((p): p is string => Boolean(p))));
  const result = new Map<string, string>();
  if (uniquePaths.length === 0) return result;

  const { data, error } = await supabase.storage
    .from('adjuntos')
    .createSignedUrls(uniquePaths, expiresInSeconds);

  if (error || !data) {
    console.warn('[adjuntos] createSignedUrls failed:', error?.message);
    return result;
  }

  for (const entry of data) {
    if (entry.path && entry.signedUrl) {
      result.set(entry.path, entry.signedUrl);
    }
  }
  return result;
}

// ─── TipTap JSON traversal ────────────────────────────────────────────────

/**
 * Walk a TipTap / ProseMirror JSON tree and call `visit` on every node
 * whose type is `image`. Mutates the tree in place (so pass a clone if
 * the original must stay untouched).
 */
export function walkTiptapImages(
  node: unknown,
  visit: (imageNode: { attrs?: Record<string, unknown> }) => void
): void {
  if (!node || typeof node !== 'object') return;
  const n = node as { type?: string; content?: unknown[]; attrs?: Record<string, unknown> };
  if (n.type === 'image') visit(n as { attrs?: Record<string, unknown> });
  if (Array.isArray(n.content)) {
    for (const child of n.content) walkTiptapImages(child, visit);
  }
}

/**
 * Rewrites every image `src` in a TipTap JSON tree to a signed URL.
 * Pass the tree as-loaded from the DB; returns a clone with fresh URLs
 * suitable for handing to the editor.
 */
export async function rewriteTiptapImagesToSigned(
  supabase: SupabaseClient,
  tree: unknown,
  expiresInSeconds = 3600
): Promise<unknown> {
  if (!tree) return tree;
  const clone = JSON.parse(JSON.stringify(tree));

  // Gather all srcs first so we can batch the signed-URL lookup.
  const srcs: string[] = [];
  walkTiptapImages(clone, (img) => {
    const src = img.attrs?.src;
    if (typeof src === 'string') srcs.push(src);
  });

  const urlMap = await getAdjuntoSignedUrls(supabase, srcs, expiresInSeconds);

  walkTiptapImages(clone, (img) => {
    const src = img.attrs?.src;
    if (typeof src !== 'string' || !img.attrs) return;
    const path = getAdjuntoPath(src);
    if (!path) return;
    const signed = urlMap.get(path);
    if (signed) img.attrs.src = signed;
  });

  return clone;
}

/**
 * Inverse of `rewriteTiptapImagesToSigned` — strip any signed / public
 * URL down to the bare path before persisting. Call this in the editor's
 * save path so the DB never holds a soon-to-expire signed URL.
 */
export function normalizeTiptapImagesToPaths(tree: unknown): unknown {
  if (!tree) return tree;
  const clone = JSON.parse(JSON.stringify(tree));
  walkTiptapImages(clone, (img) => {
    const src = img.attrs?.src;
    if (typeof src !== 'string' || !img.attrs) return;
    const path = getAdjuntoPath(src);
    if (path) img.attrs.src = path;
  });
  return clone;
}

// ─── HTML image rewrite (for components that store TipTap output as HTML) ──
//
// BSOP's juntas descripcion stores HTML, not prosemirror JSON. These
// helpers mutate the `src` attribute on every <img> tag.

function replaceImgSrcs(html: string, transform: (src: string) => string): string {
  return html.replace(
    /(<img\b[^>]*?\bsrc\s*=\s*)(?:"([^"]*)"|'([^']*)')/gi,
    (_full, prefix, dq, sq) => {
      const src = dq ?? sq ?? '';
      const next = transform(src);
      return `${prefix}"${next.replace(/"/g, '&quot;')}"`;
    }
  );
}

/**
 * Rewrites every `<img src="…">` in an HTML string to the same-origin
 * `/api/adjuntos/<path>` proxy URL. This is a **synchronous** pure-string
 * transform — no Supabase round-trip, no expiring tokens, no race
 * conditions with TipTap setContent.
 *
 * Kept named `rewriteHtmlImagesToSigned` for backward compatibility with
 * existing callers that await it. The `supabase` and `expiresInSeconds`
 * args are accepted but unused; mark them as such to avoid misuse in
 * future changes.
 */
export async function rewriteHtmlImagesToSigned(
  _supabase: SupabaseClient,
  html: string | null | undefined,
  _expiresInSeconds = 3600
): Promise<string> {
  return rewriteHtmlImagesToProxy(html);
}

/**
 * Pure synchronous version. Replaces every <img src> with `/api/adjuntos/<path>`.
 * Safe to call on HTML that has no adjuntos images (no-op when no <img>).
 */
export function rewriteHtmlImagesToProxy(html: string | null | undefined): string {
  if (!html) return '';
  return replaceImgSrcs(html, (src) => {
    const path = getAdjuntoPath(src);
    if (!path) return src;
    return `/api/adjuntos/${path}`;
  });
}

/**
 * Normalize every `<img src="…">` in an HTML string to the canonical
 * `/api/adjuntos/<path>` form. Call this in the save path so the DB
 * always holds the same format (no signed URLs, no legacy public URLs).
 *
 * Name kept for backward compatibility — despite "ToPaths", the output
 * is now the proxy URL, not the bare path. Callers just need a value
 * that the read side will correctly render; the proxy URL fits both
 * roles and works in <img src> directly without any rewriter step.
 */
export function normalizeHtmlImagesToPaths(html: string | null | undefined): string {
  return rewriteHtmlImagesToProxy(html);
}
