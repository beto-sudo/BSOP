'use client';
import { type ReactNode } from 'react';

export interface ModuleContentProps {
  children: ReactNode;
}

/**
 * Pass-through slot. Exists to make the anatomy explicit and match
 * ADR-004 1:1 in the JSX. No styling.
 */
export function ModuleContent({ children }: ModuleContentProps) {
  return <>{children}</>;
}
