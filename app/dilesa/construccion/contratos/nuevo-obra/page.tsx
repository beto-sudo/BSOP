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
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Loader2, Save } from 'lucide-react';
import { RequireAccess } from '@/components/require-access';
import { usePermissions } from '@/components/providers';
import { createSupabaseBrowserClient } from '@/lib/supabase-browser';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/components/ui/toast';
import { getSupabaseErrorMessage } from '@/lib/supabase-error';
import { DILESA_EMPRESA_ID } from '@/lib/empresa-constants';
import { formatCurrency } from '@/lib/format';
import {
  buildProyectoOptions,
  proyectoOptionLabel,
  type ProyectoOption,
  type ProyectoSelectorRow,
} from '@/lib/dilesa/proyectos-selector';
import { buildPartidaIndex, type PartidaGrupo } from '@/lib/compras/partidas';
import { OBJETOS_COMUNES } from '@/lib/dilesa/objetos-obra';
import { hoyISOMatamoros } from '@/lib/fecha-mx';

type Contratista = {
  id: string;
  nombre: string;
  abreviacion: string | null;
  repse: string | null;
};

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
      <Suspense fallback={null}>
        <NuevoContratoObraBody />
      </Suspense>
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
  const [proyectos, setProyectos] = useState<ProyectoOption[]>([]);
  const [seqByContratista, setSeqByContratista] = useState<Map<string, number>>(new Map());
  // Partidas del presupuesto por proyecto (etapa›capítulo) para ligar el contrato (ADR-042).
  const [partidasByProyecto, setPartidasByProyecto] = useState<Map<string, PartidaGrupo[]>>(
    new Map()
  );

  // ── Form ───────────────────────────────────────────────────────────────
  const [contratistaId, setContratistaId] = useState('');
  const [proyectoId, setProyectoId] = useState('');
  const [partidaId, setPartidaId] = useState('');
  const [tipo, setTipo] = useState<string>('urbanizacion');
  const [fechaContrato, setFechaContrato] = useState(hoyISOMatamoros());
  const [valorTotal, setValorTotal] = useState('');
  // Defaults: anticipo y fianza en 0 (los locales no llevan; se capturan si aplican),
  // retención en 5 (el fondo de garantía estándar — la garantía real cuando no hay fianza).
  const [anticipoPct, setAnticipoPct] = useState('0');
  const [retencionPct, setRetencionPct] = useState('5');
  const [fianzaPct, setFianzaPct] = useState('0');
  const [periodicidadDias, setPeriodicidadDias] = useState('');
  const [objeto, setObjeto] = useState('');
  const [fechaInicio, setFechaInicio] = useState('');
  const [fechaFin, setFechaFin] = useState('');
  const [codigoOverride, setCodigoOverride] = useState('');
  const [notas, setNotas] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // ── Sprint 2: condiciones de pago + retención fiscal + REPSE ──────────────
  const [formaPago, setFormaPago] = useState('');
  const [modalidadPrecio, setModalidadPrecio] = useState('');
  const [esManoObra, setEsManoObra] = useState(false);
  const [personalADisposicion, setPersonalADisposicion] = useState(false);
  const [retencionFiscalIsr, setRetencionFiscalIsr] = useState('0');
  const [retencionFiscalIva, setRetencionFiscalIva] = useState('0');
  const [repseOverrideMotivo, setRepseOverrideMotivo] = useState('');

  // ── Pre-llenado desde la adjudicación de una cotización de obra (Sprint 1) ──
  // La adjudicación de obra rutea aquí con ?cotizacion&proveedor&total&partida en
  // vez de crear el contrato en silencio. Pre-llenamos contratista/valor/partida/
  // proyecto y, al guardar, además de crear el contrato cerramos la adjudicación.
  // Si el usuario abandona, la cotización queda abierta (sin contrato huérfano).
  const searchParams = useSearchParams();
  const cotizacionId = searchParams.get('cotizacion');
  const proveedorParam = searchParams.get('proveedor');
  const totalParam = searchParams.get('total');
  const partidaParam = searchParams.get('partida');
  // Sprint 3: si la adjudicación generó "OC + Contrato", llega la OC a ligar.
  const ordenCompraParam = searchParams.get('oc');
  const desdeAdjudicacion = Boolean(cotizacionId && proveedorParam);

  useEffect(() => {
    if (!desdeAdjudicacion || loadingMeta) return;
    let cancelado = false;
    void (async () => {
      if (totalParam) setValorTotal((v) => v || totalParam);
      if (partidaParam) setPartidaId(partidaParam);
      // proveedor → persona (el contratista del contrato).
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: provRow } = await (sb.schema('erp') as any)
        .from('proveedores')
        .select('persona_id')
        .eq('id', proveedorParam)
        .maybeSingle();
      if (!cancelado && provRow?.persona_id) setContratistaId(provRow.persona_id as string);
      // partida → proyecto (para que el selector de partida muestre la opción).
      if (partidaParam) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: partRow } = await (sb.schema('erp') as any)
          .from('presupuesto_partidas')
          .select('proyecto_id')
          .eq('id', partidaParam)
          .maybeSingle();
        if (!cancelado && partRow?.proyecto_id) setProyectoId(partRow.proyecto_id as string);
      }
    })();
    return () => {
      cancelado = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [desdeAdjudicacion, loadingMeta]);

  // ── Catálogos ────────────────────────────────────────────────────────────
  const loadMeta = useCallback(async () => {
    setLoadingMeta(true);
    setLoadError(null);

    const [contratistasRes, datosRes, proyectosRes, contratosCountRes, partidasRes, catalogoRes] =
      await Promise.all([
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
          .select('persona_id, abreviacion, repse')
          .eq('empresa_id', DILESA_EMPRESA_ID)
          .is('deleted_at', null),
        sb
          .schema('dilesa')
          .from('proyectos')
          .select('id, nombre, tipo, proyecto_predecesor_id')
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
        // Partidas del presupuesto + catálogo → selector de partida (ADR-042).
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

    const firstErr =
      contratistasRes.error ??
      datosRes.error ??
      proyectosRes.error ??
      contratosCountRes.error ??
      partidasRes.error ??
      catalogoRes.error;
    if (firstErr) {
      setLoadError(getSupabaseErrorMessage(firstErr, 'No se pudieron cargar los catálogos.'));
      setLoadingMeta(false);
      return;
    }

    const abrevMap = new Map<string, string | null>();
    const repseMap = new Map<string, string | null>();
    for (const d of datosRes.data ?? []) {
      abrevMap.set(d.persona_id as string, (d.abreviacion as string | null) ?? null);
      repseMap.set(
        d.persona_id as string,
        ((d as { repse?: string | null }).repse ?? null) || null
      );
    }
    setContratistas(
      (contratistasRes.data ?? [])
        .map((p) => ({
          id: p.id as string,
          nombre:
            [p.nombre, p.apellido_paterno, p.apellido_materno].filter(Boolean).join(' ') ||
            '(sin nombre)',
          abreviacion: abrevMap.get(p.id as string) ?? null,
          repse: repseMap.get(p.id as string) ?? null,
        }))
        .sort((a, b) => a.nombre.localeCompare(b.nombre))
    );
    setProyectos(
      buildProyectoOptions((proyectosRes.data ?? []) as unknown as ProyectoSelectorRow[])
    );
    const { gruposByProyecto } = buildPartidaIndex(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (partidasRes.data ?? []) as any[],
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (catalogoRes.data ?? []) as any[]
    );
    setPartidasByProyecto(gruposByProyecto);

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

  // REPSE (Sprint 2): mano de obra a disposición sin REPSE vigente del contratista
  // → alerta fuerte; sólo Dirección continúa, con motivo auditado (admin-nunca-bloqueado).
  const { permissions } = usePermissions();
  const repseVigente = Boolean(contratistaSel?.repse && contratistaSel.repse.trim());
  const repseRequerido = esManoObra && personalADisposicion;
  const repseAlerta = repseRequerido && !repseVigente;
  const repseBloqueado = repseAlerta && (!permissions.isAdmin || repseOverrideMotivo.trim() === '');

  const codigoSugerido = useMemo(() => {
    if (!contratistaSel) return '';
    const year = (fechaContrato || hoyISOMatamoros()).slice(0, 4);
    const abrev = contratistaSel.abreviacion ?? 'CONTR';
    const seq = (seqByContratista.get(contratistaId) ?? 0) + 1;
    return `${year}/${seq}-DIE-${abrev}-${TIPO_ABREV[tipo] ?? 'OBRA'}#${seq}`;
  }, [contratistaSel, contratistaId, fechaContrato, tipo, seqByContratista]);

  const codigoFinal = codigoOverride.trim() || codigoSugerido;

  const canSubmit =
    !!contratistaId &&
    !!proyectoId &&
    !!tipo &&
    !!fechaContrato &&
    !!codigoFinal &&
    valorNum > 0 &&
    !!objeto.trim() &&
    !repseBloqueado;

  async function onSubmit() {
    if (!canSubmit || submitting) return;
    setSubmitting(true);
    try {
      // REPSE override (Sprint 2): si se continúa con mano de obra a disposición sin
      // REPSE, registramos quién/cuándo/por qué (canSubmit ya exige admin + motivo).
      let repseOverride: { at: string; por: string | null; motivo: string } | null = null;
      if (repseAlerta) {
        const { data: auth } = await sb.auth.getUser();
        repseOverride = {
          at: new Date().toISOString(),
          por: auth?.user?.id ?? null,
          motivo: repseOverrideMotivo.trim(),
        };
      }
      const { data, error } = await sb
        .schema('dilesa')
        .from('contratos_construccion')
        .insert({
          empresa_id: DILESA_EMPRESA_ID,
          codigo: codigoFinal,
          fecha_contrato: fechaContrato,
          contratista_id: contratistaId,
          proyecto_id: proyectoId,
          partida_id: partidaId || null,
          tipo,
          valor_total: valorNum,
          anticipo_pct: anticipoPct.trim() ? Number(anticipoPct) : 0,
          retencion_pct: retencionPct.trim() ? Number(retencionPct) : 0,
          fianza_pct: fianzaPct.trim() ? Number(fianzaPct) : 0,
          periodicidad_estimaciones_dias: periodicidadDias.trim() ? Number(periodicidadDias) : null,
          objeto: objeto.trim(),
          fecha_inicio: fechaInicio || null,
          fecha_fin: fechaFin || null,
          notas: notas.trim() || null,
          forma_pago: formaPago.trim() || null,
          modalidad_precio: modalidadPrecio || null,
          es_mano_obra: esManoObra,
          personal_a_disposicion: personalADisposicion,
          retencion_fiscal_isr_pct: retencionFiscalIsr.trim() ? Number(retencionFiscalIsr) : 0,
          retencion_fiscal_iva_pct: retencionFiscalIva.trim() ? Number(retencionFiscalIva) : 0,
          repse_override_at: repseOverride?.at ?? null,
          repse_override_por: repseOverride?.por ?? null,
          repse_override_motivo: repseOverride?.motivo ?? null,
          cotizacion_id: cotizacionId || null,
          orden_compra_id: ordenCompraParam || null,
        })
        .select('id')
        .single();
      if (error || !data) {
        throw new Error(getSupabaseErrorMessage(error, 'No se pudo crear el contrato de obra.'));
      }
      // Cierre de la adjudicación (sólo si venimos de una cotización): la
      // cotización pasa a adjudicada y sus proveedores a elegida/descartada. Se
      // hace aquí, no en la adjudicación, para no dejarla adjudicada a medias si
      // el usuario abandona la captura de condiciones. En "OC + Contrato" (viene
      // `oc`) la adjudicación ya se cerró al emitir la OC → no re-cerrar aquí.
      if (desdeAdjudicacion && cotizacionId && proveedorParam && !ordenCompraParam) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const erp = sb.schema('erp') as any;
        await erp
          .from('cotizaciones')
          .update({
            estado: 'adjudicada',
            adjudicado_proveedor_id: proveedorParam,
            updated_at: new Date().toISOString(),
          })
          .eq('id', cotizacionId);
        const { data: provs } = await erp
          .from('cotizacion_proveedores')
          .select('id, proveedor_id')
          .eq('cotizacion_id', cotizacionId);
        for (const p of (provs ?? []) as Array<{ id: string; proveedor_id: string }>) {
          await erp
            .from('cotizacion_proveedores')
            .update({ estado: p.proveedor_id === proveedorParam ? 'elegida' : 'descartada' })
            .eq('id', p.id);
        }
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
              onChange={(e) => {
                setProyectoId(e.target.value);
                setPartidaId('');
              }}
            >
              <option value="">— selecciona —</option>
              {proyectos.map((p) => (
                <option key={p.id} value={p.id}>
                  {proyectoOptionLabel(p)}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Partida del presupuesto">
            <select
              className={selectCls}
              value={partidaId}
              onChange={(e) => setPartidaId(e.target.value)}
              disabled={!proyectoId}
            >
              <option value="">
                {proyectoId ? '— sin ligar —' : 'Selecciona proyecto primero'}
              </option>
              {(partidasByProyecto.get(proyectoId) ?? []).map((g) => (
                <optgroup key={g.key} label={g.label}>
                  {g.partidas.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.label}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
            <Hint>
              Liga el contrato a una partida para que su monto cuente en el costeo (ADR-042).
            </Hint>
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

      <Section title="Alcance, plazo y garantía">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Field label="Objeto del contrato *">
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
                Es la cláusula PRIMERA del contrato. Elige uno común y ajústalo (metros,
                ubicación…).
              </Hint>
            </Field>
          </div>
          <Field label="Inicio de ejecución">
            <Input
              type="date"
              value={fechaInicio}
              onChange={(e) => setFechaInicio(e.target.value)}
            />
          </Field>
          <Field label="Fin de ejecución">
            <Input type="date" value={fechaFin} onChange={(e) => setFechaFin(e.target.value)} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
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
        </div>
      </Section>

      <Section title="Condiciones de pago y fiscales">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Forma de pago">
            <Input
              value={formaPago}
              onChange={(e) => setFormaPago(e.target.value)}
              placeholder="Ej. Transferencia a 15 días contra estimación"
            />
          </Field>
          <Field label="Modalidad de precio">
            <select
              className={selectCls}
              value={modalidadPrecio}
              onChange={(e) => setModalidadPrecio(e.target.value)}
            >
              <option value="">— sin especificar —</option>
              <option value="alzado">Precio alzado (fijo)</option>
              <option value="unitarios">Precios unitarios</option>
              <option value="administracion">Administración (costo + honorario)</option>
            </select>
          </Field>
          <div className="flex flex-wrap items-center gap-5 sm:col-span-2">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={esManoObra}
                onChange={(e) => {
                  setEsManoObra(e.target.checked);
                  if (!e.target.checked) setPersonalADisposicion(false);
                }}
                className="size-4 accent-[var(--accent)]"
              />
              Es mano de obra / servicio
            </label>
            {esManoObra ? (
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={personalADisposicion}
                  onChange={(e) => setPersonalADisposicion(e.target.checked)}
                  className="size-4 accent-[var(--accent)]"
                />
                Personal a disposición de DILESA
              </label>
            ) : null}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Ret. ISR fiscal % (al SAT)">
              <Input
                type="number"
                step="0.01"
                min="0"
                max="100"
                value={retencionFiscalIsr}
                onChange={(e) => setRetencionFiscalIsr(e.target.value)}
                placeholder="0"
              />
            </Field>
            <Field label="Ret. IVA fiscal % (al SAT)">
              <Input
                type="number"
                step="0.01"
                min="0"
                max="100"
                value={retencionFiscalIva}
                onChange={(e) => setRetencionFiscalIva(e.target.value)}
                placeholder="0"
              />
            </Field>
          </div>
          <p className="text-[11px] text-muted-foreground sm:col-span-2">
            La <strong>retención de garantía</strong> ({retencionPct || '0'}%) se captura arriba en
            «Datos del contrato»: es civil y se regresa en el finiquito. Las dos de aquí son
            fiscales: DILESA las retiene y las entera al SAT. La de IVA 6% aplica solo a servicios
            especializados REPSE con personal a disposición.
          </p>
          {repseRequerido ? (
            repseVigente ? (
              <p className="rounded-md border border-emerald-300 bg-emerald-50 px-3 py-2 text-xs text-emerald-800 sm:col-span-2">
                REPSE del contratista en registro: <strong>{contratistaSel?.repse}</strong>.
              </p>
            ) : (
              <div className="rounded-md border border-amber-400 bg-amber-50 px-3 py-2 text-xs text-amber-900 sm:col-span-2">
                <p className="font-medium">
                  ⚠ Mano de obra a disposición sin REPSE vigente del contratista.
                </p>
                <p className="mt-1">
                  Riesgo fiscal: gasto no deducible, IVA no acreditable y responsabilidad solidaria
                  IMSS. Considera estructurarlo como obra a resultado o exigir el REPSE.
                </p>
                {permissions.isAdmin ? (
                  <Input
                    className="mt-2 bg-white"
                    value={repseOverrideMotivo}
                    onChange={(e) => setRepseOverrideMotivo(e.target.value)}
                    placeholder="Motivo para continuar sin REPSE (queda auditado)"
                  />
                ) : (
                  <p className="mt-1 font-medium">
                    Solo Dirección puede continuar sin REPSE. Pide el registro al contratista.
                  </p>
                )}
              </div>
            )
          ) : null}
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
