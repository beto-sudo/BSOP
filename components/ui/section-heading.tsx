export function SectionHeading({
  eyebrow,
  title,
  copy,
}: {
  eyebrow: string;
  title: string;
  copy: string;
}) {
  return (
    <div className="mb-8 max-w-3xl">
      <div className="mb-3 text-xs font-semibold uppercase tracking-[0.28em] text-[var(--accent-soft)]">
        {eyebrow}
      </div>
      <h1 className="text-3xl font-semibold tracking-tight text-[var(--text)] sm:text-4xl">
        {title}
      </h1>
      <p className="mt-3 text-sm leading-7 text-[var(--muted)] sm:text-base">{copy}</p>
    </div>
  );
}
