/**
 * Parseo + descripción legible de los filtros del reporte «Ventas por fase».
 * Compartido por las rutas de PDF y CSV (server) para no duplicar la lógica.
 * Puro (sin Supabase ni React).
 */
import { nombreFase } from '@/lib/dilesa/fases';
import { POSICION_DEFAULT, POSICION_TODAS, type FiltrosVentasPorFase } from './ventas-por-fase';

/** Lee los filtros desde los query params de la request. */
export function parseFiltrosVentasPorFase(params: URLSearchParams): FiltrosVentasPorFase {
  const posRaw = params.get('posicion');
  const pos = posRaw === null ? POSICION_DEFAULT : Number(posRaw);
  return {
    posicion: Number.isFinite(pos) ? pos : POSICION_DEFAULT,
    desde: params.get('desde') ?? '',
    hasta: params.get('hasta') ?? '',
    proyecto: params.get('proyecto') ?? '',
  };
}

/** Etiqueta legible de la fase seleccionada. */
export function etiquetaFaseFiltro(posicion: number): string {
  return posicion === POSICION_TODAS
    ? 'Todas las fases'
    : `Fase ${posicion} · ${nombreFase(posicion)}`;
}

/** Descripción legible del rango + filtros activos para el encabezado del PDF. */
export function filtrosTextoVentasPorFase(
  filtros: FiltrosVentasPorFase,
  proyectoNombre: Map<string, string>
): string {
  const rango =
    filtros.desde && filtros.hasta
      ? `Del ${filtros.desde} al ${filtros.hasta}`
      : filtros.desde
        ? `Desde ${filtros.desde}`
        : filtros.hasta
          ? `Hasta ${filtros.hasta}`
          : 'Todo el histórico';
  const partes = [
    etiquetaFaseFiltro(filtros.posicion),
    rango,
    filtros.proyecto
      ? `Proyecto: ${proyectoNombre.get(filtros.proyecto) ?? filtros.proyecto}`
      : null,
  ].filter(Boolean);
  return partes.join(' · ');
}
