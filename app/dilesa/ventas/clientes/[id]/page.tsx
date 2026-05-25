'use client';

/* eslint-disable react-hooks/set-state-in-effect --
 * Mismo data-sync pattern que el resto de páginas de detalle DILESA
 * (cf. app/dilesa/ventas/[id]/page.tsx).
 */

/**
 * @module Cliente detail (DILESA)
 * @responsive desktop-only
 *
 * Detalle de un cliente del hub Ventas (sprint tabs-hub). Lista compacta
 * de sus ventas con KPIs en el header (# ventas, monto total, # activas).
 * Cada venta linkea a su detalle (`/dilesa/ventas/[id]`).
 *
 * Gate: sub-slug `dilesa.ventas.clientes` (ADR-030 SS5).
 */

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { RequireAccess } from '@/components/require-access';
import { createSupabaseBrowserClient } from '@/lib/supabase-browser';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { DILESA_EMPRESA_ID } from '@/lib/empresa-constants';
import { getSupabaseErrorMessage } from '@/lib/supabase-error';

type Persona = {
  nombre: string | null;
  apellido_paterno: string | null;
  apellido_materno: string | null;
  email: string | null;
  telefono: string | null;
  curp: string | null;
  rfc: string | null;
};

type Venta = {
  id: string;
  unidad_id: string | null;
  estado: string;
  fase_actual: string | null;
  fase_posicion: number | null;
  precio_asignacion: number | null;
  valor_escrituracion: number | null;
  valor_comercial: number | null;
  vendedor: string | null;
  created_at: string;
};

type Unidad = {
  id: string;
  identificador: string;
  proyecto_id: string | null;
};

const moneyFmt = new Intl.NumberFormat('es-MX', {
  style: 'currency',
  currency: 'MXN',
  maximumFractionDigits: 0,
});

export default function ClienteDetailPage() {
  return (
    <RequireAccess empresa="dilesa" modulo="dilesa.ventas.clientes">
      <ClienteDetailBody />
    </RequireAccess>
  );
}

function ClienteDetailBody() {
  const params = useParams<{ id: string }>();
  const id = params.id;

  const [persona, setPersona] = useState<Persona | null>(null);
  const [ventas, setVentas] = useState<Venta[]>([]);
  const [unidadInfo, setUnidadInfo] = useState<Map<string, Unidad>>(new Map());
  const [proyectoNombre, setProyectoNombre] = useState<Map<string, string>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    let activo = true;
    const sb = createSupabaseBrowserClient();
    setLoading(true);
    setError(null);

    (async () => {
      const [pRes, vRes] = await Promise.all([
        sb
          .schema('erp')
          .from('personas')
          .select('nombre, apellido_paterno, apellido_materno, email, telefono, curp, rfc')
          .eq('id', id)
          .maybeSingle(),
        sb
          .schema('dilesa')
          .from('ventas')
          .select(
            'id, unidad_id, estado, fase_actual, fase_posicion, precio_asignacion, valor_escrituracion, valor_comercial, vendedor, created_at'
          )
          .eq('empresa_id', DILESA_EMPRESA_ID)
          .eq('persona_id', id)
          .is('deleted_at', null)
          .order('created_at', { ascending: false }),
      ]);
      if (!activo) return;
      const firstErr = pRes.error ?? vRes.error;
      if (firstErr) {
        setError(getSupabaseErrorMessage(firstErr, 'No se pudo cargar el cliente.'));
        setLoading(false);
        return;
      }
      setPersona((pRes.data as unknown as Persona) ?? null);
      const ventasArr = (vRes.data ?? []) as Venta[];
      setVentas(ventasArr);

      // Cargar unidades + proyectos para nombres legibles.
      const unidadIds = [
        ...new Set(ventasArr.map((v) => v.unidad_id).filter((x): x is string => !!x)),
      ];
      if (unidadIds.length > 0) {
        const { data: uns, error: uErr } = await sb
          .schema('dilesa')
          .from('unidades')
          .select('id, identificador, proyecto_id')
          .in('id', unidadIds);
        if (!activo) return;
        if (uErr) {
          // No bloqueamos — KPIs siguen sin nombres
          console.warn('No se pudieron cargar unidades:', uErr.message);
        } else {
          const uMap = new Map<string, Unidad>();
          for (const u of (uns ?? []) as Unidad[]) uMap.set(u.id, u);
          setUnidadInfo(uMap);

          const proyectoIds = [
            ...new Set((uns ?? []).map((u) => u.proyecto_id).filter((x): x is string => !!x)),
          ];
          if (proyectoIds.length > 0) {
            const { data: prjs } = await sb
              .schema('dilesa')
              .from('proyectos')
              .select('id, nombre')
              .in('id', proyectoIds);
            if (!activo) return;
            const pMap = new Map<string, string>();
            for (const p of (prjs ?? []) as Array<{ id: string; nombre: string }>) {
              pMap.set(p.id, p.nombre);
            }
            setProyectoNombre(pMap);
          }
        }
      }
      setLoading(false);
    })();

    return () => {
      activo = false;
    };
  }, [id]);

  const nombreCliente = useMemo(() => {
    if (!persona) return '';
    return (
      [persona.nombre, persona.apellido_paterno, persona.apellido_materno]
        .filter(Boolean)
        .join(' ') || '(sin nombre)'
    );
  }, [persona]);

  const montoTotal = useMemo(
    () =>
      ventas.reduce(
        (s, v) => s + (v.valor_escrituracion ?? v.precio_asignacion ?? v.valor_comercial ?? 0),
        0
      ),
    [ventas]
  );
  const numActivas = useMemo(() => ventas.filter((v) => v.estado === 'activa').length, [ventas]);

  if (loading) {
    return (
      <div className="container mx-auto max-w-5xl space-y-6 px-4 py-6">
        <Skeleton className="h-5 w-40" />
        <Skeleton className="h-24 w-full rounded-lg" />
        <Skeleton className="h-64 w-full rounded-lg" />
      </div>
    );
  }

  if (error || !persona) {
    return (
      <div className="container mx-auto max-w-5xl space-y-4 px-4 py-6">
        <BackLink />
        <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
          {error ?? 'Cliente no encontrado.'}
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto max-w-5xl space-y-6 px-4 py-6">
      <BackLink />

      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-[var(--text)]">
            {nombreCliente}
          </h1>
          <p className="mt-1 text-sm text-[var(--text)]/60">
            {[persona.email, persona.telefono, persona.curp, persona.rfc]
              .filter(Boolean)
              .join(' · ') || 'Sin datos de contacto.'}
          </p>
        </div>
      </header>

      <section className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Kpi label="# Ventas" value={ventas.length} />
        <Kpi label="# Activas" value={numActivas} />
        <Kpi label="Monto total" value={moneyFmt.format(montoTotal)} />
      </section>

      <section className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-5">
        <h2 className="mb-4 text-sm font-medium uppercase tracking-wider text-[var(--text)]/60">
          Timeline de ventas
        </h2>
        {ventas.length === 0 ? (
          <p className="text-sm text-[var(--text)]/60">Sin ventas registradas.</p>
        ) : (
          <ol className="space-y-2">
            {ventas.map((v) => {
              const u = v.unidad_id ? unidadInfo.get(v.unidad_id) : null;
              const proyecto = u?.proyecto_id ? proyectoNombre.get(u.proyecto_id) : null;
              const monto = v.valor_escrituracion ?? v.precio_asignacion ?? v.valor_comercial ?? 0;
              return (
                <li key={v.id}>
                  <Link
                    href={`/dilesa/ventas/${v.id}`}
                    className="flex flex-wrap items-baseline justify-between gap-2 rounded-md border border-[var(--border)] bg-[var(--bg)]/30 px-3 py-2 text-sm hover:border-[var(--accent)] hover:bg-[var(--bg)]/60"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium text-[var(--text)]">
                        {proyecto ?? '—'} {u ? `· ${u.identificador}` : ''}
                      </div>
                      <div className="text-[11px] text-[var(--text)]/60">
                        {new Date(v.created_at).toLocaleDateString('es-MX', {
                          day: '2-digit',
                          month: 'short',
                          year: 'numeric',
                        })}
                        {v.vendedor ? ` · vendedor ${v.vendedor}` : ''}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {v.fase_actual ? (
                        <Badge tone="neutral">
                          {v.fase_posicion ? `${v.fase_posicion}. ` : ''}
                          {v.fase_actual}
                        </Badge>
                      ) : null}
                      <Badge tone={v.estado === 'activa' ? 'info' : 'neutral'}>
                        {v.estado === 'activa' ? 'Activa' : v.estado}
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
      href="/dilesa/ventas/clientes"
      className="inline-flex items-center gap-1.5 text-sm text-[var(--text)]/60 hover:text-[var(--text)]"
    >
      <ArrowLeft className="size-4" /> Volver a clientes
    </Link>
  );
}

function Kpi({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] px-4 py-3">
      <div className="text-xs font-medium uppercase tracking-wider text-[var(--text)]/50">
        {label}
      </div>
      <div className="mt-1 text-2xl font-semibold tabular-nums text-[var(--text)]">{value}</div>
    </div>
  );
}
