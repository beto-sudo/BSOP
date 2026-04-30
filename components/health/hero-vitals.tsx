import { SectionHeading } from '@/components/ui/section-heading';
import { Surface } from '@/components/ui/surface';
import type { HeroCard } from './types';

/**
 * Recovery hero band — four Surface tiles showing how the body is
 * recovering today (Sleep, HRV, Resting HR, Wrist Temp). Pure
 * presentational; parent owns the card data and wiring.
 */
export function HeroVitals({ heroCards }: { heroCards: HeroCard[] }) {
  return (
    <section className="relative overflow-hidden rounded-[2rem] border border-indigo-200 bg-[linear-gradient(180deg,rgba(99,102,241,0.10),rgba(255,255,255,0.72))] p-6 shadow-sm sm:p-8 dark:border-indigo-300/15 dark:bg-[linear-gradient(180deg,rgba(99,102,241,0.10),rgba(255,255,255,0.02))] dark:shadow-none">
      <div className="absolute inset-y-0 right-0 w-1/2 bg-[radial-gradient(circle_at_top_right,rgba(129,140,248,0.14),transparent_55%)] dark:bg-[radial-gradient(circle_at_top_right,rgba(129,140,248,0.16),transparent_55%)]" />
      <div className="relative">
        <SectionHeading
          eyebrow="Recovery"
          title="Cómo amaneciste"
          copy="Las señales que marcan qué tan preparado está tu cuerpo hoy: sueño, variabilidad, pulso en reposo y temperatura nocturna."
        />
        <div className="-mt-2 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {heroCards.map((card) => {
            const Icon = card.icon;
            return (
              <Surface key={card.key} className="p-5 shadow-sm dark:shadow-none">
                <div className="flex items-center justify-between gap-4">
                  <div className={`rounded-2xl border p-3 ${card.tone}`}>
                    <Icon className="h-5 w-5" />
                  </div>
                  <div className="flex items-center gap-2">
                    {card.flag ? (
                      <span
                        className="rounded-full border border-amber-400/50 bg-amber-200/60 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-amber-800 dark:border-amber-300/30 dark:bg-amber-300/15 dark:text-amber-100"
                        title={`${card.label} se movió contra ti vs la base 7d previa.`}
                      >
                        {card.flag.label}
                      </span>
                    ) : null}
                    {card.stale ? (
                      <span className="rounded-full border border-amber-300/40 bg-amber-100/60 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-amber-700 dark:border-amber-300/25 dark:bg-amber-300/10 dark:text-amber-200">
                        {card.staleLabel ?? 'Sin datos'}
                      </span>
                    ) : null}
                    <div className="text-xs uppercase tracking-[0.22em] text-[var(--muted-foreground)] dark:text-white/35">
                      {card.label}
                    </div>
                  </div>
                </div>
                <div className="mt-6 flex items-end gap-2">
                  <div className="text-3xl font-semibold text-[var(--text)] dark:text-white">
                    {card.value}
                  </div>
                  {card.unit ? (
                    <div className="pb-1 text-sm text-[var(--muted-foreground)] dark:text-white/45">
                      {card.unit}
                    </div>
                  ) : null}
                </div>
                <div className="mt-3 text-sm text-[var(--muted-foreground)] dark:text-white/55">
                  {card.helper}
                </div>
              </Surface>
            );
          })}
        </div>
      </div>
    </section>
  );
}
