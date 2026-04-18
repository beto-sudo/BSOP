import type { ReactNode } from 'react';

export function Surface({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-3xl border border-[var(--border)] bg-[var(--card)] ${className}`}>
      {children}
    </div>
  );
}
