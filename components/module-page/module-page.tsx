'use client';
import { type ReactNode } from 'react';

export interface ModulePageProps {
  children: ReactNode;
  className?: string;
}

/**
 * Root wrapper for all ERP module pages. Enforces the canonical anatomy:
 * Header → Tabs → KPIs → Filters → Content (in that vertical order).
 *
 * See ADR-004 (supabase/adr/004_module_page_layout_convention.md) for the rules.
 */
export function ModulePage({ children, className }: ModulePageProps) {
  return <div className={['space-y-6', className].filter(Boolean).join(' ')}>{children}</div>;
}
