/**
 * Tipos y helpers de presentación del módulo RUV (Registro Único de Vivienda).
 * Iniciativa `dilesa-ruv` · Sprint 3 (UI).
 *
 * Plano (sin React) para reuso entre el módulo, el drawer y tests.
 */

import type { BadgeTone } from '@/components/ui/badge';

/** Una fila del listado: oferta (frente) + métricas de avance derivadas. */
export type RuvFrenteRow = {
  id: string;
  nombre: string;
  idOferta: number | null;
  idOrden: number | null;
  fechaInicio: string | null;
  fechaFin: string | null;
  viviendasOferta: number | null;
  proyectoId: string | null;
  proyectoNombre: string;
  // Métricas derivadas (vista dilesa.v_ruv_frente_avance).
  lotes: number; // lotes ligados al frente (con y sin construcción)
  viviendas: number; // viviendas en construcción ligadas al frente
  cuvsEmitidos: number;
  conDtu: number;
  conSeguroCalidad: number;
  conPaqueteRuv: number;
  documentosPendientes: number;
  pctPaqueteRuv: number | null; // 0–100
};

/** Tipo de documento del catálogo RUV. */
export type RuvDocCatalogo = {
  id: string;
  nombre: string;
  orden: number | null;
};

/** Estado de un documento para un frente concreto. */
export type RuvFrenteDocEstado = 'cargado' | 'pendiente';

export type RuvFrenteDoc = {
  documentoCatalogoId: string;
  estado: RuvFrenteDocEstado;
  fechaCarga: string | null;
};

/** Avance de paquete RUV (0–100) → tono del badge. */
export function avanceTone(pct: number | null): BadgeTone {
  if (pct == null) return 'neutral';
  if (pct >= 100) return 'success';
  if (pct >= 50) return 'info';
  if (pct > 0) return 'warning';
  return 'neutral';
}

/** Etiqueta corta de avance. */
export function avanceLabel(pct: number | null): string {
  if (pct == null) return 'Sin viviendas';
  return `${Math.round(pct)}%`;
}

/** Tono del badge de documentos pendientes (entre menos, mejor). */
export function docsPendientesTone(pendientes: number): BadgeTone {
  if (pendientes === 0) return 'success';
  if (pendientes <= 5) return 'warning';
  return 'danger';
}
