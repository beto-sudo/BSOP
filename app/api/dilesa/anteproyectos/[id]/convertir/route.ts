import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase-server';
import { getSupabaseAdminClient } from '@/lib/supabase-admin';
import { DILESA_EMPRESA_ID } from '@/lib/dilesa-constants';

/**
 * POST /api/dilesa/anteproyectos/[id]/convertir
 *
 * Convierte un anteproyecto a proyecto formal:
 *   1. Valida precondiciones (no borrado, no convertido, terreno + área +
 *      lotes completos).
 *   2. Inserta `dilesa.proyectos` con snapshot del anteproyecto.
 *   3. Actualiza `dilesa.anteproyectos` a estado `convertido_a_proyecto`
 *      con `proyecto_id`, timestamp y el empleado que convirtió.
 *      El UPDATE incluye `estado != 'convertido_a_proyecto'` en el WHERE
 *      para que doble-click retorne 0 rows y hagamos rollback del insert.
 *
 * No es una transacción de PostgreSQL — es un best-effort en dos pasos con
 * compensación. Si aparece una race en prod, migrar a un RPC con BEGIN/
 * COMMIT explícito queda como follow-up documentado en el PR.
 */

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: anteproyectoId } = await params;

  const sessionClient = await createSupabaseServerClient();
  const {
    data: { user },
  } = await sessionClient.auth.getUser();
  if (!user?.email) {
    return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
  }

  const admin = getSupabaseAdminClient();
  if (!admin) {
    return NextResponse.json({ error: 'Server config error' }, { status: 500 });
  }

  let body: { nombre?: string } = {};
  try {
    body = (await req.json()) as { nombre?: string };
  } catch {
    // body opcional — si no llega, usamos el nombre del anteproyecto.
  }

  // 1. Leer anteproyecto + validar precondiciones.
  const { data: ap, error: apErr } = await admin
    .schema('dilesa')
    .from('anteproyectos')
    .select(
      'id, empresa_id, nombre, terreno_id, tipo_proyecto_id, area_vendible_m2, areas_verdes_m2, cantidad_lotes, infraestructura_cabecera_inversion, estado, deleted_at, proyecto_id'
    )
    .eq('id', anteproyectoId)
    .maybeSingle();

  if (apErr) {
    return NextResponse.json({ error: apErr.message }, { status: 500 });
  }
  if (!ap) {
    return NextResponse.json({ error: 'Anteproyecto no encontrado' }, { status: 404 });
  }
  if (ap.deleted_at) {
    return NextResponse.json({ error: 'Anteproyecto archivado' }, { status: 400 });
  }
  if (ap.estado === 'convertido_a_proyecto') {
    return NextResponse.json(
      {
        error: 'Este anteproyecto ya fue convertido',
        proyecto_id: ap.proyecto_id,
      },
      { status: 409 }
    );
  }
  if (!ap.terreno_id) {
    return NextResponse.json(
      { error: 'El anteproyecto no tiene terreno asignado' },
      { status: 400 }
    );
  }
  if (!ap.area_vendible_m2 || ap.area_vendible_m2 <= 0) {
    return NextResponse.json(
      { error: 'El anteproyecto requiere área vendible > 0' },
      { status: 400 }
    );
  }
  if (!ap.cantidad_lotes || ap.cantidad_lotes <= 0) {
    return NextResponse.json(
      { error: 'El anteproyecto requiere cantidad de lotes > 0' },
      { status: 400 }
    );
  }

  // 2. Resolver empleado que convierte (best-effort; FK SET NULL permite null).
  const emailLower = user.email.toLowerCase();
  let convertidoPor: string | null = null;
  const { data: empleadoRow } = await admin
    .schema('erp')
    .from('v_empleados_full')
    .select('empleado_id')
    .eq('empresa_id', ap.empresa_id)
    .or(`email_empresa.eq.${emailLower},email_personal.eq.${emailLower}`)
    .maybeSingle();
  if (empleadoRow?.empleado_id) {
    convertidoPor = empleadoRow.empleado_id;
  }

  // 3. Insertar proyecto (snapshot del anteproyecto).
  const nombreProyecto = body.nombre?.trim() || ap.nombre;
  const { data: nuevoProyecto, error: insErr } = await admin
    .schema('dilesa')
    .from('proyectos')
    .insert({
      empresa_id: ap.empresa_id ?? DILESA_EMPRESA_ID,
      nombre: nombreProyecto,
      terreno_id: ap.terreno_id,
      anteproyecto_id: ap.id,
      tipo_proyecto_id: ap.tipo_proyecto_id,
      area_vendible_m2: ap.area_vendible_m2,
      areas_verdes_m2: ap.areas_verdes_m2,
      cantidad_lotes_total: ap.cantidad_lotes,
      etapa: 'planeacion',
      decision_actual: 'desarrollar',
    })
    .select('id')
    .single();

  if (insErr || !nuevoProyecto) {
    return NextResponse.json(
      { error: insErr?.message ?? 'No se pudo crear el proyecto' },
      { status: 500 }
    );
  }

  // 4. Marcar anteproyecto como convertido (idempotente: si doble-click,
  //    el WHERE estado != 'convertido_a_proyecto' retorna 0 rows y
  //    hacemos rollback del insert).
  const { data: updated, error: updErr } = await admin
    .schema('dilesa')
    .from('anteproyectos')
    .update({
      estado: 'convertido_a_proyecto',
      proyecto_id: nuevoProyecto.id,
      convertido_a_proyecto_en: new Date().toISOString(),
      convertido_a_proyecto_por: convertidoPor,
    })
    .eq('id', ap.id)
    .neq('estado', 'convertido_a_proyecto')
    .select('id');

  if (updErr || !updated || updated.length === 0) {
    // Rollback best-effort.
    await admin.schema('dilesa').from('proyectos').delete().eq('id', nuevoProyecto.id);
    if (updErr) {
      return NextResponse.json({ error: updErr.message }, { status: 500 });
    }
    return NextResponse.json(
      { error: 'El anteproyecto fue convertido por otra sesión. Recarga la página.' },
      { status: 409 }
    );
  }

  return NextResponse.json({ proyecto_id: nuevoProyecto.id });
}
