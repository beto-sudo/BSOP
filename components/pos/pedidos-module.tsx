'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { createSupabaseBrowserClient } from '@/lib/supabase-browser';
import { RDB_EMPRESA_ID } from '@/lib/empresa-constants';
import { getSupabaseErrorMessage } from '@/lib/supabase-error';
import { formatCurrency, formatTime } from '@/lib/format';
import { hoyISOMatamoros } from '@/lib/fecha-mx';

type PedidoDia = {
  id: string;
  folio: number | null;
  ubicacion: string | null;
  estado: string;
  tipo_venta: string;
  total: number;
  notas: string | null;
  abierta_at: string;
  cerrada_at: string | null;
  abierta_por: string;
  camarero: string;
};

const ESTADO_BADGE: Record<string, string> = {
  abierta: 'default',
  en_cobro: 'secondary',
  pagada: 'secondary',
  cancelada: 'outline',
};

/**
 * Pedidos del día (rdb.pos.pedidos) — el "live + historial" que la operación
 * conocía de Waitry: todas las cuentas de hoy por zona, con folio, camarero,
 * estado y total. Solo lectura; las acciones viven en Captura.
 */
export function PosPedidosModule() {
  const [pedidos, setPedidos] = useState<PedidoDia[]>([]);
  const [zonaFiltro, setZonaFiltro] = useState<string | null>(null);
  const [estadoFiltro, setEstadoFiltro] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const sb = createSupabaseBrowserClient();
      const hoy = hoyISOMatamoros();
      const { data, error: err } = await sb
        .schema('rdb')
        .from('pos_cuentas')
        .select(
          'id, folio, ubicacion, estado, tipo_venta, total, notas, abierta_at, cerrada_at, abierta_por'
        )
        .eq('empresa_id', RDB_EMPRESA_ID)
        .eq('fecha_operativa', hoy)
        .order('folio', { ascending: false });
      if (err) throw err;

      const empleadoIds = [...new Set((data ?? []).map((c) => c.abierta_por))];
      const nombres = new Map<string, string>();
      if (empleadoIds.length > 0) {
        const { data: emps } = await sb
          .schema('erp')
          .from('empleados')
          .select('id, persona_id')
          .in('id', empleadoIds);
        const personaIds = (emps ?? []).map((e) => e.persona_id);
        const { data: personas } = personaIds.length
          ? await sb
              .schema('erp')
              .from('personas')
              .select('id, nombre, apellido_paterno')
              .in('id', personaIds)
          : { data: [] as { id: string; nombre: string; apellido_paterno: string | null }[] };
        const personaNombre = new Map(
          (personas ?? []).map((p) => [
            p.id,
            [p.nombre, p.apellido_paterno].filter(Boolean).join(' '),
          ])
        );
        for (const e of emps ?? []) {
          nombres.set(e.id, personaNombre.get(e.persona_id) ?? e.id.slice(0, 8));
        }
      }

      setPedidos(
        (data ?? []).map((c) => ({
          ...c,
          total: Number(c.total),
          camarero: nombres.get(c.abierta_por) ?? '—',
        }))
      );
      setError(null);
    } catch (e) {
      setError(getSupabaseErrorMessage(e, 'Error al cargar pedidos'));
    }
  }, []);

  useEffect(() => {
    void refresh();
    const t = setInterval(() => void refresh(), 15000);
    return () => clearInterval(t);
  }, [refresh]);

  const zonasDelDia = useMemo(
    () => [...new Set(pedidos.map((p) => p.ubicacion ?? 'Sin zona'))].sort(),
    [pedidos]
  );

  const visibles = useMemo(
    () =>
      pedidos.filter(
        (p) =>
          (!zonaFiltro || (p.ubicacion ?? 'Sin zona') === zonaFiltro) &&
          (!estadoFiltro || p.estado === estadoFiltro)
      ),
    [pedidos, zonaFiltro, estadoFiltro]
  );

  const totalVisible = useMemo(
    () => visibles.filter((p) => p.estado === 'pagada').reduce((s, p) => s + p.total, 0),
    [visibles]
  );

  return (
    <div className="space-y-3">
      {error && (
        <div className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          variant={zonaFiltro === null ? 'default' : 'outline'}
          onClick={() => setZonaFiltro(null)}
        >
          Todas las zonas
        </Button>
        {zonasDelDia.map((z) => (
          <Button
            key={z}
            size="sm"
            variant={zonaFiltro === z ? 'default' : 'outline'}
            onClick={() => setZonaFiltro(z)}
          >
            {z}
          </Button>
        ))}
        <span className="mx-2 h-5 w-px bg-border" />
        {['abierta', 'pagada', 'cancelada'].map((e) => (
          <Button
            key={e}
            size="sm"
            variant={estadoFiltro === e ? 'default' : 'outline'}
            onClick={() => setEstadoFiltro(estadoFiltro === e ? null : e)}
          >
            {e}
          </Button>
        ))}
      </div>

      <p className="text-sm text-muted-foreground">
        {visibles.length} pedido(s) hoy · cobrado {formatCurrency(totalVisible)}
      </p>

      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left">
            <tr>
              <th className="px-3 py-2">Folio</th>
              <th className="px-3 py-2">Zona</th>
              <th className="px-3 py-2">Estado</th>
              <th className="px-3 py-2">Abierta</th>
              <th className="px-3 py-2">Cerrada</th>
              <th className="px-3 py-2">Capturó</th>
              <th className="px-3 py-2 text-right">Total</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {visibles.map((p) => (
              <tr key={p.id}>
                <td className="px-3 py-2 font-mono">#{p.folio ?? '—'}</td>
                <td className="px-3 py-2">
                  {p.ubicacion ?? 'Sin zona'}
                  {p.notas && (
                    <span className="block text-xs italic text-muted-foreground">“{p.notas}”</span>
                  )}
                </td>
                <td className="px-3 py-2">
                  <Badge
                    variant={
                      (ESTADO_BADGE[p.estado] ?? 'outline') as 'default' | 'secondary' | 'outline'
                    }
                  >
                    {p.estado}
                  </Badge>
                  {p.tipo_venta !== 'normal' && (
                    <Badge className="ml-1" variant="outline">
                      {p.tipo_venta}
                    </Badge>
                  )}
                </td>
                <td className="px-3 py-2">{formatTime(p.abierta_at)}</td>
                <td className="px-3 py-2">{p.cerrada_at ? formatTime(p.cerrada_at) : '—'}</td>
                <td className="px-3 py-2">{p.camarero}</td>
                <td className="px-3 py-2 text-right font-mono">{formatCurrency(p.total)}</td>
              </tr>
            ))}
            {visibles.length === 0 && (
              <tr>
                <td colSpan={7} className="px-3 py-8 text-center text-muted-foreground">
                  Sin pedidos hoy con esos filtros.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
