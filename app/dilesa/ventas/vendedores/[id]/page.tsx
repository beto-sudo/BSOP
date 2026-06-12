'use client';

/* eslint-disable react-hooks/set-state-in-effect --
 * Mismo data-sync pattern que el resto de páginas de detalle DILESA
 * (cf. app/dilesa/ventas/[id]/page.tsx).
 */

/**
 * @module Vendedor detail (DILESA)
 * @responsive desktop-only
 *
 * Detalle del vendedor — lista de sus ventas con click a cada detalle.
 * El "id" en la URL puede ser el nombre texto del vendedor (legacy del
 * Coda) o el UUID de `core.usuarios` cuando solo había `vendedor_usuario_id`.
 * El parser interno decide: parece UUID → filtra por `vendedor_usuario_id`;
 * si no, filtra por `vendedor` texto.
 *
 * Placeholder de v1 — el modelo "vendedor" no es robusto aún; cuando se
 * estandarice (vendedor_usuario_id en todas las ventas + tabla de perfil
 * vendedor), evolucionar a UUID-only.
 *
 * Gate: sub-slug `dilesa.ventas.vendedores` (ADR-030 SS5).
 */

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { RequireAccess } from '@/components/require-access';
import { createSupabaseBrowserClient } from '@/lib/supabase-browser';
import { Badge } from '@/components/ui/badge';
import { VENTA_ESTADO_CONFIG } from '@/lib/status-tokens';
import { Skeleton } from '@/components/ui/skeleton';
import { DILESA_EMPRESA_ID } from '@/lib/empresa-constants';
import { getSupabaseErrorMessage } from '@/lib/supabase-error';

type Venta = {
  id: string;
  persona_id: string;
  unidad_id: string | null;
  estado: string;
  fase_actual: string | null;
  fase_posicion: number | null;
  precio_asignacion: number | null;
  valor_escrituracion: number | null;
  valor_comercial: number | null;
  comision_vendedor: number | null;
  anticipo_comision: number | null;
  created_at: string;
};

type Persona = {
  id: string;
  nombre: string | null;
  apellido_paterno: string | null;
  apellido_materno: string | null;
};

const moneyFmt = new Intl.NumberFormat('es-MX', {
  style: 'currency',
  currency: 'MXN',
  maximumFractionDigits: 0,
});

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default function VendedorDetailPage() {
  return (
    <RequireAccess empresa="dilesa" modulo="dilesa.ventas.vendedores">
      <VendedorDetailBody />
    </RequireAccess>
  );
}

function VendedorDetailBody() {
  const params = useParams<{ id: string }>();
  const rawId = params.id ? decodeURIComponent(params.id) : '';
  const isUuid = UUID_RE.test(rawId);

  const [ventas, setVentas] = useState<Venta[]>([]);
  const [personasMap, setPersonasMap] = useState<Map<string, string>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    setLoading(true);
    setError(null);
    const sb = createSupabaseBrowserClient();

    let q = sb
      .schema('dilesa')
      .from('ventas')
      .select(
        'id, persona_id, unidad_id, estado, fase_actual, fase_posicion, precio_asignacion, valor_escrituracion, valor_comercial, comision_vendedor, anticipo_comision, created_at'
      )
      .eq('empresa_id', DILESA_EMPRESA_ID)
      .is('deleted_at', null);

    if (isUuid) q = q.eq('vendedor_usuario_id', rawId);
    else q = q.eq('vendedor', rawId);

    const { data, error: vErr } = await q.order('created_at', { ascending: false });
    if (vErr) {
      setError(getSupabaseErrorMessage(vErr, 'No se pudieron cargar las ventas del vendedor.'));
      setLoading(false);
      return;
    }
    const arr = (data ?? []) as Venta[];
    setVentas(arr);

    const personaIds = [...new Set(arr.map((v) => v.persona_id))];
    if (personaIds.length > 0) {
      const { data: pers } = await sb
        .schema('erp')
        .from('personas')
        .select('id, nombre, apellido_paterno, apellido_materno')
        .in('id', personaIds);
      const m = new Map<string, string>();
      for (const p of (pers ?? []) as Persona[]) {
        m.set(
          p.id,
          [p.nombre, p.apellido_paterno, p.apellido_materno].filter(Boolean).join(' ') ||
            '(sin nombre)'
        );
      }
      setPersonasMap(m);
    }
    setLoading(false);
  }, [rawId, isUuid]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const kpis = useMemo(() => {
    const montoTotal = ventas.reduce(
      (s, v) => s + (v.valor_escrituracion ?? v.precio_asignacion ?? v.valor_comercial ?? 0),
      0
    );
    const comisionTotal = ventas.reduce((s, v) => s + (v.comision_vendedor ?? 0), 0);
    const comisionPagada = ventas.reduce((s, v) => s + (v.anticipo_comision ?? 0), 0);
    return {
      total: ventas.length,
      activas: ventas.filter((v) => v.estado === 'activa').length,
      montoTotal,
      comisionTotal,
      comisionPagada,
      comisionPendiente: Math.max(0, comisionTotal - comisionPagada),
    };
  }, [ventas]);

  if (loading) {
    return (
      <div className="container mx-auto max-w-5xl space-y-6 px-4 py-6">
        <Skeleton className="h-5 w-40" />
        <Skeleton className="h-24 w-full rounded-lg" />
        <Skeleton className="h-64 w-full rounded-lg" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="container mx-auto max-w-5xl space-y-4 px-4 py-6">
        <BackLink />
        <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
          {error}
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto max-w-5xl space-y-6 px-4 py-6">
      <BackLink />

      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-[var(--text)]">
          {isUuid ? `Usuario ${rawId.slice(0, 8)}` : rawId}
        </h1>
        <p className="mt-1 text-sm text-[var(--text)]/60">
          {kpis.total} venta{kpis.total === 1 ? '' : 's'} · {kpis.activas} activa
          {kpis.activas === 1 ? '' : 's'}
        </p>
      </header>

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Kpi label="Monto total" value={moneyFmt.format(kpis.montoTotal)} />
        <Kpi label="Comisión total" value={moneyFmt.format(kpis.comisionTotal)} />
        <Kpi label="Anticipos" value={moneyFmt.format(kpis.comisionPagada)} />
        <Kpi label="Por pagar" value={moneyFmt.format(kpis.comisionPendiente)} />
      </section>

      <section className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-5">
        <h2 className="mb-4 text-sm font-medium uppercase tracking-wider text-[var(--text)]/60">
          Ventas
        </h2>
        {ventas.length === 0 ? (
          <p className="text-sm text-[var(--text)]/60">
            Sin ventas registradas para este vendedor.
          </p>
        ) : (
          <ol className="space-y-2">
            {ventas.map((v) => {
              const monto = v.valor_escrituracion ?? v.precio_asignacion ?? v.valor_comercial ?? 0;
              const clienteNombre = personasMap.get(v.persona_id) ?? '(sin nombre)';
              return (
                <li key={v.id}>
                  <Link
                    href={`/dilesa/ventas/${v.id}`}
                    className="flex flex-wrap items-baseline justify-between gap-2 rounded-md border border-[var(--border)] bg-[var(--bg)]/30 px-3 py-2 text-sm hover:border-[var(--accent)] hover:bg-[var(--bg)]/60"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium text-[var(--text)]">{clienteNombre}</div>
                      <div className="text-[11px] text-[var(--text)]/60">
                        {new Date(v.created_at).toLocaleDateString('es-MX', {
                          day: '2-digit',
                          month: 'short',
                          year: 'numeric',
                        })}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {v.fase_actual ? (
                        <Badge tone="neutral">
                          {v.fase_posicion ? `${v.fase_posicion}. ` : ''}
                          {v.fase_actual}
                        </Badge>
                      ) : null}
                      <Badge
                        tone={
                          VENTA_ESTADO_CONFIG[v.estado as keyof typeof VENTA_ESTADO_CONFIG]?.tone ??
                          'neutral'
                        }
                      >
                        {VENTA_ESTADO_CONFIG[v.estado as keyof typeof VENTA_ESTADO_CONFIG]?.label ??
                          v.estado}
                      </Badge>
                      <span className="tabular-nums text-sm font-medium text-[var(--text)]">
                        {moneyFmt.format(monto)}
                      </span>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ol>
        )}
      </section>
    </div>
  );
}

function BackLink() {
  return (
    <Link
      href="/dilesa/ventas/vendedores"
      className="inline-flex items-center gap-1.5 text-sm text-[var(--text)]/60 hover:text-[var(--text)]"
    >
      <ArrowLeft className="size-4" /> Volver a vendedores
    </Link>
  );
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] px-4 py-3">
      <div className="text-xs font-medium uppercase tracking-wider text-[var(--text)]/50">
        {label}
      </div>
      <div className="mt-1 text-lg font-semibold tabular-nums text-[var(--text)]">{value}</div>
    </div>
  );
}
