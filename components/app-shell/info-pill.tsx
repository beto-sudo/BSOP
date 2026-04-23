import type { LucideIcon } from 'lucide-react';

/**
 * Small icon+value capsule used in the AppShell header (clock, events, etc).
 */
export function InfoPill({ icon: Icon, value }: { icon: LucideIcon; value: string }) {
  return (
    <div className="flex items-center gap-2 rounded-2xl border border-[var(--border)] bg-[var(--panel)] px-3 py-2">
      <Icon className="h-3.5 w-3.5 text-[var(--text-muted)]" aria-hidden="true" />
      <span className="dark:text-white/85 text-[var(--text)]/85">{value}</span>
    </div>
  );
}
