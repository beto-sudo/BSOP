'use client';

import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export type FormRowProps = {
  /** Columns at `sm:` and up. Mobile is always 1 column. Defaults to 2. */
  cols?: 1 | 2 | 3 | 4;
  children: ReactNode;
  className?: string;
};

const COLS_CLASS: Record<NonNullable<FormRowProps['cols']>, string> = {
  1: 'sm:grid-cols-1',
  2: 'sm:grid-cols-2',
  3: 'sm:grid-cols-3',
  4: 'sm:grid-cols-4',
};

/**
 * `<FormRow>` — responsive grid for related fields.
 *
 * Mobile-first: always 1 column on mobile, opt-in to N columns from `sm:` up.
 * For full-width fields (textarea, long select) skip `<FormRow>` and place
 * `<FormField>` directly in the parent.
 */
export function FormRow({ cols = 2, children, className }: FormRowProps) {
  return (
    <div className={cn('grid grid-cols-1 gap-4', COLS_CLASS[cols], className)}>{children}</div>
  );
}
