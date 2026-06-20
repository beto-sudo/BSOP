/**
 * Motor del reporte «Inventario disponible» (DILESA · Ventas) — ADR-047.
 *
 * Lista cada unidad vendible con su precio DESGLOSADO (base + excedente de
 * terreno + esquina + frente verde + venta futuro = total) — el mismo desglose
 * que el módulo Inventario, para cotizar de un vistazo. Pura y testeable.
 */
import type { UnidadDetalle } from './inventario-data';

export type FiltrosInventario = {
  proyecto: string;
  prototipo: string;
  caracteristica: '' | 'esquina' | 'frente_verde';
};

export const FILTROS_INVENTARIO_VACIOS: FiltrosInventario = {
  proyecto: '',
  prototipo: '',
  caracteristica: '',
};

export type InventarioResult = {
  /** Unidades filtradas, ordenadas por proyecto y luego identificador. */
  unidades: UnidadDetalle[];
  totalDisponibles: number;
  enConstruccion: number;
  terminadas: number;
  /** Suma de los precios totales (valor del inventario disponible). */
  valorTotal: number;
};

export function construirInventarioDisponible(
  unidades: readonly UnidadDetalle[],
  filtros: FiltrosInventario
): InventarioResult {
  const filtradas = unidades.filter((u) => {
    if (filtros.proyecto && u.proyectoNombre !== filtros.proyecto) return false;
    if (filtros.prototipo && u.prototipo !== filtros.prototipo) return false;
    if (filtros.caracteristica === 'esquina' && !u.esEsquina) return false;
    if (filtros.caracteristica === 'frente_verde' && !u.tieneFrenteVerde) return false;
    return true;
  });

  const lista = [...filtradas].sort(
    (a, b) =>
      a.proyectoNombre.localeCompare(b.proyectoNombre, 'es') ||
      a.identificadorCompleto.localeCompare(b.identificadorCompleto, 'es')
  );

  return {
    unidades: lista,
    totalDisponibles: lista.length,
    enConstruccion: lista.filter((u) => u.estado === 'en_construccion').length,
    terminadas: lista.filter((u) => u.estado === 'terminada').length,
    valorTotal: lista.reduce((acc, u) => acc + (u.precio.total ?? 0), 0),
  };
}
