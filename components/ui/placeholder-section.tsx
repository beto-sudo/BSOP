import { Hammer } from 'lucide-react';
import { Shell } from '@/components/ui/shell';
import { Surface } from '@/components/ui/surface';

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
          <div className="flex h-16 w-16 items-center justify-center rounded-3xl border border-[var(--border)] bg-[var(--card)] text-3xl">
            {icon}
          </div>
          <div>
            <h1 className="text-3xl font-semibold text-[var(--text)] sm:text-4xl">{title}</h1>
            <p className="mt-3 max-w-2xl text-sm leading-7 text-[var(--muted)] sm:text-base">
              {description}
            </p>
          </div>
        </div>
      </Surface>
    </Shell>
  );
}
