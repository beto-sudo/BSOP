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
 *   4. Estado de cuenta — CxC: cargos (`erp.cxc_cargos`) + abonos
 *      (`erp.cxc_pagos`) + saldo/saldo a favor. Iniciativa `cxc`.
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
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  Check,
  Circle,
  Download,
  ExternalLink,
  FileText,
  Pencil,
  Plus,
  Printer,
} from 'lucide-react';
import { RequireAccess } from '@/components/require-access';
import { createSupabaseBrowserClient } from '@/lib/supabase-browser';
import { Badge } from '@/components/ui/badge';
import type { BadgeTone } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { getAdjuntoProxyUrl } from '@/lib/adjuntos';
import { getSupabaseErrorMessage } from '@/lib/supabase-error';
import { useToast } from '@/components/ui/toast';
import { AbonoCaptureDrawer } from '@/components/dilesa/abono-capture-drawer';
import { EstadoCuentaPrintable } from '@/components/dilesa/estado-cuenta-printable';
import { ReciboCajaPrintable } from '@/components/dilesa/recibo-caja-printable';
import { useTriggerPrint } from '@/components/print';
import { DetailDrawer, DetailDrawerContent } from '@/components/detail-page';
import {
  snapshotHold,
  formatearVencimiento,
  type ColaItem,
  type HoldSnapshot,
} from '@/lib/dilesa/hold-cola';
import { usePermissions } from '@/components/providers';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { regresarAFase, desasignarVenta } from './actions';

type Venta = {
  id: string;
  empresa_id: string;
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
  monto_credito_directo: number | null;
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
  valuador_id: string | null;
  notario_id: string | null;
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
type Cargo = {
  id: string;
  tipo_cargo: string;
  numero: number;
  concepto: string | null;
  monto: number;
  monto_pagado: number;
  saldo: number;
  fecha_vencimiento: string | null;
  estado: string;
  fuente_esperada: string;
};
type Abono = {
  id: string;
  fecha: string | null;
  monto_total: number;
  fuente: string;
  forma_pago: string | null;
  referencia: string | null;
  notas: string | null;
};
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
  Asignada: ['solicitud_asignacion', 'expediente_digital', 'ficu', 'aviso_privacidad'],
  Formalizada: ['contrato_promesa'],
  'Solicitud de Avalúo': [],
  'Avalúo Cerrado': ['avaluo_comercial'],
  // Beto: las Constancias de Crédito (titular + co-titular) van en Inscrita
  // (el banco las entrega al inscribir el crédito). La Carta de instrucción
  // notarial queda en Dictaminada (sale después con el dictamen jurídico).
  Inscrita: ['constancia_credito_titular', 'constancia_credito_cotitular'],
  'Solicitud de Dictaminación': ['aprobacion_credito'],
  Dictaminada: ['carta_instruccion_notarial'],
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
  4: '4-solicitud-avaluo',
  5: '5-avaluo-cerrado',
  6: '6-inscrita',
  7: '7-solicitud-dictamen',
  8: '8-dictaminada',
  9: '9-validacion-patronal',
  10: '10-firmas-programadas',
  // 11–17 → próximos PRs del Sprint 7c
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
  const [cargos, setCargos] = useState<Cargo[]>([]);
  const [abonos, setAbonos] = useState<Abono[]>([]);
  const [aplicadoPorAbono, setAplicadoPorAbono] = useState<Map<string, number>>(new Map());
  const [comprobantesPorAbono, setComprobantesPorAbono] = useState<Map<string, Adjunto[]>>(
    new Map()
  );
  const [adjuntos, setAdjuntos] = useState<Adjunto[]>([]);
  const [calculo, setCalculo] = useState<DesgloseCalculo | null>(null);
  const [vendedorNombre, setVendedorNombre] = useState<string | null>(null);
  const [holdSnapshot, setHoldSnapshot] = useState<HoldSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [abonoOpen, setAbonoOpen] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [estadoCuentaOpen, setEstadoCuentaOpen] = useState(false);
  const [reciboAbono, setReciboAbono] = useState<Abono | null>(null);
  const toast = useToast();
  const triggerPrint = useTriggerPrint();

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

      const [pRes, fRes, cargosRes, abonosRes, uRes] = await Promise.all([
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
          .schema('erp')
          .from('cxc_cargos')
          .select(
            'id, tipo_cargo, numero, concepto, monto, monto_pagado, saldo, fecha_vencimiento, estado, fuente_esperada'
          )
          .eq('origen_tipo', 'venta_dilesa')
          .eq('origen_id', ventaRow.id)
          .is('deleted_at', null)
          .order('fecha_vencimiento', { ascending: true, nullsFirst: false })
          .order('numero', { ascending: true }),
        sb
          .schema('erp')
          .from('cxc_pagos')
          .select('id, fecha, monto_total, fuente, forma_pago, referencia, notas')
          .eq('origen_tipo', 'venta_dilesa')
          .eq('origen_id', ventaRow.id)
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

      const firstErr = pRes.error ?? fRes.error ?? cargosRes.error ?? abonosRes.error ?? uRes.error;
      if (firstErr) {
        setError(getSupabaseErrorMessage(firstErr, 'No se pudo cargar el detalle de la venta.'));
        setLoading(false);
        return;
      }

      setPersona((pRes.data as unknown as Persona) ?? null);
      setFases((fRes.data ?? []) as Fase[]);
      const cargosData = (cargosRes.data ?? []) as Cargo[];
      const abonosData = (abonosRes.data ?? []) as Abono[];
      setCargos(cargosData);
      setAbonos(abonosData);

      // Aplicaciones para derivar el saldo a favor por abono.
      const abonoIds = abonosData.map((a) => a.id);
      if (abonoIds.length > 0) {
        const { data: aplData } = await sb
          .schema('erp')
          .from('cxc_pago_aplicaciones')
          .select('pago_id, monto_aplicado')
          .in('pago_id', abonoIds);
        if (activo) {
          const m = new Map<string, number>();
          for (const ap of (aplData ?? []) as { pago_id: string; monto_aplicado: number }[]) {
            m.set(ap.pago_id, (m.get(ap.pago_id) ?? 0) + Number(ap.monto_aplicado));
          }
          setAplicadoPorAbono(m);
        }

        const { data: adjAbonos } = await sb
          .schema('erp')
          .from('adjuntos')
          .select('id, entidad_tipo, entidad_id, rol, nombre, url, tipo_mime')
          .eq('entidad_tipo', 'cxc_pago')
          .in('entidad_id', abonoIds);
        if (activo) {
          const am = new Map<string, Adjunto[]>();
          for (const a of (adjAbonos ?? []) as Adjunto[]) {
            const arr = am.get(a.entidad_id) ?? [];
            arr.push(a);
            am.set(a.entidad_id, arr);
          }
          setComprobantesPorAbono(am);
        }
      }

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

      const { data: adjRows, error: adjErr } = await sb
        .schema('erp')
        .from('adjuntos')
        .select('id, entidad_tipo, entidad_id, rol, nombre, url, tipo_mime')
        .eq('entidad_tipo', 'venta')
        .eq('entidad_id', ventaRow.id);
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
  }, [id, refreshKey]);

  const handleGenerarPlan = async () => {
    const sb = createSupabaseBrowserClient();
    const { error: rpcErr } = await sb
      .schema('dilesa')
      .rpc('fn_generar_plan_pagos', { p_venta_id: id });
    if (rpcErr) {
      toast.add({
        title: 'No se pudo generar el plan',
        description: getSupabaseErrorMessage(rpcErr, 'Error en el RPC.'),
        type: 'error',
      });
      return;
    }
    toast.add({ title: 'Plan de pagos generado', type: 'success' });
    setRefreshKey((k) => k + 1);
  };

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
      // Si la venta ya está desasignada, el pipeline queda como histórico
      // — el operador no puede avanzar fases. La unidad está liberada.
      const desasignada = venta?.estado === 'desasignada';
      const puedeCapturar = !!slugCaptura && !alcanzada && previaCerrada && !desasignada;
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
  }, [fases, adjuntosPorRolMap, venta?.estado]);

  const pipelineAlcanzadas = useMemo(
    () => pipelineRows.filter((r) => r.alcanzada).length,
    [pipelineRows]
  );

  const totalACobrar = useMemo(() => cargos.reduce((s, c) => s + c.monto, 0), [cargos]);
  const totalCobrado = useMemo(() => cargos.reduce((s, c) => s + c.monto_pagado, 0), [cargos]);
  const saldoPendiente = useMemo(() => cargos.reduce((s, c) => s + c.saldo, 0), [cargos]);
  const saldoFavor = useMemo(
    () =>
      abonos.reduce(
        (s, a) => s + Math.max(0, a.monto_total - (aplicadoPorAbono.get(a.id) ?? 0)),
        0
      ),
    [abonos, aplicadoPorAbono]
  );

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
            <p
              className={`mt-1 text-sm ${
                venta.estado === 'desasignada'
                  ? 'text-[var(--text)]/35 line-through decoration-[var(--text)]/35'
                  : 'text-[var(--text)]/60'
              }`}
              title={
                venta.estado === 'desasignada'
                  ? 'Unidad liberada — la venta fue desasignada'
                  : undefined
              }
            >
              {proyectoNombre} · {unidad.identificador}
              {venta.estado === 'desasignada' ? (
                <span className="ml-2 text-xs not-italic no-underline">(liberada)</span>
              ) : null}
            </p>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {/* Si la venta está desasignada, NO mostramos el badge de fase —
              evita el efecto contradictorio "2. Asignada · Desasignada". */}
          {venta.fase_actual && venta.estado !== 'desasignada' ? (
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
        {venta.valuador_id ? (
          <PdfDownloadLink ventaId={venta.id} tipo="solicitud-avaluo" label="Solicitud de Avalúo" />
        ) : null}
        {venta.notario_id ? (
          <PdfDownloadLink
            ventaId={venta.id}
            tipo="solicitud-dictamen"
            label="Solicitud de Dictaminación"
          />
        ) : null}
        {venta.unidad_id ? (
          <PdfDownloadLink ventaId={venta.id} tipo="poliza-garantia" label="Póliza de Garantía" />
        ) : null}
        {venta.monto_credito_directo != null && Number(venta.monto_credito_directo) > 0 ? (
          <PdfDownloadLink
            ventaId={venta.id}
            tipo="pagare-credito-directo"
            label="Pagaré (crédito directo)"
          />
        ) : null}
      </div>

      <MovimientosAdministrativos
        ventaId={venta.id}
        estado={venta.estado}
        fasePosicion={venta.fase_posicion}
        personaId={venta.persona_id}
      />

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
        title="Estado de cuenta"
        description={
          cargos.length === 0
            ? 'sin plan de pagos'
            : `saldo ${moneyFmt.format(saldoPendiente)} de ${moneyFmt.format(totalACobrar)}`
        }
      >
        <div className="mb-4 flex flex-wrap justify-end gap-2">
          {cargos.length === 0 ? (
            <button
              type="button"
              onClick={handleGenerarPlan}
              className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 py-1.5 text-sm text-[var(--text)] hover:bg-[var(--panel)]"
            >
              Generar plan
            </button>
          ) : null}
          {cargos.length > 0 || abonos.length > 0 ? (
            <button
              type="button"
              onClick={() => setEstadoCuentaOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 py-1.5 text-sm text-[var(--text)] hover:bg-[var(--panel)]"
            >
              <Printer className="h-4 w-4" /> Imprimir estado de cuenta
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => setAbonoOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--text)] px-3 py-1.5 text-sm font-medium text-[var(--card)] hover:opacity-90"
          >
            <Plus className="h-4 w-4" /> Registrar abono
          </button>
        </div>
        {cargos.length === 0 && abonos.length === 0 ? (
          <p className="text-sm text-[var(--text)]/60">
            Sin plan de pagos generado para esta venta.
          </p>
        ) : (
          <div className="space-y-6">
            <div className="flex flex-wrap gap-x-8 gap-y-3">
              <ResumenItem label="A cobrar" value={moneyFmt.format(totalACobrar)} />
              <ResumenItem label="Cobrado" value={moneyFmt.format(totalCobrado)} />
              <ResumenItem label="Saldo" value={moneyFmt.format(saldoPendiente)} />
              {saldoFavor > 0 ? (
                <ResumenItem label="Saldo a favor" value={moneyFmt.format(saldoFavor)} warn />
              ) : null}
            </div>

            {cargos.length > 0 ? (
              <div>
                <div className="mb-1.5 text-xs font-medium uppercase tracking-wide text-[var(--text)]/50">
                  Cargos
                </div>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-[var(--border)] text-left text-xs uppercase tracking-wide text-[var(--text)]/50">
                      <th className="py-1 pr-2 font-medium">Concepto</th>
                      <th className="py-1 pr-2 font-medium">Vence</th>
                      <th className="py-1 pr-2 font-medium">Fuente</th>
                      <th className="py-1 pr-2 text-right font-medium">Monto</th>
                      <th className="py-1 pr-2 text-right font-medium">Pagado</th>
                      <th className="py-1 pr-2 text-right font-medium">Saldo</th>
                      <th className="py-1 pl-2 font-medium">Estado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {cargos.map((c) => (
                      <tr key={c.id} className="border-b border-[var(--border)]/40">
                        <td className="py-1.5 pr-2">{c.concepto ?? capitalizar(c.tipo_cargo)}</td>
                        <td className="py-1.5 pr-2 text-[var(--text)]/70">
                          {fmtFecha(c.fecha_vencimiento) ?? '—'}
                        </td>
                        <td className="py-1.5 pr-2">
                          <Badge tone={fuenteTone(c.fuente_esperada)}>
                            {fuenteLabel(c.fuente_esperada)}
                          </Badge>
                        </td>
                        <td className="py-1.5 pr-2 text-right tabular-nums">
                          {moneyFmt.format(c.monto)}
                        </td>
                        <td className="py-1.5 pr-2 text-right tabular-nums text-[var(--text)]/70">
                          {moneyFmt.format(c.monto_pagado)}
                        </td>
                        <td className="py-1.5 pr-2 text-right tabular-nums">
                          {moneyFmt.format(c.saldo)}
                        </td>
                        <td className="py-1.5 pl-2">
                          <Badge tone={estadoTone(c.estado)}>{capitalizar(c.estado)}</Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}

            {abonos.length > 0 ? (
              <div>
                <div className="mb-1.5 text-xs font-medium uppercase tracking-wide text-[var(--text)]/50">
                  Abonos
                </div>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-[var(--border)] text-left text-xs uppercase tracking-wide text-[var(--text)]/50">
                      <th className="py-1 pr-2 font-medium">Fecha</th>
                      <th className="py-1 pr-2 font-medium">Fuente</th>
                      <th className="py-1 pr-2 text-right font-medium">Monto</th>
                      <th className="py-1 pr-2 text-right font-medium">Aplicado</th>
                      <th className="py-1 pr-2 text-right font-medium">Saldo a favor</th>
                      <th className="py-1 pr-2 font-medium">Comprobante</th>
                      <th className="py-1 pl-2 font-medium"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {abonos.map((a) => {
                      const aplicado = aplicadoPorAbono.get(a.id) ?? 0;
                      const favor = a.monto_total - aplicado;
                      return (
                        <tr key={a.id} className="border-b border-[var(--border)]/40">
                          <td className="py-1.5 pr-2">{fmtFecha(a.fecha) ?? '—'}</td>
                          <td className="py-1.5 pr-2">
                            <Badge tone={fuenteTone(a.fuente)}>{fuenteLabel(a.fuente)}</Badge>
                          </td>
                          <td className="py-1.5 pr-2 text-right tabular-nums">
                            {moneyFmt.format(a.monto_total)}
                          </td>
                          <td className="py-1.5 pr-2 text-right tabular-nums text-[var(--text)]/70">
                            {moneyFmt.format(aplicado)}
                          </td>
                          <td className="py-1.5 pr-2 text-right tabular-nums">
                            {favor > 0 ? (
                              <span className="font-medium text-amber-600">
                                {moneyFmt.format(favor)}
                              </span>
                            ) : (
                              <span className="text-[var(--text)]/30">—</span>
                            )}
                          </td>
                          <td className="py-1.5 pr-2">
                            <div className="flex flex-wrap gap-1">
                              {(comprobantesPorAbono.get(a.id) ?? []).map((adj) => (
                                <AdjuntoLink key={adj.id} a={adj} compact />
                              ))}
                              {(comprobantesPorAbono.get(a.id) ?? []).length === 0 ? (
                                <span className="text-[var(--text)]/30">—</span>
                              ) : null}
                            </div>
                          </td>
                          <td className="py-1.5 pl-2 text-right">
                            <button
                              type="button"
                              onClick={() => setReciboAbono(a)}
                              className="inline-flex items-center gap-1 rounded-lg border border-[var(--border)] bg-[var(--card)] px-2 py-1 text-xs text-[var(--text)] hover:bg-[var(--panel)]"
                              title="Imprimir recibo de caja"
                            >
                              <Printer className="h-3 w-3" /> Recibo
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : null}
          </div>
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

      <AbonoCaptureDrawer
        open={abonoOpen}
        onOpenChange={setAbonoOpen}
        ventaId={id}
        empresaId={venta.empresa_id}
        personaId={venta.persona_id}
        clienteNombre={clienteNombre}
        onDone={() => setRefreshKey((k) => k + 1)}
      />

      {/* Estado de cuenta imprimible — el documento vive dentro del drawer; el
          aislamiento de impresión lo da la maquinaria del repo (data-print-sheet-open
          + @media print en globals.css), igual que el kardex. El título del header va
          print:hidden para que el membrete del documento sea el encabezado impreso. */}
      <DetailDrawer
        open={estadoCuentaOpen}
        onOpenChange={setEstadoCuentaOpen}
        size="lg"
        title={<span className="print:hidden">Estado de cuenta</span>}
        description={<span className="print:hidden">{clienteNombre}</span>}
        actions={
          <button
            type="button"
            onClick={triggerPrint}
            className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--text)] px-3 py-1.5 text-sm font-medium text-[var(--card)] hover:opacity-90"
          >
            <Printer className="h-4 w-4" /> Imprimir
          </button>
        }
      >
        <DetailDrawerContent>
          <EstadoCuentaPrintable
            cliente={{
              nombre: clienteNombre,
              rfc: persona?.rfc,
              telefono: persona?.telefono,
              email: persona?.email,
            }}
            operacion={{
              proyecto: proyectoNombre,
              unidad: unidad?.identificador,
              prototipo: prototipoNombre,
              tipoCredito: venta.tipo_credito,
              valorEscrituracion: venta.valor_escrituracion,
              asesor: vendedorNombre ?? venta.vendedor,
            }}
            cargos={cargos.map((c) => ({
              concepto: c.concepto ?? capitalizar(c.tipo_cargo),
              vence: c.fecha_vencimiento,
              fuente: c.fuente_esperada,
              monto: c.monto,
              pagado: c.monto_pagado,
              saldo: c.saldo,
              estado: c.estado,
            }))}
            abonos={abonos.map((a) => ({
              fecha: a.fecha,
              fuente: a.fuente,
              formaPago: a.forma_pago,
              monto: a.monto_total,
              aplicado: aplicadoPorAbono.get(a.id) ?? 0,
            }))}
            totales={{
              aCobrar: totalACobrar,
              cobrado: totalCobrado,
              saldo: saldoPendiente,
              saldoFavor,
            }}
            fechaCorteISO={new Date().toISOString().slice(0, 10)}
          />
        </DetailDrawerContent>
      </DetailDrawer>

      <DetailDrawer
        open={!!reciboAbono}
        onOpenChange={(o) => !o && setReciboAbono(null)}
        size="md"
        title={<span className="print:hidden">Recibo de caja</span>}
        description={<span className="print:hidden">{clienteNombre}</span>}
        actions={
          <button
            type="button"
            onClick={triggerPrint}
            className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--text)] px-3 py-1.5 text-sm font-medium text-[var(--card)] hover:opacity-90"
          >
            <Printer className="h-4 w-4" /> Imprimir
          </button>
        }
      >
        <DetailDrawerContent>
          {reciboAbono ? (
            <ReciboCajaPrintable
              folio={`RC-${reciboAbono.id.slice(0, 8).toUpperCase()}`}
              fechaISO={reciboAbono.fecha}
              cliente={clienteNombre}
              concepto={
                [proyectoNombre, unidad?.identificador].filter(Boolean).join(' · ')
                  ? `Abono a cuenta — ${[proyectoNombre, unidad?.identificador]
                      .filter(Boolean)
                      .join(' · ')}`
                  : 'Abono a cuenta'
              }
              monto={reciboAbono.monto_total}
              formaPago={reciboAbono.forma_pago}
              referencia={reciboAbono.referencia}
              fuente={reciboAbono.fuente}
            />
          ) : null}
        </DetailDrawerContent>
      </DetailDrawer>
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

function capitalizar(s: string): string {
  return s.length ? s[0].toUpperCase() + s.slice(1) : s;
}

function fuenteLabel(f: string): string {
  return f === 'institucion' ? 'Institución' : 'Cliente';
}

function estadoTone(e: string): BadgeTone {
  switch (e) {
    case 'liquidado':
      return 'success';
    case 'parcial':
      return 'warning';
    case 'cancelado':
      return 'danger';
    default:
      return 'neutral';
  }
}

function fuenteTone(f: string): BadgeTone {
  return f === 'institucion' ? 'accent' : 'info';
}

function ResumenItem({
  label,
  value,
  warn = false,
}: {
  label: string;
  value: string;
  warn?: boolean;
}) {
  return (
    <div>
      <div className="text-xs font-medium uppercase tracking-wide text-[var(--text)]/50">
        {label}
      </div>
      <div
        className={`mt-0.5 text-base font-semibold tabular-nums ${warn ? 'text-amber-600' : 'text-[var(--text)]'}`}
      >
        {value}
      </div>
    </div>
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
  tipo:
    | 'solicitud-asignacion'
    | 'aviso-privacidad'
    | 'ficu'
    | 'promesa-compraventa'
    | 'solicitud-avaluo'
    | 'solicitud-dictamen'
    | 'poliza-garantia'
    | 'pagare-credito-directo';
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

/**
 * Movimientos administrativos sobre la venta — solo visibles para roles
 * con escritura sobre `dilesa.ventas.autorizar` (Dirección + Nelcy).
 *
 *  - Regresar a fase: dialog con selector de fase destino + motivo.
 *  - Desasignar: dialog con motivo. Manda email al cliente + vendedor.
 *
 * Si la venta ya está desasignada o en fase 17, no se muestran botones.
 */
function MovimientosAdministrativos({
  ventaId,
  estado,
  fasePosicion,
  personaId,
}: {
  ventaId: string;
  estado: string;
  fasePosicion: number | null;
  personaId: string;
}) {
  const { permissions } = usePermissions();
  const toast = useToast();
  const router = useRouter();
  const [openRegresar, setOpenRegresar] = useState(false);
  const [openDesasignar, setOpenDesasignar] = useState(false);

  const puedeAutorizar =
    permissions.isAdmin || permissions.modulos.get('dilesa.ventas.autorizar')?.write === true;
  if (!puedeAutorizar) return null;

  // Si está desasignada, ofrecemos crear una nueva solicitud para el
  // mismo cliente con otra unidad — caso de uso operativo común.
  if (estado === 'desasignada') {
    return (
      <div className="flex flex-wrap gap-2">
        <Link
          href={`/dilesa/ventas/nueva?persona=${personaId}`}
          className="inline-flex items-center gap-1.5 rounded-md border border-[var(--accent)] bg-[var(--accent)]/10 px-3 py-1.5 text-sm font-medium text-[var(--accent)] hover:bg-[var(--accent)]/20"
        >
          + Crear nueva solicitud para este cliente
        </Link>
      </div>
    );
  }
  if (estado !== 'activa') return null;
  const pos = fasePosicion ?? 0;

  /**
   * Callback común: muestra toast + refresca el detalle para que el
   * estado nuevo (fase_actual, estado) se renderee inmediatamente.
   * Sin esto el operador no veía feedback de que el cambio aplicó.
   */
  function handleDone(msg: string) {
    toast.add({ title: 'Listo', description: msg, type: 'success' });
    router.refresh();
  }
  function handleError(msg: string) {
    toast.add({ title: 'Error', description: msg, type: 'error' });
  }

  return (
    <div className="flex flex-wrap gap-2">
      {pos > 1 ? (
        <Button variant="outline" size="sm" onClick={() => setOpenRegresar(true)}>
          Regresar a fase…
        </Button>
      ) : null}
      <Button variant="outline" size="sm" onClick={() => setOpenDesasignar(true)}>
        Desasignar venta…
      </Button>

      <RegresarFaseDialog
        ventaId={ventaId}
        faseActual={pos}
        open={openRegresar}
        onOpenChange={setOpenRegresar}
        onDone={handleDone}
        onError={handleError}
      />
      <DesasignarDialog
        ventaId={ventaId}
        open={openDesasignar}
        onOpenChange={setOpenDesasignar}
        onDone={handleDone}
        onError={handleError}
      />
    </div>
  );
}

function RegresarFaseDialog({
  ventaId,
  faseActual,
  open,
  onOpenChange,
  onDone,
  onError,
}: {
  ventaId: string;
  faseActual: number;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onDone: (msg: string) => void;
  onError: (msg: string) => void;
}) {
  const [faseDestino, setFaseDestino] = useState<number>(1);
  const [motivo, setMotivo] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const opciones = Array.from({ length: Math.max(0, faseActual - 1) }, (_, i) => i + 1);

  async function onSubmit() {
    if (motivo.trim().length < 5) {
      onError('El motivo es obligatorio (mínimo 5 caracteres).');
      return;
    }
    setSubmitting(true);
    try {
      const res = await regresarAFase(ventaId, faseDestino, motivo);
      if (!res.ok) {
        onError(res.error);
        return;
      }
      const baseMsg = `Venta regresada a Fase ${faseDestino}.`;
      const emailMsg =
        faseDestino === 1
          ? res.emailSent
            ? ` Email de bienvenida enviado a ${res.emailSentTo?.join(', ') ?? 'cliente'}.`
            : ` ⚠️ El correo no se pudo enviar${res.emailError ? ` (${res.emailError})` : ''}.`
          : '';
      onDone(baseMsg + emailMsg);
      onOpenChange(false);
      setMotivo('');
    } catch (e) {
      // Server action arrojó excepción sin manejarse — la mostramos al
      // operador en vez de dejarla pasar silenciosa (era el bug del PR #664).
      const msg = e instanceof Error ? e.message : String(e);
      console.error('[RegresarFaseDialog] uncaught', e);
      onError(`No se pudo regresar la venta: ${msg}`);
    } finally {
      setSubmitting(false);
    }
  }

  function handleOpenChange(v: boolean) {
    if (!v) {
      setMotivo('');
      setFaseDestino(1);
    }
    onOpenChange(v);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Regresar venta a fase anterior</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div>
            <label className="mb-1 block text-xs text-[var(--text)]/60">Fase destino</label>
            <select
              value={faseDestino}
              onChange={(e) => setFaseDestino(Number(e.target.value))}
              className="h-9 w-full rounded-md border border-[var(--border)] bg-[var(--card)] px-3 text-sm"
              disabled={submitting}
            >
              {opciones.map((p) => (
                <option key={p} value={p}>
                  Fase {p}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs text-[var(--text)]/60">Motivo (obligatorio)</label>
            <textarea
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              rows={3}
              className="w-full rounded-md border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm"
              disabled={submitting}
              placeholder="Ej. Cliente solicita corregir CURP del expediente digital."
            />
          </div>
          {faseDestino === 1 ? (
            <p className="text-xs text-amber-700 dark:text-amber-400">
              Al regresar a Fase 1 se enviará un email de bienvenida nuevo al cliente con plazo
              fresco de 2 días hábiles.
            </p>
          ) : null}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)} disabled={submitting}>
            Cancelar
          </Button>
          <Button onClick={onSubmit} disabled={submitting || opciones.length === 0}>
            {submitting ? 'Regresando…' : 'Regresar venta'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DesasignarDialog({
  ventaId,
  open,
  onOpenChange,
  onDone,
  onError,
}: {
  ventaId: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onDone: (msg: string) => void;
  onError: (msg: string) => void;
}) {
  const [motivo, setMotivo] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit() {
    if (motivo.trim().length < 5) {
      onError('El motivo es obligatorio (mínimo 5 caracteres).');
      return;
    }
    setSubmitting(true);
    try {
      const res = await desasignarVenta(ventaId, motivo);
      if (!res.ok) {
        onError(res.error);
        return;
      }
      const emailMsg = res.emailSent
        ? ` Email enviado a ${res.emailSentTo?.join(', ') ?? 'cliente'}.`
        : ` ⚠️ El correo no se pudo enviar${res.emailError ? ` (${res.emailError})` : ''}.`;
      onDone('Venta desasignada.' + emailMsg);
      onOpenChange(false);
      setMotivo('');
    } catch (e) {
      // Server action arrojó excepción sin manejarse — la mostramos al
      // operador en vez de dejarla pasar silenciosa (era el bug del PR #664).
      const msg = e instanceof Error ? e.message : String(e);
      console.error('[DesasignarDialog] uncaught', e);
      onError(`No se pudo desasignar la venta: ${msg}`);
    } finally {
      setSubmitting(false);
    }
  }

  function handleOpenChange(v: boolean) {
    if (!v) setMotivo('');
    onOpenChange(v);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Desasignar venta</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <p className="text-sm text-[var(--text)]/70">
            La venta pasará a estado <b>desasignada</b>. La unidad quedará disponible para nuevas
            solicitudes. El cliente y el vendedor recibirán un correo con el motivo.
          </p>
          <div>
            <label className="mb-1 block text-xs text-[var(--text)]/60">Motivo (obligatorio)</label>
            <textarea
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              rows={3}
              className="w-full rounded-md border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm"
              disabled={submitting}
              placeholder="Ej. Cliente decidió cancelar la compra por motivos personales."
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)} disabled={submitting}>
            Cancelar
          </Button>
          <Button onClick={onSubmit} disabled={submitting}>
            {submitting ? 'Desasignando…' : 'Desasignar venta'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
