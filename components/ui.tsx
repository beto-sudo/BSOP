import Link from 'next/link';
import { ArrowRight, Hammer } from 'lucide-react';
import type { ReactNode } from 'react';

export function Shell({ children }: { children: ReactNode }) {
  return <div className="mx-auto w-full max-w-7xl">{children}</div>;
}

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
      <div className="mb-3 text-xs font-semibold uppercase tracking-[0.28em] text-[var(--accent-soft)]">{eyebrow}</div>
      <h1 className="text-3xl font-semibold tracking-tight text-white sm:text-4xl">{title}</h1>
      <p className="mt-3 text-sm leading-7 text-white/60 sm:text-base">{copy}</p>
    </div>
  );
}

export function Surface({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-3xl border border-[var(--border)] bg-[var(--card)] ${className}`}>{children}</div>;
}

export function ActionLink({ href, label }: { href: string; label: string }) {
  return (
    <Link href={href} className="inline-flex items-center gap-2 text-sm font-medium text-[var(--accent-soft)] transition hover:text-white">
      {label}
      <ArrowRight className="h-4 w-4" />
    </Link>
  );
}

export function PlaceholderSection({
  icon,
  title,
  description,
}: {
  icon: string;
  title: string;
  description: string;
}) {
  return (
    <Shell>
      <Surface className="overflow-hidden p-8 sm:p-10">
        <div className="inline-flex items-center gap-2 rounded-full border border-[var(--accent)]/30 bg-[var(--accent)]/12 px-3 py-1 text-xs font-medium text-[var(--accent-soft)]">
          <Hammer className="h-4 w-4" />
          Under Construction
        </div>
        <div className="mt-6 flex items-start gap-4">
          <div className="flex h-16 w-16 items-center justify-center rounded-3xl border border-[var(--border)] bg-white/5 text-3xl">
            {icon}
          </div>
          <div>
            <h1 className="text-3xl font-semibold text-white sm:text-4xl">{title}</h1>
            <p className="mt-3 max-w-2xl text-sm leading-7 text-white/60 sm:text-base">{description}</p>
          </div>
        </div>
      </Surface>
    </Shell>
  );
}
