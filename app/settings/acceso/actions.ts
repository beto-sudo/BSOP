'use server';

import { revalidatePath } from 'next/cache';
import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import { getSupabaseAdminClient } from '@/lib/supabase-admin';
import { generateWelcomeHtml, type WelcomeEmpresa } from '@/lib/welcome-email';

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
export type Modulo = { id: string; slug: string; nombre: string; empresa_id: string };
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
  activo: boolean;
  welcome_sent_at: string | null;
};
export type UsuarioEmpresa = { usuario_id: string; empresa_id: string; rol_id: string | null };
export type ExcepcionUsuario = {
  usuario_id: string;
  empresa_id: string;
  modulo_id: string;
  acceso_lectura: boolean;
  acceso_escritura: boolean;
};

async function requireAdmin(): Promise<void> {
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

export async function createRolRecord(nombre: string, empresa_id: string): Promise<void> {
  await requireAdmin();
  const admin = getSupabaseAdminClient()!;
  const { error } = await admin
    .schema('core')
    .from('roles')
    .insert({ nombre: nombre.trim(), empresa_id });
  if (error) throw new Error(error.message);
  revalidatePath('/settings/acceso');
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

// ── Usuario CRUD (RBAC) ────────────────────────────────────────────────────

export async function createUsuarioCore(email: string, first_name: string): Promise<void> {
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

// ── Usuario-Empresa access ─────────────────────────────────────────────────

export async function setUsuarioEmpresaAcceso(
  usuario_id: string,
  empresa_id: string,
  has_access: boolean
): Promise<void> {
  await requireAdmin();
  const admin = getSupabaseAdminClient()!;

  if (has_access) {
    const { error } = await admin
      .schema('core')
      .from('usuarios_empresas')
      .upsert({ usuario_id, empresa_id, rol_id: null }, { onConflict: 'usuario_id,empresa_id' });
    if (error) throw new Error(error.message);
    // No email here — sent when role is assigned
  } else {
    const { error } = await admin
      .schema('core')
      .from('usuarios_empresas')
      .delete()
      .eq('usuario_id', usuario_id)
      .eq('empresa_id', empresa_id);
    if (error) throw new Error(error.message);
  }
  revalidatePath('/settings/acceso');
}

export async function updateUsuarioEmpresaRol(
  usuario_id: string,
  empresa_id: string,
  rol_id: string | null
): Promise<void> {
  await requireAdmin();
  const admin = getSupabaseAdminClient()!;
  const { error } = await admin
    .schema('core')
    .from('usuarios_empresas')
    .update({ rol_id })
    .eq('usuario_id', usuario_id)
    .eq('empresa_id', empresa_id);
  if (error) throw new Error(error.message);

  // Welcome email is sent manually by admin when setup is complete
  revalidatePath('/settings/acceso');
}

// ── Welcome email via Resend ────────────────────────────────────────────────

const LOGO_MAP: Record<string, string> = {
  rdb: 'https://bsop.io/logos/rdb.jpg',
  dilesa: 'https://bsop.io/logos/dilesa.jpg',
  ansa: 'https://bsop.io/logos/ansa.jpg',
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
