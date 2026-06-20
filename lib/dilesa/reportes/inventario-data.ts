/**
 * Tipos + normalización de datos de Inventario para reportes (ADR-047).
 *
 * Módulo PURO. El reporte de inventario disponible usa el MISMO criterio que el
 * módulo Inventario (`components/dilesa/inventario-module.tsx`): unidades
 * vendibles hoy = `estado IN ('en_construccion','terminada')`, `activo_id IS NULL`
 * y `es_muestra = false`. Cada unidad trae su precio DESGLOSADO (precio base +
 * excedente de terreno + esquina + frente verde + venta futuro = total), igual
 * que en el módulo Inventario, calculado con la RPC `fn_calcular_precio_venta`.
 */

export type UnidadRaw = {
  id: string;
  identificador: string;
  area_m2: number | null;
  m2_construccion: number | null;
  es_esquina: boolean | null;
  tiene_frente_verde: boolean | null;
  estado: string;
  proyecto_id: string | null;
  producto_id: string | null;
};

/** Desglose de precio devuelto por `fn_calcular_precio_venta` (sin crédito). */
export type PrecioDesglose = {
  base: number | null;
  excedente: number | null;
  esquina: number | null;
  frenteVerde: number | null;
  ventaFuturo: number | null;
  total: number | null;
};

export const PRECIO_VACIO: PrecioDesglose = {
  base: null,
  excedente: null,
  esquina: null,
  frenteVerde: null,
  ventaFuturo: null,
  total: null,
};

export type UnidadDetalle = {
  id: string;
  identificador: string;
  /** Identificador con sufijo de prototipo (ej. `M3-L9-LDLE-ISC`). */
  identificadorCompleto: string;
  estado: string;
  proyectoId: string | null;
  proyectoNombre: string;
  prototipo: string | null;
  areaM2: number | null;
  m2Construccion: number | null;
  esEsquina: boolean;
  tieneFrenteVerde: boolean;
  precio: PrecioDesglose;
};

export type UnidadesBundle = {
  unidades: readonly UnidadRaw[];
  proyectos: ReadonlyArray<{ id: string; nombre: string }>;
  productos: ReadonlyArray<{ id: string; nombre: string }>;
  /** Precio desglosado por unidad (de `fn_calcular_precio_venta`). */
  precios: ReadonlyMap<string, PrecioDesglose>;
};

export const UNIDADES_DISPONIBLES_SELECT =
  'id, identificador, area_m2, m2_construccion, es_esquina, tiene_frente_verde, estado, proyecto_id, producto_id';
export const ESTADOS_DISPONIBLES = ['en_construccion', 'terminada'] as const;

export function normalizarUnidades(b: UnidadesBundle): UnidadDetalle[] {
  const proyectoMap = new Map(b.proyectos.map((p) => [p.id, p.nombre]));
  const productoMap = new Map(b.productos.map((p) => [p.id, p.nombre]));
  return b.unidades.map((u) => {
    const proto = u.producto_id ? (productoMap.get(u.producto_id) ?? null) : null;
    const protoSufijo = proto ? proto.split('-').pop() : null;
    return {
      id: u.id,
      identificador: u.identificador,
      identificadorCompleto: protoSufijo ? `${u.identificador}-${protoSufijo}` : u.identificador,
      estado: u.estado,
      proyectoId: u.proyecto_id,
      proyectoNombre: u.proyecto_id ? (proyectoMap.get(u.proyecto_id) ?? '') : '',
      prototipo: proto,
      areaM2: u.area_m2,
      m2Construccion: u.m2_construccion,
      esEsquina: !!u.es_esquina,
      tieneFrenteVerde: !!u.tiene_frente_verde,
      precio: b.precios.get(u.id) ?? PRECIO_VACIO,
    };
  });
}

/** Parsea el JSON de `fn_calcular_precio_venta` a un `PrecioDesglose`. */
export function parsePrecioDesglose(json: unknown): PrecioDesglose {
  const j = (json ?? {}) as {
    valor_comercial?: number;
    valor_excedente_terreno?: number;
    valor_esquina?: number;
    valor_frente_verde?: number;
    valor_venta_futuro?: number;
    precio_venta_total?: number;
    error?: string;
  };
  if (j.error) return PRECIO_VACIO;
  return {
    base: j.valor_comercial ?? null,
    excedente: j.valor_excedente_terreno ?? null,
    esquina: j.valor_esquina ?? null,
    frenteVerde: j.valor_frente_verde ?? null,
    ventaFuturo: j.valor_venta_futuro ?? null,
    total: j.precio_venta_total ?? null,
  };
}

export function proyectosDeUnidades(unidades: readonly UnidadDetalle[]): string[] {
  return [...new Set(unidades.map((u) => u.proyectoNombre).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b, 'es')
  );
}

export function prototiposDeUnidades(unidades: readonly UnidadDetalle[]): string[] {
  return [...new Set(unidades.map((u) => u.prototipo).filter((p): p is string => !!p))].sort(
    (a, b) => a.localeCompare(b, 'es')
  );
}
