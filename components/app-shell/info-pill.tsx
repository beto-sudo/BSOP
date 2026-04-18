/**
 * Small label+value capsule used in the AppShell header (clock, events, etc).
 */
export function InfoPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center gap-2 rounded-2xl border border-[var(--border)] bg-[var(--panel)] px-3 py-2">
      <span>{label}</span>
      <span className="dark:text-white/85 text-[var(--text)]/85">{value}</span>
    </div>
  );
}
