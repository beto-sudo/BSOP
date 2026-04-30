import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import { z } from 'zod';
import { getSupabaseAdminClient } from '@/lib/supabase-admin';
import { validateQuery } from '@/lib/validation';
import { impersonateRateLimiter, extractIdentifier } from '@/lib/ratelimit';
import { PREVIEW_COOKIE_NAME } from '@/lib/auth/preview-guard';

const ImpersonateQuerySchema = z.object({
  userId: z.string().uuid('userId must be a valid UUID'),
});

/**
 * Starts a "Viendo como" preview session.
 *
 * Validates the caller is admin, computes the target user's effective
 * permissions and returns them as JSON, then sets the `bsop_preview_as`
 * cookie (httpOnly, sameSite=lax, path=/). The cookie marks the session
 * as read-only end-to-end (proxy.ts blocks mutations + server actions
 * call `assertNotInPreview()`).
 *
 * The cookie is cleared by `POST /api/impersonate/stop`.
 *
 * Accepts both GET and POST for backwards compatibility: clients running
 * an older bundle from before Sprint 1 still call this with GET. The
 * behavior is identical — same admin auth, same cookie set. Safe because
 * cookie setting only happens after the admin check passes.
 */
export async function POST(req: NextRequest) {
  const rate = await impersonateRateLimiter.check(extractIdentifier(req));
  if (!rate.ok) return rate.response;

  const parsed = validateQuery(req, ImpersonateQuerySchema);
  if (!parsed.ok) return parsed.response;
  const { userId: targetUserId } = parsed.data;

  // Verify the caller is an admin
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();
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
    cookieStore.set(PREVIEW_COOKIE_NAME, targetUser.id, {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      secure: process.env.NODE_ENV === 'production',
    });
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
      admin.schema('core').from('modulos').select('id, slug, empresa_id'),
      admin
        .schema('core')
        .from('permisos_rol')
        .select('rol_id, modulo_id, acceso_lectura, acceso_escritura'),
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
    const rolePerms = allPermisos.filter((p) => p.rol_id === ue.rol_id);
    for (const perm of rolePerms) {
      const moduloSlug = moduloIdToSlug[perm.modulo_id];
      if (!moduloSlug) continue;
      modulos[moduloSlug] = {
        read: perm.acceso_lectura ?? false,
        write: perm.acceso_escritura ?? false,
      };
    }
  }

  // Apply exceptions
  for (const exc of userExcepciones) {
    const moduloSlug = moduloIdToSlug[exc.modulo_id];
    if (!moduloSlug) continue;
    modulos[moduloSlug] = {
      read: exc.acceso_lectura ?? false,
      write: exc.acceso_escritura ?? false,
    };
  }

  cookieStore.set(PREVIEW_COOKIE_NAME, targetUser.id, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    secure: process.env.NODE_ENV === 'production',
  });

  return NextResponse.json({
    isAdmin: false,
    email: targetUser.email,
    empresas,
    modulos,
  });
}

// Backwards compatibility: clients on the pre-Sprint-1 bundle still call
// this endpoint with GET. Aliasing GET to the same handler keeps them
// working while their browsers warm up to the new bundle. Behavior is
// identical — admin auth + same cookie set + same payload.
export const GET = POST;
