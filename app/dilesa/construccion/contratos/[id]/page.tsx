'use client';

/* eslint-disable react-hooks/set-state-in-effect --
 * Mismo data-sync pattern que el resto de páginas de detalle DILESA (cf.
 * app/dilesa/construccion/[id]/page.tsx).
 */

/**
 * Detalle de un contrato de construcción (DILESA) — 3 secciones:
 *   1. Datos generales — código, fecha, contratista (con abrev),
 *      proyecto, valor total, fianzas URL si hay, notas.
 *   2. Lotes asignados — tabla con código construcción + unidad +
 *      prototipo + avance% + valor MO del lote (monto_lote).
 *   3. KPIs derivados — MO total, MO ejecutado vs por ejecutar (sumando
 *      `mo_ejecutado` y `valor_contrato_mo` de las obras vinculadas),
 *      avance promedio.
 *
 * Cross-schema queries siguiendo el patrón ventas-module: sin embeds
 * PostgREST, lookups en memoria.
 *
 * Iniciativa dilesa-construccion · Sprint tabs+protos. Acceso vía
 * sub-slug `dilesa.construccion.contratos` (lectura — el mismo sub-slug
 * gobierna también el form de captura desde Sprint 4).
 */

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  Ban,
  Download,
  ExternalLink,
  FileText,
  HardHat,
  Loader2,
  Save,
} from 'lucide-react';
import { CancelarConMotivoDialog } from '@/components/shared/cancelar-con-motivo-dialog';
import { RequireAccess } from '@/components/require-access';
import { createSupabaseBrowserClient } from '@/lib/supabase-browser';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/components/ui/toast';
import { usePermissions } from '@/components/providers';
import { getSupabaseErrorMessage } from '@/lib/supabase-error';
import { DILESA_EMPRESA_ID } from '@/lib/empresa-constants';
import { buildPartidaIndex, type PartidaGrupo } from '@/lib/compras/partidas';
import { OBJETOS_COMUNES } from '@/lib/dilesa/objetos-obra';
import { ObraContratoDetalle } from '@/components/dilesa/obra-contrato-detalle';

type Contrato = {
  id: string;
  codigo: string;
  fecha_contrato: string;
  contratista_id: string;
  proyecto_id: string | null;
  valor_total: number;
  fianzas_url: string | null;
  notas: string | null;
  tipo: string;
  anticipo_pct: number | null;
  retencion_pct: number | null;
  partida_id: string | null;
  objeto: string | null;
  fecha_inicio: string | null;
  fecha_fin: string | null;
  fianza_pct: number | null;
  periodicidad_estimaciones_dias: number | null;
  cancelada_at: string | null;
  motivo_cancelacion: string | null;
};

type Lote = {
  id: string;
  contrato_id: string;
  construccion_id: string;
  monto_lote: number | null;
};

type Construccion = {
  id: string;
  codigo: string;
  unidad_id: string;
  producto_id: string;
  avance_pct: number;
  estado: string;
  mo_ejecutado: number;
  valor_contrato_mo: number | null;
  m2_construccion: number | null;
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
 * @module Construcción · Contrato detail (DILESA)
 * @responsive desktop-only
 */
export default function ContratoDetailPage() {
  return (
    <RequireAccess empresa="dilesa" modulo="dilesa.construccion.contratos">
      <DetailInner />
    </RequireAccess>
  );
}

function DetailInner() {
  const params = useParams<{ id: string }>();
  const id = params.id;

  const [contrato, setContrato] = useState<Contrato | null>(null);
  const [contratistaNombre, setContratistaNombre] = useState<string | null>(null);
  const [contratistaAbrev, setContratistaAbrev] = useState<string | null>(null);
  const [proyectoNombre, setProyectoNombre] = useState<string | null>(null);
  const [lotes, setLotes] = useState<Lote[]>([]);
  const [obrasByConstruccionId, setObrasByConstruccionId] = useState<Map<string, Construccion>>(
    new Map()
  );
  const [unidadById, setUnidadById] = useState<Map<string, string>>(new Map());
  const [productoById, setProductoById] = useState<Map<string, string>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    let activo = true;
    const sb = createSupabaseBrowserClient();
    setLoading(true);
    setError(null);

    (async () => {
      const { data: cRow, error: cErr } = await sb
        .schema('dilesa')
        .from('contratos_construccion')
        .select('*')
        .eq('id', id)
        .is('deleted_at', null)
        .maybeSingle();
      if (!activo) return;
      if (cErr) {
        setError(getSupabaseErrorMessage(cErr, 'No se pudo cargar el contrato.'));
        setLoading(false);
        return;
      }
      if (!cRow) {
        setError('Contrato no encontrado.');
        setLoading(false);
        return;
      }
      const ctrRow = cRow as unknown as Contrato;
      setContrato(ctrRow);

      const [persRes, datosRes, prjRes, lotesRes] = await Promise.all([
        sb
          .schema('erp')
          .from('personas')
          .select('nombre, apellido_paterno, apellido_materno')
          .eq('id', ctrRow.contratista_id)
          .maybeSingle(),
        sb
          .schema('dilesa')
          .from('contratistas_datos')
          .select('abreviacion')
          .eq('persona_id', ctrRow.contratista_id)
          .maybeSingle(),
        ctrRow.proyecto_id
          ? sb
              .schema('dilesa')
              .from('proyectos')
              .select('nombre')
              .eq('id', ctrRow.proyecto_id)
              .maybeSingle()
          : Promise.resolve({ data: null, error: null }),
        sb
          .schema('dilesa')
          .from('contrato_lotes')
          .select('id, contrato_id, construccion_id, monto_lote')
          .eq('contrato_id', ctrRow.id)
          .is('deleted_at', null),
      ]);
      if (!activo) return;
      const firstErr = persRes.error ?? datosRes.error ?? prjRes.error ?? lotesRes.error;
      if (firstErr) {
        setError(getSupabaseErrorMessage(firstErr, 'No se pudo cargar el detalle.'));
        setLoading(false);
        return;
      }
      const cName = persRes.data
        ? [persRes.data.nombre, persRes.data.apellido_paterno, persRes.data.apellido_materno]
            .filter(Boolean)
            .join(' ')
        : null;
      setContratistaNombre(cName);
      setContratistaAbrev((datosRes.data?.abreviacion as string | null) ?? null);
      setProyectoNombre((prjRes.data?.nombre as string | null) ?? null);
      const lotesArr = (lotesRes.data ?? []) as Lote[];
      setLotes(lotesArr);

      if (lotesArr.length === 0) {
        setObrasByConstruccionId(new Map());
        setUnidadById(new Map());
        setProductoById(new Map());
        setLoading(false);
        return;
      }

      const construccionIds = [...new Set(lotesArr.map((l) => l.construccion_id))];
      const { data: obras, error: obrasErr } = await sb
        .schema('dilesa')
        .from('construccion')
        .select(
          'id, codigo, unidad_id, producto_id, avance_pct, estado, mo_ejecutado, valor_contrato_mo, m2_construccion'
        )
        .in('id', construccionIds);
      if (!activo) return;
      if (obrasErr) {
        setError(getSupabaseErrorMessage(obrasErr, 'No se pudieron cargar las obras.'));
        setLoading(false);
        return;
      }
      const obrasMap = new Map<string, Construccion>();
      for (const o of obras ?? []) obrasMap.set(o.id as string, o as Construccion);
      setObrasByConstruccionId(obrasMap);

      const unidadIds = [...new Set((obras ?? []).map((o) => o.unidad_id as string))];
      const productoIds = [...new Set((obras ?? []).map((o) => o.producto_id as string))];
      const [unidadesRes, productosRes] = await Promise.all([
        unidadIds.length > 0
          ? sb.schema('dilesa').from('unidades').select('id, identificador').in('id', unidadIds)
          : Promise.resolve({ data: [], error: null }),
        productoIds.length > 0
          ? sb.schema('dilesa').from('productos').select('id, nombre').in('id', productoIds)
          : Promise.resolve({ data: [], error: null }),
      ]);
      if (!activo) return;
      const uMap = new Map<string, string>();
      for (const u of unidadesRes.data ?? []) uMap.set(u.id as string, u.identificador as string);
      setUnidadById(uMap);
      const pMap = new Map<string, string>();
      for (const p of productosRes.data ?? []) pMap.set(p.id as string, p.nombre as string);
      setProductoById(pMap);

      setLoading(false);
    })();

    return () => {
      activo = false;
    };
  }, [id]);

  const kpis = useMemo(() => {
    let moEjecutado = 0;
    let valorContratoMo = 0;
    let avancePctSum = 0;
    let n = 0;
    for (const l of lotes) {
      const o = obrasByConstruccionId.get(l.construccion_id);
      if (!o) continue;
      moEjecutado += Number(o.mo_ejecutado ?? 0);
      valorContratoMo += Number(o.valor_contrato_mo ?? l.monto_lote ?? 0);
      avancePctSum += Number(o.avance_pct ?? 0);
      n += 1;
    }
    const moPorEjecutar = Math.max(0, valorContratoMo - moEjecutado);
    const avancePromedio = n === 0 ? 0 : avancePctSum / n;
    return { moEjecutado, valorContratoMo, moPorEjecutar, avancePromedio };
  }, [lotes, obrasByConstruccionId]);

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

  if (error || !contrato) {
    return (
      <div className="container mx-auto max-w-6xl space-y-4 px-4 py-6">
        <BackLink />
        <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
          {error ?? 'Contrato no encontrado.'}
        </div>
      </div>
    );
  }

  const fichaGeneral: { label: string; value: React.ReactNode }[] = (
    [
      ['Código', contrato.codigo],
      ['Fecha del contrato', fmtFecha(contrato.fecha_contrato)],
      [
        'Contratista',
        contratistaNombre ? (
          <Link
            href={`/dilesa/construccion/contratistas/${contrato.contratista_id}`}
            className="text-[var(--accent)] hover:underline"
          >
            {contratistaAbrev ? `${contratistaAbrev} · ${contratistaNombre}` : contratistaNombre}
          </Link>
        ) : null,
      ],
      ['Proyecto', proyectoNombre],
      ['Valor total', fmtMoney(contrato.valor_total)],
      [
        'Fianzas',
        contrato.fianzas_url ? (
          <a
            href={contrato.fianzas_url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-[var(--accent)] hover:underline"
          >
            Ver documento
            <ExternalLink className="h-3 w-3" />
          </a>
        ) : null,
      ],
    ] as [string, React.ReactNode][]
  )
    .filter((r): r is [string, React.ReactNode] => r[1] != null && r[1] !== '')
    .map(([label, value]) => ({ label, value }));

  return (
    <div className="container mx-auto max-w-6xl space-y-6 px-4 py-6">
      <BackLink />

      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight text-[var(--text)]">
            <FileText className="h-5 w-5 text-[var(--accent)]" />
            {contrato.codigo}
          </h1>
          {contratistaNombre ? (
            <p className="mt-1 text-sm text-[var(--text)]/60">
              {contratistaNombre}
              {proyectoNombre ? ` · ${proyectoNombre}` : ''}
              {` · ${fmtFecha(contrato.fecha_contrato) ?? ''}`}
            </p>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {/* Ambos tipos generan PDF: vivienda con lotes+ANEXO 3, obra de monto
              global con objeto descriptivo (el endpoint branchea por `tipo`). */}
          <a
            href={`/api/dilesa/construccion/contratos/${contrato.id}/pdf`}
            className="inline-flex items-center gap-1.5 rounded-md border border-[var(--border)] bg-[var(--card)] px-3 py-1.5 text-sm font-medium text-[var(--text)]/80 hover:bg-[var(--bg)]/40 hover:text-[var(--text)]"
          >
            <Download className="h-4 w-4" />
            Descargar contrato (PDF)
          </a>
          <CancelarContratoButton
            contratoId={contrato.id}
            tipo={contrato.tipo}
            canceladaAt={contrato.cancelada_at}
            motivo={contrato.motivo_cancelacion}
            onCancelado={() =>
              setContrato((prev) =>
                prev ? { ...prev, cancelada_at: new Date().toISOString() } : prev
              )
            }
          />
        </div>
      </header>

      <Section title="Datos generales">
        {fichaGeneral.length === 0 ? (
          <p className="text-sm text-[var(--text)]/60">Sin datos capturados.</p>
        ) : (
          <FichaGrid rows={fichaGeneral} cols={3} />
        )}
        {contrato.notas ? (
          <div className="mt-4 border-t border-[var(--border)] pt-4">
            <div className="text-xs font-medium uppercase tracking-wide text-[var(--text)]/50">
              Notas
            </div>
            <p className="mt-0.5 whitespace-pre-wrap text-sm text-[var(--text)]/80">
              {contrato.notas}
            </p>
          </div>
        ) : null}
      </Section>

      {contrato.tipo !== 'vivienda' ? (
        <EditarDatosContrato
          contrato={contrato}
          onSaved={(patch) => setContrato((prev) => (prev ? { ...prev, ...patch } : prev))}
        />
      ) : null}

      {contrato.tipo !== 'vivienda' ? (
        <LigarPartida
          contratoId={contrato.id}
          proyectoId={contrato.proyecto_id}
          partidaIdInicial={contrato.partida_id}
        />
      ) : null}

      {contrato.tipo !== 'vivienda' ? (
        <ObraContratoDetalle
          contratoId={contrato.id}
          valorTotal={contrato.valor_total}
          anticipoPct={contrato.anticipo_pct ?? 0}
          retencionPct={contrato.retencion_pct ?? 0}
        />
      ) : null}

      {contrato.tipo === 'vivienda' ? (
        <>
          <Section title="KPIs">
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <Kpi label="Lotes asignados" value={lotes.length.toString()} accent />
              <Kpi label="MO ejecutado" value={fmtMoney(kpis.moEjecutado) ?? '$0'} />
              <Kpi label="MO por ejecutar" value={fmtMoney(kpis.moPorEjecutar) ?? '$0'} />
              <Kpi label="Avance promedio" value={`${kpis.avancePromedio.toFixed(0)}%`} />
            </div>
          </Section>

          <Section
            title="Lotes asignados"
            description={
              lotes.length === 0
                ? 'sin lotes'
                : `${lotes.length} lote(s) · MO contratado ${moneyFmt.format(kpis.valorContratoMo)}`
            }
          >
            {lotes.length === 0 ? (
              <p className="text-sm text-[var(--text)]/60">
                Este contrato no tiene lotes asignados todavía.
              </p>
            ) : (
              <ul className="space-y-1.5">
                {lotes.map((l) => {
                  const obra = obrasByConstruccionId.get(l.construccion_id);
                  if (!obra) {
                    return (
                      <li
                        key={l.id}
                        className="rounded-md border border-[var(--border)] bg-[var(--bg)]/30 px-3 py-2 text-sm text-[var(--text)]/50"
                      >
                        Construcción {l.construccion_id} no encontrada (¿borrada?).
                      </li>
                    );
                  }
                  const ident = unidadById.get(obra.unidad_id) ?? obra.codigo;
                  const proto = productoById.get(obra.producto_id) ?? null;
                  const protoSufijo = proto ? proto.split('-').pop() : null;
                  const display = protoSufijo ? `${ident}-${protoSufijo}` : ident;
                  return (
                    <li key={l.id}>
                      <Link
                        href={`/dilesa/construccion/${obra.id}`}
                        className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-[var(--border)] bg-[var(--bg)]/30 px-3 py-2 hover:border-[var(--accent)] hover:bg-[var(--bg)]/60"
                      >
                        <div className="flex items-center gap-2">
                          <HardHat className="h-4 w-4 text-[var(--text)]/40" />
                          <div>
                            <div className="text-sm font-medium text-[var(--text)]">{display}</div>
                            <div className="text-[11px] text-[var(--text)]/50">
                              {ESTADO_LABEL[obra.estado] ?? obra.estado}
                              {obra.m2_construccion != null
                                ? ` · ${Number(obra.m2_construccion).toFixed(2)} m²`
                                : ''}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-4">
                          <div className="flex items-center gap-2">
                            <div className="h-1.5 w-24 overflow-hidden rounded-full bg-[var(--border)]/40">
                              <div
                                className={`h-full rounded-full ${avanceColorClass(obra.avance_pct)}`}
                                style={{
                                  width: `${Math.min(100, Math.max(0, obra.avance_pct))}%`,
                                }}
                              />
                            </div>
                            <span className="w-9 shrink-0 text-right text-xs tabular-nums text-[var(--text)]/70">
                              {obra.avance_pct.toFixed(0)}%
                            </span>
                          </div>
                          <div className="text-right">
                            <div className="text-[10px] uppercase tracking-wide text-[var(--text)]/50">
                              MO lote
                            </div>
                            <div className="text-sm tabular-nums text-[var(--text)]">
                              {l.monto_lote != null ? moneyFmt.format(l.monto_lote) : '—'}
                            </div>
                          </div>
                        </div>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </Section>
        </>
      ) : null}
    </div>
  );
}

// ── Sub-componentes ──────────────────────────────────────────────────────

function BackLink() {
  return (
    <Link
      href="/dilesa/construccion/contratos"
      className="inline-flex items-center gap-1.5 text-sm text-[var(--text)]/60 hover:text-[var(--text)]"
    >
      <ArrowLeft className="size-4" /> Volver a contratos
    </Link>
  );
}

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-5">
      <div className="mb-4 flex items-baseline justify-between gap-3">
        <h2 className="text-sm font-medium uppercase tracking-wider text-[var(--text)]/60">
          {title}
        </h2>
        {description ? <span className="text-xs text-[var(--text)]/50">{description}</span> : null}
      </div>
      {children}
    </section>
  );
}

function FichaGrid({
  rows,
  cols = 2,
}: {
  rows: { label: string; value: React.ReactNode }[];
  cols?: 2 | 3;
}) {
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

function Kpi({ label, value, accent = false }: { label: string; value: string; accent?: boolean }) {
  return (
    <div
      className={
        'rounded-md border bg-[var(--bg)]/30 px-3 py-2 ' +
        (accent ? 'border-[var(--accent)]/40' : 'border-[var(--border)]')
      }
    >
      <div className="text-[10px] font-medium uppercase tracking-wider text-[var(--text)]/50">
        {label}
      </div>
      <div className="mt-0.5 text-lg font-semibold tabular-nums text-[var(--text)]">{value}</div>
    </div>
  );
}

/**
 * Liga (o desliga) el contrato a una partida del presupuesto (ADR-042). Permite
 * el backfill de los contratos existentes: al ligarlos, su `valor_total` cuenta
 * como comprometido en esa partida vía `erp.v_partida_control`.
 */
function LigarPartida({
  contratoId,
  proyectoId,
  partidaIdInicial,
}: {
  contratoId: string;
  proyectoId: string | null;
  partidaIdInicial: string | null;
}) {
  const { permissions } = usePermissions();
  const toast = useToast();
  const puedeEscribir =
    permissions.isAdmin || permissions.modulos.get('dilesa.construccion.contratos')?.write === true;
  const [grupos, setGrupos] = useState<PartidaGrupo[]>([]);
  const [partidaId, setPartidaId] = useState(partidaIdInicial ?? '');
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    if (!proyectoId) return;
    let activo = true;
    const sb = createSupabaseBrowserClient();
    void (async () => {
      const [partidasRes, catRes] = await Promise.all([
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (sb.schema('erp') as any)
          .from('presupuesto_partidas')
          .select('id, proyecto_id, concepto_id, concepto_texto')
          .eq('empresa_id', DILESA_EMPRESA_ID)
          .is('deleted_at', null),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (sb.schema('erp') as any)
          .from('conceptos_compra')
          .select('id, padre_id, nivel, codigo, nombre')
          .eq('empresa_id', DILESA_EMPRESA_ID)
          .is('deleted_at', null),
      ]);
      if (!activo) return;
      const { gruposByProyecto } = buildPartidaIndex(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (partidasRes.data ?? []) as any[],
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (catRes.data ?? []) as any[]
      );
      setGrupos(gruposByProyecto.get(proyectoId) ?? []);
    })();
    return () => {
      activo = false;
    };
  }, [proyectoId]);

  async function guardar() {
    if (guardando) return;
    setGuardando(true);
    const sb = createSupabaseBrowserClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (sb.schema('dilesa') as any)
      .from('contratos_construccion')
      .update({ partida_id: partidaId || null, updated_at: new Date().toISOString() })
      .eq('id', contratoId);
    if (error) {
      toast.add({
        title: 'Error',
        description: getSupabaseErrorMessage(error, 'No se pudo guardar la partida.'),
        type: 'error',
      });
    } else {
      toast.add({ title: partidaId ? 'Partida ligada' : 'Partida desligada', type: 'success' });
    }
    setGuardando(false);
  }

  if (!proyectoId) return null;

  return (
    <section className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-5">
      <h2 className="mb-1 text-sm font-medium uppercase tracking-wider text-muted-foreground">
        Partida del presupuesto
      </h2>
      <p className="mb-3 text-xs text-muted-foreground">
        Liga este contrato a una partida del costeo para que su monto cuente como comprometido en
        esa partida (ADR-042).
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <select
          className="h-9 min-w-[260px] flex-1 rounded-md border border-[var(--border)] bg-[var(--bg)] px-3 text-sm"
          value={partidaId}
          onChange={(e) => setPartidaId(e.target.value)}
          disabled={!puedeEscribir}
        >
          <option value="">— sin ligar —</option>
          {grupos.map((g) => (
            <optgroup key={g.key} label={g.label}>
              {g.partidas.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
        {puedeEscribir ? (
          <Button onClick={guardar} disabled={guardando || partidaId === (partidaIdInicial ?? '')}>
            {guardando ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
            Guardar
          </Button>
        ) : null}
      </div>
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-1 text-xs font-medium uppercase tracking-wide text-[var(--text)]/50">
        {label}
      </div>
      {children}
    </div>
  );
}

function Hint({ children }: { children: React.ReactNode }) {
  return <p className="mt-1 text-[11px] text-[var(--text)]/50">{children}</p>;
}

/**
 * Editar los datos de un contrato de obra (no-vivienda) con UPDATE directo
 * (mismo patrón que <LigarPartida>). Los contratos históricos importados de
 * Excel llegaron sin objeto/plazo/fianza/periodicidad, así que su PDF de obra
 * (Fase 4) salía incompleto y había que corregirlos por SQL. Esta sección los
 * captura desde la UI. Gated por write del sub-slug `dilesa.construccion.contratos`.
 * Tras guardar sube el patch al detalle (onSaved) para que la ficha y el saldo
 * de obra reflejen los cambios sin recargar.
 */
function EditarDatosContrato({
  contrato,
  onSaved,
}: {
  contrato: Contrato;
  onSaved: (patch: Partial<Contrato>) => void;
}) {
  const { permissions } = usePermissions();
  const toast = useToast();
  const puedeEscribir =
    permissions.isAdmin || permissions.modulos.get('dilesa.construccion.contratos')?.write === true;

  const [objeto, setObjeto] = useState(contrato.objeto ?? '');
  const [fechaInicio, setFechaInicio] = useState(contrato.fecha_inicio ?? '');
  const [fechaFin, setFechaFin] = useState(contrato.fecha_fin ?? '');
  const [valorTotal, setValorTotal] = useState(
    contrato.valor_total == null ? '' : String(contrato.valor_total)
  );
  const [anticipoPct, setAnticipoPct] = useState(
    contrato.anticipo_pct == null ? '' : String(contrato.anticipo_pct)
  );
  const [retencionPct, setRetencionPct] = useState(
    contrato.retencion_pct == null ? '' : String(contrato.retencion_pct)
  );
  const [fianzaPct, setFianzaPct] = useState(
    contrato.fianza_pct == null ? '' : String(contrato.fianza_pct)
  );
  const [periodicidadDias, setPeriodicidadDias] = useState(
    contrato.periodicidad_estimaciones_dias == null
      ? ''
      : String(contrato.periodicidad_estimaciones_dias)
  );
  const [notas, setNotas] = useState(contrato.notas ?? '');
  const [guardando, setGuardando] = useState(false);

  const patch = useMemo(
    () => ({
      objeto: objeto.trim() || null,
      fecha_inicio: fechaInicio || null,
      fecha_fin: fechaFin || null,
      anticipo_pct: anticipoPct.trim() === '' ? 0 : Number(anticipoPct),
      retencion_pct: retencionPct.trim() === '' ? 0 : Number(retencionPct),
      fianza_pct: fianzaPct.trim() === '' ? null : Number(fianzaPct),
      periodicidad_estimaciones_dias:
        periodicidadDias.trim() === '' ? null : Math.round(Number(periodicidadDias)),
      valor_total: valorTotal.trim() === '' ? 0 : Number(valorTotal),
      notas: notas.trim() || null,
    }),
    [
      objeto,
      fechaInicio,
      fechaFin,
      anticipoPct,
      retencionPct,
      fianzaPct,
      periodicidadDias,
      valorTotal,
      notas,
    ]
  );

  // Snapshot normalizado del contrato actual para detectar cambios (dirty). Tras
  // guardar, onSaved actualiza el prop `contrato` → snapshot == patch → dirty false.
  const snapshot = useMemo(
    () => ({
      objeto: contrato.objeto?.trim() || null,
      fecha_inicio: contrato.fecha_inicio || null,
      fecha_fin: contrato.fecha_fin || null,
      anticipo_pct: Number(contrato.anticipo_pct ?? 0),
      retencion_pct: Number(contrato.retencion_pct ?? 0),
      fianza_pct: contrato.fianza_pct == null ? null : Number(contrato.fianza_pct),
      periodicidad_estimaciones_dias:
        contrato.periodicidad_estimaciones_dias == null
          ? null
          : Number(contrato.periodicidad_estimaciones_dias),
      valor_total: Number(contrato.valor_total ?? 0),
      notas: contrato.notas?.trim() || null,
    }),
    [contrato]
  );

  const valido =
    [patch.anticipo_pct, patch.retencion_pct, patch.valor_total].every((n) => Number.isFinite(n)) &&
    (patch.fianza_pct == null || Number.isFinite(patch.fianza_pct)) &&
    (patch.periodicidad_estimaciones_dias == null ||
      Number.isFinite(patch.periodicidad_estimaciones_dias)) &&
    patch.valor_total > 0;
  const dirty = JSON.stringify(patch) !== JSON.stringify(snapshot);

  async function guardar() {
    if (guardando || !dirty || !valido) return;
    setGuardando(true);
    const sb = createSupabaseBrowserClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (sb.schema('dilesa') as any)
      .from('contratos_construccion')
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq('id', contrato.id);
    if (error) {
      toast.add({
        title: 'Error',
        description: getSupabaseErrorMessage(error, 'No se pudieron guardar los datos.'),
        type: 'error',
      });
    } else {
      toast.add({ title: 'Datos del contrato guardados', type: 'success' });
      onSaved(patch);
    }
    setGuardando(false);
  }

  if (!puedeEscribir) return null;

  const selectCls =
    'h-9 w-full rounded-md border border-[var(--border)] bg-[var(--card)] px-3 text-sm';

  return (
    <Section title="Editar datos del contrato">
      <p className="-mt-2 mb-4 text-xs text-[var(--text)]/50">
        Completa el alcance, plazo, montos y garantía del contrato de obra. Estos datos alimentan el
        PDF del contrato (objeto, fechas, anticipo, retención y fianza).
      </p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <Field label="Objeto del contrato">
            <select
              className={`${selectCls} mb-2`}
              value=""
              onChange={(e) => {
                if (e.target.value) setObjeto(e.target.value);
              }}
              aria-label="Objeto común"
            >
              <option value="">Elegir objeto común… (o escribe abajo)</option>
              {OBJETOS_COMUNES.map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
            </select>
            <textarea
              className="min-h-[60px] w-full rounded-md border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm"
              value={objeto}
              onChange={(e) => setObjeto(e.target.value)}
              placeholder="Ej. Construcción de 225 m de muro de contención…"
            />
            <Hint>
              Es la cláusula PRIMERA del contrato. Elige uno común y ajústalo (metros, ubicación…).
            </Hint>
          </Field>
        </div>
        <Field label="Inicio de ejecución">
          <Input type="date" value={fechaInicio} onChange={(e) => setFechaInicio(e.target.value)} />
        </Field>
        <Field label="Fin de ejecución">
          <Input type="date" value={fechaFin} onChange={(e) => setFechaFin(e.target.value)} />
        </Field>
        <Field label="Valor total (c/IVA)">
          <Input
            type="number"
            step="0.01"
            min="0"
            value={valorTotal}
            onChange={(e) => setValorTotal(e.target.value)}
            placeholder="0.00"
          />
          <Hint>
            {patch.valor_total > 0
              ? moneyFmt.format(patch.valor_total)
              : 'Monto total del contrato.'}
          </Hint>
        </Field>
        <div className="grid grid-cols-2 gap-3 sm:col-span-2 sm:grid-cols-4">
          <Field label="Anticipo %">
            <Input
              type="number"
              step="0.01"
              min="0"
              max="100"
              value={anticipoPct}
              onChange={(e) => setAnticipoPct(e.target.value)}
              placeholder="0"
            />
          </Field>
          <Field label="Retención %">
            <Input
              type="number"
              step="0.01"
              min="0"
              max="100"
              value={retencionPct}
              onChange={(e) => setRetencionPct(e.target.value)}
              placeholder="0"
            />
          </Field>
          <Field label="Fianza %">
            <Input
              type="number"
              step="0.01"
              min="0"
              max="100"
              value={fianzaPct}
              onChange={(e) => setFianzaPct(e.target.value)}
              placeholder="0"
            />
          </Field>
          <Field label="Estimaciones c/ N días">
            <Input
              type="number"
              step="1"
              min="0"
              value={periodicidadDias}
              onChange={(e) => setPeriodicidadDias(e.target.value)}
              placeholder="14"
            />
          </Field>
        </div>
        <div className="sm:col-span-2">
          <Field label="Notas">
            <textarea
              className="min-h-[60px] w-full rounded-md border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm"
              value={notas}
              onChange={(e) => setNotas(e.target.value)}
            />
          </Field>
        </div>
      </div>
      <div className="mt-4 flex items-center justify-end gap-3">
        {patch.valor_total <= 0 ? (
          <span className="text-xs text-[var(--text)]/50">El valor total debe ser mayor a 0.</span>
        ) : null}
        <Button onClick={guardar} disabled={guardando || !dirty || !valido}>
          {guardando ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
          Guardar cambios
        </Button>
      </div>
    </Section>
  );
}

// ── Cancelar contrato (p2p-cancelaciones · Fase 2) ──────────────────────────

function CancelarContratoButton({
  contratoId,
  tipo,
  canceladaAt,
  motivo,
  onCancelado,
}: {
  contratoId: string;
  tipo: string;
  canceladaAt: string | null;
  motivo: string | null;
  onCancelado: () => void;
}) {
  const { permissions } = usePermissions();
  const toast = useToast();
  const puedeEscribir =
    permissions.isAdmin || permissions.modulos.get('dilesa.construccion.contratos')?.write === true;
  const [cancelando, setCancelando] = useState(false);

  if (tipo === 'vivienda') return null;

  if (canceladaAt) {
    return (
      <span
        title={motivo ?? undefined}
        className="inline-flex items-center gap-1.5 rounded-md border border-destructive/40 bg-destructive/5 px-3 py-1.5 text-sm font-medium text-destructive"
      >
        <Ban className="h-4 w-4" />
        Contrato cancelado
      </span>
    );
  }
  if (!puedeEscribir) return null;

  const doCancelar = async (motivoTxt: string) => {
    const sb = createSupabaseBrowserClient();
    const { error } = await sb
      .schema('dilesa')
      .rpc('contrato_obra_cancelar', { p_contrato_id: contratoId, p_motivo: motivoTxt });
    if (error) {
      toast.add({
        title: 'No se pudo cancelar',
        description: getSupabaseErrorMessage(error, 'Error al cancelar el contrato.'),
        type: 'error',
      });
      throw error;
    }
    toast.add({ title: 'Contrato cancelado', type: 'success' });
    onCancelado();
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setCancelando(true)}
        className="inline-flex items-center gap-1.5 rounded-md border border-[var(--border)] bg-[var(--card)] px-3 py-1.5 text-sm font-medium text-[var(--text)]/70 hover:border-destructive hover:text-destructive"
      >
        <Ban className="h-4 w-4" />
        Cancelar contrato
      </button>
      {cancelando ? (
        <CancelarConMotivoDialog
          title="Cancelar contrato de obra"
          description="El contrato quedará visible como cancelado y dejará de comprometer su partida. Si tiene estimaciones registradas, primero hay que cancelarlas."
          confirmLabel="Cancelar contrato"
          placeholder="Ej. obra no ejecutada, error de captura…"
          onClose={() => setCancelando(false)}
          onConfirm={doCancelar}
        />
      ) : null}
    </>
  );
}
