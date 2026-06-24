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
import {
  Banknote,
  ChevronRight,
  ClipboardList,
  Clock,
  HardHat,
  KeyRound,
  Lock,
  Star,
} from 'lucide-react';
import { RequireAccess } from '@/components/require-access';
import { createSupabaseBrowserClient } from '@/lib/supabase-browser';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { ModuleKpiStrip, type ModuleKpi } from '@/components/module-page';
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
  // F12 (Detonada) cerrada = pago recibido. Sin esto no se puede entregar.
  pago_detonado: boolean | null;
  // Nombre de la fase actual (Escriturada / Detonada / Facturada / …).
  fase_actual: string | null;
  // Días desde que alcanzó su fase actual (para el chip de urgencia).
  dias_en_fase: number | null;
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

type Kpi = {
  encuestas_respondidas: number | null;
  encuestas_total: number | null;
  nps_prom: number | null;
  calif_vivienda_prom: number | null;
  calif_proceso_prom: number | null;
};

type UrgenciaTono = 'danger' | 'warning' | 'neutral';

/**
 * Urgencia de una venta en cola de pre-entrega/entrega. La detonación manda:
 * Atención a Clientes solo puede accionar sobre las detonadas (las escrituradas
 * esperan el pago, que es de Cobranza). Decisión de Beto (2026-06-23):
 *   - entrega + detonada     → rojo (solo falta el acto físico de entrega).
 *   - entrega sin pago        → neutral (bloqueada: "Falta pago").
 *   - pre-entrega + detonada  → rojo si lleva >3 días, ámbar si es reciente.
 *   - pre-entrega sin detonar → ámbar si lleva >21 días (estancada), si no neutral.
 */
function urgenciaTono(v: VentaEntrega): UrgenciaTono {
  const d = v.dias_en_fase;
  if (v.cola === 'entrega') return v.pago_detonado ? 'danger' : 'neutral';
  if (v.pago_detonado) return d != null && d > 3 ? 'danger' : 'warning';
  return d != null && d > 21 ? 'warning' : 'neutral';
}

const URGENCIA_RANK: Record<UrgenciaTono, number> = { danger: 0, warning: 1, neutral: 2 };

/** Orden de cola: lo más urgente primero, y a igual urgencia, más días arriba. */
function porUrgencia(a: VentaEntrega, b: VentaEntrega): number {
  const ra = URGENCIA_RANK[urgenciaTono(a)];
  const rb = URGENCIA_RANK[urgenciaTono(b)];
  if (ra !== rb) return ra - rb;
  return (b.dias_en_fase ?? -1) - (a.dias_en_fase ?? -1);
}

/** Chip de urgencia: fase actual + días en fase, coloreado por urgenciaTono. */
function UrgenciaChip({ venta }: { venta: VentaEntrega }) {
  const enEntrega = venta.cola === 'entrega';
  const sinPago = !venta.pago_detonado;
  const Icono =
    enEntrega && sinPago ? Lock : enEntrega ? KeyRound : venta.pago_detonado ? Banknote : Clock;
  const label =
    enEntrega && sinPago
      ? 'Falta pago'
      : enEntrega
        ? 'Entregar'
        : (venta.fase_actual ?? (venta.pago_detonado ? 'Detonar crédito' : 'Escriturar'));
  return (
    <Badge tone={urgenciaTono(venta)}>
      <Icono />
      {label}
      {venta.dias_en_fase != null ? (
        <span className="opacity-70">· {venta.dias_en_fase} d</span>
      ) : null}
    </Badge>
  );
}

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
  const [kpi, setKpi] = useState<Kpi | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let activo = true;
    (async () => {
      const sb = createSupabaseBrowserClient();
      const [o, v, e, k] = await Promise.all([
        sb.schema('dilesa').from('v_ac_obras_por_recibir').select('*'),
        sb.schema('dilesa').from('v_ac_ventas_entrega').select('*'),
        sb.schema('dilesa').from('v_ac_encuestas_pendientes').select('*'),
        sb.schema('dilesa').from('v_ac_kpis').select('*').maybeSingle(),
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
      setKpi((k.data as Kpi | null) ?? null);
      setLoading(false);
    })();
    return () => {
      activo = false;
    };
  }, []);

  const preEntrega = useMemo(
    () => ventas.filter((v) => v.cola === 'pre_entrega').sort(porUrgencia),
    [ventas]
  );
  const entrega = useMemo(
    () => ventas.filter((v) => v.cola === 'entrega').sort(porUrgencia),
    [ventas]
  );

  const kpis: ModuleKpi[] = useMemo(() => {
    const respondidas = kpi?.encuestas_respondidas ?? 0;
    const nps = kpi?.nps_prom;
    const calif = kpi?.calif_vivienda_prom;
    return [
      { key: 'obras', label: 'Obras por recibir', value: obras.length },
      { key: 'entregar', label: 'Por entregar', value: preEntrega.length + entrega.length },
      { key: 'encuestas', label: 'Encuestas pendientes', value: encuestas.length },
      {
        key: 'nps',
        label: 'NPS',
        value: nps != null ? `${nps}` : '—',
        valueClassName:
          nps == null
            ? 'text-[var(--text)]/40'
            : nps >= 9
              ? 'text-emerald-500'
              : nps >= 7
                ? 'text-amber-500'
                : 'text-red-500',
      },
      {
        key: 'calif',
        label: `Satisfacción vivienda${respondidas ? ` (${respondidas} resp.)` : ''}`,
        value: calif != null ? `${calif}/5` : '—',
        valueClassName: calif == null ? 'text-[var(--text)]/40' : undefined,
      },
    ];
  }, [obras.length, preEntrega.length, entrega.length, encuestas.length, kpi]);

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

      <ModuleKpiStrip stats={kpis} cols={5} />

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
            right={<UrgenciaChip venta={v} />}
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
            right={<UrgenciaChip venta={v} />}
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
