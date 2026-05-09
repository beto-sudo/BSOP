'use client';

import { useCallback, useEffect, useState } from 'react';
import { createSupabaseBrowserClient } from '@/lib/supabase-browser';
import { getSupabaseErrorMessage } from '@/lib/supabase-error';
import { chunkArray } from '@/components/playtomic/utils';
import {
  CANCHA_PRODUCT_PATTERNS,
  isCanchaProduct,
  type CoverageStatus,
  type PendingBookingWithCoverage,
  type WaitryCandidate,
  type WaitryItem,
} from '@/lib/playtomic/conciliacion';

// Cloudflare/PostgREST aguanta URLs de ~8KB. Cada UUID en `.in()` consume
// ~37 chars (36 + separador). Con CHUNK=200 quedamos en ~7.5KB por request,
// con margen para el resto de la URL. Subir esto sin medir tira el listado
// con HTTP 400 cuando hay >220 booking_ids en el rango (ya pasó tras el
// refactor a cobertura efectiva, que puede traer 600+).
const BOOKING_ID_CHUNK = 200;

type BookingRow = {
  booking_id: string;
  booking_start: string;
  booking_end: string;
  resource_name: string | null;
  price_amount: number | null;
  owner_id: string | null;
  payment_status: string | null;
};

type ParticipantRow = {
  booking_id: string;
  player_id: string;
  is_owner: boolean | null;
};

type PlayerRow = {
  playtomic_id: string;
  name: string | null;
  email: string | null;
};

type WaitryPedidoRow = {
  order_id: string;
  timestamp: string;
  notes: string | null;
  total_amount: number | null;
  paid: boolean | null;
};

type WaitryProductoRow = {
  order_id: string;
  product_name: string;
  unit_price: number | null;
  quantity: number | null;
  total_price: number | null;
};

type AssignmentRow = {
  id: string;
  booking_id: string;
  waitry_order_id: string;
  assigned_amount: number;
  assigned_at: string;
  note: string | null;
};

export type AssignmentDetail = {
  id: string;
  waitry_order_id: string;
  assigned_amount: number;
  assigned_at: string;
  note: string | null;
};

export type OrderAssignmentSummary = {
  /** Total del pedido Waitry. */
  total: number;
  /** Suma de assignments existentes. */
  assigned: number;
  /** total - assigned. Si <= 0, el pedido está consumido. */
  remaining: number;
  /** Cuántos bookings ya tienen asignado este pedido. */
  bookingsCount: number;
};

export type ConciliacionData = {
  bookings: PendingBookingWithCoverage[];
  candidates: WaitryCandidate[];
  /**
   * Resumen de asignaciones por order_id. Reemplaza al viejo
   * `assignedOrderIds: Set<string>` para soportar split-payment:
   * un mismo pedido Waitry puede asignarse a N bookings hasta agotar
   * `total_amount`. El UI solo excluye candidatos con `remaining <= 0`.
   */
  orderAssignmentSummary: Map<string, OrderAssignmentSummary>;
  assignmentsByBooking: Map<string, AssignmentDetail[]>;
  /**
   * Bookings que están en `bookings[]` pero vinieron por fetch extra
   * (deep-link `?selected=<id>` apuntando a un booking que ya está
   * full-cubierto, fuera del rango 90d, o de otro modo no estaría en el
   * listado normal de pendientes). El view muestra un banner explicativo
   * cuando el booking seleccionado pertenece a este Set.
   */
  outOfFilterBookings: Set<string>;
};

// PostgREST `.or()` con patterns ilike. Cubre padel, tenis, pickleball y "Uso cancha coach...".
const CANCHA_OR_FILTER = CANCHA_PRODUCT_PATTERNS.map((p) => `product_name.ilike.${p}`).join(',');

export function useConciliacionData(options?: { extraBookingId?: string | null }) {
  const extraBookingId = options?.extraBookingId ?? null;
  const [data, setData] = useState<ConciliacionData>({
    bookings: [],
    candidates: [],
    orderAssignmentSummary: new Map(),
    assignmentsByBooking: new Map(),
    outOfFilterBookings: new Set(),
  });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(
    async (isRefresh = false) => {
      if (isRefresh) setRefreshing(true);
      else setLoading(true);
      setError(null);

      try {
        const supabase = createSupabaseBrowserClient();
        const playtomic = supabase.schema('playtomic');
        const rdb = supabase.schema('rdb');

        const nowIso = new Date().toISOString();
        const bookingsLookbackDays = 90;
        const ninetyDaysAgoIso = new Date(
          Date.now() - bookingsLookbackDays * 24 * 60 * 60 * 1000
        ).toISOString();
        // Waitry lookback = bookings + max tolerance window (30d) para cubrir
        // pagos hechos antes del booking_start más antiguo en la lista.
        const waitryLookbackDays = bookingsLookbackDays + 30;
        const waitryLookbackIso = new Date(
          Date.now() - waitryLookbackDays * 24 * 60 * 60 * 1000
        ).toISOString();

        // Paso 1: bookings + pedidos Waitry pagados + productos "Renta Cancha
        // Padel" (filtrado para no chocar con el cap default de PostgREST de
        // 1000 rows aunque pidamos más).
        const [
          { data: pendingBookings, error: pendingErr },
          { data: waitryPedidos, error: pedidosErr },
          { data: canchaProductos, error: canchaErr },
        ] = await Promise.all([
          playtomic
            .from('bookings')
            .select(
              'booking_id,booking_start,booking_end,resource_name,price_amount,owner_id,payment_status'
            )
            // Modelo de cobertura efectiva: incluimos PENDING + PARTIAL_PAID +
            // PAID (los 3 pueden requerir conciliación) y filtramos en cliente
            // por `effective_status != 'full'`. NOT_APPLICABLE queda fuera —
            // son torneos/clases/cuentas internas, otra historia.
            .in('payment_status', ['PENDING', 'PARTIAL_PAID', 'PAID'])
            .eq('is_canceled', false)
            .lte('booking_start', nowIso)
            .gte('booking_start', ninetyDaysAgoIso)
            .order('booking_start', { ascending: true })
            .limit(5000)
            .returns<BookingRow[]>(),
          rdb
            // Vista canónica excluye fantasmas (rdb-waitry-deduplicacion ADR-031);
            // los pagos fantasma no deben aparecer como candidatos para asignar
            // a bookings Playtomic.
            .from('v_waitry_pedidos')
            .select('order_id,timestamp,notes,total_amount,paid')
            .eq('paid', true)
            .gte('timestamp', waitryLookbackIso)
            // Descending: PostgREST capa a ~1000 rows por query independiente del
            // .limit() que pidamos. Con 5K+ pedidos en 120d, ascending dejaba los
            // más recientes (los que el operador necesita ver) FUERA del cap. Al
            // ordenar descending, los recientes llegan primero — exactamente los
            // que matchean con bookings que aún están abiertos para conciliar.
            .order('timestamp', { ascending: false })
            .limit(8000)
            .returns<WaitryPedidoRow[]>(),
          rdb
            .from('waitry_productos')
            .select('order_id,product_name,unit_price,quantity,total_price')
            .or(CANCHA_OR_FILTER)
            .gte('created_at', waitryLookbackIso)
            .order('created_at', { ascending: false })
            .limit(8000)
            .returns<WaitryProductoRow[]>(),
        ]);

        if (pendingErr) throw pendingErr;
        if (pedidosErr) throw pedidosErr;
        if (canchaErr) throw canchaErr;

        // Paso 2: con los order_ids que tienen Renta Cancha Padel, fetcheamos
        // TODOS los items de esos pedidos (incluye F&B, otros productos).
        // Chunkeamos `.in('order_id', ...)` por la misma razón que el resto:
        // con 120d de lookback el set llega a miles y la URL excede los ~8KB
        // de Cloudflare/PostgREST → HTTP 400 Bad Request.
        const candidateOrderIds = Array.from(
          new Set((canchaProductos ?? []).map((p) => p.order_id))
        );
        let waitryProductos: WaitryProductoRow[] = canchaProductos ?? [];
        if (candidateOrderIds.length > 0) {
          const orderIdChunks = chunkArray(candidateOrderIds, BOOKING_ID_CHUNK);
          const itemResponses = await Promise.all(
            orderIdChunks.map((chunk) =>
              rdb
                .from('waitry_productos')
                .select('order_id,product_name,unit_price,quantity,total_price')
                .in('order_id', chunk)
                .limit(20000)
                .returns<WaitryProductoRow[]>()
            )
          );
          const allItems: WaitryProductoRow[] = [];
          for (const res of itemResponses) {
            if (res.error) throw res.error;
            if (res.data) allItems.push(...res.data);
          }
          if (allItems.length > 0) waitryProductos = allItems;
        }

        const bookingsList = pendingBookings ?? [];
        const outOfFilterIds = new Set<string>();

        // Si llega un deep-link `?selected=<id>` apuntando a un booking que
        // NO está en `bookingsList` (porque ya está full-cubierto, fuera del
        // rango 90d, cancelado, o NOT_APPLICABLE), hacer un fetch específico
        // y agregarlo. Lo marcamos en `outOfFilterIds` para que el view
        // muestre un banner explicativo y NO lo filtre fuera por
        // `effective_status='full'` al final.
        if (extraBookingId && !bookingsList.find((b) => b.booking_id === extraBookingId)) {
          const { data: extraData, error: extraErr } = await playtomic
            .from('bookings')
            .select(
              'booking_id,booking_start,booking_end,resource_name,price_amount,owner_id,payment_status'
            )
            .eq('booking_id', extraBookingId)
            .maybeSingle();
          if (extraErr) throw extraErr;
          if (extraData) {
            bookingsList.push(extraData as BookingRow);
            outOfFilterIds.add(extraBookingId);
          }
        }

        const bookingIds = bookingsList.map((b) => b.booking_id);

        const participants: ParticipantRow[] = [];
        const players: PlayerRow[] = [];

        if (bookingIds.length > 0) {
          // Chunkeamos: con 600+ booking_ids en `.in()` la URL excede 8KB y
          // Cloudflare/PostgREST devuelven HTTP 400 Bad Request. Mismo patrón
          // que ya usa `use-playtomic-data.ts` para el dashboard principal.
          const bookingIdChunks = chunkArray(bookingIds, BOOKING_ID_CHUNK);
          const participantResponses = await Promise.all(
            bookingIdChunks.map((chunk) =>
              playtomic
                .from('booking_participants')
                .select('booking_id,player_id,is_owner')
                .in('booking_id', chunk)
                .returns<ParticipantRow[]>()
            )
          );
          for (const res of participantResponses) {
            if (res.error) throw res.error;
            participants.push(...(res.data ?? []));
          }

          const playerIds = Array.from(new Set(participants.map((p) => p.player_id)));
          if (playerIds.length > 0) {
            const playerIdChunks = chunkArray(playerIds, BOOKING_ID_CHUNK);
            const playerResponses = await Promise.all(
              playerIdChunks.map((chunk) =>
                playtomic
                  .from('players')
                  .select('playtomic_id,name,email')
                  .in('playtomic_id', chunk)
                  .returns<PlayerRow[]>()
              )
            );
            for (const res of playerResponses) {
              if (res.error) throw res.error;
              players.push(...(res.data ?? []));
            }
          }
        }

        const playerMap = new Map(players.map((p) => [p.playtomic_id, p]));
        const participantsByBooking = new Map<string, ParticipantRow[]>();
        for (const p of participants) {
          const list = participantsByBooking.get(p.booking_id) ?? [];
          list.push(p);
          participantsByBooking.set(p.booking_id, list);
        }

        // Agrupa todos los productos por order_id para construir los items[]
        // del candidato y para localizar el producto "Renta Cancha Padel"
        // que alimenta unit_price/quantity de la heurística.
        const productosByOrder = new Map<string, WaitryProductoRow[]>();
        for (const prod of waitryProductos ?? []) {
          const list = productosByOrder.get(prod.order_id) ?? [];
          list.push(prod);
          productosByOrder.set(prod.order_id, list);
        }

        const candidates: WaitryCandidate[] = (waitryPedidos ?? [])
          .map((pedido) => {
            const prods = productosByOrder.get(pedido.order_id);
            if (!prods || prods.length === 0) return null;
            const cancha = prods.find((p) => isCanchaProduct(p.product_name));
            if (!cancha) return null;
            const items: WaitryItem[] = prods.map((p) => ({
              product_name: p.product_name,
              quantity: Number(p.quantity ?? 0),
              unit_price: Number(p.unit_price ?? 0),
              total_price: Number(p.total_price ?? 0),
            }));
            return {
              order_id: pedido.order_id,
              timestamp: pedido.timestamp,
              notes: pedido.notes,
              total_amount: Number(pedido.total_amount ?? 0),
              unit_price: Number(cancha.unit_price ?? 0),
              quantity: Number(cancha.quantity ?? 1),
              items,
            };
          })
          .filter((c): c is WaitryCandidate => c !== null);

        // Coverage efectiva (waitry + online_csv) por booking. Modelo nuevo:
        // - effective_status='full' → totalmente trazable, sale del listado.
        // - 'partial' / 'none' → aparecen para conciliar contra Waitry.
        // - has_unverified_manager=true → flag visual: el manager marcó pagos
        //   onsite en Playtomic pero no hay pedido equivalente en Waitry. Es
        //   el caso central que la iniciativa caza (Hector et al).
        type CoverageEntry = {
          effective_status: CoverageStatus;
          effective_pct: number;
          assigned_total: number;
          waitry_total: number;
          online_csv_total: number;
          manager_csv_total: number;
          has_unverified_manager: boolean;
          wallet_payments_count: number;
          wallet_coverage: number;
          waitry_order_ids: string[];
        };
        const coverageByBooking = new Map<string, CoverageEntry>();
        // order_id → { total, assigned, remaining, bookingsCount }
        // Soporta split-payment: un mismo pedido Waitry puede asignarse a N
        // bookings (típico cuando un coach paga 3 clases con un solo pedido).
        // El UI solo excluye candidatos con remaining <= 0.
        const orderAssignmentSummary = new Map<string, OrderAssignmentSummary>();
        const assignmentsByBooking = new Map<string, AssignmentDetail[]>();
        if (bookingIds.length > 0) {
          // Mismo motivo que arriba: chunkeamos para no exceder el límite de URL.
          const bookingIdChunks = chunkArray(bookingIds, BOOKING_ID_CHUNK);
          const [coverageResponses, assignmentResponses] = await Promise.all([
            Promise.all(
              bookingIdChunks.map((chunk) =>
                playtomic
                  .from('v_bookings_total_coverage')
                  .select(
                    'booking_id,effective_status,effective_pct,effective_total,waitry_total,online_csv_total,manager_csv_total,has_unverified_manager,wallet_payments_count,wallet_coverage,waitry_order_ids'
                  )
                  .in('booking_id', chunk)
              )
            ),
            Promise.all(
              bookingIdChunks.map((chunk) =>
                playtomic
                  .from('payment_assignments')
                  .select('id,booking_id,waitry_order_id,assigned_amount,assigned_at,note')
                  .in('booking_id', chunk)
                  .order('assigned_at', { ascending: true })
                  .returns<AssignmentRow[]>()
              )
            ),
          ]);

          const coverageRows: NonNullable<(typeof coverageResponses)[number]['data']> = [];
          for (const res of coverageResponses) {
            if (res.error) throw res.error;
            if (res.data) coverageRows.push(...res.data);
          }
          const assignmentRows: AssignmentRow[] = [];
          for (const res of assignmentResponses) {
            if (res.error) throw res.error;
            if (res.data) assignmentRows.push(...res.data);
          }

          for (const row of coverageRows ?? []) {
            if (!row.booking_id) continue;
            coverageByBooking.set(row.booking_id, {
              effective_status: (row.effective_status as CoverageStatus | null) ?? 'none',
              effective_pct: Number(row.effective_pct ?? 0),
              assigned_total: Number(row.effective_total ?? 0),
              waitry_total: Number(row.waitry_total ?? 0),
              online_csv_total: Number(row.online_csv_total ?? 0),
              manager_csv_total: Number(row.manager_csv_total ?? 0),
              has_unverified_manager: Boolean(row.has_unverified_manager),
              wallet_payments_count: Number(row.wallet_payments_count ?? 0),
              wallet_coverage: Number(row.wallet_coverage ?? 0),
              waitry_order_ids: row.waitry_order_ids ?? [],
            });
          }

          // Acumulador de assignments por order_id. Procesamos TODAS las
          // assignments del rango (no solo las del booking actual) para
          // calcular el remaining global de cada pedido.
          const assignedByOrder = new Map<string, { sum: number; bookings: Set<string> }>();
          for (const row of assignmentRows ?? []) {
            const list = assignmentsByBooking.get(row.booking_id) ?? [];
            list.push({
              id: row.id,
              waitry_order_id: row.waitry_order_id,
              assigned_amount: Number(row.assigned_amount ?? 0),
              assigned_at: row.assigned_at,
              note: row.note,
            });
            assignmentsByBooking.set(row.booking_id, list);

            const entry = assignedByOrder.get(row.waitry_order_id) ?? {
              sum: 0,
              bookings: new Set(),
            };
            entry.sum += Number(row.assigned_amount ?? 0);
            entry.bookings.add(row.booking_id);
            assignedByOrder.set(row.waitry_order_id, entry);
          }

          // Cruzar con waitry_pedidos.total_amount para calcular remaining.
          // Solo cubre orders dentro del lookback; orders más antiguos
          // que asignaciones huérfanas se tratan conservadoramente como
          // "consumidos" (remaining=0) para que no aparezcan en el pool.
          const pedidoTotalById = new Map<string, number>();
          for (const pedido of waitryPedidos ?? []) {
            pedidoTotalById.set(pedido.order_id, Number(pedido.total_amount ?? 0));
          }
          for (const [orderId, entry] of assignedByOrder.entries()) {
            const total = pedidoTotalById.get(orderId) ?? entry.sum;
            const remaining = Math.max(0, total - entry.sum);
            orderAssignmentSummary.set(orderId, {
              total,
              assigned: entry.sum,
              remaining,
              bookingsCount: entry.bookings.size,
            });
          }
        }

        const bookings: PendingBookingWithCoverage[] = bookingsList
          // Filtra por cobertura EFECTIVA: si waitry + online_csv ya cubre el
          // total, el booking sale del listado. Los partial y none aparecen,
          // incluyendo bookings con `payment_status=PAID` agregado pero sin
          // cobertura trazable (ahí está el "marcado paid sin Waitry").
          // Excepción: bookings del deep-link (outOfFilterIds) siempre pasan
          // — el operador llegó con un click explícito desde Historial y
          // espera ver ese booking aunque ya esté full-cubierto.
          .filter(
            (booking) =>
              outOfFilterIds.has(booking.booking_id) ||
              (coverageByBooking.get(booking.booking_id)?.effective_status ?? 'none') !== 'full'
          )
          .map((booking) => {
            const bookingParticipants = participantsByBooking.get(booking.booking_id) ?? [];
            const ownerParticipant = bookingParticipants.find((p) => p.is_owner === true);
            const ownerPlayer = ownerParticipant
              ? playerMap.get(ownerParticipant.player_id)
              : undefined;
            const participantNames: string[] = [];
            const participantEmails: string[] = [];
            for (const p of bookingParticipants) {
              const player = playerMap.get(p.player_id);
              if (player?.name) participantNames.push(player.name);
              if (player?.email) participantEmails.push(player.email);
            }

            const cov = coverageByBooking.get(booking.booking_id);

            return {
              booking_id: booking.booking_id,
              booking_start: booking.booking_start,
              booking_end: booking.booking_end,
              resource_name: booking.resource_name,
              price_amount: Number(booking.price_amount ?? 0),
              owner_id: booking.owner_id,
              owner_name: ownerPlayer?.name ?? null,
              owner_email: ownerPlayer?.email ?? null,
              participant_names: participantNames,
              participant_emails: participantEmails,
              api_payment_status: booking.payment_status,
              coverage_status: cov?.effective_status ?? 'none',
              coverage_pct: cov?.effective_pct ?? 0,
              assigned_total: cov?.assigned_total ?? 0,
              assigned_waitry_orders: cov?.waitry_order_ids ?? [],
              online_csv_total: cov?.online_csv_total ?? 0,
              manager_csv_total: cov?.manager_csv_total ?? 0,
              has_unverified_manager: Boolean(cov?.has_unverified_manager),
              wallet_payments_count: cov?.wallet_payments_count ?? 0,
              wallet_coverage: cov?.wallet_coverage ?? 0,
            };
          });

        setData({
          bookings,
          candidates,
          orderAssignmentSummary,
          assignmentsByBooking,
          outOfFilterBookings: outOfFilterIds,
        });
      } catch (err) {
        setError(getSupabaseErrorMessage(err, 'No se pudo cargar la conciliación.'));
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [extraBookingId]
  );

  useEffect(() => {
    void fetchData(false);
  }, [fetchData]);

  return {
    data,
    loading,
    refreshing,
    error,
    refetch: () => fetchData(true),
  };
}
