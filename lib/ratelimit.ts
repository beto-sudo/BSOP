/**
 * Rate limiting for BSOP API routes, backed by Upstash Redis.
 *
 * Why:
 *   Even with Zod validation on payloads, a public-ish endpoint can be
 *   abused by repeat requests — draining Resend quota, filling the DB,
 *   or stress-testing our Supabase connection pool. A sliding-window
 *   limiter per identity (IP, bearer token, etc.) caps the damage
 *   without affecting normal traffic.
 *
 * Infra:
 *   Uses the Upstash Redis integration added via Vercel Marketplace.
 *   The env vars `KV_REST_API_URL` / `KV_REST_API_TOKEN` are auto-injected
 *   by Vercel on every environment (prod, preview, dev). If those aren't
 *   set we fail open (skip the check and log a warning) so a misconfigured
 *   preview doesn't 500 every request.
 *
 * Usage:
 *   import { healthIngestRateLimiter, extractIdentifier } from '@/lib/ratelimit';
 *
 *   const check = await healthIngestRateLimiter.check(extractIdentifier(req));
 *   if (!check.ok) return check.response;
 */
import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';
import { NextRequest, NextResponse } from 'next/server';

// ─── Redis client ─────────────────────────────────────────────────────────────

function getRedis(): Redis | null {
  const url = process.env.KV_REST_API_URL;
  const token = process.env.KV_REST_API_TOKEN;
  if (!url || !token) return null;
  return new Redis({ url, token });
}

const redis = getRedis();

// ─── Per-route limiters ───────────────────────────────────────────────────────
//
// Tuned for BSOP's actual traffic. The numbers can be bumped later — Upstash
// free tier allows 10K commands/day and each `limit()` call is ~2 commands.
//
// Naming convention: `<routeSlug>:<identifier>` so prefixes don't collide
// across routes that might share an identifier (e.g. same IP hitting both
// health/ingest and welcome-email). `@upstash/ratelimit` adds its own
// internal prefix too.

function buildLimiter(prefix: string, requests: number, window: `${number} ${'s' | 'm' | 'h'}`) {
  if (!redis) return null;
  return new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(requests, window),
    prefix: `bsop:${prefix}`,
    analytics: true,
  });
}

const limiters = {
  // Apple Health shortcut sends batches every few minutes. 60/min leaves
  // ample headroom; higher than that is almost certainly abuse.
  healthIngest: buildLimiter('health-ingest', 60, '1 m'),

  // Internal trigger; rarely fires. 5/min per IP catches spray attacks
  // without blocking legitimate retries from the provisioning flow.
  welcomeEmail: buildLimiter('welcome-email', 5, '1 m'),

  // Admin-only tool. 10/min per IP covers batch debugging without being
  // permissive enough for automated scraping of permission data.
  impersonate: buildLimiter('impersonate', 10, '1 m'),
};

// ─── Public API ───────────────────────────────────────────────────────────────

export type RateLimitCheck = { ok: true } | { ok: false; response: NextResponse };

/**
 * Pull a stable identifier out of the request: authorization bearer / x-api-key
 * first, then forwarded IP. Falls back to "unknown" so that misconfigured
 * proxies still bucket into a single identity rather than short-circuiting.
 */
export function extractIdentifier(req: NextRequest): string {
  const auth = req.headers.get('authorization');
  if (auth?.toLowerCase().startsWith('bearer ')) {
    const token = auth.slice(7).trim();
    if (token) return `bearer:${token.slice(0, 32)}`;
  }
  const apiKey = req.headers.get('x-api-key')?.trim();
  if (apiKey) return `apikey:${apiKey.slice(0, 32)}`;

  const fwd = req.headers.get('x-forwarded-for');
  const ip = fwd?.split(',')[0]?.trim() || req.headers.get('x-real-ip')?.trim();
  return `ip:${ip ?? 'unknown'}`;
}

async function runCheck(limiter: Ratelimit | null, identifier: string): Promise<RateLimitCheck> {
  if (!limiter) {
    // Fail-open: if Redis env vars aren't set (e.g. a dev running without
    // the Vercel integration attached), log once and let the request through.
    // Production + preview always have the vars thanks to the integration.
    if (process.env.NODE_ENV !== 'test') {
      console.warn('[ratelimit] Upstash Redis not configured, skipping check');
    }
    return { ok: true };
  }

  const { success, limit, remaining, reset } = await limiter.limit(identifier);
  if (success) return { ok: true };

  const retryAfterSeconds = Math.max(0, Math.ceil((reset - Date.now()) / 1000));

  return {
    ok: false,
    response: NextResponse.json(
      {
        error: 'Too many requests',
        limit,
        remaining,
        retryAfterSeconds,
      },
      {
        status: 429,
        headers: {
          'Retry-After': String(retryAfterSeconds),
          'X-RateLimit-Limit': String(limit),
          'X-RateLimit-Remaining': String(remaining),
          'X-RateLimit-Reset': String(Math.ceil(reset / 1000)),
        },
      }
    ),
  };
}

export const healthIngestRateLimiter = {
  check: (identifier: string) => runCheck(limiters.healthIngest, identifier),
};
export const welcomeEmailRateLimiter = {
  check: (identifier: string) => runCheck(limiters.welcomeEmail, identifier),
};
export const impersonateRateLimiter = {
  check: (identifier: string) => runCheck(limiters.impersonate, identifier),
};
