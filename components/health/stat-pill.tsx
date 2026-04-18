export function StatPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--panel)] px-4 py-3 dark:border-white/10 dark:bg-black/20">
      <div className="text-[11px] uppercase tracking-[0.18em] text-[var(--muted-foreground)] dark:text-white/35">
        {label}
      </div>
      <div className="mt-2 text-sm font-medium text-[var(--text)] dark:text-white/90">{value}</div>
    </div>
  );
}
