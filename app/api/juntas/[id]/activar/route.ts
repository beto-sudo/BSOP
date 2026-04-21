import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase-server';
import { getSupabaseAdminClient } from '@/lib/supabase-admin';

/**
 * POST /api/juntas/[id]/activar
 *
 * Marca esta junta como la "junta activa" del usuario que llama. El trigger
 * `task_updates_set_junta_id_trg` usa este valor para ligar automáticamente
 * cualquier avance creado desde el módulo de tareas (sin URL de junta) a la
 * junta que el usuario tiene abierta.
 *
 * Activa juntas en `programada` o `en_curso`. Si la junta es `programada`
 * y el usuario entró a la pantalla, claramente está trabajando en ella —
 * esperar a que alguien clickee explícitamente "iniciar" perdía el enlace
 * de avances durante la ventana de transición. Juntas `completada` o
 * `cancelada` se ignoran.
 *
 * DELETE limpia la junta activa del usuario (por si salen manualmente del
 * flujo de junta y quieren volver a capturar avances "libres"). No es
 * necesario llamarlo explícitamente — el endpoint `/api/juntas/terminar`
 * limpia a todos los usuarios que tenían esa junta activa al cerrarla.
 */

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: juntaId } = await params;

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

  const { data: junta } = await admin
    .schema('erp')
    .from('juntas')
    .select('id, estado')
    .eq('id', juntaId)
    .maybeSingle();

  if (!junta) {
    return NextResponse.json({ error: 'Junta no encontrada' }, { status: 404 });
  }
  if (junta.estado !== 'en_curso' && junta.estado !== 'programada') {
    return NextResponse.json({ ok: true, activated: false, estado: junta.estado });
  }

  const { error } = await admin
    .schema('core')
    .from('usuarios')
    .update({ junta_activa_id: juntaId })
    .eq('email', user.email.toLowerCase());

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, activated: true });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: juntaId } = await params;

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

  // Solo limpia si el usuario tenía esta junta como activa — evita pisar
  // una junta distinta que acabe de abrir en otra pestaña.
  const { error } = await admin
    .schema('core')
    .from('usuarios')
    .update({ junta_activa_id: null })
    .eq('email', user.email.toLowerCase())
    .eq('junta_activa_id', juntaId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
