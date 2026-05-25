'use client';

/* eslint-disable react-hooks/set-state-in-effect --
 * Mismo data-sync pattern que el resto de páginas de detalle (cf.
 * app/dilesa/ventas/[id]/page.tsx).
 */

/**
 * Detalle completo de una construcción DILESA — 4 secciones:
 *   1. Datos generales — prototipo, contratista, supervisor, fechas
 *      críticas (arranque, compromiso, terminada, DTU, seguro calidad,
 *      extracción, paquete RUV), CUV, Frente RUV.
 *   2. Mano de obra — ejecutado, valor contrato, m² construcción,
 *      precio MO x m².
 *   3. Avance por etapa — para cada etapa de la plantilla del prototipo,
 *      progress bar de tareas terminadas / totales + colapsable con la
 *      lista (terminadas con fecha+revisor, pendientes outline).
 *   4. Contrato — link al contrato de construcción (si tiene N:M con
 *      contrato_lotes).
 *
 * Lectura pura — la captura ("registrar tarea terminada") es Sprint 4.
 *
 * Iniciativa dilesa-construccion · Sprint 3 (UI lectura).
 */

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Check, ChevronDown, ChevronRight, Circle, HardHat } from 'lucide-react';
import { RequireAccess } from '@/components/require-access';
import { createSupabaseBrowserClient } from '@/lib/supabase-browser';
import { usePermissions } from '@/components/providers';
import { Badge } from '@/components/ui/badge';
import type { BadgeTone } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/components/ui/toast';
import { getSupabaseErrorMessage } from '@/lib/supabase-error';
import { DILESA_EMPRESA_ID } from '@/lib/empresa-constants';

type Construccion = {
  id: string;
  codigo: string;
  unidad_id: string;
  producto_id: string;
  contratista_id: string;
  supervisor_persona_id: string | null;
  fecha_arranque: string | null;
  fecha_compromiso_terminar: string | null;
  fecha_terminada: string | null;
  fecha_seguro_calidad: string | null;
  fecha_extraccion: string | null;
  fecha_paquete_ruv: string | null;
  fecha_dtu: string | null;
  cuv: string | null;
  frente_ruv: string | null;
  avance_pct: number;
  mo_ejecutado: number;
  m2_construccion: number | null;
  precio_mo_x_m2: number | null;
  valor_contrato_mo: number | null;
  estado: string;
  notas: string | null;
};

type UnidadInfo = {
  identificador: string;
  proyecto_id: string;
};

type Etapa = { id: string; nombre: string; orden: number };
type Tarea = { id: string; nombre: string };
type Plantilla = {
  id: string;
  tarea_id: string;
  etapa_id: string;
  porcentaje_costo: number;
  tiempo_dias: number | null;
};
type Terminada = {
  id: string;
  plantilla_tarea_id: string;
  fecha_terminada: string | null;
  revisado_por_persona_id: string | null;
  revisado_por_user_id: string | null;
  mano_obra_pagada: number | null;
  fecha_pagada: string | null;
  tiempo_real_dias: number | null;
  notas: string | null;
};
type ContratoLote = {
  id: string;
  contrato_id: string;
  monto_lote: number | null;
};
type Contrato = {
  id: string;
  codigo: string;
  fecha_contrato: string;
  valor_total: number;
};

const ESTADO_TONE: Record<string, BadgeTone> = {
  arrancada: 'info',
  en_progreso: 'warning',
  terminada: 'success',
  dtu: 'success',
  seguro_calidad: 'success',
  extraida: 'success',
  cancelada: 'neutral',
};

const ESTADO_LABEL: Record<string, string> = {
  arrancada: 'Arrancada',
  en_progreso: 'En progreso',
  terminada: 'Terminada',
  dtu: 'DTU',
  seguro_calidad: 'Seguro calidad',
  extraida: 'Extraída',
  cancelada: 'Cancelada',
};

const moneyFmt = new Intl.NumberFormat('es-MX', {
  style: 'currency',
  currency: 'MXN',
  maximumFractionDigits: 0,
});

const numberFmt = new Intl.NumberFormat('es-MX');

function fmtMoney(n: number | null): string | null {
  return n == null ? null : moneyFmt.format(n);
}

function fmtNum(n: number | null, suffix = ''): string | null {
  return n == null ? null : `${numberFmt.format(n)}${suffix}`;
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

/**
 * @module Construcción detail (DILESA)
 * @responsive desktop-only
 */
export default function ConstruccionDetailPage() {
  return (
    <RequireAccess empresa="dilesa" modulo="dilesa.construccion.obras">
      <DetailInner />
    </RequireAccess>
  );
}

function DetailInner() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const { permissions } = usePermissions();
  const toast = useToast();
  const puedePalomearTareas =
    permissions.isAdmin || permissions.modulos.get('dilesa.construccion.tareas')?.write === true;

  const [obra, setObra] = useState<Construccion | null>(null);
  const [unidad, setUnidad] = useState<UnidadInfo | null>(null);
  const [proyectoNombre, setProyectoNombre] = useState<string | null>(null);
  const [prototipoNombre, setPrototipoNombre] = useState<string | null>(null);
  const [contratistaNombre, setContratistaNombre] = useState<string | null>(null);
  const [contratistaAbrev, setContratistaAbrev] = useState<string | null>(null);
  const [supervisorNombre, setSupervisorNombre] = useState<string | null>(null);
  const [etapas, setEtapas] = useState<Etapa[]>([]);
  const [tareasCat, setTareasCat] = useState<Map<string, Tarea>>(new Map());
  const [plantilla, setPlantilla] = useState<Plantilla[]>([]);
  const [terminadas, setTerminadas] = useState<Terminada[]>([]);
  /** Diccionario para mostrar quién palomeó. Prioridad: usuario del sistema
   *  (core.usuarios.first_name) sobre persona ERP (revisado_por_persona_id),
   *  que queda como fallback para registros importados de Coda. */
  const [userNombres, setUserNombres] = useState<Map<string, string>>(new Map());
  const [revisorNombres, setRevisorNombres] = useState<Map<string, string>>(new Map());
  const [currentUser, setCurrentUser] = useState<{ id: string; nombre: string } | null>(null);
  /** plantilla_tarea_id que se está procesando (palomeando o des-palomeando)
   *  — se usa para deshabilitar el click duplicado mientras inserta/borra. */
  const [palomeoInFlight, setPalomeoInFlight] = useState<string | null>(null);
  const [contratos, setContratos] = useState<Array<Contrato & { lote: ContratoLote }>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    let activo = true;
    const sb = createSupabaseBrowserClient();
    setLoading(true);
    setError(null);

    (async () => {
      const { data: oRow, error: oErr } = await sb
        .schema('dilesa')
        .from('construccion')
        .select('*')
        .eq('id', id)
        .is('deleted_at', null)
        .maybeSingle();
      if (!activo) return;
      if (oErr) {
        setError(getSupabaseErrorMessage(oErr, 'No se pudo cargar la obra.'));
        setLoading(false);
        return;
      }
      if (!oRow) {
        setError('Obra no encontrada.');
        setLoading(false);
        return;
      }
      const obraRow = oRow as unknown as Construccion;
      setObra(obraRow);

      // Cargas paralelas dependientes del obra: unidad, prototipo,
      // contratista (+ satélite con abreviación), supervisor.
      const [uRes, prodRes, contRes, datosRes, supRes] = await Promise.all([
        sb
          .schema('dilesa')
          .from('unidades')
          .select('identificador, proyecto_id')
          .eq('id', obraRow.unidad_id)
          .maybeSingle(),
        sb
          .schema('dilesa')
          .from('productos')
          .select('nombre')
          .eq('id', obraRow.producto_id)
          .maybeSingle(),
        sb
          .schema('erp')
          .from('personas')
          .select('nombre, apellido_paterno, apellido_materno')
          .eq('id', obraRow.contratista_id)
          .maybeSingle(),
        sb
          .schema('dilesa')
          .from('contratistas_datos')
          .select('abreviacion')
          .eq('persona_id', obraRow.contratista_id)
          .maybeSingle(),
        obraRow.supervisor_persona_id
          ? sb
              .schema('erp')
              .from('personas')
              .select('nombre, apellido_paterno, apellido_materno')
              .eq('id', obraRow.supervisor_persona_id)
              .maybeSingle()
          : Promise.resolve({ data: null, error: null }),
      ]);
      if (!activo) return;
      const firstErr1 =
        uRes.error ?? prodRes.error ?? contRes.error ?? datosRes.error ?? supRes.error;
      if (firstErr1) {
        setError(getSupabaseErrorMessage(firstErr1, 'No se pudo cargar el detalle de la obra.'));
        setLoading(false);
        return;
      }
      const uData = (uRes.data as UnidadInfo | null) ?? null;
      setUnidad(uData);
      setPrototipoNombre((prodRes.data?.nombre as string | null) ?? null);
      const cName = contRes.data
        ? [contRes.data.nombre, contRes.data.apellido_paterno, contRes.data.apellido_materno]
            .filter(Boolean)
            .join(' ')
        : null;
      setContratistaNombre(cName);
      setContratistaAbrev((datosRes.data?.abreviacion as string | null) ?? null);
      if (supRes.data) {
        setSupervisorNombre(
          [supRes.data.nombre, supRes.data.apellido_paterno, supRes.data.apellido_materno]
            .filter(Boolean)
            .join(' ') || null
        );
      } else {
        setSupervisorNombre(null);
      }

      // Proyecto del lote.
      if (uData?.proyecto_id) {
        const { data: prj } = await sb
          .schema('dilesa')
          .from('proyectos')
          .select('nombre')
          .eq('id', uData.proyecto_id)
          .maybeSingle();
        if (!activo) return;
        setProyectoNombre((prj?.nombre as string | null) ?? null);
      }

      // Plantilla del prototipo + etapas + diccionario de tareas + log
      // de tareas terminadas. Cuatro queries paralelas.
      const [plRes, etRes, taRes, ttRes] = await Promise.all([
        sb
          .schema('dilesa')
          .from('plantilla_tareas')
          .select('id, tarea_id, etapa_id, porcentaje_costo, tiempo_dias')
          .eq('producto_id', obraRow.producto_id)
          .is('deleted_at', null),
        sb
          .schema('dilesa')
          .from('etapas_construccion')
          .select('id, nombre, orden')
          .is('deleted_at', null)
          .order('orden', { ascending: true }),
        sb.schema('dilesa').from('tareas_construccion').select('id, nombre').is('deleted_at', null),
        sb
          .schema('dilesa')
          .from('construccion_tareas_terminadas')
          .select(
            'id, plantilla_tarea_id, fecha_terminada, revisado_por_persona_id, revisado_por_user_id, mano_obra_pagada, fecha_pagada, tiempo_real_dias, notas'
          )
          .eq('construccion_id', obraRow.id)
          .is('deleted_at', null)
          .order('fecha_terminada', { ascending: true }),
      ]);
      if (!activo) return;
      const firstErr2 = plRes.error ?? etRes.error ?? taRes.error ?? ttRes.error;
      if (firstErr2) {
        setError(getSupabaseErrorMessage(firstErr2, 'No se pudieron cargar las etapas y tareas.'));
        setLoading(false);
        return;
      }
      const plantillaArr = (plRes.data ?? []) as Plantilla[];
      setPlantilla(plantillaArr);
      setEtapas((etRes.data ?? []) as Etapa[]);
      const tMap = new Map<string, Tarea>();
      for (const t of taRes.data ?? []) tMap.set(t.id as string, { id: t.id, nombre: t.nombre });
      setTareasCat(tMap);
      const terminadasArr = (ttRes.data ?? []) as Terminada[];
      setTerminadas(terminadasArr);

      // Supervisores de las terminadas. Dos diccionarios paralelos:
      //   - userNombres: por revisado_por_user_id → core.usuarios.first_name
      //     (fuente real desde la captura inline post-2026-05-25).
      //   - revisorNombres: por revisado_por_persona_id → erp.personas.nombre
      //     (legacy, para data importada de Coda donde el revisor era persona).
      const userIds = [
        ...new Set(
          terminadasArr.map((t) => t.revisado_por_user_id).filter((v): v is string => !!v)
        ),
      ];
      const personaIds = [
        ...new Set(
          terminadasArr.map((t) => t.revisado_por_persona_id).filter((v): v is string => !!v)
        ),
      ];
      const [usersQ, personasQ] = await Promise.all([
        userIds.length > 0
          ? sb.schema('core').from('usuarios').select('id, first_name, email').in('id', userIds)
          : Promise.resolve({
              data: [] as Array<{ id: string; first_name: string | null; email: string | null }>,
              error: null,
            }),
        personaIds.length > 0
          ? sb
              .schema('erp')
              .from('personas')
              .select('id, nombre, apellido_paterno, apellido_materno')
              .in('id', personaIds)
          : Promise.resolve({
              data: [] as Array<{
                id: string;
                nombre: string;
                apellido_paterno: string | null;
                apellido_materno: string | null;
              }>,
              error: null,
            }),
      ]);
      if (!activo) return;
      const umap = new Map<string, string>();
      for (const u of usersQ.data ?? []) {
        umap.set(u.id as string, (u.first_name || u.email || '(sin nombre)') as string);
      }
      setUserNombres(umap);
      const rmap = new Map<string, string>();
      for (const r of personasQ.data ?? []) {
        const n = [r.nombre, r.apellido_paterno, r.apellido_materno].filter(Boolean).join(' ');
        rmap.set(r.id as string, n || '(sin nombre)');
      }
      setRevisorNombres(rmap);

      // Contratos asignados: contrato_lotes (N:M) → contratos_construccion.
      const { data: lotes, error: lErr } = await sb
        .schema('dilesa')
        .from('contrato_lotes')
        .select('id, contrato_id, monto_lote')
        .eq('construccion_id', obraRow.id)
        .is('deleted_at', null);
      if (!activo) return;
      if (lErr) {
        setError(getSupabaseErrorMessage(lErr, 'No se pudieron cargar los contratos.'));
        setLoading(false);
        return;
      }
      const lotesArr = (lotes ?? []) as ContratoLote[];
      if (lotesArr.length > 0) {
        const contratoIds = [...new Set(lotesArr.map((l) => l.contrato_id))];
        const { data: cts } = await sb
          .schema('dilesa')
          .from('contratos_construccion')
          .select('id, codigo, fecha_contrato, valor_total')
          .in('id', contratoIds)
          .is('deleted_at', null);
        if (!activo) return;
        const cMap = new Map<string, Contrato>();
        for (const c of cts ?? []) cMap.set(c.id as string, c as Contrato);
        setContratos(
          lotesArr
            .map((l) => {
              const c = cMap.get(l.contrato_id);
              return c ? { ...c, lote: l } : null;
            })
            .filter((x): x is Contrato & { lote: ContratoLote } => !!x)
        );
      } else {
        setContratos([]);
      }

      setLoading(false);
    })();

    return () => {
      activo = false;
    };
  }, [id]);

  // Carga del usuario logueado (para palomear automático + pre-popular el
  // diccionario de supervisores con su nombre). Se hace en effect aparte
  // porque no depende del id de la obra.
  useEffect(() => {
    let activo = true;
    const sb = createSupabaseBrowserClient();
    (async () => {
      const { data: auth } = await sb.auth.getUser();
      const authUser = auth?.user;
      if (!activo || !authUser) return;
      const { data: u } = await sb
        .schema('core')
        .from('usuarios')
        .select('first_name, email')
        .eq('id', authUser.id)
        .maybeSingle();
      if (!activo) return;
      const nombre =
        (u?.first_name as string | null) ||
        (u?.email as string | null) ||
        authUser.email ||
        '(sin nombre)';
      setCurrentUser({ id: authUser.id, nombre });
      setUserNombres((prev) => {
        if (prev.get(authUser.id) === nombre) return prev;
        const next = new Map(prev);
        next.set(authUser.id, nombre);
        return next;
      });
    })();
    return () => {
      activo = false;
    };
  }, []);

  /** Palomea una tarea: INSERT en construccion_tareas_terminadas con defaults.
   *  fecha_terminada=hoy, revisado_por_user_id=current user. El trigger
   *  `tg_construccion_avance` recalcula avance + estado de unidad automático. */
  async function palomearTarea(plantillaId: string) {
    if (!obra || !currentUser || palomeoInFlight) return;
    setPalomeoInFlight(plantillaId);
    const sb = createSupabaseBrowserClient();
    const today = new Date().toISOString().slice(0, 10);
    const { data: insRow, error } = await sb
      .schema('dilesa')
      .from('construccion_tareas_terminadas')
      .insert({
        empresa_id: DILESA_EMPRESA_ID,
        construccion_id: obra.id,
        plantilla_tarea_id: plantillaId,
        fecha_terminada: today,
        revisado_por_user_id: currentUser.id,
      })
      .select(
        'id, plantilla_tarea_id, fecha_terminada, revisado_por_persona_id, revisado_por_user_id, mano_obra_pagada, fecha_pagada, tiempo_real_dias, notas'
      )
      .single();
    setPalomeoInFlight(null);
    if (error || !insRow) {
      toast.add({
        title: 'No se pudo palomear la tarea',
        description: getSupabaseErrorMessage(error, 'Error al insertar.'),
        type: 'error',
      });
      return;
    }
    setTerminadas((prev) => [...prev, insRow as Terminada]);
    // Re-fetch sólo de la obra para reflejar nuevo avance_pct y estado.
    void refetchObra();
  }

  /** Des-palomea: DELETE de la terminada. Confirm previo porque dispara
   *  recálculo de avance y potencialmente revierte la unidad a 'planeada'. */
  async function desPalomearTarea(plantillaId: string, terminadaId: string) {
    if (!obra || palomeoInFlight) return;
    const ok = window.confirm(
      '¿Quitar este registro? El avance de la obra se recalculará. Si baja del 20%, la unidad regresa a "planeada".'
    );
    if (!ok) return;
    setPalomeoInFlight(plantillaId);
    const sb = createSupabaseBrowserClient();
    const { error } = await sb
      .schema('dilesa')
      .from('construccion_tareas_terminadas')
      .delete()
      .eq('id', terminadaId);
    setPalomeoInFlight(null);
    if (error) {
      toast.add({
        title: 'No se pudo quitar el registro',
        description: getSupabaseErrorMessage(error, 'Error al borrar.'),
        type: 'error',
      });
      return;
    }
    setTerminadas((prev) => prev.filter((t) => t.id !== terminadaId));
    void refetchObra();
  }

  async function refetchObra() {
    if (!obra) return;
    const sb = createSupabaseBrowserClient();
    const { data } = await sb
      .schema('dilesa')
      .from('construccion')
      .select('avance_pct, estado, mo_ejecutado, fecha_terminada')
      .eq('id', obra.id)
      .maybeSingle();
    if (data) {
      setObra((prev) =>
        prev
          ? {
              ...prev,
              avance_pct: data.avance_pct as number,
              estado: data.estado as string,
              mo_ejecutado: data.mo_ejecutado as number,
              fecha_terminada: (data.fecha_terminada as string | null) ?? null,
            }
          : prev
      );
    }
  }

  // Agrupación tareas por etapa, con flag terminada/pendiente, % de costo y
  // MO calculada (porcentaje × valor_contrato_mo). El cálculo es derivado
  // — mismo principio que la vista `dilesa.v_construccion_tareas_terminadas_con_mo`
  // que es la fuente para estimaciones semanales a contratistas.
  const valorContratoMo = obra?.valor_contrato_mo ?? null;
  const etapasConTareas = useMemo(() => {
    const terminadasByPlantilla = new Map<string, Terminada>();
    for (const t of terminadas) terminadasByPlantilla.set(t.plantilla_tarea_id, t);

    const rows = etapas.map((et) => {
      const tareasDeEtapa = plantilla.filter((p) => p.etapa_id === et.id);
      const items = tareasDeEtapa
        .map((p) => {
          const tareaInfo = tareasCat.get(p.tarea_id);
          const terminada = terminadasByPlantilla.get(p.id) ?? null;
          const porcentajeCosto = Number(p.porcentaje_costo ?? 0);
          const manoObraCalculada =
            valorContratoMo != null ? porcentajeCosto * valorContratoMo : null;
          return {
            plantillaId: p.id,
            nombre: tareaInfo?.nombre ?? '(tarea desconocida)',
            porcentajeCosto,
            manoObraCalculada,
            terminada,
          };
        })
        .sort((a, b) => a.nombre.localeCompare(b.nombre));
      const total = items.length;
      const completas = items.filter((it) => !!it.terminada).length;
      const pctEtapa = total === 0 ? 0 : (completas / total) * 100;
      const pctCosto = items
        .filter((it) => !!it.terminada)
        .reduce((s, it) => s + it.porcentajeCosto, 0);
      return {
        ...et,
        items,
        total,
        completas,
        pctEtapa,
        pctCosto,
      };
    });
    // Solo mostrar etapas con tareas en la plantilla del prototipo
    return rows.filter((r) => r.total > 0);
  }, [etapas, plantilla, tareasCat, terminadas, valorContratoMo]);

  const moPorEjecutar = useMemo(() => {
    if (!obra) return null;
    if (obra.valor_contrato_mo == null) return null;
    return obra.valor_contrato_mo - obra.mo_ejecutado;
  }, [obra]);

  /** Días estimados = suma del `tiempo_dias` de toda la plantilla del prototipo.
   *  Asunción: tareas secuenciales (como en Coda). Si en el futuro hay
   *  paralelismo, esto se convierte en esfuerzo total, no en plazo. */
  const totalDiasEstimado = useMemo(
    () => plantilla.reduce((s, p) => s + Number(p.tiempo_dias ?? 0), 0),
    [plantilla]
  );

  /** Días pendientes = suma del `tiempo_dias` de las tareas que aún NO se
   *  han palomeado. Lo usamos para proyectar la fecha de terminación
   *  desde HOY (no desde fecha_arranque), reflejando avance real. */
  const diasPendientes = useMemo(() => {
    const terminadasIds = new Set(terminadas.map((t) => t.plantilla_tarea_id));
    return plantilla
      .filter((p) => !terminadasIds.has(p.id))
      .reduce((s, p) => s + Number(p.tiempo_dias ?? 0), 0);
  }, [plantilla, terminadas]);

  /** Suma de días reales reportados en las tareas ya terminadas. */
  const diasRealesAcumulados = useMemo(
    () => terminadas.reduce((s, t) => s + Number(t.tiempo_real_dias ?? 0), 0),
    [terminadas]
  );

  /** Días corridos transcurridos desde fecha_arranque hasta hoy. Si no
   *  arrancó (fecha_arranque null) o la fecha es futura, devuelve null. */
  const fechaArranque = obra?.fecha_arranque ?? null;
  const diasTranscurridos = useMemo(() => {
    if (!fechaArranque) return null;
    const start = new Date(`${fechaArranque}T00:00:00`).getTime();
    const today = new Date().setHours(0, 0, 0, 0);
    const diff = Math.max(0, Math.floor((today - start) / (1000 * 60 * 60 * 24)));
    return diff;
  }, [fechaArranque]);

  /** Fecha proyectada de terminación = HOY + ceil(diasPendientes).
   *  Dinámica: refleja el avance real, no el plan original. Si la obra
   *  está sin arrancar o sin plantilla, devuelve null. */
  const fechaProyectadaTerminar = useMemo(() => {
    if (!fechaArranque || diasPendientes <= 0) return null;
    const base = new Date();
    base.setHours(12, 0, 0, 0);
    base.setDate(base.getDate() + Math.ceil(diasPendientes));
    return base.toISOString().slice(0, 10);
  }, [fechaArranque, diasPendientes]);

  /** % tiempo transcurrido = días_transcurridos / días_estimados × 100.
   *  Null si no arrancó o si la plantilla no tiene días estimados. */
  const pctTiempoTranscurrido = useMemo(() => {
    if (diasTranscurridos == null || totalDiasEstimado <= 0) return null;
    return (diasTranscurridos / totalDiasEstimado) * 100;
  }, [diasTranscurridos, totalDiasEstimado]);

  /** KPI Efectividad de construcción = % avance / % tiempo transcurrido.
   *   - >= 1.10 → adelantado (verde)
   *   - 0.90 - 1.10 → en tiempo (ámbar suave)
   *   - < 0.90 → atrasado (rojo)
   *  Edge case: si % tiempo es 0 (mismo día del arranque) o si la obra
   *  ya está al 100%, no se calcula numéricamente. */
  const efectividad = useMemo(() => {
    if (pctTiempoTranscurrido == null || pctTiempoTranscurrido <= 0) return null;
    if (!obra) return null;
    return obra.avance_pct / pctTiempoTranscurrido;
  }, [obra, pctTiempoTranscurrido]);

  /** Diferencia entre fecha proyectada y compromiso (en días). Negativo =
   *  antes del compromiso (a tiempo), positivo = después (tarde). */
  const fechaCompromiso = obra?.fecha_compromiso_terminar ?? null;
  const diasVsCompromiso = useMemo(() => {
    if (!fechaProyectadaTerminar || !fechaCompromiso) return null;
    const proyectada = new Date(`${fechaProyectadaTerminar}T00:00:00`).getTime();
    const compromiso = new Date(`${fechaCompromiso}T00:00:00`).getTime();
    return Math.round((proyectada - compromiso) / (1000 * 60 * 60 * 24));
  }, [fechaProyectadaTerminar, fechaCompromiso]);

  if (loading) {
    return (
      <div className="container mx-auto max-w-6xl space-y-6 px-4 py-6">
        <Skeleton className="h-5 w-40" />
        <Skeleton className="h-24 w-full rounded-lg" />
        <Skeleton className="h-64 w-full rounded-lg" />
        <Skeleton className="h-48 w-full rounded-lg" />
      </div>
    );
  }

  if (error || !obra) {
    return (
      <div className="container mx-auto max-w-6xl space-y-4 px-4 py-6">
        <BackLink />
        <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
          {error ?? 'Obra no encontrada.'}
        </div>
      </div>
    );
  }

  const protoSufijo = prototipoNombre ? prototipoNombre.split('-').pop() : null;
  const identificadorCompleto = unidad
    ? protoSufijo
      ? `${unidad.identificador}-${protoSufijo}`
      : unidad.identificador
    : obra.codigo;

  // Fechas/días de progreso viven en la sección "Cronograma" (más abajo).
  // Aquí solo datos identificadores + hitos post-cierre (DTU/SC/RUV).
  const fichaGeneral: { label: string; value: string }[] = (
    [
      ['Proyecto', proyectoNombre],
      ['Unidad', unidad?.identificador ?? null],
      ['Código de obra', obra.codigo],
      ['Prototipo', prototipoNombre],
      [
        'Contratista',
        contratistaAbrev && contratistaNombre
          ? `${contratistaAbrev} · ${contratistaNombre}`
          : (contratistaNombre ?? null),
      ],
      ['Supervisor', supervisorNombre],
      ['Fecha terminada', fmtFecha(obra.fecha_terminada)],
      ['Fecha DTU', fmtFecha(obra.fecha_dtu)],
      ['Fecha seguro calidad', fmtFecha(obra.fecha_seguro_calidad)],
      ['Fecha extracción', fmtFecha(obra.fecha_extraccion)],
      ['Fecha paquete RUV', fmtFecha(obra.fecha_paquete_ruv)],
      ['CUV', obra.cuv],
      ['Frente RUV', obra.frente_ruv],
    ] as [string, string | null][]
  )
    .filter((r): r is [string, string] => r[1] != null && r[1] !== '')
    .map(([label, value]) => ({ label, value }));

  const fichaMO: { label: string; value: string }[] = (
    [
      ['Avance', `${obra.avance_pct.toFixed(0)}%`],
      ['MO ejecutado', fmtMoney(obra.mo_ejecutado)],
      ['Valor contrato MO', fmtMoney(obra.valor_contrato_mo)],
      ['MO por ejecutar', fmtMoney(moPorEjecutar)],
      ['m² construcción', fmtNum(obra.m2_construccion, ' m²')],
      ['Precio MO por m²', fmtMoney(obra.precio_mo_x_m2)],
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
            <HardHat className="h-5 w-5 text-[var(--accent)]" />
            {identificadorCompleto}
          </h1>
          {proyectoNombre ? (
            <p className="mt-1 text-sm text-[var(--text)]/60">
              {proyectoNombre}
              {contratistaNombre ? ` · ${contratistaNombre}` : ''}
            </p>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge tone={ESTADO_TONE[obra.estado] ?? 'neutral'}>
            {ESTADO_LABEL[obra.estado] ?? obra.estado}
          </Badge>
          <span className="inline-flex items-center gap-2 rounded-md border border-[var(--border)] bg-[var(--card)] px-2 py-1 text-xs text-[var(--text)]/70">
            <div className="h-1.5 w-24 overflow-hidden rounded-full bg-[var(--border)]/40">
              <div
                className={`h-full rounded-full ${avanceColorClass(obra.avance_pct)}`}
                style={{ width: `${Math.min(100, Math.max(0, obra.avance_pct))}%` }}
              />
            </div>
            <span className="tabular-nums">{obra.avance_pct.toFixed(0)}%</span>
          </span>
        </div>
      </header>

      <Section title="Datos generales">
        {fichaGeneral.length === 0 ? (
          <p className="text-sm text-[var(--text)]/60">Sin datos capturados.</p>
        ) : (
          <FichaGrid rows={fichaGeneral} cols={3} />
        )}
        {obra.notas ? (
          <div className="mt-4 border-t border-[var(--border)] pt-4">
            <div className="text-xs font-medium uppercase tracking-wide text-[var(--text)]/50">
              Notas
            </div>
            <p className="mt-0.5 whitespace-pre-wrap text-sm text-[var(--text)]/80">{obra.notas}</p>
          </div>
        ) : null}
      </Section>

      <CronogramaSection
        fechaArranque={obra.fecha_arranque}
        fechaCompromiso={obra.fecha_compromiso_terminar}
        fechaProyectada={fechaProyectadaTerminar}
        fechaTerminada={obra.fecha_terminada}
        totalDiasEstimado={totalDiasEstimado}
        diasTranscurridos={diasTranscurridos}
        diasPendientes={diasPendientes}
        diasRealesAcumulados={diasRealesAcumulados}
        pctTiempoTranscurrido={pctTiempoTranscurrido}
        avancePct={obra.avance_pct}
        efectividad={efectividad}
        diasVsCompromiso={diasVsCompromiso}
      />

      <Section title="Mano de obra">
        {fichaMO.length === 0 ? (
          <p className="text-sm text-[var(--text)]/60">—</p>
        ) : (
          <FichaGrid rows={fichaMO} cols={3} />
        )}
      </Section>

      <Section
        title="Avance por etapa"
        description={
          etapasConTareas.length === 0
            ? 'sin plantilla'
            : `${etapasConTareas.length} ${etapasConTareas.length === 1 ? 'etapa' : 'etapas'} · ${terminadas.length} ${terminadas.length === 1 ? 'tarea' : 'tareas'} terminadas`
        }
      >
        {etapasConTareas.length === 0 ? (
          <p className="text-sm text-[var(--text)]/60">
            La plantilla del prototipo no tiene tareas registradas para este producto.
          </p>
        ) : (
          <>
            {puedePalomearTareas ? (
              <p className="mb-3 text-xs text-[var(--text)]/60">
                Click en el círculo de una tarea para palomearla como terminada. Tu nombre queda
                automático como supervisor. Click en una terminada para quitar el registro (con
                confirmación).
              </p>
            ) : null}
            <div className="space-y-2">
              {etapasConTareas.map((et) => (
                <EtapaBlock
                  key={et.id}
                  etapa={et}
                  userNombres={userNombres}
                  revisorNombres={revisorNombres}
                  puedePalomear={puedePalomearTareas}
                  palomeoInFlight={palomeoInFlight}
                  onPalomear={palomearTarea}
                  onDesPalomear={desPalomearTarea}
                />
              ))}
            </div>
          </>
        )}
      </Section>

      <Section
        title="Contratos"
        description={
          contratos.length === 0 ? 'sin contrato' : `${contratos.length} contrato(s) asignado(s)`
        }
      >
        {contratos.length === 0 ? (
          <p className="text-sm text-[var(--text)]/60">
            Esta obra no tiene contrato de construcción asignado todavía.
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
                    {c.lote.monto_lote != null
                      ? ` · ${moneyFmt.format(c.lote.monto_lote)} en este lote`
                      : ''}
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
      href="/dilesa/construccion"
      className="inline-flex items-center gap-1.5 text-sm text-[var(--text)]/60 hover:text-[var(--text)]"
    >
      <ArrowLeft className="size-4" /> Volver a construcción
    </Link>
  );
}

function EtapaBlock({
  etapa,
  userNombres,
  revisorNombres,
  puedePalomear,
  palomeoInFlight,
  onPalomear,
  onDesPalomear,
}: {
  etapa: {
    id: string;
    nombre: string;
    orden: number;
    items: Array<{
      plantillaId: string;
      nombre: string;
      porcentajeCosto: number;
      manoObraCalculada: number | null;
      terminada: Terminada | null;
    }>;
    total: number;
    completas: number;
    pctEtapa: number;
    pctCosto: number;
  };
  userNombres: Map<string, string>;
  revisorNombres: Map<string, string>;
  puedePalomear: boolean;
  palomeoInFlight: string | null;
  onPalomear: (plantillaId: string) => void;
  onDesPalomear: (plantillaId: string, terminadaId: string) => void;
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
        <span className="w-6 shrink-0 font-mono text-[10px] tabular-nums text-[var(--text)]/40">
          {etapa.orden}
        </span>
        <span className="min-w-[180px] shrink-0 text-sm font-medium text-[var(--text)]">
          {etapa.nombre}
        </span>
        <div className="flex flex-1 items-center gap-2">
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-[var(--border)]/40">
            <div
              className={`h-full rounded-full ${avanceColorClass(etapa.pctEtapa)}`}
              style={{ width: `${etapa.pctEtapa}%` }}
            />
          </div>
          <span className="w-20 shrink-0 text-right text-xs tabular-nums text-[var(--text)]/60">
            {etapa.completas}/{etapa.total}
          </span>
          <span className="w-14 shrink-0 text-right text-xs tabular-nums text-[var(--text)]/50">
            {etapa.pctCosto.toFixed(1)}%
          </span>
        </div>
      </button>
      {open ? (
        <ul className="border-t border-[var(--border)]/60 px-3 py-2">
          {etapa.items.map((it) => {
            const t = it.terminada;
            // Display de supervisor: prioridad core.usuarios.first_name (capturado
            // por la UI nueva post-2026-05-25), fallback erp.personas (data Coda).
            const supervisor = t?.revisado_por_user_id
              ? (userNombres.get(t.revisado_por_user_id) ?? null)
              : t?.revisado_por_persona_id
                ? (revisorNombres.get(t.revisado_por_persona_id) ?? null)
                : null;
            const inFlight = palomeoInFlight === it.plantillaId;
            const onClick = () => {
              if (!puedePalomear || inFlight) return;
              if (t) onDesPalomear(it.plantillaId, t.id);
              else onPalomear(it.plantillaId);
            };
            const clickable = puedePalomear && !inFlight;
            return (
              <li
                key={it.plantillaId}
                className="flex flex-wrap items-start gap-3 border-b border-[var(--border)]/40 py-1.5 last:border-0"
              >
                <button
                  type="button"
                  onClick={onClick}
                  disabled={!clickable}
                  className={`mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${
                    clickable
                      ? 'cursor-pointer hover:bg-[var(--accent)]/10'
                      : 'cursor-not-allowed opacity-60'
                  }`}
                  title={
                    !puedePalomear
                      ? 'Sin permiso para palomear tareas'
                      : t
                        ? 'Click para quitar el registro'
                        : 'Click para marcar como terminada'
                  }
                  aria-label={t ? `Quitar palomeo de ${it.nombre}` : `Palomear ${it.nombre}`}
                >
                  {t ? (
                    <Check className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                  ) : (
                    <Circle className="h-3.5 w-3.5 text-[var(--text)]/30" />
                  )}
                </button>
                <div className="flex-1">
                  <div className="text-sm text-[var(--text)]">{it.nombre}</div>
                  {t ? (
                    <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-[var(--text)]/55">
                      {t.fecha_terminada ? (
                        <span>Terminada {fmtFecha(t.fecha_terminada)}</span>
                      ) : null}
                      {supervisor ? <span>Supervisor {supervisor}</span> : null}
                      {it.manoObraCalculada != null ? (
                        <span>MO {moneyFmt.format(it.manoObraCalculada)}</span>
                      ) : t.mano_obra_pagada != null ? (
                        <span>MO {moneyFmt.format(t.mano_obra_pagada)}</span>
                      ) : null}
                      {t.fecha_pagada ? <span>Pagada {fmtFecha(t.fecha_pagada)}</span> : null}
                      {t.notas ? <span className="italic">«{t.notas}»</span> : null}
                    </div>
                  ) : it.manoObraCalculada != null ? (
                    <div className="mt-0.5 text-[11px] text-[var(--text)]/40">
                      MO al palomear: {moneyFmt.format(it.manoObraCalculada)}
                    </div>
                  ) : null}
                </div>
                <div className="shrink-0 text-right text-[11px] tabular-nums text-[var(--text)]/40">
                  {it.porcentajeCosto.toFixed(2)}%
                </div>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
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

/** Sección Cronograma — fechas clave + KPI de Efectividad de Construcción.
 *  Centraliza toda la info de plazo: cuándo arrancó, cuándo se comprometió
 *  a terminar, cuándo se proyecta terminar según avance real, y qué tan
 *  bien va vs el plan. La efectividad es el KPI operativo principal de
 *  DILESA para construcción. */
function CronogramaSection({
  fechaArranque,
  fechaCompromiso,
  fechaProyectada,
  fechaTerminada,
  totalDiasEstimado,
  diasTranscurridos,
  diasPendientes,
  diasRealesAcumulados,
  pctTiempoTranscurrido,
  avancePct,
  efectividad,
  diasVsCompromiso,
}: {
  fechaArranque: string | null;
  fechaCompromiso: string | null;
  fechaProyectada: string | null;
  fechaTerminada: string | null;
  totalDiasEstimado: number;
  diasTranscurridos: number | null;
  diasPendientes: number;
  diasRealesAcumulados: number;
  pctTiempoTranscurrido: number | null;
  avancePct: number;
  efectividad: number | null;
  diasVsCompromiso: number | null;
}) {
  // Si la obra no arrancó y no hay datos de plantilla, ni mostramos la sección.
  if (!fechaArranque && totalDiasEstimado <= 0) return null;

  const obraTerminada = !!fechaTerminada || avancePct >= 100;

  // Clasificación de efectividad — bandas operativas DILESA.
  const efectividadInfo = (() => {
    if (obraTerminada) {
      return {
        label: 'Completada',
        tone: 'success' as const,
        gradient: 'from-emerald-500 to-emerald-600',
        textColor: 'text-emerald-700 dark:text-emerald-300',
        ringColor: 'ring-emerald-500/30',
      };
    }
    if (efectividad == null) {
      return {
        label: 'Sin datos suficientes',
        tone: 'neutral' as const,
        gradient: 'from-slate-400 to-slate-500',
        textColor: 'text-[var(--text)]/60',
        ringColor: 'ring-[var(--border)]',
      };
    }
    if (efectividad >= 1.1) {
      return {
        label: 'Adelantado',
        tone: 'success' as const,
        gradient: 'from-emerald-500 to-emerald-600',
        textColor: 'text-emerald-700 dark:text-emerald-300',
        ringColor: 'ring-emerald-500/30',
      };
    }
    if (efectividad >= 0.9) {
      return {
        label: 'En tiempo',
        tone: 'info' as const,
        gradient: 'from-sky-500 to-sky-600',
        textColor: 'text-sky-700 dark:text-sky-300',
        ringColor: 'ring-sky-500/30',
      };
    }
    if (efectividad >= 0.7) {
      return {
        label: 'Atrasado',
        tone: 'warning' as const,
        gradient: 'from-amber-500 to-amber-600',
        textColor: 'text-amber-700 dark:text-amber-300',
        ringColor: 'ring-amber-500/30',
      };
    }
    return {
      label: 'Crítico',
      tone: 'destructive' as const,
      gradient: 'from-rose-500 to-rose-600',
      textColor: 'text-rose-700 dark:text-rose-300',
      ringColor: 'ring-rose-500/30',
    };
  })();

  // Pill helper para mostrar deltas relativos en cards.
  const subtitleArranque = diasTranscurridos != null ? `hace ${diasTranscurridos} días` : null;
  const subtitleCompromiso = (() => {
    if (!fechaCompromiso) return null;
    const today = new Date().setHours(0, 0, 0, 0);
    const target = new Date(`${fechaCompromiso}T00:00:00`).getTime();
    const diff = Math.round((target - today) / (1000 * 60 * 60 * 24));
    if (diff > 0) return `en ${diff} días`;
    if (diff === 0) return 'hoy';
    return `hace ${Math.abs(diff)} días`;
  })();
  const subtitleProyectada = (() => {
    if (obraTerminada) return null;
    if (diasVsCompromiso == null) return null;
    if (diasVsCompromiso === 0) return 'igual al compromiso';
    if (diasVsCompromiso < 0) return `${Math.abs(diasVsCompromiso)} días antes`;
    return `${diasVsCompromiso} días tarde`;
  })();
  const proyectadaTone =
    diasVsCompromiso == null
      ? 'neutral'
      : diasVsCompromiso > 7
        ? 'destructive'
        : diasVsCompromiso > 0
          ? 'warning'
          : 'success';

  const efectividadPct =
    efectividad != null && !obraTerminada ? Math.round(efectividad * 100) : null;
  const proyectadaSubtitleColor =
    proyectadaTone === 'success'
      ? 'text-emerald-600 dark:text-emerald-400'
      : proyectadaTone === 'warning'
        ? 'text-amber-600 dark:text-amber-400'
        : proyectadaTone === 'destructive'
          ? 'text-rose-600 dark:text-rose-400'
          : 'text-[var(--text)]/55';

  return (
    <Section title="Cronograma">
      {/* Fila compacta: 3 fechas inline con separadores. */}
      <div className="flex flex-wrap items-baseline gap-x-5 gap-y-1 text-sm">
        <InlineDate label="Arranque" value={fmtFecha(fechaArranque)} subtitle={subtitleArranque} />
        <InlineDate
          label="Compromiso"
          value={fmtFecha(fechaCompromiso)}
          subtitle={subtitleCompromiso}
        />
        <InlineDate
          label={obraTerminada ? 'Terminada' : 'Proyectada'}
          value={fmtFecha(obraTerminada ? fechaTerminada : fechaProyectada)}
          subtitle={subtitleProyectada}
          subtitleColor={
            obraTerminada ? 'text-emerald-600 dark:text-emerald-400' : proyectadaSubtitleColor
          }
        />
      </div>

      {/* Stats inline en una fila, separadores `·`. */}
      <div className="mt-3 flex flex-wrap items-baseline gap-x-4 gap-y-1 border-t border-[var(--border)] pt-3 text-[11px] text-[var(--text)]/60">
        <InlineStat
          label="Plan"
          value={totalDiasEstimado > 0 ? `${totalDiasEstimado.toFixed(1)}d` : '—'}
        />
        <InlineStat
          label="Transcurridos"
          value={diasTranscurridos != null ? `${diasTranscurridos}d` : '—'}
        />
        <InlineStat
          label="Pendientes"
          value={diasPendientes > 0 ? `${diasPendientes.toFixed(1)}d` : '—'}
        />
        <InlineStat
          label="Tiempo"
          value={pctTiempoTranscurrido != null ? `${pctTiempoTranscurrido.toFixed(0)}%` : '—'}
        />
        {diasRealesAcumulados > 0 ? (
          <InlineStat label="Reales" value={`${diasRealesAcumulados.toFixed(1)}d`} />
        ) : null}
      </div>

      {/* KPI Efectividad — compacto. */}
      <div className="mt-3 flex flex-wrap items-center gap-4 rounded-md border border-[var(--border)] bg-[var(--card)] px-3 py-2.5">
        <div
          className={`flex shrink-0 flex-col items-center justify-center rounded-md bg-gradient-to-br ${efectividadInfo.gradient} px-3 py-1.5 text-white shadow-sm ring-1 ${efectividadInfo.ringColor}`}
        >
          <div className="text-xl font-semibold tabular-nums leading-none">
            {efectividadPct != null ? `${efectividadPct}%` : '—'}
          </div>
          <div className="mt-0.5 text-[9px] font-medium uppercase tracking-wide">
            {efectividadInfo.label}
          </div>
        </div>
        <div className="min-w-0 flex-1 space-y-1">
          <ProgressBar
            label="Avance"
            pct={Math.min(100, avancePct)}
            color={efectividadInfo.gradient}
          />
          <ProgressBar
            label="Tiempo"
            pct={Math.min(100, pctTiempoTranscurrido ?? 0)}
            color="from-slate-400 to-slate-500"
          />
        </div>
        <div className="basis-full text-[10px] text-[var(--text)]/45">
          Efectividad = Avance ÷ Tiempo. ≥110% adelantado · 90-110% en tiempo · 70-90% atrasado ·
          &lt;70% crítico.
        </div>
      </div>
    </Section>
  );
}

function InlineDate({
  label,
  value,
  subtitle,
  subtitleColor,
}: {
  label: string;
  value: string | null;
  subtitle: string | null;
  subtitleColor?: string;
}) {
  return (
    <div>
      <span className="text-[10px] uppercase tracking-wide text-[var(--text)]/50">{label}</span>{' '}
      <span className="text-sm font-semibold tabular-nums text-[var(--text)]">{value ?? '—'}</span>
      {subtitle ? (
        <span className={`ml-1 text-[11px] ${subtitleColor ?? 'text-[var(--text)]/55'}`}>
          ({subtitle})
        </span>
      ) : null}
    </div>
  );
}

function InlineStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="whitespace-nowrap">
      <span className="text-[var(--text)]/50">{label}</span>{' '}
      <span className="font-medium tabular-nums text-[var(--text)]">{value}</span>
    </div>
  );
}

function ProgressBar({ label, pct, color }: { label: string; pct: number; color: string }) {
  return (
    <div>
      <div className="mb-0.5 flex items-center justify-between text-[10px] text-[var(--text)]/60">
        <span>{label}</span>
        <span className="tabular-nums">{pct.toFixed(1)}%</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-[var(--border)]/40">
        <div
          className={`h-full rounded-full bg-gradient-to-r ${color}`}
          style={{ width: `${Math.max(0, Math.min(100, pct))}%` }}
        />
      </div>
    </div>
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
