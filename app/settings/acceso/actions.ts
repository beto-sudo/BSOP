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
