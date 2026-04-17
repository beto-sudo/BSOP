/**
 * Validation helpers for Next.js API routes.
 *
 * Wraps Zod parse with a consistent shape so route handlers don't
 * reinvent the 400-response boilerplate. Designed for Next.js App Router
 * route handlers (`app/api/.../route.ts`).
 *
 * @example Body validation
 *   const parsed = await validateBody(req, WelcomeEmailSchema);
 *   if (!parsed.ok) return parsed.response;
 *   const { email, usuarioId } = parsed.data;  // fully typed
 *
 * @example Query param validation
 *   const parsed = validateQuery(req, ImpersonateQuerySchema);
 *   if (!parsed.ok) return parsed.response;
 *   const { userId } = parsed.data;
 */
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

export type ValidationResult<T> =
  | { ok: true; data: T }
  | { ok: false; response: NextResponse };

function errorResponse(error: z.ZodError): NextResponse {
  return NextResponse.json(
    {
      error: 'Invalid request',
      issues: error.issues.map((issue) => ({
        path: issue.path.join('.') || '(root)',
        message: issue.message,
        code: issue.code,
      })),
    },
    { status: 400 },
  );
}

/**
 * Parse and validate a JSON request body.
 *
 * Handles the common failure modes — missing body, non-JSON content,
 * schema mismatch — and returns a structured 400 with per-field errors.
 */
export async function validateBody<T extends z.ZodTypeAny>(
  req: NextRequest,
  schema: T,
): Promise<ValidationResult<z.infer<T>>> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return {
      ok: false,
      response: NextResponse.json(
        { error: 'Invalid JSON body' },
        { status: 400 },
      ),
    };
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return { ok: false, response: errorResponse(parsed.error) };
  }
  return { ok: true, data: parsed.data };
}

/**
 * Parse and validate a request's query string (searchParams).
 *
 * Pass a schema over the object form (e.g. `z.object({ userId: z.string().uuid() })`).
 * Multi-value query params are not supported by this helper; read them
 * directly from `req.nextUrl.searchParams` if needed.
 */
export function validateQuery<T extends z.ZodTypeAny>(
  req: NextRequest,
  schema: T,
): ValidationResult<z.infer<T>> {
  const entries = Object.fromEntries(req.nextUrl.searchParams.entries());
  const parsed = schema.safeParse(entries);
  if (!parsed.success) {
    return { ok: false, response: errorResponse(parsed.error) };
  }
  return { ok: true, data: parsed.data };
}
