'use client';

/**
 * ProyectoBanda — contexto permanente del detalle de proyecto (fase 3 de
 * `dilesa-flujo-gasto`, espejo de la Zona A del Expediente de Ventas).
 *
 * Vive en el layout del detalle, arriba de los tabs: nombre + tipo/estado +
 * mini-medidores de avance (urbanización / construcción / ventas) + parque
 * disponible + "estado sugerido" cuando difiere del actual. Así el contexto
 * no se pierde al cambiar de tab.
 *
 * Fetch propio y ligero (proyecto + v_proyecto_avances); no toca el fetch de
 * los tabs.
 */

import { useEffect, useState } from 'react';
import { createSupabaseBrowserClient } from '@/lib/supabase-browser';
import { Badge } from '@/components/ui/badge';
import { ESTADO_LABEL, ESTADO_TONE, TIPO_LABEL } from './proyecto-detalle';

type Banda = {
  nombre: string;
  tipo: string;
  estado: string;
  avance_urb_pct: number | null;
  avance_const_pct: number | null;
  avance_vts_pct: number | null;
  parque_disponible: number | null;
  estado_sugerido: string | null;
};

function Mini({ label, pct }: { label: string; pct: number | null }) {
  const v = Math.min(100, Math.max(0, pct ?? 0));
  return (
    <div className="min-w-[110px]">
      <div className="mb-0.5 flex items-center justify-between text-[11px] text-[var(--text)]/55">
        <span>{label}</span>
        <span className="tabular-nums">{pct != null ? `${pct.toFixed(0)}%` : '—'}</span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--border)]">
        <div className="h-full bg-[var(--accent)]" style={{ width: `${v}%` }} />
      </div>
    </div>
  );
}

export function ProyectoBanda({ proyectoId }: { proyectoId: string }) {
  const [banda, setBanda] = useState<Banda | null>(null);

  useEffect(() => {
    let activo = true;
    const sb = createSupabaseBrowserClient();
    void Promise.all([
      sb
        .schema('dilesa')
        .from('proyectos')
        .select('nombre, tipo, estado')
        .eq('id', proyectoId)
        .maybeSingle(),
      sb
        .schema('dilesa')
        .from('v_proyecto_avances')
        .select(
          'avance_urb_pct, avance_const_pct, avance_vts_pct, parque_disponible, estado_sugerido'
        )
        .eq('proyecto_id', proyectoId)
        .maybeSingle(),
    ]).then(([p, a]) => {
      if (!activo || !p.data) return;
      setBanda({
        nombre: (p.data.nombre as string) ?? '',
        tipo: (p.data.tipo as string) ?? '',
        estado: (p.data.estado as string) ?? '',
        avance_urb_pct: (a.data?.avance_urb_pct as number | null) ?? null,
        avance_const_pct: (a.data?.avance_const_pct as number | null) ?? null,
        avance_vts_pct: (a.data?.avance_vts_pct as number | null) ?? null,
        parque_disponible: (a.data?.parque_disponible as number | null) ?? null,
        estado_sugerido: (a.data?.estado_sugerido as string | null) ?? null,
      });
    });
    return () => {
      activo = false;
    };
  }, [proyectoId]);

  if (!banda) return <div className="h-12" aria-hidden />;

  return (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
      <div className="flex items-center gap-2">
        <h1 className="text-xl font-semibold tracking-tight text-[var(--text)]">{banda.nombre}</h1>
        <Badge tone="neutral">{TIPO_LABEL[banda.tipo] ?? banda.tipo}</Badge>
        <Badge tone={ESTADO_TONE[banda.estado] ?? 'neutral'}>
          {ESTADO_LABEL[banda.estado] ?? banda.estado}
        </Badge>
        {banda.estado_sugerido && banda.estado_sugerido !== banda.estado ? (
          <Badge tone="warning">
            Sugerido: {ESTADO_LABEL[banda.estado_sugerido] ?? banda.estado_sugerido}
          </Badge>
        ) : null}
      </div>
      <div className="flex flex-wrap items-center gap-4">
        <Mini label="Urbanización" pct={banda.avance_urb_pct} />
        <Mini label="Construcción" pct={banda.avance_const_pct} />
        <Mini label="Ventas" pct={banda.avance_vts_pct} />
        {banda.parque_disponible != null ? (
          <div className="text-xs text-[var(--text)]/60">
            Parque disponible:{' '}
            <span className="font-semibold tabular-nums text-[var(--text)]">
              {banda.parque_disponible}
            </span>
          </div>
        ) : null}
      </div>
    </div>
  );
}
