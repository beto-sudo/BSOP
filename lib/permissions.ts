'use client';

import type { SupabaseClient } from '@supabase/supabase-js';

// ── Types ──────────────────────────────────────────────────────────────────

export type AccessLevel = { read: boolean; write: boolean };

export type UserPermissions = {
  isAdmin: boolean;
  loading: boolean;
  email: string | null;
  /** empresa slug → access level */
  empresas: Map<string, AccessLevel>;
  /** modulo slug → access level */
  modulos: Map<string, AccessLevel>;
};

// ── Route → Module/Empresa mapping ────────────────────────────────────────

/**
 * Maps a page route to its modulo slug (for module-level checks).
 *
 * Source of truth — do NOT duplicate this map in other files. Import from here.
 */
export const ROUTE_TO_MODULE: Record<string, string> = {
  // DILESA
  '/dilesa/admin/tasks': 'dilesa.admin.tasks',
  '/dilesa/admin/juntas': 'dilesa.admin.juntas',
  '/dilesa/admin/documentos': 'dilesa.admin.documentos',
  '/dilesa/rh/empleados': 'dilesa.rh.empleados',
  '/dilesa/rh/puestos': 'dilesa.rh.puestos',
  '/dilesa/rh/departamentos': 'dilesa.rh.departamentos',

  // RDB — home + operaciones
  '/rdb': 'rdb.home',
  '/rdb/ventas': 'rdb.ventas',
  '/rdb/cortes': 'rdb.cortes',
  '/rdb/productos': 'rdb.productos',
  '/rdb/inventario': 'rdb.inventario',
  '/rdb/proveedores': 'rdb.proveedores',
  '/rdb/requisiciones': 'rdb.requisiciones',
  '/rdb/playtomic': 'rdb.playtomic',
  '/rdb/ordenes-compra': 'rdb.ordenes_compra',
  '/rdb/tasks': 'rdb.tasks',

  // RDB — administración
  '/rdb/admin/tasks': 'rdb.admin.tasks',
  '/rdb/admin/juntas': 'rdb.admin.juntas',
  '/rdb/admin/documentos': 'rdb.admin.documentos',
  '/rdb/rh/empleados': 'rdb.rh.empleados',
  '/rdb/rh/puestos': 'rdb.rh.puestos',
  '/rdb/rh/departamentos': 'rdb.rh.departamentos',

  // Settings
  '/settings/acceso': 'settings.acceso',
};

/** Maps a nav section href to its empresa slug */
export const ROUTE_TO_EMPRESA: Record<string, string> = {
  '/rdb': 'rdb',
  '/coda': 'coda',
  '/family': 'familia',
  '/travel': 'familia',
  '/health': 'familia',
  '/settings': 'settings',
};

/** These routes require admin (usuario.rol === 'admin') */
export const ADMIN_ONLY_ROUTES = new Set(['/agents', '/usage', '/rnd']);

// ── Fetcher ────────────────────────────────────────────────────────────────

export async function fetchPermissionsForUserId(
  supabase: SupabaseClient,
  userId: string,
): Promise<UserPermissions> {
  const empty: UserPermissions = {
    isAdmin: false,
    loading: false,
    email: null,
    empresas: new Map(),
    modulos: new Map(),
  };

  // Look up core.usuarios by ID
  const { data: coreUser } = await supabase
    .schema('core' as any)
    .from('usuarios')
    .select('id, email, rol, activo')
    .eq('id', userId)
    .maybeSingle();

  if (!coreUser || !coreUser.activo) return empty;

  const email = coreUser.email;

  // Admin bypass
  if (coreUser.rol === 'admin') {
    return { isAdmin: true, loading: false, email, empresas: new Map(), modulos: new Map() };
  }

  // Fetch empresa access + roles + module permissions
  const [empresasRes, modulosRes, permisosRolRes, excepcionesRes, allEmpresasRes] =
    await Promise.all([
      supabase
        .schema('core' as any)
        .from('usuarios_empresas')
        .select('empresa_id, rol_id, activo')
        .eq('usuario_id', coreUser.id)
        .eq('activo', true),
      supabase.schema('core' as any).from('modulos').select('id, slug'),
      supabase
        .schema('core' as any)
        .from('permisos_rol')
        .select('rol_id, modulo_id, acceso_lectura, acceso_escritura'),
      supabase
        .schema('core' as any)
        .from('permisos_usuario_excepcion')
        .select('empresa_id, modulo_id, acceso_lectura, acceso_escritura')
        .eq('usuario_id', coreUser.id),
      supabase.schema('core' as any).from('empresas').select('id, slug'),
    ]);

  const userEmpresas = empresasRes.data ?? [];
  const allModulos = modulosRes.data ?? [];
  const allPermisos = permisosRolRes.data ?? [];
  const userExcepciones = excepcionesRes.data ?? [];
  const allEmpresas = allEmpresasRes.data ?? [];

  const empresaIdToSlug = new Map<string, string>();
  for (const e of allEmpresas) empresaIdToSlug.set(e.id, e.slug);
  const moduloIdToSlug = new Map<string, string>();
  for (const m of allModulos) moduloIdToSlug.set(m.id, m.slug);

  const empresas = new Map<string, AccessLevel>();
  for (const ue of userEmpresas) {
    const slug = empresaIdToSlug.get(ue.empresa_id);
    if (slug) empresas.set(slug, { read: true, write: true });
  }

  const modulos = new Map<string, AccessLevel>();
  for (const ue of userEmpresas) {
    if (!ue.rol_id) continue;
    const rolePerms = allPermisos.filter((p: any) => p.rol_id === ue.rol_id);
    for (const perm of rolePerms) {
      const moduloSlug = moduloIdToSlug.get(perm.modulo_id);
      if (!moduloSlug) continue;
      modulos.set(moduloSlug, { read: perm.acceso_lectura, write: perm.acceso_escritura });
    }
  }

  for (const exc of userExcepciones) {
    const moduloSlug = moduloIdToSlug.get(exc.modulo_id);
    if (!moduloSlug) continue;
    modulos.set(moduloSlug, { read: exc.acceso_lectura, write: exc.acceso_escritura });
  }

  return { isAdmin: false, loading: false, email, empresas, modulos };
}

export async function fetchUserPermissions(
  supabase: SupabaseClient,
): Promise<UserPermissions> {
  const empty: UserPermissions = {
    isAdmin: false,
    loading: false,
    email: null,
    empresas: new Map(),
    modulos: new Map(),
  };

  // 1. Get current user
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) return empty;

  const email = user.email.toLowerCase();

  // 2. Look up core.usuarios
  const { data: coreUser } = await supabase
    .schema('core' as any)
    .from('usuarios')
    .select('id, rol, activo')
    .eq('email', email)
    .maybeSingle();

  if (!coreUser || !coreUser.activo) return { ...empty, email };

  // 3. Admin bypass
  if (coreUser.rol === 'admin') {
    return { isAdmin: true, loading: false, email, empresas: new Map(), modulos: new Map() };
  }

  // 4. Fetch empresa access + roles + module permissions in parallel
  const [empresasRes, modulosRes, permisosRolRes, excepcionesRes, allEmpresasRes] =
    await Promise.all([
      supabase
        .schema('core' as any)
        .from('usuarios_empresas')
        .select('empresa_id, rol_id, activo')
        .eq('usuario_id', coreUser.id)
        .eq('activo', true),
      supabase.schema('core' as any).from('modulos').select('id, slug'),
      supabase
        .schema('core' as any)
        .from('permisos_rol')
        .select('rol_id, modulo_id, acceso_lectura, acceso_escritura'),
      supabase
        .schema('core' as any)
        .from('permisos_usuario_excepcion')
        .select('empresa_id, modulo_id, acceso_lectura, acceso_escritura')
        .eq('usuario_id', coreUser.id),
      supabase.schema('core' as any).from('empresas').select('id, slug'),
    ]);

  const userEmpresas = empresasRes.data ?? [];
  const allModulos = modulosRes.data ?? [];
  const allPermisos = permisosRolRes.data ?? [];
  const userExcepciones = excepcionesRes.data ?? [];
  const allEmpresas = allEmpresasRes.data ?? [];

  // Build lookup maps
  const empresaIdToSlug = new Map<string, string>();
  for (const e of allEmpresas) empresaIdToSlug.set(e.id, e.slug);

  const moduloIdToSlug = new Map<string, string>();
  for (const m of allModulos) moduloIdToSlug.set(m.id, m.slug);

  // 5. Build empresa-level access
  const empresas = new Map<string, AccessLevel>();
  for (const ue of userEmpresas) {
    const slug = empresaIdToSlug.get(ue.empresa_id);
    if (slug) {
      empresas.set(slug, { read: true, write: true }); // has access to the empresa
    }
  }

  // 6. Build module-level access from role
  const modulos = new Map<string, AccessLevel>();

  for (const ue of userEmpresas) {
    if (!ue.rol_id) continue;

    // Find role permisos
    const rolePerms = allPermisos.filter((p: any) => p.rol_id === ue.rol_id);

    for (const perm of rolePerms) {
      const moduloSlug = moduloIdToSlug.get(perm.modulo_id);
      if (!moduloSlug) continue;
      modulos.set(moduloSlug, {
        read: perm.acceso_lectura,
        write: perm.acceso_escritura,
      });
    }
  }

  // 7. Apply exceptions (override role-based)
  for (const exc of userExcepciones) {
    const moduloSlug = moduloIdToSlug.get(exc.modulo_id);
    if (!moduloSlug) continue;
    modulos.set(moduloSlug, {
      read: exc.acceso_lectura,
      write: exc.acceso_escritura,
    });
  }

  return { isAdmin: false, loading: false, email, empresas, modulos };
}

// ── Helpers ────────────────────────────────────────────────────────────────

export function canAccessEmpresa(
  perms: UserPermissions,
  empresaSlug: string,
): boolean {
  if (perms.isAdmin) return true;
  return perms.empresas.has(empresaSlug);
}

export function canAccessModulo(
  perms: UserPermissions,
  moduloSlug: string,
  mode: 'read' | 'write' = 'read',
): boolean {
  if (perms.isAdmin) return true;
  const access = perms.modulos.get(moduloSlug);
  if (!access) return false;
  return mode === 'read' ? access.read : access.write;
}

export function isAdminOnly(pathname: string): boolean {
  return ADMIN_ONLY_ROUTES.has(pathname) ||
    Array.from(ADMIN_ONLY_ROUTES).some((r) => pathname.startsWith(`${r}/`));
}
