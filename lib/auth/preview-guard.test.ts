import { describe, it, expect, vi, beforeEach } from 'vitest';

let cookieStoreState: { value: string | null };

vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) => {
      if (name === 'bsop_preview_as' && cookieStoreState.value) {
        return { name, value: cookieStoreState.value };
      }
      return undefined;
    },
  }),
}));

beforeEach(() => {
  cookieStoreState = { value: null };
});

describe('preview-guard', () => {
  it('isInPreview returns false when no cookie is set', async () => {
    const { isInPreview } = await import('./preview-guard');
    expect(await isInPreview()).toBe(false);
  });

  it('isInPreview returns true when cookie is set', async () => {
    cookieStoreState.value = '11111111-1111-4111-8111-111111111111';
    const { isInPreview } = await import('./preview-guard');
    expect(await isInPreview()).toBe(true);
  });

  it('getPreviewUserId returns null when no cookie is set', async () => {
    const { getPreviewUserId } = await import('./preview-guard');
    expect(await getPreviewUserId()).toBeNull();
  });

  it('getPreviewUserId returns the cookie value when set', async () => {
    cookieStoreState.value = '22222222-2222-4222-8222-222222222222';
    const { getPreviewUserId } = await import('./preview-guard');
    expect(await getPreviewUserId()).toBe('22222222-2222-4222-8222-222222222222');
  });

  it('assertNotInPreview resolves when no cookie is set', async () => {
    const { assertNotInPreview } = await import('./preview-guard');
    await expect(assertNotInPreview()).resolves.toBeUndefined();
  });

  it('assertNotInPreview throws PreviewModeError when cookie is set', async () => {
    cookieStoreState.value = '33333333-3333-4333-8333-333333333333';
    const { assertNotInPreview, PreviewModeError } = await import('./preview-guard');
    await expect(assertNotInPreview()).rejects.toBeInstanceOf(PreviewModeError);
  });

  it('requireNotInPreview returns null when no cookie is set', async () => {
    const { requireNotInPreview } = await import('./preview-guard');
    expect(await requireNotInPreview()).toBeNull();
  });

  it('requireNotInPreview returns 403 NextResponse when cookie is set', async () => {
    cookieStoreState.value = '44444444-4444-4444-8444-444444444444';
    const { requireNotInPreview } = await import('./preview-guard');
    const res = await requireNotInPreview();
    expect(res).not.toBeNull();
    expect(res?.status).toBe(403);
    const body = await res!.json();
    expect(body.error).toMatch(/vista previa/i);
  });
});
