export type CoverageStatus = 'none' | 'partial' | 'full';

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
  coverage_status: CoverageStatus;
  coverage_pct: number;
  assigned_total: number;
  assigned_waitry_orders: string[];
};

export type WaitryCandidate = {
  order_id: string;
  timestamp: string;
  notes: string | null;
  total_amount: number;
  unit_price: number;
  quantity: number;
};

export type RankedCandidate = WaitryCandidate & {
  score: number;
  reasons: string[];
};

const DEFAULT_TIMESTAMP_TOLERANCE_MS = 3 * 60 * 60 * 1000;

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
  toleranceMs: number = DEFAULT_TIMESTAMP_TOLERANCE_MS
): boolean {
  const bookingMs = new Date(bookingStart).getTime();
  const candidateMs = new Date(candidateTimestamp).getTime();
  if (Number.isNaN(bookingMs) || Number.isNaN(candidateMs)) return false;
  return Math.abs(bookingMs - candidateMs) <= toleranceMs;
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

      return { ...candidate, score, reasons };
    })
    .sort((a, b) => b.score - a.score);
}
