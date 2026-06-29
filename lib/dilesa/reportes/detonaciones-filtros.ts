/**
 * Parseo + descripción legible de los filtros del reporte de detonaciones.
 * Compartido por las rutas de PDF y CSV (server) para no duplicar la lógica.
 * Puro (sin Supabase ni React).
 */
import { etiquetaFuente, normalizarFuente, type FuenteDeposito } from './detonaciones-data';
import type { FiltrosDetonaciones } from './detonaciones';

/** Lee los filtros desde los query params de la request. */
export function parseFiltrosDetonaciones(params: URLSearchParams): FiltrosDetonaciones {
  const fuenteRaw = params.get('fuente') ?? '';
  const fuente: '' | FuenteDeposito = fuenteRaw === '' ? '' : normalizarFuente(fuenteRaw);
  return {
    desde: params.get('desde') ?? '',
    hasta: params.get('hasta') ?? '',
    fuente,
    proyecto: params.get('proyecto') ?? '',
  };
}

/** Descripción legible del rango + filtros activos para el encabezado del PDF. */
export function filtrosTextoDetonaciones(
  filtros: FiltrosDetonaciones,
  proyectoNombre: Map<string, string>
): string {
  const rango =
    filtros.desde && filtros.hasta
      ? `Del ${filtros.desde} al ${filtros.hasta}`
      : filtros.desde
        ? `Desde ${filtros.desde}`
        : filtros.hasta
          ? `Hasta ${filtros.hasta}`
          : null;
  const partes = [
    rango,
    filtros.fuente ? `Origen: ${etiquetaFuente(filtros.fuente)}` : null,
    filtros.proyecto
      ? `Proyecto: ${proyectoNombre.get(filtros.proyecto) ?? filtros.proyecto}`
      : null,
  ].filter(Boolean);
  return partes.length > 0 ? partes.join(' · ') : 'Todos los depósitos';
}
