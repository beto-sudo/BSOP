'use client';

/* eslint-disable react-hooks/set-state-in-effect --
 * Mismo data-sync pattern que el resto de páginas de detalle (cf.
 * app/rdb/inventario/levantamientos/[id]/page.tsx).
 */

/**
 * Detalle completo de una venta DILESA — 5 secciones:
 *   1. Datos del cliente (`erp.personas`, cross-schema).
 *   2. Datos de la venta — ficha + KYC/PLD + notas.
 *   3. Pipeline — 17 fases con docs asociados (cargados vs. faltantes).
 *   4. Pagos — `dilesa.venta_pagos` con sus adjuntos.
 *   5. Expediente digital — `erp.adjuntos` agrupados por rol.
 *
 * Pipeline (sección 3): cada fase declara qué documento(s) de rol son
 * el "soporte" para concluirla (`FASE_ROLES`). El pipeline muestra los
 * cargados como chips clickeables y los faltantes como chips outline
 * gris — esa es la base del proceso de captura que se viene.
 *
 * Lectura pura — captura/edición es entregable posterior.
 */

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Check, Circle, Download, ExternalLink, FileText, Pencil } from 'lucide-react';
import { RequireAccess } from '@/components/require-access';
import { createSupabaseBrowserClient } from '@/lib/supabase-browser';
import { Badge } from '@/components/ui/badge';
import type { BadgeTone } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { getAdjuntoProxyUrl } from '@/lib/adjuntos';
import { getSupabaseErrorMessage } from '@/lib/supabase-error';
import {
  snapshotHold,
  formatearVencimiento,
  type ColaItem,
  type HoldSnapshot,
} from '@/lib/dilesa/hold-cola';

type Venta = {
  id: string;
  persona_id: string;
  unidad_id: string | null;
  vendedor_usuario_id: string | null;
  estado: string;
  expira_at: string | null;
  fase_actual: string | null;
  fase_posicion: number | null;
  tipo_credito: string | null;
  valor_comercial: number | null;
  valor_escrituracion: number | null;
  precio_asignacion: number | null;
  productos_adicionales: number | null;
  monto_credito_titular: number | null;
  monto_credito_cotitular: number | null;
  credito_titular_ref: string | null;
  credito_cotitular_ref: string | null;
  enganche_requerido: number | null;
  descuento_total: number | null;
  comision_vendedor: number | null;
  comision_gerencia: number | null;
  anticipo_comision: number | null;
  monto_avaluo: number | null;
  gastos_escrituracion: number | null;
  numero_escritura: string | null;
  fecha_escritura: string | null;
  vendedor: string | null;
  notario: string | null;
  casa_valuadora: string | null;
  es_pep: boolean | null;
  ocupacion: string | null;
  ine_numero: string | null;
  forma_pago: string | null;
  uso_efectivo: string | null;
  conocimiento_dueno_beneficiario: string | null;
  motivo_desasignacion: string | null;
  notas: string | null;
};

type Persona = {
  nombre: string | null;
  apellido_paterno: string | null;
  apellido_materno: string | null;
  email: string | null;
  telefono: string | null;
  curp: string | null;
  rfc: string | null;
  nss: string | null;
  fecha_nacimiento: string | null;
  nacionalidad: string | null;
  tipo_persona: string | null;
  estado_civil: string | null;
  domicilio: string | null;
};

type UnidadInfo = {
  identificador: string;
  proyecto_id: string | null;
  producto_id: string | null;
};
type DesgloseCalculo = {
  valor_comercial: number;
  metros_excedentes: number;
  valor_excedente_terreno: number;
  valor_frente_verde: number;
  valor_esquina: number;
  pct_esquina_aplicado: number;
  valor_venta_futuro: number;
  costo_credito_adicional: number;
  productos_adicionales: number;
  precio_venta_total: number;
  apoyo_infonavit: number;
  pago_directo: number;
  enganche_1pct: number;
  isai_2pct: number;
  gastos_notariales_6pct: number;
};
type Fase = { id: string; fase: string; posicion: number | null; fecha: string | null };
type Pago = { id: string; fecha: string | null; monto: number; tipo: string | null };
type Adjunto = {
  id: string;
  entidad_tipo: string;
  entidad_id: string;
  rol: string;
  nombre: string;
  url: string;
  tipo_mime: string | null;
};

const ESTADO_TONE: Record<string, BadgeTone> = {
  activa: 'info',
  desasignada: 'neutral',
};
const ESTADO_LABEL: Record<string, string> = {
  activa: 'Activa',
  desasignada: 'Desasignada',
};

const ROL_LABEL: Record<string, string> = {
  factura: 'Factura',
  aprobacion_credito: 'Aprobación de crédito',
  constancia_credito_titular: 'Constancia de crédito (titular)',
  constancia_credito_cotitular: 'Constancia de crédito (co-titular)',
  aviso_pld: 'Aviso PLD',
  avaluo_comercial: 'Avalúo comercial',
  contrato_promesa: 'Contrato promesa de compraventa',
  solicitud_asignacion: 'Solicitud de asignación',
  recibos_caja: 'Recibos de caja',
  expediente_digital: 'Expediente digital',
  ficu: 'FICU',
  aviso_privacidad: 'Aviso de privacidad',
  carta_instruccion_notarial: 'Carta instrucción notarial',
  checklist_entrega: 'Checklist de entrega',
  checklist_pre_entrega: 'Checklist pre-entrega',
  validacion_patronal: 'Validación patronal',
  nota_credito: 'Nota de crédito',
  pagare: 'Pagaré',
  imagen_detonacion: 'Imagen de detonación',
  recibo_caja: 'Recibo de caja',
  comprobante_deposito: 'Comprobante de depósito',
};

const moneyFmt = new Intl.NumberFormat('es-MX', {
  style: 'currency',
  currency: 'MXN',
  maximumFractionDigits: 0,
});

/**
 * Mapping fase → roles de adjuntos esperados. Cada fase del pipeline
 * tiene cero o más documentos asociados que se deben cargar al
 * concluirla. La UI muestra los cargados como chips clickeables y los
 * faltantes como chips outline gris.
 */
const FASE_ROLES: Record<string, string[]> = {
  'Solicitud de Asignación': ['solicitud_asignacion'],
  Asignada: ['expediente_digital', 'ficu', 'aviso_privacidad'],
  Formalizada: ['contrato_promesa'],
  'Solicitud de Avalúo': [],
  'Avalúo Cerrado': ['avaluo_comercial'],
  Inscrita: [],
  'Solicitud de Dictaminación': ['aprobacion_credito'],
  Dictaminada: [
    'carta_instruccion_notarial',
    'constancia_credito_titular',
    'constancia_credito_cotitular',
  ],
  'Validación Patronal': ['validacion_patronal'],
  'Firmas Programadas': [],
  Escriturada: ['pagare'],
  Detonada: ['imagen_detonacion'],
  Facturada: ['factura', 'nota_credito'],
  'Preparada para Entrega': ['checklist_pre_entrega'],
  Entregada: ['checklist_entrega'],
  'Comisión Pagada': [],
  'Operación Terminada': [],
};

/**
 * Slugs de captura disponibles — mapea posición de fase → slug de la
 * page de captura. Se va llenando conforme se implementan las pages
 * del Sprint 7c. Si la fase no está aquí, el botón "Capturar" no
 * aparece (la fase no es capturable aún desde BSOP).
 */
const CAPTURAR_SLUG_BY_POSICION: Record<number, string> = {
  2: '2-asignada',
  3: '3-formalizada',
  // 4–17 → próximos PRs del Sprint 7c
};

/** Las 17 fases canónicas en orden — para mostrar incluso las no alcanzadas. */
const FASES_ORDEN: Array<{ pos: number; nombre: string }> = [
  { pos: 1, nombre: 'Solicitud de Asignación' },
  { pos: 2, nombre: 'Asignada' },
  { pos: 3, nombre: 'Formalizada' },
  { pos: 4, nombre: 'Solicitud de Avalúo' },
  { pos: 5, nombre: 'Avalúo Cerrado' },
  { pos: 6, nombre: 'Inscrita' },
  { pos: 7, nombre: 'Solicitud de Dictaminación' },
  { pos: 8, nombre: 'Dictaminada' },
  { pos: 9, nombre: 'Validación Patronal' },
  { pos: 10, nombre: 'Firmas Programadas' },
  { pos: 11, nombre: 'Escriturada' },
  { pos: 12, nombre: 'Detonada' },
  { pos: 13, nombre: 'Facturada' },
  { pos: 14, nombre: 'Preparada para Entrega' },
  { pos: 15, nombre: 'Entregada' },
  { pos: 16, nombre: 'Comisión Pagada' },
  { pos: 17, nombre: 'Operación Terminada' },
];

function fmtMoney(n: number | null): string | null {
  return n == null ? null : moneyFmt.format(n);
}

function fmtFecha(s: string | null): string | null {
  if (!s) return null;
  const d = new Date(`${s}T00:00:00`);
  if (isNaN(d.getTime())) return s;
  return d.toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' });
}

/**
 * @module Venta detail (DILESA)
 * @responsive desktop-only
 *
 * Gate: sub-slug `dilesa.ventas.lista` post-refactor a hub (sprint
 * tabs-hub). El detalle es parte del dominio de la tab "Ventas" — quien
 * puede ver la lista puede entrar al detalle.
 */
export default function VentaDetailPage() {
  return (
    <RequireAccess empresa="dilesa" modulo="dilesa.ventas.lista">
      <DetailInner />
    </RequireAccess>
  );
}

function DetailInner() {
  const params = useParams<{ id: string }>();
  const id = params.id;

  const [venta, setVenta] = useState<Venta | null>(null);
  const [persona, setPersona] = useState<Persona | null>(null);
  const [unidad, setUnidad] = useState<UnidadInfo | null>(null);
  const [proyectoNombre, setProyectoNombre] = useState<string | null>(null);
  const [prototipoNombre, setPrototipoNombre] = useState<string | null>(null);
  const [fases, setFases] = useState<Fase[]>([]);
  const [pagos, setPagos] = useState<Pago[]>([]);
  const [adjuntos, setAdjuntos] = useState<Adjunto[]>([]);
  const [calculo, setCalculo] = useState<DesgloseCalculo | null>(null);
  const [vendedorNombre, setVendedorNombre] = useState<string | null>(null);
  const [holdSnapshot, setHoldSnapshot] = useState<HoldSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    let activo = true;
    const sb = createSupabaseBrowserClient();
    setLoading(true);
    setError(null);

    (async () => {
      const { data: vRow, error: vErr } = await sb
        .schema('dilesa')
        .from('ventas')
        .select('*')
        .eq('id', id)
        .is('deleted_at', null)
        .maybeSingle();
      if (!activo) return;
      if (vErr) {
        setError(getSupabaseErrorMessage(vErr, 'No se pudo cargar la venta.'));
        setLoading(false);
        return;
      }
      if (!vRow) {
        setError('Venta no encontrada.');
        setLoading(false);
        return;
      }
      const ventaRow = vRow as unknown as Venta;
      setVenta(ventaRow);

      const [pRes, fRes, pagosRes, uRes] = await Promise.all([
        sb
          .schema('erp')
          .from('personas')
          .select(
            'nombre, apellido_paterno, apellido_materno, email, telefono, curp, rfc, nss, fecha_nacimiento, nacionalidad, tipo_persona, estado_civil, domicilio'
          )
          .eq('id', ventaRow.persona_id)
          .maybeSingle(),
        sb
          .schema('dilesa')
          .from('venta_fases')
          .select('id, fase, posicion, fecha')
          .eq('venta_id', ventaRow.id)
          .is('deleted_at', null)
          .order('posicion', { ascending: true }),
        sb
          .schema('dilesa')
          .from('venta_pagos')
          .select('id, fecha, monto, tipo')
          .eq('venta_id', ventaRow.id)
          .is('deleted_at', null)
          .order('fecha', { ascending: true }),
        ventaRow.unidad_id
          ? sb
              .schema('dilesa')
              .from('unidades')
              .select('identificador, proyecto_id, producto_id')
              .eq('id', ventaRow.unidad_id)
              .maybeSingle()
          : Promise.resolve({ data: null, error: null }),
      ]);
      if (!activo) return;

      const firstErr = pRes.error ?? fRes.error ?? pagosRes.error ?? uRes.error;
      if (firstErr) {
        setError(getSupabaseErrorMessage(firstErr, 'No se pudo cargar el detalle de la venta.'));
        setLoading(false);
        return;
      }

      setPersona((pRes.data as unknown as Persona) ?? null);
      setFases((fRes.data ?? []) as Fase[]);
      setPagos((pagosRes.data ?? []) as Pago[]);
      const uData = uRes.data as UnidadInfo | null;
      setUnidad(uData);

      const [prjRes, prodRes] = await Promise.all([
        uData?.proyecto_id
          ? sb
              .schema('dilesa')
              .from('proyectos')
              .select('nombre')
              .eq('id', uData.proyecto_id)
              .maybeSingle()
          : Promise.resolve({ data: null, error: null }),
        uData?.producto_id
          ? sb
              .schema('dilesa')
              .from('productos')
              .select('nombre')
              .eq('id', uData.producto_id)
              .maybeSingle()
          : Promise.resolve({ data: null, error: null }),
      ]);
      if (!activo) return;
      setProyectoNombre((prjRes.data?.nombre as string | null) ?? null);
      setPrototipoNombre((prodRes.data?.nombre as string | null) ?? null);

      const pagoIds = ((pagosRes.data ?? []) as Pago[]).map((p) => p.id);
      const allIds = [ventaRow.id, ...pagoIds];
      const { data: adjRows, error: adjErr } = await sb
        .schema('erp')
        .from('adjuntos')
        .select('id, entidad_tipo, entidad_id, rol, nombre, url, tipo_mime')
        .in('entidad_tipo', ['venta', 'venta_pago'])
        .in('entidad_id', allIds);
      if (!activo) return;
      if (adjErr) {
        setError(getSupabaseErrorMessage(adjErr, 'No se pudieron cargar los adjuntos.'));
        setLoading(false);
        return;
      }
      setAdjuntos((adjRows ?? []) as Adjunto[]);

      // Vendedor (asesor de ventas) — lookup core.usuarios para mostrar
      // nombre completo, mismo patrón que el endpoint PDF. El campo
      // legacy `venta.vendedor` (text) puede estar vacío en ventas nuevas.
      if (ventaRow.vendedor_usuario_id) {
        const { data: u } = await sb
          .schema('core')
          .from('usuarios')
          .select('first_name, last_name, email')
          .eq('id', ventaRow.vendedor_usuario_id)
          .maybeSingle();
        if (activo) {
          const completo = [u?.first_name, u?.last_name].filter(Boolean).join(' ').trim();
          setVendedorNombre(completo || u?.email || ventaRow.vendedor || null);
        }
      } else if (activo) {
        setVendedorNombre(ventaRow.vendedor || null);
      }

      // Snapshot del hold/cola para banners de la página. Solo aplica a
      // ventas creadas en BSOP (no históricas Coda) y Fase 1.
      if (ventaRow.unidad_id) {
        const { data: colaRows } = await sb
          .schema('dilesa')
          .from('v_unidad_hold_queue')
          .select('venta_id, posicion, created_at, expira_at')
          .eq('unidad_id', ventaRow.unidad_id)
          .order('posicion', { ascending: true });
        if (activo) {
          const cola = (colaRows ?? []) as ColaItem[];
          setHoldSnapshot(
            snapshotHold({
              ventaId: ventaRow.id,
              estado: ventaRow.estado,
              expiraAt: ventaRow.expira_at ? new Date(ventaRow.expira_at) : null,
              cola,
            })
          );
        }
      } else if (activo) {
        setHoldSnapshot(null);
      }

      // Desglose del cálculo — se recalcula con los datos snapshot de la venta
      // para mostrar TODOS los componentes (excedente, frente verde, esquina,
      // productos adicionales, ISAI, gastos notariales). No persistimos cada
      // componente en `dilesa.ventas`; la RPC los recompone en runtime.
      if (ventaRow.unidad_id) {
        const { data: calcRow } = await sb.schema('dilesa').rpc('fn_calcular_precio_venta', {
          p_unidad_id: ventaRow.unidad_id,
          p_monto_credito_titular: Number(ventaRow.monto_credito_titular ?? 0),
          p_monto_credito_cotitular: Number(ventaRow.monto_credito_cotitular ?? 0),
          p_productos_adicionales: Number(ventaRow.productos_adicionales ?? 0),
        });
        if (activo && calcRow && typeof calcRow === 'object' && !('error' in calcRow)) {
          setCalculo(calcRow as unknown as DesgloseCalculo);
        }
      }

      setLoading(false);
    })();

    return () => {
      activo = false;
    };
  }, [id]);

  const clienteNombre = useMemo(() => {
    if (!persona) return '';
    return (
      [persona.nombre, persona.apellido_paterno, persona.apellido_materno]
        .filter(Boolean)
        .join(' ') || '(sin nombre)'
    );
  }, [persona]);

  const adjuntosVenta = useMemo(
    () => adjuntos.filter((a) => a.entidad_tipo === 'venta'),
    [adjuntos]
  );
  // Mapa rol → adjuntos cargados. Sirve para el pipeline (docs por fase)
  // y para el expediente (lista completa agrupada por rol).
  const adjuntosPorRolMap = useMemo(() => {
    const m = new Map<string, Adjunto[]>();
    for (const a of adjuntosVenta) {
      const arr = m.get(a.rol) ?? [];
      arr.push(a);
      m.set(a.rol, arr);
    }
    return m;
  }, [adjuntosVenta]);
  const adjuntosPorRol = useMemo(
    () =>
      [...adjuntosPorRolMap.entries()].sort((a, b) =>
        (ROL_LABEL[a[0]] ?? a[0]).localeCompare(ROL_LABEL[b[0]] ?? b[0])
      ),
    [adjuntosPorRolMap]
  );

  // Pipeline combinado: una fila por cada una de las 17 fases, con su
  // fecha (si alcanzada), docs cargados (clickeables) y docs faltantes
  // (chip outline gris). Es el "lugar donde se avanza fase por fase
  // subiendo el soporte" — la vista que se va a evolucionar.
  const pipelineRows = useMemo(() => {
    const fasesByName = new Map(fases.map((f) => [f.fase, f]));
    const posicionesAlcanzadas = new Set(fases.map((f) => f.posicion));
    return FASES_ORDEN.map(({ pos, nombre }) => {
      const f = fasesByName.get(nombre);
      const roles = FASE_ROLES[nombre] ?? [];
      const cargados = roles.flatMap((r) =>
        (adjuntosPorRolMap.get(r) ?? []).map((a) => ({ ...a, rol: r }))
      );
      const rolesCargados = new Set(cargados.map((a) => a.rol));
      const faltantes = roles.filter((r) => !rolesCargados.has(r));
      const slugCaptura = CAPTURAR_SLUG_BY_POSICION[pos];
      const previaCerrada = pos === 1 || posicionesAlcanzadas.has(pos - 1);
      const alcanzada = !!f?.fecha;
      const puedeCapturar = !!slugCaptura && !alcanzada && previaCerrada;
      return {
        pos,
        nombre,
        fecha: f?.fecha ?? null,
        alcanzada,
        cargados,
        faltantes,
        slugCaptura,
        puedeCapturar,
        previaCerrada,
      };
    });
  }, [fases, adjuntosPorRolMap]);

  const pipelineAlcanzadas = useMemo(
    () => pipelineRows.filter((r) => r.alcanzada).length,
    [pipelineRows]
  );

  const adjuntosPorPago = useMemo(() => {
    const m = new Map<string, Adjunto[]>();
    for (const a of adjuntos.filter((x) => x.entidad_tipo === 'venta_pago')) {
      const arr = m.get(a.entidad_id) ?? [];
      arr.push(a);
      m.set(a.entidad_id, arr);
    }
    return m;
  }, [adjuntos]);

  const totalPagos = useMemo(() => pagos.reduce((s, p) => s + (p.monto ?? 0), 0), [pagos]);

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

  if (error || !venta) {
    return (
      <div className="container mx-auto max-w-6xl space-y-4 px-4 py-6">
        <BackLink />
        <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
          {error ?? 'Venta no encontrada.'}
        </div>
      </div>
    );
  }

  const fichaVenta: { label: string; value: string }[] = (
    [
      ['Proyecto', proyectoNombre],
      ['Unidad', unidad?.identificador ?? null],
      ['Prototipo', prototipoNombre],
      ['Tipo de crédito', venta.tipo_credito],
      ['Asesor de ventas', vendedorNombre ?? venta.vendedor],
      ['Notario', venta.notario],
      ['Casa valuadora', venta.casa_valuadora],
      ['Precio de asignación', fmtMoney(venta.precio_asignacion)],
      ['Valor comercial', fmtMoney(venta.valor_comercial)],
      ['Valor de escrituración', fmtMoney(venta.valor_escrituracion)],
      ['Enganche requerido', fmtMoney(venta.enganche_requerido)],
      ['Productos adicionales', fmtMoney(venta.productos_adicionales)],
      ['Descuento total', fmtMoney(venta.descuento_total)],
      ['Crédito titular', fmtMoney(venta.monto_credito_titular)],
      ['Crédito co-titular', fmtMoney(venta.monto_credito_cotitular)],
      ['Ref. crédito titular', venta.credito_titular_ref],
      ['Ref. crédito co-titular', venta.credito_cotitular_ref],
      ['Comisión vendedor', fmtMoney(venta.comision_vendedor)],
      ['Comisión gerencia', fmtMoney(venta.comision_gerencia)],
      ['Anticipo comisión', fmtMoney(venta.anticipo_comision)],
      ['Monto avalúo', fmtMoney(venta.monto_avaluo)],
      ['Gastos escrituración', fmtMoney(venta.gastos_escrituracion)],
      ['# Escritura', venta.numero_escritura],
      ['Fecha de escritura', fmtFecha(venta.fecha_escritura)],
    ] as [string, string | null][]
  )
    .filter((r): r is [string, string] => r[1] != null && r[1] !== '')
    .map(([label, value]) => ({ label, value }));

  const fichaPersona: { label: string; value: string }[] = persona
    ? (
        [
          ['CURP', persona.curp],
          ['RFC', persona.rfc],
          ['NSS', persona.nss],
          ['Tel.', persona.telefono],
          ['Email', persona.email],
          ['Fecha de nacimiento', fmtFecha(persona.fecha_nacimiento)],
          ['Nacionalidad', persona.nacionalidad],
          ['Estado civil', persona.estado_civil],
          ['Tipo persona', persona.tipo_persona],
          ['Domicilio', persona.domicilio],
        ] as [string, string | null][]
      )
        .filter((r): r is [string, string] => r[1] != null && r[1] !== '')
        .map(([label, value]) => ({ label, value }))
    : [];

  const kyc: { label: string; value: string }[] = (
    [
      ['PEP', venta.es_pep == null ? null : venta.es_pep ? 'Sí' : 'No'],
      ['Ocupación', venta.ocupacion],
      ['INE', venta.ine_numero],
      ['Forma de pago', venta.forma_pago],
      ['Uso de efectivo', venta.uso_efectivo],
      ['Dueño beneficiario', venta.conocimiento_dueno_beneficiario],
    ] as [string, string | null][]
  )
    .filter((r): r is [string, string] => r[1] != null && r[1] !== '')
    .map(([label, value]) => ({ label, value }));

  return (
    <div className="container mx-auto max-w-6xl space-y-6 px-4 py-6">
      <BackLink />

      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-[var(--text)]">
            {clienteNombre || '(sin nombre)'}
          </h1>
          {proyectoNombre && unidad?.identificador ? (
            <p className="mt-1 text-sm text-[var(--text)]/60">
              {proyectoNombre} · {unidad.identificador}
            </p>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {venta.fase_actual ? (
            <Badge tone="neutral">
              {venta.fase_posicion ? `${venta.fase_posicion}. ` : ''}
              {venta.fase_actual}
            </Badge>
          ) : null}
          <Badge tone={ESTADO_TONE[venta.estado] ?? 'neutral'}>
            {ESTADO_LABEL[venta.estado] ?? venta.estado}
          </Badge>
          {venta.tipo_credito ? <Badge tone="neutral">{venta.tipo_credito}</Badge> : null}
        </div>
      </header>

      {holdSnapshot && holdSnapshot.estado !== 'no_aplica' ? (
        <HoldBanner snapshot={holdSnapshot} />
      ) : null}

      <div className="flex flex-wrap gap-2">
        <PdfDownloadLink
          ventaId={venta.id}
          tipo="solicitud-asignacion"
          label="Solicitud de Asignación"
        />
        <PdfDownloadLink ventaId={venta.id} tipo="aviso-privacidad" label="Aviso de Privacidad" />
        <PdfDownloadLink ventaId={venta.id} tipo="ficu" label="FICU" />
        <PdfDownloadLink
          ventaId={venta.id}
          tipo="promesa-compraventa"
          label="Promesa de Compraventa"
        />
      </div>

      <Section title="Datos del cliente">
        {fichaPersona.length === 0 ? (
          <p className="text-sm text-[var(--text)]/60">Sin datos del cliente.</p>
        ) : (
          <FichaGrid rows={fichaPersona} cols={3} />
        )}
      </Section>

      <Section title="Datos de la venta">
        {fichaVenta.length === 0 ? (
          <p className="text-sm text-[var(--text)]/60">—</p>
        ) : (
          <FichaGrid rows={fichaVenta} cols={3} />
        )}
        {calculo ? (
          <div className="mt-5 border-t border-[var(--border)] pt-5">
            <h3 className="mb-3 text-xs font-medium uppercase tracking-wide text-[var(--text)]/50">
              Desglose del cálculo
            </h3>
            <FichaGrid
              rows={[
                { label: 'Valor comercial', value: fmtMoney(calculo.valor_comercial) ?? '—' },
                {
                  label: `Excedente terreno (${calculo.metros_excedentes.toFixed(1)} m²)`,
                  value: fmtMoney(calculo.valor_excedente_terreno) ?? '—',
                },
                { label: 'Frente verde', value: fmtMoney(calculo.valor_frente_verde) ?? '—' },
                {
                  label: `Esquina (${(calculo.pct_esquina_aplicado * 100).toFixed(1)}%)`,
                  value: fmtMoney(calculo.valor_esquina) ?? '—',
                },
                { label: 'Venta futuro', value: fmtMoney(calculo.valor_venta_futuro) ?? '—' },
                {
                  label: 'Costo crédito adicional',
                  value: fmtMoney(calculo.costo_credito_adicional) ?? '—',
                },
                {
                  label: 'Productos adicionales',
                  value: fmtMoney(calculo.productos_adicionales) ?? '—',
                },
                {
                  label: 'Precio de venta total',
                  value: fmtMoney(calculo.precio_venta_total) ?? '—',
                },
                { label: 'Apoyo Infonavit', value: fmtMoney(calculo.apoyo_infonavit) ?? '—' },
                { label: 'Pago directo cliente', value: fmtMoney(calculo.pago_directo) ?? '—' },
                { label: 'Enganche 1%', value: fmtMoney(calculo.enganche_1pct) ?? '—' },
                { label: 'ISAI 2%', value: fmtMoney(calculo.isai_2pct) ?? '—' },
                {
                  label: 'Gastos notariales 6%',
                  value: fmtMoney(calculo.gastos_notariales_6pct) ?? '—',
                },
              ]}
              cols={3}
            />
          </div>
        ) : null}
        {venta.motivo_desasignacion ? (
          <div className="mt-4 border-t border-[var(--border)] pt-4">
            <div className="text-xs font-medium uppercase tracking-wide text-[var(--text)]/50">
              Motivo de desasignación
            </div>
            <p className="mt-0.5 text-sm text-[var(--text)]/80">{venta.motivo_desasignacion}</p>
          </div>
        ) : null}
        {kyc.length > 0 ? (
          <div className="mt-6 border-t border-[var(--border)] pt-4">
            <div className="mb-2 text-xs font-medium uppercase tracking-wide text-[var(--text)]/50">
              KYC / PLD
            </div>
            <FichaGrid rows={kyc} cols={3} />
          </div>
        ) : null}
        {venta.notas ? (
          <div className="mt-4 border-t border-[var(--border)] pt-4">
            <div className="text-xs font-medium uppercase tracking-wide text-[var(--text)]/50">
              Notas
            </div>
            <p className="mt-0.5 whitespace-pre-wrap text-sm text-[var(--text)]/80">
              {venta.notas}
            </p>
          </div>
        ) : null}
      </Section>

      <Section title="Pipeline" description={`${pipelineAlcanzadas} de 17 fases alcanzadas`}>
        <ol className="space-y-1">
          {pipelineRows.map((r) => (
            <li
              key={r.pos}
              className={
                'flex items-start gap-3 rounded-md px-2 py-1.5 ' +
                (r.alcanzada ? 'bg-[var(--bg)]/40' : 'opacity-60')
              }
            >
              {/* Status circle + posición */}
              <div className="flex w-8 shrink-0 items-center gap-1.5 pt-0.5">
                {r.alcanzada ? (
                  <Check className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                ) : (
                  <Circle className="h-3.5 w-3.5 text-[var(--text)]/30" />
                )}
                <span className="font-mono text-[10px] tabular-nums text-[var(--text)]/40">
                  {r.pos}
                </span>
              </div>

              {/* Nombre + fecha */}
              <div className="min-w-[200px] shrink-0">
                <div className="text-sm font-medium text-[var(--text)]">{r.nombre}</div>
                <div className="text-[11px] text-[var(--text)]/50">
                  {r.fecha ? fmtFecha(r.fecha) : '—'}
                </div>
              </div>

              {/* Docs cargados + faltantes */}
              <div className="flex flex-1 flex-wrap items-center gap-1">
                {r.cargados.map((a) => (
                  <AdjuntoLink key={a.id} a={a} compact />
                ))}
                {r.faltantes.map((rol) => (
                  <span
                    key={rol}
                    className="inline-flex items-center gap-1 rounded border border-dashed border-[var(--border)] px-1.5 py-0.5 text-[10px] text-[var(--text)]/40"
                    title={`Falta cargar: ${ROL_LABEL[rol] ?? rol}`}
                  >
                    <FileText className="h-2.5 w-2.5" />
                    {ROL_LABEL[rol] ?? rol}
                  </span>
                ))}
                {r.cargados.length === 0 && r.faltantes.length === 0 ? (
                  <span className="text-[10px] text-[var(--text)]/30">—</span>
                ) : null}
              </div>

              {/* Capturar fase — solo si la página está implementada y aplica */}
              {r.slugCaptura ? (
                <div className="shrink-0">
                  {r.puedeCapturar ? (
                    <Link
                      href={`/dilesa/ventas/${id}/capturar/${r.slugCaptura}`}
                      className="inline-flex items-center gap-1 rounded-md border border-[var(--accent)] bg-[var(--accent)]/10 px-2 py-0.5 text-[10px] font-medium text-[var(--accent)] hover:bg-[var(--accent)]/20"
                    >
                      <Pencil className="h-2.5 w-2.5" />
                      Capturar fase
                    </Link>
                  ) : r.alcanzada ? null : (
                    <span
                      className="inline-flex cursor-not-allowed items-center gap-1 rounded-md border border-[var(--border)] px-2 py-0.5 text-[10px] text-[var(--text)]/30"
                      title={`Falta cerrar la fase ${r.pos - 1} primero.`}
                    >
                      <Pencil className="h-2.5 w-2.5" />
                      Capturar
                    </span>
                  )}
                </div>
              ) : null}
            </li>
          ))}
        </ol>
      </Section>

      <Section
        title="Pagos"
        description={
          pagos.length === 0 ? 'sin pagos' : `${pagos.length} · ${moneyFmt.format(totalPagos)}`
        }
      >
        {pagos.length === 0 ? (
          <p className="text-sm text-[var(--text)]/60">No hay depósitos registrados.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--border)] text-left text-xs uppercase tracking-wide text-[var(--text)]/50">
                <th className="py-1 pr-2 font-medium">Fecha</th>
                <th className="py-1 pr-2 font-medium">Tipo</th>
                <th className="py-1 text-right font-medium">Monto</th>
                <th className="py-1 pl-2 font-medium">Adjuntos</th>
              </tr>
            </thead>
            <tbody>
              {pagos.map((p) => {
                const ads = adjuntosPorPago.get(p.id) ?? [];
                return (
                  <tr key={p.id} className="border-b border-[var(--border)]/40">
                    <td className="py-1.5 pr-2">{fmtFecha(p.fecha) ?? '—'}</td>
                    <td className="py-1.5 pr-2 text-[var(--text)]/70">{p.tipo ?? '—'}</td>
                    <td className="py-1.5 text-right tabular-nums">{moneyFmt.format(p.monto)}</td>
                    <td className="py-1.5 pl-2">
                      <div className="flex flex-wrap gap-1">
                        {ads.map((a) => (
                          <AdjuntoLink key={a.id} a={a} compact />
                        ))}
                        {ads.length === 0 ? <span className="text-[var(--text)]/30">—</span> : null}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Section>

      <Section
        title="Expediente digital"
        description={
          adjuntosVenta.length === 0 ? 'sin documentos' : `${adjuntosVenta.length} documentos`
        }
      >
        {adjuntosPorRol.length === 0 ? (
          <p className="text-sm text-[var(--text)]/60">
            Sin documentos en el expediente para esta venta.
          </p>
        ) : (
          <div className="space-y-4">
            {adjuntosPorRol.map(([rol, ads]) => (
              <div key={rol}>
                <div className="mb-1.5 text-xs font-medium uppercase tracking-wide text-[var(--text)]/50">
                  {ROL_LABEL[rol] ?? rol}
                </div>
                <ul className="flex flex-wrap gap-2">
                  {ads.map((a) => (
                    <li key={a.id}>
                      <AdjuntoLink a={a} />
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </Section>
    </div>
  );
}

function BackLink() {
  return (
    <Link
      href="/dilesa/ventas"
      className="inline-flex items-center gap-1.5 text-sm text-[var(--text)]/60 hover:text-[var(--text)]"
    >
      <ArrowLeft className="size-4" /> Volver a ventas
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

function HoldBanner({ snapshot }: { snapshot: HoldSnapshot }) {
  let tone: 'success' | 'warning' | 'danger' = 'success';
  let title = '';
  let body = '';
  switch (snapshot.estado) {
    case 'lider_ok': {
      tone = 'success';
      title = 'Líder de la fila — hold activo';
      body = snapshot.expira_at
        ? `Vence ${formatearVencimiento(snapshot.expira_at)}. Completá el expediente antes para que Dirección autorice la asignación.`
        : 'Completá el expediente para que Dirección autorice la asignación.';
      if (snapshot.esperando > 0)
        body += ` Hay ${snapshot.esperando} en fila esperando esta unidad.`;
      break;
    }
    case 'lider_warning': {
      tone = 'warning';
      title = '⚠️ Hold expira pronto';
      body = snapshot.expira_at
        ? `${formatearVencimiento(snapshot.expira_at, { mostrarRestante: true })}. Si no completás el expediente, el siguiente en la fila toma el lugar.`
        : 'El hold expira en menos de 4 horas.';
      break;
    }
    case 'lider_expirado': {
      tone = 'danger';
      title = 'Hold expirado';
      body =
        'El plazo de 2 días hábiles pasó. El sistema marcará la venta como expirada y promoverá al siguiente en la fila en la próxima vuelta del cron.';
      break;
    }
    case 'en_cola': {
      tone = 'warning';
      title = `En fila — posición #${snapshot.posicion}`;
      body = snapshot.expira_at
        ? `Esperando que el líder complete o expire ${formatearVencimiento(snapshot.expira_at)}.`
        : 'Esperando que el líder complete o expire su hold.';
      break;
    }
    case 'expirada': {
      tone = 'danger';
      title = 'Hold perdido';
      body =
        'Esta solicitud perdió el hold por no completar expediente en 2 días hábiles. Si el cliente sigue interesado, podés recrear la solicitud y entrar al final de la fila.';
      break;
    }
    case 'no_aplica':
      return null;
  }

  const cls =
    tone === 'success'
      ? 'border-emerald-500/30 bg-emerald-500/5 text-emerald-900 dark:text-emerald-100'
      : tone === 'warning'
        ? 'border-amber-500/30 bg-amber-500/5 text-amber-900 dark:text-amber-100'
        : 'border-red-500/30 bg-red-500/5 text-red-900 dark:text-red-100';

  return (
    <div className={`rounded-lg border px-4 py-3 text-sm ${cls}`}>
      <p className="font-semibold">{title}</p>
      <p className="mt-1 text-sm opacity-90">{body}</p>
    </div>
  );
}

function PdfDownloadLink({
  ventaId,
  tipo,
  label,
}: {
  ventaId: string;
  tipo: 'solicitud-asignacion' | 'aviso-privacidad' | 'ficu' | 'promesa-compraventa';
  label: string;
}) {
  return (
    <a
      href={`/api/dilesa/ventas/${ventaId}/pdf/${tipo}`}
      className="inline-flex items-center gap-1.5 rounded-md border border-[var(--border)] bg-[var(--card)] px-3 py-1.5 text-xs font-medium text-[var(--text)]/80 hover:bg-[var(--bg)]/40 hover:text-[var(--text)]"
    >
      <Download className="h-3.5 w-3.5" />
      {label}
    </a>
  );
}

function AdjuntoLink({ a, compact = false }: { a: Adjunto; compact?: boolean }) {
  const href = getAdjuntoProxyUrl(a.url);
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={
        compact
          ? 'inline-flex items-center gap-1 rounded border border-[var(--border)] px-1.5 py-0.5 text-[10px] text-[var(--text)]/70 hover:text-[var(--text)]'
          : 'inline-flex items-center gap-1.5 rounded-md border border-[var(--border)] bg-[var(--card)] px-2.5 py-1 text-xs text-[var(--text)]/80 hover:text-[var(--text)]'
      }
      title={a.nombre}
    >
      <FileText className={compact ? 'h-3 w-3' : 'h-3.5 w-3.5'} />
      <span className="max-w-[220px] truncate">{a.nombre}</span>
      <ExternalLink className={compact ? 'h-2.5 w-2.5' : 'h-3 w-3'} />
    </a>
  );
}
