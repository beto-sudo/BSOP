export type TravelBudgetStatus = 'confirmed' | 'pending' | 'estimated' | 'optional';

export type TravelLink = {
  label: string;
  href: string;
  note?: string;
};

export type TravelTimeBlock = {
  label?: string;
  summary: string;
  bullets: string[];
};

export type TravelDay = {
  day: string;
  date: string;
  title: string;
  route?: string;
  focus?: string;
  morning: TravelTimeBlock;
  afternoon: TravelTimeBlock;
  evening: TravelTimeBlock;
  tips?: string[];
};

export type TravelRestaurant = {
  name: string;
  zone: 'Ski valley' | 'Taos town';
  description: string;
  note?: string;
  mapsHref: string;
  websiteHref?: string;
};

export type TravelBudgetLine = {
  concept: string;
  amount: string;
  status: TravelBudgetStatus;
  note?: string;
};

export type TravelLiftTicketLine = {
  category: string;
  weekday: string;
  weekend: string;
  note: string;
};

export type TravelTrip = {
  slug: string;
  name: string;
  subtitle: string;
  status: string;
  startDate: string;
  endDate: string;
  location: string;
  travelers: number;
  nights: number;
  route: string;
  objective: string;
  summary: string;
  highlights: string[];
  quickStats: { label: string; value: string; note?: string }[];
  accommodation: {
    name: string;
    address: string;
    host: string;
    hostPhone: string;
    totalPaid: string;
    checkIn: string;
    checkOut: string;
    checkInMethod: string;
    confirmationCode: string;
    mapsHref: string;
    airbnbHref: string;
    receiptHref: string;
    notes: string[];
  };
  pickupPoints: {
    name: string;
    timing: string;
    address: string;
    mapsHref: string;
    note?: string;
  }[];
  budgetSummary: {
    base: string;
    comfortable: string;
    premium: string;
    perPersonComfortable: string;
  };
  budgetBreakdown: TravelBudgetLine[];
  itinerary: TravelDay[];
  restaurants: TravelRestaurant[];
  conditions: {
    summary: string;
    bullets: string[];
    warnings: string[];
  };
  operationalTips: string[];
  liftTickets: {
    recommendation: string;
    lines: TravelLiftTicketLine[];
    notes: string[];
    familyEstimate: string;
  };
  keyLinks: TravelLink[];
  todo: string[];
};

export type CodaDoc = {
  slug: string;
  name: string;
  docId: string;
  type: string;
  tables: number;
  lastAudit: string;
  pages: number;
  columns: number;
  healthScore: number;
  status: string;
  note: string;
  riskTables: string[];
};

export const personalContext = {
  title: 'Beto Santos Operations Platform',
  short: 'BSOP',
  strapline:
    'A personal command center for travel, systems, agent operations, and the operating rhythm behind Beto Santos.',
  lastUpdated: '2026-03-23 00:31 CDT',
};

export const travelTrips: TravelTrip[] = [
  {
    slug: 'taos-ski-trip',
    name: 'Taos Ski Trip',
    subtitle: 'Family ski escape via Lubbock',
    status: 'Ready',
    startDate: '2026-04-01',
    endDate: '2026-04-05',
    location: 'Taos Ski Valley, New Mexico',
    travelers: 5,
    nights: 4,
    route: 'PN → Lubbock → Taos Ski Valley',
    objective: 'Ski-in / ski-out family setup with low-friction mountain logistics.',
    summary:
      'A premium-but-practical family ski plan designed around simple logistics, early mountain starts, and a slope-adjacent condo that reduces daily friction.',
    highlights: [
      'Airbnb confirmed and fully paid for all 4 nights',
      'Morning-first ski strategy to match spring snow conditions',
      'Lubbock pickup/drop-off already baked into both travel days',
      'Flexible Saturday plan depending on snow quality and family energy',
    ],
    quickStats: [
      { label: 'Travelers', value: '5 people', note: 'Beto + Graciela + 3 hijos' },
      { label: 'Stay', value: '4 nights', note: 'Apr 1 → Apr 5' },
      { label: 'Objective', value: 'Ski-in / ski-out', note: 'Lower daily friction' },
      { label: 'Route', value: 'PN → Lubbock → Taos', note: 'Driving plan locked' },
    ],
    accommodation: {
      name: 'Lake Fork Condos, Unit 6',
      address: '10 Ernie Blake Road, Unit 6, Taos Ski Valley, NM 87525',
      host: 'Mark Holt',
      hostPhone: '+1 (512) 695-3501',
      totalPaid: '$2,072.31 USD',
      checkIn: 'Wed Apr 1 · 4:00 PM',
      checkOut: 'Sun Apr 5 · 10:00 AM',
      checkInMethod: 'Keypad (full instructions inside Airbnb House Manual)',
      confirmationCode: 'HMJA2BQDMW',
      mapsHref:
        'https://www.google.com/maps/search/?api=1&query=36.59413528442383%2C-105.44747161865234',
      airbnbHref: 'https://www.airbnb.com/rooms/51623904',
      receiptHref: 'https://www.airbnb.com/receipt/RCP3MQ4MKE',
      notes: [
        'Reservation captured as CONFIRMED via Relay.',
        'Co-hosts listed: Julie and Mallory.',
        'Review Wi‑Fi, access, and house rules 48h before arrival for any last-minute changes.',
      ],
    },
    pickupPoints: [
      {
        name: 'The Carlton House · Pickup',
        timing: 'Wed Apr 1 · target arrival 1:15 PM · depart 1:45 PM',
        address: '303 Detroit Ave, Lubbock, TX 79415',
        mapsHref:
          'https://www.google.com/maps/search/?api=1&query=The+Carlton+House%2C+303+Detroit+Ave%2C+Lubbock%2C+TX+79415',
        note: 'Target stop duration: 20–30 minutes with bags already sorted by person.',
      },
      {
        name: 'The Carlton House · Drop-off',
        timing: 'Sun Apr 5 · ETA 1:45 PM · depart 2:15 PM',
        address: '303 Detroit Ave, Lubbock, TX 79415',
        mapsHref:
          'https://www.google.com/maps/search/?api=1&query=The+Carlton+House%2C+303+Detroit+Ave%2C+Lubbock%2C+TX+79415',
        note: 'Planned drop-off for Alex and Beto before continuing back to PN.',
      },
    ],
    budgetSummary: {
      base: '$5,172 USD',
      comfortable: '$6,072 USD',
      premium: '$7,322 USD',
      perPersonComfortable: '$1,214.40 USD',
    },
    budgetBreakdown: [
      {
        concept: 'Hospedaje Airbnb (4 noches)',
        amount: '$2,072.31',
        status: 'confirmed',
        note: 'Pagado y confirmado.',
      },
      {
        concept: 'Lift tickets (2 días, compra online anticipada)',
        amount: '$1,050 – $1,250',
        status: 'pending',
        note: 'Mayor ahorro inmediato; ideal comprarlos 3–7 días antes.',
      },
      {
        concept: 'Renta de equipo (si 3–5 rentan, 2 días)',
        amount: '$450 – $900',
        status: 'pending',
        note: 'Falta definir exactamente quién renta y tallas.',
      },
      {
        concept: 'Clases (1 sesión grupal/familiar)',
        amount: '$250 – $600',
        status: 'optional',
        note: 'Solo si conviene para día 1 de adaptación.',
      },
      {
        concept: 'Gasolina + casetas (ruta redonda vía Lubbock)',
        amount: '$450 – $700',
        status: 'estimated',
        note: 'Incluye ida y vuelta con paradas técnicas.',
      },
      {
        concept: 'Comidas y cafés (5 personas / 5 días)',
        amount: '$700 – $1,300',
        status: 'pending',
        note: 'Depende de mezcla entre restaurantes y cocina parcial en condo.',
      },
      {
        concept: 'Extras / imprevistos',
        amount: '$250 – $500',
        status: 'estimated',
        note: 'Bolsa recomendada para clima, snacks, pequeños cambios de plan.',
      },
      {
        concept: 'Total estimado viaje',
        amount: '$5,172 – $7,322',
        status: 'estimated',
        note: 'Rango actual del viaje completo.',
      },
    ],
    itinerary: [
      {
        day: 'Day 1',
        date: 'Wed Apr 1',
        title: 'Transfer day + Lubbock pickup',
        route: 'PN → The Carlton House (Lubbock) → Taos Ski Valley',
        focus: 'Reach condo same night without burning too much energy.',
        morning: {
          label: 'Morning',
          summary: 'Early departure block from PN.',
          bullets: [
            'Suggested departure from PN: 5:30 AM.',
            'Leave with full tank and light breakfast already handled.',
            'Keep mountain gear and cold-weather layers accessible, not buried in luggage.',
          ],
        },
        afternoon: {
          label: 'Afternoon',
          summary: 'Lubbock pickup and fast turnover.',
          bullets: [
            'Suggested arrival to The Carlton House: 1:15 PM.',
            'Suggested departure from Lubbock: 1:45 PM.',
            'If timing breaks down materially, safe fallback is sleeping in Lubbock and pushing Thursday morning.',
          ],
        },
        evening: {
          label: 'Evening',
          summary: 'Final push into Taos Ski Valley.',
          bullets: [
            'Estimated arrival to Taos Ski Valley: around 8:45 PM with one technical stop.',
            'Keep dinner simple on arrival and prioritize getting settled fast.',
            'Review access instructions before losing signal in the mountain zone.',
          ],
        },
        tips: [
          'Organize bags by person before the pickup to keep Lubbock stop under 30 minutes.',
          'Check mountain weather 48 hours before departure.',
          'Carry chains or snow socks as a readiness item even if not expected to use them.',
        ],
      },
      {
        day: 'Day 2',
        date: 'Thu Apr 2',
        title: 'Day 1 on the mountain',
        focus: 'Adaptation day with family rhythm over heroics.',
        morning: {
          label: 'Morning',
          summary: 'Rental + lesson + best snow window.',
          bullets: [
            'Rent gear early for anyone who needs it.',
            'Book a lesson for whoever needs a confidence reset or first-day structure.',
            'Target ski window: 9:00 AM to 1:00 PM for firmer spring snow.',
          ],
        },
        afternoon: {
          label: 'Afternoon',
          summary: 'Ease off before conditions get heavy.',
          bullets: [
            'Come off the mountain before overextending into slush-heavy afternoon snow.',
            'Reset at the condo or hot tub instead of forcing a full-day push.',
            'Walk the village casually if energy is still good.',
          ],
        },
        evening: {
          label: 'Evening',
          summary: 'Simple recovery block.',
          bullets: [
            'Dinner early and keep the night low-friction.',
            'Prep gloves, layers, and snacks for the stronger Friday ski day.',
            'Quick family alignment on ability split for tomorrow.',
          ],
        },
        tips: [
          'Day 1 is about adaptation, not mileage.',
          'If anyone is struggling, protect the trip by solving it early with lessons or lighter terrain.',
        ],
      },
      {
        day: 'Day 3',
        date: 'Fri Apr 3',
        title: 'Strongest ski day',
        focus: 'Use the best snow hours aggressively and keep operations simple.',
        morning: {
          label: 'Morning',
          summary: 'Primary performance window.',
          bullets: [
            'Front-load the day around the best morning snow.',
            'Split by ability level if needed and set a clean regroup point for lunch.',
            'Prioritize open terrain while surfaces are still in their best shape.',
          ],
        },
        afternoon: {
          label: 'Afternoon',
          summary: 'Controlled second block.',
          bullets: [
            'Regroup for food and reassess energy instead of mindlessly extending.',
            'Pick terrain based on who still has legs and confidence.',
            'If snow softens too much, pull back rather than grind through it.',
          ],
        },
        evening: {
          label: 'Evening',
          summary: 'Wrap with a family moment.',
          bullets: [
            'Take a family photo in the base area near close.',
            'Keep dinner easy and recovery-oriented.',
            'Use evening check-in to decide whether Saturday is ski half-day or Taos town plan.',
          ],
        },
        tips: [
          'This is the highest-value ski day of the trip.',
          'Don’t waste prime snow time on slow-moving logistics.',
        ],
      },
      {
        day: 'Day 4',
        date: 'Sat Apr 4',
        title: 'Half-day ski + flexible afternoon',
        focus: 'Protect energy and adapt to actual snow quality.',
        morning: {
          label: 'Morning',
          summary: 'Plan A = ski window.',
          bullets: [
            'If snow is good, ski from 9:00 AM to 12:30 PM.',
            'Use this as a lighter, cleaner session rather than a grind.',
            'Keep exit timing disciplined to preserve the rest of the day.',
          ],
        },
        afternoon: {
          label: 'Afternoon',
          summary: 'Plan B = Taos town fallback or recovery.',
          bullets: [
            'If conditions fade, pivot to Taos Plaza and local food.',
            'Alternative: full rest block at condo to simplify Sunday departure.',
            'This is the natural slot for any non-ski family activity.',
          ],
        },
        evening: {
          label: 'Evening',
          summary: 'Departure prep night.',
          bullets: [
            'Pack luggage and stage gear the night before.',
            'Set aside a simple road breakfast or lunch plan.',
            'Avoid a late night so Sunday departure can actually happen at target time.',
          ],
        },
        tips: [
          'Saturday should feel flexible, not obligated.',
          'The best operational move may be stopping early and preparing for the drive.',
        ],
      },
      {
        day: 'Day 5',
        date: 'Sun Apr 5',
        title: 'Return via Lubbock',
        route: 'Taos Ski Valley → The Carlton House → PN',
        focus: 'Leave on time and avoid arriving too late back home.',
        morning: {
          label: 'Morning',
          summary: 'Early checkout block.',
          bullets: [
            'Suggested departure from Taos Ski Valley: 7:00 AM.',
            'Checkout should already be solved the night before.',
            'Use a quick, disciplined loading sequence to avoid a slow start.',
          ],
        },
        afternoon: {
          label: 'Afternoon',
          summary: 'Lubbock drop-off transition.',
          bullets: [
            'Estimated arrival to Lubbock: around 1:45 PM.',
            'Drop-off point remains The Carlton House at 303 Detroit Ave.',
            'Suggested departure from Lubbock to PN: 2:15 PM.',
          ],
        },
        evening: {
          label: 'Evening',
          summary: 'Final drive into PN.',
          bullets: [
            'Estimated arrival to PN: around 9:45 PM.',
            'Recommended stop pattern: two short technical stops plus one light meal stop.',
            'Avoid any late-day drift by keeping lunch and fuel decisions simple.',
          ],
        },
        tips: [
          'Leave luggage and road snacks ready the night before.',
          'A punctual start is the main lever for not finishing the trip exhausted.',
        ],
      },
    ],
    restaurants: [
      {
        name: 'The Bavarian',
        zone: 'Ski valley',
        description: 'Classic Taos Ski Valley option with a family-friendly lodge feel.',
        mapsHref: 'https://www.google.com/maps/search/?api=1&query=The+Bavarian+Taos+Ski+Valley',
        websiteHref: 'https://taosskivalley.com/explore/dining/',
      },
      {
        name: 'Hondo Restaurant',
        zone: 'Ski valley',
        description: 'Comfortable sit-down dinner option near the mountain base.',
        mapsHref: 'https://www.google.com/maps/search/?api=1&query=Hondo+Restaurant+Taos+Ski+Valley',
      },
      {
        name: 'Pizza Shack',
        zone: 'Ski valley',
        description: 'Quick and practical with kids when nobody wants a long dinner.',
        mapsHref: 'https://www.google.com/maps/search/?api=1&query=Pizza+Shack+Taos+Ski+Valley',
      },
      {
        name: "Tim’s Stray Dog Cantina",
        zone: 'Ski valley',
        description: 'Casual fallback with easier group energy than a formal dinner.',
        mapsHref: 'https://www.google.com/maps/search/?api=1&query=Tim%27s+Stray+Dog+Cantina+Taos+Ski+Valley',
      },
      {
        name: 'Orlando’s',
        zone: 'Taos town',
        description: 'Classic New Mexican stop if the family heads down into town.',
        mapsHref: 'https://www.google.com/maps/search/?api=1&query=Orlando%27s+Taos+NM',
      },
      {
        name: 'Michael’s Kitchen',
        zone: 'Taos town',
        description: 'Traditional, reliable, and good for big portions.',
        mapsHref: 'https://www.google.com/maps/search/?api=1&query=Michael%27s+Kitchen+Taos+NM',
      },
      {
        name: 'The Alley Cantina',
        zone: 'Taos town',
        description: 'Town option with more atmosphere if they want a lively stop.',
        mapsHref: 'https://www.google.com/maps/search/?api=1&query=The+Alley+Cantina+Taos+NM',
      },
      {
        name: 'Taos Mesa Brewing',
        zone: 'Taos town',
        description: 'Casual group-friendly option with easy family logistics.',
        mapsHref: 'https://www.google.com/maps/search/?api=1&query=Taos+Mesa+Brewing+Taos+NM',
      },
    ],
    conditions: {
      summary: 'Spring conditions are likely: best skiing in the morning, heavier snow later in the day.',
      bullets: [
        'Recent reported base reference: about 41” at upper elevation (Lift 7) and about 37” in the mid-high zone (Shalako Gully).',
        'Historical early-April reference sits around 33–35” average top/base, with variance from late-season storms.',
        'Expected snow type for Apr 1–5: spring conditions — firmer in the morning, softer corn/slush in the afternoon.',
        'Expected ski quality: good to very good in the morning; heavier later depending on temperature and sun exposure.',
      ],
      warnings: [
        'Verify resort operations before any non-refundable spend because some sources project closing around the first week of April.',
        'Operational recommendation: prioritize skiing from 9:00 AM to 1:00 PM.',
      ],
    },
    operationalTips: [
      'Buy lift tickets online in advance — dynamic pricing usually beats walk-up by roughly 10%–25%.',
      'Decide early who is renting gear so sizing and reservation can be handled before arrival chaos.',
      'Condo cooking for part of the trip is the cleanest lever to control food spend.',
      'Protect the return drive by packing Saturday night instead of “mañana” optimism.',
    ],
    liftTickets: {
      recommendation:
        'Yes — buy online ahead of time. Taos uses dynamic pricing and online nearly always beats walk-up, especially if purchased 3+ days early.',
      lines: [
        {
          category: 'Adult (18–64)',
          weekday: '$130',
          weekend: '$140',
          note: 'Reference walk-up pricing.',
        },
        {
          category: 'Junior (13–17)',
          weekday: '$115',
          weekend: '$125',
          note: 'Reference walk-up pricing.',
        },
        {
          category: 'Child (7–12)',
          weekday: '$85',
          weekend: '$95',
          note: 'Reference walk-up pricing.',
        },
        {
          category: 'Senior (65–79)',
          weekday: '$115',
          weekend: '$125',
          note: 'Reference walk-up pricing.',
        },
        {
          category: 'Child (0–6)',
          weekday: 'Free',
          weekend: 'Free',
          note: 'With paid adult.',
        },
        {
          category: 'Senior (80+)',
          weekday: 'Free',
          weekend: 'Free',
          note: 'Any day.',
        },
      ],
      notes: [
        'Prices remain subject to change based on date and demand.',
        'On dynamic pricing seasons, online purchase can save roughly 10%–25% versus walk-up.',
        'Verify current pricing before paying via SkiTaos official site or OnTheSnow reference.',
      ],
      familyEstimate:
        'If 5 people each pay a reference adult-equivalent ticket for 2 ski days, the working range is about $1,300–$1,400 before discounts.',
    },
    keyLinks: [
      {
        label: 'Accommodation map',
        href: 'https://www.google.com/maps/search/?api=1&query=36.59413528442383%2C-105.44747161865234',
        note: 'Exact condo location',
      },
      {
        label: 'Lubbock pickup / drop-off map',
        href: 'https://www.google.com/maps/search/?api=1&query=The+Carlton+House%2C+303+Detroit+Ave%2C+Lubbock%2C+TX+79415',
        note: 'The Carlton House',
      },
      {
        label: 'SkiTaos official',
        href: 'https://www.skitaos.com/',
      },
      {
        label: 'SkiTaos snow report',
        href: 'https://www.skitaos.com/weather-snow-report/',
      },
      {
        label: 'OnTheSnow resort reference',
        href: 'https://www.onthesnow.com/new-mexico/taos-ski-valley/ski-resort',
      },
      {
        label: 'OnTheSnow lift tickets',
        href: 'https://www.onthesnow.com/new-mexico/taos-ski-valley/lift-tickets',
      },
      {
        label: 'Airbnb listing',
        href: 'https://www.airbnb.com/rooms/51623904',
        note: 'Listing #51623904',
      },
      {
        label: 'Airbnb receipt',
        href: 'https://www.airbnb.com/receipt/RCP3MQ4MKE',
        note: 'Receipt RCP3MQ4MKE',
      },
    ],
    todo: [
      'Comprar lift tickets online idealmente 3–7 días antes.',
      'Definir exactamente quién renta equipo y reservar tallas.',
      'Confirmar si habrá clase el primer día para bloquear horario.',
      'Revisar 48h antes clima, nieve y terreno abierto.',
      'Cerrar estrategia de comidas: restaurantes vs cocina parcial en condo.',
    ],
  },
];

export const codaDocs: CodaDoc[] = [
  {
    slug: 'dilesa',
    name: 'DILESA',
    docId: 'ZNxWl_DI2D',
    type: 'real-estate-developer',
    tables: 286,
    lastAudit: '2026-03-12',
    pages: 274,
    columns: 4444,
    healthScore: 0.6,
    status: 'Stable foundation · scale complexity',
    note: 'The largest operating model in the stack — broad, mature, and structurally ambitious.',
    riskTables: ['Clientes', 'Inscrita', 'Asignada'],
  },
  {
    slug: 'ansa',
    name: 'ANSA',
    docId: 'pnqM3j0Yal',
    type: 'automotive-dealership',
    tables: 59,
    lastAudit: '2026-03-14',
    pages: 76,
    columns: 757,
    healthScore: 0.3,
    status: 'Lean doc · HR tables need attention',
    note: 'Compact dealership operating core with a few concentrated risk tables around personnel workflows.',
    riskTables: ['Personal', 'Alta Personal Autos del Norte S.A. de C.V.', 'Ex-Empleados'],
  },
  {
    slug: 'ansa-ventas',
    name: 'ANSA-Ventas',
    docId: 'vVmCl2wBfC',
    type: 'automotive-dealership',
    tables: 77,
    lastAudit: '2026-03-14',
    pages: 74,
    columns: 935,
    healthScore: 0.3,
    status: 'Commercial engine · customer table is the hotspot',
    note: 'Sales-specific operating layer with most of the system healthy and one meaningful concentration of complexity.',
    riskTables: ['Cliente', 'Avanzadas', 'Facturas Venta Unidades'],
  },
  {
    slug: 'sr-group',
    name: 'SR Group',
    docId: 'MaXoDlRxXE',
    type: 'family-wealth-hub',
    tables: 58,
    lastAudit: '2026-03-15',
    pages: 43,
    columns: 505,
    healthScore: 0.1,
    status: 'Cleanest architecture in the set',
    note: 'A lightweight patrimonial control hub with very low structural friction and strong clarity.',
    riskTables: ['Tipo de Ingreso', 'Movimientos Banamex'],
  },
  {
    slug: 'rdb',
    name: 'RDB',
    docId: 'yvrM3UilPt',
    type: 'sports-club',
    tables: 59,
    lastAudit: '2026-03-16',
    pages: 57,
    columns: 733,
    healthScore: 0.2,
    status: 'Operationally sharp · checkout workflows to watch',
    note: 'Sports-club system with solid health overall and a few operational tables carrying extra weight.',
    riskTables: ['Cortes de Caja', 'Pedidos Waitry', 'Requisiciones de Compra'],
  },
];

export const navItems = [
  { href: '/', label: 'Overview' },
  { href: '/travel', label: 'Travel' },
  { href: '/coda', label: 'Coda Architect' },
  { href: '/usage', label: 'Usage' },
  { href: '/agents', label: 'Agents' },
];
