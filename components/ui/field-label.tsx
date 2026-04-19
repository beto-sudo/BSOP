import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * Uppercase micro-label used above form fields across BSOP.
 *
 * Renders a real <label> element (not a <div>) so it can be associated with
 * an input via `htmlFor`. When you own the input next to it, pass its id as
 * `htmlFor` to satisfy WCAG 1.3.1 — the asterisk for required fields stays
 * purely visual, with an accessible name supplied to the screen reader.
 *
 * This replaces ~16 copy-pasted local `FieldLabel` definitions that all
 * rendered a <div> and a plain-text "*" for required.
 */
export function FieldLabel({
  children,
  htmlFor,
  required,
  className,
}: {
  children: ReactNode;
  htmlFor?: string;
  required?: boolean;
  className?: string;
}) {
  return (
    <label
      htmlFor={htmlFor}
      className={cn(
        'mb-1.5 block text-[10px] font-semibold uppercase tracking-widest text-[var(--text)]/50',
        className
      )}
    >
      {children}
      {required ? (
        <span className="ml-0.5 text-red-400" aria-hidden="true">
          *
        </span>
      ) : null}
      {required ? <span className="sr-only"> (obligatorio)</span> : null}
    </label>
  );
}
