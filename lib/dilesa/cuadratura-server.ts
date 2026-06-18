/**
 * Carga server-side de la cuadratura de una venta DILESA.
 *
 * Espejo del armado de insumos que hace `useVentaResumen` (client-side) para
 * el motor único `lib/dilesa/cuadratura.ts`: mismos campos, misma semántica
 * (`fuente='cliente'` → directo cliente; adjunto `recibo_caja` → cuenta al
 * valor facturado; 4 buckets de descuento; apoyo Infonavit del catálogo de
 * tipos de crédito). Lo consumen los endpoints de la Fase 13 (revisión PLD y
 * cierre) para conocer `montoNotaCredito` sin confiar en un snapshot del
 * cliente — la NC es un control fiscal y se calcula del lado del servidor.
 *
 * IMPORTANTE: si cambia el armado de insumos en `useVentaResumen`, replicarlo
 * aquí (ambos alimentan `calcularCuadratura`, que es la fórmula compartida).
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import {
  calcularCuadratura,
  topeDescuentoAutorizado,
  type Cuadratura,
} from '@/lib/dilesa/cuadratura';

type VentaCuadraturaRow = {
  empresa_id: string;
  tipo_credito: string | null;
  unidad_id: string | null;
  precio_asignacion: number | null;
  valor_escrituracion: number | null;
  valor_facturado: number | null;
  monto_credito_titular: number | null;
  monto_credito_cotitular: number | null;
  monto_credito_directo: number | null;
  monto_detonado: number | null;
  monto_cheque_notaria: number | null;
  gastos_escrituracion: number | null;
  descuento_total: number | null;
  descuento_precio: number | null;
  descuento_equipamiento: number | null;
  descuento_gastos_escrituracion: number | null;
  descuento_nota_credito: number | null;
  promocion_id: string | null;
  coda_row_id: string | null;
  // Desglose (ADR-045). `productos_adicionales` (sobreprecio) ya existía y está
  // poblado; las otras 3 son del desglose nuevo (null en cerradas/legacy →
  // motor con fallback). Las 4 de geometría (20260618) congelan el premio del
  // lote de la Solicitud de Asignación.
  productos_adicionales: number | null;
  precio_base: number | null;
  incremento_credito: number | null;
  promocion_gastos_monto: number | null;
  valor_excedente_terreno: number | null;
  valor_frente_verde: number | null;
  valor_esquina: number | null;
  valor_venta_futuro: number | null;
};

/**
 * Devuelve la cuadratura calculada de la venta, o null si la venta no existe.
 * `sb` debe poder leer `dilesa.*` y `erp.*` (admin client en los endpoints).
 */
export async function cargarCuadraturaVenta(
  sb: SupabaseClient,
  ventaId: string
): Promise<Cuadratura | null> {
  const { data: vRow } = await sb
    .schema('dilesa')
    .from('ventas')
    .select(
      'empresa_id, tipo_credito, unidad_id, precio_asignacion, valor_escrituracion, valor_facturado, monto_credito_titular, monto_credito_cotitular, monto_credito_directo, monto_detonado, monto_cheque_notaria, gastos_escrituracion, descuento_total, descuento_precio, descuento_equipamiento, descuento_gastos_escrituracion, descuento_nota_credito, promocion_id, coda_row_id, productos_adicionales, precio_base, incremento_credito, promocion_gastos_monto, valor_excedente_terreno, valor_frente_verde, valor_esquina, valor_venta_futuro'
    )
    .eq('id', ventaId)
    .is('deleted_at', null)
    .maybeSingle();
  if (!vRow) return null;
  const venta = vRow as unknown as VentaCuadraturaRow;

  const [abonosRes, tcRes, unidadRes, promoRes] = await Promise.all([
    sb
      .schema('erp')
      .from('cxc_pagos')
      .select('id, monto_total, fuente')
      .eq('origen_tipo', 'venta_dilesa')
      .eq('origen_id', ventaId)
      .is('deleted_at', null),
    venta.tipo_credito
      ? sb
          .schema('dilesa')
          .from('tipos_credito')
          .select('apoyo_infonavit_monto')
          .eq('empresa_id', venta.empresa_id)
          .eq('nombre', venta.tipo_credito)
          .is('deleted_at', null)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    venta.unidad_id
      ? sb
          .schema('dilesa')
          .from('unidades')
          .select('proyecto_id')
          .eq('id', venta.unidad_id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    // Promoción de la solicitud → tope CONFIABLE de descuento autorizado.
    venta.promocion_id
      ? sb
          .schema('dilesa')
          .from('promociones')
          .select('monto')
          .eq('id', venta.promocion_id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const abonos = (abonosRes.data ?? []) as {
    id: string;
    monto_total: number | null;
    fuente: string | null;
  }[];

  // Recibos de caja por abono → cuentan al Valor Facturado del motor.
  let abonosConRecibo = new Set<string>();
  const abonoIds = abonos.map((a) => a.id);
  if (abonoIds.length > 0) {
    const { data: adjAbonos } = await sb
      .schema('erp')
      .from('adjuntos')
      .select('entidad_id')
      .eq('entidad_tipo', 'cxc_pago')
      .eq('rol', 'recibo_caja')
      .in('entidad_id', abonoIds);
    abonosConRecibo = new Set(
      ((adjAbonos ?? []) as { entidad_id: string }[]).map((a) => a.entidad_id)
    );
  }

  // ¿Ya hay CFDI de factura? Solo entonces `valor_facturado` es autoritativo
  // (un snapshot de Coda = valor de escrituración no es una factura real). Con
  // factura, la NC se deriva del facturado real — control fiscal de Fase 13.
  const { data: facturaAdj } = await sb
    .schema('erp')
    .from('adjuntos')
    .select('id')
    .eq('entidad_tipo', 'venta')
    .eq('entidad_id', ventaId)
    .eq('rol', 'factura_xml')
    .limit(1);
  const hayFactura = ((facturaAdj ?? []) as { id: string }[]).length > 0;

  let proyectoNombre: string | null = null;
  const proyectoId = (unidadRes.data as { proyecto_id: string | null } | null)?.proyecto_id ?? null;
  if (proyectoId) {
    const { data: prj } = await sb
      .schema('dilesa')
      .from('proyectos')
      .select('nombre')
      .eq('id', proyectoId)
      .maybeSingle();
    proyectoNombre = (prj as { nombre: string | null } | null)?.nombre ?? null;
  }

  return calcularCuadratura({
    valorEscrituracion: venta.valor_escrituracion,
    montoCreditoTitular: venta.monto_credito_titular,
    montoCreditoCotitular: venta.monto_credito_cotitular,
    montoCreditoDirecto: venta.monto_credito_directo,
    montoDetonado: venta.monto_detonado,
    montoChequeNotaria: venta.monto_cheque_notaria,
    gastosEscrituracion: venta.gastos_escrituracion,
    apoyoInfonavit: Number(
      (tcRes.data as { apoyo_infonavit_monto: number | null } | null)?.apoyo_infonavit_monto ?? 0
    ),
    // `descuento_total` es el monto autoritativo (amarre Sprint 1: los 4
    // buckets son desglose y suman al total vía la RPC). Leer el total — y no
    // la suma de buckets — evita que un descuento capturado en Formalizada
    // (total sin desglose) quede invisible al saldo.
    descuentoOtorgadoTotal: Number(venta.descuento_total) || 0,
    // Tope: promo si hay; nativa sin promo ⇒ 0; legacy sin promo ⇒ sin tope.
    descuentoMaximoAutorizado: topeDescuentoAutorizado(
      (promoRes.data as { monto: number | null } | null)?.monto,
      !!venta.coda_row_id
    ),
    precioAsignacion: venta.precio_asignacion,
    // Desglose (ADR-045): sobreprecio ← productos_adicionales (existente); base,
    // incremento y promoción ← columnas nuevas. Si el desglose está poblado, el
    // motor usa el modelo desglosado; si null, fallback al modelo viejo.
    precioBase: venta.precio_base,
    incrementoCredito: venta.incremento_credito,
    sobreprecioAdicionales: venta.productos_adicionales,
    promocionGastos: venta.promocion_gastos_monto,
    valorExcedenteTerreno: venta.valor_excedente_terreno,
    valorFrenteVerde: venta.valor_frente_verde,
    valorEsquina: venta.valor_esquina,
    valorVentaFuturo: venta.valor_venta_futuro,
    valorFacturadoReal: hayFactura ? venta.valor_facturado : null,
    depositos: abonos.map((a) => ({
      monto: a.monto_total,
      directoCliente: a.fuente === 'cliente',
      tieneRecibo: abonosConRecibo.has(a.id),
    })),
    proyectoNombre,
  });
}
