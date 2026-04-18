export function EmptyState({ title, copy }: { title: string; copy: string }) {
  return (
    <div className="rounded-3xl border border-dashed border-[var(--border)] bg-[var(--panel)] px-5 py-8 text-center dark:border-white/12 dark:bg-black/10">
      <div className="text-sm font-medium text-[var(--text)] dark:text-white/78">{title}</div>
      <div className="mt-2 text-sm leading-6 text-[var(--muted-foreground)] dark:text-white/45">{copy}</div>
    </div>
  );
}
