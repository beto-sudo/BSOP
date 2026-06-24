'use client';

/* eslint-disable react-hooks/set-state-in-effect --
 * Mismo data-sync pattern que el resto de páginas de detalle DILESA
 * (cf. app/dilesa/ventas/[id]/page.tsx).
 */

/**
 * @module Cliente detail (DILESA)
 * @responsive desktop-only
 *
 * Detalle de un cliente del hub Ventas (sprint tabs-hub). Ficha de datos +
 * lista compacta de sus ventas con KPIs en el header (# ventas, monto total,
 * # activas). Cada venta linkea a su detalle (`/dilesa/ventas/[id]`).
 *
 * Edición de la ficha: botón "Editar" visible solo para Dirección/admin; el
 * guardado pega a `PATCH /api/dilesa/clientes/[id]` (gate + audit server-side).
 *
 * Gate de la page: sub-slug `dilesa.ventas.clientes` (ADR-030 SS5).
 */

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Pencil } from 'lucide-react';
import { RequireAccess } from '@/components/require-access';
import { createSupabaseBrowserClient } from '@/lib/supabase-browser';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { VENTA_ESTADO_CONFIG } from '@/lib/status-tokens';
import { Skeleton } from '@/components/ui/skeleton';
import { DILESA_EMPRESA_ID } from '@/lib/empresa-constants';
import { getSupabaseErrorMessage } from '@/lib/supabase-error';
import { useEffectiveUser } from '@/components/providers';
import { domicilioTexto } from '@/lib/dilesa/kyc-efectivo';
import { ClienteEditarDrawer } from '@/components/dilesa/cliente-editar-drawer';
import type { ClienteEditInput } from '@/lib/dilesa/cliente-edit';

type Persona = {
  nombre: string | null;
  apellido_paterno: string | null;
  apellido_materno: string | null;
  email: string | null;
  telefono: string | null;
  curp: string | null;
  rfc: string | null;
  nss: string | null;
  numero_credencial_ine: string | null;
  fecha_nacimiento: string | null;
  estado_civil: string | null;
  nacionalidad: string | null;
  tipo_persona: string | null;
  domicilio: string | null;
  domicilio_calle: string | null;
  domicilio_numero_exterior: string | null;
  domicilio_numero_interior: string | null;
  domicilio_colonia: string | null;
  domicilio_codigo_postal: string | null;
  domicilio_ciudad: string | null;
  domicilio_estado: string | null;
  ocupacion: string | null;
  es_pep: boolean | null;
  forma_pago_kyc: string | null;
  uso_efectivo_kyc: string | null;
  conocimiento_dueno_beneficiario: string | null;
};

const PERSONA_COLS =
  'nombre, apellido_paterno, apellido_materno, email, telefono, curp, rfc, nss, ' +
  'numero_credencial_ine, fecha_nacimiento, estado_civil, nacionalidad, tipo_persona, ' +
  'domicilio, domicilio_calle, domicilio_numero_exterior, domicilio_numero_interior, ' +
  'domicilio_colonia, domicilio_codigo_postal, domicilio_ciudad, domicilio_estado, ' +
  'ocupacion, es_pep, forma_pago_kyc, uso_efectivo_kyc, conocimiento_dueno_beneficiario';

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

function aEditInput(p: Persona): ClienteEditInput {
  const s = (v: string | null) => v ?? '';
  return {
    nombre: s(p.nombre),
    apellido_paterno: s(p.apellido_paterno),
    apellido_materno: s(p.apellido_materno),
    curp: s(p.curp),
    rfc: s(p.rfc),
    nss: s(p.nss),
    numero_credencial_ine: s(p.numero_credencial_ine),
    fecha_nacimiento: s(p.fecha_nacimiento),
    estado_civil: s(p.estado_civil),
    nacionalidad: s(p.nacionalidad),
    tipo_persona: p.tipo_persona === 'moral' ? 'moral' : 'fisica',
    email: s(p.email),
    telefono: s(p.telefono),
    domicilio_calle: s(p.domicilio_calle),
    domicilio_numero_exterior: s(p.domicilio_numero_exterior),
    domicilio_numero_interior: s(p.domicilio_numero_interior),
    domicilio_colonia: s(p.domicilio_colonia),
    domicilio_codigo_postal: s(p.domicilio_codigo_postal),
    domicilio_ciudad: s(p.domicilio_ciudad),
    domicilio_estado: s(p.domicilio_estado),
    ocupacion: s(p.ocupacion),
    es_pep: p.es_pep ?? false,
    forma_pago_kyc: s(p.forma_pago_kyc),
    uso_efectivo_kyc: s(p.uso_efectivo_kyc),
    conocimiento_dueno_beneficiario: s(p.conocimiento_dueno_beneficiario) || 'No',
  };
}

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

  const { data: eu } = useEffectiveUser();
  const puedeEditar = !!eu && (eu.isAdmin || eu.direccionEmpresaIds.includes(DILESA_EMPRESA_ID));

  const [persona, setPersona] = useState<Persona | null>(null);
  const [ventas, setVentas] = useState<Venta[]>([]);
  const [unidadInfo, setUnidadInfo] = useState<Map<string, Unidad>>(new Map());
  const [proyectoNombre, setProyectoNombre] = useState<Map<string, string>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    if (!id) return;
    let activo = true;
    const sb = createSupabaseBrowserClient();
    setLoading(true);
    setError(null);

    (async () => {
      const [pRes, vRes] = await Promise.all([
        sb.schema('erp').from('personas').select(PERSONA_COLS).eq('id', id).maybeSingle(),
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
  }, [id, refreshKey]);

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

  const tipoPersonaLabel = persona.tipo_persona === 'moral' ? 'Persona Moral' : 'Persona Física';

  return (
    <div className="container mx-auto max-w-5xl space-y-6 px-4 py-6">
      <BackLink />

      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight text-[var(--text)]">
            {nombreCliente}
          </h1>
          <p className="mt-1 text-sm text-[var(--text)]/60">
            {[persona.email, persona.telefono, persona.curp, persona.rfc]
              .filter(Boolean)
              .join(' · ') || 'Sin datos de contacto.'}
          </p>
        </div>
        {puedeEditar ? (
          <Button variant="outline" onClick={() => setEditOpen(true)}>
            <Pencil className="size-4" /> Editar
          </Button>
        ) : null}
      </header>

      <section className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Kpi label="# Ventas" value={ventas.length} />
        <Kpi label="# Activas" value={numActivas} />
        <Kpi label="Monto total" value={moneyFmt.format(montoTotal)} />
      </section>

      <section className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-5">
        <h2 className="mb-4 text-sm font-medium uppercase tracking-wider text-[var(--text)]/60">
          Datos del cliente
        </h2>
        <div className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-3">
          <Dato label="CURP" value={persona.curp} mono />
          <Dato label="RFC" value={persona.rfc} mono />
          <Dato label="NSS" value={persona.nss} mono />
          <Dato label="INE" value={persona.numero_credencial_ine} mono />
          <Dato label="Fecha de nacimiento" value={persona.fecha_nacimiento} />
          <Dato label="Estado civil" value={persona.estado_civil} />
          <Dato label="Nacionalidad" value={persona.nacionalidad} />
          <Dato label="Tipo de persona" value={tipoPersonaLabel} />
          <Dato label="Ocupación" value={persona.ocupacion} />
          <Dato label="Forma de pago" value={persona.forma_pago_kyc} />
          <Dato label="Uso de efectivo" value={persona.uso_efectivo_kyc} />
          <Dato label="PEP" value={persona.es_pep == null ? null : persona.es_pep ? 'Sí' : 'No'} />
          <div className="sm:col-span-3">
            <Dato label="Domicilio" value={domicilioTexto(persona)} />
          </div>
        </div>
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

      {puedeEditar ? (
        <ClienteEditarDrawer
          id={id}
          open={editOpen}
          onOpenChange={setEditOpen}
          inicial={aEditInput(persona)}
          onSaved={() => setRefreshKey((k) => k + 1)}
        />
      ) : null}
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

function Dato({ label, value, mono }: { label: string; value: string | null; mono?: boolean }) {
  return (
    <div>
      <div className="text-xs font-medium uppercase tracking-wide text-[var(--text)]/50">
        {label}
      </div>
      <div className={`mt-0.5 text-sm text-[var(--text)] ${mono ? 'font-mono' : ''}`}>
        {value && value.trim() !== '' ? value : '—'}
      </div>
    </div>
  );
}
