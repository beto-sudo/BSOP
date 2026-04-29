import { mergeProps } from '@base-ui/react/merge-props';
import { useRender } from '@base-ui/react/use-render';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '@/lib/utils';

/**
 * `<Badge>` — display-only label for status, count, or category. Builds on
 * shadcn's badge with semantic `tone` variants on top of the original layout
 * variants.
 *
 * Use `tone` for status-like badges across the app (estado, prioridad, etapa).
 * The legacy `default` / `secondary` / `destructive` / `outline` / `ghost` /
 * `link` variants stay for non-semantic uses (counts, links, etc.).
 *
 * Tone palette (background tinted at 15% with matching text and border):
 *   - `neutral` — informational, no opinion (e.g. "Borrador", "En análisis")
 *   - `info`    — in-progress, observational (e.g. "En curso", "En trámite")
 *   - `success` — positive completion (e.g. "Completado", "Aprobado")
 *   - `warning` — needs attention (e.g. "Pausado", "En revisión")
 *   - `danger`  — error, blocked, descartado (e.g. "Bloqueado", "Cancelado")
 *   - `accent`  — special / featured (e.g. "Urgente", "Convertido")
 */
const badgeVariants = cva(
  'group/badge inline-flex h-5 w-fit shrink-0 items-center justify-center gap-1 overflow-hidden rounded-4xl border border-transparent px-2 py-0.5 text-xs font-medium whitespace-nowrap transition-all focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 [&>svg]:pointer-events-none [&>svg]:size-3!',
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground [a]:hover:bg-primary/80',
        secondary: 'bg-secondary text-secondary-foreground [a]:hover:bg-secondary/80',
        destructive:
          'bg-destructive/10 text-destructive focus-visible:ring-destructive/20 dark:bg-destructive/20 dark:focus-visible:ring-destructive/40 [a]:hover:bg-destructive/20',
        outline: 'border-border text-foreground [a]:hover:bg-muted [a]:hover:text-muted-foreground',
        ghost: 'hover:bg-muted hover:text-muted-foreground dark:hover:bg-muted/50',
        link: 'text-primary underline-offset-4 hover:underline',
      },
      tone: {
        neutral: 'bg-[var(--border)]/60 text-[var(--text)]/70 border-[var(--border)]',
        info: 'bg-blue-500/15 text-blue-400 border-blue-500/20',
        success: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/20',
        warning: 'bg-amber-500/15 text-amber-400 border-amber-500/20',
        danger: 'bg-red-500/15 text-red-400 border-red-500/20',
        accent: 'bg-violet-500/15 text-violet-400 border-violet-500/20',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  }
);

export type BadgeTone = NonNullable<VariantProps<typeof badgeVariants>['tone']>;

function Badge({
  className,
  variant,
  tone,
  render,
  ...props
}: useRender.ComponentProps<'span'> & VariantProps<typeof badgeVariants>) {
  // When `tone` is set, drop the default `variant` so Tailwind classes don't
  // fight (the tone classes own background/text/border on their own).
  const resolvedVariant = tone ? undefined : (variant ?? 'default');
  return useRender({
    defaultTagName: 'span',
    props: mergeProps<'span'>(
      {
        className: cn(badgeVariants({ variant: resolvedVariant, tone }), className),
      },
      props
    ),
    render,
    state: {
      slot: 'badge',
      variant: resolvedVariant,
      tone,
    },
  });
}

export { Badge, badgeVariants };
