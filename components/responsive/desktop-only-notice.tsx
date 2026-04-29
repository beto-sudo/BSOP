'use client';

import { Monitor } from 'lucide-react';

import { cn } from '@/lib/utils';

export type DesktopOnlyNoticeProps = {
  /** Module name. Shown in the heading. e.g. "Cortes" or "Conciliación". */
  module: string;
  /** Optional override for the body copy. */
  description?: string;
  className?: string;
};

/**
 * `<DesktopOnlyNotice>` — visible only on `< sm` screens. Tells the user
 * that the module is desktop-only and to switch devices.
 *
 * Convention (ADR-019): every desktop-only module mounts this at the
 * top of its page; on `sm:` and above it disappears (`sm:hidden`) and
 * the actual module content shows.
 *
 * Pair with `<HideBelowSm>` (or Tailwind `sm:hidden`) on the module
 * content to keep mobile users from seeing a broken layout.
 */
export function DesktopOnlyNotice({ module, description, className }: DesktopOnlyNoticeProps) {
  return (
    <div
      role="alert"
      className={cn(
        'flex flex-col items-center justify-center gap-3 rounded-2xl border border-[var(--border)] bg-[var(--card)] px-6 py-12 text-center sm:hidden',
        className
      )}
    >
      <div className="rounded-full bg-[var(--accent)]/10 p-3 text-[var(--accent)]">
        <Monitor className="size-6" aria-hidden="true" />
      </div>
      <h2 className="text-base font-semibold text-[var(--text)]">
        {module} requiere pantalla más grande
      </h2>
      <p className="text-sm text-[var(--text)]/65">
        {description ??
          'Este módulo está optimizado para desktop. Abrilo en una computadora o gira tu tablet a horizontal.'}
      </p>
    </div>
  );
}
