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

export type TravelBudgetLine = {
  concept: string;
  amount: string;
  status: TravelBudgetStatus;
  note?: string;
};

export type TravelRestaurant = {
  name: string;
  zone: string;
  description: string;
  note?: string;
  mapsHref: string;
};

export type TravelAccommodation = {
  name: string;
  address: string;
  host?: string;
  hostPhone?: string;
  totalPaid?: string;
  checkIn?: string;
  checkOut?: string;
  checkInMethod?: string;
  confirmationCode?: string;
  mapsHref?: string;
  airbnbHref?: string;
  receiptHref?: string;
  notes: string[];
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
  travelerNames: string[];
  style: string;
  route: string;
  objective: string;
  summary: string;
  highlights: string[];
  quickStats: { label: string; value: string; note?: string }[];
  participantPresets?: { name: string; emoji?: string }[];
  defaultCurrency: 'MXN' | 'USD';
  defaultExchangeRate: number;
  accommodation?: TravelAccommodation;
  accommodations?: Array<{ label: string; value: string; note?: string }>;
  pickupPoints?: {
    name: string;
    timing: string;
    address: string;
    mapsHref?: string;
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
    'Centro de mando personal para viajes, sistemas, operaciones de agentes y el ritmo operativo detrás de Beto Santos.',
  lastUpdated: '2026-03-23 17:55 CDT',
};

export const travelTrips: TravelTrip[] = [
  {
    slug: 'taos-ski-trip',
    name: 'Taos Ski Trip',
    subtitle: 'Escapada familiar de ski vía Lubbock',
    status: 'Listo',
    startDate: '2026-04-01',
    endDate: '2026-04-05',
    location: 'Taos Ski Valley, Nuevo México',
    travelers: 5,
    travelerNames: ['Beto', 'Graciela', '3 hijos'],
    style: 'Familiar · ski',
    route: 'PN → Lubbock → Taos Ski Valley',
    objective: 'Setup ski-in / ski-out familiar con logística simple y fricción mínima.',
    summary:
      'Plan familiar premium-práctico centrado en mañanas fuertes en la montaña, condo a pie de pista y una operación cómoda tanto en desktop como en teléfono.',
    highlights: [
      'Airbnb confirmado y pagado para las 4 noches',
      'Estrategia de ski enfocada en mañanas por condiciones de nieve de primavera',
      'Pickup y drop-off en Lubbock ya integrados en ambos días de traslado',
      'Sábado flexible según nieve, energía familiar y clima real',
    ],
    quickStats: [
      { label: 'Participantes', value: '5 personas', note: 'Beto + Graciela + 3 hijos' },
      { label: 'Hospedaje', value: '4 noches', note: '1 abr → 5 abr' },
      { label: 'Objetivo', value: 'Ski-in / ski-out', note: 'Menos fricción diaria' },
      { label: 'Ruta', value: 'PN → Lubbock → Taos', note: 'Plan terrestre definido' },
    ],
    participantPresets: [
      { name: 'Beto', emoji: '🦞' },
      { name: 'Graciela', emoji: '✨' },
      { name: 'Alex', emoji: '🎿' },
      { name: 'Hijo 2', emoji: '🏔️' },
      { name: 'Hijo 3', emoji: '❄️' },
    ],
    defaultCurrency: 'USD',
    defaultExchangeRate: 18,
    accommodation: {
      name: 'Lake Fork Condos, Unit 6',
      address: '10 Ernie Blake Road, Unit 6, Taos Ski Valley, NM 87525',
      host: 'Mark Holt',
      hostPhone: '+1 (512) 695-3501',
      totalPaid: '$2,072.31 USD',
      checkIn: 'Mié 1 abr · 4:00 PM',
      checkOut: 'Dom 5 abr · 10:00 AM',
      checkInMethod: 'Keypad (instrucciones completas en Airbnb House Manual)',
      confirmationCode: 'HMJA2BQDMW',
      mapsHref:
        'https://www.google.com/maps/search/?api=1&query=36.59413528442383%2C-105.44747161865234',
      airbnbHref: 'https://www.airbnb.com/rooms/51623904',
      receiptHref: 'https://www.airbnb.com/receipt/RCP3MQ4MKE',
      notes: [
        'Reserva capturada como confirmada.',
        'Co-hosts listados: Julie y Mallory.',
        'Revisar Wi-Fi, acceso y house rules 48h antes de llegar.',
      ],
    },
    pickupPoints: [
      {
        name: 'The Carlton House · Pickup',
        timing: 'Mié 1 abr · llegada objetivo 1:15 PM · salida 1:45 PM',
        address: '303 Detroit Ave, Lubbock, TX 79415',
        mapsHref:
          'https://www.google.com/maps/search/?api=1&query=The+Carlton+House%2C+303+Detroit+Ave%2C+Lubbock%2C+TX+79415',
        note: 'Meta: stop de 20–30 min con equipaje ya separado por persona.',
      },
      {
        name: 'The Carlton House · Drop-off',
        timing: 'Dom 5 abr · ETA 1:45 PM · salida 2:15 PM',
        address: '303 Detroit Ave, Lubbock, TX 79415',
        mapsHref:
          'https://www.google.com/maps/search/?api=1&query=The+Carlton+House%2C+303+Detroit+Ave%2C+Lubbock%2C+TX+79415',
        note: 'Drop-off planeado antes de continuar a PN.',
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
        concept: 'Lift tickets (2 días)',
        amount: '$1,050 – $1,250',
        status: 'pending',
        note: 'Mejor comprarlos 3–7 días antes.',
      },
      {
        concept: 'Renta de equipo',
        amount: '$450 – $900',
        status: 'pending',
        note: 'Falta definir quién renta y tallas.',
      },
      {
        concept: 'Clases',
        amount: '$250 – $600',
        status: 'optional',
        note: 'Solo si conviene para día 1.',
      },
      {
        concept: 'Gasolina + casetas',
        amount: '$450 – $700',
        status: 'estimated',
        note: 'Ruta redonda vía Lubbock.',
      },
      {
        concept: 'Comidas y cafés',
        amount: '$700 – $1,300',
        status: 'pending',
        note: 'Depende de mezcla entre restaurantes y condo.',
      },
      {
        concept: 'Extras / imprevistos',
        amount: '$250 – $500',
        status: 'estimated',
        note: 'Bolsa sugerida para clima y cambios.',
      },
    ],
    itinerary: [
      {
        day: 'Día 1',
        date: 'Mié 1 abr',
        title: 'Traslado + pickup en Lubbock',
        route: 'PN → The Carlton House → Taos Ski Valley',
        focus: 'Llegar al condo esa noche sin gastar energía de más.',
        morning: {
          summary: 'Salida temprana desde PN.',
          bullets: [
            'Salir con tanque lleno.',
            'Desayuno resuelto antes de arrancar.',
            'Llevar equipo de frío accesible.',
          ],
        },
        afternoon: {
          summary: 'Pickup rápido en Lubbock.',
          bullets: [
            'Llegada sugerida 1:15 PM.',
            'Salida sugerida 1:45 PM.',
            'Fallback seguro: dormir en Lubbock si se rompe el timing.',
          ],
        },
        evening: {
          summary: 'Empuje final hacia Taos.',
          bullets: [
            'Llegada estimada 8:45 PM.',
            'Cena simple al llegar.',
            'Revisar acceso antes de perder señal.',
          ],
        },
        tips: [
          'Separar maletas por persona antes del pickup.',
          'Revisar clima de montaña 48h antes.',
        ],
      },
      {
        day: 'Día 2',
        date: 'Jue 2 abr',
        title: 'Primer día en la montaña',
        focus: 'Adaptación familiar antes que intensidad.',
        morning: {
          summary: 'Renta + posible clase + mejor ventana de nieve.',
          bullets: [
            'Rentar temprano.',
            'Clase para quien la necesite.',
            'Apuntar a 9:00 AM – 1:00 PM.',
          ],
        },
        afternoon: {
          summary: 'Bajar ritmo antes de la nieve pesada.',
          bullets: [
            'Regresar al condo o hot tub.',
            'No forzar día completo.',
            'Paseo por el village si hay energía.',
          ],
        },
        evening: {
          summary: 'Recuperación simple.',
          bullets: [
            'Cena temprano.',
            'Preparar guantes y snacks.',
            'Alinear grupos para el viernes.',
          ],
        },
      },
      {
        day: 'Día 3',
        date: 'Vie 3 abr',
        title: 'Mejor día de ski',
        focus: 'Exprimir las mejores horas de nieve con logística simple.',
        morning: {
          summary: 'Ventana de mayor valor.',
          bullets: [
            'Salir temprano.',
            'Agruparse por nivel si conviene.',
            'Priorizar terreno abierto temprano.',
          ],
        },
        afternoon: {
          summary: 'Segundo bloque controlado.',
          bullets: [
            'Reagrupar para comida.',
            'Decidir según energía real.',
            'Salir si la nieve se pone muy pesada.',
          ],
        },
        evening: {
          summary: 'Cierre familiar.',
          bullets: [
            'Foto familiar.',
            'Cena sencilla.',
            'Definir si sábado es medio día o town plan.',
          ],
        },
      },
      {
        day: 'Día 4',
        date: 'Sáb 4 abr',
        title: 'Medio día de ski + tarde flexible',
        focus: 'Adaptarse a la calidad real de nieve y cuidar energía.',
        morning: {
          summary: 'Plan A = ski.',
          bullets: [
            '9:00 AM a 12:30 PM si vale la pena.',
            'Sesión ligera y limpia.',
            'Salir a tiempo.',
          ],
        },
        afternoon: {
          summary: 'Plan B = Taos town o descanso.',
          bullets: [
            'Taos Plaza y comida local.',
            'O descanso completo en condo.',
            'Buen slot para actividad no-ski.',
          ],
        },
        evening: {
          summary: 'Preparación de salida.',
          bullets: [
            'Empacar el sábado en la noche.',
            'Dejar desayuno de carretera listo.',
            'Evitar noche larga.',
          ],
        },
      },
      {
        day: 'Día 5',
        date: 'Dom 5 abr',
        title: 'Regreso vía Lubbock',
        route: 'Taos Ski Valley → The Carlton House → PN',
        focus: 'Salir a tiempo para no llegar destrozados.',
        morning: {
          summary: 'Checkout temprano.',
          bullets: [
            'Salida sugerida 7:00 AM.',
            'Todo resuelto desde la noche anterior.',
            'Carga rápida y disciplinada.',
          ],
        },
        afternoon: {
          summary: 'Drop-off en Lubbock.',
          bullets: ['ETA 1:45 PM.', 'Salida a PN 2:15 PM.', 'Mantener stop corto.'],
        },
        evening: {
          summary: 'Último tramo a PN.',
          bullets: [
            'Llegada estimada 9:45 PM.',
            'Paradas técnicas simples.',
            'Evitar drift por comida/gasolina.',
          ],
        },
      },
    ],
    restaurants: [
      {
        name: 'The Bavarian',
        zone: 'Ski valley',
        description: 'Clásico en la base, ambiente lodge familiar.',
        mapsHref: 'https://www.google.com/maps/search/?api=1&query=The+Bavarian+Taos+Ski+Valley',
      },
      {
        name: 'Hondo Restaurant',
        zone: 'Ski valley',
        description: 'Cena sentada cómoda cerca de la base.',
        mapsHref:
          'https://www.google.com/maps/search/?api=1&query=Hondo+Restaurant+Taos+Ski+Valley',
      },
      {
        name: 'Pizza Shack',
        zone: 'Ski valley',
        description: 'Rápido y práctico con niños.',
        mapsHref: 'https://www.google.com/maps/search/?api=1&query=Pizza+Shack+Taos+Ski+Valley',
      },
      {
        name: 'Orlando’s',
        zone: 'Taos town',
        description: 'Clásico new mexican si bajan al pueblo.',
        mapsHref: 'https://www.google.com/maps/search/?api=1&query=Orlando%27s+Taos+NM',
      },
      {
        name: 'Michael’s Kitchen',
        zone: 'Taos town',
        description: 'Tradicional, confiable y abundante.',
        mapsHref: 'https://www.google.com/maps/search/?api=1&query=Michael%27s+Kitchen+Taos+NM',
      },
    ],
    conditions: {
      summary: 'Condiciones de primavera: mejores mañanas, nieve más pesada por la tarde.',
      bullets: [
        'Priorizar ski 9:00 AM → 1:00 PM.',
        'Revisar operación del resort antes de gastos no reembolsables.',
        'Tener plan flexible para sábado.',
      ],
      warnings: [
        'Comprar lift tickets online con anticipación.',
        'Empacar sábado en la noche para proteger la salida del domingo.',
      ],
    },
    operationalTips: [
      'Comprar lift tickets online antes de llegar.',
      'Decidir temprano quién renta equipo.',
      'Cocinar parte del viaje es la palanca más limpia para controlar gasto.',
    ],
    keyLinks: [
      {
        label: 'Mapa hospedaje',
        href: 'https://www.google.com/maps/search/?api=1&query=36.59413528442383%2C-105.44747161865234',
        note: 'Ubicación exacta del condo',
      },
      {
        label: 'Mapa pickup Lubbock',
        href: 'https://www.google.com/maps/search/?api=1&query=The+Carlton+House%2C+303+Detroit+Ave%2C+Lubbock%2C+TX+79415',
      },
      { label: 'SkiTaos', href: 'https://www.skitaos.com/' },
      { label: 'Airbnb', href: 'https://www.airbnb.com/rooms/51623904' },
    ],
    todo: [
      'Comprar lift tickets 3–7 días antes.',
      'Definir quién renta equipo.',
      'Confirmar si habrá clase el primer día.',
      'Revisar clima y nieve 48h antes.',
    ],
  },
  {
    slug: 'baja-etapa-1',
    name: 'Baja Etapa 1',
    subtitle: 'Roadtrip en moto por Baja California',
    status: 'Completado',
    startDate: '2026-02-16',
    endDate: '2026-02-24',
    location: 'Baja California, México',
    travelers: 3,
    travelerNames: ['Beto', 'Memo', 'Cuate'],
    style: 'Moto · roadtrip',
    route:
      'Piedras Negras → Durango → Mazatlán → Ferry La Paz → Loreto → Guerrero Negro → San Quintín → Ensenada → San Diego → vuelo regreso',
    objective: 'Conservar Baja como benchmark operativo para futuros viajes largos en moto.',
    summary:
      'Etapa histórica ya realizada. Sirve como referencia fuerte para autonomía, ritmo de ruta, uso de ferry y operación de tres motos adventure en tramos largos y remotos.',
    highlights: [
      'Espinazo del Diablo como punto alto de ruta',
      'Cruce a Baja vía ferry Mazatlán → La Paz',
      'Secuencia Loreto → Guerrero Negro → San Quintín bien documentada',
      '39 gastos reales capturados en TSV para seed de Supabase',
    ],
    quickStats: [
      { label: 'Participantes', value: '3 riders', note: 'Beto, Memo, Cuate' },
      { label: 'Duración', value: '9 días', note: '16 feb → 24 feb' },
      { label: 'Formato', value: 'Moto / carretera', note: 'Ferry + desierto + frontera' },
      { label: 'Motos', value: '2 Ducati + 1 BMW', note: 'Lucy, Cruzifer, Blackie' },
    ],
    participantPresets: [
      { name: 'Beto', emoji: '🦞' },
      { name: 'Memo', emoji: '🏍️' },
      { name: 'Cuate', emoji: '🛣️' },
    ],
    defaultCurrency: 'MXN',
    defaultExchangeRate: 1,
    accommodations: [
      { label: 'Noche 1', value: 'Hotel Torreón', note: 'Registro real de gasto en USD' },
      { label: 'Noche 2', value: 'Sid Marina Beach', note: 'Mazatlán' },
      { label: 'Noche 5', value: 'Hotel Guerrero Negro', note: 'Capturado en gastos reales' },
      { label: 'Noche 6', value: 'Hotel San Quintín', note: 'Capturado en USD' },
      { label: 'Noche 7', value: 'Hotel en San Diego', note: 'Capturado en USD' },
    ],
    budgetSummary: {
      base: 'Histórico incompleto',
      comfortable: 'Gasto real capturado en Supabase',
      premium: 'No aplica como escenario fijo',
      perPersonComfortable: 'Se calcula con gastos reales',
    },
    budgetBreakdown: [
      {
        concept: 'Ferry Mazatlán → La Paz',
        amount: '$24,100 MXN',
        status: 'confirmed',
        note: 'Registrado en gastos reales.',
      },
      {
        concept: 'Boletos de avión regreso',
        amount: '$852.60 USD',
        status: 'confirmed',
        note: 'San Diego → El Paso → San Antonio.',
      },
      {
        concept: 'Hospedaje',
        amount: 'Múltiples hoteles',
        status: 'confirmed',
        note: 'Aún falta consolidación narrativa noche por noche.',
      },
      {
        concept: 'Comidas',
        amount: 'Real capturado',
        status: 'confirmed',
        note: 'Múltiples tickets ya en TSV.',
      },
      {
        concept: 'Combustible / peajes / mantenimiento',
        amount: 'Pendiente consolidar',
        status: 'pending',
        note: 'No todo quedó cerrado en plan histórico.',
      },
    ],
    itinerary: [
      {
        day: 'Día 1',
        date: 'Lun 16 feb',
        title: 'Piedras Negras → Durango',
        route: 'Vía Cuatrociénegas',
        focus: 'Jornada larga de salida.',
        morning: {
          summary: 'Bloque de arranque.',
          bullets: ['Salir temprano.', 'Tanques llenos.', 'Coordinar ritmo del grupo.'],
        },
        afternoon: {
          summary: 'Avance sostenido por carretera.',
          bullets: ['Mantener paradas técnicas cortas.', 'Evitar retrasos acumulados.'],
        },
        evening: {
          summary: 'Llegada y reset.',
          bullets: ['Resolver hotel.', 'Cena simple.', 'Preparar Espinazo para el día siguiente.'],
        },
      },
      {
        day: 'Día 2',
        date: 'Mar 17 feb',
        title: 'Durango → Mazatlán',
        route: 'Espinazo del Diablo',
        focus: 'Uno de los tramos escénicos clave.',
        morning: {
          summary: 'Ruta técnica y escénica.',
          bullets: ['Salir temprano.', 'Ritmo controlado.', 'Cuidar combustible.'],
        },
        afternoon: {
          summary: 'Cierre hacia Mazatlán.',
          bullets: ['Entrada a ciudad.', 'Moverse al hotel.', 'Logística de ferry siguiente día.'],
        },
        evening: {
          summary: 'Descanso en Mazatlán.',
          bullets: ['Cena.', 'Check de ferry.', 'Dormir bien.'],
        },
      },
      {
        day: 'Día 3',
        date: 'Mié 18 feb',
        title: 'Mazatlán → Ferry → La Paz',
        focus: 'Día de transición crítica.',
        morning: {
          summary: 'Check-in y puerto.',
          bullets: ['Buffers amplios.', 'Tarifas y puerto.', 'Disciplina en tiempos.'],
        },
        afternoon: {
          summary: 'Embarque.',
          bullets: ['Ajustar ritmo al ferry.', 'No asumir timing de carretera.'],
        },
        evening: {
          summary: 'Cruce.',
          bullets: ['Descanso.', 'Revisar llegada.', 'Preparar salida a Loreto.'],
        },
        tips: ['El ferry rompe el ritmo del roadtrip; necesita margen real.'],
      },
      {
        day: 'Día 4',
        date: 'Jue 19 feb',
        title: 'La Paz → Loreto',
        focus: 'Ya en Baja, mantener avance sin sobrecargar.',
        morning: {
          summary: 'Salida post-ferry.',
          bullets: ['Reacomodar equipo.', 'Tanque lleno.', 'Arranque temprano.'],
        },
        afternoon: {
          summary: 'Ruta larga.',
          bullets: ['Coordinar paradas.', 'Mantener ritmo de grupo.'],
        },
        evening: { summary: 'Loreto.', bullets: ['Cena.', 'Descanso.', 'Preparar tramo remoto.'] },
      },
      {
        day: 'Día 5',
        date: 'Vie 20 feb',
        title: 'Loreto → Guerrero Negro',
        focus: 'Tramo remoto y exigente.',
        morning: {
          summary: 'Disciplina de combustible.',
          bullets: ['No jugar con reserva.', 'Checar clima y viento.', 'Salir temprano.'],
        },
        afternoon: {
          summary: 'Desierto y autonomía.',
          bullets: ['Paradas estratégicas.', 'Mantener coordinación fina.'],
        },
        evening: {
          summary: 'Llegada a Guerrero Negro.',
          bullets: ['Hotel.', 'Cena.', 'Reset físico.'],
        },
      },
      {
        day: 'Día 6',
        date: 'Sáb 21 feb',
        title: 'Guerrero Negro → San Quintín',
        focus: 'Seguir empujando hacia el norte.',
        morning: {
          summary: 'Salida consistente.',
          bullets: ['Rutina simple.', 'Revisión rápida de motos.', 'Café y carretera.'],
        },
        afternoon: {
          summary: 'Cruzar con margen.',
          bullets: ['Comida en ruta.', 'Mantener energía del grupo.'],
        },
        evening: { summary: 'San Quintín.', bullets: ['Check-in.', 'Cena.', 'Descanso.'] },
      },
      {
        day: 'Día 7',
        date: 'Dom 22 feb',
        title: 'San Quintín → Ensenada → San Diego',
        focus: 'Cruce y cierre terrestre.',
        morning: {
          summary: 'Salida hacia frontera.',
          bullets: ['Dejar hotel sin prisa pero sin drift.', 'Coordinar documentación.'],
        },
        afternoon: {
          summary: 'Ensenada y continuación.',
          bullets: ['Mantener buffers.', 'Cruce con paciencia.'],
        },
        evening: { summary: 'San Diego.', bullets: ['Hotel.', 'Cena.', 'Preparar vuelo.'] },
      },
      {
        day: 'Día 8',
        date: 'Lun 23 feb',
        title: 'San Diego operativo',
        focus: 'Cierre suave y margen para resolver pendientes.',
        morning: {
          summary: 'Recuperación.',
          bullets: ['Descanso.', 'Comidas ligeras.', 'Moverse por ciudad.'],
        },
        afternoon: {
          summary: 'Operación ligera.',
          bullets: ['Traslados cortos.', 'Revisar salida aérea.'],
        },
        evening: { summary: 'Última noche.', bullets: ['Cerrar cuentas.', 'Preparar aeropuerto.'] },
      },
      {
        day: 'Día 9',
        date: 'Mar 24 feb',
        title: 'Vuelo de regreso',
        route: 'San Diego → El Paso → San Antonio',
        focus: 'Cerrar sin fricción.',
        morning: {
          summary: 'Traslado al aeropuerto.',
          bullets: ['Salir con margen.', 'Uber documentado en gastos.', 'Equipaje listo.'],
        },
        afternoon: { summary: 'Conexiones.', bullets: ['Revisar tiempos.', 'Mantener buffers.'] },
        evening: {
          summary: 'Llegada final.',
          bullets: ['Fin de etapa 1.', 'Guardar aprendizajes.'],
        },
      },
    ],
    restaurants: [
      {
        name: 'Mochomos',
        zone: 'Mazatlán',
        description: 'Comida fuerte de grupo registrada en gastos.',
        mapsHref: 'https://www.google.com/maps/search/?api=1&query=Mochomos+Mazatlan',
      },
      {
        name: 'Baja Mía',
        zone: 'Loreto / Baja',
        description: 'Ticket histórico registrado.',
        mapsHref: 'https://www.google.com/maps/search/?api=1&query=Baja+Mia+Loreto',
      },
      {
        name: 'Mama Espinoza',
        zone: 'San Quintín',
        description: 'Parada clásica documentada en gastos.',
        mapsHref: 'https://www.google.com/maps/search/?api=1&query=Mama+Espinoza+San+Quintin',
      },
      {
        name: 'Mitch’s Seafood',
        zone: 'San Diego',
        description: 'Comida en cierre del viaje.',
        mapsHref: 'https://www.google.com/maps/search/?api=1&query=Mitch%27s+Seafood+San+Diego',
      },
    ],
    conditions: {
      summary: 'Febrero templado de día y fresco de noche; capas obligatorias en desierto y costa.',
      bullets: [
        'Baja invernal exige capas para mañanas y cierre del día.',
        'Tramos remotos demandan combustible confiable.',
        'La combinación ferry + carretera cambia por completo el ritmo operativo.',
      ],
      warnings: [
        'No jugar con reserva de combustible.',
        'Ferry y frontera requieren buffers amplios.',
        'Días de 400+ km solo funcionan saliendo muy temprano.',
      ],
    },
    operationalTips: [
      'Baja funciona mejor como benchmark operativo que como presupuesto cerrado.',
      'Formalizar mejor hoteles reales y costos convertiría este viaje en playbook maestrísimo.',
      'La disciplina del grupo importa más que el plan en papel en rutas remotas.',
    ],
    keyLinks: [
      { label: 'Plan histórico', href: '#', note: 'Migrado desde workspace' },
      { label: 'Actual post-viaje', href: '#', note: 'Base de lecciones operativas' },
      { label: 'TSV de gastos', href: '#', note: '39 registros para seed Supabase' },
    ],
    todo: [
      'Consolidar hoteles realmente usados por noche.',
      'Reconstruir combustible, peajes y mantenimiento.',
      'Extraer playbook corto de Baja para etapas futuras.',
    ],
  },
  {
    slug: 'san-diego-seattle-etapa-2',
    name: 'San Diego → Seattle Etapa 2',
    subtitle: 'Ruta costera del Pacífico',
    status: 'En planeación',
    startDate: '2026-05-11',
    endDate: '2026-05-20',
    location: 'Costa del Pacífico, USA',
    travelers: 3,
    travelerNames: ['Beto', 'Memo', 'Cuate'],
    style: 'Moto · roadtrip',
    route: 'San Diego → PCH / US-101 → Seattle',
    objective: 'Hacer la segunda gran etapa priorizando costa, ritmo cómodo y carga moderada.',
    summary:
      'Etapa viva en planeación. La prioridad es mantener una línea costera hermosa y manejable, con hoteles, vuelo de regreso y logística de Seattle todavía por cerrar.',
    highlights: [
      'Costa del Pacífico como eje de ruta',
      'North Cascades removido del Día 8 para bajar carga',
      'Escenario presupuestal preferido: Cómodo',
      'Pendientes clave concentrados en hoteles, vuelo y AdamsGarage Seattle',
    ],
    quickStats: [
      { label: 'Participantes', value: '3 riders', note: 'Beto, Memo, Cuate' },
      { label: 'Duración', value: '10 días', note: '11 may → 20 may' },
      { label: 'Ruta', value: 'CA-1 / US-101', note: 'Prioridad costera' },
      { label: 'Estado', value: 'Borrador vivo', note: 'Se congela después' },
    ],
    participantPresets: [
      { name: 'Beto', emoji: '🦞' },
      { name: 'Memo', emoji: '🏍️' },
      { name: 'Cuate', emoji: '🌊' },
    ],
    defaultCurrency: 'USD',
    defaultExchangeRate: 18,
    accommodations: [
      {
        label: 'Hoteles N1–N9',
        value: 'Pendientes de cerrar',
        note: 'Pendiente principal del viaje',
      },
      {
        label: 'Seattle',
        value: 'Coordinar recepción en AdamsGarage',
        note: 'Costo y horario por confirmar',
      },
    ],
    budgetSummary: {
      base: 'Base en documento maestro',
      comfortable: 'Escenario preferido actual',
      premium: 'Disponible pero no prioritario',
      perPersonComfortable: 'Por cerrar al cerrar hoteles y vuelo',
    },
    budgetBreakdown: [
      {
        concept: 'Hoteles N1–N9',
        amount: 'Pendiente',
        status: 'pending',
        note: 'Principal bloque abierto.',
      },
      {
        concept: 'Vuelo SEA → SAT (3 personas)',
        amount: 'Pendiente',
        status: 'pending',
        note: 'Aún sin compra.',
      },
      {
        concept: 'AdamsGarage Seattle',
        amount: 'Pendiente',
        status: 'pending',
        note: 'Recepción / costo / horario por definir.',
      },
      {
        concept: 'Escenario presupuesto',
        amount: 'Cómodo',
        status: 'estimated',
        note: 'Es el escenario preferido provisional.',
      },
    ],
    itinerary: [
      {
        day: 'Día 1',
        date: 'Lun 11 may',
        title: 'Salida desde San Diego',
        focus: 'Arrancar limpios y agarrar ritmo costero.',
        morning: {
          summary: 'Salida ordenada.',
          bullets: ['Checklist de motos.', 'Salir temprano.', 'Llevar capa para costa.'],
        },
        afternoon: {
          summary: 'Primer bloque por California.',
          bullets: ['Priorizar tramos escénicos.', 'No sobrecargar el primer día.'],
        },
        evening: {
          summary: 'Llegada al primer hotel.',
          bullets: ['Confirmar recepción.', 'Cena y descanso.'],
        },
      },
      {
        day: 'Día 2',
        date: 'Mar 12 may',
        title: 'Costa de California',
        focus: 'PCH / US-101 donde aplique.',
        morning: {
          summary: 'Ruta costera.',
          bullets: ['Buscar ventana de clima estable.', 'Paradas con vista.'],
        },
        afternoon: {
          summary: 'Avance continuo.',
          bullets: ['Mantener carga moderada.', 'No romper ritmo por sobreplaneación.'],
        },
        evening: {
          summary: 'Reset simple.',
          bullets: ['Hotel.', 'Cena.', 'Preparar día siguiente.'],
        },
      },
      {
        day: 'Día 3',
        date: 'Mié 13 may',
        title: 'Hacia zona Redwoods',
        focus: 'Bloque icónico del viaje.',
        morning: {
          summary: 'Entrar al tramo de alto valor visual.',
          bullets: ['Salir temprano.', 'Checar clima.', 'Tomar fotos donde valga.'],
        },
        afternoon: {
          summary: 'Cruce entre bosque y costa.',
          bullets: ['Mantener márgenes.', 'No alargar demasiado el día.'],
        },
        evening: { summary: 'Descanso.', bullets: ['Hotel resuelto.', 'Cargar energía.'] },
      },
      {
        day: 'Día 4',
        date: 'Jue 14 may',
        title: 'Redwoods → Oregon Coast',
        focus: 'Seguir la narrativa costera.',
        morning: {
          summary: 'Transición norte.',
          bullets: ['Clima puede cambiar rápido.', 'Capas listas.'],
        },
        afternoon: {
          summary: 'Costa de Oregon.',
          bullets: ['Ritmo cómodo.', 'Paradas fotográficas puntuales.'],
        },
        evening: { summary: 'Cierre simple.', bullets: ['No estirar de más.', 'Dormir bien.'] },
      },
      {
        day: 'Día 5',
        date: 'Vie 15 may',
        title: 'Oregon Coast',
        focus: 'Día de flujo estable y buenas vistas.',
        morning: {
          summary: 'Ruta con calma.',
          bullets: ['Salir sin drama.', 'Mantener coordinación fina.'],
        },
        afternoon: {
          summary: 'Cruce costero.',
          bullets: ['Evitar fatiga acumulada.', 'Resolver hotel temprano.'],
        },
        evening: { summary: 'Reset.', bullets: ['Cena.', 'Planeación ligera.'] },
      },
      {
        day: 'Día 6',
        date: 'Sáb 16 may',
        title: 'Subida hacia Washington',
        focus: 'Entrar al último tercio con energía.',
        morning: { summary: 'Salida limpia.', bullets: ['Checar lluvia.', 'Coordinar tramos.'] },
        afternoon: {
          summary: 'Avance hacia Seattle.',
          bullets: ['No meter sobrecarga.', 'Cuidar cansancio.'],
        },
        evening: { summary: 'Llegada intermedia.', bullets: ['Hotel.', 'Descanso.'] },
      },
      {
        day: 'Día 7',
        date: 'Dom 17 may',
        title: 'Últimos tramos del Pacífico',
        focus: 'Cerrar bien la ruta.',
        morning: {
          summary: 'Carretera y vistas.',
          bullets: ['Paradas solo donde agreguen valor.', 'Mantener foco en llegada.'],
        },
        afternoon: { summary: 'Acercamiento final.', bullets: ['Coordinar entrada a Seattle.'] },
        evening: { summary: 'Base Seattle.', bullets: ['Check-in.', 'Revisar AdamsGarage.'] },
      },
      {
        day: 'Día 8',
        date: 'Lun 18 may',
        title: 'Seattle operativo',
        focus: 'Buffer logístico.',
        morning: {
          summary: 'Resolver recepción de motos.',
          bullets: ['Confirmar AdamsGarage.', 'Ver costos y horarios.'],
        },
        afternoon: {
          summary: 'Moverse con calma.',
          bullets: ['Traslado hotel → AdamsGarage → aeropuerto si aplica.'],
        },
        evening: { summary: 'Noche ligera.', bullets: ['Cerrar pendientes.'] },
        tips: ['North Cascades fue eliminado para bajar carga. Buena decisión.'],
      },
      {
        day: 'Día 9',
        date: 'Mar 19 may',
        title: 'Margen de seguridad',
        focus: 'Absorber cambios de clima o logística.',
        morning: { summary: 'Slot flexible.', bullets: ['Usarlo solo si hace falta.'] },
        afternoon: {
          summary: 'Preparar vuelo regreso.',
          bullets: ['Equipaje.', 'Traslados.', 'Buffers.'],
        },
        evening: { summary: 'Descanso.', bullets: ['Llegar tranquilos al último día.'] },
      },
      {
        day: 'Día 10',
        date: 'Mié 20 may',
        title: 'Vuelo SEA → SAT',
        focus: 'Cerrar etapa 2 sin fricción.',
        morning: { summary: 'Traslado al aeropuerto.', bullets: ['Salir con margen amplio.'] },
        afternoon: { summary: 'Vuelo de regreso.', bullets: ['Conexiones según compra final.'] },
        evening: { summary: 'Fin de etapa.', bullets: ['Guardar aprendizajes para etapa 3.'] },
      },
    ],
    restaurants: [
      {
        name: 'Pendientes de consolidar',
        zone: 'Ruta',
        description: 'El documento maestro todavía no tiene cierre de restaurantes.',
        mapsHref: 'https://www.google.com/maps',
      },
    ],
    conditions: {
      summary: 'Clima costero variable entre California, Redwoods, Oregon Coast y Seattle.',
      bullets: [
        'Usar pronóstico de 10 días al acercarse la salida.',
        'Llevar margen horario por lluvia y viento.',
        'Mantener días de carga moderada.',
      ],
      warnings: ['Cerrar hoteles pronto.', 'Definir recepción y traslado en Seattle.'],
    },
    operationalTips: [
      'La mejor versión de este viaje es costera, no maximalista.',
      'Buena decisión quitar North Cascades del Día 8.',
      'Primero cerrar hoteles, luego vuelo, luego micro-logística en Seattle.',
    ],
    keyLinks: [
      { label: 'Documento maestro HTML', href: '#', note: 'Fuente principal actual' },
      { label: 'Tracking del viaje', href: '#', note: 'Memoria operativa' },
    ],
    todo: [
      'Comprar vuelo SEA → SAT.',
      'Cerrar hoteles N1–N9.',
      'Confirmar AdamsGarage Seattle.',
      'Definir traslado hotel → AdamsGarage → aeropuerto.',
    ],
  },
  {
    slug: 'italia-aniversario',
    name: 'Italia Aniversario',
    subtitle: 'Viaje de aniversario por Italia con NUBA',
    status: 'En planeación',
    startDate: '2026-10-03',
    endDate: '2026-10-16',
    location: 'Italia · Venecia, Florencia, Costa Amalfitana, Roma',
    travelers: 2,
    travelerNames: ['Beto', 'Graciela'],
    style: 'Pareja · aniversario · premium',
    route: 'Venecia → Florencia → Praiano / Costa Amalfitana → Roma',
    objective: 'Viaje de aniversario cómodo, romántico y bien amarrado con NUBA.',
    summary:
      'Viaje premium de pareja con hoteles fuertes, trenes de alta velocidad, tours privados y una pieza crítica por confirmar: barco en Positano.',
    highlights: [
      '4 bases premium: Venecia, Florencia, Praiano y Roma',
      'Tours privados incluidos en Florencia, Roma Antigua y Vaticano',
      'Boat day en Positano pendiente de cierre por USD 2,500',
      'Anticipo NUBA de USD 3,912 ya registrado',
    ],
    quickStats: [
      { label: 'Participantes', value: '2 personas', note: 'Beto + Graciela' },
      { label: 'Duración', value: '14 días', note: '3 oct → 16 oct' },
      { label: 'Estilo', value: 'Pareja / aniversario', note: 'Ritmo cómodo-premium' },
      { label: 'Presupuesto', value: '$22,626 USD pendiente', note: 'Sin vuelos/seguro' },
    ],
    participantPresets: [
      { name: 'Beto', emoji: '🦞' },
      { name: 'Graciela', emoji: '💛' },
    ],
    defaultCurrency: 'USD',
    defaultExchangeRate: 18,
    accommodations: [
      { label: 'Venecia', value: 'Sina Palazzo Sant’Angelo', note: 'Boutique 5★ sobre canal' },
      { label: 'Florencia', value: 'Gallery Hotel Art', note: 'Diseño y ubicación top' },
      { label: 'Praiano', value: 'Casa Angelina', note: 'Vista premium en Costa Amalfitana' },
      { label: 'Roma', value: 'Babuino 181', note: 'Cierre elegante en zona premium' },
    ],
    budgetSummary: {
      base: '$22,061 USD',
      comfortable: '$26,538 USD',
      premium: '$26,538+ USD',
      perPersonComfortable: '$13,269 USD',
    },
    budgetBreakdown: [
      {
        concept: 'Paquete agencia NUBA',
        amount: '$19,561 USD',
        status: 'pending',
        note: 'Hospedaje, desayunos, traslados y tours; vuelos no incluidos.',
      },
      {
        concept: 'Barco Positano',
        amount: '$2,500 USD',
        status: 'pending',
        note: 'Pendiente agregar/confirmar.',
      },
      { concept: 'Anticipo NUBA', amount: '-$3,912 USD', status: 'confirmed', note: 'Ya pagado.' },
      {
        concept: 'Comidas adicionales',
        amount: '$4,070 USD',
        status: 'estimated',
        note: '2 personas.',
      },
      {
        concept: 'Contingencia',
        amount: '$407 USD',
        status: 'estimated',
        note: '10% sobre comidas adicionales.',
      },
      {
        concept: 'Total viaje sin vuelos/seguro',
        amount: '$26,538 USD',
        status: 'estimated',
        note: 'Escenario actual.',
      },
      {
        concept: 'Pendiente por pagar sin vuelos/seguro',
        amount: '$22,626 USD',
        status: 'estimated',
        note: 'Saldo base + adicionales.',
      },
    ],
    itinerary: [
      {
        day: 'D0',
        date: 'Sáb 3 oct',
        title: 'Salida internacional',
        focus: 'Salir sin fricción y llegar descansados.',
        morning: {
          summary: 'Checklist final.',
          bullets: ['Documentos.', 'Seguros.', 'Reservas y contactos.'],
        },
        afternoon: {
          summary: 'Traslado al aeropuerto.',
          bullets: ['Llegar con margen.', 'Hidratación.', 'Equipaje controlado.'],
        },
        evening: {
          summary: 'Vuelo.',
          bullets: ['Dormir lo más posible.', 'Empezar a cambiar ritmo.'],
        },
      },
      {
        day: 'D1',
        date: 'Dom 4 oct',
        title: 'Llegada a Venecia',
        route: 'VCE → Sina Palazzo Sant’Angelo',
        focus: 'Primer día suave y romántico.',
        morning: {
          summary: 'Llegada a Italia.',
          bullets: ['Traslado privado.', 'Check-in.', 'Pausa ligera.'],
        },
        afternoon: {
          summary: 'Paseo inicial.',
          bullets: ['Gran Canal.', 'San Marco.', 'Caminar sin prisa.'],
        },
        evening: {
          summary: 'Cena temprana.',
          bullets: ['Algo cerca del hotel.', 'Mantenerlo ligero.'],
        },
      },
      {
        day: 'D2',
        date: 'Lun 5 oct',
        title: 'Venecia libre',
        focus: 'Explorar sin saturar.',
        morning: {
          summary: 'Rialto y calles interiores.',
          bullets: ['Evitar horas pico.', 'Buscar callejones laterales.'],
        },
        afternoon: {
          summary: 'San Marco y cafés.',
          bullets: ['Basílica si reservan horario.', 'Fotos en golden hour.'],
        },
        evening: { summary: 'Cena romántica.', bullets: ['Plan tranquilo.', 'Sin prisas.'] },
      },
      {
        day: 'D3',
        date: 'Mar 6 oct',
        title: 'Venecia → Florencia',
        route: 'Hotel → Venezia Santa Lucia → Firenze SMN',
        focus: 'Transición limpia en tren.',
        morning: {
          summary: 'Traslado y tren.',
          bullets: ['Salida privada al tren.', 'Alta velocidad a Florencia.'],
        },
        afternoon: {
          summary: 'Llegada a Gallery Hotel Art.',
          bullets: ['Check-in.', 'Paseo corto por centro.'],
        },
        evening: {
          summary: 'Primer contacto con Florencia.',
          bullets: ['Ponte Vecchio.', 'Signoria.', 'Duomo exterior.'],
        },
      },
      {
        day: 'D4',
        date: 'Mié 7 oct',
        title: 'Florencia histórica + Accademia',
        focus: 'Bloque cultural guiado.',
        morning: {
          summary: 'Tour privado walking.',
          bullets: ['Centro histórico.', 'David en Accademia.'],
        },
        afternoon: { summary: 'Tiempo libre.', bullets: ['Duomo.', 'Compras de piel.', 'Gelato.'] },
        evening: {
          summary: 'Cena especial opcional.',
          bullets: ['Reservar rooftop si vale la pena.'],
        },
      },
      {
        day: 'D5',
        date: 'Jue 8 oct',
        title: 'San Gimignano + vino',
        focus: 'Toscana premium sin fricción.',
        morning: {
          summary: 'Salida privada desde Florencia.',
          bullets: ['Caminar San Gimignano.', 'Fotos panorámicas.'],
        },
        afternoon: {
          summary: 'Comida + wine tasting.',
          bullets: ['Explorar etiquetas especiales.', 'Regresar al atardecer.'],
        },
        evening: {
          summary: 'Descanso en Florencia.',
          bullets: ['Cena ligera.', 'Preparar traslado largo.'],
        },
      },
      {
        day: 'D6',
        date: 'Vie 9 oct',
        title: 'Florencia → Nápoles → Praiano',
        route: 'Firenze SMN → Napoli Centrale → Praiano',
        focus: 'Día largo, agenda ligera.',
        morning: {
          summary: 'Tren de alta velocidad.',
          bullets: ['Traslado privado a estación.', 'Moverse con margen.'],
        },
        afternoon: {
          summary: 'Transfer a Praiano.',
          bullets: ['Llegar a Casa Angelina.', 'Check-in.', 'Descansar.'],
        },
        evening: {
          summary: 'Atardecer premium.',
          bullets: ['No sobrecargar.', 'Simplemente disfrutar la vista.'],
        },
      },
      {
        day: 'D7',
        date: 'Sáb 10 oct',
        title: 'Costa Amalfitana + barco Positano',
        focus: 'Actividad clave del viaje.',
        morning: {
          summary: 'Embarque.',
          bullets: ['Confirmar proveedor.', 'Revisar clima.', 'Definir punto de salida.'],
        },
        afternoon: {
          summary: 'Navegación por la costa.',
          bullets: ['Calas, fotos y baño si se puede.', 'Comida a bordo según contrato.'],
        },
        evening: {
          summary: 'Regreso y descanso.',
          bullets: ['Cerrar detalles de clima y costo con tiempo.'],
        },
        tips: ['Si el mar está fuerte, plan B terrestre: Ravello / Amalfi con comida con vista.'],
      },
      {
        day: 'D8',
        date: 'Dom 11 oct',
        title: 'Slow day Amalfi',
        focus: 'Amortiguador por clima o fatiga.',
        morning: { summary: 'Café y vistas.', bullets: ['Sin prisa.', 'Respirar.'] },
        afternoon: { summary: 'Comida frente al mar.', bullets: ['Spa / fotos / descanso.'] },
        evening: { summary: 'Cena tranquila.', bullets: ['Día colchón.'] },
      },
      {
        day: 'D9',
        date: 'Lun 12 oct',
        title: 'Praiano → Roma',
        route: 'Praiano → Napoli Centrale → Roma Termini',
        focus: 'Entrar a Roma con energía.',
        morning: {
          summary: 'Traslado privado a Napoli.',
          bullets: ['Salir con margen.', 'Equipaje ordenado.'],
        },
        afternoon: {
          summary: 'Tren a Roma.',
          bullets: ['Transfer al hotel.', 'Check-in en Babuino 181.'],
        },
        evening: { summary: 'Paseo corto.', bullets: ['Ubicarse.', 'Cena ligera.'] },
      },
      {
        day: 'D10',
        date: 'Mar 13 oct',
        title: 'Roma Antigua + aniversario',
        focus: 'Día central del viaje.',
        morning: {
          summary: 'Tour Roma Antigua.',
          bullets: ['Coliseo.', 'Foro.', 'Entorno histórico.'],
        },
        afternoon: { summary: 'Pausa.', bullets: ['Descanso antes de la noche.'] },
        evening: {
          summary: 'Cena especial de aniversario.',
          bullets: ['Reservar con anticipación.', 'Idealmente con vista o alta cocina.'],
        },
      },
      {
        day: 'D11',
        date: 'Mié 14 oct',
        title: 'Vaticano',
        focus: 'Bloque guiado con timing claro.',
        morning: {
          summary: 'Museos Vaticanos + Capilla Sixtina + Basílica.',
          bullets: ['Vestimenta adecuada.', 'Moverse con calma.'],
        },
        afternoon: {
          summary: 'Paseo por plazas/cafés.',
          bullets: ['Sin exprimir demasiado el día.'],
        },
        evening: { summary: 'Cena libre.', bullets: ['Elegir según energía.'] },
      },
      {
        day: 'D12',
        date: 'Jue 15 oct',
        title: 'Roma libre',
        focus: 'Últimas compras y caminata final.',
        morning: { summary: 'Compras / regalos.', bullets: ['Últimos pendientes.'] },
        afternoon: {
          summary: 'Trevi / Navona / Trastevere según energía.',
          bullets: ['Mantenerlo flexible.'],
        },
        evening: { summary: 'Cena final del viaje.', bullets: ['Cerrar bonito.'] },
      },
      {
        day: 'D13',
        date: 'Vie 16 oct',
        title: 'Salida Roma',
        route: 'Hotel → FCO',
        focus: 'Cierre sin fricción.',
        morning: {
          summary: 'Check-out.',
          bullets: ['Traslado privado a FCO.', 'Llegar con margen.'],
        },
        afternoon: { summary: 'Vuelo de regreso.', bullets: ['Fin del viaje.'] },
        evening: { summary: '—', bullets: ['Llegada según routing final.'] },
      },
    ],
    restaurants: [
      {
        name: 'Cena aniversario',
        zone: 'Roma',
        description: 'Reservar mesa especial para el 13 oct.',
        mapsHref: 'https://www.google.com/maps/search/?api=1&query=Fine+dining+Rome',
      },
      {
        name: 'Aperitivo junto al canal',
        zone: 'Venecia',
        description: 'Experiencia sugerida para primera tarde.',
        mapsHref: 'https://www.google.com/maps/search/?api=1&query=Aperitivo+Venice+canal',
      },
      {
        name: 'Comida con vista',
        zone: 'Costa Amalfitana',
        description: 'Plan B ideal si no sale el barco.',
        mapsHref: 'https://www.google.com/maps/search/?api=1&query=Amalfi+coast+restaurant+view',
      },
    ],
    conditions: {
      summary:
        'Clima histórico integrado en el documento maestro; el ajuste fino se hace 10 días antes.',
      bullets: [
        'Riesgo de oleaje/clima para barco en Positano.',
        'Trenes requieren buffers entre conexiones.',
        'Costos no incluidos deben traer contingencia.',
      ],
      warnings: [
        'Cerrar vuelos internacionales.',
        'Confirmar barco Positano.',
        'Reservar cena de aniversario con tiempo.',
      ],
    },
    operationalTips: [
      'Este viaje vive o muere en el detalle fino de traslados y reservas especiales.',
      'La costa necesita un plan B claro por clima.',
      'NUBA resuelve mucho, pero faltan vuelos, seguros y experiencias especiales fuera del paquete.',
    ],
    keyLinks: [
      { label: 'Propuesta NUBA', href: '#', note: 'Fuente base del viaje' },
      { label: 'Itinerario día por día', href: '#', note: 'Expandido premium' },
      { label: 'Presupuesto TSV', href: '#', note: 'Base financiera actual' },
    ],
    todo: [
      'Cerrar vuelos internacionales.',
      'Confirmar barco Positano.',
      'Reservar cena especial de aniversario.',
      'Confirmar seguro de viaje / cancelación.',
    ],
  },
];

export function getTripBySlug(slug: string) {
  return travelTrips.find((trip) => trip.slug === slug);
}

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
  { href: '/travel', label: 'Viajes' },
  { href: '/coda', label: 'Coda Architect' },
  { href: '/usage', label: 'Usage' },
  { href: '/agents', label: 'Agents' },
];
