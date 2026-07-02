'use client';

/**
 * ActivoMovimientos — historial de subdivisiones/fusiones/relotificaciones
 * en las que participa un activo (origen o resultante). ADR-055, iniciativa
 * `dilesa-portafolio-predios` · S5. Solo se renderiza si hay movimientos.
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { createSupabaseBrowserClient } from '@/lib/supabase-browser';
import { Badge } from '@/components/ui/badge';

const TIPO_LABEL: Record<string, string> = {
  subdivision: 'Subdivisión',
  fusion: 'Fusión',
  relotificacion: 'Relotificación',
};

type Parte = {
  rol: string;
  activo: { id: string; nombre: string; area_m2: number | null } | null;
};

type Movimiento = {
  id: string;
  tipo: string;
  fecha: string;
  superficie_origen_m2: number | null;
  superficie_resultante_m2: number | null;
  notas: string | null;
  partes: Parte[];
};

export function ActivoMovimientos({
  activoId,
  empresaId,
}: {
  activoId: string;
  empresaId: string;
}) {
  const [movs, setMovs] = useState<Movimiento[]>([]);

  useEffect(() => {
    let vivo = true;
    void (async () => {
      const sb = createSupabaseBrowserClient();
      const { data: mias } = await sb
        .schema('dilesa')
        .from('activo_movimiento_partes')
        .select('movimiento_id')
        .eq('empresa_id', empresaId)
        .eq('activo_id', activoId);
      const ids = Array.from(new Set((mias ?? []).map((p) => p.movimiento_id)));
      if (!vivo || ids.length === 0) return;
      const { data } = await sb
        .schema('dilesa')
        .from('activo_movimientos')
        .select(
          'id, tipo, fecha, superficie_origen_m2, superficie_resultante_m2, notas, partes:activo_movimiento_partes(rol, activo:activos(id, nombre, area_m2))'
        )
        .in('id', ids)
        .order('fecha', { ascending: false });
      if (vivo) setMovs((data ?? []) as unknown as Movimiento[]);
    })();
    return () => {
      vivo = false;
    };
  }, [activoId, empresaId]);

  if (movs.length === 0) return null;

  return (
    <section className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-5">
      <h2 className="mb-3 text-sm font-medium uppercase tracking-wider text-[var(--text)]/60">
        Movimientos catastrales
      </h2>
      <div className="space-y-4">
        {movs.map((m) => {
          const origenes = m.partes.filter((p) => p.rol === 'origen' && p.activo);
          const resultantes = m.partes.filter((p) => p.rol === 'resultante' && p.activo);
          return (
            <div key={m.id} className="text-sm">
              <div className="mb-1 flex flex-wrap items-center gap-2">
                <Badge tone="info">{TIPO_LABEL[m.tipo] ?? m.tipo}</Badge>
                <span className="text-[var(--text)]/60">{m.fecha}</span>
                {m.superficie_origen_m2 != null && m.superficie_resultante_m2 != null ? (
                  <span className="text-xs tabular-nums text-[var(--text)]/50">
                    {m.superficie_origen_m2.toLocaleString('es-MX')} m² →{' '}
                    {m.superficie_resultante_m2.toLocaleString('es-MX')} m²
                  </span>
                ) : null}
              </div>
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                {origenes.map((p, i) => (
                  <span key={p.activo!.id}>
                    {i > 0 ? <span className="text-[var(--text)]/40"> + </span> : null}
                    <Link
                      href={`/dilesa/portafolio/activo/${p.activo!.id}`}
                      className={
                        p.activo!.id === activoId
                          ? 'font-medium text-[var(--text)]'
                          : 'text-[var(--accent)] underline-offset-2 hover:underline'
                      }
                    >
                      {p.activo!.nombre}
                    </Link>
                  </span>
                ))}
                <span className="text-[var(--text)]/40">→</span>
                {resultantes.map((p, i) => (
                  <span key={p.activo!.id}>
                    {i > 0 ? <span className="text-[var(--text)]/40"> · </span> : null}
                    <Link
                      href={`/dilesa/portafolio/activo/${p.activo!.id}`}
                      className={
                        p.activo!.id === activoId
                          ? 'font-medium text-[var(--text)]'
                          : 'text-[var(--accent)] underline-offset-2 hover:underline'
                      }
                    >
                      {p.activo!.nombre}
                    </Link>
                  </span>
                ))}
              </div>
              {m.notas ? <p className="mt-1 text-xs text-[var(--text)]/50">{m.notas}</p> : null}
            </div>
          );
        })}
      </div>
    </section>
  );
}
