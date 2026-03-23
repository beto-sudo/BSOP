import { ArrowUpRight, MapPin, Users, Wallet } from 'lucide-react';
import { travelTrips } from '@/data/site';
import { ActionLink, SectionHeading, Shell, Surface } from '@/components/ui';

export default function TravelPage() {
  return (
    <Shell>
      <SectionHeading
        eyebrow="Travel"
        title="Trips with real logistics behind them"
        copy="Static, curated travel plans sourced from the workspace — not placeholders. Built to give Beto a clean command view on desktop or phone."
      />

      <div className="grid gap-6">
        {travelTrips.map((trip) => (
          <Surface key={trip.slug} className="overflow-hidden p-6 sm:p-8">
            <div className="grid gap-8 lg:grid-cols-[1.2fr_0.8fr]">
              <div>
                <div className="inline-flex rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1 text-xs font-medium text-emerald-300">
                  {trip.status}
                </div>

                <h2 className="mt-4 text-2xl font-semibold text-white">{trip.name}</h2>
                <p className="mt-2 text-sm text-white/50">
                  {trip.startDate} → {trip.endDate} · {trip.location}
                </p>
                <p className="mt-5 max-w-2xl text-sm leading-7 text-white/65">{trip.summary}</p>

                <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  {trip.quickStats.map((stat) => (
                    <div
                      key={stat.label}
                      className="rounded-2xl border border-white/8 bg-white/4 px-4 py-3"
                    >
                      <div className="text-xs uppercase tracking-[0.24em] text-white/40">{stat.label}</div>
                      <div className="mt-2 text-base font-semibold text-white">{stat.value}</div>
                      {stat.note ? <div className="mt-1 text-xs text-white/50">{stat.note}</div> : null}
                    </div>
                  ))}
                </div>

                <div className="mt-6 flex flex-wrap gap-2">
                  {trip.highlights.map((item) => (
                    <span
                      key={item}
                      className="rounded-full border border-white/8 bg-white/4 px-3 py-2 text-xs text-white/70"
                    >
                      {item}
                    </span>
                  ))}
                </div>

                <div className="mt-6 flex flex-wrap gap-3">
                  <ActionLink href={`/travel/${trip.slug}`} label="Open trip detail" />
                  <a
                    href={trip.accommodation.mapsHref}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/4 px-4 py-2 text-sm text-white/75 transition hover:border-amber-300/40 hover:text-white"
                  >
                    Accommodation map <ArrowUpRight className="h-4 w-4" />
                  </a>
                </div>
              </div>

              <div className="grid gap-4">
                <div className="rounded-3xl border border-white/8 bg-white/4 p-5">
                  <div className="mb-3 flex items-center gap-2 text-sm font-medium text-white">
                    <MapPin className="h-4 w-4 text-amber-300" /> Stay
                  </div>
                  <div className="text-lg font-semibold text-white">{trip.accommodation.name}</div>
                  <p className="mt-2 text-sm leading-6 text-white/55">{trip.accommodation.address}</p>
                  <div className="mt-4 text-xs text-white/45">{trip.accommodation.checkInMethod}</div>
                </div>

                <div className="rounded-3xl border border-white/8 bg-white/4 p-5">
                  <div className="mb-3 flex items-center gap-2 text-sm font-medium text-white">
                    <Wallet className="h-4 w-4 text-amber-300" /> Budget
                  </div>
                  <div className="text-sm text-white/60">Comfortable scenario</div>
                  <div className="mt-2 text-2xl font-semibold text-white">{trip.budgetSummary.comfortable}</div>
                  <div className="mt-1 text-sm text-white/50">
                    {trip.budgetSummary.perPersonComfortable} per person
                  </div>
                </div>

                <div className="rounded-3xl border border-white/8 bg-white/4 p-5">
                  <div className="mb-3 flex items-center gap-2 text-sm font-medium text-white">
                    <Users className="h-4 w-4 text-amber-300" /> Group
                  </div>
                  <div className="text-lg font-semibold text-white">{trip.travelers} travelers</div>
                  <p className="mt-2 text-sm leading-6 text-white/55">{trip.route}</p>
                </div>
              </div>
            </div>
          </Surface>
        ))}
      </div>
    </Shell>
  );
}
