'use client';

import { useCallback } from 'react';

/**
 * `useTriggerPrint` — wraps `window.print()` with a stable callback.
 *
 * Why a hook: the bare `window.print()` works fine, but a hook gives a
 * canonical place to extend the trigger (e.g. preflight document checks,
 * onBefore/After callbacks, fallback for browsers without printing).
 *
 * Usage:
 *
 *   const triggerPrint = useTriggerPrint();
 *
 *   <Button onClick={triggerPrint}>Imprimir</Button>
 *
 * For SSR safety, the hook returns a no-op when `window` is undefined.
 */
export function useTriggerPrint(): () => void {
  return useCallback(() => {
    if (typeof window === 'undefined') return;
    window.print();
  }, []);
}
