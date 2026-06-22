/**
 * GET /api/dilesa/construccion/[id]/acta-recepcion/pdf
 *
 * Genera el PDF del Acta de Recepción de Obra al contratista (formato EN
 * BLANCO) para una construcción DILESA. Iniciativa `dilesa-atencion-clientes`
 * S4 (recepción papel-primero): Atención a Clientes lo imprime, lo recorre y
 * lo firma físico; el escaneado se sube en el drawer de recepción.
 *
 * Antes era una página HTML (`PrintLayout`) que salía en blanco al imprimir
 * (vivía dentro del app-shell, cuyo `<main>` usa `print:absolute` y no pagina
 * contenido multipágina) y sin branding. Ahora es un PDF con el mismo header/
 * footer olivo + isotipo que el resto de checklists DILESA (checklist-entrega).
 *
 * Auth: la sesión de Supabase + RLS de `dilesa.construccion` (empresa-scoped)
 * deciden si el usuario puede leer la obra. Si no se ve, 404. Mismo criterio
 * que los PDFs del expediente de venta.
 *
 * Output: `application/pdf` inline — se abre en el visor del browser y desde
 * ahí se imprime; el botón del drawer lo abre en pestaña nueva.
 */
import { NextResponse } from 'next/server';
import { renderToBuffer } from '@react-pdf/renderer';
import { createSupabaseServerClient } from '@/lib/supabase-server';
import { ActaRecepcionPDF, type ActaRecepcionData } from '@/lib/dilesa/pdf/acta-recepcion';

function nombrePersona(
  p: {
    nombre?: string | null;
    apellido_paterno?: string | null;
    apellido_materno?: string | null;
  } | null
): string | null {
  if (!p) return null;
  return [p.nombre, p.apellido_paterno, p.apellido_materno].filter(Boolean).join(' ') || null;
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sb = await createSupabaseServerClient();

  const { data: obra, error: oErr } = await sb
    .schema('dilesa')
    .from('construccion')
    .select('codigo, unidad_id, contratista_id, supervisor_persona_id')
    .eq('id', id)
    .maybeSingle();
  if (oErr || !obra) {
    return NextResponse.json({ error: 'Obra no encontrada' }, { status: 404 });
  }

  const [uRes, contRes, supRes, recRes] = await Promise.all([
    obra.unidad_id
      ? sb
          .schema('dilesa')
          .from('unidades')
          .select('identificador, proyecto_id')
          .eq('id', obra.unidad_id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    obra.contratista_id
      ? sb
          .schema('erp')
          .from('personas')
          .select('nombre, apellido_paterno, apellido_materno')
          .eq('id', obra.contratista_id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    obra.supervisor_persona_id
      ? sb
          .schema('erp')
          .from('personas')
          .select('nombre, apellido_paterno, apellido_materno')
          .eq('id', obra.supervisor_persona_id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    sb
      .schema('dilesa')
      .from('recepcion_obra')
      .select('fecha_programada')
      .eq('construccion_id', id)
      .is('deleted_at', null)
      .maybeSingle(),
  ]);

  let proyecto: string | null = null;
  if (uRes.data?.proyecto_id) {
    const { data: prj } = await sb
      .schema('dilesa')
      .from('proyectos')
      .select('nombre')
      .eq('id', uRes.data.proyecto_id)
      .maybeSingle();
    proyecto = (prj?.nombre as string | null) ?? null;
  }

  // Fecha programada (date 'YYYY-MM-DD') anclada a mediodía para que el corte de
  // día por TZ no la recorra (Vercel corre en UTC; Matamoros es UTC-5/-6).
  const fechaProgramadaRaw = (recRes.data?.fecha_programada as string | null) ?? null;
  const fechaProgramada = fechaProgramadaRaw
    ? new Date(`${fechaProgramadaRaw}T12:00:00`).toLocaleDateString('es-MX', {
        timeZone: 'America/Matamoros',
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      })
    : null;

  const fechaTexto = new Date().toLocaleDateString('es-MX', {
    timeZone: 'America/Matamoros',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  const data: ActaRecepcionData = {
    fechaTexto,
    codigo: obra.codigo as string,
    proyecto,
    unidad: (uRes.data?.identificador as string | null) ?? null,
    contratista: nombrePersona(contRes.data),
    supervisor: nombrePersona(supRes.data),
    fechaProgramada,
  };

  const buf = await renderToBuffer(<ActaRecepcionPDF data={data} />);
  const filename = `acta-recepcion-${data.unidad ?? data.codigo}.pdf`;
  return new Response(new Uint8Array(buf), {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  });
}

export const runtime = 'nodejs';
