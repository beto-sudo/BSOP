import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import { getSupabaseAdminClient } from '@/lib/supabase-admin';

export async function GET(req: NextRequest) {
  const targetUserId = req.nextUrl.searchParams.get('userId');
  if (!targetUserId) {
    return NextResponse.json({ error: 'Missing userId' }, { status: 400 });
  }

  // Verify the caller is an admin
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll(); },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        },
      },
    },
  );

  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.email) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const admin = getSupabaseAdminClient();
  if (!admin) {
    return NextResponse.json({ error: 'Server config error' }, { status: 500 });
  }

  // Check caller is admin
  const { data: callerUser } = await admin
    .schema('core')
    .from('usuarios')
    .select('rol')
    .eq('email', user.email.toLowerCase())
    .eq('activo', true)
    .maybeSingle();

  if (callerUser?.rol !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // Fetch target user's permissions using admin client (bypasses RLS)
  const { data: targetUser } = await admin
    .schema('core')
    .from('usuarios')
    .select('id, email, rol, activo')
    .eq('id', targetUserId)
    .maybeSingle();

  if (!targetUser || !targetUser.activo) {
    return NextResponse.json({ error: 'User not found or inactive' }, { status: 404 });
  }

  // If target is admin, return admin permissions
  if (targetUser.rol === 'admin') {
    return NextResponse.json({
      isAdmin: true,
      email: targetUser.email,
      empresas: {},
      modulos: {},
    });
  }

  // Fetch all data with admin client
  const [empresasRes, modulosRes, permisosRolRes, excepcionesRes, allEmpresasRes] =
    await Promise.all([
      admin
        .schema('core')
        .from('usuarios_empresas')
        .select('empresa_id, rol_id')
        .eq('usuario_id', targetUser.id),
      admin.schema('core').from('modulos').select('id, slug'),
      admin.schema('core').from('permisos_rol').select('rol_id, modulo_id, acceso_lectura, acceso_escritura'),
      admin
        .schema('core')
        .from('permisos_usuario_excepcion')
        .select('empresa_id, modulo_id, acceso_lectura, acceso_escritura')
        .eq('usuario_id', targetUser.id),
      admin.schema('core').from('empresas').select('id, slug'),
    ]);

  const userEmpresas = empresasRes.data ?? [];
  const allModulos = modulosRes.data ?? [];
  const allPermisos = permisosRolRes.data ?? [];
  const userExcepciones = excepcionesRes.data ?? [];
  const allEmpresas = allEmpresasRes.data ?? [];

  const empresaIdToSlug: Record<string, string> = {};
  for (const e of allEmpresas) empresaIdToSlug[e.id] = e.slug;
  const moduloIdToSlug: Record<string, string> = {};
  for (const m of allModulos) moduloIdToSlug[m.id] = m.slug;

  // Build empresa access
  const empresas: Record<string, { read: boolean; write: boolean }> = {};
  for (const ue of userEmpresas) {
    const slug = empresaIdToSlug[ue.empresa_id];
    if (slug) empresas[slug] = { read: true, write: true };
  }

  // Build module access from roles
  const modulos: Record<string, { read: boolean; write: boolean }> = {};
  for (const ue of userEmpresas) {
    if (!ue.rol_id) continue;
    const rolePerms = allPermisos.filter((p: any) => p.rol_id === ue.rol_id);
    for (const perm of rolePerms) {
      const moduloSlug = moduloIdToSlug[perm.modulo_id];
      if (!moduloSlug) continue;
      modulos[moduloSlug] = { read: perm.acceso_lectura, write: perm.acceso_escritura };
    }
  }

  // Apply exceptions
  for (const exc of userExcepciones) {
    const moduloSlug = moduloIdToSlug[exc.modulo_id];
    if (!moduloSlug) continue;
    modulos[moduloSlug] = { read: exc.acceso_lectura, write: exc.acceso_escritura };
  }

  return NextResponse.json({
    isAdmin: false,
    email: targetUser.email,
    empresas,
    modulos,
  });
}
