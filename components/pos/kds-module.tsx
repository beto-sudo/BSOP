'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { createSupabaseBrowserClient } from '@/lib/supabase-browser';
import { RDB_EMPRESA_ID } from '@/lib/empresa-constants';
import { getSupabaseErrorMessage } from '@/lib/supabase-error';
import { formatTime } from '@/lib/format';
import { rpcKdsMarcar } from './pos-api';

type KdsItem = {
  id: string;
  cuenta_id: string;
  producto_nombre: string;
  cantidad: number;
  notas: string | null;
  estado: string;
  enviado_cocina_at: string | null;
  created_at: string;
  ubicacion: string | null;
};

/**
 * KDS — Kitchen Display (rdb.pos.kds, ADR-056). Realtime de Supabase con
 * fallback de polling cada 5 s: si el canal se cae, la cocina sigue viendo
 * comandas. ACK obligatorio: en_cocina → listo → entregado.
 */
export function PosKdsModule() {
  const [items, setItems] = useState<KdsItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [realtimeOk, setRealtimeOk] = useState(false);
  const prevIds = useRef<Set<string>>(new Set());
  const audioCtx = useRef<AudioContext | null>(null);

  const beep = useCallback(() => {
    try {
      audioCtx.current ??= new AudioContext();
      const ctx = audioCtx.current;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = 880;
      gain.gain.setValueAtTime(0.3, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.6);
      osc.connect(gain).connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.6);
    } catch {
      // sin audio disponible — el resaltado visual sigue funcionando
    }
  }, []);

  const refresh = useCallback(async () => {
    try {
      const sb = createSupabaseBrowserClient();
      const { data, error: err } = await sb
        .schema('rdb')
        .from('pos_items')
        .select(
          'id, cuenta_id, producto_nombre, cantidad, notas, estado, enviado_cocina_at, created_at'
        )
        .eq('empresa_id', RDB_EMPRESA_ID)
        .eq('va_a_cocina', true)
        .in('estado', ['en_cocina', 'listo'])
        .order('enviado_cocina_at', { ascending: true });
      if (err) throw err;

      const cuentaIds = [...new Set((data ?? []).map((i) => i.cuenta_id))];
      const ubicaciones = new Map<string, string | null>();
      if (cuentaIds.length > 0) {
        const { data: cuentas } = await sb
          .schema('rdb')
          .from('pos_cuentas')
          .select('id, ubicacion')
          .in('id', cuentaIds);
        for (const c of cuentas ?? []) ubicaciones.set(c.id, c.ubicacion);
      }

      const next: KdsItem[] = (data ?? []).map((i) => ({
        ...i,
        cantidad: Number(i.cantidad),
        ubicacion: ubicaciones.get(i.cuenta_id) ?? null,
      }));

      const nuevos = next.filter((i) => i.estado === 'en_cocina' && !prevIds.current.has(i.id));
      if (prevIds.current.size > 0 && nuevos.length > 0) beep();
      prevIds.current = new Set(next.map((i) => i.id));

      setItems(next);
      setError(null);
    } catch (e) {
      setError(getSupabaseErrorMessage(e, 'Error al cargar comandas'));
    }
  }, [beep]);

  useEffect(() => {
    void refresh();
    // Polling siempre activo (fallback); realtime solo acelera.
    const poll = setInterval(() => void refresh(), 5000);

    const sb = createSupabaseBrowserClient();
    const channel = sb
      .channel('pos-kds')
      .on(
        'postgres_changes',
        { event: '*', schema: 'rdb', table: 'pos_items' },
        () => void refresh()
      )
      .subscribe((status) => setRealtimeOk(status === 'SUBSCRIBED'));

    return () => {
      clearInterval(poll);
      void sb.removeChannel(channel);
    };
  }, [refresh]);

  async function marcar(item: KdsItem, estado: 'listo' | 'entregado') {
    try {
      await rpcKdsMarcar({
        itemId: item.id,
        nuevoEstado: estado,
        clientActionId: crypto.randomUUID(),
      });
      await refresh();
    } catch (e) {
      setError(getSupabaseErrorMessage(e, 'Error al marcar'));
    }
  }

  const enCocina = items.filter((i) => i.estado === 'en_cocina');
  const listos = items.filter((i) => i.estado === 'listo');

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {enCocina.length} en preparación · {listos.length} listos
        </p>
        <Badge variant={realtimeOk ? 'secondary' : 'outline'}>
          {realtimeOk ? 'tiempo real' : 'conexión inestable — actualizando cada 5 s'}
        </Badge>
      </div>
      {error && (
        <div className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <KdsColumna titulo="🍳 En preparación" vacio="Sin comandas pendientes">
          {enCocina.map((i) => (
            <KdsCard key={i.id} item={i}>
              <Button className="h-14 w-full text-base" onClick={() => marcar(i, 'listo')}>
                Listo ✓
              </Button>
            </KdsCard>
          ))}
        </KdsColumna>
        <KdsColumna titulo="✅ Listos para entregar" vacio="Nada esperando entrega">
          {listos.map((i) => (
            <KdsCard key={i.id} item={i}>
              <Button
                variant="outline"
                className="h-14 w-full text-base"
                onClick={() => marcar(i, 'entregado')}
              >
                Entregado
              </Button>
            </KdsCard>
          ))}
        </KdsColumna>
      </div>
    </div>
  );
}

function KdsColumna({
  titulo,
  vacio,
  children,
}: {
  titulo: string;
  vacio: string;
  children: React.ReactNode;
}) {
  const hasChildren = Array.isArray(children) ? children.length > 0 : Boolean(children);
  return (
    <div className="space-y-2">
      <h3 className="text-sm font-medium">{titulo}</h3>
      {hasChildren ? (
        <div className="space-y-2">{children}</div>
      ) : (
        <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
          {vacio}
        </p>
      )}
    </div>
  );
}

function KdsCard({ item, children }: { item: KdsItem; children: React.ReactNode }) {
  const desde = item.enviado_cocina_at ?? item.created_at;
  return (
    <div className="rounded-lg border bg-card p-3 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="text-lg font-semibold">
            {item.cantidad}× {item.producto_nombre}
          </div>
          <div className="text-sm text-muted-foreground">
            {item.ubicacion ?? 'Sin ubicación'} · {formatTime(desde)}
          </div>
          {item.notas && <div className="mt-1 text-sm italic">“{item.notas}”</div>}
        </div>
      </div>
      <div className="mt-2">{children}</div>
    </div>
  );
}
