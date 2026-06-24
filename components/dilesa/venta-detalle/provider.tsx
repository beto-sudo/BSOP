'use client';

/**
 * `VentaDetalleProvider` — el "cerebro" del expediente de venta DILESA.
 *
 * Carga la venta + todas sus entidades satélite (persona, unidad, fases,
 * cargos/abonos CxC, adjuntos, hold, desglose) una sola vez y las expone, junto
 * con todas las derivaciones (pipeline, cuadratura, copiloto, saldos, fichas) y
 * los handlers de mutación, vía `useVentaDetalle()`.
 *
 * Vive en el layout `[id]/(expediente)` para que la navegación entre tabs del
 * expediente (Operación / Cuadratura / Documentos / Bitácora …) NO recargue:
 * el layout se preserva entre rutas hermanas, así que el provider mantiene su
 * estado. Extraído del antiguo monolito `[id]/page.tsx` (iniciativa
 * `dilesa-ventas-expediente-tabs`) sin cambiar la lógica de carga.
 *
 * El gating (loading / error / scope de vendedor) lo expone como flags; el
 * Shell del layout decide qué renderizar. Las páginas consumidoras asumen
 * `venta` ya disponible (el Shell no las monta antes).
 */

import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode, RefObject } from 'react';
import { createSupabaseBrowserClient } from '@/lib/supabase-browser';
import { getSupabaseErrorMessage } from '@/lib/supabase-error';
import { useToast } from '@/components/ui/toast';
import { useEffectiveUser } from '@/components/providers';
import { buildAdjuntoPath } from '@/lib/storage/path';
import { useTriggerPrint } from '@/components/print';
import {
  calcularCuadratura,
  topeDescuentoAutorizado,
  type Cuadratura,
} from '@/lib/dilesa/cuadratura';
import type { CuadraturaInputsStr } from '@/components/dilesa/cuadratura-ajustes';
import { leerDesglose, type DesglosePrecioSnapshot } from '@/lib/dilesa/desglose-precio';
import { FASE_ROLES, ROL_LABEL, rolesOpcionales } from '@/lib/dilesa/captura/fase-roles';
import { evaluarCierre, type CopilotoResultado } from '@/lib/dilesa/copiloto-cierre';
import { useScopeVendedorDilesa } from '@/lib/dilesa/use-scope-vendedor';
import { domicilioTexto, kycEfectivo } from '@/lib/dilesa/kyc-efectivo';
import { snapshotHold, type ColaItem, type HoldSnapshot } from '@/lib/dilesa/hold-cola';
import {
  moneyFmt,
  fmtMoney,
  fmtFecha,
  FASES_ORDEN,
  CAPTURAR_SLUG_BY_POSICION,
  GATE_PREVIA_OVERRIDE,
  type Venta,
  type Persona,
  type UnidadInfo,
  type Fase,
  type Cargo,
  type Abono,
  type Adjunto,
} from './types';

/** Una fila del pipeline (las 17 fases, alcanzadas o no). */
export interface PipelineRow {
  pos: number;
  nombre: string;
  fecha: string | null;
  registradoPor: string | null;
  alcanzada: boolean;
  cargados: Adjunto[];
  faltantes: string[];
  slugCaptura: string | undefined;
  puedeCapturar: boolean;
  previaCerrada: boolean;
}

type ScopeVendedor = ReturnType<typeof useScopeVendedorDilesa>;

export interface VentaDetalleValue {
  ventaId: string;
  // Carga base
  venta: Venta | null;
  persona: Persona | null;
  unidad: UnidadInfo | null;
  proyectoNombre: string | null;
  prototipoNombre: string | null;
  fases: Fase[];
  cargos: Cargo[];
  abonos: Abono[];
  aplicadoPorAbono: Map<string, number>;
  comprobantesPorAbono: Map<string, Adjunto[]>;
  adjuntos: Adjunto[];
  calculo: DesglosePrecioSnapshot | null;
  vendedorNombre: string | null;
  registradoresPorId: Map<string, string>;
  holdSnapshot: HoldSnapshot | null;
  apoyoInfonavit: number;
  promo: { nombre: string; monto: number } | null;
  // Estado de la cuadratura (editable)
  cuadInputs: CuadraturaInputsStr;
  setCuadInputs: React.Dispatch<React.SetStateAction<CuadraturaInputsStr>>;
  // Gating
  loading: boolean;
  error: string | null;
  scopeVendedor: ScopeVendedor;
  effectiveUser: ReturnType<typeof useEffectiveUser>['data'];
  // Derivaciones
  clienteNombre: string;
  adjuntosVenta: Adjunto[];
  adjuntosPorRolMap: Map<string, Adjunto[]>;
  adjuntosPorRol: [string, Adjunto[]][];
  hayFacturaCfdi: boolean;
  rolesOpc: Set<string>;
  pipelineRows: PipelineRow[];
  pipelineAlcanzadas: number;
  totalACobrar: number;
  totalCobrado: number;
  saldoPendiente: number;
  saldoFavor: number;
  cuadratura: Cuadratura;
  copiloto: CopilotoResultado;
  fichaVenta: { label: string; value: string }[];
  fichaPersona: { label: string; value: string }[];
  kyc: { label: string; value: string }[];
  // UI state (estado de cuenta / abonos / impresión)
  abonoOpen: boolean;
  setAbonoOpen: React.Dispatch<React.SetStateAction<boolean>>;
  estadoCuentaOpen: boolean;
  setEstadoCuentaOpen: React.Dispatch<React.SetStateAction<boolean>>;
  reciboAbono: Abono | null;
  setReciboAbono: React.Dispatch<React.SetStateAction<Abono | null>>;
  subiendoReciboId: string | null;
  reciboFileInputRef: RefObject<HTMLInputElement | null>;
  reciboUploadAbonoIdRef: RefObject<string | null>;
  triggerPrint: () => void;
  // Mutaciones
  bumpRefresh: () => void;
  handleGenerarPlan: () => Promise<void>;
  handleReciboFileChange: (file: File | null) => Promise<void>;
}

const VentaDetalleContext = createContext<VentaDetalleValue | null>(null);

export function useVentaDetalle(): VentaDetalleValue {
  const ctx = useContext(VentaDetalleContext);
  if (!ctx) {
    throw new Error('useVentaDetalle debe usarse dentro de <VentaDetalleProvider>.');
  }
  return ctx;
}

export function VentaDetalleProvider({
  ventaId,
  children,
}: {
  ventaId: string;
  children: ReactNode;
}) {
  const id = ventaId;
  const { data: effectiveUser } = useEffectiveUser();
  const scopeVendedor = useScopeVendedorDilesa();
  const [cuadInputs, setCuadInputs] = useState<CuadraturaInputsStr>({
    descuentoTotal: '',
    descuentoPrecio: '',
    descuentoEquipamiento: '',
    descuentoGastosEscr: '',
    descuentoNotaCredito: '',
  });
  const [apoyoInfonavit, setApoyoInfonavit] = useState(0);
  const [promo, setPromo] = useState<{ nombre: string; monto: number } | null>(null);
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
  const [calculo, setCalculo] = useState<DesglosePrecioSnapshot | null>(null);
  const [vendedorNombre, setVendedorNombre] = useState<string | null>(null);
  const [registradoresPorId, setRegistradoresPorId] = useState<Map<string, string>>(new Map());
  const [holdSnapshot, setHoldSnapshot] = useState<HoldSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [abonoOpen, setAbonoOpen] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [estadoCuentaOpen, setEstadoCuentaOpen] = useState(false);
  const [reciboAbono, setReciboAbono] = useState<Abono | null>(null);
  const reciboFileInputRef = useRef<HTMLInputElement | null>(null);
  const reciboUploadAbonoIdRef = useRef<string | null>(null);
  const [subiendoReciboId, setSubiendoReciboId] = useState<string | null>(null);
  const toast = useToast();
  const triggerPrint = useTriggerPrint();

  // Deep-link desde la guía de Fase 12: `?abono=1` abre el drawer de Registrar
  // abono. window.location en effect (no useSearchParams — evita el bailout CSR
  // de Next 16). El flag se limpia para que un refresh no re-abra el drawer.
  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    if (sp.get('abono') === '1') {
      setAbonoOpen(true);
      sp.delete('abono');
      const qs = sp.toString();
      window.history.replaceState(null, '', window.location.pathname + (qs ? `?${qs}` : ''));
    }
  }, []);

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
      const numStr = (n: number | null): string => (n == null ? '' : String(n));
      setCuadInputs({
        descuentoTotal: numStr(ventaRow.descuento_total),
        descuentoPrecio: numStr(ventaRow.descuento_precio),
        descuentoEquipamiento: numStr(ventaRow.descuento_equipamiento),
        descuentoGastosEscr: numStr(ventaRow.descuento_gastos_escrituracion),
        descuentoNotaCredito: numStr(ventaRow.descuento_nota_credito),
      });

      // Promoción de la solicitud → Descuento Máximo Autorizado (derivado).
      if (ventaRow.promocion_id) {
        const { data: promoRow } = await sb
          .schema('dilesa')
          .from('promociones')
          .select('nombre, monto')
          .eq('id', ventaRow.promocion_id)
          .maybeSingle();
        if (!activo) return;
        setPromo(
          promoRow ? { nombre: promoRow.nombre as string, monto: Number(promoRow.monto) } : null
        );
      } else {
        setPromo(null);
      }

      // Apoyo Infonavit derivado del catálogo `dilesa.tipos_credito` (auto, no
      // se captura) — alimenta la cuadratura. Match por empresa + nombre.
      let apoyoDerivado = 0;
      if (ventaRow.tipo_credito) {
        const { data: tcRow } = await sb
          .schema('dilesa')
          .from('tipos_credito')
          .select('apoyo_infonavit_monto')
          .eq('empresa_id', ventaRow.empresa_id)
          .eq('nombre', ventaRow.tipo_credito)
          .is('deleted_at', null)
          .maybeSingle();
        if (tcRow) {
          apoyoDerivado = Number(
            (tcRow as { apoyo_infonavit_monto: number | null }).apoyo_infonavit_monto ?? 0
          );
        }
      }
      if (activo) setApoyoInfonavit(apoyoDerivado);

      const [pRes, fRes, cargosRes, abonosRes, uRes] = await Promise.all([
        sb
          .schema('erp')
          .from('personas')
          .select(
            'nombre, apellido_paterno, apellido_materno, email, telefono, curp, rfc, nss, fecha_nacimiento, nacionalidad, tipo_persona, estado_civil, domicilio, ocupacion, forma_pago_kyc, uso_efectivo_kyc, conocimiento_dueno_beneficiario, es_pep, numero_credencial_ine, domicilio_calle, domicilio_numero_exterior, domicilio_numero_interior, domicilio_colonia, domicilio_codigo_postal, domicilio_ciudad, domicilio_estado'
          )
          .eq('id', ventaRow.persona_id)
          .maybeSingle(),
        sb
          .schema('dilesa')
          .from('venta_fases')
          .select('id, fase, posicion, fecha, registrado_por')
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
          .select('id, fecha, monto_total, fuente, forma_pago, referencia, notas, uuid_sat')
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
      const fasesData = (fRes.data ?? []) as Fase[];
      setFases(fasesData);

      // Resolver nombres de quién registró cada fase (bitácora).
      const registradorIds = [
        ...new Set(fasesData.map((f) => f.registrado_por).filter((x): x is string => !!x)),
      ];
      if (registradorIds.length > 0) {
        const { data: regUsers } = await sb
          .schema('core')
          .from('usuarios')
          .select('id, first_name, last_name, email')
          .in('id', registradorIds);
        if (activo) {
          const rm = new Map<string, string>();
          for (const u of (regUsers ?? []) as {
            id: string;
            first_name: string | null;
            last_name: string | null;
            email: string | null;
          }[]) {
            const completo = [u.first_name, u.last_name].filter(Boolean).join(' ').trim();
            rm.set(u.id, completo || u.email || '');
          }
          setRegistradoresPorId(rm);
        }
      }
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

      // Vendedor (asesor de ventas) — lookup core.usuarios para mostrar nombre
      // completo, mismo patrón que el endpoint PDF. El campo legacy
      // `venta.vendedor` (text) puede estar vacío en ventas nuevas.
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

      // Snapshot del hold/cola para banners de la página. Solo aplica a ventas
      // creadas en BSOP (no históricas Coda) y Fase 1.
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

      // Desglose del precio: SNAPSHOT congelado al asignar (regla Beto
      // 2026-06-15). Una venta ya asignada NO se re-tarifa en vivo — leemos
      // `dilesa.ventas.desglose_precio` en vez de llamar fn_calcular_precio_venta
      // (que aplicaría exención ZCU / +6% retroactivamente). Sin snapshot
      // (histórica sin precio de asignación) no se muestra desglose.
      if (activo) {
        setCalculo(leerDesglose(ventaRow.desglose_precio));
      }

      setLoading(false);
    })();

    return () => {
      activo = false;
    };
  }, [id, refreshKey]);

  const bumpRefresh = () => setRefreshKey((k) => k + 1);

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

  // Sube el recibo de caja / factura al abono elegido (rol='recibo_caja', mismo
  // rol del import de Coda). Alimenta `tieneRecibo` en la cuadratura (Valor
  // Facturado, paridad Coda).
  const handleReciboFileChange = async (file: File | null) => {
    const abonoId = reciboUploadAbonoIdRef.current;
    reciboUploadAbonoIdRef.current = null;
    if (reciboFileInputRef.current) reciboFileInputRef.current.value = '';
    if (!file || !abonoId || !venta) return;

    setSubiendoReciboId(abonoId);
    try {
      const sb = createSupabaseBrowserClient();
      const path = buildAdjuntoPath({
        empresa: 'dilesa',
        entidad: 'cxc_pagos',
        entidadId: abonoId,
        filename: file.name,
      });
      const { error: upErr } = await sb.storage.from('adjuntos').upload(path, file, {
        contentType: file.type || 'application/octet-stream',
        upsert: false,
      });
      if (upErr) {
        toast.add({
          title: 'No se pudo subir el recibo',
          description: getSupabaseErrorMessage(upErr, 'Reintenta la carga.'),
          type: 'error',
        });
        return;
      }
      const { error: insErr } = await sb
        .schema('erp')
        .from('adjuntos')
        .insert({
          empresa_id: venta.empresa_id,
          entidad_tipo: 'cxc_pago',
          entidad_id: abonoId,
          rol: 'recibo_caja',
          nombre: file.name,
          url: path,
          tipo_mime: file.type || null,
        });
      if (insErr) {
        toast.add({
          title: 'El archivo subió pero no se ligó al abono',
          description: getSupabaseErrorMessage(insErr, 'Reintenta la carga.'),
          type: 'error',
        });
        return;
      }
      toast.add({ title: 'Recibo de caja adjuntado', type: 'success' });
      setRefreshKey((k) => k + 1);
    } finally {
      setSubiendoReciboId(null);
    }
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
  const hayFacturaCfdi = useMemo(
    () => (adjuntosPorRolMap.get('factura_xml')?.length ?? 0) > 0,
    [adjuntosPorRolMap]
  );

  const rolesOpc = useMemo(
    () =>
      venta
        ? rolesOpcionales({
            monto_credito_cotitular: venta.monto_credito_cotitular,
            monto_credito_directo: venta.monto_credito_directo,
            monto_nota_credito: venta.monto_nota_credito,
            tipo_credito: venta.tipo_credito,
          })
        : new Set<string>(),
    [venta]
  );

  const pipelineRows = useMemo<PipelineRow[]>(() => {
    // Match por POSICIÓN (no por nombre): los renombres de fase no rompen el
    // timeline de ventas históricas cuyo texto en venta_fases conserva el viejo.
    const fasesByPos = new Map(fases.map((f) => [f.posicion, f]));
    const posicionesAlcanzadas = new Set(fases.map((f) => f.posicion));
    return FASES_ORDEN.map(({ pos, nombre }) => {
      const f = fasesByPos.get(pos);
      const roles = FASE_ROLES[pos] ?? [];
      const cargados = roles.flatMap((r) =>
        (adjuntosPorRolMap.get(r) ?? []).map((a) => ({ ...a, rol: r }))
      );
      const rolesCargados = new Set(cargados.map((a) => a.rol));
      const faltantes = roles.filter((r) => !rolesCargados.has(r) && !rolesOpc.has(r));
      const slugCaptura = CAPTURAR_SLUG_BY_POSICION[pos];
      const previaCerrada =
        pos === 1 || posicionesAlcanzadas.has(GATE_PREVIA_OVERRIDE[pos] ?? pos - 1);
      const alcanzada = !!f?.fecha;
      const desasignada = venta?.estado === 'desasignada';
      const puedeCapturar = !!slugCaptura && !alcanzada && previaCerrada && !desasignada;
      return {
        pos,
        nombre,
        fecha: f?.fecha ?? null,
        registradoPor: f?.registrado_por ?? null,
        alcanzada,
        cargados,
        faltantes,
        slugCaptura,
        puedeCapturar,
        previaCerrada,
      };
    });
  }, [fases, adjuntosPorRolMap, venta?.estado, rolesOpc]);

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

  // Cuadratura de la operación (motor único — lib/dilesa/cuadratura.ts).
  const cuadratura = useMemo(
    () =>
      calcularCuadratura({
        valorEscrituracion: venta?.valor_escrituracion ?? null,
        montoCreditoTitular: venta?.monto_credito_titular ?? null,
        montoCreditoCotitular: venta?.monto_credito_cotitular ?? null,
        montoCreditoDirecto: venta?.monto_credito_directo ?? null,
        montoDetonado: venta?.monto_detonado ?? null,
        montoChequeNotaria: venta?.monto_cheque_notaria ?? null,
        gastosEscrituracion: venta?.gastos_escrituracion ?? null,
        precioBase: venta?.precio_base ?? null,
        incrementoCredito: venta?.incremento_credito ?? null,
        sobreprecioGastos: venta?.sobreprecio_gastos_escrituracion ?? null,
        productosAdicionales: venta?.productos_adicionales ?? null,
        promocionGastos: venta?.promocion_gastos_monto ?? null,
        valorExcedenteTerreno: venta?.valor_excedente_terreno ?? null,
        valorFrenteVerde: venta?.valor_frente_verde ?? null,
        valorEsquina: venta?.valor_esquina ?? null,
        valorVentaFuturo: venta?.valor_venta_futuro ?? null,
        apoyoInfonavit,
        descuentoOtorgadoTotal: Number(cuadInputs.descuentoTotal) || 0,
        descuentoMaximoAutorizado: topeDescuentoAutorizado(promo?.monto, !!venta?.coda_row_id),
        precioAsignacion: venta?.precio_asignacion ?? null,
        valorFacturadoReal: hayFacturaCfdi ? (venta?.valor_facturado ?? null) : null,
        depositos: abonos.map((a) => ({
          monto: a.monto_total,
          directoCliente: a.fuente === 'cliente',
          tieneRecibo: (comprobantesPorAbono.get(a.id) ?? []).some(
            (adj) => adj.rol === 'recibo_caja'
          ),
        })),
        proyectoNombre,
      }),
    [
      venta,
      abonos,
      proyectoNombre,
      cuadInputs,
      apoyoInfonavit,
      promo,
      comprobantesPorAbono,
      hayFacturaCfdi,
    ]
  );

  // Copiloto de cierre (S4): qué falta para Operación Terminada.
  const copiloto = useMemo(() => {
    const docsFaltantes = pipelineRows.flatMap((r) =>
      r.faltantes
        .filter((rol) => !rolesOpc.has(rol))
        .map((rol) => ({ fase: r.nombre, rol, label: ROL_LABEL[rol] ?? rol }))
    );
    return evaluarCierre(
      {
        fases: pipelineRows.map((r) => ({ pos: r.pos, nombre: r.nombre, alcanzada: r.alcanzada })),
        docsFaltantes,
        saldoCliente: cuadratura.saldoOperacion,
        cubierta: venta?.valor_escrituracion == null ? null : cuadratura.operacionCubierta,
      },
      (n) => moneyFmt.format(n)
    );
  }, [venta, pipelineRows, cuadratura, rolesOpc]);

  const fichaVenta = useMemo<{ label: string; value: string }[]>(() => {
    if (!venta) return [];
    return (
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
        ['Sobreprecio gastos escrituración', fmtMoney(venta.sobreprecio_gastos_escrituracion)],
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
  }, [venta, proyectoNombre, unidad, prototipoNombre, vendedorNombre]);

  const fichaPersona = useMemo<{ label: string; value: string }[]>(() => {
    if (!persona) return [];
    return (
      [
        ['CURP', persona.curp],
        ['RFC', persona.rfc],
        ['NSS', persona.nss],
        // INE efectivo: per-venta en ventas Coda, en la persona en capturas BSOP.
        ['INE', kycEfectivo(persona, venta).ineNumero],
        ['Tel.', persona.telefono],
        ['Email', persona.email],
        ['Fecha de nacimiento', fmtFecha(persona.fecha_nacimiento)],
        ['Nacionalidad', persona.nacionalidad],
        ['Estado civil', persona.estado_civil],
        ['Tipo persona', persona.tipo_persona],
        ['Domicilio', domicilioTexto(persona)],
      ] as [string, string | null][]
    )
      .filter((r): r is [string, string] => r[1] != null && r[1] !== '')
      .map(([label, value]) => ({ label, value }));
  }, [persona, venta]);

  const kyc = useMemo<{ label: string; value: string }[]>(() => {
    if (!venta) return [];
    // KYC efectivo: ventas Coda lo traen per-venta, capturas BSOP en la persona.
    const kycResuelto = kycEfectivo(persona, venta);
    const pepConocido = persona?.es_pep != null || venta.es_pep != null;
    return (
      [
        ['PEP', pepConocido ? (kycResuelto.esPep ? 'Sí' : 'No') : null],
        ['Ocupación', kycResuelto.ocupacion],
        // INE se muestra en "Datos del cliente" (identidad), no aquí.
        ['Forma de pago', kycResuelto.formaPago],
        ['Uso de efectivo', kycResuelto.usoEfectivo],
        ['Dueño beneficiario', kycResuelto.conocimientoDuenoBeneficiario],
      ] as [string, string | null][]
    )
      .filter((r): r is [string, string] => r[1] != null && r[1] !== '')
      .map(([label, value]) => ({ label, value }));
  }, [persona, venta]);

  const value: VentaDetalleValue = {
    ventaId: id,
    venta,
    persona,
    unidad,
    proyectoNombre,
    prototipoNombre,
    fases,
    cargos,
    abonos,
    aplicadoPorAbono,
    comprobantesPorAbono,
    adjuntos,
    calculo,
    vendedorNombre,
    registradoresPorId,
    holdSnapshot,
    apoyoInfonavit,
    promo,
    cuadInputs,
    setCuadInputs,
    loading,
    error,
    scopeVendedor,
    effectiveUser,
    clienteNombre,
    adjuntosVenta,
    adjuntosPorRolMap,
    adjuntosPorRol,
    hayFacturaCfdi,
    rolesOpc,
    pipelineRows,
    pipelineAlcanzadas,
    totalACobrar,
    totalCobrado,
    saldoPendiente,
    saldoFavor,
    cuadratura,
    copiloto,
    fichaVenta,
    fichaPersona,
    kyc,
    abonoOpen,
    setAbonoOpen,
    estadoCuentaOpen,
    setEstadoCuentaOpen,
    reciboAbono,
    setReciboAbono,
    subiendoReciboId,
    reciboFileInputRef,
    reciboUploadAbonoIdRef,
    triggerPrint,
    bumpRefresh,
    handleGenerarPlan,
    handleReciboFileChange,
  };

  return <VentaDetalleContext.Provider value={value}>{children}</VentaDetalleContext.Provider>;
}
