import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import { getSupabaseAdminClient } from '@/lib/supabase-admin';
import { AccesoClient } from './acceso-client';
import type {
  Empresa,
  Modulo,
  RolRecord,
  PermisoRol,
  UsuarioCore,
  UsuarioEmpresa,
  ExcepcionUsuario,
} from './actions';

export default async function AccesoPage() {
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
  const currentEmail = user?.email?.toLowerCase() ?? '';

  const admin = getSupabaseAdminClient();
  if (!admin) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <h2 className="text-xl font-semibold dark:text-white text-[var(--text)]">
          Error de configuración
        </h2>
        <p className="mt-2 text-sm dark:text-white/55 text-[var(--text)]/55">
          SUPABASE_SERVICE_ROLE_KEY no está configurada.
        </p>
      </div>
    );
  }

  // Admin check — queries legacy `rol` column; falls back to restricted if absent
  let isAdmin = false;
  if (currentEmail) {
    const { data } = await admin
      .schema('core')
      .from('usuarios')
      .select('rol')
      .eq('email', currentEmail)
      .maybeSingle();
    isAdmin = (data as { rol?: string } | null)?.rol === 'admin';
  }

  if (!isAdmin) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <div className="text-4xl">🔒</div>
        <h2 className="mt-4 text-xl font-semibold dark:text-white text-[var(--text)]">
          Acceso restringido
        </h2>
        <p className="mt-2 text-sm dark:text-white/55 text-[var(--text)]/55">
          Solo los administradores pueden gestionar el acceso de usuarios.
        </p>
      </div>
    );
  }

  const [
    { data: empresas },
    { data: modulos },
    { data: roles },
    { data: permisosRol },
    { data: usuarios },
    { data: usuariosEmpresas },
    { data: excepciones },
  ] = await Promise.all([
    admin.schema('core').from('empresas').select('id, nombre, slug').order('nombre'),
    admin.schema('core').from('modulos').select('id, slug, nombre').order('nombre'),
    admin.schema('core').from('roles').select('id, nombre, empresa_id').order('nombre'),
    admin
      .schema('core')
      .from('permisos_rol')
      .select('rol_id, modulo_id, acceso_lectura, acceso_escritura'),
    admin
      .schema('core')
      .from('usuarios')
      .select('id, email, first_name, activo, welcome_sent_at')
      .order('email'),
    admin.schema('core').from('usuarios_empresas').select('usuario_id, empresa_id, rol_id'),
    admin
      .schema('core')
      .from('permisos_usuario_excepcion')
      .select('usuario_id, empresa_id, modulo_id, acceso_lectura, acceso_escritura'),
  ]);

  return (
    <AccesoClient
      empresas={(empresas ?? []) as Empresa[]}
      modulos={(modulos ?? []) as Modulo[]}
      roles={(roles ?? []) as RolRecord[]}
      permisosRol={(permisosRol ?? []) as PermisoRol[]}
      usuarios={(usuarios ?? []) as UsuarioCore[]}
      usuariosEmpresas={(usuariosEmpresas ?? []) as UsuarioEmpresa[]}
      excepciones={(excepciones ?? []) as ExcepcionUsuario[]}
    />
  );
}
