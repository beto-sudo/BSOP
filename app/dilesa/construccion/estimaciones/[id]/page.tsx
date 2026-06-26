'use client';

/* eslint-disable react-hooks/set-state-in-effect --
 * Mismo data-sync pattern que el resto de páginas de detalle.
 */

/**
 * Detalle de una estimación de pago a contratista (DILESA).
 *
 * Iniciativa dilesa-estimaciones-cxp. Construcción solo aprueba el devengo:
 * "Aprobar" llama a `dilesa.estimacion_destajo_autorizar` (RPC), que genera
 * la factura EN ESPERA en Cuentas por Pagar por el neto. A partir de ahí la
 * factura recibida (XML) y el pago se procesan en CxP; los estados
 * `facturada`/`pagada` se DERIVAN aquí (read-only) vía trigger de sync. El
 * botón "Ver en CxP →" lleva a la factura ligada.
 *
 * Secciones:
 *   1. Datos generales — código, contratista, fechas, retención, montos
 *      brutos/retenidos/netos, factura (si existe), audit trail.
 *   2. Factura y pago — derivados de CxP (folio fiscal, fechas, referencia).
 *   3. Desglose por obra — acordeón con todas las construcciones
 *      afectadas, sus tareas vinculadas y subtotales. La estimación
 *      es multi-obra por diseño (1 contratista trabaja varias
 *      viviendas a la vez).
 */

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  Banknote,
  Check,
  ChevronDown,
  ChevronRight,
  Download,
  Loader2,
  Mail,
  X,
} from 'lucide-react';
import { RequireAccess } from '@/components/require-access';
import { createSupabaseBrowserClient } from '@/lib/supabase-browser';
import { usePermissions } from '@/components/providers';
import { Badge } from '@/components/ui/badge';
import type { BadgeTone } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/components/ui/toast';
import { getSupabaseErrorMessage } from '@/lib/supabase-error';

type Estimacion = {
  id: string;
  codigo: string;
  contratista_id: string;
  fecha_cierre: string;
  fecha_pago_programado: string;
  monto_bruto: number;
  retencion_pct: number;
  retencion_monto: number;
  monto_neto: number;
  factura_url: string | null;
  factura_folio: string | null;
  factura_fecha: string | null;
  aprobada_por_user_id: string | null;
  aprobada_at: string | null;
  pagada_por_user_id: string | null;
  pagada_at: string | null;
  referencia_pago: string | null;
  estado: string;
  notas: string | null;
};

type EstimTarea = {
  id: string;
  tarea_terminada_id: string;
  construccion_id: string;
  monto_calculado: number;
};

type Construccion = {
  id: string;
  codigo: string;
  unidad_id: string;
};

type TareaTerminada = {
  id: string;
  plantilla_tarea_id: string;
  fecha_terminada: string | null;
};

type Plantilla = {
  id: string;
  tarea_id: string;
};

type Tarea = { id: string; nombre: string };

const ESTADO_TONE: Record<string, BadgeTone> = {
  borrador: 'neutral',
  aprobada: 'info',
  facturada: 'warning',
  pagada: 'success',
  cancelada: 'danger',
};
const ESTADO_LABEL: Record<string, string> = {
  borrador: 'Borrador',
  aprobada: 'Aprobada',
  facturada: 'Facturada',
  pagada: 'Pagada',
  cancelada: 'Cancelada',
};

const moneyFmt = new Intl.NumberFormat('es-MX', {
  style: 'currency',
  currency: 'MXN',
  maximumFractionDigits: 0,
});
const money = (n: number | null) => (n == null ? '—' : moneyFmt.format(n));

function fmtFecha(s: string | null): string {
  if (!s) return '—';
  const d = new Date(`${s}T00:00:00`);
  if (isNaN(d.getTime())) return s;
  return d.toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' });
}

function fmtFechaHora(s: string | null): string {
  if (!s) return '—';
  const d = new Date(s);
  if (isNaN(d.getTime())) return s;
  return d.toLocaleString('es-MX', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * @module Estimación detail (DILESA)
 * @responsive desktop-only
 */
export default function EstimacionDetailPage() {
  return (
    <RequireAccess empresa="dilesa" modulo="dilesa.construccion.estimaciones">
      <DetailInner />
    </RequireAccess>
  );
}

type ModalKind = 'aprobar' | 'cancelar' | null;

function DetailInner() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const { permissions } = usePermissions();
  const toast = useToast();
  const puedeEscribir =
    permissions.isAdmin ||
    permissions.modulos.get('dilesa.construccion.estimaciones')?.write === true;

  const [modal, setModal] = useState<ModalKind>(null);
  const [savingTransition, setSavingTransition] = useState(false);

  // Email modal state — pre-fillea con email del contratista si existe.
  const [emailModalOpen, setEmailModalOpen] = useState(false);
  const [contratistaEmail, setContratistaEmail] = useState<string | null>(null);
  const [sendingEmail, setSendingEmail] = useState(false);

  const [estim, setEstim] = useState<Estimacion | null>(null);
  const [contratistaNombre, setContratistaNombre] = useState<string | null>(null);
  const [contratistaAbrev, setContratistaAbrev] = useState<string | null>(null);
  const [aprobadaPor, setAprobadaPor] = useState<string | null>(null);
  const [pagadaPor, setPagadaPor] = useState<string | null>(null);
  const [estTareas, setEstTareas] = useState<EstimTarea[]>([]);
  const [construcciones, setConstrucciones] = useState<Map<string, Construccion>>(new Map());
  const [unidadIds, setUnidadIds] = useState<Map<string, string>>(new Map());
  // construccion_id → código(s) de contrato del contratista (referencia de factura)
  const [contratosObra, setContratosObra] = useState<Map<string, string>>(new Map());
  const [terminadas, setTerminadas] = useState<Map<string, TareaTerminada>>(new Map());
  const [plantillas, setPlantillas] = useState<Map<string, Plantilla>>(new Map());
  const [tareasCat, setTareasCat] = useState<Map<string, Tarea>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Factura de CxP ligada (para "Ver en CxP →"). Existe desde que se aprueba.
  const [facturaId, setFacturaId] = useState<string | null>(null);

  // Refresca el estado de la estimación tras una transición (sin recargar
  // toda la página). Hace una query liviana al row de estimaciones.
  async function refetchEstim() {
    if (!id) return;
    const sb = createSupabaseBrowserClient();
    const { data } = await sb
      .schema('dilesa')
      .from('estimaciones')
      .select('*')
      .eq('id', id)
      .maybeSingle();
    if (data) setEstim(data as unknown as Estimacion);
  }

  /** Transición borrador → aprobada. La RPC aprueba el devengo y genera la
   *  factura EN ESPERA en Cuentas por Pagar (por el neto). A partir de aquí
   *  administración la procesa en CxP (sube el XML, programa, paga). */
  async function aprobar() {
    if (!estim || savingTransition) return;
    setSavingTransition(true);
    const sb = createSupabaseBrowserClient();
    // RPC aún no en types — mismo patrón de cast que el detalle de obra.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: e } = await (sb.schema('dilesa') as any).rpc('estimacion_destajo_autorizar', {
      p_estimacion_id: estim.id,
    });
    setSavingTransition(false);
    if (e) {
      toast.add({
        title: 'No se pudo aprobar',
        description: getSupabaseErrorMessage(e, 'Error al transicionar.'),
        type: 'error',
      });
      return;
    }
    toast.add({
      title: 'Destajo aprobado',
      description: 'Factura en espera creada en CxP — administración la procesa allí.',
      type: 'success',
    });
    setModal(null);
    await refetchEstim();
  }

  /** Transición borrador|aprobada → cancelada (RPC). Cancela la factura en
   *  espera ligada en CxP (si la hay y no tiene pagos) y libera las tareas
   *  borrando las filas de estimacion_tareas. */
  async function cancelar() {
    if (!estim || savingTransition) return;
    setSavingTransition(true);
    const sb = createSupabaseBrowserClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: e } = await (sb.schema('dilesa') as any).rpc('estimacion_destajo_cancelar', {
      p_estimacion_id: estim.id,
      p_motivo: null,
    });
    setSavingTransition(false);
    if (e) {
      toast.add({
        title: 'No se pudo cancelar',
        description: getSupabaseErrorMessage(e, 'Error al transicionar.'),
        type: 'error',
      });
      return;
    }
    toast.add({
      title: 'Estimación cancelada · tareas liberadas',
      type: 'success',
    });
    setModal(null);
    setEstTareas([]);
    await refetchEstim();
  }

  useEffect(() => {
    if (!id) return;
    let activo = true;
    const sb = createSupabaseBrowserClient();
    setLoading(true);
    setError(null);

    (async () => {
      const { data: eRow, error: eErr } = await sb
        .schema('dilesa')
        .from('estimaciones')
        .select('*')
        .eq('id', id)
        .is('deleted_at', null)
        .maybeSingle();
      if (!activo) return;
      if (eErr) {
        setError(getSupabaseErrorMessage(eErr, 'No se pudo cargar la estimación.'));
        setLoading(false);
        return;
      }
      if (!eRow) {
        setError('Estimación no encontrada.');
        setLoading(false);
        return;
      }
      const estimRow = eRow as unknown as Estimacion;
      setEstim(estimRow);

      // Cargas paralelas: contratista, audit users, estimacion_tareas.
      const [persRes, etRes, aprobUserRes, pagUserRes] = await Promise.all([
        sb
          .schema('erp')
          .from('personas')
          .select('nombre, apellido_paterno, apellido_materno, email')
          .eq('id', estimRow.contratista_id)
          .maybeSingle(),
        sb
          .schema('dilesa')
          .from('estimacion_tareas')
          .select('id, tarea_terminada_id, construccion_id, monto_calculado')
          .eq('estimacion_id', estimRow.id),
        estimRow.aprobada_por_user_id
          ? sb
              .schema('core')
              .from('usuarios')
              .select('first_name, email')
              .eq('id', estimRow.aprobada_por_user_id)
              .maybeSingle()
          : Promise.resolve({ data: null, error: null }),
        estimRow.pagada_por_user_id
          ? sb
              .schema('core')
              .from('usuarios')
              .select('first_name, email')
              .eq('id', estimRow.pagada_por_user_id)
              .maybeSingle()
          : Promise.resolve({ data: null, error: null }),
      ]);
      if (!activo) return;

      if (persRes.data) {
        const n = [
          persRes.data.nombre,
          persRes.data.apellido_paterno,
          persRes.data.apellido_materno,
        ]
          .filter(Boolean)
          .join(' ');
        setContratistaNombre(n || '(sin nombre)');
        setContratistaEmail((persRes.data.email as string | null) ?? null);
        // Buscar abrev en satélite
        const { data: cd } = await sb
          .schema('dilesa')
          .from('contratistas_datos')
          .select('abreviacion')
          .eq('persona_id', estimRow.contratista_id)
          .is('deleted_at', null)
          .maybeSingle();
        if (activo) setContratistaAbrev((cd?.abreviacion as string | null) ?? null);
      }
      if (aprobUserRes.data) {
        setAprobadaPor(
          (aprobUserRes.data.first_name as string | null) ??
            (aprobUserRes.data.email as string | null) ??
            null
        );
      }
      if (pagUserRes.data) {
        setPagadaPor(
          (pagUserRes.data.first_name as string | null) ??
            (pagUserRes.data.email as string | null) ??
            null
        );
      }

      const etArr = (etRes.data ?? []) as EstimTarea[];
      setEstTareas(etArr);

      // Cargar construcciones + tareas terminadas + plantillas + catálogo de
      // tareas para el desglose por obra.
      const construccionIds = [...new Set(etArr.map((e) => e.construccion_id))];
      const tareaTerminadaIds = [...new Set(etArr.map((e) => e.tarea_terminada_id))];

      if (construccionIds.length === 0) {
        setLoading(false);
        return;
      }

      const [cRes, ttRes, taRes, clRes] = await Promise.all([
        sb
          .schema('dilesa')
          .from('construccion')
          .select('id, codigo, unidad_id')
          .in('id', construccionIds),
        sb
          .schema('dilesa')
          .from('construccion_tareas_terminadas')
          .select('id, plantilla_tarea_id, fecha_terminada')
          .in('id', tareaTerminadaIds),
        sb.schema('dilesa').from('tareas_construccion').select('id, nombre'),
        sb
          .schema('dilesa')
          .from('contrato_lotes')
          .select('construccion_id, contrato_id')
          .in('construccion_id', construccionIds)
          .is('deleted_at', null),
      ]);
      if (!activo) return;

      const cMap = new Map<string, Construccion>();
      const uMap = new Map<string, string>();
      for (const c of cRes.data ?? []) {
        cMap.set(c.id as string, c as Construccion);
        uMap.set(c.id as string, c.unidad_id as string);
      }
      setConstrucciones(cMap);

      const ttMap = new Map<string, TareaTerminada>();
      const plantillaIds = new Set<string>();
      for (const tt of ttRes.data ?? []) {
        ttMap.set(tt.id as string, tt as TareaTerminada);
        plantillaIds.add(tt.plantilla_tarea_id as string);
      }
      setTerminadas(ttMap);

      const tMap = new Map<string, Tarea>();
      for (const t of taRes.data ?? []) tMap.set(t.id as string, { id: t.id, nombre: t.nombre });
      setTareasCat(tMap);

      // Contrato(s) de cada construcción — solo los del contratista de la
      // estimación, vigentes. Es la referencia que el contratista pone en
      // su factura (mismo dato que imprime el PDF).
      const contratoIds = [...new Set((clRes.data ?? []).map((cl) => cl.contrato_id as string))];
      if (contratoIds.length > 0) {
        const { data: ccRows } = await sb
          .schema('dilesa')
          .from('contratos_construccion')
          .select('id, codigo')
          .in('id', contratoIds)
          .eq('contratista_id', estimRow.contratista_id)
          .is('deleted_at', null)
          .is('cancelada_at', null);
        if (!activo) return;
        const ccCodigo = new Map<string, string>();
        for (const cc of ccRows ?? []) ccCodigo.set(cc.id as string, cc.codigo as string);
        const porObra = new Map<string, Set<string>>();
        for (const cl of clRes.data ?? []) {
          const codigo = ccCodigo.get(cl.contrato_id as string);
          if (!codigo) continue;
          const cid = cl.construccion_id as string;
          const set = porObra.get(cid) ?? new Set<string>();
          set.add(codigo);
          porObra.set(cid, set);
        }
        setContratosObra(new Map([...porObra.entries()].map(([k, v]) => [k, [...v].join(', ')])));
      }

      // Plantillas → tareas (mapping plantilla_id → tarea_id)
      if (plantillaIds.size > 0) {
        const { data: pRes } = await sb
          .schema('dilesa')
          .from('plantilla_tareas')
          .select('id, tarea_id')
          .in('id', [...plantillaIds]);
        if (!activo) return;
        const pMap = new Map<string, Plantilla>();
        for (const p of pRes ?? []) pMap.set(p.id as string, p as Plantilla);
        setPlantillas(pMap);
      }

      // Unidades (identificadores)
      const unidadIdsArr = [...new Set([...uMap.values()])];
      if (unidadIdsArr.length > 0) {
        const { data: uRes } = await sb
          .schema('dilesa')
          .from('unidades')
          .select('id, identificador')
          .in('id', unidadIdsArr);
        if (!activo) return;
        const idMap = new Map<string, string>();
        for (const u of uRes ?? []) idMap.set(u.id as string, u.identificador as string);
        setUnidadIds(idMap);
      }

      setLoading(false);
    })();

    return () => {
      activo = false;
    };
  }, [id]);

  // Factura de CxP ligada al destajo (para el link "Ver en CxP"). Existe
  // desde que se aprueba; el estado factura/pago se deriva de CxP.
  const estadoActual = estim?.estado;
  useEffect(() => {
    if (!id || !estadoActual || !['aprobada', 'facturada', 'pagada'].includes(estadoActual)) {
      setFacturaId(null);
      return;
    }
    let activo = true;
    const sb = createSupabaseBrowserClient();
    void (async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data } = await (sb.schema('erp') as any)
        .from('facturas')
        .select('id')
        .eq('estimacion_id', id)
        .is('cancelada_at', null)
        .maybeSingle();
      if (activo) setFacturaId((data?.id as string | undefined) ?? null);
    })();
    return () => {
      activo = false;
    };
  }, [id, estadoActual]);

  /** Desglose: por construccion_id, lista de tareas con su nombre + monto. */
  const desglosePorObra = useMemo(() => {
    const grupos = new Map<
      string,
      Array<{ nombre: string; fecha: string | null; monto: number }>
    >();
    for (const et of estTareas) {
      const tt = terminadas.get(et.tarea_terminada_id);
      const plantilla = tt ? plantillas.get(tt.plantilla_tarea_id) : null;
      const tareaInfo = plantilla ? tareasCat.get(plantilla.tarea_id) : null;
      const nombre = tareaInfo?.nombre ?? '(tarea desconocida)';
      const arr = grupos.get(et.construccion_id) ?? [];
      arr.push({ nombre, fecha: tt?.fecha_terminada ?? null, monto: et.monto_calculado });
      grupos.set(et.construccion_id, arr);
    }
    return [...grupos.entries()]
      .map(([construccion_id, items]) => {
        const c = construcciones.get(construccion_id);
        const unidadId = c?.unidad_id ?? null;
        const identificador = unidadId
          ? (unidadIds.get(unidadId) ?? '(sin unidad)')
          : '(sin unidad)';
        const subtotal = items.reduce((s, i) => s + i.monto, 0);
        return {
          construccion_id,
          construccion_codigo: c?.codigo ?? '—',
          unidad_identificador: identificador,
          contrato_codigo: contratosObra.get(construccion_id) ?? null,
          items: items.sort((a, b) => a.nombre.localeCompare(b.nombre)),
          subtotal,
        };
      })
      .sort((a, b) => a.unidad_identificador.localeCompare(b.unidad_identificador));
  }, [estTareas, terminadas, plantillas, tareasCat, construcciones, unidadIds, contratosObra]);

  if (loading) {
    return (
      <div className="container mx-auto max-w-6xl space-y-6 px-4 py-6">
        <Skeleton className="h-5 w-40" />
        <Skeleton className="h-24 w-full rounded-lg" />
        <Skeleton className="h-64 w-full rounded-lg" />
      </div>
    );
  }

  if (error || !estim) {
    return (
      <div className="container mx-auto max-w-6xl space-y-4 px-4 py-6">
        <BackLink />
        <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
          {error ?? 'Estimación no encontrada.'}
        </div>
      </div>
    );
  }

  const contratistaDisplay = contratistaAbrev
    ? `${contratistaAbrev} · ${contratistaNombre ?? ''}`
    : (contratistaNombre ?? '—');

  return (
    <div className="container mx-auto max-w-6xl space-y-6 px-4 py-6">
      <BackLink />

      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight text-[var(--text)]">
            <Banknote className="h-5 w-5 text-[var(--accent)]" />
            {estim.codigo}
          </h1>
          <p className="mt-1 text-sm text-[var(--text)]/60">
            {contratistaDisplay} · cierre {fmtFecha(estim.fecha_cierre)}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={ESTADO_TONE[estim.estado] ?? 'neutral'}>
            {ESTADO_LABEL[estim.estado] ?? estim.estado}
          </Badge>
          <div className="rounded-md border border-[var(--border)] bg-[var(--card)] px-3 py-1.5">
            <div className="text-[10px] uppercase tracking-wide text-[var(--text)]/50">Neto</div>
            <div className="text-base font-semibold tabular-nums text-[var(--text)]">
              {money(estim.monto_neto)}
            </div>
          </div>
        </div>
      </header>

      {puedeEscribir ? (
        <ActionBar
          estado={estim.estado}
          onAprobar={() => setModal('aprobar')}
          onCancelar={() => setModal('cancelar')}
        />
      ) : null}

      {/* Acciones de PDF/email — siempre disponibles excepto en borrador.
          Sin RBAC porque cualquiera con read puede descargar el PDF. */}
      {estim.estado !== 'borrador' && estim.estado !== 'cancelada' ? (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--card)] p-3">
          <span className="text-xs uppercase tracking-wide text-[var(--text)]/50">Documento:</span>
          <a
            href={`/api/dilesa/estimaciones/${estim.id}/pdf`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex h-9 items-center gap-1.5 rounded-md border border-[var(--border)] px-3 text-sm font-medium text-[var(--text)] hover:bg-[var(--bg)]/30"
          >
            <Download className="size-4" />
            Descargar PDF
          </a>
          {puedeEscribir ? (
            <Button onClick={() => setEmailModalOpen(true)}>
              <Mail className="size-4" />
              Enviar al contratista
            </Button>
          ) : null}
          {facturaId ? (
            <Link
              href={`/dilesa/cxp?focus=${facturaId}`}
              className="inline-flex h-9 items-center gap-1.5 rounded-md border border-[var(--border)] px-3 text-sm font-medium text-[var(--text)] hover:bg-[var(--bg)]/30"
            >
              <Banknote className="size-4" />
              Ver en CxP
            </Link>
          ) : null}
          {!contratistaEmail ? (
            <span className="text-[11px] text-amber-700 dark:text-amber-400">
              El contratista no tiene email registrado — captúralo manual al enviar.
            </span>
          ) : null}
        </div>
      ) : null}

      <Section title="Datos generales">
        <FichaGrid
          rows={[
            ['Código', estim.codigo],
            ['Contratista', contratistaDisplay],
            ['Fecha de cierre', fmtFecha(estim.fecha_cierre)],
            ['Pago programado', fmtFecha(estim.fecha_pago_programado)],
            ['Tareas incluidas', String(estTareas.length)],
            [
              'Retención',
              `${Number(estim.retencion_pct).toFixed(1)}% (${money(estim.retencion_monto)})`,
            ],
            ['Monto bruto', money(estim.monto_bruto)],
            ['Monto neto', money(estim.monto_neto)],
          ]}
        />
        {estim.notas ? (
          <div className="mt-4 border-t border-[var(--border)] pt-4">
            <div className="text-xs font-medium uppercase tracking-wide text-[var(--text)]/50">
              Notas
            </div>
            <p className="mt-0.5 whitespace-pre-wrap text-sm text-[var(--text)]/80">
              {estim.notas}
            </p>
          </div>
        ) : null}
      </Section>

      {/* Factura + Pago — solo mostrar si hay datos */}
      {estim.factura_url ||
      estim.factura_folio ||
      estim.referencia_pago ||
      estim.aprobada_at ||
      estim.pagada_at ? (
        <Section title="Factura y pago">
          <FichaGrid
            rows={
              [
                estim.factura_folio ? ['Factura folio', estim.factura_folio] : null,
                estim.factura_fecha ? ['Factura fecha', fmtFecha(estim.factura_fecha)] : null,
                estim.factura_url
                  ? [
                      'Factura URL',
                      (
                        <a
                          href={estim.factura_url}
                          target="_blank"
                          rel="noreferrer"
                          className="text-[var(--accent)] hover:underline"
                          key="url"
                        >
                          Abrir factura
                        </a>
                      ) as unknown as string,
                    ]
                  : null,
                estim.aprobada_at
                  ? [
                      'Aprobada',
                      `${fmtFechaHora(estim.aprobada_at)}${aprobadaPor ? ` por ${aprobadaPor}` : ''}`,
                    ]
                  : null,
                estim.pagada_at
                  ? [
                      'Pagada',
                      `${fmtFechaHora(estim.pagada_at)}${pagadaPor ? ` por ${pagadaPor}` : ''}`,
                    ]
                  : null,
                estim.referencia_pago ? ['Referencia de pago', estim.referencia_pago] : null,
              ].filter((r): r is [string, string] => !!r) as [string, string][]
            }
          />
        </Section>
      ) : null}

      <Section
        title="Desglose por obra"
        description={`${desglosePorObra.length} obra(s) · ${estTareas.length} tarea(s)`}
      >
        {desglosePorObra.length === 0 ? (
          <p className="text-sm text-[var(--text)]/60">Sin tareas vinculadas.</p>
        ) : (
          <div className="space-y-2">
            {desglosePorObra.map((g) => (
              <ObraBlock key={g.construccion_id} grupo={g} />
            ))}
          </div>
        )}
      </Section>

      {/* Modal de transiciones de estado. Solo se renderiza si hay modal activo. */}
      {modal ? (
        <TransitionModal
          kind={modal}
          codigo={estim.codigo}
          montoNeto={estim.monto_neto}
          saving={savingTransition}
          onClose={() => (savingTransition ? null : setModal(null))}
          onAprobar={aprobar}
          onCancelar={cancelar}
        />
      ) : null}

      {/* Modal para enviar el PDF al contratista vía email Resend. */}
      {emailModalOpen ? (
        <EmailModal
          codigo={estim.codigo}
          montoNeto={estim.monto_neto}
          defaultEmail={contratistaEmail}
          sending={sendingEmail}
          onClose={() => (sendingEmail ? null : setEmailModalOpen(false))}
          onSend={async (to) => {
            setSendingEmail(true);
            const res = await fetch(`/api/dilesa/estimaciones/${estim.id}/pdf`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ to }),
            });
            const json = (await res.json().catch(() => ({}))) as {
              error?: string;
              sentTo?: string;
            };
            setSendingEmail(false);
            if (!res.ok) {
              toast.add({
                title: 'No se pudo enviar el email',
                description: json.error ?? 'Error desconocido',
                type: 'error',
              });
              return;
            }
            toast.add({
              title: 'Email enviado',
              description: `PDF enviado a ${json.sentTo ?? to}`,
              type: 'success',
            });
            setEmailModalOpen(false);
          }}
        />
      ) : null}
    </div>
  );
}

function EmailModal({
  codigo,
  montoNeto,
  defaultEmail,
  sending,
  onClose,
  onSend,
}: {
  codigo: string;
  montoNeto: number;
  defaultEmail: string | null;
  sending: boolean;
  onClose: () => void;
  onSend: (to: string) => void | Promise<void>;
}) {
  const [to, setTo] = useState(defaultEmail ?? '');

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-lg border border-[var(--border)] bg-[var(--card)] p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-base font-semibold text-[var(--text)]">
            Enviar estimación al contratista
          </h3>
          <button
            type="button"
            onClick={onClose}
            disabled={sending}
            className="rounded-md p-1 text-[var(--text)]/50 hover:bg-[var(--bg)]/30 disabled:opacity-30"
            aria-label="Cerrar"
          >
            <X className="size-4" />
          </button>
        </div>

        <p className="mb-4 text-xs text-[var(--text)]/60">
          {codigo} · solicita factura por {money(montoNeto)}
        </p>

        <div className="mb-4 space-y-3">
          <ModalField label="Email del contratista *">
            <Input
              type="email"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              placeholder="contratista@ejemplo.com"
              required
            />
          </ModalField>
          <p className="text-[11px] text-[var(--text)]/55">
            Se envía con el PDF de la estimación adjunto + texto pidiendo que emita la factura por
            el monto neto y la envíe a facturas@dilesa.mx. Puedes re-enviar las veces que necesites.
          </p>
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose} disabled={sending}>
            Cerrar
          </Button>
          <Button
            onClick={() => void onSend(to)}
            disabled={sending || !to.trim() || !/^.+@.+\..+$/.test(to)}
          >
            {sending ? <Loader2 className="size-4 animate-spin" /> : <Mail className="size-4" />}
            Enviar PDF por email
          </Button>
        </div>
      </div>
    </div>
  );
}

function ActionBar({
  estado,
  onAprobar,
  onCancelar,
}: {
  estado: string;
  onAprobar: () => void;
  onCancelar: () => void;
}) {
  // Botones contextuales. La factura y el pago ya NO se capturan aquí: viven
  // en Cuentas por Pagar (se derivan de la factura en espera). En construcción
  // solo se aprueba el devengo y, si hace falta, se cancela.
  const acciones: React.ReactNode[] = [];
  if (estado === 'borrador') {
    acciones.push(
      <Button key="aprobar" onClick={onAprobar}>
        <Check className="size-4" /> Aprobar
      </Button>,
      <Button key="cancelar" variant="outline" onClick={onCancelar}>
        <X className="size-4" /> Cancelar
      </Button>
    );
  } else if (estado === 'aprobada') {
    acciones.push(
      <Button key="cancelar" variant="outline" onClick={onCancelar}>
        <X className="size-4" /> Cancelar
      </Button>
    );
  }

  if (acciones.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--card)] p-3">
      <span className="text-xs uppercase tracking-wide text-[var(--text)]/50">Acciones:</span>
      {acciones}
    </div>
  );
}

function TransitionModal({
  kind,
  codigo,
  montoNeto,
  saving,
  onClose,
  onAprobar,
  onCancelar,
}: {
  kind: NonNullable<ModalKind>;
  codigo: string;
  montoNeto: number;
  saving: boolean;
  onClose: () => void;
  onAprobar: () => void | Promise<void>;
  onCancelar: () => void | Promise<void>;
}) {
  const titulo = kind === 'aprobar' ? 'Aprobar estimación' : 'Cancelar estimación';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-lg border border-[var(--border)] bg-[var(--card)] p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-base font-semibold text-[var(--text)]">{titulo}</h3>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="rounded-md p-1 text-[var(--text)]/50 hover:bg-[var(--bg)]/30 disabled:opacity-30"
            aria-label="Cerrar"
          >
            <X className="size-4" />
          </button>
        </div>

        <p className="mb-4 text-xs text-[var(--text)]/60">
          {codigo} · {moneyFmt.format(montoNeto)} neto
        </p>

        {kind === 'aprobar' ? (
          <p className="mb-4 text-sm text-[var(--text)]/80">
            Al aprobar se crea la <strong>factura en espera</strong> en Cuentas por Pagar por el
            monto neto. A partir de ahí administración la procesa allí: sube el XML del contratista,
            programa y paga. El estado de factura y pago se reflejará aquí automáticamente.
          </p>
        ) : (
          <div className="mb-4 rounded-md border border-amber-500/30 bg-amber-500/5 p-3 text-xs text-amber-700 dark:text-amber-300">
            Al cancelar, las tareas vinculadas se liberan y vuelven a aparecer como pendientes de
            pago. Si ya tenía factura en espera en CxP, también se cancela. Esta acción no se puede
            deshacer.
          </div>
        )}

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cerrar
          </Button>
          <Button
            onClick={() => {
              if (kind === 'aprobar') void onAprobar();
              else void onCancelar();
            }}
            disabled={saving}
          >
            {saving ? <Loader2 className="size-4 animate-spin" /> : null}
            Confirmar
          </Button>
        </div>
      </div>
    </div>
  );
}

function ModalField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-1 text-xs font-medium uppercase tracking-wide text-[var(--text)]/60">
        {label}
      </div>
      {children}
    </div>
  );
}

function ObraBlock({
  grupo,
}: {
  grupo: {
    construccion_id: string;
    construccion_codigo: string;
    unidad_identificador: string;
    contrato_codigo: string | null;
    items: Array<{ nombre: string; fecha: string | null; monto: number }>;
    subtotal: number;
  };
}) {
  const [open, setOpen] = useState(false);
  const Icon = open ? ChevronDown : ChevronRight;
  return (
    <div className="rounded-md border border-[var(--border)] bg-[var(--card)]">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-[var(--bg)]/30"
      >
        <Icon className="h-4 w-4 shrink-0 text-[var(--text)]/40" />
        <Link
          href={`/dilesa/construccion/${grupo.construccion_id}`}
          onClick={(e) => e.stopPropagation()}
          className="text-sm font-medium text-[var(--text)] hover:text-[var(--accent)]"
        >
          {grupo.unidad_identificador}
        </Link>
        <span className="text-xs text-[var(--text)]/50">{grupo.construccion_codigo}</span>
        {grupo.contrato_codigo ? (
          <span className="rounded bg-[var(--bg)]/60 px-1.5 py-0.5 text-[11px] text-[var(--text)]/60">
            {grupo.contrato_codigo}
          </span>
        ) : null}
        <span className="ml-auto text-xs tabular-nums text-[var(--text)]/60">
          {grupo.items.length} tarea{grupo.items.length === 1 ? '' : 's'}
        </span>
        <span className="w-32 shrink-0 text-right text-sm font-medium tabular-nums text-[var(--text)]">
          {moneyFmt.format(grupo.subtotal)}
        </span>
      </button>
      {open ? (
        <ul className="border-t border-[var(--border)]/60 px-3 py-2">
          {grupo.items.map((it, idx) => (
            <li
              key={idx}
              className="flex items-start gap-3 border-b border-[var(--border)]/40 py-1.5 text-xs last:border-0"
            >
              <div className="flex-1 text-[var(--text)]/80">{it.nombre}</div>
              <div className="w-24 shrink-0 text-right tabular-nums text-[var(--text)]/55">
                {it.fecha ? fmtFecha(it.fecha) : '—'}
              </div>
              <div className="w-28 shrink-0 text-right tabular-nums text-[var(--text)]">
                {moneyFmt.format(it.monto)}
              </div>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function BackLink() {
  return (
    <Link
      href="/dilesa/construccion/estimaciones"
      className="inline-flex items-center gap-1.5 text-sm text-[var(--text)]/60 hover:text-[var(--text)]"
    >
      <ArrowLeft className="size-4" /> Volver a estimaciones
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

function FichaGrid({ rows }: { rows: [string, string][] }) {
  return (
    <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
      {rows.map((r) => (
        <div key={r[0]}>
          <dt className="text-xs font-medium uppercase tracking-wide text-[var(--text)]/50">
            {r[0]}
          </dt>
          <dd className="mt-0.5 text-sm text-[var(--text)]">{r[1]}</dd>
        </div>
      ))}
    </dl>
  );
}
