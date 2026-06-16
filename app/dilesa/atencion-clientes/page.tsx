'use client';

 

/**
 * Bandeja de Atención a Clientes (Ciori) — cola de trabajo por momento, como
 * VISTA sobre datos existentes (sin duplicar captura): cada tarjeta enlaza a
 * donde se actúa. Iniciativa dilesa-atencion-clientes, Sprint 2.
 *
 *   1. Obras por recibir   → /dilesa/construccion/[id] (programar/recibir)
 *   2. Pre-entrega         → /dilesa/ventas/[id]/capturar/14-preparada-entrega
 *   3. Entrega             → /dilesa/ventas/[id]/capturar/15-entregada
 *   4. Encuesta sin responder → /dilesa/ventas/[id]/capturar/16-conformidad
 */

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { ChevronRight, ClipboardList, HardHat, KeyRound, Star } from 'lucide-react';
import { RequireAccess } from '@/components/require-access';
import { createSupabaseBrowserClient } from '@/lib/supabase-browser';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { getSupabaseErrorMessage } from '@/lib/supabase-error';

type Obra = {
  construccion_id: string;
  codigo: string;
  unidad: string | null;
  proyecto: string | null;
  avance_pct: number;
  recepcion_estado: string | null;
  fecha_programada: string | null;
};
type VentaEntrega = {
  venta_id: string;
  cliente: string | null;
  unidad: string | null;
  proyecto: string | null;
  cola: 'pre_entrega' | 'entrega';
};
type Encuesta = {
  encuesta_id: string;
  venta_id: string;
  cliente: string | null;
  unidad: string | null;
  estado: string;
  programada_para: string | null;
  intentos: number | null;
};

export default function AtencionClientesPage() {
  return (
    <RequireAccess empresa="dilesa" modulo="dilesa.atencion_clientes">
      <Body />
    </RequireAccess>
  );
}

function Body() {
  const [obras, setObras] = useState<Obra[]>([]);
  const [ventas, setVentas] = useState<VentaEntrega[]>([]);
  const [encuestas, setEncuestas] = useState<Encuesta[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let activo = true;
    (async () => {
      const sb = createSupabaseBrowserClient();
      const [o, v, e] = await Promise.all([
        sb.schema('dilesa').from('v_ac_obras_por_recibir').select('*'),
        sb.schema('dilesa').from('v_ac_ventas_entrega').select('*'),
        sb.schema('dilesa').from('v_ac_encuestas_pendientes').select('*'),
      ]);
      if (!activo) return;
      const firstErr = o.error ?? v.error ?? e.error;
      if (firstErr) {
        setError(getSupabaseErrorMessage(firstErr, 'No se pudo cargar la bandeja.'));
        setLoading(false);
        return;
      }
      setObras((o.data ?? []) as Obra[]);
      setVentas((v.data ?? []) as VentaEntrega[]);
      setEncuestas((e.data ?? []) as Encuesta[]);
      setLoading(false);
    })();
    return () => {
      activo = false;
    };
  }, []);

  const preEntrega = useMemo(() => ventas.filter((v) => v.cola === 'pre_entrega'), [ventas]);
  const entrega = useMemo(() => ventas.filter((v) => v.cola === 'entrega'), [ventas]);

  if (loading) {
    return (
      <div className="container mx-auto max-w-5xl space-y-6 px-4 py-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-40 w-full rounded-lg" />
        <Skeleton className="h-40 w-full rounded-lg" />
      </div>
    );
  }

  return (
    <div className="container mx-auto max-w-5xl space-y-6 px-4 py-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-[var(--text)]">
          Atención a Clientes
        </h1>
        <p className="mt-1 text-sm text-[var(--text)]/60">
          Tu cola de trabajo: recibir la obra al contratista, preparar y entregar la vivienda, y
          cerrar la conformidad del cliente.
        </p>
      </header>

      {error ? (
        <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
          {error}
        </div>
      ) : null}

      <Cola
        icon={<HardHat className="h-4 w-4" />}
        titulo="Obras por recibir"
        descripcion="Construcción terminada, lista para recibir al contratista."
        count={obras.length}
      >
        {obras.map((o) => (
          <Tarjeta
            key={o.construccion_id}
            href={`/dilesa/construccion/${o.construccion_id}`}
            titulo={o.unidad ?? o.codigo}
            sub={o.proyecto}
            right={<ObraEstadoBadge estado={o.recepcion_estado} fecha={o.fecha_programada} />}
          />
        ))}
      </Cola>

      <Cola
        icon={<ClipboardList className="h-4 w-4" />}
        titulo="Pre-entrega pendiente"
        descripcion="Escrituradas, listas para la revisión pre-entrega (fase 14)."
        count={preEntrega.length}
      >
        {preEntrega.map((v) => (
          <Tarjeta
            key={v.venta_id}
            href={`/dilesa/ventas/${v.venta_id}/capturar/14-preparada-entrega`}
            titulo={v.cliente ?? '(cliente sin nombre)'}
            sub={[v.unidad, v.proyecto].filter(Boolean).join(' · ') || null}
          />
        ))}
      </Cola>

      <Cola
        icon={<KeyRound className="h-4 w-4" />}
        titulo="Entrega pendiente"
        descripcion="Pre-entrega lista; falta entregar la vivienda al cliente (fase 15)."
        count={entrega.length}
      >
        {entrega.map((v) => (
          <Tarjeta
            key={v.venta_id}
            href={`/dilesa/ventas/${v.venta_id}/capturar/15-entregada`}
            titulo={v.cliente ?? '(cliente sin nombre)'}
            sub={[v.unidad, v.proyecto].filter(Boolean).join(' · ') || null}
          />
        ))}
      </Cola>

      <Cola
        icon={<Star className="h-4 w-4" />}
        titulo="Encuesta sin responder"
        descripcion="Conformidad del cliente pendiente de respuesta (fase 16)."
        count={encuestas.length}
      >
        {encuestas.map((e) => (
          <Tarjeta
            key={e.encuesta_id}
            href={`/dilesa/ventas/${e.venta_id}/capturar/16-conformidad`}
            titulo={e.cliente ?? '(cliente sin nombre)'}
            sub={e.unidad}
            right={
              <Badge tone={e.estado === 'enviada' ? 'warning' : 'neutral'}>
                {e.estado === 'enviada' ? `enviada · ${e.intentos ?? 0} intento(s)` : 'programada'}
              </Badge>
            }
          />
        ))}
      </Cola>
    </div>
  );
}

function Cola({
  icon,
  titulo,
  descripcion,
  count,
  children,
}: {
  icon: React.ReactNode;
  titulo: string;
  descripcion: string;
  count: number;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-lg border border-[var(--border)] bg-[var(--card)]">
      <div className="flex items-center gap-2 border-b border-[var(--border)] px-4 py-3">
        <span className="text-[var(--accent)]">{icon}</span>
        <h2 className="text-sm font-semibold text-[var(--text)]">{titulo}</h2>
        <Badge tone={count > 0 ? 'accent' : 'neutral'}>{count}</Badge>
        <span className="ml-auto hidden text-xs text-[var(--text)]/45 sm:block">{descripcion}</span>
      </div>
      {count === 0 ? (
        <p className="px-4 py-6 text-center text-sm text-[var(--text)]/45">
          Nada pendiente aquí. 🎉
        </p>
      ) : (
        <ul className="divide-y divide-[var(--border)]/60">{children}</ul>
      )}
    </section>
  );
}

function Tarjeta({
  href,
  titulo,
  sub,
  right,
}: {
  href: string;
  titulo: string;
  sub?: string | null;
  right?: React.ReactNode;
}) {
  return (
    <li>
      <Link href={href} className="flex items-center gap-3 px-4 py-2.5 hover:bg-[var(--bg)]/40">
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium text-[var(--text)]">{titulo}</div>
          {sub ? <div className="truncate text-xs text-[var(--text)]/55">{sub}</div> : null}
        </div>
        {right}
        <ChevronRight className="h-4 w-4 shrink-0 text-[var(--text)]/30" />
      </Link>
    </li>
  );
}

function ObraEstadoBadge({ estado, fecha }: { estado: string | null; fecha: string | null }) {
  if (estado === 'con_observaciones') return <Badge tone="warning">con observaciones</Badge>;
  if (estado === 'programada')
    return <Badge tone="accent">{fecha ? `programada ${fecha}` : 'programada'}</Badge>;
  return <Badge tone="neutral">sin programar</Badge>;
}
