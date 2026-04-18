'use client';

import Link from 'next/link';
import Image from 'next/image';
import { ArrowUpRight, Calendar, CheckCircle2, MapPin, Route, Users, Wallet } from 'lucide-react';
import { Surface } from '@/components/ui/surface';
import { TravelExpenseTracker } from '@/components/travel-expense-tracker';
import { type TravelTrip } from '@/data/site';

const budgetStatusMeta = {
  confirmed: { label: 'Confirmado', icon: '✅', className: 'text-emerald-300' },
  pending: { label: 'Pendiente', icon: '⏳', className: 'text-amber-300' },
  estimated: { label: 'Estimado', icon: '≈', className: 'text-sky-300' },
  optional: { label: 'Opcional', icon: '◌', className: 'text-white/55' },
} as const;

function googleMapsHref(query: string) {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}

function groupRestaurants(trip: TravelTrip) {
  return trip.restaurants.reduce<Record<string, typeof trip.restaurants>>((acc, restaurant) => {
    acc[restaurant.zone] ??= [];
    acc[restaurant.zone].push(restaurant);
    return acc;
  }, {});
}

export function TripShareView({ trip }: { trip: TravelTrip }) {
  const restaurantGroups = Object.entries(groupRestaurants(trip));

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-white">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-5 sm:px-6 sm:py-8 lg:px-8">
        <div className="flex items-center justify-between gap-4">
          <Link
            href="https://bsop.io"
            className="inline-flex items-center rounded-2xl border border-white/10 bg-white px-3 py-2 shadow-sm transition hover:border-amber-300/40"
            aria-label="Ir a BSOP"
          >
            <Image src="/logo-bsop.jpg" alt="BSOP" width={110} height={38} className="h-auto w-auto object-contain" priority />
          </Link>
          <div className="text-right text-xs uppercase tracking-[0.24em] text-white/40">Viaje compartido</div>
        </div>

        <Surface className="overflow-hidden border-white/8 bg-white/4 p-6 sm:p-8">
          <div className="grid gap-6 xl:grid-cols-[1.25fr_0.75fr]">
            <div>
              <div className="inline-flex rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1 text-xs font-medium text-emerald-300">
                {trip.status}
              </div>
              <h1 className="mt-4 text-3xl font-semibold tracking-tight text-white sm:text-4xl">{trip.name}</h1>
              <p className="mt-3 text-sm leading-7 text-white/60 sm:text-base">{trip.subtitle}</p>
              <p className="mt-4 max-w-3xl text-sm leading-7 text-white/65">{trip.summary}</p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
              {[
                { icon: Calendar, label: 'Fechas', value: `${trip.startDate} → ${trip.endDate}` },
                { icon: MapPin, label: 'Ubicación', value: trip.location },
                { icon: CheckCircle2, label: 'Estatus', value: trip.status },
                { icon: Users, label: 'Viajeros', value: `${trip.travelers} personas` },
              ].map((item) => (
                <div key={item.label} className="rounded-3xl border border-white/8 bg-black/20 p-4">
                  <div className="flex items-center gap-2 text-xs uppercase tracking-[0.24em] text-white/40">
                    <item.icon className="h-4 w-4 text-amber-300" />
                    {item.label}
                  </div>
                  <div className="mt-3 text-sm font-medium text-white">{item.value}</div>
                </div>
              ))}
            </div>
          </div>
        </Surface>

        <Surface className="border-white/8 bg-white/4 p-6">
          <div className="mb-5 flex items-center gap-3 text-white">
            <Calendar className="h-5 w-5 text-amber-300" />
            <h2 className="text-lg font-semibold">Itinerario</h2>
          </div>
          <div className="space-y-4">
            {trip.itinerary.map((item) => {
              const mapsQuery = item.route || `${trip.name} ${item.title} ${trip.location}`;
              return (
                <div key={item.day} className="rounded-3xl border border-white/8 bg-black/20 p-5">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <div className="text-xs uppercase tracking-[0.24em] text-amber-300">{item.day}</div>
                      <div className="mt-2 text-xl font-semibold text-white">{item.title}</div>
                      <div className="mt-1 text-sm text-white/50">{item.date}</div>
                      {item.route ? <div className="mt-3 text-sm text-white/60">{item.route}</div> : null}
                    </div>
                    <a
                      href={googleMapsHref(mapsQuery)}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-2 self-start rounded-full border border-white/10 px-4 py-2 text-xs text-white/75 transition hover:border-amber-300/40 hover:text-white"
                    >
                      Ver en Maps <ArrowUpRight className="h-3.5 w-3.5" />
                    </a>
                  </div>
                  <div className="mt-5 grid gap-3 md:grid-cols-3">
                    {[
                      { title: item.morning.label ?? 'Mañana', block: item.morning },
                      { title: item.afternoon.label ?? 'Tarde', block: item.afternoon },
                      { title: item.evening.label ?? 'Noche', block: item.evening },
                    ].map(({ title, block }) => (
                      <div key={title} className="rounded-2xl border border-white/8 bg-white/4 p-4">
                        <div className="text-sm font-medium text-white">{title}</div>
                        <p className="mt-3 text-sm leading-6 text-white/65">{block.summary}</p>
                        <ul className="mt-3 space-y-2 text-sm text-white/60">
                          {block.bullets.map((bullet) => (
                            <li key={bullet} className="flex gap-2"><span className="mt-1 text-amber-300">•</span><span>{bullet}</span></li>
                          ))}
                        </ul>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </Surface>

        {(trip.accommodation || trip.accommodations?.length) ? (
          <Surface className="border-white/8 bg-white/4 p-6">
            <div className="mb-5 flex items-center gap-3 text-white"><MapPin className="h-5 w-5 text-amber-300" /><h2 className="text-lg font-semibold">Hospedaje</h2></div>
            {trip.accommodation ? (
              <div className="space-y-4">
                <div className="rounded-3xl border border-white/8 bg-black/20 p-5">
                  <div className="text-lg font-semibold text-white">{trip.accommodation.name}</div>
                  <div className="mt-2 text-sm text-white/65">{trip.accommodation.address}</div>
                  <div className="mt-4 flex flex-wrap gap-3">
                    {[
                      ['Google Maps', trip.accommodation.mapsHref],
                      ['Airbnb', trip.accommodation.airbnbHref],
                      ['Recibo', trip.accommodation.receiptHref],
                    ].filter((item) => item[1]).map(([label, href]) => (
                      <a key={label} href={href} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/4 px-4 py-2 text-sm text-white/75 transition hover:border-amber-300/40 hover:text-white">{label} <ArrowUpRight className="h-4 w-4" /></a>
                    ))}
                  </div>
                  <ul className="mt-5 space-y-3 text-sm text-white/60">
                    {trip.accommodation.notes.map((note) => <li key={note} className="flex gap-2"><span className="mt-1 text-amber-300">•</span><span>{note}</span></li>)}
                  </ul>
                </div>
              </div>
            ) : null}

            {trip.accommodations?.length ? (
              <div className="grid gap-3 md:grid-cols-2">
                {trip.accommodations.map((item) => (
                  <div key={item.label + item.value} className="rounded-2xl border border-white/8 bg-black/20 p-4">
                    <div className="text-sm text-white/45">{item.label}</div>
                    <div className="mt-1 text-sm font-medium text-white">{item.value}</div>
                    {item.note ? <div className="mt-2 text-sm text-white/55">{item.note}</div> : null}
                  </div>
                ))}
              </div>
            ) : null}
          </Surface>
        ) : null}

        <Surface className="border-white/8 bg-white/4 p-6">
          <div className="mb-5 flex items-center gap-3 text-white"><MapPin className="h-5 w-5 text-amber-300" /><h2 className="text-lg font-semibold">Restaurantes</h2></div>
          <div className="grid gap-4 lg:grid-cols-2">
            {restaurantGroups.map(([zone, restaurants]) => (
              <div key={zone} className="rounded-3xl border border-white/8 bg-black/20 p-5">
                <div className="text-sm font-semibold text-white">{zone}</div>
                <div className="mt-4 space-y-3">
                  {restaurants.map((restaurant) => (
                    <div key={restaurant.name} className="rounded-2xl border border-white/8 bg-white/4 p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="text-sm font-medium text-white">{restaurant.name}</div>
                          <p className="mt-2 text-sm leading-6 text-white/60">{restaurant.description}</p>
                          {restaurant.note ? <div className="mt-2 text-xs text-white/45">{restaurant.note}</div> : null}
                        </div>
                        <a href={restaurant.mapsHref} target="_blank" rel="noreferrer" className="inline-flex shrink-0 items-center gap-1 rounded-full border border-white/10 px-3 py-2 text-xs text-white/70 transition hover:border-amber-300/40 hover:text-white">Maps <ArrowUpRight className="h-3.5 w-3.5" /></a>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </Surface>

        <Surface className="border-white/8 bg-white/4 p-6">
          <div className="mb-5 flex items-center gap-3 text-white"><Wallet className="h-5 w-5 text-amber-300" /><h2 className="text-lg font-semibold">Presupuesto</h2></div>
          <div className="overflow-hidden rounded-3xl border border-white/8 bg-black/20">
            <div className="hidden grid-cols-[1.3fr_0.7fr_0.5fr_1fr] gap-4 border-b border-white/8 px-5 py-3 text-xs uppercase tracking-[0.24em] text-white/40 md:grid">
              <div>Concepto</div><div>Monto</div><div>Estatus</div><div>Nota</div>
            </div>
            <div className="divide-y divide-white/8">
              {trip.budgetBreakdown.map((item) => {
                const status = budgetStatusMeta[item.status];
                return (
                  <div key={item.concept} className="grid gap-2 px-5 py-4 md:grid-cols-[1.3fr_0.7fr_0.5fr_1fr] md:gap-4">
                    <div><div className="text-xs uppercase tracking-[0.22em] text-white/35 md:hidden">Concepto</div><div className="text-sm font-medium text-white">{item.concept}</div></div>
                    <div><div className="text-xs uppercase tracking-[0.22em] text-white/35 md:hidden">Monto</div><div className="text-sm text-white/75">{item.amount}</div></div>
                    <div><div className="text-xs uppercase tracking-[0.22em] text-white/35 md:hidden">Estatus</div><div className={`text-sm ${status.className}`}>{status.icon} {status.label}</div></div>
                    <div><div className="text-xs uppercase tracking-[0.22em] text-white/35 md:hidden">Nota</div><div className="text-sm text-white/55">{item.note}</div></div>
                  </div>
                );
              })}
            </div>
          </div>
        </Surface>

        <div>
          <div className="mb-4 flex items-center gap-3 text-white"><Wallet className="h-5 w-5 text-amber-300" /><h2 className="text-lg font-semibold">Gastos compartidos</h2></div>
          <TravelExpenseTracker
            tripSlug={trip.slug}
            tripName={trip.name}
            defaultCurrency={trip.defaultCurrency}
            defaultExchangeRate={trip.defaultExchangeRate}
            participantPresets={trip.participantPresets}
            shareMode
          />
        </div>

        <Surface className="border-white/8 bg-white/4 p-6">
          <div className="mb-5 flex items-center gap-3 text-white"><CheckCircle2 className="h-5 w-5 text-amber-300" /><h2 className="text-lg font-semibold">Pendientes</h2></div>
          <ul className="space-y-3 text-sm text-white/70">
            {trip.todo.map((item) => <li key={item} className="flex gap-3 rounded-2xl border border-white/8 bg-black/20 px-4 py-3"><span className="mt-0.5 text-amber-300">□</span><span>{item}</span></li>)}
          </ul>
        </Surface>
      </div>
    </div>
  );
}
