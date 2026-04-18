import type { NextConfig } from 'next';

/**
 * Security headers applied to every HTML response.
 *
 * Design rationale:
 *   - CSP starts permissive on `script-src` / `style-src` (Next.js injects
 *     inline styles + inline bootstrap scripts) and strict on everything
 *     that doesn't require `unsafe-inline`.
 *   - `connect-src` allows self + Supabase REST / realtime / storage. Add
 *     more origins here as new integrations go client-side.
 *   - `frame-ancestors 'none'` + `X-Frame-Options: DENY` make clickjacking
 *     infeasible. Both are set because some browsers still only honor
 *     X-Frame-Options.
 *   - Vercel already adds `Strict-Transport-Security` in prod; we mirror it
 *     explicitly so dev/self-hosted deployments also benefit.
 *   - Permissions-Policy disables APIs the app never uses (camera, mic,
 *     geolocation, payment). Tighten further only after auditing.
 */
const csp = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://va.vercel-scripts.com",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' blob: data: https:",
  "font-src 'self' data:",
  "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://vitals.vercel-insights.com",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
  'upgrade-insecure-requests',
].join('; ');

const permissionsPolicy = [
  'camera=()',
  'microphone=()',
  'geolocation=()',
  'payment=()',
  'usb=()',
  'accelerometer=()',
  'gyroscope=()',
  'magnetometer=()',
].join(', ');

const securityHeaders = [
  { key: 'Content-Security-Policy', value: csp },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: permissionsPolicy },
  {
    key: 'Strict-Transport-Security',
    value: 'max-age=63072000; includeSubDomains; preload',
  },
  { key: 'X-DNS-Prefetch-Control', value: 'on' },
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  async headers() {
    return [
      {
        // Apply to every route. For fine-grained overrides (e.g. letting a
        // specific page relax CSP), add more entries before or after this
        // block — Next.js merges matching blocks in order.
        source: '/:path*',
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
