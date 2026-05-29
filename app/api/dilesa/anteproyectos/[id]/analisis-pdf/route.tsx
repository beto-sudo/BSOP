/**
 * GET /api/dilesa/anteproyectos/[id]/analisis-pdf
 *
 * Devuelve el análisis financiero del anteproyecto como PDF para
 * presentar al consejo o usar como documento amparador del análisis
 * aprobado (Sprint 4C de `dilesa-proyectos-checklist-inline`).
 *
 * Auth: sesión Supabase. RLS de `dilesa.proyectos` decide si el
 * usuario puede leer la fila. Si no, 404.
 *
 * Sin POST por ahora — el PDF se descarga, no se envía por email.
 * Si Beto pide email en el futuro, replicamos el patrón de
 * `estimaciones/[id]/pdf/route.tsx`.
 */

import { NextResponse } from 'next/server';
import { renderToBuffer } from '@react-pdf/renderer';
import { createSupabaseServerClient } from '@/lib/supabase-server';
import { AnalisisFinancieroPDF, type AnalisisPdfData } from '@/lib/dilesa/pdf/analisis-financiero';
import { PROYECTO_DETALLE_COLUMNAS } from '@/components/dilesa/proyecto-detalle';
import type { AnalisisFinancieroSnapshot } from '@/components/dilesa/analisis-financiero-types';

const MESES_ES = [
  'Enero',
  'Febrero',
  'Marzo',
  'Abril',
  'Mayo',
  'Junio',
  'Julio',
  'Agosto',
  'Septiembre',
  'Octubre',
  'Noviembre',
  'Diciembre',
];

function fmtFechaLarga(d: Date): string {
  return `${d.getDate()} de ${MESES_ES[d.getMonth()]} de ${d.getFullYear()}`;
}

const ESTADO_LABEL: Record<string, string> = {
  propuesta: 'Propuesta',
  analisis: 'Análisis',
  aprobado: 'Aprobado',
  completado: 'Completado',
  en_curso: 'En curso',
};

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sb = await createSupabaseServerClient();

  // Cargar anteproyecto con todas las columnas que el snapshot necesita.
  const { data: row, error } = await sb
    .schema('dilesa')
    .from('proyectos')
    .select(PROYECTO_DETALLE_COLUMNAS)
    .eq('id', id)
    .eq('tipo', 'anteproyecto')
    .is('deleted_at', null)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!row) {
    return NextResponse.json({ error: 'Anteproyecto no encontrado' }, { status: 404 });
  }

  const p = row as unknown as {
    id: string;
    nombre: string;
    estado: string;
    area_m2: number | null;
    area_vendible_m2: number | null;
    areas_verdes_m2: number | null;
    area_vialidades_m2: number | null;
    lotes_proyectados: number | null;
    tamano_lote_promedio: number | null;
    clasificacion_inmobiliaria: string | null;
    clasificaciones_inmobiliarias: string[];
    costo_terreno: number | null;
    valor_predio: number | null;
    infraestructura_cabecera_necesaria: boolean;
    prototipos_referencia: string[];
    prototipo_referencia_id: string | null;
    presupuesto_estimado: number | null;
    valor_comercial_referencia: number | null;
    costo_urbanizacion_referencia: number | null;
    costo_materiales_referencia: number | null;
    costo_mo_referencia: number | null;
    registro_ruv_referencia: number | null;
    seguro_calidad_referencia: number | null;
    costo_comercializacion_referencia: number | null;
    valor_comercial_proyecto: number | null;
    costo_urbanizacion: number | null;
    costo_materiales_proyecto: number | null;
    costo_mo: number | null;
    registro_ruv_proyecto: number | null;
    seguro_calidad_proyecto: number | null;
    costo_comercializacion: number | null;
  };

  // Resolver nombre del prototipo de referencia (si hay).
  let prototipoReferenciaNombre: string | null = null;
  if (p.prototipo_referencia_id) {
    const { data: proto } = await sb
      .schema('dilesa')
      .from('productos')
      .select('nombre')
      .eq('id', p.prototipo_referencia_id)
      .maybeSingle();
    prototipoReferenciaNombre = (proto?.nombre as string | undefined) ?? null;
  }

  const snapshot: AnalisisFinancieroSnapshot = {
    id: p.id,
    area_m2: p.area_m2,
    area_vendible_m2: p.area_vendible_m2,
    areas_verdes_m2: p.areas_verdes_m2,
    area_vialidades_m2: p.area_vialidades_m2,
    lotes_proyectados: p.lotes_proyectados,
    tamano_lote_promedio: p.tamano_lote_promedio,
    clasificacion_inmobiliaria: p.clasificacion_inmobiliaria,
    clasificaciones_inmobiliarias: p.clasificaciones_inmobiliarias ?? [],
    costo_terreno: p.costo_terreno,
    valor_predio: p.valor_predio,
    infraestructura_cabecera_necesaria: p.infraestructura_cabecera_necesaria ?? false,
    prototipos_referencia: p.prototipos_referencia ?? [],
    prototipo_referencia_id: p.prototipo_referencia_id,
    presupuesto_estimado: p.presupuesto_estimado,
    valor_comercial_referencia: p.valor_comercial_referencia,
    costo_urbanizacion_referencia: p.costo_urbanizacion_referencia,
    costo_materiales_referencia: p.costo_materiales_referencia,
    costo_mo_referencia: p.costo_mo_referencia,
    registro_ruv_referencia: p.registro_ruv_referencia,
    seguro_calidad_referencia: p.seguro_calidad_referencia,
    costo_comercializacion_referencia: p.costo_comercializacion_referencia,
    valor_comercial_proyecto: p.valor_comercial_proyecto,
    costo_urbanizacion: p.costo_urbanizacion,
    costo_materiales_proyecto: p.costo_materiales_proyecto,
    costo_mo: p.costo_mo,
    registro_ruv_proyecto: p.registro_ruv_proyecto,
    seguro_calidad_proyecto: p.seguro_calidad_proyecto,
    costo_comercializacion: p.costo_comercializacion,
  };

  const data: AnalisisPdfData = {
    nombreProyecto: p.nombre,
    estado: ESTADO_LABEL[p.estado] ?? p.estado,
    emitidoEnTexto: fmtFechaLarga(new Date()),
    prototipoReferenciaNombre,
    snapshot,
  };

  const buf = await renderToBuffer(<AnalisisFinancieroPDF data={data} />);
  const slug = p.nombre
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return new Response(new Uint8Array(buf), {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="analisis-financiero-${slug}.pdf"`,
      'Cache-Control': 'no-store',
    },
  });
}

export const runtime = 'nodejs';
