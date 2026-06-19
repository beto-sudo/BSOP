/**
 * Loader server-side de datos de Ventas para las rutas de PDF de reportes
 * (ADR-047). Espejo del fetch del hook del browser, con `createSupabaseServerClient`
 * (sesión + RLS empresa-scoped) y la misma normalización pura. Solo lo importan
 * route handlers (server) — por eso vive separado del módulo puro `ventas-data`.
 */
import { createSupabaseServerClient } from '@/lib/supabase-server';
import { DILESA_EMPRESA_ID } from '@/lib/empresa-constants';
import {
  normalizarVentas,
  VENTAS_SELECT,
  type VentaRaw,
  type VentaReporteRow,
  type VentasRawBundle,
} from './ventas-data';

export async function cargarVentasServer(): Promise<{
  ventas: VentaReporteRow[];
  proyectoNombre: Map<string, string>;
  error?: string;
}> {
  const sb = await createSupabaseServerClient();
  const [ventasRes, unidadesRes, prjRes, personasRes] = await Promise.all([
    sb
      .schema('dilesa')
      .from('ventas')
      .select(VENTAS_SELECT)
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

  const firstErr = ventasRes.error ?? unidadesRes.error ?? prjRes.error ?? personasRes.error;
  if (firstErr) {
    return { ventas: [], proyectoNombre: new Map(), error: firstErr.message };
  }

  const ventasRaw = (ventasRes.data ?? []) as VentaRaw[];
  const vendedorIds = [
    ...new Set(ventasRaw.map((v) => v.vendedor_usuario_id).filter((x): x is string => !!x)),
  ];
  let usuarios: VentasRawBundle['usuarios'] = [];
  if (vendedorIds.length > 0) {
    const { data } = await sb
      .schema('core')
      .from('usuarios')
      .select('id, first_name, last_name, email')
      .in('id', vendedorIds);
    usuarios = (data ?? []) as VentasRawBundle['usuarios'];
  }

  const proyectos = (prjRes.data ?? []) as Array<{ id: string; nombre: string }>;
  return {
    ventas: normalizarVentas({
      ventas: ventasRaw,
      unidades: (unidadesRes.data ?? []) as VentasRawBundle['unidades'],
      proyectos,
      personas: (personasRes.data ?? []) as VentasRawBundle['personas'],
      usuarios,
    }),
    proyectoNombre: new Map(proyectos.map((p) => [p.id, p.nombre])),
  };
}
