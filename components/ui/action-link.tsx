import Link from 'next/link';
import { ArrowRight } from 'lucide-react';

export function ActionLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="inline-flex items-center gap-2 text-sm font-medium text-[var(--accent-soft)] transition hover:text-white"
    >
      {label}
      <ArrowRight className="h-4 w-4" />
    </Link>
  );
}
