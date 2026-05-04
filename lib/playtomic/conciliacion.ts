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

const ESTIMATED_PRICE_PER_PLAYER = 200;

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

      const isPlayerSlot = Math.abs(candidate.unit_price - ESTIMATED_PRICE_PER_PLAYER) < 0.01;
      if (isPlayerSlot) {
        score += 8;
        reasons.push('Monto típico de renta por jugador');
      }

      return { ...candidate, score, reasons };
    })
    .sort((a, b) => b.score - a.score);
}
