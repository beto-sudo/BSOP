'use client';
import { type ReactNode } from 'react';

export interface DetailPageProps {
  children: ReactNode;
  className?: string;
}

/**
 * Root wrapper for entity detail pages (`/<modulo>/[id]`). Companion to
 * `<ModulePage>` (ADR-004) but for non-tabular detail anatomy. See ADR-009.
 *
 * Anatomy (vertical, in order):
 *
 *   DetailPage
 *   ├── DetailHeader       (back + eyebrow + title + subtitle + meta + actions)
 *   ├── DetailTabs         (optional, ?section=… routed; underline style — R4)
 *   └── DetailContent      (sections, grid, drawers — caller-defined)
 */
export function DetailPage({ children, className }: DetailPageProps) {
  return <div className={['space-y-5', className].filter(Boolean).join(' ')}>{children}</div>;
}
