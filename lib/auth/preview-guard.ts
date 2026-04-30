import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

/**
 * Cookie that marks an active "Viendo como" preview session for an admin.
 *
 * Set by `POST /api/impersonate` (with the impersonated `userId` as value),
 * cleared by `POST /api/impersonate/stop`. httpOnly + path=/.
 *
 * While set, all mutation traffic is blocked end-to-end:
 *   - `middleware.ts` rejects POST/PUT/PATCH/DELETE on `/api/**`.
 *   - Server actions call `assertNotInPreview()` at the top of each mutation.
 *   - The frontend `useReadOnlyMode()` hook disables CTAs.
 *
 * Together this enforces the "preview = read-only" contract from the
 * `viendo-como-readonly` initiative.
 */
export const PREVIEW_COOKIE_NAME = 'bsop_preview_as';

export async function getPreviewUserId(): Promise<string | null> {
  const c = await cookies();
  return c.get(PREVIEW_COOKIE_NAME)?.value ?? null;
}

export async function isInPreview(): Promise<boolean> {
  return (await getPreviewUserId()) !== null;
}

export class PreviewModeError extends Error {
  constructor() {
    super('Modo vista previa activo: las acciones están deshabilitadas');
    this.name = 'PreviewModeError';
  }
}

/** Throws PreviewModeError if a preview cookie is present. Use in server actions. */
export async function assertNotInPreview(): Promise<void> {
  if (await isInPreview()) {
    throw new PreviewModeError();
  }
}

/** Returns a 403 NextResponse if a preview cookie is present, else null. Use in route handlers. */
export async function requireNotInPreview(): Promise<NextResponse | null> {
  if (await isInPreview()) {
    return NextResponse.json(
      { error: 'Modo vista previa activo: las acciones están deshabilitadas' },
      { status: 403 }
    );
  }
  return null;
}
