'use client';

import { useCallback, useEffect, useState } from 'react';
import { createSupabaseBrowserClient } from '@/lib/supabase-browser';
import { getSupabaseErrorMessage } from '@/lib/supabase-error';
import { chunkArray } from '@/components/playtomic/utils';

const BOOKING_ID_CHUNK = 200;

export type HistorialSource = 'waitry' | 'online' | 'manager' | 'other';

export type HistorialEvent = {
  row_id: string;
  source: HistorialSource;
  booking_id: string;
  booking_start: string | null;
  resource_name: string | null;
  booking_total: number;
  owner_id: string | null;
  owner_name: string | null;
  reference_id: string;
  amount: number;
  payment_method: string | null;
  payment_origin: string | null;
  event_at: string | null;
  assigned_by: string | null;
  /** Email del usuario que asignó (Waitry manual). null para CSV (auto). */
  assigned_by_email: string | null;
  subject: string | null;
  /** Notes que el cobrador escribió en el POS Waitry (ej. "jose Luis paz efectivo"). null para CSV. */
  waitry_notes: string | null;
  /** Timestamp del cobro físico en Waitry (distinto del assigned_at). null para CSV. */
  waitry_paid_at: string | null;
  /** Total del pedido Waitry completo (puede incluir F&B además de cancha). null para CSV. */
  waitry_order_total: number | null;
};

type ViewRow = {
  row_id: string | null;
  source: string | null;
  booking_id: string | null;
  booking_start: string | null;
  resource_name: string | null;
  booking_total: number | null;
  owner_id: string | null;
  reference_id: string | null;
  amount: number | null;
  payment_method: string | null;
  payment_origin: string | null;
  event_at: string | null;
  assigned_by: string | null;
  subject: string | null;
  waitry_notes: string | null;
  waitry_paid_at: string | null;
  waitry_order_total: number | null;
};

type PlayerRow = {
  playtomic_id: string;
  name: string | null;
};

type UsuarioRow = {
  id: string;
  email: string | null;
};

/**
 * Carga la vista `playtomic.v_conciliacion_historial` filtrada por rango de
 * fechas (event_at), y enriquece cada fila con:
 *   - owner_name: desde `playtomic.players` por owner_id.
 *   - assigned_by_email: desde `core.usuarios` por assigned_by.
 *
 * Default range: últimos 60 días desde el día actual del club. El operador
 * puede ampliarlo en la UI.
 */
export function useHistorialData({ fromIso, toIso }: { fromIso: string; toIso: string }) {
  const [events, setEvents] = useState<HistorialEvent[]>([]);
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
        const core = supabase.schema('core');

        const { data: rawRows, error: rowsErr } = await playtomic
          .from('v_conciliacion_historial')
          .select(
            'row_id,source,booking_id,booking_start,resource_name,booking_total,owner_id,reference_id,amount,payment_method,payment_origin,event_at,assigned_by,subject,waitry_notes,waitry_paid_at,waitry_order_total'
          )
          .gte('event_at', `${fromIso}T00:00:00Z`)
          .lte('event_at', `${toIso}T23:59:59Z`)
          .order('event_at', { ascending: false })
          .limit(10000)
          .returns<ViewRow[]>();
        if (rowsErr) throw rowsErr;

        const rows = rawRows ?? [];

        // Resolver owner_name: lookup contra players por owner_id.
        const ownerIds = Array.from(
          new Set(rows.map((r) => r.owner_id).filter((id): id is string => Boolean(id)))
        );
        const playerMap = new Map<string, string | null>();
        if (ownerIds.length > 0) {
          const chunks = chunkArray(ownerIds, BOOKING_ID_CHUNK);
          const responses = await Promise.all(
            chunks.map((chunk) =>
              playtomic
                .from('players')
                .select('playtomic_id,name')
                .in('playtomic_id', chunk)
                .returns<PlayerRow[]>()
            )
          );
          for (const res of responses) {
            if (res.error) throw res.error;
            for (const player of res.data ?? []) {
              playerMap.set(player.playtomic_id, player.name);
            }
          }
        }

        // Resolver assigned_by_email: lookup contra core.usuarios.
        const assignedByIds = Array.from(
          new Set(rows.map((r) => r.assigned_by).filter((id): id is string => Boolean(id)))
        );
        const usuarioMap = new Map<string, string | null>();
        if (assignedByIds.length > 0) {
          const { data: usuarios, error: usuariosErr } = await core
            .from('usuarios')
            .select('id,email')
            .in('id', assignedByIds)
            .returns<UsuarioRow[]>();
          if (usuariosErr) throw usuariosErr;
          for (const u of usuarios ?? []) {
            usuarioMap.set(u.id, u.email);
          }
        }

        const enriched: HistorialEvent[] = rows.map((r) => {
          const source: HistorialSource =
            r.source === 'waitry' || r.source === 'online' || r.source === 'manager'
              ? r.source
              : 'other';
          return {
            row_id: r.row_id ?? '',
            source,
            booking_id: r.booking_id ?? '',
            booking_start: r.booking_start,
            resource_name: r.resource_name,
            booking_total: Number(r.booking_total ?? 0),
            owner_id: r.owner_id,
            owner_name: r.owner_id ? (playerMap.get(r.owner_id) ?? null) : null,
            reference_id: r.reference_id ?? '',
            amount: Number(r.amount ?? 0),
            payment_method: r.payment_method,
            payment_origin: r.payment_origin,
            event_at: r.event_at,
            assigned_by: r.assigned_by,
            assigned_by_email: r.assigned_by ? (usuarioMap.get(r.assigned_by) ?? null) : null,
            subject: r.subject,
            waitry_notes: r.waitry_notes,
            waitry_paid_at: r.waitry_paid_at,
            waitry_order_total: r.waitry_order_total != null ? Number(r.waitry_order_total) : null,
          };
        });

        setEvents(enriched);
      } catch (err) {
        setError(getSupabaseErrorMessage(err, 'No se pudo cargar el historial.'));
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [fromIso, toIso]
  );

  useEffect(() => {
    void fetchData(false);
  }, [fetchData]);

  return {
    events,
    loading,
    refreshing,
    error,
    refetch: () => fetchData(true),
  };
}
