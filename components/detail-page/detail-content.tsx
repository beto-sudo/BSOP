'use client';
import { type ReactNode } from 'react';

export interface DetailContentProps {
  children: ReactNode;
}

/**
 * Pass-through slot. Exists to make the anatomy explicit and match
 * ADR-009 1:1 in JSX. No styling — caller defines its own grid / sections.
 */
export function DetailContent({ children }: DetailContentProps) {
  return <>{children}</>;
}
