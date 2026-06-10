'use client';

/**
 * GastoActividad — actividad reciente del gasto de un proyecto (iniciativa
 * `dilesa-flujo-gasto` · Sprint 2, tab Gasto del detalle de proyecto;
 * estimaciones de obra desde `dilesa-contratos-estimaciones` · Sprint 3).
 *
 * Junta los últimos movimientos del ciclo P2P del proyecto (OCs por línea con
 * partida del proyecto + facturas ligadas a sus partidas + estimaciones de
 * los contratos de obra de esas partidas) en una lista compacta con links de
 * drill-down (`hrefDoc` + `?focus=`). Lectura pura: queries dirigidas
 * (partidas → OCs/facturas/contratos→estimaciones), sin embeds cross-schema.
 */

import { useEffect, useState } from 'react';
import { FileText, HardHat, ShoppingCart } from 'lucide-react';
import { createSupabaseBrowserClient } from '@/lib/supabase-browser';
import { formatCurrency } from '@/lib/format';
import { hrefDoc } from '@/lib/gasto/hilo';

type Item = {
  key: string;
  tipo: 'oc' | 'factura' | 'estimacion';
  /** Para 'estimacion' es el contrato_id (la estimación vive en su contrato). */
  id: string;
  titulo: string;
  detalle: string;
  fecha: string;
};

const FMT_FECHA = new Intl.DateTimeFormat('es-MX', {
  day: '2-digit',
  month: 'short',
  timeZone: 'America/Matamoros',
});

export function GastoActividad({ proyectoId }: { proyectoId: string }) {
  const [items, setItems] = useState<Item[] | null>(null);

  useEffect(() => {
    let activo = true;
    (async () => {
      const sb = createSupabaseBrowserClient();
      const partidasRes = await sb
        .schema('erp')
        .from('presupuesto_partidas')
        .select('id')
        .eq('proyecto_id', proyectoId)
        .is('deleted_at', null);
      if (partidasRes.error || !activo) {
        if (activo) setItems([]);
        return;
      }
      const partidaIds = (partidasRes.data ?? []).map((p) => p.id as string);
      if (partidaIds.length === 0) {
        if (activo) setItems([]);
        return;
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const erp = sb.schema('erp') as any;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const dilesa = sb.schema('dilesa') as any;
      const [detRes, factRes, contratosRes] = await Promise.all([
        erp
          .from('ordenes_compra_detalle')
          .select(
            'orden_compra_id, ordenes_compra:orden_compra_id(id, codigo, estado, updated_at, created_at)'
          )
          .in('partida_id', partidaIds)
          .limit(200),
        erp
          .from('facturas')
          .select('id, uuid_sat, emisor_nombre, total, estado_cxp, updated_at, created_at')
          .in('partida_id', partidaIds)
          .order('created_at', { ascending: false })
          .limit(5),
        dilesa
          .from('contratos_construccion')
          .select('id, codigo')
          .in('partida_id', partidaIds)
          .is('deleted_at', null),
      ]);
      if (!activo) return;

      // Estimaciones de los contratos de obra de las partidas (devengo, D4).
      const contratoCodigo = new Map<string, string>(
        ((contratosRes.data ?? []) as { id: string; codigo: string | null }[]).map((ct) => [
          ct.id,
          ct.codigo ?? 'Contrato',
        ])
      );
      const estRes = contratoCodigo.size
        ? await dilesa
            .from('obra_estimaciones')
            .select('id, contrato_id, etiqueta, monto_total, estado, updated_at, created_at')
            .in('contrato_id', [...contratoCodigo.keys()])
            .is('deleted_at', null)
            .order('updated_at', { ascending: false })
            .limit(5)
        : { data: [] };
      if (!activo) return;

      const out: Item[] = [];
      type OcEmb = {
        id: string;
        codigo: string | null;
        estado: string | null;
        updated_at: string | null;
        created_at: string;
      } | null;
      const ocVistas = new Map<string, OcEmb>();
      for (const d of (detRes.data ?? []) as { ordenes_compra: OcEmb }[]) {
        const oc = d.ordenes_compra;
        if (oc && oc.estado !== 'cancelada') ocVistas.set(oc.id, oc);
      }
      for (const oc of ocVistas.values()) {
        if (!oc) continue;
        out.push({
          key: `oc-${oc.id}`,
          tipo: 'oc',
          id: oc.id,
          titulo: oc.codigo ?? 'OC',
          detalle: oc.estado ?? '',
          fecha: oc.updated_at ?? oc.created_at,
        });
      }
      for (const f of (factRes.data ?? []) as {
        id: string;
        uuid_sat: string | null;
        emisor_nombre: string | null;
        total: number | null;
        estado_cxp: string | null;
        updated_at: string | null;
        created_at: string;
      }[]) {
        if (f.estado_cxp === 'cancelada') continue;
        out.push({
          key: `f-${f.id}`,
          tipo: 'factura',
          id: f.id,
          titulo: f.emisor_nombre ?? (f.uuid_sat ? `${f.uuid_sat.slice(0, 8)}…` : 'Factura'),
          detalle: `${f.estado_cxp ?? ''} · ${formatCurrency(Number(f.total ?? 0))}`,
          fecha: f.updated_at ?? f.created_at,
        });
      }
      for (const e of (estRes.data ?? []) as {
        id: string;
        contrato_id: string;
        etiqueta: string | null;
        monto_total: number | null;
        estado: string | null;
        updated_at: string | null;
        created_at: string;
      }[]) {
        if (e.estado === 'cancelada') continue;
        out.push({
          key: `e-${e.id}`,
          tipo: 'estimacion',
          id: e.contrato_id,
          titulo: `Est. ${e.etiqueta ?? '—'} · ${contratoCodigo.get(e.contrato_id) ?? ''}`,
          detalle: `${e.estado ?? ''} · ${formatCurrency(Number(e.monto_total ?? 0))}`,
          fecha: e.updated_at ?? e.created_at,
        });
      }
      out.sort((a, b) => (a.fecha < b.fecha ? 1 : -1));
      setItems(out.slice(0, 8));
    })();
    return () => {
      activo = false;
    };
  }, [proyectoId]);

  if (items === null || items.length === 0) return null;

  return (
    <section className="rounded-md border border-[var(--border)] bg-[var(--card)] p-4">
      <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-[var(--text)]/60">
        Actividad reciente del gasto
      </h2>
      <ul className="space-y-1.5">
        {items.map((it) => {
          const href = hrefDoc('dilesa', it.tipo, it.id);
          return (
            <li key={it.key} className="flex items-center gap-2 text-sm">
              {it.tipo === 'oc' ? (
                <ShoppingCart className="h-3.5 w-3.5 shrink-0 text-[var(--text)]/40" />
              ) : it.tipo === 'estimacion' ? (
                <HardHat className="h-3.5 w-3.5 shrink-0 text-[var(--text)]/40" />
              ) : (
                <FileText className="h-3.5 w-3.5 shrink-0 text-[var(--text)]/40" />
              )}
              {href ? (
                <a
                  href={href}
                  className="truncate font-medium text-[var(--accent)] underline-offset-2 hover:underline"
                >
                  {it.titulo}
                </a>
              ) : (
                <span className="truncate font-medium text-[var(--text)]">{it.titulo}</span>
              )}
              <span className="truncate text-[var(--text)]/55">{it.detalle}</span>
              <span className="ml-auto shrink-0 text-xs text-[var(--text)]/45">
                {FMT_FECHA.format(new Date(it.fecha))}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
