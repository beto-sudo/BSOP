'use client';

import { createSupabaseBrowserClient } from '@/lib/supabase-browser';
import { RDB_EMPRESA_ID } from '@/lib/empresa-constants';

/**
 * Capa de acceso del POS (ADR-056): toda escritura pasa por las RPCs
 * `rdb.fn_pos_*` con idempotencia por `client_action_id`. La UI nunca
 * calcula totales — muestra lo que el servidor persiste.
 */

export type Estacion = {
  id: string;
  nombre: string;
  tipo: 'mostrador' | 'tablet' | 'kds';
  activa: boolean;
};

export type ProductoVenta = {
  id: string;
  nombre: string;
  categoriaId: string | null;
  categoriaNombre: string;
  precio: number;
  vaACocina: boolean;
};

export type Zona = {
  id: string;
  nombre: string;
  orden: number;
  activa: boolean;
};

export type CuentaAbierta = {
  id: string;
  folio: number | null;
  ubicacion: string | null;
  estado: string;
  tipo_venta: string;
  total: number;
  abierta_at: string;
  notas: string | null;
};

export type ItemCuenta = {
  id: string;
  producto_nombre: string;
  cantidad: number;
  precio_unitario: number;
  descuento_pct: number;
  estado: string;
  va_a_cocina: boolean;
};

export type CartLine = {
  producto: ProductoVenta;
  cantidad: number;
  descuentoPct: number;
  descuentoRazon?: string;
  notas?: string; // "sin pepinillos, sin mayonesa" — viaja al KDS
};

export type PagoInput = {
  metodo: 'efectivo' | 'tarjeta' | 'transferencia' | 'cortesia';
  monto: number;
  propina?: number;
  recibido?: number;
  referencia?: string;
};

const supabase = () => createSupabaseBrowserClient();

export async function fetchEstaciones(): Promise<Estacion[]> {
  const { data, error } = await supabase()
    .schema('rdb')
    .from('pos_estaciones')
    .select('id, nombre, tipo, activa')
    .eq('empresa_id', RDB_EMPRESA_ID)
    .eq('activa', true)
    .order('nombre');
  if (error) throw error;
  return (data ?? []) as Estacion[];
}

export async function fetchZonas(): Promise<Zona[]> {
  const { data, error } = await supabase()
    .schema('rdb')
    .from('pos_zonas')
    .select('id, nombre, orden, activa')
    .eq('empresa_id', RDB_EMPRESA_ID)
    .eq('activa', true)
    .order('orden');
  if (error) throw error;
  return (data ?? []) as Zona[];
}

/** Catálogo vendible: productos activos con precio vigente + flag cocina. */
export async function fetchCatalogo(): Promise<ProductoVenta[]> {
  const sb = supabase();
  const [productos, categorias, precios] = await Promise.all([
    sb
      .schema('erp')
      .from('productos')
      .select('id, nombre, categoria_id, va_a_cocina, activo, deleted_at')
      .eq('empresa_id', RDB_EMPRESA_ID)
      .eq('activo', true)
      .is('deleted_at', null),
    sb
      .schema('erp')
      .from('categorias_producto')
      .select('id, nombre, va_a_cocina')
      .eq('empresa_id', RDB_EMPRESA_ID),
    sb
      .schema('erp')
      .from('productos_precios')
      .select('producto_id, precio_venta, fecha_inicio')
      .eq('empresa_id', RDB_EMPRESA_ID)
      .eq('vigente', true)
      .order('fecha_inicio', { ascending: false }),
  ]);
  if (productos.error) throw productos.error;
  if (categorias.error) throw categorias.error;
  if (precios.error) throw precios.error;

  const catById = new Map((categorias.data ?? []).map((c) => [c.id, c]));
  const precioByProducto = new Map<string, number>();
  for (const p of precios.data ?? []) {
    // Vienen ordenados por fecha_inicio DESC: el primero por producto gana.
    // Sin precio real (> 0) el producto NO es vendible — no aparece en captura.
    if (
      p.precio_venta != null &&
      Number(p.precio_venta) > 0 &&
      !precioByProducto.has(p.producto_id)
    ) {
      precioByProducto.set(p.producto_id, Number(p.precio_venta));
    }
  }

  return (productos.data ?? [])
    .filter((p) => precioByProducto.has(p.id))
    .map((p) => {
      const cat = p.categoria_id ? catById.get(p.categoria_id) : undefined;
      return {
        id: p.id,
        nombre: p.nombre,
        categoriaId: p.categoria_id,
        categoriaNombre: cat?.nombre ?? 'Sin categoría',
        precio: precioByProducto.get(p.id)!,
        vaACocina: p.va_a_cocina ?? cat?.va_a_cocina ?? false,
      };
    })
    .sort(
      (a, b) =>
        a.categoriaNombre.localeCompare(b.categoriaNombre) || a.nombre.localeCompare(b.nombre)
    );
}

export async function fetchCuentasAbiertas(): Promise<CuentaAbierta[]> {
  const { data, error } = await supabase()
    .schema('rdb')
    .from('pos_cuentas')
    .select('id, folio, ubicacion, estado, tipo_venta, total, abierta_at, notas')
    .eq('empresa_id', RDB_EMPRESA_ID)
    .in('estado', ['abierta', 'en_cobro'])
    .order('abierta_at', { ascending: true });
  if (error) throw error;
  return (data ?? []).map((c) => ({ ...c, total: Number(c.total) }));
}

export async function fetchItemsCuenta(cuentaId: string): Promise<ItemCuenta[]> {
  const { data, error } = await supabase()
    .schema('rdb')
    .from('pos_items')
    .select('id, producto_nombre, cantidad, precio_unitario, descuento_pct, estado, va_a_cocina')
    .eq('cuenta_id', cuentaId)
    .order('created_at');
  if (error) throw error;
  return (data ?? []).map((i) => ({
    ...i,
    cantidad: Number(i.cantidad),
    precio_unitario: Number(i.precio_unitario),
    descuento_pct: Number(i.descuento_pct),
  }));
}

export async function rpcAbrirCuenta(args: {
  estacionId: string;
  pin: string;
  clientActionId: string;
  ubicacion?: string;
  tipoVenta?: 'normal' | 'empleado' | 'cortesia';
}): Promise<string> {
  const { data, error } = await supabase()
    .schema('rdb')
    .rpc('fn_pos_abrir_cuenta', {
      p_estacion_id: args.estacionId,
      p_pin: args.pin,
      p_client_action_id: args.clientActionId,
      p_ubicacion: args.ubicacion ?? undefined,
      p_tipo_venta: args.tipoVenta ?? 'normal',
    });
  if (error) throw error;
  return data as string;
}

export async function rpcAgregarRonda(args: {
  cuentaId: string;
  pin: string;
  clientActionId: string;
  lines: CartLine[];
  pinAutorizador?: string;
}): Promise<void> {
  const { error } = await supabase()
    .schema('rdb')
    .rpc('fn_pos_agregar_ronda', {
      p_cuenta_id: args.cuentaId,
      p_pin: args.pin,
      p_client_action_id: args.clientActionId,
      p_items: args.lines.map((l) => ({
        producto_id: l.producto.id,
        cantidad: l.cantidad,
        descuento_pct: l.descuentoPct || undefined,
        descuento_razon: l.descuentoRazon || undefined,
        notas: l.notas || undefined,
      })),
      p_pin_autorizador: args.pinAutorizador ?? undefined,
    });
  if (error) throw error;
}

export async function rpcEnviarCocina(args: {
  cuentaId: string;
  pin: string;
  clientActionId: string;
}): Promise<void> {
  const { error } = await supabase().schema('rdb').rpc('fn_pos_enviar_cocina', {
    p_cuenta_id: args.cuentaId,
    p_pin: args.pin,
    p_client_action_id: args.clientActionId,
  });
  if (error) throw error;
}

export async function rpcCobrar(args: {
  cuentaId: string;
  pin: string;
  clientActionId: string;
  pagos: PagoInput[];
}): Promise<void> {
  const { error } = await supabase()
    .schema('rdb')
    .rpc('fn_pos_cobrar', {
      p_cuenta_id: args.cuentaId,
      p_pin: args.pin,
      p_client_action_id: args.clientActionId,
      p_pagos: args.pagos.map((p) => ({
        metodo: p.metodo,
        monto: p.monto,
        propina: p.propina ?? 0,
        recibido: p.recibido ?? undefined,
        referencia: p.referencia ?? undefined,
      })),
    });
  if (error) throw error;
}

export async function rpcVoidItem(args: {
  itemId: string;
  pin: string;
  razon: string;
  clientActionId: string;
  pinAutorizador?: string;
}): Promise<void> {
  const { error } = await supabase()
    .schema('rdb')
    .rpc('fn_pos_void_item', {
      p_item_id: args.itemId,
      p_pin: args.pin,
      p_razon: args.razon,
      p_client_action_id: args.clientActionId,
      p_pin_autorizador: args.pinAutorizador ?? undefined,
    });
  if (error) throw error;
}

export async function rpcCancelarCuenta(args: {
  cuentaId: string;
  pin: string;
  razon: string;
  clientActionId: string;
  pinAutorizador?: string;
}): Promise<void> {
  const { error } = await supabase()
    .schema('rdb')
    .rpc('fn_pos_cancelar_cuenta', {
      p_cuenta_id: args.cuentaId,
      p_pin: args.pin,
      p_razon: args.razon,
      p_client_action_id: args.clientActionId,
      p_pin_autorizador: args.pinAutorizador ?? undefined,
    });
  if (error) throw error;
}

export async function rpcNotaCuenta(args: {
  cuentaId: string;
  pin: string;
  nota: string;
  clientActionId: string;
}): Promise<void> {
  const { error } = await supabase().schema('rdb').rpc('fn_pos_nota_cuenta', {
    p_cuenta_id: args.cuentaId,
    p_pin: args.pin,
    p_nota: args.nota,
    p_client_action_id: args.clientActionId,
  });
  if (error) throw error;
}

export async function rpcMoverCuenta(args: {
  cuentaId: string;
  pin: string;
  ubicacion: string;
  clientActionId: string;
}): Promise<void> {
  const { error } = await supabase().schema('rdb').rpc('fn_pos_mover_cuenta', {
    p_cuenta_id: args.cuentaId,
    p_pin: args.pin,
    p_ubicacion: args.ubicacion,
    p_client_action_id: args.clientActionId,
  });
  if (error) throw error;
}

export async function rpcKdsMarcar(args: {
  itemId: string;
  nuevoEstado: 'en_cocina' | 'listo' | 'entregado';
  clientActionId: string;
}): Promise<void> {
  const { error } = await supabase().schema('rdb').rpc('fn_pos_kds_marcar', {
    p_item_id: args.itemId,
    p_nuevo_estado: args.nuevoEstado,
    p_client_action_id: args.clientActionId,
  });
  if (error) throw error;
}
