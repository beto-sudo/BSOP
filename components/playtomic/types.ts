export type RangeKey = '7d' | '30d' | 'month' | 'year' | 'all' | 'custom';
export type SportFilter = 'all' | 'PADEL' | 'TENNIS';
export type PlayerSortKey = 'name' | 'reservas' | 'gasto' | 'sport';
export type CoachSortKey = 'name' | 'reservas' | 'revenue' | 'jugadores';

export type Booking = {
  booking_id: string;
  resource_name: string | null;
  sport_id: number | string | null;
  booking_start: string | null;
  booking_end: string | null;
  duration_min: number | null;
  price_amount: number | null;
  price_currency: string | null;
  status: string | null;
  is_canceled: boolean | null;
  owner_id: string | null;
  booking_type: string | null;
  origin: string | null;
  payment_status: string | null;
  synced_at: string | null;
  coach_ids: string[] | null;
  course_id: string | null;
  course_name: string | null;
  activity_id: string | null;
  activity_name: string | null;
};

/**
 * Filtros que aplica el dashboard sobre el array de `data.bookings`. NO
 * se mandan al servidor — la query trae el rango de fechas crudo y aquí
 * en cliente filtramos. Se aplica a KPIs, reconciliación, ocupación,
 * jugadores, cancelaciones, entrenadores. Revenue chart usa
 * `v_revenue_diario` directo y no responde a estos filtros (limitación
 * conocida — la vista no agrupa por cancha/coach/actividad).
 */
export type BookingFilters = {
  sport: SportFilter;
  /** `resource_name` exacto. `''` = todas. */
  resource: string;
  /**
   * Slug del coach (omar/anibal/manuel/paco/hugo). `''` = todos.
   * El matching lo resuelve `applyBookingFilters` contra un
   * `bookingCoachMap` precomputado a partir de los nombres del owner
   * y participantes — no hay registro formal de coaches en Playtomic.
   */
  coachSlug: string;
  /** `activity_name` o `course_name` (lo que esté presente). `''` = todas. */
  activity: string;
};

export type ReconciliationDay = {
  fecha: string;
  label: string;
  totalReservas: number;
  canceladas: number;
  revenueBruto: number;
  paid: number;
  partialPaid: number;
  pending: number;
  notApplicable: number;
  paidRevenue: number;
  partialRevenue: number;
  pendingRevenue: number;
  notApplicableRevenue: number;
  appReservas: number;
  appRevenue: number;
  managerReservas: number;
  managerRevenue: number;
};

export type BookingParticipant = {
  booking_id: string;
  player_id: string | null;
  is_owner: boolean | null;
  family_member_id: string | null;
};

export type RevenueRow = {
  fecha: string;
  sport_id: number | string | null;
  reservas: number | null;
  revenue: number | null;
  cancelaciones: number | null;
};

export type OccupancyRow = {
  resource_name: string | null;
  fecha: string;
  hora: number | null;
  reservas: number | null;
  revenue: number | null;
};

export type PlayerRow = {
  playtomic_id: string;
  name: string | null;
  email: string | null;
  player_type: string | null;
  favorite_sport: string | null;
};

export type PendingBooking = {
  fecha: string;
  hora: string;
  cancha: string;
  deporte: string;
  monto: number;
  jugador: string;
  email: string;
};

export type PendingSummary = {
  jugador: string;
  email: string;
  reservas: number;
  total: number;
};

export type ComputedPlayer = {
  name: string | null;
  email: string | null;
  reservas: number;
  gasto: number;
  favorite_sport: string | null;
  player_type: string | null;
};

export type CoachRow = {
  /** ID crudo del coach (de `bookings.coach_ids`). Se usa como filterId. */
  coach_id: string;
  /** Nombre legible si el coach_id matchea con `players.playtomic_id`. */
  display_name: string;
  reservas: number;
  /** Sum(price_amount) de las reservas; se reparte si hubo varios coaches. */
  revenue: number;
  /** Cuenta distinct de owner_ids únicos. */
  jugadores_unicos: number;
  /** ISO timestamp del booking más reciente del coach. */
  ultima_reserva: string | null;
};

export type CancelPlayerRow = {
  ownerId: string;
  name: string | null;
  email: string | null;
  totalBookings: number;
  canceledBookings: number;
  cancellationRate: number;
};

export type ResourceRow = {
  resource_id: string;
  resource_name: string | null;
  sport_id: number | string | null;
  active: boolean | null;
  first_seen_at: string | null;
  last_seen_at: string | null;
};

export type SyncRow = {
  sync_type: string | null;
  status: string | null;
  bookings_fetched: number | null;
  bookings_upserted: number | null;
  players_upserted: number | null;
  started_at: string | null;
  finished_at: string | null;
  error_message: string | null;
};

export type DashboardData = {
  bookings: Booking[];
  participants: BookingParticipant[];
  revenue: RevenueRow[];
  occupancy: OccupancyRow[];
  players: PlayerRow[];
  resources: ResourceRow[];
  syncs: SyncRow[];
};

export type ChartBucket = {
  key: string;
  label: string;
  padel: number;
  tennis: number;
  total: number;
  reservas: number;
  cancelaciones: number;
};
