/**
 * PDF del reporte «Pipeline por fase» (DILESA · Ventas) — ADR-047.
 *
 * Server-side: fetch con la sesión del usuario (RLS empresa-scoped), aplica los
 * MISMOS filtros que la vista (vía las funciones puras del motor) y renderiza el
 * documento con branding DILESA. Devuelve el PDF inline (se abre en pestaña).
 */
import { NextResponse } from 'next/server';
import { renderToBuffer } from '@react-pdf/renderer';
import { createSupabaseServerClient } from '@/lib/supabase-server';
import { DILESA_EMPRESA_ID } from '@/lib/empresa-constants';
import {
  construirPipelinePorFase,
  filtrarVentas,
  type FaseCatalogo,
  type VentaReporte,
} from '@/lib/dilesa/reportes/pipeline-por-fase';
import {
  ReportePipelineFasePDF,
  type PipelinePdfMeta,
} from '@/lib/dilesa/pdf/reporte-pipeline-fase';

export const runtime = 'nodejs';

type VentaRaw = {
  estado: string;
  fase_actual: string | null;
  valor_escrituracion: number | null;
  valor_comercial: number | null;
  unidad_id: string | null;
  vendedor: string | null;
  vendedor_usuario_id: string | null;
  created_at: string;
};

export async function GET(req: Request) {
  const url = new URL(req.url);
  const filtros = {
    proyecto: url.searchParams.get('proyecto') ?? '',
    vendedor: url.searchParams.get('vendedor') ?? '',
    mes: url.searchParams.get('mes') ?? '',
  };

  const sb = await createSupabaseServerClient();

  const [fasesRes, ventasRes, unidadesRes, prjRes] = await Promise.all([
    sb
      .schema('dilesa')
      .from('venta_fase_catalogo')
      .select('posicion, nombre, rol')
      .eq('empresa_id', DILESA_EMPRESA_ID)
      .is('deleted_at', null)
      .order('posicion', { ascending: true }),
    sb
      .schema('dilesa')
      .from('ventas')
      .select(
        'estado, fase_actual, valor_escrituracion, valor_comercial, unidad_id, vendedor, vendedor_usuario_id, created_at'
      )
      .eq('empresa_id', DILESA_EMPRESA_ID)
      .is('deleted_at', null),
    sb
      .schema('dilesa')
      .from('unidades')
      .select('id, proyecto_id')
      .eq('empresa_id', DILESA_EMPRESA_ID)
      .is('deleted_at', null),
    sb
      .schema('dilesa')
      .from('proyectos')
      .select('id, nombre')
      .eq('empresa_id', DILESA_EMPRESA_ID)
      .is('deleted_at', null),
  ]);

  const firstErr = fasesRes.error ?? ventasRes.error ?? unidadesRes.error ?? prjRes.error;
  if (firstErr) {
    return NextResponse.json({ error: firstErr.message }, { status: 500 });
  }

  const unidadProyecto = new Map<string, string | null>();
  for (const u of (unidadesRes.data ?? []) as Array<{ id: string; proyecto_id: string | null }>) {
    unidadProyecto.set(u.id, u.proyecto_id);
  }
  const proyectoNombre = new Map<string, string>();
  for (const p of (prjRes.data ?? []) as Array<{ id: string; nombre: string }>) {
    proyectoNombre.set(p.id, p.nombre);
  }

  // Vendedor resuelto (FK core.usuarios, fallback texto legacy) — espejo de la vista.
  const ventasRaw = (ventasRes.data ?? []) as VentaRaw[];
  const vendedorIds = [
    ...new Set(ventasRaw.map((v) => v.vendedor_usuario_id).filter((x): x is string => !!x)),
  ];
  const usuarioMap = new Map<string, string>();
  if (vendedorIds.length > 0) {
    const { data: usuarios } = await sb
      .schema('core')
      .from('usuarios')
      .select('id, first_name, last_name, email')
      .in('id', vendedorIds);
    for (const u of usuarios ?? []) {
      const nombre = [u.first_name, u.last_name].filter(Boolean).join(' ').trim();
      usuarioMap.set(u.id as string, nombre || ((u.email as string | null) ?? ''));
    }
  }

  const ventas: VentaReporte[] = ventasRaw.map((v) => ({
    estado: v.estado,
    fase_actual: v.fase_actual,
    precio: v.valor_escrituracion ?? v.valor_comercial,
    proyectoId: v.unidad_id ? (unidadProyecto.get(v.unidad_id) ?? null) : null,
    vendedor: v.vendedor_usuario_id
      ? (usuarioMap.get(v.vendedor_usuario_id) ?? v.vendedor)
      : v.vendedor,
    mes: v.created_at.slice(0, 7),
  }));

  const result = construirPipelinePorFase(
    (fasesRes.data ?? []) as FaseCatalogo[],
    filtrarVentas(ventas, filtros)
  );

  const partes = [
    filtros.proyecto
      ? `Proyecto: ${proyectoNombre.get(filtros.proyecto) ?? filtros.proyecto}`
      : null,
    filtros.vendedor ? `Vendedor: ${filtros.vendedor}` : null,
    filtros.mes ? `Mes: ${filtros.mes}` : null,
  ].filter(Boolean);

  const meta: PipelinePdfMeta = {
    fechaTexto: new Date().toLocaleDateString('es-MX', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    }),
    filtrosTexto: partes.length > 0 ? partes.join(' · ') : 'Todas las ventas activas',
  };

  const buf = await renderToBuffer(<ReportePipelineFasePDF result={result} meta={meta} />);
  return new Response(new Uint8Array(buf), {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': 'inline; filename="pipeline-por-fase.pdf"',
      'Cache-Control': 'no-store',
    },
  });
}
