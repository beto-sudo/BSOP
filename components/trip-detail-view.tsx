import {
  ArrowUpRight,
  Calendar,
  CheckCircle2,
  Link2,
  MapPin,
  Route,
  Users,
  Wallet,
} from 'lucide-react';
import { Surface } from '@/components/ui/surface';
import { type TravelTrip } from '@/data/site';
import { TravelExpenseTracker } from '@/components/travel/travel-expense-tracker';

const budgetStatusMeta = {
  confirmed: { label: 'Confirmado', icon: '✅', className: 'text-emerald-300' },
  pending: { label: 'Pendiente', icon: '⏳', className: 'text-amber-300' },
  estimated: { label: 'Estimado', icon: '≈', className: 'text-sky-300' },
  optional: { label: 'Opcional', icon: '◌', className: 'text-white/55' },
} as const;

function groupRestaurants(trip: TravelTrip) {
  return trip.restaurants.reduce<Record<string, typeof trip.restaurants>>((acc, restaurant) => {
    acc[restaurant.zone] ??= [];
    acc[restaurant.zone].push(restaurant);
    return acc;
  }, {});
}

export function TripDetailView({
  trip,
  shareMode = false,
}: {
  trip: TravelTrip;
  shareMode?: boolean;
}) {
  const restaurantGroups = Object.entries(groupRestaurants(trip));

  return (
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
                { icon: Calendar, label: 'Fechas', value: `${trip.startDate} → ${trip.endDate}` },
                { icon: MapPin, label: 'Ubicación', value: trip.location },
                { icon: Users, label: 'Participantes', value: `${trip.travelers} personas` },
                { icon: Route, label: 'Formato', value: trip.style },
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
            <p className="mt-6 max-w-3xl text-sm leading-7 text-white/65">{trip.summary}</p>
            <div className="mt-5 flex flex-wrap gap-2">
              {trip.highlights.map((item) => (
                <span
                  key={item}
                  className="rounded-full border border-white/8 bg-white/4 px-3 py-2 text-xs text-white/70"
                >
                  {item}
                </span>
              ))}
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
            {trip.quickStats.map((stat) => (
              <div
                key={stat.label}
                className="rounded-2xl border border-white/8 bg-white/4 px-4 py-4"
              >
                <div className="text-xs uppercase tracking-[0.24em] text-white/40">
                  {stat.label}
                </div>
                <div className="mt-2 text-lg font-semibold text-white">{stat.value}</div>
                {stat.note ? <div className="mt-1 text-sm text-white/50">{stat.note}</div> : null}
              </div>
            ))}
          </div>
        </div>
      </Surface>

      <TravelExpenseTracker
        tripSlug={trip.slug}
        tripName={trip.name}
        defaultCurrency={trip.defaultCurrency}
        defaultExchangeRate={trip.defaultExchangeRate}
        participantPresets={trip.participantPresets}
        shareMode={shareMode}
      />

      <div className="grid gap-6 xl:grid-cols-[1.25fr_0.75fr]">
        <div className="space-y-6">
          <Surface className="p-6">
            <div className="mb-5 flex items-center gap-3 text-white">
              <Calendar className="h-5 w-5 text-amber-300" />
              <h2 className="text-lg font-semibold">Itinerario</h2>
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
                        <div className="text-xs uppercase tracking-[0.24em] text-amber-300">
                          {item.day}
                        </div>
                        <div className="mt-2 text-xl font-semibold text-white">{item.title}</div>
                        <div className="mt-1 text-sm text-white/50">{item.date}</div>
                        {item.route ? (
                          <div className="mt-3 text-sm text-white/60">{item.route}</div>
                        ) : null}
                        {item.focus ? (
                          <div className="mt-2 text-sm text-white/50">Objetivo: {item.focus}</div>
                        ) : null}
                      </div>
                      <div className="text-xs uppercase tracking-[0.24em] text-white/35 group-open:text-amber-300">
                        Expandir / colapsar
                      </div>
                    </div>
                  </summary>
                  <div className="mt-5 grid gap-3 lg:grid-cols-3">
                    {[
                      { title: item.morning.label ?? 'Mañana', block: item.morning },
                      { title: item.afternoon.label ?? 'Tarde', block: item.afternoon },
                      { title: item.evening.label ?? 'Noche', block: item.evening },
                    ].map(({ title, block }) => (
                      <div
                        key={title}
                        className="rounded-2xl border border-white/8 bg-black/10 p-4"
                      >
                        <div className="text-sm font-medium text-white">{title}</div>
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
                        <CheckCircle2 className="h-4 w-4 text-amber-300" /> Tips operativos
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
              <h2 className="text-lg font-semibold">Presupuesto</h2>
            </div>
            <div className="overflow-hidden rounded-3xl border border-white/8 bg-white/3">
              <div className="hidden grid-cols-[1.3fr_0.7fr_0.5fr_1fr] gap-4 border-b border-white/8 px-5 py-3 text-xs uppercase tracking-[0.24em] text-white/40 md:grid">
                <div>Concepto</div>
                <div>Monto</div>
                <div>Estatus</div>
                <div>Nota</div>
              </div>
              <div className="divide-y divide-white/8">
                {trip.budgetBreakdown.map((item) => {
                  const status = budgetStatusMeta[item.status];
                  return (
                    <div
                      key={item.concept}
                      className="grid gap-2 px-5 py-4 md:grid-cols-[1.3fr_0.7fr_0.5fr_1fr] md:gap-4"
                    >
                      <div>
                        <div className="text-xs uppercase tracking-[0.22em] text-white/35 md:hidden">
                          Concepto
                        </div>
                        <div className="text-sm font-medium text-white">{item.concept}</div>
                      </div>
                      <div>
                        <div className="text-xs uppercase tracking-[0.22em] text-white/35 md:hidden">
                          Monto
                        </div>
                        <div className="text-sm text-white/75">{item.amount}</div>
                      </div>
                      <div>
                        <div className="text-xs uppercase tracking-[0.22em] text-white/35 md:hidden">
                          Estatus
                        </div>
                        <div className={`text-sm ${status.className}`}>
                          {status.icon} {status.label}
                        </div>
                      </div>
                      <div>
                        <div className="text-xs uppercase tracking-[0.22em] text-white/35 md:hidden">
                          Nota
                        </div>
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
                ['Cómodo', trip.budgetSummary.comfortable],
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
              <MapPin className="h-5 w-5 text-amber-300" />
              <h2 className="text-lg font-semibold">Restaurantes</h2>
            </div>
            <div className="grid gap-4 lg:grid-cols-2">
              {restaurantGroups.map(([zone, restaurants]) => (
                <div key={zone} className="rounded-3xl border border-white/8 bg-white/4 p-5">
                  <div className="text-sm font-semibold text-white">{zone}</div>
                  <div className="mt-4 space-y-3">
                    {restaurants.map((restaurant) => (
                      <div
                        key={restaurant.name}
                        className="rounded-2xl border border-white/8 bg-black/10 p-4"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <div className="text-sm font-medium text-white">{restaurant.name}</div>
                            <p className="mt-2 text-sm leading-6 text-white/60">
                              {restaurant.description}
                            </p>
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
        </div>

        <div className="space-y-6">
          {trip.accommodation ? (
            <Surface className="p-6">
              <div className="mb-5 flex items-center gap-3 text-white">
                <MapPin className="h-5 w-5 text-amber-300" />
                <h2 className="text-lg font-semibold">Hospedaje</h2>
              </div>
              <div className="space-y-4 text-sm text-white/70">
                <div>
                  <div className="text-white/40">Propiedad</div>
                  <div className="mt-1 text-base font-medium text-white">
                    {trip.accommodation.name}
                  </div>
                </div>
                <div>
                  <div className="text-white/40">Dirección</div>
                  <div className="mt-1 text-white">{trip.accommodation.address}</div>
                </div>
                {trip.accommodation.checkIn ? (
                  <div>
                    <div className="text-white/40">Check-in</div>
                    <div className="mt-1 text-white">{trip.accommodation.checkIn}</div>
                  </div>
                ) : null}
                {trip.accommodation.checkOut ? (
                  <div>
                    <div className="text-white/40">Check-out</div>
                    <div className="mt-1 text-white">{trip.accommodation.checkOut}</div>
                  </div>
                ) : null}
                {trip.accommodation.checkInMethod ? (
                  <div>
                    <div className="text-white/40">Método</div>
                    <div className="mt-1 text-white">{trip.accommodation.checkInMethod}</div>
                  </div>
                ) : null}
                {trip.accommodation.confirmationCode ? (
                  <div>
                    <div className="text-white/40">Confirmación</div>
                    <div className="mt-1 text-white">{trip.accommodation.confirmationCode}</div>
                  </div>
                ) : null}
                {trip.accommodation.host ? (
                  <div>
                    <div className="text-white/40">Host</div>
                    <div className="mt-1 text-white">{trip.accommodation.host}</div>
                  </div>
                ) : null}
                {trip.accommodation.totalPaid ? (
                  <div>
                    <div className="text-white/40">Pagado</div>
                    <div className="mt-1 text-white">{trip.accommodation.totalPaid}</div>
                  </div>
                ) : null}
              </div>
              <div className="mt-5 flex flex-wrap gap-3">
                {[
                  ['Google Maps', trip.accommodation.mapsHref],
                  ['Airbnb', trip.accommodation.airbnbHref],
                  ['Recibo', trip.accommodation.receiptHref],
                ]
                  .filter((item) => item[1])
                  .map(([label, href]) => (
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
          ) : null}

          {trip.accommodations?.length ? (
            <Surface className="p-6">
              <div className="mb-5 flex items-center gap-3 text-white">
                <MapPin className="h-5 w-5 text-amber-300" />
                <h2 className="text-lg font-semibold">Hospedaje</h2>
              </div>
              <div className="space-y-3">
                {trip.accommodations.map((item) => (
                  <div
                    key={item.label + item.value}
                    className="rounded-2xl border border-white/8 bg-white/4 p-4"
                  >
                    <div className="text-sm text-white/45">{item.label}</div>
                    <div className="mt-1 text-sm font-medium text-white">{item.value}</div>
                    {item.note ? (
                      <div className="mt-2 text-sm text-white/55">{item.note}</div>
                    ) : null}
                  </div>
                ))}
              </div>
            </Surface>
          ) : null}

          {trip.pickupPoints?.length ? (
            <Surface className="p-6">
              <div className="mb-5 flex items-center gap-3 text-white">
                <MapPin className="h-5 w-5 text-amber-300" />
                <h2 className="text-lg font-semibold">Puntos clave de ruta</h2>
              </div>
              <div className="space-y-3">
                {trip.pickupPoints.map((point) => (
                  <div
                    key={point.name + point.timing}
                    className="rounded-2xl border border-white/8 bg-white/4 p-4"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-sm font-medium text-white">{point.name}</div>
                        <div className="mt-2 text-sm text-white/60">{point.timing}</div>
                        <div className="mt-1 text-sm text-white/50">{point.address}</div>
                        {point.note ? (
                          <div className="mt-2 text-xs text-white/45">{point.note}</div>
                        ) : null}
                      </div>
                      {point.mapsHref ? (
                        <a
                          href={point.mapsHref}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex shrink-0 items-center gap-1 rounded-full border border-white/10 px-3 py-2 text-xs text-white/70 transition hover:border-amber-300/40 hover:text-white"
                        >
                          Maps <ArrowUpRight className="h-3.5 w-3.5" />
                        </a>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            </Surface>
          ) : null}

          <Surface className="p-6">
            <div className="mb-5 flex items-center gap-3 text-white">
              <CheckCircle2 className="h-5 w-5 text-amber-300" />
              <h2 className="text-lg font-semibold">Condiciones y notas</h2>
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
              <div className="text-sm font-medium text-white">Alertas / revisiones importantes</div>
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
              <Link2 className="h-5 w-5 text-amber-300" />
              <h2 className="text-lg font-semibold">Links clave</h2>
            </div>
            <div className="space-y-3">
              {trip.keyLinks.map((link) => (
                <a
                  key={link.label + link.note}
                  href={link.href}
                  target="_blank"
                  rel="noreferrer"
                  className="block rounded-2xl border border-white/8 bg-white/4 p-4 transition hover:border-amber-300/30 hover:bg-white/6"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="text-sm font-medium text-white">{link.label}</div>
                      {link.note ? (
                        <div className="mt-1 text-xs text-white/50">{link.note}</div>
                      ) : null}
                    </div>
                    <ArrowUpRight className="h-4 w-4 text-amber-300" />
                  </div>
                </a>
              ))}
            </div>
          </Surface>

          <Surface className="p-6">
            <div className="mb-5 flex items-center gap-3 text-white">
              <CheckCircle2 className="h-5 w-5 text-amber-300" />
              <h2 className="text-lg font-semibold">Pendientes</h2>
            </div>
            <ul className="space-y-3 text-sm text-white/70">
              {trip.todo.map((item) => (
                <li
                  key={item}
                  className="flex gap-3 rounded-2xl border border-white/8 bg-white/4 px-4 py-3"
                >
                  <span className="mt-0.5 text-amber-300">□</span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </Surface>
        </div>
      </div>
    </div>
  );
}
