import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';

import {
  getAdjuntoPath,
  getAdjuntoSignedUrl,
  getAdjuntoSignedUrls,
  walkTiptapImages,
  normalizeTiptapImagesToPaths,
  normalizeHtmlImagesToPaths,
  rewriteTiptapImagesToSigned,
  rewriteHtmlImagesToSigned,
} from './adjuntos';

/**
 * Unit tests for `lib/adjuntos.ts`.
 *
 * The bucket `adjuntos` is private — reads go through short-lived signed
 * URLs. Writes store the bare object path in the DB. These tests lock in:
 *
 *   • `getAdjuntoPath()` normalizes bare paths, legacy public URLs, signed
 *     URLs, and authenticated URLs down to the bucket path.
 *   • TipTap / HTML walkers mutate only image nodes.
 *   • Signed-URL helpers call the Supabase storage SDK minimally (one
 *     `createSignedUrls` round-trip for batches) and tolerate errors.
 *
 * The Supabase client is mocked with plain object literals so tests never
 * hit the network.
 */

// ─── Mock helpers ────────────────────────────────────────────────────────

type CreateSignedUrlResult = {
  data: { signedUrl: string } | null;
  error: { message: string } | null;
};
type CreateSignedUrlsEntry = {
  path: string | null;
  signedUrl: string;
  error?: string | null;
};
type CreateSignedUrlsResult = {
  data: CreateSignedUrlsEntry[] | null;
  error: { message: string } | null;
};

type StorageMock = {
  createSignedUrl: ReturnType<typeof vi.fn>;
  createSignedUrls: ReturnType<typeof vi.fn>;
};

function makeSupabaseMock(storage: StorageMock): {
  client: SupabaseClient;
  from: ReturnType<typeof vi.fn>;
} {
  const from = vi.fn().mockReturnValue(storage);
  const client = { storage: { from } } as unknown as SupabaseClient;
  return { client, from };
}

// Silence the warn() calls so test output stays readable.
beforeEach(() => {
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

// ─── getAdjuntoPath ──────────────────────────────────────────────────────

describe('getAdjuntoPath', () => {
  it('returns null for null input', () => {
    expect(getAdjuntoPath(null)).toBe(null);
  });

  it('returns null for undefined input', () => {
    expect(getAdjuntoPath(undefined)).toBe(null);
  });

  it('returns null for empty string', () => {
    expect(getAdjuntoPath('')).toBe(null);
  });

  it('returns null for whitespace-only string', () => {
    expect(getAdjuntoPath('   ')).toBe(null);
  });

  it('passes bare paths through untouched', () => {
    expect(getAdjuntoPath('dilesa/escrituras/foo.pdf')).toBe('dilesa/escrituras/foo.pdf');
  });

  it('strips a single leading slash from a bare path', () => {
    expect(getAdjuntoPath('/dilesa/escrituras/foo.pdf')).toBe('dilesa/escrituras/foo.pdf');
  });

  it('strips multiple leading slashes from a bare path', () => {
    expect(getAdjuntoPath('///dilesa/escrituras/foo.pdf')).toBe('dilesa/escrituras/foo.pdf');
  });

  it('extracts the path from a legacy public URL', () => {
    const url =
      'https://ybklderteyhuugzfmxbi.supabase.co/storage/v1/object/public/adjuntos/dilesa/escrituras/foo.pdf';
    expect(getAdjuntoPath(url)).toBe('dilesa/escrituras/foo.pdf');
  });

  it('extracts the path from a (stale) signed URL and drops query params', () => {
    const url =
      'https://ybklderteyhuugzfmxbi.supabase.co/storage/v1/object/sign/adjuntos/dilesa/escrituras/foo.pdf?token=abc.def.ghi&other=1';
    expect(getAdjuntoPath(url)).toBe('dilesa/escrituras/foo.pdf');
  });

  it('extracts the path from an authenticated URL', () => {
    const url =
      'https://ybklderteyhuugzfmxbi.supabase.co/storage/v1/object/authenticated/adjuntos/dilesa/escrituras/foo.pdf';
    expect(getAdjuntoPath(url)).toBe('dilesa/escrituras/foo.pdf');
  });

  it('trims surrounding whitespace before processing', () => {
    expect(getAdjuntoPath('  dilesa/foo.pdf  ')).toBe('dilesa/foo.pdf');
  });
});

// ─── walkTiptapImages ────────────────────────────────────────────────────

describe('walkTiptapImages', () => {
  it('does nothing for null / undefined / non-object input', () => {
    const visit = vi.fn();
    walkTiptapImages(null, visit);
    walkTiptapImages(undefined, visit);
    walkTiptapImages('string', visit);
    walkTiptapImages(42, visit);
    expect(visit).not.toHaveBeenCalled();
  });

  it('visits a single top-level image node', () => {
    const visit = vi.fn();
    walkTiptapImages({ type: 'image', attrs: { src: 'a.png' } }, visit);
    expect(visit).toHaveBeenCalledTimes(1);
    expect(visit).toHaveBeenCalledWith({ type: 'image', attrs: { src: 'a.png' } });
  });

  it('visits every image in a deeply nested tree', () => {
    const tree = {
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'hi' }] },
        {
          type: 'blockquote',
          content: [
            {
              type: 'paragraph',
              content: [
                { type: 'image', attrs: { src: 'a.png' } },
                { type: 'image', attrs: { src: 'b.png' } },
              ],
            },
          ],
        },
        { type: 'image', attrs: { src: 'c.png' } },
      ],
    };
    const srcs: string[] = [];
    walkTiptapImages(tree, (img) => {
      if (typeof img.attrs?.src === 'string') srcs.push(img.attrs.src);
    });
    expect(srcs).toEqual(['a.png', 'b.png', 'c.png']);
  });

  it('ignores non-image nodes even if they have a src attribute', () => {
    const visit = vi.fn();
    walkTiptapImages(
      {
        type: 'doc',
        content: [
          { type: 'video', attrs: { src: 'video.mp4' } },
          { type: 'paragraph', attrs: { src: 'should-ignore' } },
        ],
      },
      visit
    );
    expect(visit).not.toHaveBeenCalled();
  });

  it('tolerates malformed content (null children, missing fields)', () => {
    const visit = vi.fn();
    walkTiptapImages(
      {
        type: 'doc',
        content: [null, undefined, { type: 'image' }, { content: 'not an array' }],
      },
      visit
    );
    expect(visit).toHaveBeenCalledTimes(1);
  });

  it('returns an empty visit list for an empty tree', () => {
    const visit = vi.fn();
    walkTiptapImages({ type: 'doc', content: [] }, visit);
    expect(visit).not.toHaveBeenCalled();
  });
});

// ─── normalizeTiptapImagesToPaths ────────────────────────────────────────

describe('normalizeTiptapImagesToPaths', () => {
  it('passes null / undefined through unchanged', () => {
    expect(normalizeTiptapImagesToPaths(null)).toBe(null);
    expect(normalizeTiptapImagesToPaths(undefined)).toBe(undefined);
  });

  it('rewrites signed-URL srcs to bare paths', () => {
    const tree = {
      type: 'doc',
      content: [
        {
          type: 'image',
          attrs: {
            src: 'https://x.supabase.co/storage/v1/object/sign/adjuntos/a/b.png?token=abc',
          },
        },
      ],
    };
    const out = normalizeTiptapImagesToPaths(tree) as typeof tree;
    expect(out.content[0].attrs.src).toBe('a/b.png');
  });

  it('leaves non-image nodes alone', () => {
    const tree = {
      type: 'doc',
      content: [{ type: 'paragraph', attrs: { src: 'keep-me.png' } }],
    };
    const out = normalizeTiptapImagesToPaths(tree) as typeof tree;
    expect(out.content[0].attrs.src).toBe('keep-me.png');
  });

  it('does not mutate the original tree (clones)', () => {
    const tree = {
      type: 'doc',
      content: [
        {
          type: 'image',
          attrs: {
            src: 'https://x.supabase.co/storage/v1/object/public/adjuntos/a/b.png',
          },
        },
      ],
    };
    const original = JSON.parse(JSON.stringify(tree));
    normalizeTiptapImagesToPaths(tree);
    expect(tree).toEqual(original);
  });
});

// ─── normalizeHtmlImagesToPaths ──────────────────────────────────────────

describe('normalizeHtmlImagesToPaths', () => {
  it('returns empty string for null / undefined / empty', () => {
    expect(normalizeHtmlImagesToPaths(null)).toBe('');
    expect(normalizeHtmlImagesToPaths(undefined)).toBe('');
    expect(normalizeHtmlImagesToPaths('')).toBe('');
  });

  it('rewrites a single double-quoted src', () => {
    const html =
      '<p>hi</p><img src="https://x.supabase.co/storage/v1/object/public/adjuntos/a/b.png" alt="x">';
    const out = normalizeHtmlImagesToPaths(html);
    expect(out).toContain('src="a/b.png"');
    expect(out).not.toContain('/object/public/');
  });

  it('rewrites a single single-quoted src (coerced to double quotes on output)', () => {
    const html =
      "<img src='https://x.supabase.co/storage/v1/object/sign/adjuntos/a/b.png?token=abc' />";
    const out = normalizeHtmlImagesToPaths(html);
    expect(out).toContain('src="a/b.png"');
    expect(out).not.toContain('?token=');
  });

  it('rewrites multiple images on the same line', () => {
    const html =
      '<p><img src="https://x.supabase.co/storage/v1/object/public/adjuntos/a.png"><img src="https://x.supabase.co/storage/v1/object/public/adjuntos/b.png"></p>';
    const out = normalizeHtmlImagesToPaths(html);
    expect(out).toContain('src="a.png"');
    expect(out).toContain('src="b.png"');
  });

  it('is a no-op on HTML with no images', () => {
    const html = '<p>hello <strong>world</strong></p>';
    expect(normalizeHtmlImagesToPaths(html)).toBe(html);
  });

  it('leaves an already-bare-path src untouched', () => {
    const html = '<img src="a/b.png">';
    const out = normalizeHtmlImagesToPaths(html);
    expect(out).toContain('src="a/b.png"');
  });
});

// ─── getAdjuntoSignedUrl ─────────────────────────────────────────────────

describe('getAdjuntoSignedUrl', () => {
  it('returns empty string for null / undefined / empty input without calling the API', async () => {
    const createSignedUrl = vi.fn();
    const { client } = makeSupabaseMock({
      createSignedUrl,
      createSignedUrls: vi.fn(),
    });
    expect(await getAdjuntoSignedUrl(client, null)).toBe('');
    expect(await getAdjuntoSignedUrl(client, undefined)).toBe('');
    expect(await getAdjuntoSignedUrl(client, '')).toBe('');
    expect(createSignedUrl).not.toHaveBeenCalled();
  });

  it('calls createSignedUrl with the extracted path', async () => {
    const createSignedUrl = vi
      .fn<(path: string, expiresIn: number) => Promise<CreateSignedUrlResult>>()
      .mockResolvedValue({
        data: { signedUrl: 'signed://foo' },
        error: null,
      });
    const { client, from } = makeSupabaseMock({
      createSignedUrl,
      createSignedUrls: vi.fn(),
    });

    const result = await getAdjuntoSignedUrl(
      client,
      'https://x.supabase.co/storage/v1/object/public/adjuntos/dilesa/a.pdf',
      120
    );

    expect(from).toHaveBeenCalledWith('adjuntos');
    expect(createSignedUrl).toHaveBeenCalledWith('dilesa/a.pdf', 120);
    expect(result).toBe('signed://foo');
  });

  it('defaults expiresIn to 3600s', async () => {
    const createSignedUrl = vi
      .fn<(path: string, expiresIn: number) => Promise<CreateSignedUrlResult>>()
      .mockResolvedValue({
        data: { signedUrl: 'signed://x' },
        error: null,
      });
    const { client } = makeSupabaseMock({
      createSignedUrl,
      createSignedUrls: vi.fn(),
    });
    await getAdjuntoSignedUrl(client, 'dilesa/a.pdf');
    expect(createSignedUrl).toHaveBeenCalledWith('dilesa/a.pdf', 3600);
  });

  it('returns empty string when the API returns an error', async () => {
    const createSignedUrl = vi
      .fn<(path: string, expiresIn: number) => Promise<CreateSignedUrlResult>>()
      .mockResolvedValue({
        data: null,
        error: { message: 'boom' },
      });
    const { client } = makeSupabaseMock({
      createSignedUrl,
      createSignedUrls: vi.fn(),
    });
    expect(await getAdjuntoSignedUrl(client, 'dilesa/a.pdf')).toBe('');
  });

  it('returns empty string when data is present but signedUrl is missing', async () => {
    const createSignedUrl = vi
      .fn<(path: string, expiresIn: number) => Promise<CreateSignedUrlResult>>()
      .mockResolvedValue({
        data: null,
        error: null,
      });
    const { client } = makeSupabaseMock({
      createSignedUrl,
      createSignedUrls: vi.fn(),
    });
    expect(await getAdjuntoSignedUrl(client, 'dilesa/a.pdf')).toBe('');
  });

  it('extracts path from a stale signed URL and re-signs it', async () => {
    const createSignedUrl = vi
      .fn<(path: string, expiresIn: number) => Promise<CreateSignedUrlResult>>()
      .mockResolvedValue({
        data: { signedUrl: 'signed://fresh' },
        error: null,
      });
    const { client } = makeSupabaseMock({
      createSignedUrl,
      createSignedUrls: vi.fn(),
    });
    const staleUrl = 'https://x.supabase.co/storage/v1/object/sign/adjuntos/dilesa/a.pdf?token=OLD';
    const result = await getAdjuntoSignedUrl(client, staleUrl);
    expect(createSignedUrl).toHaveBeenCalledWith('dilesa/a.pdf', 3600);
    expect(result).toBe('signed://fresh');
  });
});

// ─── getAdjuntoSignedUrls ────────────────────────────────────────────────

describe('getAdjuntoSignedUrls', () => {
  it('short-circuits (no API call) on empty input', async () => {
    const createSignedUrls = vi.fn();
    const { client } = makeSupabaseMock({
      createSignedUrl: vi.fn(),
      createSignedUrls,
    });
    const out = await getAdjuntoSignedUrls(client, []);
    expect(out.size).toBe(0);
    expect(createSignedUrls).not.toHaveBeenCalled();
  });

  it('short-circuits when every input normalizes to null', async () => {
    const createSignedUrls = vi.fn();
    const { client } = makeSupabaseMock({
      createSignedUrl: vi.fn(),
      createSignedUrls,
    });
    const out = await getAdjuntoSignedUrls(client, [null, undefined, '', '   ']);
    expect(out.size).toBe(0);
    expect(createSignedUrls).not.toHaveBeenCalled();
  });

  it('dedupes identical paths in one request', async () => {
    const createSignedUrls = vi
      .fn<(paths: string[], expiresIn: number) => Promise<CreateSignedUrlsResult>>()
      .mockResolvedValue({
        data: [{ path: 'a.png', signedUrl: 'signed://a' }],
        error: null,
      });
    const { client } = makeSupabaseMock({
      createSignedUrl: vi.fn(),
      createSignedUrls,
    });
    const out = await getAdjuntoSignedUrls(client, ['a.png', 'a.png', '/a.png']);
    expect(createSignedUrls).toHaveBeenCalledTimes(1);
    // Only one unique path reaches the API.
    expect(createSignedUrls.mock.calls[0]?.[0]).toEqual(['a.png']);
    expect(out.get('a.png')).toBe('signed://a');
    expect(out.size).toBe(1);
  });

  it('extracts paths from mixed URL forms before calling the API', async () => {
    const createSignedUrls = vi
      .fn<(paths: string[], expiresIn: number) => Promise<CreateSignedUrlsResult>>()
      .mockResolvedValue({
        data: [
          { path: 'a.png', signedUrl: 'signed://a' },
          { path: 'b.png', signedUrl: 'signed://b' },
        ],
        error: null,
      });
    const { client } = makeSupabaseMock({
      createSignedUrl: vi.fn(),
      createSignedUrls,
    });
    await getAdjuntoSignedUrls(client, [
      'a.png',
      'https://x.supabase.co/storage/v1/object/public/adjuntos/b.png',
    ]);
    expect(createSignedUrls.mock.calls[0]?.[0]).toEqual(['a.png', 'b.png']);
  });

  it('returns an empty map when the API errors', async () => {
    const createSignedUrls = vi
      .fn<(paths: string[], expiresIn: number) => Promise<CreateSignedUrlsResult>>()
      .mockResolvedValue({
        data: null,
        error: { message: 'oops' },
      });
    const { client } = makeSupabaseMock({
      createSignedUrl: vi.fn(),
      createSignedUrls,
    });
    const out = await getAdjuntoSignedUrls(client, ['a.png']);
    expect(out.size).toBe(0);
  });

  it('skips entries without a signedUrl in the response', async () => {
    const createSignedUrls = vi
      .fn<(paths: string[], expiresIn: number) => Promise<CreateSignedUrlsResult>>()
      .mockResolvedValue({
        data: [
          { path: 'a.png', signedUrl: 'signed://a' },
          { path: 'b.png', signedUrl: '' },
          { path: null, signedUrl: 'signed://orphan' },
        ],
        error: null,
      });
    const { client } = makeSupabaseMock({
      createSignedUrl: vi.fn(),
      createSignedUrls,
    });
    const out = await getAdjuntoSignedUrls(client, ['a.png', 'b.png']);
    expect(out.size).toBe(1);
    expect(out.get('a.png')).toBe('signed://a');
  });

  it('forwards expiresIn (default 3600s)', async () => {
    const createSignedUrls = vi
      .fn<(paths: string[], expiresIn: number) => Promise<CreateSignedUrlsResult>>()
      .mockResolvedValue({
        data: [{ path: 'a.png', signedUrl: 'signed://a' }],
        error: null,
      });
    const { client } = makeSupabaseMock({
      createSignedUrl: vi.fn(),
      createSignedUrls,
    });
    await getAdjuntoSignedUrls(client, ['a.png']);
    expect(createSignedUrls.mock.calls[0]?.[1]).toBe(3600);
    await getAdjuntoSignedUrls(client, ['a.png'], 60);
    expect(createSignedUrls.mock.calls[1]?.[1]).toBe(60);
  });
});

// ─── rewriteTiptapImagesToSigned ─────────────────────────────────────────

describe('rewriteTiptapImagesToSigned', () => {
  it('returns the input unchanged when tree is falsy', async () => {
    const createSignedUrls = vi.fn();
    const { client } = makeSupabaseMock({
      createSignedUrl: vi.fn(),
      createSignedUrls,
    });
    expect(await rewriteTiptapImagesToSigned(client, null)).toBe(null);
    expect(await rewriteTiptapImagesToSigned(client, undefined)).toBe(undefined);
    expect(createSignedUrls).not.toHaveBeenCalled();
  });

  it('calls the batch API exactly once for a tree with multiple images', async () => {
    const createSignedUrls = vi
      .fn<(paths: string[], expiresIn: number) => Promise<CreateSignedUrlsResult>>()
      .mockResolvedValue({
        data: [
          { path: 'a.png', signedUrl: 'signed://a' },
          { path: 'b.png', signedUrl: 'signed://b' },
        ],
        error: null,
      });
    const { client } = makeSupabaseMock({
      createSignedUrl: vi.fn(),
      createSignedUrls,
    });
    const tree = {
      type: 'doc',
      content: [
        { type: 'image', attrs: { src: 'a.png' } },
        { type: 'image', attrs: { src: 'b.png' } },
      ],
    };
    await rewriteTiptapImagesToSigned(client, tree);
    expect(createSignedUrls).toHaveBeenCalledTimes(1);
  });

  it('replaces image srcs with signed URLs', async () => {
    const createSignedUrls = vi
      .fn<(paths: string[], expiresIn: number) => Promise<CreateSignedUrlsResult>>()
      .mockResolvedValue({
        data: [
          { path: 'a.png', signedUrl: 'signed://a' },
          { path: 'b.png', signedUrl: 'signed://b' },
        ],
        error: null,
      });
    const { client } = makeSupabaseMock({
      createSignedUrl: vi.fn(),
      createSignedUrls,
    });
    const tree = {
      type: 'doc',
      content: [
        { type: 'image', attrs: { src: 'a.png' } },
        { type: 'paragraph', content: [{ type: 'image', attrs: { src: 'b.png' } }] },
      ],
    };
    const out = (await rewriteTiptapImagesToSigned(client, tree)) as typeof tree;
    const first = out.content[0] as { attrs: { src: string } };
    expect(first.attrs.src).toBe('signed://a');
    // Type assertion: b.png lives inside paragraph content.
    const second = out.content[1] as { content: { attrs: { src: string } }[] };
    expect(second.content[0]!.attrs.src).toBe('signed://b');
  });

  it('does not mutate the original tree', async () => {
    const createSignedUrls = vi
      .fn<(paths: string[], expiresIn: number) => Promise<CreateSignedUrlsResult>>()
      .mockResolvedValue({
        data: [{ path: 'a.png', signedUrl: 'signed://a' }],
        error: null,
      });
    const { client } = makeSupabaseMock({
      createSignedUrl: vi.fn(),
      createSignedUrls,
    });
    const tree = {
      type: 'doc',
      content: [{ type: 'image', attrs: { src: 'a.png' } }],
    };
    const snapshot = JSON.parse(JSON.stringify(tree));
    await rewriteTiptapImagesToSigned(client, tree);
    expect(tree).toEqual(snapshot);
  });

  it('leaves src untouched if the batch API returns no signed URL for it', async () => {
    const createSignedUrls = vi
      .fn<(paths: string[], expiresIn: number) => Promise<CreateSignedUrlsResult>>()
      .mockResolvedValue({
        data: null,
        error: { message: 'nope' },
      });
    const { client } = makeSupabaseMock({
      createSignedUrl: vi.fn(),
      createSignedUrls,
    });
    const tree = {
      type: 'doc',
      content: [{ type: 'image', attrs: { src: 'a.png' } }],
    };
    const out = (await rewriteTiptapImagesToSigned(client, tree)) as typeof tree;
    expect(out.content[0].attrs.src).toBe('a.png');
  });
});

// ─── rewriteHtmlImagesToSigned ───────────────────────────────────────────

describe('rewriteHtmlImagesToSigned', () => {
  it('returns empty string for null / undefined / empty without calling the API', async () => {
    const createSignedUrls = vi.fn();
    const { client } = makeSupabaseMock({
      createSignedUrl: vi.fn(),
      createSignedUrls,
    });
    expect(await rewriteHtmlImagesToSigned(client, null)).toBe('');
    expect(await rewriteHtmlImagesToSigned(client, undefined)).toBe('');
    expect(await rewriteHtmlImagesToSigned(client, '')).toBe('');
    expect(createSignedUrls).not.toHaveBeenCalled();
  });

  it('is a no-op (same string, no API call) on HTML with no images', async () => {
    const createSignedUrls = vi.fn();
    const { client } = makeSupabaseMock({
      createSignedUrl: vi.fn(),
      createSignedUrls,
    });
    const html = '<p>no images here</p>';
    expect(await rewriteHtmlImagesToSigned(client, html)).toBe(html);
    expect(createSignedUrls).not.toHaveBeenCalled();
  });

  it('calls the batch API exactly once even with multiple imgs', async () => {
    const createSignedUrls = vi
      .fn<(paths: string[], expiresIn: number) => Promise<CreateSignedUrlsResult>>()
      .mockResolvedValue({
        data: [
          { path: 'a.png', signedUrl: 'signed://a' },
          { path: 'b.png', signedUrl: 'signed://b' },
        ],
        error: null,
      });
    const { client } = makeSupabaseMock({
      createSignedUrl: vi.fn(),
      createSignedUrls,
    });
    const html = '<img src="a.png"><img src="b.png">';
    await rewriteHtmlImagesToSigned(client, html);
    expect(createSignedUrls).toHaveBeenCalledTimes(1);
  });

  it('rewrites img srcs to signed URLs (double-quoted)', async () => {
    const createSignedUrls = vi
      .fn<(paths: string[], expiresIn: number) => Promise<CreateSignedUrlsResult>>()
      .mockResolvedValue({
        data: [{ path: 'a.png', signedUrl: 'signed://a' }],
        error: null,
      });
    const { client } = makeSupabaseMock({
      createSignedUrl: vi.fn(),
      createSignedUrls,
    });
    const html = '<img src="a.png" alt="x">';
    const out = await rewriteHtmlImagesToSigned(client, html);
    expect(out).toContain('src="signed://a"');
    // Other attrs preserved.
    expect(out).toContain('alt="x"');
  });

  it('rewrites single-quoted srcs (coerced to double quotes on output)', async () => {
    const createSignedUrls = vi
      .fn<(paths: string[], expiresIn: number) => Promise<CreateSignedUrlsResult>>()
      .mockResolvedValue({
        data: [{ path: 'a.png', signedUrl: 'signed://a' }],
        error: null,
      });
    const { client } = makeSupabaseMock({
      createSignedUrl: vi.fn(),
      createSignedUrls,
    });
    const html = "<img src='a.png'>";
    const out = await rewriteHtmlImagesToSigned(client, html);
    expect(out).toContain('src="signed://a"');
  });

  it('leaves src untouched when the API returns no URL for it', async () => {
    const createSignedUrls = vi
      .fn<(paths: string[], expiresIn: number) => Promise<CreateSignedUrlsResult>>()
      .mockResolvedValue({
        data: [],
        error: null,
      });
    const { client } = makeSupabaseMock({
      createSignedUrl: vi.fn(),
      createSignedUrls,
    });
    const html = '<img src="a.png">';
    const out = await rewriteHtmlImagesToSigned(client, html);
    expect(out).toContain('src="a.png"');
  });
});
