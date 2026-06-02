'use client';

/**
 * Captura: Crear contrato de obra NO-vivienda (DILESA).
 *
 * Iniciativa dilesa-contratos-obra · Sprint 4. El gemelo de
 * `/contratos/nuevo` (vivienda + lotes) para los contratos de obra de
 * urbanización / cabecera / tarea menor (ADR-038): NO se ligan a lotes ni
 * prototipos — el objeto son conceptos/frentes de obra. Solo crea la
 * cabecera en `dilesa.contratos_construccion` con `tipo` no-vivienda +
 * anticipo/retención variables. Las estimaciones se registran después
 * desde el detalle del contrato.
 *
 * useState + insert directo (mismo patrón que el form de vivienda; los
 * forms de construcción no usan react-hook-form). Acceso: sub-slug
 * `dilesa.construccion.contratos` (write). Tras crear → detalle del contrato.
 */

import Link from 'next/link';
import { useRouter } from 'next/navigation';
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
import { formatCurrency } from '@/lib/format';

type Contratista = { id: string; nombre: string; abreviacion: string | null };
type Proyecto = { id: string; nombre: string };

/** Tipos de obra no-vivienda (ADR-038). `vivienda` se captura en /nuevo. */
const TIPOS_OBRA = [
  { value: 'urbanizacion', label: 'Urbanización' },
  { value: 'obra_cabecera', label: 'Obra de cabecera / amenidad' },
  { value: 'tarea_menor', label: 'Tarea menor / trámite' },
] as const;

const TIPO_ABREV: Record<string, string> = {
  urbanizacion: 'URB',
  obra_cabecera: 'CAB',
  tarea_menor: 'TAR',
};

export default function Page() {
  return (
    <RequireAccess empresa="dilesa" modulo="dilesa.construccion.contratos" write>
      <NuevoContratoObraBody />
    </RequireAccess>
  );
}

function NuevoContratoObraBody() {
  const router = useRouter();
  const toast = useToast();
  const sb = useMemo(() => createSupabaseBrowserClient(), []);

  const [loadingMeta, setLoadingMeta] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [contratistas, setContratistas] = useState<Contratista[]>([]);
  const [proyectos, setProyectos] = useState<Proyecto[]>([]);
  const [seqByContratista, setSeqByContratista] = useState<Map<string, number>>(new Map());

  // ── Form ───────────────────────────────────────────────────────────────
  const [contratistaId, setContratistaId] = useState('');
  const [proyectoId, setProyectoId] = useState('');
  const [tipo, setTipo] = useState<string>('urbanizacion');
  const [fechaContrato, setFechaContrato] = useState(new Date().toISOString().slice(0, 10));
  const [valorTotal, setValorTotal] = useState('');
  const [anticipoPct, setAnticipoPct] = useState('');
  const [retencionPct, setRetencionPct] = useState('');
  const [codigoOverride, setCodigoOverride] = useState('');
  const [notas, setNotas] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // ── Catálogos ────────────────────────────────────────────────────────────
  const loadMeta = useCallback(async () => {
    setLoadingMeta(true);
    setLoadError(null);

    const [contratistasRes, datosRes, proyectosRes, contratosCountRes] = await Promise.all([
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
      // Conteo de contratos de obra (no-vivienda) por contratista → seq del código.
      sb
        .schema('dilesa')
        .from('contratos_construccion')
        .select('contratista_id, tipo')
        .eq('empresa_id', DILESA_EMPRESA_ID)
        .neq('tipo', 'vivienda')
        .is('deleted_at', null),
    ]);

    const firstErr =
      contratistasRes.error ?? datosRes.error ?? proyectosRes.error ?? contratosCountRes.error;
    if (firstErr) {
      setLoadError(getSupabaseErrorMessage(firstErr, 'No se pudieron cargar los catálogos.'));
      setLoadingMeta(false);
      return;
    }

    const abrevMap = new Map<string, string | null>();
    for (const d of datosRes.data ?? []) {
      abrevMap.set(d.persona_id as string, (d.abreviacion as string | null) ?? null);
    }
    setContratistas(
      (contratistasRes.data ?? [])
        .map((p) => ({
          id: p.id as string,
          nombre:
            [p.nombre, p.apellido_paterno, p.apellido_materno].filter(Boolean).join(' ') ||
            '(sin nombre)',
          abreviacion: abrevMap.get(p.id as string) ?? null,
        }))
        .sort((a, b) => a.nombre.localeCompare(b.nombre))
    );
    setProyectos(
      ((proyectosRes.data ?? []) as Proyecto[]).sort((a, b) => a.nombre.localeCompare(b.nombre))
    );

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

  const contratistaSel = useMemo(
    () => contratistas.find((c) => c.id === contratistaId) ?? null,
    [contratistas, contratistaId]
  );
  const valorNum = useMemo(() => Number(valorTotal) || 0, [valorTotal]);

  const codigoSugerido = useMemo(() => {
    if (!contratistaSel) return '';
    const year = (fechaContrato || new Date().toISOString().slice(0, 10)).slice(0, 4);
    const abrev = contratistaSel.abreviacion ?? 'CONTR';
    const seq = (seqByContratista.get(contratistaId) ?? 0) + 1;
    return `${year}/${seq}-DIE-${abrev}-${TIPO_ABREV[tipo] ?? 'OBRA'}#${seq}`;
  }, [contratistaSel, contratistaId, fechaContrato, tipo, seqByContratista]);

  const codigoFinal = codigoOverride.trim() || codigoSugerido;

  const canSubmit =
    !!contratistaId && !!proyectoId && !!tipo && !!fechaContrato && !!codigoFinal && valorNum > 0;

  async function onSubmit() {
    if (!canSubmit || submitting) return;
    setSubmitting(true);
    try {
      const { data, error } = await sb
        .schema('dilesa')
        .from('contratos_construccion')
        .insert({
          empresa_id: DILESA_EMPRESA_ID,
          codigo: codigoFinal,
          fecha_contrato: fechaContrato,
          contratista_id: contratistaId,
          proyecto_id: proyectoId,
          tipo,
          valor_total: valorNum,
          anticipo_pct: anticipoPct.trim() ? Number(anticipoPct) : 0,
          retencion_pct: retencionPct.trim() ? Number(retencionPct) : 0,
          notas: notas.trim() || null,
        })
        .select('id')
        .single();
      if (error || !data) {
        throw new Error(getSupabaseErrorMessage(error, 'No se pudo crear el contrato de obra.'));
      }
      toast.add({ title: 'Contrato de obra creado', description: codigoFinal, type: 'success' });
      router.push(`/dilesa/construccion/contratos/${data.id as string}`);
    } catch (e) {
      toast.add({
        title: 'Error al crear',
        description: e instanceof Error ? e.message : 'Error desconocido.',
        type: 'error',
      });
      setSubmitting(false);
    }
  }

  if (loadingMeta) {
    return (
      <div className="container mx-auto max-w-3xl space-y-4 px-4 py-6">
        <BackLink />
        <Skeleton className="h-8 w-72" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="container mx-auto max-w-3xl space-y-4 px-4 py-6">
        <BackLink />
        <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
          {loadError}
        </div>
      </div>
    );
  }

  const selectCls =
    'h-9 w-full rounded-md border border-[var(--border)] bg-[var(--card)] px-3 text-sm';

  return (
    <div className="container mx-auto max-w-3xl space-y-6 px-4 py-6">
      <BackLink />

      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Nuevo contrato de obra</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Contrato de urbanización, obra de cabecera o tarea menor (no-vivienda). Sin lotes — el
          objeto son conceptos/frentes de obra. Las estimaciones se registran después desde el
          detalle del contrato.
        </p>
      </header>

      <Section title="Datos del contrato">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Contratista *">
            <select
              className={selectCls}
              value={contratistaId}
              onChange={(e) => setContratistaId(e.target.value)}
            >
              <option value="">— selecciona —</option>
              {contratistas.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.abreviacion ? `${c.abreviacion} · ` : ''}
                  {c.nombre}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Proyecto *">
            <select
              className={selectCls}
              value={proyectoId}
              onChange={(e) => setProyectoId(e.target.value)}
            >
              <option value="">— selecciona —</option>
              {proyectos.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nombre}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Tipo de obra *">
            <select className={selectCls} value={tipo} onChange={(e) => setTipo(e.target.value)}>
              {TIPOS_OBRA.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Fecha del contrato *">
            <Input
              type="date"
              value={fechaContrato}
              onChange={(e) => setFechaContrato(e.target.value)}
              required
            />
          </Field>
          <Field label="Valor total (c/IVA) *">
            <Input
              type="number"
              step="0.01"
              min="0"
              value={valorTotal}
              onChange={(e) => setValorTotal(e.target.value)}
              placeholder="0.00"
            />
            <Hint>{valorNum > 0 ? formatCurrency(valorNum) : 'Monto total del contrato.'}</Hint>
          </Field>
          <div className="grid grid-cols-2 gap-3">
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
          </div>
          <Field label="Código del contrato">
            <Input
              placeholder={codigoSugerido || '2026/1-DIE-ELG-URB#1'}
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
          <Field label="Notas">
            <textarea
              className="min-h-[60px] w-full rounded-md border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm"
              value={notas}
              onChange={(e) => setNotas(e.target.value)}
            />
          </Field>
        </div>
      </Section>

      <div className="flex items-center justify-end gap-3">
        <Link href="/dilesa/construccion/contratos">
          <Button variant="outline" disabled={submitting}>
            Cancelar
          </Button>
        </Link>
        <Button onClick={onSubmit} disabled={!canSubmit || submitting}>
          {submitting ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
          Crear contrato de obra
        </Button>
      </div>
    </div>
  );
}

function BackLink() {
  return (
    <Link
      href="/dilesa/construccion/contratos"
      className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
    >
      <ArrowLeft className="size-4" /> Volver a contratos
    </Link>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-5">
      <div className="mb-4 flex items-baseline justify-between gap-3">
        <h2 className="text-sm font-medium uppercase tracking-wider text-muted-foreground">
          {title}
        </h2>
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
