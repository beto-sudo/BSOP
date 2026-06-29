/**
 * Loader server-side del reporte «Ventas por fase» para las rutas de PDF/CSV
 * (ADR-047). Espejo del fetch del hook del browser, con
 * `createSupabaseServerClient` (sesión + RLS empresa-scoped) y la misma
 * normalización pura. Solo lo importan route handlers (server).
 */
import { createSupabaseServerClient } from '@/lib/supabase-server';
import { DILESA_EMPRESA_ID } from '@/lib/empresa-constants';
import {
  normalizarVentasPorFase,
  VENTA_FASES_SELECT,
  VENTAS_FASE_SELECT,
  type VentaFaseRaw,
  type VentaFaseReporteRow,
  type VentasPorFaseRawBundle,
  type VentaFaseVentaRaw,
} from './ventas-por-fase-data';

export async function cargarVentasPorFaseServer(): Promise<{
  filas: VentaFaseReporteRow[];
  proyectoNombre: Map<string, string>;
  error?: string;
}> {
  const sb = await createSupabaseServerClient();
  const [fasesRes, ventasRes, unidadesRes, prjRes, personasRes] = await Promise.all([
    sb
      .schema('dilesa')
      .from('venta_fases')
      .select(VENTA_FASES_SELECT)
      .eq('empresa_id', DILESA_EMPRESA_ID)
      .is('deleted_at', null),
    sb
      .schema('dilesa')
      .from('ventas')
      .select(VENTAS_FASE_SELECT)
      .eq('empresa_id', DILESA_EMPRESA_ID)
      .is('deleted_at', null),
    sb
      .schema('dilesa')
      .from('unidades')
      .select('id, identificador, proyecto_id')
      .eq('empresa_id', DILESA_EMPRESA_ID),
    sb
      .schema('dilesa')
      .from('proyectos')
      .select('id, nombre')
      .eq('empresa_id', DILESA_EMPRESA_ID)
      .is('deleted_at', null),
    sb
      .schema('erp')
      .from('personas')
      .select('id, nombre, apellido_paterno, apellido_materno')
      .eq('empresa_id', DILESA_EMPRESA_ID)
      .eq('tipo', 'cliente'),
  ]);

  const firstErr =
    fasesRes.error ?? ventasRes.error ?? unidadesRes.error ?? prjRes.error ?? personasRes.error;
  if (firstErr) {
    return { filas: [], proyectoNombre: new Map(), error: firstErr.message };
  }

  const proyectos = (prjRes.data ?? []) as Array<{ id: string; nombre: string }>;
  return {
    filas: normalizarVentasPorFase({
      fases: (fasesRes.data ?? []) as VentaFaseRaw[],
      ventas: (ventasRes.data ?? []) as VentaFaseVentaRaw[],
      unidades: (unidadesRes.data ?? []) as VentasPorFaseRawBundle['unidades'],
      proyectos,
      personas: (personasRes.data ?? []) as VentasPorFaseRawBundle['personas'],
    }),
    proyectoNombre: new Map(proyectos.map((p) => [p.id, p.nombre])),
  };
}
