'use client';

/* eslint-disable react-hooks/set-state-in-effect --
 * Mismo data-sync pattern que el resto de páginas de detalle (cf.
 * app/dilesa/construccion/[id]/page.tsx).
 */

/**
 * Detalle de un contratista DILESA — 4 secciones:
 *   1. Datos generales — RFC, persona física/moral, representante legal,
 *      registro patronal, domicilio.
 *   2. KPIs derivados — obras en curso, terminadas, MO total pagada,
 *      MO pendiente, valor contratos totales.
 *   3. Obras asignadas — lista de construcciones donde es contratista,
 *      cada una linkeada a /dilesa/construccion/[id].
 *   4. Contratos — lista de contratos de construcción donde es
 *      contratista, con valor total + # lotes cubiertos.
 *
 * Lectura pura — la captura entra en Sprint 4.
 *
 * Iniciativa dilesa-construccion · Sprint 3 (UI lectura).
 */

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, HardHat, Plus, Users } from 'lucide-react';
import { RequireAccess } from '@/components/require-access';
import { createSupabaseBrowserClient } from '@/lib/supabase-browser';
import { usePermissions } from '@/components/providers';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { getSupabaseErrorMessage } from '@/lib/supabase-error';

type Persona = {
  id: string;
  nombre: string | null;
  apellido_paterno: string | null;
  apellido_materno: string | null;
  email: string | null;
  telefono: string | null;
  rfc: string | null;
  activo: boolean;
};

type ContratistaDatos = {
  abreviacion: string | null;
  persona_fisica_o_moral: string | null;
  representante_legal: string | null;
  repse: string | null;
  registro_patronal: string | null;
  retencion_pct: number | null;
  domicilio: string | null;
  activo: boolean;
  notas: string | null;
};

type Obra = {
  id: string;
  codigo: string;
  unidad_id: string;
  producto_id: string;
  estado: string;
  avance_pct: number;
  fecha_arranque: string | null;
  fecha_terminada: string | null;
  mo_ejecutado: number;
  valor_contrato_mo: number | null;
};

type Contrato = {
  id: string;
  codigo: string;
  fecha_contrato: string;
  valor_total: number;
  proyecto_id: string | null;
  lotesCount: number;
};

const moneyFmt = new Intl.NumberFormat('es-MX', {
  style: 'currency',
  currency: 'MXN',
  maximumFractionDigits: 0,
});

function fmtMoney(n: number | null): string | null {
  return n == null ? null : moneyFmt.format(n);
}

function fmtFecha(s: string | null): string | null {
  if (!s) return null;
  const d = new Date(`${s}T00:00:00`);
  if (isNaN(d.getTime())) return s;
  return d.toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' });
}

function avanceColorClass(pct: number): string {
  if (pct >= 66) return 'bg-emerald-500';
  if (pct >= 33) return 'bg-amber-500';
  if (pct >= 20) return 'bg-amber-400';
  return 'bg-rose-500';
}

const ENCURSO = new Set(['arrancada', 'en_progreso']);
const TERMINADA = new Set(['terminada', 'dtu', 'seguro_calidad', 'extraida']);

const ESTADO_LABEL: Record<string, string> = {
  arrancada: 'Arrancada',
  en_progreso: 'En progreso',
  terminada: 'Terminada',
  dtu: 'DTU',
  seguro_calidad: 'Seguro calidad',
  extraida: 'Extraída',
  cancelada: 'Cancelada',
};

/**
 * @module Contratista detail (DILESA)
 * @responsive desktop-only
 */
export default function ContratistaDetailPage() {
  return (
    <RequireAccess empresa="dilesa" modulo="dilesa.contratistas">
      <DetailInner />
    </RequireAccess>
  );
}

function DetailInner() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const { permissions } = usePermissions();
  const puedeCrearContrato =
    permissions.isAdmin || permissions.modulos.get('dilesa.construccion.contratos')?.write === true;

  const [persona, setPersona] = useState<Persona | null>(null);
  const [datos, setDatos] = useState<ContratistaDatos | null>(null);
  const [obras, setObras] = useState<Obra[]>([]);
  const [unidadIdentificadores, setUnidadIdentificadores] = useState<Map<string, string>>(
    new Map()
  );
  const [productoNombres, setProductoNombres] = useState<Map<string, string>>(new Map());
  const [contratos, setContratos] = useState<Contrato[]>([]);
  const [proyectoNombres, setProyectoNombres] = useState<Map<string, string>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    let activo = true;
    const sb = createSupabaseBrowserClient();
    setLoading(true);
    setError(null);

    (async () => {
      // Persona base + satélite + obras + contratos en paralelo.
      const [pRes, dRes, obrasRes, contratosRes] = await Promise.all([
        sb
          .schema('erp')
          .from('personas')
          .select('id, nombre, apellido_paterno, apellido_materno, email, telefono, rfc, activo')
          .eq('id', id)
          .eq('tipo', 'contratista')
          .maybeSingle(),
        sb
          .schema('dilesa')
          .from('contratistas_datos')
          .select(
            'abreviacion, persona_fisica_o_moral, representante_legal, repse, registro_patronal, retencion_pct, domicilio, activo, notas'
          )
          .eq('persona_id', id)
          .maybeSingle(),
        sb
          .schema('dilesa')
          .from('construccion')
          .select(
            'id, codigo, unidad_id, producto_id, estado, avance_pct, fecha_arranque, fecha_terminada, mo_ejecutado, valor_contrato_mo'
          )
          .eq('contratista_id', id)
          .is('deleted_at', null)
          .order('fecha_arranque', { ascending: false }),
        sb
          .schema('dilesa')
          .from('contratos_construccion')
          .select('id, codigo, fecha_contrato, valor_total, proyecto_id')
          .eq('contratista_id', id)
          .is('deleted_at', null)
          .order('fecha_contrato', { ascending: false }),
      ]);
      if (!activo) return;
      const firstErr = pRes.error ?? dRes.error ?? obrasRes.error ?? contratosRes.error;
      if (firstErr) {
        setError(getSupabaseErrorMessage(firstErr, 'No se pudo cargar el contratista.'));
        setLoading(false);
        return;
      }
      if (!pRes.data) {
        setError('Contratista no encontrado.');
        setLoading(false);
        return;
      }
      setPersona(pRes.data as unknown as Persona);
      setDatos((dRes.data as unknown as ContratistaDatos | null) ?? null);
      const obrasArr = (obrasRes.data ?? []) as Obra[];
      setObras(obrasArr);
      const contratosArrRaw = (contratosRes.data ?? []) as Array<Omit<Contrato, 'lotesCount'>>;

      // Lookups para enriquecer las obras (unidad identificador,
      // prototipo) y contratos (proyecto nombre + count de lotes).
      const unidadIds = [...new Set(obrasArr.map((o) => o.unidad_id))];
      const prodIds = [...new Set(obrasArr.map((o) => o.producto_id))];
      const contratoIds = contratosArrRaw.map((c) => c.id);
      const proyectoIds = [
        ...new Set(contratosArrRaw.map((c) => c.proyecto_id).filter((v): v is string => !!v)),
      ];

      const [uRes, prodRes, lotesRes, prjRes] = await Promise.all([
        unidadIds.length > 0
          ? sb.schema('dilesa').from('unidades').select('id, identificador').in('id', unidadIds)
          : Promise.resolve({ data: [], error: null }),
        prodIds.length > 0
          ? sb.schema('dilesa').from('productos').select('id, nombre').in('id', prodIds)
          : Promise.resolve({ data: [], error: null }),
        contratoIds.length > 0
          ? sb
              .schema('dilesa')
              .from('contrato_lotes')
              .select('contrato_id')
              .in('contrato_id', contratoIds)
              .is('deleted_at', null)
          : Promise.resolve({ data: [], error: null }),
        proyectoIds.length > 0
          ? sb.schema('dilesa').from('proyectos').select('id, nombre').in('id', proyectoIds)
          : Promise.resolve({ data: [], error: null }),
      ]);
      if (!activo) return;

      const uMap = new Map<string, string>();
      for (const u of uRes.data ?? []) uMap.set(u.id as string, u.identificador as string);
      setUnidadIdentificadores(uMap);

      const pMap = new Map<string, string>();
      for (const p of prodRes.data ?? []) pMap.set(p.id as string, p.nombre as string);
      setProductoNombres(pMap);

      const lotesByContrato = new Map<string, number>();
      for (const l of lotesRes.data ?? []) {
        const cid = l.contrato_id as string;
        lotesByContrato.set(cid, (lotesByContrato.get(cid) ?? 0) + 1);
      }

      setContratos(
        contratosArrRaw.map((c) => ({
          ...c,
          lotesCount: lotesByContrato.get(c.id) ?? 0,
        }))
      );

      const prjMap = new Map<string, string>();
      for (const p of prjRes.data ?? []) prjMap.set(p.id as string, p.nombre as string);
      setProyectoNombres(prjMap);

      setLoading(false);
    })();

    return () => {
      activo = false;
    };
  }, [id]);

  const nombreCompleto = useMemo(() => {
    if (!persona) return '';
    return (
      [persona.nombre, persona.apellido_paterno, persona.apellido_materno]
        .filter(Boolean)
        .join(' ') || '(sin nombre)'
    );
  }, [persona]);

  const kpis = useMemo(() => {
    let enCurso = 0;
    let terminadas = 0;
    let canceladas = 0;
    let moTotal = 0;
    let valorContratosObras = 0;
    for (const o of obras) {
      if (ENCURSO.has(o.estado)) enCurso += 1;
      else if (TERMINADA.has(o.estado)) terminadas += 1;
      else if (o.estado === 'cancelada') canceladas += 1;
      moTotal += Number(o.mo_ejecutado ?? 0);
      valorContratosObras += Number(o.valor_contrato_mo ?? 0);
    }
    const moPorEjecutar = Math.max(0, valorContratosObras - moTotal);
    const valorContratosTotales = contratos.reduce((s, c) => s + Number(c.valor_total ?? 0), 0);
    return {
      enCurso,
      terminadas,
      canceladas,
      moTotal,
      moPorEjecutar,
      valorContratosTotales,
    };
  }, [obras, contratos]);

  if (loading) {
    return (
      <div className="container mx-auto max-w-6xl space-y-6 px-4 py-6">
        <Skeleton className="h-5 w-40" />
        <Skeleton className="h-24 w-full rounded-lg" />
        <Skeleton className="h-32 w-full rounded-lg" />
        <Skeleton className="h-48 w-full rounded-lg" />
      </div>
    );
  }

  if (error || !persona) {
    return (
      <div className="container mx-auto max-w-6xl space-y-4 px-4 py-6">
        <BackLink />
        <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
          {error ?? 'Contratista no encontrado.'}
        </div>
      </div>
    );
  }

  const fichaGeneral: { label: string; value: string }[] = (
    [
      ['Abreviación', datos?.abreviacion ?? null],
      ['RFC', persona.rfc],
      ['Tipo', datos?.persona_fisica_o_moral ?? null],
      ['Representante legal', datos?.representante_legal ?? null],
      ['Registro patronal', datos?.registro_patronal ?? null],
      ['REPSE', datos?.repse ?? null],
      ['Retención', datos?.retencion_pct != null ? `${datos.retencion_pct.toFixed(2)}%` : null],
      ['Teléfono', persona.telefono],
      ['Email', persona.email],
      ['Domicilio', datos?.domicilio ?? null],
    ] as [string, string | null][]
  )
    .filter((r): r is [string, string] => r[1] != null && r[1] !== '')
    .map(([label, value]) => ({ label, value }));

  return (
    <div className="container mx-auto max-w-6xl space-y-6 px-4 py-6">
      <BackLink />

      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight text-[var(--text)]">
            <Users className="h-5 w-5 text-[var(--accent)]" />
            {nombreCompleto}
          </h1>
          {datos?.abreviacion ? (
            <p className="mt-1 text-xs uppercase tracking-wide text-[var(--text)]/50">
              {datos.abreviacion}
            </p>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {datos?.persona_fisica_o_moral ? (
            <Badge tone="neutral">{datos.persona_fisica_o_moral}</Badge>
          ) : null}
          {datos?.repse ? <Badge tone="success">REPSE</Badge> : null}
          {(datos ? datos.activo : persona.activo) ? (
            <Badge tone="success">Activo</Badge>
          ) : (
            <Badge tone="neutral">Inactivo</Badge>
          )}
        </div>
      </header>

      <Section title="Datos generales">
        {fichaGeneral.length === 0 ? (
          <p className="text-sm text-[var(--text)]/60">Sin datos registrados.</p>
        ) : (
          <FichaGrid rows={fichaGeneral} cols={3} />
        )}
        {datos?.notas ? (
          <div className="mt-4 border-t border-[var(--border)] pt-4">
            <div className="text-xs font-medium uppercase tracking-wide text-[var(--text)]/50">
              Notas
            </div>
            <p className="mt-0.5 whitespace-pre-wrap text-sm text-[var(--text)]/80">
              {datos.notas}
            </p>
          </div>
        ) : null}
      </Section>

      <Section title="KPIs">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
          <Kpi label="Obras en curso" value={kpis.enCurso.toString()} accent />
          <Kpi label="Obras terminadas" value={kpis.terminadas.toString()} />
          <Kpi label="Canceladas" value={kpis.canceladas.toString()} muted />
          <Kpi label="MO pagada" value={fmtMoney(kpis.moTotal) ?? '$0'} />
          <Kpi label="MO por ejecutar" value={fmtMoney(kpis.moPorEjecutar) ?? '$0'} />
          <Kpi label="Valor contratos" value={fmtMoney(kpis.valorContratosTotales) ?? '$0'} />
        </div>
      </Section>

      <Section
        title="Obras asignadas"
        description={obras.length === 0 ? 'sin obras' : `${obras.length} obra(s) en histórico`}
      >
        {obras.length === 0 ? (
          <p className="text-sm text-[var(--text)]/60">
            Este contratista todavía no tiene obras asignadas.
          </p>
        ) : (
          <ul className="space-y-1.5">
            {obras.map((o) => {
              const ident = unidadIdentificadores.get(o.unidad_id) ?? o.codigo;
              const proto = productoNombres.get(o.producto_id) ?? null;
              const protoSufijo = proto ? proto.split('-').pop() : null;
              const display = protoSufijo ? `${ident}-${protoSufijo}` : ident;
              return (
                <li key={o.id}>
                  <Link
                    href={`/dilesa/construccion/${o.id}`}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-[var(--border)] bg-[var(--bg)]/30 px-3 py-2 hover:border-[var(--accent)] hover:bg-[var(--bg)]/60"
                  >
                    <div className="flex items-center gap-2">
                      <HardHat className="h-4 w-4 text-[var(--text)]/40" />
                      <div>
                        <div className="text-sm font-medium text-[var(--text)]">{display}</div>
                        <div className="text-[11px] text-[var(--text)]/50">
                          {ESTADO_LABEL[o.estado] ?? o.estado}
                          {o.fecha_arranque ? ` · Arranque ${fmtFecha(o.fecha_arranque)}` : ''}
                          {o.fecha_terminada ? ` · Terminada ${fmtFecha(o.fecha_terminada)}` : ''}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="flex items-center gap-2">
                        <div className="h-1.5 w-24 overflow-hidden rounded-full bg-[var(--border)]/40">
                          <div
                            className={`h-full rounded-full ${avanceColorClass(o.avance_pct)}`}
                            style={{
                              width: `${Math.min(100, Math.max(0, o.avance_pct))}%`,
                            }}
                          />
                        </div>
                        <span className="w-9 shrink-0 text-right text-xs tabular-nums text-[var(--text)]/70">
                          {o.avance_pct.toFixed(0)}%
                        </span>
                      </div>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </Section>

      <Section
        title="Contratos"
        description={
          contratos.length === 0
            ? 'sin contratos'
            : `${contratos.length} contrato(s) · ${moneyFmt.format(kpis.valorContratosTotales)}`
        }
        action={
          puedeCrearContrato ? (
            <Link
              href={`/dilesa/construccion/contratos/nuevo?contratista=${id}`}
              className="inline-flex h-8 items-center gap-1.5 rounded-md bg-[var(--accent)] px-3 text-xs font-medium text-white hover:opacity-90"
            >
              <Plus className="h-3 w-3" />
              Crear contrato
            </Link>
          ) : null
        }
      >
        {contratos.length === 0 ? (
          <p className="text-sm text-[var(--text)]/60">
            Este contratista no tiene contratos de construcción registrados.
          </p>
        ) : (
          <ul className="space-y-2">
            {contratos.map((c) => (
              <li
                key={c.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-[var(--border)] bg-[var(--bg)]/30 px-3 py-2"
              >
                <div>
                  <div className="text-sm font-medium text-[var(--text)]">{c.codigo}</div>
                  <div className="text-xs text-[var(--text)]/50">
                    {fmtFecha(c.fecha_contrato)}
                    {c.proyecto_id ? ` · ${proyectoNombres.get(c.proyecto_id) ?? ''}` : ''}
                    {c.lotesCount > 0 ? ` · ${c.lotesCount} lote(s)` : ''}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-xs uppercase tracking-wide text-[var(--text)]/50">
                    Valor total
                  </div>
                  <div className="text-sm tabular-nums text-[var(--text)]">
                    {moneyFmt.format(c.valor_total)}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  );
}

// ── Sub-componentes ──────────────────────────────────────────────────────

function BackLink() {
  return (
    <Link
      href="/dilesa/contratistas"
      className="inline-flex items-center gap-1.5 text-sm text-[var(--text)]/60 hover:text-[var(--text)]"
    >
      <ArrowLeft className="size-4" /> Volver a contratistas
    </Link>
  );
}

function Section({
  title,
  description,
  action,
  children,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-5">
      <div className="mb-4 flex items-baseline justify-between gap-3">
        <div className="flex items-baseline gap-3">
          <h2 className="text-sm font-medium uppercase tracking-wider text-[var(--text)]/60">
            {title}
          </h2>
          {description ? (
            <span className="text-xs text-[var(--text)]/50">{description}</span>
          ) : null}
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
      {children}
    </section>
  );
}

function FichaGrid({ rows, cols = 2 }: { rows: { label: string; value: string }[]; cols?: 2 | 3 }) {
  const gridCls =
    cols === 3
      ? 'grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2 lg:grid-cols-3'
      : 'grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2';
  return (
    <dl className={gridCls}>
      {rows.map((r) => (
        <div key={r.label}>
          <dt className="text-xs font-medium uppercase tracking-wide text-[var(--text)]/50">
            {r.label}
          </dt>
          <dd className="mt-0.5 text-sm text-[var(--text)]">{r.value}</dd>
        </div>
      ))}
    </dl>
  );
}

function Kpi({
  label,
  value,
  accent = false,
  muted = false,
}: {
  label: string;
  value: string;
  accent?: boolean;
  muted?: boolean;
}) {
  return (
    <div
      className={
        'rounded-md border bg-[var(--bg)]/30 px-3 py-2 ' +
        (accent
          ? 'border-[var(--accent)]/40'
          : muted
            ? 'border-[var(--border)] opacity-60'
            : 'border-[var(--border)]')
      }
    >
      <div className="text-[10px] font-medium uppercase tracking-wider text-[var(--text)]/50">
        {label}
      </div>
      <div className="mt-0.5 text-lg font-semibold tabular-nums text-[var(--text)]">{value}</div>
    </div>
  );
}
