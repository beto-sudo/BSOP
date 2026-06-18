'use client';

/**
 * useVentaResumen — carga client-side del resumen de una venta para la
 * cabecera del Expediente de Operación (`<OperacionResumen>`), reusable
 * fuera del expediente.
 *
 * Remate post-cierre de `dilesa-ventas-expediente`: las páginas de captura
 * de fase mostraban solo cliente + identificador ("captura a ciegas", el
 * bullet #1 del problema de la iniciativa). Este hook les da la misma
 * cabecera del expediente — cliente/vivienda/comercial/mini-cuadratura —
 * sin tocar los 17 formularios (lo monta `<CapturarFaseHeader>`).
 *
 * El cálculo financiero usa el motor único `lib/dilesa/cuadratura.ts` con
 * los MISMOS insumos que el expediente (abonos CxC, apoyo Infonavit del
 * catálogo de tipos de crédito, 4 buckets de descuento, recibos de caja).
 *
 * Scope vendedor: si el usuario es vendedor puro y la venta no es suya,
 * devuelve `forbidden` y el caller no renderiza datos (paridad con el
 * gate del expediente, #812).
 */

import { useEffect, useMemo, useState } from 'react';
import { createSupabaseBrowserClient } from '@/lib/supabase-browser';
import { getSupabaseErrorMessage } from '@/lib/supabase-error';
import { calcularCuadratura, topeDescuentoAutorizado } from '@/lib/dilesa/cuadratura';
import { FASES_PIPELINE } from '@/lib/dilesa/captura/marcar-fase';
import { useScopeVendedorDilesa } from '@/lib/dilesa/use-scope-vendedor';
import { getNotaria } from '@/lib/dilesa/notarios';
import type { OperacionResumenProps } from '@/components/dilesa/operacion-resumen';

/** Datos extra de fases previas, útiles como contexto de captura (F11+). */
export type VentaResumenExtras = {
  fechaFirmaProgramada: string | null;
  notarioNombre: string | null;
};

export type VentaResumenState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'forbidden' }
  | { status: 'ready'; props: OperacionResumenProps; extras: VentaResumenExtras };

type VentaRow = {
  id: string;
  empresa_id: string;
  persona_id: string;
  unidad_id: string | null;
  vendedor_usuario_id: string | null;
  vendedor: string | null;
  notario: string | null;
  notario_id: string | null;
  fase_actual: string | null;
  fase_posicion: number | null;
  tipo_credito: string | null;
  precio_asignacion: number | null;
  valor_escrituracion: number | null;
  // Desglose (ADR-045): productos_adicionales (sobreprecio, existente) + las 3
  // nuevas + las 4 de geometría del lote (20260618).
  productos_adicionales: number | null;
  precio_base: number | null;
  incremento_credito: number | null;
  promocion_gastos_monto: number | null;
  valor_excedente_terreno: number | null;
  valor_frente_verde: number | null;
  valor_esquina: number | null;
  valor_venta_futuro: number | null;
  valor_facturado: number | null;
  monto_credito_titular: number | null;
  monto_credito_cotitular: number | null;
  monto_credito_directo: number | null;
  monto_cheque_notaria: number | null;
  gastos_escrituracion: number | null;
  descuento_total: number | null;
  descuento_precio: number | null;
  descuento_equipamiento: number | null;
  descuento_gastos_escrituracion: number | null;
  descuento_nota_credito: number | null;
  promocion_id: string | null;
  coda_row_id: string | null;
  fecha_firma_programada: string | null;
  /** INE capturado en el KYC de la venta (fallback si la persona no lo trae). */
  ine_numero: string | null;
};

export function useVentaResumen(ventaId: string | null): VentaResumenState {
  const sb = useMemo(() => createSupabaseBrowserClient(), []);
  const scope = useScopeVendedorDilesa();
  const [state, setState] = useState<VentaResumenState>({ status: 'loading' });

  useEffect(() => {
    if (!ventaId || scope.loading) return;
    let activo = true;
    // Sin reset síncrono a 'loading' (la regla react-hooks lo prohíbe en el
    // cuerpo del effect): el estado inicial ya es loading y las páginas de
    // captura remontan al cambiar de venta (la URL trae el id).

    (async () => {
      const { data: vRow, error: vErr } = await sb
        .schema('dilesa')
        .from('ventas')
        .select(
          'id, empresa_id, persona_id, unidad_id, vendedor_usuario_id, vendedor, notario, notario_id, fase_actual, fase_posicion, tipo_credito, precio_asignacion, valor_escrituracion, valor_facturado, monto_credito_titular, monto_credito_cotitular, monto_credito_directo, monto_cheque_notaria, gastos_escrituracion, descuento_total, descuento_precio, descuento_equipamiento, descuento_gastos_escrituracion, descuento_nota_credito, promocion_id, coda_row_id, fecha_firma_programada, ine_numero, productos_adicionales, precio_base, incremento_credito, promocion_gastos_monto, valor_excedente_terreno, valor_frente_verde, valor_esquina, valor_venta_futuro'
        )
        .eq('id', ventaId)
        .is('deleted_at', null)
        .maybeSingle();
      if (!activo) return;
      if (vErr) {
        setState({
          status: 'error',
          message: getSupabaseErrorMessage(vErr, 'No se pudo cargar el resumen de la venta.'),
        });
        return;
      }
      if (!vRow) {
        setState({ status: 'error', message: 'Venta no encontrada.' });
        return;
      }
      const venta = vRow as unknown as VentaRow;

      if (scope.soloVendedor && venta.vendedor_usuario_id !== scope.userId) {
        setState({ status: 'forbidden' });
        return;
      }

      const [pRes, uRes, abonosRes, tcRes, vendRes, notRes, promoRes] = await Promise.all([
        sb
          .schema('erp')
          .from('personas')
          .select(
            'nombre, apellido_paterno, apellido_materno, telefono, email, curp, numero_credencial_ine'
          )
          .eq('id', venta.persona_id)
          .maybeSingle(),
        venta.unidad_id
          ? sb
              .schema('dilesa')
              .from('unidades')
              .select(
                'identificador, proyecto_id, producto_id, manzana, numero_lote, calle, numero_oficial'
              )
              .eq('id', venta.unidad_id)
              .maybeSingle()
          : Promise.resolve({ data: null, error: null }),
        sb
          .schema('erp')
          .from('cxc_pagos')
          .select('id, monto_total, fuente')
          .eq('origen_tipo', 'venta_dilesa')
          .eq('origen_id', venta.id)
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
          : Promise.resolve({ data: null, error: null }),
        venta.vendedor_usuario_id
          ? sb
              .schema('core')
              .from('usuarios')
              .select('first_name, last_name')
              .eq('id', venta.vendedor_usuario_id)
              .maybeSingle()
          : Promise.resolve({ data: null, error: null }),
        // Notaría desde el catálogo de proveedores (categoria='notaria').
        venta.notario_id ? getNotaria(sb, venta.notario_id) : Promise.resolve(null),
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
      if (!activo) return;

      const unidad = uRes.data as {
        identificador: string | null;
        proyecto_id: string | null;
        producto_id: string | null;
        manzana: string | null;
        numero_lote: string | null;
        calle: string | null;
        numero_oficial: string | null;
      } | null;
      const abonos = (abonosRes.data ?? []) as {
        id: string;
        monto_total: number;
        fuente: string | null;
      }[];

      // Recibos de caja por abono (cuentan al Valor Facturado del motor).
      const abonoIds = abonos.map((a) => a.id);
      let abonosConRecibo = new Set<string>();
      if (abonoIds.length > 0) {
        const { data: adjAbonos } = await sb
          .schema('erp')
          .from('adjuntos')
          .select('entidad_id, rol')
          .eq('entidad_tipo', 'cxc_pago')
          .eq('rol', 'recibo_caja')
          .in('entidad_id', abonoIds);
        if (!activo) return;
        abonosConRecibo = new Set(
          ((adjAbonos ?? []) as { entidad_id: string }[]).map((a) => a.entidad_id)
        );
      }

      // ¿Ya hay CFDI de factura? Solo entonces `valor_facturado` es el real (y
      // la NC se deriva de él); si no, el motor cae al estimado de la fórmula.
      const { data: facturaAdj } = await sb
        .schema('erp')
        .from('adjuntos')
        .select('id')
        .eq('entidad_tipo', 'venta')
        .eq('entidad_id', venta.id)
        .eq('rol', 'factura_xml')
        .limit(1);
      if (!activo) return;
      const hayFactura = ((facturaAdj ?? []) as { id: string }[]).length > 0;

      const [prjRes, prodRes] = await Promise.all([
        unidad?.proyecto_id
          ? sb
              .schema('dilesa')
              .from('proyectos')
              .select('nombre')
              .eq('id', unidad.proyecto_id)
              .maybeSingle()
          : Promise.resolve({ data: null, error: null }),
        unidad?.producto_id
          ? sb
              .schema('dilesa')
              .from('productos')
              .select('nombre')
              .eq('id', unidad.producto_id)
              .maybeSingle()
          : Promise.resolve({ data: null, error: null }),
      ]);
      if (!activo) return;

      const persona = pRes.data as {
        nombre: string | null;
        apellido_paterno: string | null;
        apellido_materno: string | null;
        telefono: string | null;
        email: string | null;
        curp: string | null;
        numero_credencial_ine: string | null;
      } | null;
      const proyectoNombre = (prjRes.data?.nombre as string | null) ?? null;
      const prototipoNombre = (prodRes.data?.nombre as string | null) ?? null;

      const cuadratura = calcularCuadratura({
        valorEscrituracion: venta.valor_escrituracion,
        montoCreditoTitular: venta.monto_credito_titular,
        montoCreditoCotitular: venta.monto_credito_cotitular,
        montoCreditoDirecto: venta.monto_credito_directo,
        montoChequeNotaria: venta.monto_cheque_notaria,
        gastosEscrituracion: venta.gastos_escrituracion,
        apoyoInfonavit: Number(
          (tcRes.data as { apoyo_infonavit_monto: number | null } | null)?.apoyo_infonavit_monto ??
            0
        ),
        // `descuento_total` autoritativo (amarre Sprint 1): los buckets son
        // desglose y suman al total vía la RPC. Leer el total evita que un
        // descuento capturado sin desglose (Formalizada) quede invisible.
        descuentoOtorgadoTotal: Number(venta.descuento_total) || 0,
        // Tope: promo si hay; nativa sin promo ⇒ 0; legacy sin promo ⇒ sin tope.
        descuentoMaximoAutorizado: topeDescuentoAutorizado(
          (promoRes.data as { monto: number | null } | null)?.monto,
          !!venta.coda_row_id
        ),
        precioAsignacion: venta.precio_asignacion,
        // Desglose (ADR-045): sobreprecio ← productos_adicionales (existente).
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

      const clienteNombre =
        [persona?.nombre, persona?.apellido_paterno, persona?.apellido_materno]
          .filter(Boolean)
          .join(' ')
          .trim() || '(sin nombre)';
      const vendedorUsuario = vendRes.data as {
        first_name: string | null;
        last_name: string | null;
      } | null;
      const vendedorNombre =
        [vendedorUsuario?.first_name, vendedorUsuario?.last_name]
          .filter(Boolean)
          .join(' ')
          .trim() || venta.vendedor;
      // Fallback a venta.notario (texto legacy de Coda) si no hay FK.
      const notarioNombre = notRes
        ? (notRes.numeroNotaria ? `Notaría ${notRes.numeroNotaria} — ` : '') + notRes.nombre
        : venta.notario;

      const mzLote =
        [
          unidad?.manzana ? `Mz ${unidad.manzana}` : null,
          unidad?.numero_lote ? `Lote ${unidad.numero_lote}` : null,
        ]
          .filter(Boolean)
          .join(' · ') || null;
      const domicilio =
        [unidad?.calle, unidad?.numero_oficial].filter(Boolean).join(' #').toUpperCase() || null;

      setState({
        status: 'ready',
        props: {
          cliente: {
            nombre: clienteNombre,
            contacto: [persona?.telefono, persona?.email].filter(Boolean).join(' · ') || null,
            curp: persona?.curp ?? null,
            // INE de la persona; fallback al capturado en el KYC de la venta
            // (las migradas de Coda suelen traerlo solo ahí).
            ine: persona?.numero_credencial_ine ?? venta.ine_numero ?? null,
          },
          vivienda: {
            proyecto: proyectoNombre,
            mzLote,
            prototipo: prototipoNombre,
            domicilio,
            identificador: unidad?.identificador ?? null,
          },
          precioAsignacion: venta.precio_asignacion,
          valorEscrituracion: venta.valor_escrituracion,
          vendedor: vendedorNombre,
          faseActual: venta.fase_actual,
          fasePosicion: venta.fase_posicion,
          totalFases: FASES_PIPELINE.length,
          cuadratura,
        },
        extras: {
          fechaFirmaProgramada: venta.fecha_firma_programada,
          notarioNombre,
        },
      });
    })();

    return () => {
      activo = false;
    };
  }, [ventaId, sb, scope.loading, scope.soloVendedor, scope.userId]);

  return state;
}
