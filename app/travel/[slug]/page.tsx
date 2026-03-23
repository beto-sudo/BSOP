import { notFound } from 'next/navigation';
import {
  AlertTriangle,
  ArrowUpRight,
  BedDouble,
  Calendar,
  CheckCircle2,
  Clock3,
  Link2,
  MapPin,
  Mountain,
  Phone,
  Snowflake,
  Ticket,
  TriangleAlert,
  Users,
  Utensils,
  Wallet,
} from 'lucide-react';
import { travelTrips, type TravelBudgetStatus, type TravelRestaurant } from '@/data/site';
import { SectionHeading, Shell, Surface } from '@/components/ui';

const budgetStatusMeta: Record<
  TravelBudgetStatus,
  { label: string; icon: string; className: string }
> = {
  confirmed: { label: 'Confirmed', icon: '✅', className: 'text-emerald-300' },
  pending: { label: 'Pending', icon: '⏳', className: 'text-amber-300' },
  estimated: { label: 'Estimated', icon: '≈', className: 'text-sky-300' },
  optional: { label: 'Optional', icon: '◌', className: 'text-white/55' },
};

function zoneRestaurants(restaurants: TravelRestaurant[], zone: TravelRestaurant['zone']) {
  return restaurants.filter((restaurant) => restaurant.zone === zone);
}

export default async function TripDetail({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const trip = travelTrips.find((item) => item.slug === slug);

  if (!trip) return notFound();

  const skiValleyRestaurants = zoneRestaurants(trip.restaurants, 'Ski valley');
  const townRestaurants = zoneRestaurants(trip.restaurants, 'Taos town');

  return (
    <Shell>
      <SectionHeading eyebrow="Trip detail" title={trip.name} copy={trip.summary} />

      <div className="space-y-6">
        <Surface className="overflow-hidden p-6 sm:p-8">
          <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
            <div>
              <div className="inline-flex rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1 text-xs font-medium text-emerald-300">
                {trip.status}
              </div>
              <h1 className="mt-4 text-3xl font-semibold tracking-tight text-white sm:text-4xl">
                {trip.name}
              </h1>
              <p className="mt-3 text-base text-white/60">{trip.subtitle}</p>
              <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                {[
                  { icon: Calendar, label: 'Dates', value: `${trip.startDate} → ${trip.endDate}` },
                  { icon: MapPin, label: 'Location', value: trip.location },
                  { icon: Users, label: 'Travelers', value: `${trip.travelers} people` },
                  { icon: Mountain, label: 'Objective', value: trip.objective },
                ].map((item) => (
                  <div key={item.label} className="rounded-2xl border border-white/8 bg-white/4 p-4">
                    <div className="flex items-center gap-2 text-xs uppercase tracking-[0.24em] text-white/40">
                      <item.icon className="h-4 w-4 text-amber-300" />
                      {item.label}
                    </div>
                    <div className="mt-3 text-sm font-medium leading-6 text-white">{item.value}</div>
                  </div>
                ))}
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
              {trip.quickStats.map((stat) => (
                <div key={stat.label} className="rounded-2xl border border-white/8 bg-white/4 px-4 py-4">
                  <div className="text-xs uppercase tracking-[0.24em] text-white/40">{stat.label}</div>
                  <div className="mt-2 text-lg font-semibold text-white">{stat.value}</div>
                  {stat.note ? <div className="mt-1 text-sm text-white/50">{stat.note}</div> : null}
                </div>
              ))}
            </div>
          </div>
        </Surface>

        <div className="grid gap-6 xl:grid-cols-[1.25fr_0.75fr]">
          <div className="space-y-6">
            <Surface className="p-6">
              <div className="mb-5 flex items-center gap-3 text-white">
                <Calendar className="h-5 w-5 text-amber-300" />
                <h2 className="text-lg font-semibold">Itinerary</h2>
              </div>
              <div className="space-y-4">
                {trip.itinerary.map((item) => (
                  <details
                    key={item.day}
                    open
                    className="group rounded-3xl border border-white/8 bg-white/4 p-5"
                  >
                    <summary className="cursor-pointer list-none">
                      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                        <div>
                          <div className="text-xs uppercase tracking-[0.24em] text-amber-300">{item.day}</div>
                          <div className="mt-2 text-xl font-semibold text-white">{item.title}</div>
                          <div className="mt-1 text-sm text-white/50">{item.date}</div>
                          {item.route ? <div className="mt-3 text-sm text-white/60">{item.route}</div> : null}
                          {item.focus ? <div className="mt-2 text-sm text-white/50">Focus: {item.focus}</div> : null}
                        </div>
                        <div className="text-xs uppercase tracking-[0.24em] text-white/35 group-open:text-amber-300">
                          Expand / collapse
                        </div>
                      </div>
                    </summary>

                    <div className="mt-5 grid gap-3 lg:grid-cols-3">
                      {[
                        { title: item.morning.label ?? 'Morning', block: item.morning },
                        { title: item.afternoon.label ?? 'Afternoon', block: item.afternoon },
                        { title: item.evening.label ?? 'Evening', block: item.evening },
                      ].map(({ title, block }) => (
                        <div key={title} className="rounded-2xl border border-white/8 bg-black/10 p-4">
                          <div className="flex items-center gap-2 text-sm font-medium text-white">
                            <Clock3 className="h-4 w-4 text-amber-300" /> {title}
                          </div>
                          <p className="mt-3 text-sm leading-6 text-white/65">{block.summary}</p>
                          <ul className="mt-3 space-y-2 text-sm text-white/60">
                            {block.bullets.map((bullet) => (
                              <li key={bullet} className="flex gap-2">
                                <span className="mt-1 text-amber-300">•</span>
                                <span>{bullet}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      ))}
                    </div>

                    {item.tips?.length ? (
                      <div className="mt-4 rounded-2xl border border-amber-300/15 bg-amber-300/5 p-4">
                        <div className="flex items-center gap-2 text-sm font-medium text-white">
                          <CheckCircle2 className="h-4 w-4 text-amber-300" /> Operational tips
                        </div>
                        <ul className="mt-3 space-y-2 text-sm text-white/65">
                          {item.tips.map((tip) => (
                            <li key={tip} className="flex gap-2">
                              <span className="mt-1 text-amber-300">•</span>
                              <span>{tip}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ) : null}
                  </details>
                ))}
              </div>
            </Surface>

            <Surface className="p-6">
              <div className="mb-5 flex items-center gap-3 text-white">
                <Wallet className="h-5 w-5 text-amber-300" />
                <h2 className="text-lg font-semibold">Budget breakdown</h2>
              </div>
              <div className="overflow-hidden rounded-3xl border border-white/8 bg-white/3">
                <div className="hidden grid-cols-[1.3fr_0.6fr_0.5fr_1fr] gap-4 border-b border-white/8 px-5 py-3 text-xs uppercase tracking-[0.24em] text-white/40 md:grid">
                  <div>Concept</div>
                  <div>Amount</div>
                  <div>Status</div>
                  <div>Note</div>
                </div>
                <div className="divide-y divide-white/8">
                  {trip.budgetBreakdown.map((item) => {
                    const status = budgetStatusMeta[item.status];
                    return (
                      <div key={item.concept} className="grid gap-2 px-5 py-4 md:grid-cols-[1.3fr_0.6fr_0.5fr_1fr] md:gap-4">
                        <div>
                          <div className="text-xs uppercase tracking-[0.22em] text-white/35 md:hidden">Concept</div>
                          <div className="text-sm font-medium text-white">{item.concept}</div>
                        </div>
                        <div>
                          <div className="text-xs uppercase tracking-[0.22em] text-white/35 md:hidden">Amount</div>
                          <div className="text-sm text-white/75">{item.amount}</div>
                        </div>
                        <div>
                          <div className="text-xs uppercase tracking-[0.22em] text-white/35 md:hidden">Status</div>
                          <div className={`text-sm ${status.className}`}>
                            {status.icon} {status.label}
                          </div>
                        </div>
                        <div>
                          <div className="text-xs uppercase tracking-[0.22em] text-white/35 md:hidden">Note</div>
                          <div className="text-sm text-white/55">{item.note}</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                {[
                  ['Base', trip.budgetSummary.base],
                  ['Comfortable', trip.budgetSummary.comfortable],
                  ['Premium', trip.budgetSummary.premium],
                ].map(([label, value]) => (
                  <div key={label} className="rounded-2xl border border-white/8 bg-white/4 px-4 py-3">
                    <div className="text-xs uppercase tracking-[0.24em] text-white/40">{label}</div>
                    <div className="mt-2 text-lg font-semibold text-white">{value}</div>
                  </div>
                ))}
              </div>
            </Surface>

            <Surface className="p-6">
              <div className="mb-5 flex items-center gap-3 text-white">
                <Utensils className="h-5 w-5 text-amber-300" />
                <h2 className="text-lg font-semibold">Restaurants</h2>
              </div>
              <div className="grid gap-4 lg:grid-cols-2">
                {(
                  [
                    ['Ski valley', skiValleyRestaurants],
                    ['Taos town', townRestaurants],
                  ] as const
                ).map(([zone, restaurants]) => (
                  <div key={zone} className="rounded-3xl border border-white/8 bg-white/4 p-5">
                    <div className="text-sm font-semibold text-white">{zone}</div>
                    <div className="mt-4 space-y-3">
                      {restaurants.map((restaurant) => (
                        <div key={restaurant.name} className="rounded-2xl border border-white/8 bg-black/10 p-4">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <div className="text-sm font-medium text-white">{restaurant.name}</div>
                              <p className="mt-2 text-sm leading-6 text-white/60">{restaurant.description}</p>
                              {restaurant.note ? (
                                <div className="mt-2 text-xs text-white/45">{restaurant.note}</div>
                              ) : null}
                            </div>
                            <a
                              href={restaurant.mapsHref}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex shrink-0 items-center gap-1 rounded-full border border-white/10 px-3 py-2 text-xs text-white/70 transition hover:border-amber-300/40 hover:text-white"
                            >
                              Maps <ArrowUpRight className="h-3.5 w-3.5" />
                            </a>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </Surface>

            <Surface className="p-6">
              <div className="mb-5 flex items-center gap-3 text-white">
                <Snowflake className="h-5 w-5 text-amber-300" />
                <h2 className="text-lg font-semibold">Conditions & notes</h2>
              </div>
              <div className="rounded-3xl border border-white/8 bg-white/4 p-5">
                <p className="text-sm leading-7 text-white/65">{trip.conditions.summary}</p>
                <ul className="mt-4 space-y-3 text-sm text-white/60">
                  {trip.conditions.bullets.map((bullet) => (
                    <li key={bullet} className="flex gap-2">
                      <span className="mt-1 text-amber-300">•</span>
                      <span>{bullet}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="mt-4 rounded-3xl border border-amber-300/20 bg-amber-300/5 p-5">
                <div className="flex items-center gap-2 text-sm font-medium text-white">
                  <TriangleAlert className="h-4 w-4 text-amber-300" /> Warnings / important checks
                </div>
                <ul className="mt-4 space-y-3 text-sm text-white/65">
                  {trip.conditions.warnings.map((warning) => (
                    <li key={warning} className="flex gap-2">
                      <span className="mt-1 text-amber-300">•</span>
                      <span>{warning}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </Surface>

            <Surface className="p-6">
              <div className="mb-5 flex items-center gap-3 text-white">
                <Ticket className="h-5 w-5 text-amber-300" />
                <h2 className="text-lg font-semibold">Lift tickets</h2>
              </div>
              <div className="rounded-3xl border border-white/8 bg-white/4 p-5 text-sm leading-7 text-white/65">
                {trip.liftTickets.recommendation}
              </div>
              <div className="mt-4 overflow-hidden rounded-3xl border border-white/8 bg-white/3">
                <div className="hidden grid-cols-[1.1fr_0.5fr_0.5fr_1fr] gap-4 border-b border-white/8 px-5 py-3 text-xs uppercase tracking-[0.24em] text-white/40 md:grid">
                  <div>Category</div>
                  <div>Weekday</div>
                  <div>Weekend</div>
                  <div>Notes</div>
                </div>
                <div className="divide-y divide-white/8">
                  {trip.liftTickets.lines.map((line) => (
                    <div key={line.category} className="grid gap-2 px-5 py-4 md:grid-cols-[1.1fr_0.5fr_0.5fr_1fr] md:gap-4">
                      <div>
                        <div className="text-xs uppercase tracking-[0.22em] text-white/35 md:hidden">Category</div>
                        <div className="text-sm font-medium text-white">{line.category}</div>
                      </div>
                      <div>
                        <div className="text-xs uppercase tracking-[0.22em] text-white/35 md:hidden">Weekday</div>
                        <div className="text-sm text-white/75">{line.weekday}</div>
                      </div>
                      <div>
                        <div className="text-xs uppercase tracking-[0.22em] text-white/35 md:hidden">Weekend</div>
                        <div className="text-sm text-white/75">{line.weekend}</div>
                      </div>
                      <div>
                        <div className="text-xs uppercase tracking-[0.22em] text-white/35 md:hidden">Notes</div>
                        <div className="text-sm text-white/55">{line.note}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <div className="mt-4 rounded-3xl border border-amber-300/15 bg-amber-300/5 p-5 text-sm text-white/65">
                <div className="font-medium text-white">Family estimate</div>
                <div className="mt-2">{trip.liftTickets.familyEstimate}</div>
                <ul className="mt-4 space-y-2">
                  {trip.liftTickets.notes.map((note) => (
                    <li key={note} className="flex gap-2">
                      <span className="mt-1 text-amber-300">•</span>
                      <span>{note}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </Surface>
          </div>

          <div className="space-y-6">
            <Surface className="p-6">
              <div className="mb-5 flex items-center gap-3 text-white">
                <BedDouble className="h-5 w-5 text-amber-300" />
                <h2 className="text-lg font-semibold">Accommodation</h2>
              </div>
              <div className="space-y-4 text-sm text-white/70">
                <div>
                  <div className="text-white/40">Property</div>
                  <div className="mt-1 text-base font-medium text-white">{trip.accommodation.name}</div>
                </div>
                <div>
                  <div className="text-white/40">Address</div>
                  <div className="mt-1 text-white">{trip.accommodation.address}</div>
                </div>
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-1">
                  <div>
                    <div className="text-white/40">Check-in</div>
                    <div className="mt-1 text-white">{trip.accommodation.checkIn}</div>
                  </div>
                  <div>
                    <div className="text-white/40">Check-out</div>
                    <div className="mt-1 text-white">{trip.accommodation.checkOut}</div>
                  </div>
                </div>
                <div>
                  <div className="text-white/40">Method</div>
                  <div className="mt-1 text-white">{trip.accommodation.checkInMethod}</div>
                </div>
                <div>
                  <div className="text-white/40">Confirmation</div>
                  <div className="mt-1 text-white">{trip.accommodation.confirmationCode}</div>
                </div>
                <div>
                  <div className="text-white/40">Host</div>
                  <div className="mt-1 text-white">{trip.accommodation.host}</div>
                </div>
                <div>
                  <div className="text-white/40">Host phone</div>
                  <a href={`tel:${trip.accommodation.hostPhone.replace(/[^\d+]/g, '')}`} className="mt-1 inline-flex items-center gap-2 text-white transition hover:text-amber-300">
                    <Phone className="h-4 w-4 text-amber-300" />
                    {trip.accommodation.hostPhone}
                  </a>
                </div>
                <div>
                  <div className="text-white/40">Paid</div>
                  <div className="mt-1 text-white">{trip.accommodation.totalPaid}</div>
                </div>
              </div>
              <div className="mt-5 flex flex-wrap gap-3">
                {[
                  ['Google Maps', trip.accommodation.mapsHref],
                  ['Airbnb listing', trip.accommodation.airbnbHref],
                  ['Receipt', trip.accommodation.receiptHref],
                ].map(([label, href]) => (
                  <a
                    key={label}
                    href={href}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/4 px-4 py-2 text-sm text-white/75 transition hover:border-amber-300/40 hover:text-white"
                  >
                    {label} <ArrowUpRight className="h-4 w-4" />
                  </a>
                ))}
              </div>
              <ul className="mt-5 space-y-3 text-sm text-white/60">
                {trip.accommodation.notes.map((note) => (
                  <li key={note} className="flex gap-2">
                    <span className="mt-1 text-amber-300">•</span>
                    <span>{note}</span>
                  </li>
                ))}
              </ul>
            </Surface>

            <Surface className="p-6">
              <div className="mb-5 flex items-center gap-3 text-white">
                <MapPin className="h-5 w-5 text-amber-300" />
                <h2 className="text-lg font-semibold">Pickup & route waypoints</h2>
              </div>
              <div className="space-y-3">
                {trip.pickupPoints.map((point) => (
                  <div key={point.name + point.timing} className="rounded-2xl border border-white/8 bg-white/4 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-sm font-medium text-white">{point.name}</div>
                        <div className="mt-2 text-sm text-white/60">{point.timing}</div>
                        <div className="mt-1 text-sm text-white/50">{point.address}</div>
                        {point.note ? <div className="mt-2 text-xs text-white/45">{point.note}</div> : null}
                      </div>
                      <a
                        href={point.mapsHref}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex shrink-0 items-center gap-1 rounded-full border border-white/10 px-3 py-2 text-xs text-white/70 transition hover:border-amber-300/40 hover:text-white"
                      >
                        Maps <ArrowUpRight className="h-3.5 w-3.5" />
                      </a>
                    </div>
                  </div>
                ))}
              </div>
            </Surface>

            <Surface className="p-6">
              <div className="mb-5 flex items-center gap-3 text-white">
                <Link2 className="h-5 w-5 text-amber-300" />
                <h2 className="text-lg font-semibold">Key links</h2>
              </div>
              <div className="space-y-3">
                {trip.keyLinks.map((link) => (
                  <a
                    key={link.label}
                    href={link.href}
                    target="_blank"
                    rel="noreferrer"
                    className="block rounded-2xl border border-white/8 bg-white/4 p-4 transition hover:border-amber-300/30 hover:bg-white/6"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <div className="text-sm font-medium text-white">{link.label}</div>
                        {link.note ? <div className="mt-1 text-xs text-white/50">{link.note}</div> : null}
                      </div>
                      <ArrowUpRight className="h-4 w-4 text-amber-300" />
                    </div>
                  </a>
                ))}
              </div>
            </Surface>

            <Surface className="p-6">
              <div className="mb-5 flex items-center gap-3 text-white">
                <AlertTriangle className="h-5 w-5 text-amber-300" />
                <h2 className="text-lg font-semibold">General operational tips</h2>
              </div>
              <ul className="space-y-3 text-sm text-white/65">
                {trip.operationalTips.map((tip) => (
                  <li key={tip} className="rounded-2xl border border-white/8 bg-white/4 px-4 py-3">
                    {tip}
                  </li>
                ))}
              </ul>
            </Surface>

            <Surface className="p-6">
              <div className="mb-5 flex items-center gap-3 text-white">
                <CheckCircle2 className="h-5 w-5 text-amber-300" />
                <h2 className="text-lg font-semibold">Open items / TODOs</h2>
              </div>
              <ul className="space-y-3 text-sm text-white/70">
                {trip.todo.map((item) => (
                  <li key={item} className="flex gap-3 rounded-2xl border border-white/8 bg-white/4 px-4 py-3">
                    <span className="mt-0.5 text-amber-300">□</span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </Surface>
          </div>
        </div>
      </div>
    </Shell>
  );
}
