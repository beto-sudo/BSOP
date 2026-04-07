'use server';

import { revalidatePath } from 'next/cache';
import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import { getSupabaseAdminClient } from '@/lib/supabase-admin';

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
export type Modulo = { id: string; slug: string; nombre: string };
export type RolRecord = { id: string; nombre: string; empresa_id: string };
export type PermisoRol = {
  rol_id: string;
  modulo_id: string;
  acceso_lectura: boolean;
  acceso_escritura: boolean;
};
export type UsuarioCore = { id: string; email: string; first_name: string | null };
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
    },
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

  if (data?.rol !== 'admin') throw new Error('Solo los administradores pueden realizar esta acción');
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
  acceso_escritura: boolean,
): Promise<void> {
  await requireAdmin();
  const admin = getSupabaseAdminClient()!;
  const { error } = await admin
    .schema('core')
    .from('permisos_rol')
    .upsert({ rol_id, modulo_id, acceso_lectura, acceso_escritura }, { onConflict: 'rol_id,modulo_id' });
  if (error) throw new Error(error.message);
  revalidatePath('/settings/acceso');
}

// ── Usuario CRUD (RBAC) ────────────────────────────────────────────────────

export async function createUsuarioCore(email: string, first_name: string): Promise<void> {
  await requireAdmin();
  const admin = getSupabaseAdminClient()!;
  const { error } = await admin
    .schema('core')
    .from('usuarios')
    .insert({
      email: email.toLowerCase().trim(),
      first_name: first_name.trim() || null,
      rol: 'viewer',
      activo: true,
    });
  if (error) {
    if (error.code === '23505') throw new Error('Este correo ya está registrado');
    throw new Error(error.message);
  }
  revalidatePath('/settings/acceso');
}

// ── Usuario-Empresa access ─────────────────────────────────────────────────

export async function setUsuarioEmpresaAcceso(
  usuario_id: string,
  empresa_id: string,
  has_access: boolean,
): Promise<void> {
  await requireAdmin();
  const admin = getSupabaseAdminClient()!;
  if (has_access) {
    const { error } = await admin
      .schema('core')
      .from('usuarios_empresas')
      .upsert({ usuario_id, empresa_id, rol_id: null }, { onConflict: 'usuario_id,empresa_id' });
    if (error) throw new Error(error.message);
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
  rol_id: string | null,
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
  revalidatePath('/settings/acceso');
}

// ── Excepciones de módulo ──────────────────────────────────────────────────

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
  modulo_id: string,
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
