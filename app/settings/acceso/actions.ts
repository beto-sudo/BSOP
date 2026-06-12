'use server';

import { revalidatePath } from 'next/cache';
import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import { getSupabaseAdminClient } from '@/lib/supabase-admin';
import { assertNotInPreview } from '@/lib/auth/preview-guard';
import { generateWelcomeHtml, type WelcomeEmpresa } from '@/lib/welcome-email';
import { validarRolParaEmpresa, resolverPermisosDePlantilla } from './acceso-rules';

// ── Legacy flat-role types (pre-RBAC) ──────────────────────────────────────
export type Rol = 'admin' | 'viewer' | 'cashier';

export type Usuario = {
  id: string;
  email: string;
  rol: Rol;
  activo: boolean;
};

// ── RBAC schema types (core.*) ─────────────────────────────────────────────
export type Empresa = { id: string; nombre: string; slug: string };
// NOTE: this file is a `'use server'` module — Next.js 16 only allows async
// function exports from it. Anything else (e.g. `export const ...`) makes
// EVERY action in the file fail at runtime with:
//   `Error: A "use server" file can only export async functions`
// Keep this as a pure type alias. If you need a runtime list of secciones,
// put it in a sibling non-server file and import from there.
export type ModuloSeccion =
  | 'operativa'
  | 'administracion'
  | 'rh'
  | 'compras'
  | 'inventario'
  | 'operaciones'
  | 'tesoreria'
  | 'sistema';

export type Modulo = {
  id: string;
  slug: string;
  nombre: string;
  descripcion: string | null;
  empresa_id: string;
  seccion: ModuloSeccion;
};
export type RolRecord = { id: string; nombre: string; empresa_id: string };
export type PermisoRol = {
  rol_id: string;
  modulo_id: string;
  acceso_lectura: boolean;
  acceso_escritura: boolean;
};
export type UsuarioCore = {
  id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  activo: boolean;
  welcome_sent_at: string | null;
};
export type UsuarioEmpresa = { usuario_id: string; empresa_id: string; rol_id: string | null };
export type RolPlantilla = {
  id: string;
  empresa_id: string;
  nombre: string;
  descripcion: string | null;
};
export type RolPlantillaItem = {
  plantilla_id: string;
  modulo_id: string;
  acceso_lectura: boolean;
  acceso_escritura: boolean;
};
export type ExcepcionUsuario = {
  usuario_id: string;
  empresa_id: string;
  modulo_id: string;
  acceso_lectura: boolean;
  acceso_escritura: boolean;
};

async function requireAdmin(): Promise<void> {
  await assertNotInPreview();
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
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.user.email) throw new Error('No autenticado');

  const admin = getSupabaseAdminClient();
  if (!admin) throw new Error('Error de configuración del servidor');

  const { data } = await admin
    .schema('core')
    .from('usuarios')
    .select('rol')
    .eq('email', session.user.email.toLowerCase())
    .eq('activo', true)
    .maybeSingle();

  if (data?.rol !== 'admin')
    throw new Error('Solo los administradores pueden realizar esta acción');
}

// ── Legacy actions ─────────────────────────────────────────────────────────

export async function inviteUsuario(email: string, rol: Rol): Promise<void> {
  await requireAdmin();

  const admin = getSupabaseAdminClient()!;
  const { error } = await admin
    .schema('core')
    .from('usuarios')
    .insert({ email: email.toLowerCase().trim(), rol, activo: true });

  if (error) {
    if (error.code === '23505') throw new Error('Este correo ya tiene acceso');
    throw new Error(error.message);
  }

  revalidatePath('/settings/acceso');
}

export async function updateRol(id: string, rol: Rol): Promise<void> {
  await requireAdmin();

  const admin = getSupabaseAdminClient()!;
  const { error } = await admin.schema('core').from('usuarios').update({ rol }).eq('id', id);

  if (error) throw new Error(error.message);
  revalidatePath('/settings/acceso');
}

export async function toggleActivo(id: string, activo: boolean): Promise<void> {
  await requireAdmin();

  const admin = getSupabaseAdminClient()!;
  const { error } = await admin.schema('core').from('usuarios').update({ activo }).eq('id', id);

  if (error) throw new Error(error.message);
  revalidatePath('/settings/acceso');
}

export async function removeUsuario(id: string): Promise<void> {
  await requireAdmin();

  const admin = getSupabaseAdminClient()!;
  const { error } = await admin.schema('core').from('usuarios').delete().eq('id', id);

  if (error) throw new Error(error.message);
  revalidatePath('/settings/acceso');
}

// ── Empresa CRUD ───────────────────────────────────────────────────────────

export async function createEmpresa(nombre: string, slug: string): Promise<void> {
  await requireAdmin();
  const admin = getSupabaseAdminClient()!;
  const { error } = await admin
    .schema('core')
    .from('empresas')
    .insert({ nombre: nombre.trim(), slug: slug.trim() });
  if (error) {
    if (error.code === '23505') throw new Error('Ya existe una empresa con ese slug');
    throw new Error(error.message);
  }
  revalidatePath('/settings/acceso');
}

export async function updateEmpresa(id: string, nombre: string, slug: string): Promise<void> {
  await requireAdmin();
  const admin = getSupabaseAdminClient()!;
  const { error } = await admin
    .schema('core')
    .from('empresas')
    .update({ nombre: nombre.trim(), slug: slug.trim() })
    .eq('id', id);
  if (error) {
    if (error.code === '23505') throw new Error('Ya existe una empresa con ese slug');
    throw new Error(error.message);
  }
  revalidatePath('/settings/acceso');
}

// ── Rol CRUD (RBAC) ────────────────────────────────────────────────────────

/**
 * Crea un rol; con `plantilla_id` copia los permisos de la plantilla
 * (accesos-intuitivos S3) expandiendo sus requisitos de navegación en
 * lectura, para que el rol nazca coherente aunque la plantilla envejezca.
 * Devuelve cuántos permisos se otorgaron (0 sin plantilla).
 */
export async function createRolRecord(
  nombre: string,
  empresa_id: string,
  plantilla_id?: string
): Promise<{ permisos: number }> {
  await requireAdmin();
  const admin = getSupabaseAdminClient()!;

  let permisosPlantilla: Array<{
    modulo_id: string;
    acceso_lectura: boolean;
    acceso_escritura: boolean;
  }> = [];

  if (plantilla_id) {
    const { data: plantilla, error: plantillaError } = await admin
      .schema('core')
      .from('rol_plantillas')
      .select('id, empresa_id')
      .eq('id', plantilla_id)
      .maybeSingle();
    if (plantillaError) throw new Error(plantillaError.message);
    if (!plantilla) throw new Error('La plantilla seleccionada no existe.');
    if (plantilla.empresa_id !== empresa_id)
      throw new Error('La plantilla seleccionada pertenece a otra empresa.');

    const [{ data: items, error: itemsError }, { data: modulos, error: modulosError }] =
      await Promise.all([
        admin
          .schema('core')
          .from('rol_plantilla_items')
          .select('modulo_id, acceso_lectura, acceso_escritura')
          .eq('plantilla_id', plantilla_id),
        admin.schema('core').from('modulos').select('id, slug').eq('empresa_id', empresa_id),
      ]);
    if (itemsError) throw new Error(itemsError.message);
    if (modulosError) throw new Error(modulosError.message);

    permisosPlantilla = resolverPermisosDePlantilla(items ?? [], modulos ?? []);
  }

  const { data: rol, error } = await admin
    .schema('core')
    .from('roles')
    .insert({ nombre: nombre.trim(), empresa_id })
    .select('id')
    .single();
  if (error) throw new Error(error.message);

  if (permisosPlantilla.length > 0) {
    const { error: permisosError } = await admin
      .schema('core')
      .from('permisos_rol')
      .insert(permisosPlantilla.map((p) => ({ rol_id: rol.id, ...p })));
    if (permisosError) throw new Error(permisosError.message);
  }

  revalidatePath('/settings/acceso');
  return { permisos: permisosPlantilla.length };
}

export async function updateRolRecord(id: string, nombre: string): Promise<void> {
  await requireAdmin();
  const admin = getSupabaseAdminClient()!;
  const { error } = await admin
    .schema('core')
    .from('roles')
    .update({ nombre: nombre.trim() })
    .eq('id', id);
  if (error) throw new Error(error.message);
  revalidatePath('/settings/acceso');
}

export async function deleteRolRecord(id: string): Promise<void> {
  await requireAdmin();
  const admin = getSupabaseAdminClient()!;
  const { error } = await admin.schema('core').from('roles').delete().eq('id', id);
  if (error) throw new Error(error.message);
  revalidatePath('/settings/acceso');
}

// ── Plantillas de rol (accesos-intuitivos S3) ──────────────────────────────

/**
 * Guarda (o re-guarda, por nombre) una plantilla a partir del snapshot de
 * permisos actuales de un rol. Solo se copian permisos encendidos. Re-guardar
 * con el mismo nombre reemplaza los items — así "editar plantilla" = ajustar
 * un rol en la matriz y volver a guardarla.
 */
export async function savePlantillaFromRol(
  rol_id: string,
  nombre: string,
  descripcion?: string
): Promise<{ items: number }> {
  await requireAdmin();
  const admin = getSupabaseAdminClient()!;

  const nombreLimpio = nombre.trim();
  if (!nombreLimpio) throw new Error('Ponle nombre a la plantilla.');

  const { data: rol, error: rolError } = await admin
    .schema('core')
    .from('roles')
    .select('id, empresa_id')
    .eq('id', rol_id)
    .maybeSingle();
  if (rolError) throw new Error(rolError.message);
  if (!rol?.empresa_id) throw new Error('El rol no existe o no tiene empresa.');

  const { data: permisos, error: permisosError } = await admin
    .schema('core')
    .from('permisos_rol')
    .select('modulo_id, acceso_lectura, acceso_escritura')
    .eq('rol_id', rol_id)
    .or('acceso_lectura.eq.true,acceso_escritura.eq.true');
  if (permisosError) throw new Error(permisosError.message);
  if (!permisos || permisos.length === 0)
    throw new Error('El rol no tiene permisos activos — no hay nada que guardar.');

  const { data: plantilla, error: upsertError } = await admin
    .schema('core')
    .from('rol_plantillas')
    .upsert(
      {
        empresa_id: rol.empresa_id,
        nombre: nombreLimpio,
        descripcion: descripcion?.trim() || null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'empresa_id,nombre' }
    )
    .select('id')
    .single();
  if (upsertError) throw new Error(upsertError.message);

  // Reemplazo completo de items: la plantilla ES el snapshot.
  const { error: deleteError } = await admin
    .schema('core')
    .from('rol_plantilla_items')
    .delete()
    .eq('plantilla_id', plantilla.id);
  if (deleteError) throw new Error(deleteError.message);

  // permisos_rol es nullable en DB; rol_plantilla_items es NOT NULL.
  const { error: insertError } = await admin
    .schema('core')
    .from('rol_plantilla_items')
    .insert(
      permisos.map((p) => ({
        plantilla_id: plantilla.id,
        modulo_id: p.modulo_id,
        acceso_lectura: p.acceso_lectura ?? false,
        acceso_escritura: p.acceso_escritura ?? false,
      }))
    );
  if (insertError) throw new Error(insertError.message);

  revalidatePath('/settings/acceso');
  return { items: permisos.length };
}

export async function deleteRolPlantilla(plantilla_id: string): Promise<void> {
  await requireAdmin();
  const admin = getSupabaseAdminClient()!;
  const { error } = await admin
    .schema('core')
    .from('rol_plantillas')
    .delete()
    .eq('id', plantilla_id);
  if (error) throw new Error(error.message);
  revalidatePath('/settings/acceso');
}

// ── Permiso Rol (upsert) ───────────────────────────────────────────────────

export async function upsertPermisoRol(
  rol_id: string,
  modulo_id: string,
  acceso_lectura: boolean,
  acceso_escritura: boolean
): Promise<void> {
  await requireAdmin();
  const admin = getSupabaseAdminClient()!;
  const { error } = await admin
    .schema('core')
    .from('permisos_rol')
    .upsert(
      { rol_id, modulo_id, acceso_lectura, acceso_escritura },
      { onConflict: 'rol_id,modulo_id' }
    );
  if (error) throw new Error(error.message);
  revalidatePath('/settings/acceso');
}

/**
 * Upsert de varios permisos del mismo rol en una llamada — usado por la
 * matriz para activar un permiso JUNTO con sus requisitos de navegación
 * (`lib/permissions-deps.ts`, iniciativa accesos-intuitivos S1).
 */
export async function upsertPermisosRolBatch(
  rol_id: string,
  items: Array<{ modulo_id: string; acceso_lectura: boolean; acceso_escritura: boolean }>
): Promise<void> {
  await requireAdmin();
  if (items.length === 0) return;
  const admin = getSupabaseAdminClient()!;
  const { error } = await admin
    .schema('core')
    .from('permisos_rol')
    .upsert(
      items.map((i) => ({ rol_id, ...i })),
      { onConflict: 'rol_id,modulo_id' }
    );
  if (error) throw new Error(error.message);
  revalidatePath('/settings/acceso');
}

// ── Usuario CRUD (RBAC) ────────────────────────────────────────────────────

export async function createUsuarioCore(
  email: string,
  first_name: string,
  last_name?: string
): Promise<void> {
  await requireAdmin();
  const admin = getSupabaseAdminClient()!;
  const cleanEmail = email.toLowerCase().trim();

  // 1. Check if user already exists in core.usuarios
  const { data: existingUser } = await admin
    .schema('core')
    .from('usuarios')
    .select('id')
    .eq('email', cleanEmail)
    .maybeSingle();
  if (existingUser) throw new Error('Este correo ya está registrado');

  // 2. Check if user already exists in auth.users
  let authUserId: string | null = null;
  const { data: userList } = await admin.auth.admin.listUsers();
  const existingAuth = userList?.users?.find((u) => u.email?.toLowerCase() === cleanEmail);
  if (existingAuth) {
    authUserId = existingAuth.id;
  }

  // 3. If not in auth, send Supabase invite (magic link for auth)
  if (!authUserId) {
    const { data: inviteData, error: inviteError } =
      await admin.auth.admin.inviteUserByEmail(cleanEmail);
    if (inviteError) {
      throw new Error('Error al enviar invitación: ' + inviteError.message);
    }
    authUserId = inviteData?.user?.id ?? null;
  }
  if (!authUserId) throw new Error('No se pudo obtener el ID del usuario de autenticación');

  // 4. Insert into core.usuarios with the auth user id
  const { error } = await admin
    .schema('core')
    .from('usuarios')
    .insert({
      id: authUserId,
      email: cleanEmail,
      first_name: first_name.trim() || null,
      last_name: last_name?.trim() || null,
      rol: 'viewer',
      activo: true,
    });
  if (error) {
    if (error.code === '23505') throw new Error('Este correo ya está registrado');
    throw new Error(error.message);
  }

  // 5. NO welcome email here — it's sent when the first empresa is assigned
  revalidatePath('/settings/acceso');
}

/**
 * Actualiza nombre + apellido del usuario. Útil para usuarios existentes
 * cuyo perfil fue cargado con sólo first_name antes de que existiera
 * `last_name` (migración 20260528023539). Los documentos legales DILESA
 * imprimen `${first_name} ${last_name}`.
 */
export async function updateUsuarioNombre(
  id: string,
  first_name: string | null,
  last_name: string | null
): Promise<void> {
  await requireAdmin();
  const admin = getSupabaseAdminClient()!;
  const { error } = await admin
    .schema('core')
    .from('usuarios')
    .update({
      first_name: first_name?.trim() || null,
      last_name: last_name?.trim() || null,
    })
    .eq('id', id);
  if (error) throw new Error(error.message);
  revalidatePath('/settings/acceso');
}

// ── Usuario-Empresa access ─────────────────────────────────────────────────

/**
 * Otorga (o sanea) el acceso usuario↔empresa con rol obligatorio en el mismo
 * paso (accesos-intuitivos S2). Upsert: alta nueva, cambio de rol y saneo de
 * un acceso legacy con `rol_id NULL` son la misma operación. El rol se valida
 * server-side contra la empresa — la FK de `usuarios_empresas.rol_id` no
 * garantiza que el rol sea de la misma empresa.
 */
export async function grantUsuarioEmpresaAcceso(
  usuario_id: string,
  empresa_id: string,
  rol_id: string
): Promise<void> {
  await requireAdmin();
  const admin = getSupabaseAdminClient()!;

  const { data: rol, error: rolError } = await admin
    .schema('core')
    .from('roles')
    .select('id, empresa_id')
    .eq('id', rol_id)
    .maybeSingle();
  if (rolError) throw new Error(rolError.message);
  const invalido = validarRolParaEmpresa(rol_id, empresa_id, rol ? [rol] : []);
  if (invalido) throw new Error(invalido);

  const { error } = await admin
    .schema('core')
    .from('usuarios_empresas')
    .upsert({ usuario_id, empresa_id, rol_id }, { onConflict: 'usuario_id,empresa_id' });
  if (error) throw new Error(error.message);

  // Welcome email is sent manually by admin when setup is complete
  revalidatePath('/settings/acceso');
}

export async function revokeUsuarioEmpresaAcceso(
  usuario_id: string,
  empresa_id: string
): Promise<void> {
  await requireAdmin();
  const admin = getSupabaseAdminClient()!;
  const { error } = await admin
    .schema('core')
    .from('usuarios_empresas')
    .delete()
    .eq('usuario_id', usuario_id)
    .eq('empresa_id', empresa_id);
  if (error) throw new Error(error.message);
  revalidatePath('/settings/acceso');
}

// ── Welcome email via Resend ────────────────────────────────────────────────

const LOGO_MAP: Record<string, string> = {
  rdb: 'https://bsop.io/brand/rdb/isotipo.png',
  dilesa: 'https://bsop.io/brand/dilesa/isotipo.png',
  ansa: 'https://bsop.io/brand/ansa/isotipo.png',
};

async function sendWelcomeEmail(usuarioId: string): Promise<void> {
  const admin = getSupabaseAdminClient();
  if (!admin) return;

  const resendKey = process.env.RESEND_API_KEY;
  if (!resendKey) {
    console.error('[welcome-email] RESEND_API_KEY not found');
    return;
  }

  // Fetch user info
  const { data: usuario } = await admin
    .schema('core')
    .from('usuarios')
    .select('email, first_name')
    .eq('id', usuarioId)
    .maybeSingle();
  if (!usuario) {
    console.error('[welcome-email] User not found:', usuarioId);
    return;
  }

  const firstName = usuario.first_name || usuario.email;
  const email = usuario.email;

  // Fetch user's empresa access with role and modules
  const { data: usuarioEmpresas } = await admin
    .schema('core')
    .from('usuarios_empresas')
    .select('empresa_id, roles:rol_id(nombre), empresas:empresa_id(slug, nombre)')
    .eq('usuario_id', usuarioId);

  const empresas: WelcomeEmpresa[] = [];

  if (usuarioEmpresas && usuarioEmpresas.length > 0) {
    for (const ue of usuarioEmpresas) {
      const empresaData = ue.empresas as unknown as { slug: string; nombre: string } | null;
      const rolData = ue.roles as unknown as { nombre: string } | null;
      if (!empresaData) continue;

      // Fetch modules for this empresa's role
      let modulos: string[] = [];
      if (rolData) {
        const { data: rolRows } = await admin
          .schema('core')
          .from('roles')
          .select('id')
          .eq('nombre', rolData.nombre)
          .eq('empresa_id', ue.empresa_id)
          .maybeSingle();

        if (rolRows) {
          const { data: perms } = await admin
            .schema('core')
            .from('permisos_rol')
            .select('modulo_id, modulos:modulo_id(nombre)')
            .eq('rol_id', rolRows.id)
            .eq('acceso_lectura', true);

          modulos = (perms ?? [])
            .map(
              (p: Record<string, unknown>) =>
                (p.modulos as unknown as { nombre: string } | null)?.nombre ?? ''
            )
            .filter(Boolean);
        }
      }

      empresas.push({
        nombre: empresaData.nombre,
        logoUrl: LOGO_MAP[empresaData.slug] ?? 'https://bsop.io/logo-bsop.jpg',
        rol: rolData?.nombre ?? 'Sin rol asignado',
        modulos,
      });
    }
  }

  if (empresas.length === 0) {
    empresas.push({
      nombre: 'BSOP',
      logoUrl: 'https://bsop.io/logo-bsop.jpg',
      rol: 'Pendiente de asignación',
      modulos: ['Por asignar'],
    });
  }

  const html = generateWelcomeHtml(firstName, empresas);

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${resendKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: 'BSOP <noreply@bsop.io>',
      to: [email],
      subject: '¡Bienvenido a BSOP! Tu cuenta está lista',
      html,
    }),
  });

  const result = await res.json();
  if (!res.ok) {
    console.error('[welcome-email] Resend error:', JSON.stringify(result));
    throw new Error('Error de Resend: ' + (result.message ?? JSON.stringify(result)));
  }
  console.log('[welcome-email] Sent:', result.id, 'to', email);
}

// ── Send welcome email manually ──────────────────────────────────────────────

export async function sendWelcomeEmailAction(
  usuario_id: string
): Promise<{ success: boolean; error?: string }> {
  await requireAdmin();
  try {
    await sendWelcomeEmail(usuario_id);
    // Record timestamp
    const admin = getSupabaseAdminClient()!;
    await admin
      .schema('core')
      .from('usuarios')
      .update({ welcome_sent_at: new Date().toISOString() })
      .eq('id', usuario_id);
    revalidatePath('/settings/acceso');
    return { success: true };
  } catch (err) {
    return { success: false, error: (err as Error)?.message ?? 'Error desconocido' };
  }
}

export async function upsertExcepcionUsuario(datos: ExcepcionUsuario): Promise<void> {
  await requireAdmin();
  const admin = getSupabaseAdminClient()!;
  const { error } = await admin
    .schema('core')
    .from('permisos_usuario_excepcion')
    .upsert(datos, { onConflict: 'usuario_id,empresa_id,modulo_id' });
  if (error) throw new Error(error.message);
  revalidatePath('/settings/acceso');
}

export async function deleteExcepcionUsuario(
  usuario_id: string,
  empresa_id: string,
  modulo_id: string
): Promise<void> {
  await requireAdmin();
  const admin = getSupabaseAdminClient()!;
  const { error } = await admin
    .schema('core')
    .from('permisos_usuario_excepcion')
    .delete()
    .eq('usuario_id', usuario_id)
    .eq('empresa_id', empresa_id)
    .eq('modulo_id', modulo_id);
  if (error) throw new Error(error.message);
  revalidatePath('/settings/acceso');
}
