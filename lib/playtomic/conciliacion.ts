export type CoverageStatus = 'none' | 'partial' | 'full';

/**
 * Productos de Waitry que amparan renta de cancha y, por tanto, son
 * candidatos válidos para conciliar contra reservas Playtomic. Lista
 * confirmada con datos reales del schema rdb.waitry_productos.
 *
 * Tres familias:
 *   - "Renta Cancha Padel" (exacto, ~1834 pedidos / 60d)
 *   - "Renta Tenis ..." y "Renta Pickleball ..." (variantes Doub./Singles, 60/90 min)
 *   - "Uso cancha coach ..." (entrenadores con nombres: Omar, Anibal, Manuel, Paco, Hugo, + variante PREMIUM)
 *
 * Para PostgREST, los patterns se aplican con `.or('...ilike...,...ilike...')`.
 * Para validación en cliente/server action se usa `isCanchaProduct()`.
 */
export const CANCHA_PRODUCT_PATTERNS = [
  'Renta Cancha Padel',
  'Renta Tenis%',
  'Renta Pickleball%',
  'Uso cancha coach%',
] as const;

export function isCanchaProduct(productName: string | null | undefined): boolean {
  if (!productName) return false;
  if (productName === 'Renta Cancha Padel') return true;
  if (productName.startsWith('Renta Tenis ')) return true;
  if (productName.startsWith('Renta Pickleball ')) return true;
  if (productName.startsWith('Uso cancha coach')) return true;
  return false;
}

/**
 * Coaches conocidos del club. Cuando una reserva tiene a uno de estos como
 * owner o participante, los pedidos Waitry "Uso cancha coach %" en ventana
 * temporal se promueven en el ranker — el operador los valida visualmente.
 *
 * Nombres en lowercase normalizado (sin tildes). Mantener sincronizado con
 * los productos de Waitry: ver SQL `SELECT DISTINCT product_name FROM
 * rdb.waitry_productos WHERE product_name ILIKE 'Uso cancha coach%'`.
 */
export const KNOWN_COACH_NAMES = ['omar', 'anibal', 'manuel', 'paco', 'hugo'] as const;
export type CoachSlug = (typeof KNOWN_COACH_NAMES)[number];

function isCoachProduct(productName: string | null | undefined): boolean {
  if (!productName) return false;
  return productName.toLowerCase().startsWith('uso cancha coach');
}

function detectBookingCoaches(booking: {
  owner_name: string | null;
  participant_names: string[];
}): string[] {
  const allNames = [booking.owner_name, ...(booking.participant_names ?? [])].filter(
    (n): n is string => Boolean(n)
  );
  const found = new Set<string>();
  for (const name of allNames) {
    const lower = normalizeForMatch(name);
    for (const coach of KNOWN_COACH_NAMES) {
      if (lower.includes(coach)) found.add(coach);
    }
  }
  return Array.from(found);
}

export type PendingBookingWithCoverage = {
  booking_id: string;
  booking_start: string;
  booking_end: string;
  resource_name: string | null;
  price_amount: number;
  owner_id: string | null;
  owner_name: string | null;
  owner_email: string | null;
  participant_names: string[];
  participant_emails: string[];
  /** `payment_status` agregado del booking en el API third-party. */
  api_payment_status: string | null;
  /**
   * Estado efectivo de cobertura: solo cuenta lo trazable
   * (Waitry asignado + CSV con origin online). NO cuenta CSV con
   * origin='Playtomic Manager' — esos pueden ser cobros sin pasar
   * por la caja del club.
   */
  coverage_status: CoverageStatus;
  coverage_pct: number;
  /** Suma trazable: waitry + online CSV. */
  assigned_total: number;
  assigned_waitry_orders: string[];
  /** Pagos online del CSV (App / Web), ya en cuenta del club. */
  online_csv_total: number;
  /**
   * Pagos en CSV con origin='Playtomic Manager' (cobros marcados onsite
   * desde el panel web). Si > waitry_total, el flag
   * `has_unverified_manager` indica riesgo: el manager dijo que cobró en
   * cancha pero no hay pedido equivalente en Waitry.
   */
  manager_csv_total: number;
  has_unverified_manager: boolean;
  /**
   * Pagos con `payment_method='Club wallet'` (Bono monedero). El CSV los
   * reporta con `total=0` porque el cliente usó saldo previo, pero el
   * club ya cobró ese saldo cuando se cargó el wallet. Cada wallet
   * payment cubre la parte proporcional del booking
   * (price_amount / participant_count), capeada para no doblar
   * cobertura con online/waitry.
   */
  wallet_payments_count: number;
  wallet_coverage: number;
};

export type WaitryItem = {
  product_name: string;
  quantity: number;
  unit_price: number;
  total_price: number;
};

export type WaitryCandidate = {
  order_id: string;
  timestamp: string;
  notes: string | null;
  total_amount: number;
  // unit_price/quantity del producto "Renta Cancha Padel" — usado por la
  // heurística de match de monto. Si el ticket tiene varios productos,
  // estos reflejan SOLO el de cancha.
  unit_price: number;
  quantity: number;
  // Lista completa de productos del pedido (incluyendo F&B), para que el
  // operador vea el contexto del ticket al decidir si lo asigna.
  items: WaitryItem[];
  // ─── Split-payment metadata (opcional) ───────────────────────────────
  // Cuando el pedido tiene assignments previos a otros bookings, el hook
  // popula estos campos. Si están ausentes, asumir N=0 (todo disponible).
  /** Saldo disponible del pedido = total_amount - SUM(otras assignments). */
  remaining_amount?: number;
  /** Suma de assignments de este order a OTROS bookings. */
  assigned_to_other_bookings?: number;
  /** Cuántos bookings ya tienen asignado este pedido (incluye el current). */
  shared_with_bookings_count?: number;
};

export type RankedCandidate = WaitryCandidate & {
  score: number;
  reasons: string[];
};

// Ventana temporal asimétrica. El pago en cancha SIEMPRE ocurre después
// del booking_start (el cliente llega a recepción al momento de jugar o
// días después al volver al club). Pre-grace fijo de 30 minutos para
// pagos al llegar (cliente paga al registrarse, justo antes de empezar).
// El preset que ajusta el operador controla solo la cola POST-booking.
const PRE_BOOKING_GRACE_MS = 30 * 60 * 1000;
const DEFAULT_TIMESTAMP_TOLERANCE_MS = 2 * 24 * 60 * 60 * 1000;
export const TIMESTAMP_TOLERANCE_PRESETS_MS = {
  '3h': 3 * 60 * 60 * 1000,
  '1d': 1 * 24 * 60 * 60 * 1000,
  '2d': 2 * 24 * 60 * 60 * 1000,
  '7d': 7 * 24 * 60 * 60 * 1000,
  '30d': 30 * 24 * 60 * 60 * 1000,
} as const;
export type TimestampTolerancePreset = keyof typeof TIMESTAMP_TOLERANCE_PRESETS_MS;

// Tolerancia relativa al precio esperado del booking. ±15% absorbe
// redondeos típicos del POS y descuentos chicos sin abrir la puerta a
// matches arbitrarios. Si el precio esperado no se puede derivar (booking
// sin participantes capturados), se usa esta misma fracción contra el
// total del booking como fallback.
const AMOUNT_MATCH_TOLERANCE = 0.15;

function normalizeForMatch(text: string | null | undefined): string {
  return (text ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
}

function nameTokens(name: string): string[] {
  return normalizeForMatch(name)
    .split(/\s+/)
    .filter((token) => token.length >= 3);
}

export function isWithinTimestampWindow(
  bookingStart: string,
  candidateTimestamp: string,
  postToleranceMs: number = DEFAULT_TIMESTAMP_TOLERANCE_MS
): boolean {
  const bookingMs = new Date(bookingStart).getTime();
  const candidateMs = new Date(candidateTimestamp).getTime();
  if (Number.isNaN(bookingMs) || Number.isNaN(candidateMs)) return false;
  const delta = candidateMs - bookingMs;
  return delta >= -PRE_BOOKING_GRACE_MS && delta <= postToleranceMs;
}

export function rankCandidates(
  booking: Pick<
    PendingBookingWithCoverage,
    | 'booking_start'
    | 'price_amount'
    | 'owner_name'
    | 'owner_email'
    | 'participant_names'
    | 'participant_emails'
  >,
  candidates: WaitryCandidate[],
  options: { toleranceMs?: number } = {}
): RankedCandidate[] {
  const tolerance = options.toleranceMs ?? DEFAULT_TIMESTAMP_TOLERANCE_MS;
  const bookingMs = new Date(booking.booking_start).getTime();

  const ownerTokens = booking.owner_name ? nameTokens(booking.owner_name) : [];
  const participantTokens = (booking.participant_names ?? []).flatMap(nameTokens);
  const ownerEmailLocal = (booking.owner_email ?? '').split('@')[0]?.toLowerCase() ?? '';

  // El monto esperado por jugador se deriva del booking en sí, no de un
  // valor hardcoded. Padel típico: $800 / 4 = $200. Tenis singles: $300 /
  // 2 = $150. Tenis dobles, horarios con descuento, torneos, etc, todos
  // caen naturalmente en este cálculo. Si la reserva no trae
  // participantes capturados, dejamos `expectedPerPlayer = 0` y caemos
  // al fallback que compara contra el total completo del booking.
  const participantCount = booking.participant_names?.length ?? 0;
  const bookingTotal = booking.price_amount ?? 0;
  const expectedPerPlayer =
    participantCount > 0 && bookingTotal > 0 ? bookingTotal / participantCount : 0;

  const bookingCoaches = detectBookingCoaches(booking);
  const isCoachBooking = bookingCoaches.length > 0;

  return candidates
    .filter((candidate) =>
      isWithinTimestampWindow(booking.booking_start, candidate.timestamp, tolerance)
    )
    .map((candidate) => {
      const reasons: string[] = [];
      let score = 0;

      const candidateMs = new Date(candidate.timestamp).getTime();
      const proximityMin = Math.abs(candidateMs - bookingMs) / 60_000;
      const proximityScore = Math.max(0, 60 - proximityMin) * 0.5;
      score += proximityScore;
      if (proximityMin <= 30) reasons.push('Hora muy cercana al booking');
      else if (proximityMin <= 90) reasons.push('Hora cercana al booking');

      const notesNorm = normalizeForMatch(candidate.notes);
      if (notesNorm) {
        const ownerHit = ownerTokens.some((token) => notesNorm.includes(token));
        if (ownerHit) {
          score += 50;
          reasons.push('Notes coinciden con owner');
        } else if (
          ownerEmailLocal &&
          ownerEmailLocal.length >= 3 &&
          notesNorm.includes(ownerEmailLocal)
        ) {
          score += 35;
          reasons.push('Notes coinciden con email del owner');
        } else {
          const participantHit = participantTokens.some((token) => notesNorm.includes(token));
          if (participantHit) {
            score += 25;
            reasons.push('Notes coinciden con un participante');
          }
        }
      }

      // Bonus por compatibilidad de monto, derivado del booking — no
      // hardcoded. Tres niveles, no excluyentes:
      //  1) unit_price ≈ precio esperado por jugador.
      //  2) total_amount cubre múltiplo entero N×expectedPerPlayer
      //     (1, 2, 3, 4… jugadores en un solo ticket).
      //  3) total_amount ≈ total del booking completo (un jugador pagó
      //     toda la cancha en un solo ticket).
      if (expectedPerPlayer > 0) {
        const tolerancePerPlayer = expectedPerPlayer * AMOUNT_MATCH_TOLERANCE;

        if (Math.abs(candidate.unit_price - expectedPerPlayer) <= tolerancePerPlayer) {
          score += 12;
          reasons.push('Unit price coincide con el monto por jugador del booking');
        }

        for (let n = 1; n <= participantCount; n += 1) {
          const expected = expectedPerPlayer * n;
          if (Math.abs(candidate.total_amount - expected) <= tolerancePerPlayer * n) {
            const reason =
              n === 1
                ? 'Total del ticket coincide con 1 jugador'
                : n === participantCount
                  ? 'Total del ticket cubre la cancha completa'
                  : `Total del ticket coincide con ${n} jugadores`;
            score += 6 + n * 2;
            reasons.push(reason);
            break;
          }
        }
      } else if (bookingTotal > 0) {
        const tolerance = bookingTotal * AMOUNT_MATCH_TOLERANCE;
        if (Math.abs(candidate.total_amount - bookingTotal) <= tolerance) {
          score += 10;
          reasons.push('Total del ticket coincide con el total del booking');
        }
      }

      // Boost cuando la reserva involucra a un coach conocido (owner o
      // participante) y el ticket de Waitry contiene un producto "Uso cancha
      // coach %". 66 de 83 pedidos coach son genéricos sin nombre, así que
      // promovemos cualquier coach-ticket en la ventana sin exigir match
      // exacto del nombre. Si además el nombre del producto incluye un coach
      // que sí está en el booking, bonus extra.
      if (isCoachBooking) {
        const coachItem = candidate.items.find((it) => isCoachProduct(it.product_name));
        if (coachItem) {
          score += 30;
          reasons.push('Reserva con coach + ticket "Uso cancha coach"');

          const coachItemNorm = normalizeForMatch(coachItem.product_name);
          const exactCoachMatch = bookingCoaches.find((c) => coachItemNorm.includes(c));
          if (exactCoachMatch) {
            score += 20;
            reasons.push(`Nombre del coach (${exactCoachMatch}) coincide con el ticket`);
          }
        }
      }

      return { ...candidate, score, reasons };
    })
    .sort((a, b) => b.score - a.score);
}
