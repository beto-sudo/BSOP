'use client';

/**
 * Captura: Crear contrato de construcción (DILESA).
 *
 * Iniciativa dilesa-construccion · Sprint 4. Crea una fila en
 * `dilesa.contratos_construccion` + N filas en `dilesa.contrato_lotes`
 * (la N:M con `construccion`).
 *
 * UX: cascada contratista → lotes elegibles del contratista (obras suyas
 * que NO tienen contrato vigente todavía). Sin contratista no se muestran
 * lotes. Soporta deep-link `?contratista=<id>` para pre-seleccionar desde
 * el detalle de un contratista.
 *
 * Código auto-generado siguiendo el estilo Coda:
 *   `<año>/N-DIE-<abrev-contratista>-CONTRATO#<seq>`
 * pero permite override manual (el form pre-llena el sugerido y permite editarlo).
 *
 * Acceso: sub-slug `dilesa.construccion.contratos` (ADR-030). Después del
 * save, redirect al detalle del contratista para ver la lista actualizada.
 *
 * Suspense wrap: usamos useSearchParams (deep link), así que el body va
 * dentro de RequireAccess — durante prerender estático, RequireAccess está
 * en loading state y los hooks dinámicos no corren (regla SS6 ADR-030).
 */

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Loader2, Save } from 'lucide-react';
import { RequireAccess } from '@/components/require-access';
import { createSupabaseBrowserClient } from '@/lib/supabase-browser';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/components/ui/toast';
import { getSupabaseErrorMessage } from '@/lib/supabase-error';
import { DILESA_EMPRESA_ID } from '@/lib/empresa-constants';

type Contratista = {
  id: string;
  nombre: string;
  abreviacion: string | null;
};

type ObraElegible = {
  id: string;
  codigo: string;
  unidad_id: string;
  identificadorCompleto: string;
  proyecto_id: string | null;
  proyectoNombre: string;
  estado: string;
  avance_pct: number;
};

type Proyecto = { id: string; nombre: string };

const moneyFmt = new Intl.NumberFormat('es-MX', {
  style: 'currency',
  currency: 'MXN',
  maximumFractionDigits: 0,
});
const money = (n: number | null | undefined): string =>
  n == null ? '—' : moneyFmt.format(Number(n));

/**
 * @module Construcción · Crear contrato (DILESA)
 * @responsive desktop-only
 */
export default function NuevoContratoPage() {
  return (
    <RequireAccess empresa="dilesa" modulo="dilesa.construccion.contratos" write>
      <NuevoContratoForm />
    </RequireAccess>
  );
}

function NuevoContratoForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const toast = useToast();
  const sb = useMemo(() => createSupabaseBrowserClient(), []);

  const [contratistas, setContratistas] = useState<Contratista[]>([]);
  const [proyectos, setProyectos] = useState<Proyecto[]>([]);
  const [obrasMap, setObrasMap] = useState<Map<string, ObraElegible[]>>(new Map());
  const [seqByContratista, setSeqByContratista] = useState<Map<string, number>>(new Map());
  const [loadingMeta, setLoadingMeta] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Form
  const [contratistaId, setContratistaId] = useState<string>('');
  const [proyectoId, setProyectoId] = useState<string>('');
  const [lotesSeleccionados, setLotesSeleccionados] = useState<Set<string>>(new Set());
  const [fechaContrato, setFechaContrato] = useState<string>(new Date().toISOString().slice(0, 10));
  const [valorTotal, setValorTotal] = useState<string>('');
  const [fianzasUrl, setFianzasUrl] = useState<string>('');
  const [codigoOverride, setCodigoOverride] = useState<string>('');
  const [notas, setNotas] = useState<string>('');
  const [submitting, setSubmitting] = useState(false);

  // ── Carga ────────────────────────────────────────────────────────────────
  const loadMeta = useCallback(async () => {
    setLoadingMeta(true);
    setLoadError(null);

    const [
      contratistasRes,
      datosRes,
      proyectosRes,
      obrasRes,
      unidadesRes,
      contratoLotesRes,
      contratosCountRes,
    ] = await Promise.all([
      sb
        .schema('erp')
        .from('personas')
        .select('id, nombre, apellido_paterno, apellido_materno')
        .eq('empresa_id', DILESA_EMPRESA_ID)
        .eq('tipo', 'contratista')
        .eq('activo', true),
      sb
        .schema('dilesa')
        .from('contratistas_datos')
        .select('persona_id, abreviacion')
        .eq('empresa_id', DILESA_EMPRESA_ID)
        .is('deleted_at', null),
      sb
        .schema('dilesa')
        .from('proyectos')
        .select('id, nombre')
        .eq('empresa_id', DILESA_EMPRESA_ID)
        .is('deleted_at', null),
      // Todas las construcciones activas — luego filtramos por contratista
      // + sin contrato vigente del lado client.
      sb
        .schema('dilesa')
        .from('construccion')
        .select('id, codigo, unidad_id, contratista_id, estado, avance_pct')
        .eq('empresa_id', DILESA_EMPRESA_ID)
        .is('deleted_at', null),
      sb
        .schema('dilesa')
        .from('unidades')
        .select('id, identificador, proyecto_id')
        .eq('empresa_id', DILESA_EMPRESA_ID),
      sb
        .schema('dilesa')
        .from('contrato_lotes')
        .select('construccion_id')
        .eq('empresa_id', DILESA_EMPRESA_ID)
        .is('deleted_at', null),
      sb
        .schema('dilesa')
        .from('contratos_construccion')
        .select('contratista_id')
        .eq('empresa_id', DILESA_EMPRESA_ID)
        .is('deleted_at', null),
    ]);

    const firstErr =
      contratistasRes.error ??
      datosRes.error ??
      proyectosRes.error ??
      obrasRes.error ??
      unidadesRes.error ??
      contratoLotesRes.error ??
      contratosCountRes.error;
    if (firstErr) {
      setLoadError(getSupabaseErrorMessage(firstErr, 'No se pudieron cargar los catálogos.'));
      setLoadingMeta(false);
      return;
    }

    const abrevMap = new Map<string, string | null>();
    for (const d of datosRes.data ?? []) {
      abrevMap.set(d.persona_id as string, (d.abreviacion as string | null) ?? null);
    }
    const contratistasOrd: Contratista[] = (contratistasRes.data ?? [])
      .map((p) => {
        const nombre =
          [p.nombre, p.apellido_paterno, p.apellido_materno].filter(Boolean).join(' ') ||
          '(sin nombre)';
        return {
          id: p.id as string,
          nombre,
          abreviacion: abrevMap.get(p.id as string) ?? null,
        };
      })
      .sort((a, b) => a.nombre.localeCompare(b.nombre));
    setContratistas(contratistasOrd);

    setProyectos(
      ((proyectosRes.data ?? []) as Array<{ id: string; nombre: string }>).sort((a, b) =>
        a.nombre.localeCompare(b.nombre)
      )
    );

    const proyMap = new Map<string, string>();
    for (const p of proyectosRes.data ?? []) proyMap.set(p.id as string, p.nombre as string);

    const unidadMap = new Map<string, { identificador: string; proyecto_id: string }>();
    for (const u of unidadesRes.data ?? []) {
      unidadMap.set(u.id as string, {
        identificador: u.identificador as string,
        proyecto_id: u.proyecto_id as string,
      });
    }

    const obrasConContrato = new Set(
      (contratoLotesRes.data ?? []).map((cl) => cl.construccion_id as string)
    );

    // Agrupar obras elegibles por contratista_id (sin contrato vigente).
    const elegibles = new Map<string, ObraElegible[]>();
    for (const o of obrasRes.data ?? []) {
      if (obrasConContrato.has(o.id as string)) continue;
      if (o.estado === 'cancelada') continue;
      const u = unidadMap.get(o.unidad_id as string);
      const proyId = u?.proyecto_id ?? null;
      const entry: ObraElegible = {
        id: o.id as string,
        codigo: o.codigo as string,
        unidad_id: o.unidad_id as string,
        identificadorCompleto: u?.identificador ?? (o.codigo as string),
        proyecto_id: proyId,
        proyectoNombre: proyId ? (proyMap.get(proyId) ?? '') : '',
        estado: o.estado as string,
        avance_pct: Number(o.avance_pct ?? 0),
      };
      const cid = o.contratista_id as string;
      const arr = elegibles.get(cid);
      if (arr) arr.push(entry);
      else elegibles.set(cid, [entry]);
    }
    for (const arr of elegibles.values()) {
      arr.sort((a, b) => a.identificadorCompleto.localeCompare(b.identificadorCompleto));
    }
    setObrasMap(elegibles);

    // Conteo previo de contratos por contratista — para el seq sugerido.
    const seq = new Map<string, number>();
    for (const c of contratosCountRes.data ?? []) {
      const cid = c.contratista_id as string;
      seq.set(cid, (seq.get(cid) ?? 0) + 1);
    }
    setSeqByContratista(seq);

    setLoadingMeta(false);
  }, [sb]);

  useEffect(() => {
    void loadMeta();
  }, [loadMeta]);

  // Pre-selección desde ?contratista=
  useEffect(() => {
    const cid = searchParams.get('contratista');
    if (cid && contratistas.length > 0 && !contratistaId) {
      const exists = contratistas.find((c) => c.id === cid);
      if (exists) setContratistaId(cid);
    }
  }, [searchParams, contratistas, contratistaId]);

  // ── Derivados ────────────────────────────────────────────────────────────
  const contratistaSel = contratistas.find((c) => c.id === contratistaId) ?? null;
  const obrasDelContratista = obrasMap.get(contratistaId) ?? [];
  const obrasFiltradas = useMemo(() => {
    if (!proyectoId) return obrasDelContratista;
    return obrasDelContratista.filter((o) => o.proyecto_id === proyectoId);
  }, [obrasDelContratista, proyectoId]);

  const proyectosConObras = useMemo(() => {
    const ids = new Set(
      obrasDelContratista.map((o) => o.proyecto_id).filter((v): v is string => !!v)
    );
    return proyectos.filter((p) => ids.has(p.id));
  }, [obrasDelContratista, proyectos]);

  const codigoSugerido = useMemo(() => {
    if (!contratistaSel) return '';
    const year = (fechaContrato || new Date().toISOString().slice(0, 10)).slice(0, 4);
    const abrev = contratistaSel.abreviacion ?? 'CONTR';
    const seq = (seqByContratista.get(contratistaId) ?? 0) + 1;
    return `${year}/N-DIE-${abrev}-CONTRATO#${seq}`;
  }, [contratistaSel, contratistaId, fechaContrato, seqByContratista]);

  const codigoFinal = codigoOverride.trim() || codigoSugerido;

  const canSubmit = useMemo(
    () =>
      !!contratistaId &&
      !!fechaContrato &&
      !!codigoFinal &&
      lotesSeleccionados.size > 0 &&
      !!valorTotal &&
      Number(valorTotal) > 0,
    [contratistaId, fechaContrato, codigoFinal, lotesSeleccionados, valorTotal]
  );

  function toggleLote(obraId: string, marcado: boolean) {
    setLotesSeleccionados((prev) => {
      const next = new Set(prev);
      if (marcado) next.add(obraId);
      else next.delete(obraId);
      return next;
    });
  }

  function marcarTodos() {
    setLotesSeleccionados(new Set(obrasFiltradas.map((o) => o.id)));
  }

  function desmarcarTodos() {
    setLotesSeleccionados(new Set());
  }

  // ── Submit ───────────────────────────────────────────────────────────────
  async function onSubmit() {
    if (!canSubmit) return;
    setSubmitting(true);

    try {
      const { data: cIns, error: cErr } = await sb
        .schema('dilesa')
        .from('contratos_construccion')
        .insert({
          empresa_id: DILESA_EMPRESA_ID,
          codigo: codigoFinal,
          fecha_contrato: fechaContrato,
          contratista_id: contratistaId,
          proyecto_id: proyectoId || null,
          valor_total: Number(valorTotal),
          fianzas_url: fianzasUrl.trim() || null,
          notas: notas.trim() || null,
        })
        .select('id')
        .single();
      if (cErr || !cIns) {
        throw new Error(getSupabaseErrorMessage(cErr, 'No se pudo crear el contrato.'));
      }

      const contratoId = cIns.id as string;

      // Bulk insert N:M contrato_lotes.
      const lotesRows = [...lotesSeleccionados].map((construccionId) => ({
        empresa_id: DILESA_EMPRESA_ID,
        contrato_id: contratoId,
        construccion_id: construccionId,
      }));
      const { error: lErr } = await sb.schema('dilesa').from('contrato_lotes').insert(lotesRows);
      if (lErr) {
        // No revertimos — el contrato ya está creado. Reportamos.
        toast.add({
          title: 'Contrato creado — algunos lotes no se asociaron',
          description: lErr.message,
          type: 'warning',
        });
      } else {
        toast.add({
          title: 'Contrato creado',
          description: `${codigoFinal} con ${lotesRows.length} lote(s) · ${money(Number(valorTotal))}.`,
          type: 'success',
        });
      }

      router.push(`/dilesa/contratistas/${contratistaId}`);
    } catch (e) {
      toast.add({
        title: 'Error al crear contrato',
        description: (e as Error).message,
        type: 'error',
      });
    } finally {
      setSubmitting(false);
    }
  }

  if (loadingMeta) {
    return (
      <div className="container mx-auto max-w-4xl space-y-6 px-4 py-6">
        <Skeleton className="h-5 w-40" />
        <Skeleton className="h-32 w-full rounded-lg" />
        <Skeleton className="h-64 w-full rounded-lg" />
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="container mx-auto max-w-4xl space-y-4 px-4 py-6">
        <BackLink />
        <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
          {loadError}
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto max-w-4xl space-y-6 px-4 py-6">
      <BackLink />

      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Crear contrato de construcción</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Un contrato amarra a un contratista con N obras (lotes). Solo se muestran las obras del
          contratista que aún no tienen contrato vigente.
        </p>
      </header>

      <Section title="Contratista y proyecto">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Contratista *">
            <select
              className="h-9 w-full rounded-md border border-[var(--border)] bg-[var(--card)] px-3 text-sm"
              value={contratistaId}
              onChange={(e) => {
                setContratistaId(e.target.value);
                setLotesSeleccionados(new Set());
                setProyectoId('');
              }}
            >
              <option value="">— selecciona —</option>
              {contratistas.map((c) => {
                const count = obrasMap.get(c.id)?.length ?? 0;
                return (
                  <option key={c.id} value={c.id}>
                    {c.abreviacion ? `${c.abreviacion} · ` : ''}
                    {c.nombre}
                    {count > 0 ? ` · ${count} lote(s) elegibles` : ' · sin lotes elegibles'}
                  </option>
                );
              })}
            </select>
          </Field>
          <Field label="Proyecto (opcional — filtra lotes)">
            <select
              className="h-9 w-full rounded-md border border-[var(--border)] bg-[var(--card)] px-3 text-sm"
              value={proyectoId}
              onChange={(e) => {
                setProyectoId(e.target.value);
                setLotesSeleccionados(new Set());
              }}
              disabled={!contratistaId || proyectosConObras.length === 0}
            >
              <option value="">
                {!contratistaId ? '— primero elige contratista —' : '— todos los proyectos —'}
              </option>
              {proyectosConObras.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nombre}
                </option>
              ))}
            </select>
            <Hint>El proyecto del contrato se setea si lo eliges aquí.</Hint>
          </Field>
        </div>
      </Section>

      <Section
        title="Lotes (construcciones) que cubre el contrato"
        description={
          !contratistaId
            ? 'Selecciona un contratista primero.'
            : obrasFiltradas.length === 0
              ? 'Este contratista no tiene obras elegibles.'
              : `${lotesSeleccionados.size} de ${obrasFiltradas.length} marcados`
        }
      >
        {!contratistaId ? (
          <p className="text-sm text-muted-foreground">—</p>
        ) : obrasFiltradas.length === 0 ? (
          <div className="rounded-md border border-[var(--border)] bg-[var(--bg)]/40 p-4 text-sm text-muted-foreground">
            {obrasDelContratista.length === 0
              ? 'Este contratista no tiene obras asignadas todavía. Arranca una construcción para él antes de crear el contrato.'
              : 'No hay obras elegibles bajo el proyecto seleccionado. Cambia o quita el filtro de proyecto.'}
          </div>
        ) : (
          <>
            <div className="mb-2 flex items-center gap-2">
              <button
                type="button"
                onClick={marcarTodos}
                className="rounded-md border border-[var(--border)] px-2 py-1 text-[11px] text-muted-foreground hover:text-foreground"
              >
                Marcar todos
              </button>
              <button
                type="button"
                onClick={desmarcarTodos}
                className="rounded-md border border-[var(--border)] px-2 py-1 text-[11px] text-muted-foreground hover:text-foreground"
              >
                Limpiar selección
              </button>
            </div>
            <ul className="divide-y divide-[var(--border)]/40 rounded-md border border-[var(--border)]">
              {obrasFiltradas.map((o) => (
                <li key={o.id} className="px-3 py-2">
                  <label className="flex cursor-pointer items-baseline gap-3">
                    <input
                      type="checkbox"
                      className="h-4 w-4 rounded border-[var(--border)] text-[var(--accent)]"
                      checked={lotesSeleccionados.has(o.id)}
                      onChange={(e) => toggleLote(o.id, e.target.checked)}
                    />
                    <div className="flex flex-1 items-baseline justify-between gap-3">
                      <div>
                        <div className="text-sm">{o.identificadorCompleto}</div>
                        <div className="text-[11px] text-muted-foreground">
                          {o.codigo}
                          {o.proyectoNombre ? ` · ${o.proyectoNombre}` : ''}
                        </div>
                      </div>
                      <span className="text-[11px] tabular-nums text-muted-foreground">
                        {o.avance_pct.toFixed(0)}% · {o.estado}
                      </span>
                    </div>
                  </label>
                </li>
              ))}
            </ul>
          </>
        )}
      </Section>

      <Section title="Datos del contrato">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Fecha de contrato *">
            <Input
              type="date"
              value={fechaContrato}
              onChange={(e) => setFechaContrato(e.target.value)}
              required
            />
          </Field>
          <Field label="Valor total *">
            <Input
              type="number"
              step="1"
              min="0"
              value={valorTotal}
              onChange={(e) => setValorTotal(e.target.value)}
              required
            />
            <Hint>{money(Number(valorTotal) || 0)}</Hint>
          </Field>
          <Field label="Código del contrato">
            <Input
              placeholder={codigoSugerido || '2026/N-DIE-RMA-CONTRATO#1'}
              value={codigoOverride}
              onChange={(e) => setCodigoOverride(e.target.value)}
            />
            <Hint>
              {codigoOverride.trim()
                ? `Override. Sugerido: ${codigoSugerido || '(falta contratista)'}`
                : codigoSugerido
                  ? `Auto-sugerido: ${codigoSugerido}`
                  : 'Selecciona contratista para auto-generar.'}
            </Hint>
          </Field>
          <Field label="Fianzas (URL opcional)">
            <Input
              type="url"
              placeholder="https://..."
              value={fianzasUrl}
              onChange={(e) => setFianzasUrl(e.target.value)}
            />
          </Field>
          <Field label="Notas">
            <textarea
              className="min-h-[80px] w-full rounded-md border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm"
              value={notas}
              onChange={(e) => setNotas(e.target.value)}
            />
          </Field>
        </div>
      </Section>

      <div className="flex items-center justify-end gap-3">
        <Link
          href={contratistaId ? `/dilesa/contratistas/${contratistaId}` : '/dilesa/contratistas'}
        >
          <Button variant="outline" disabled={submitting}>
            Cancelar
          </Button>
        </Link>
        <Button onClick={onSubmit} disabled={!canSubmit || submitting}>
          {submitting ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
          Crear contrato
        </Button>
      </div>
    </div>
  );
}

function BackLink() {
  return (
    <Link
      href="/dilesa/contratistas"
      className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
    >
      <ArrowLeft className="size-4" /> Volver a contratistas
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
        <h2 className="text-sm font-medium uppercase tracking-wider text-muted-foreground">
          {title}
        </h2>
        {description ? <span className="text-xs text-muted-foreground">{description}</span> : null}
      </div>
      {children}
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      {children}
    </div>
  );
}

function Hint({ children }: { children: React.ReactNode }) {
  return <p className="mt-1 text-[11px] text-muted-foreground">{children}</p>;
}
