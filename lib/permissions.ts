'use client';

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/supabase';

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
  '/dilesa/rh/personal': 'dilesa.rh.empleados',
  '/dilesa/rh/puestos': 'dilesa.rh.puestos',
  '/dilesa/rh/departamentos': 'dilesa.rh.departamentos',
  '/dilesa/proveedores': 'dilesa.proveedores',
  '/dilesa/portafolio': 'dilesa.portafolio',
  // Proyectos es un hub con 2 tabs (Activos / Anteproyectos) — iniciativa
  // `dilesa-proyectos-anteproyectos` Sprint 1. El padre `dilesa.proyectos`
  // queda como umbrella; cada tab tiene su sub-slug (ADR-030 SS2). La URL
  // default mapea al sub-slug del primer tab (`.activos`).
  '/dilesa/proyectos': 'dilesa.proyectos.activos',
  '/dilesa/proyectos/anteproyectos': 'dilesa.proyectos.anteproyectos',
  // Tab Gasto del detalle de proyecto (iniciativa `dilesa-flujo-gasto` S2):
  // el Costeo mudado de Construcción, gobernado por su propio sub-slug.
  '/dilesa/proyectos/[id]/gasto': 'dilesa.proyectos.gasto',
  // Ventas es un hub con 5 tabs (sprint tabs-hub). El padre
  // `dilesa.ventas` queda como umbrella; cada tab tiene su sub-slug
  // (ADR-030 SS2). La URL default mapea al sub-slug del primer tab
  // (`.lista`). Inventario quedó como tab del hub — antes era top-level.
  '/dilesa/ventas': 'dilesa.ventas.lista',
  '/dilesa/ventas/inventario': 'dilesa.ventas.inventario',
  '/dilesa/ventas/fases': 'dilesa.ventas.fases',
  '/dilesa/ventas/clientes': 'dilesa.ventas.clientes',
  '/dilesa/ventas/vendedores': 'dilesa.ventas.vendedores',
  // Cobranza (CxC) es un hub con 2 tabs. La URL default mapea al sub-slug
  // del primer tab (`.pagos`). ADR-030 SS2.
  '/dilesa/cobranza': 'dilesa.cobranza.pagos',
  '/dilesa/cobranza/aging': 'dilesa.cobranza.aging',
  // Saldos Bancos — hub con 2 tabs (iniciativa `conciliacion-bancaria` v0,
  // ADR-030). El padre `dilesa.saldos-bancos` queda como umbrella; la URL
  // default mapea al sub-slug del primer tab (`.saldos`).
  '/dilesa/saldos-bancos': 'dilesa.saldos-bancos.saldos',
  '/dilesa/saldos-bancos/estados': 'dilesa.saldos-bancos.estados',
  // RUV (Registro Único de Vivienda · INFONAVIT) — módulo plano. Iniciativa
  // `dilesa-ruv`. Capa de oferta + checklist de documentos encima de
  // dilesa.construccion (que ya tiene CUV + hitos del trámite por vivienda).
  '/dilesa/ruv': 'dilesa.ruv',
  // CxP (Cuentas por Pagar) es un hub con 5 tabs (ADR-030). El padre
  // `dilesa.cxp` queda como umbrella en sidebar; cada tab tiene su sub-slug.
  // La URL default `/dilesa/cxp` mapea al sub-slug del primer tab
  // (`.facturas`). Programación/Pagos = Sprint 4. Espejo de `rdb.cxp`.
  // Ver docs/planning/cxp.md.
  '/dilesa/cxp': 'dilesa.cxp.facturas',
  '/dilesa/cxp/programacion': 'dilesa.cxp.programacion',
  '/dilesa/cxp/pagos': 'dilesa.cxp.pagos',
  '/dilesa/cxp/aging': 'dilesa.cxp.aging',
  '/dilesa/cxp/proveedores': 'dilesa.cxp.proveedores',
  // Construcción es un hub con 4 tabs (sprint tabs+protos). El padre
  // `dilesa.construccion` queda como umbrella; cada tab tiene su sub-slug
  // (ADR-030 SS2). La URL default mapea al sub-slug del primer tab.
  '/dilesa/construccion': 'dilesa.construccion.obras',
  '/dilesa/construccion/contratos': 'dilesa.construccion.contratos',
  '/dilesa/construccion/contratistas': 'dilesa.construccion.contratistas',
  '/dilesa/construccion/prototipos': 'dilesa.construccion.prototipos',
  '/dilesa/construccion/estimaciones': 'dilesa.construccion.estimaciones',
  '/dilesa/construccion/costeo': 'dilesa.construccion.costeo',
  // Captura por fase — sub-slugs ADR-030. Cada URL apunta al sub-slug que
  // gobierna acceso a esa fase. Ver docs/planning/dilesa-ventas-captura.md.
  '/dilesa/ventas/nueva': 'dilesa.ventas.fase01_solicitud',
  '/dilesa/ventas/[id]/capturar/2-asignada': 'dilesa.ventas.autorizar',
  '/dilesa/ventas/[id]/capturar/3-formalizada': 'dilesa.ventas.fase03_formalizada',
  // Construcción — captura (sub-slugs ADR-030 — Sprint 4).
  // Ver docs/planning/dilesa-construccion.md "Sprint 4 — UI captura".
  // El sub-slug `dilesa.construccion.arrancar` quedó deprecado post-refactor
  // (un arranque siempre va dentro del contrato — el form combinado vive en
  // /contratos/nuevo). El slug en DB queda como vestigio inofensivo.
  // El sub-slug `dilesa.construccion.tareas` sigue vigente: gobierna write
  // access para palomear tareas inline en /construccion/[id] (post-2026-05-25
  // la página /registrar-tarea fue removida en favor del click directo).
  '/dilesa/construccion/contratos/nuevo': 'dilesa.construccion.contratos',
  '/dilesa/construccion/contratos/nuevo-obra': 'dilesa.construccion.contratos',
  // Compras es un hub con 4 tabs (`dilesa-compras`). El padre
  // `dilesa.compras` es umbrella del sidebar; cada tab tiene su sub-slug
  // (ADR-030). La URL default mapea al sub-slug del primer tab (Órdenes).
  // Modelo constructora-first: la línea ancla concepto+partida y la recepción
  // devenga contra la partida. Ver docs/planning/dilesa-compras.md.
  '/dilesa/compras': 'dilesa.compras.ordenes',
  '/dilesa/compras/requisiciones': 'dilesa.compras.requisiciones',
  '/dilesa/compras/cotizaciones': 'dilesa.compras.cotizaciones',
  '/dilesa/compras/recepciones': 'dilesa.compras.recepciones',
  // Costo final de materiales por vivienda terminada (puente CONTPAQ →
  // futuro módulo de control de materiales). Write re-validado server-side
  // en dilesa.fn_construccion_capturar_costo_materiales.
  '/dilesa/compras/costo-materiales': 'dilesa.compras.costo_materiales',
  // Manual de usuario (iniciativa `manual-usuario`). Módulo top-level visible
  // para todo miembro de DILESA; la ayuda contextual por pantalla hereda el
  // gate de cada módulo. Ver docs/planning/manual-usuario.md.
  '/dilesa/manual': 'dilesa.manual',

  // RDB — home + operaciones
  '/rdb/home': 'rdb.home',
  '/rdb/ventas': 'rdb.ventas',
  '/rdb/cortes': 'rdb.cortes',
  // Productos: padre `rdb.productos` + 5 sub-slugs por tab (sub-slug pattern,
  // ver `submodule-permissions` iniciativa). Cada URL apunta a su sub-slug.
  '/rdb/productos': 'rdb.productos.catalogo',
  '/rdb/productos/categorias': 'rdb.productos.categorias',
  '/rdb/productos/recetas': 'rdb.productos.recetas',
  '/rdb/productos/auditoria': 'rdb.productos.auditoria',
  '/rdb/productos/analisis': 'rdb.productos.analisis',
  // Inventario: padre `rdb.inventario` + 3 sub-slugs por tab.
  '/rdb/inventario': 'rdb.inventario.stock',
  '/rdb/inventario/movimientos': 'rdb.inventario.movimientos',
  '/rdb/inventario/levantamientos': 'rdb.inventario.levantamientos',
  '/rdb/proveedores': 'rdb.proveedores',
  '/rdb/requisiciones': 'rdb.requisiciones',
  '/rdb/playtomic': 'rdb.playtomic',
  '/rdb/ordenes-compra': 'rdb.ordenes_compra',
  '/rdb/recepciones': 'rdb.recepciones',

  // RDB — administración
  '/rdb/admin/tasks': 'rdb.admin.tasks',
  '/rdb/admin/juntas': 'rdb.admin.juntas',
  '/rdb/admin/documentos': 'rdb.admin.documentos',
  // CxP (Cuentas por Pagar) es un hub con 5 tabs (ADR-030). El padre
  // `rdb.cxp` queda como umbrella en sidebar; cada tab tiene su sub-slug
  // que gobierna acceso real al contenido. La URL default `/rdb/cxp` mapea
  // al sub-slug del primer tab (`.facturas`). Programación/Pagos = Sprint 4.
  // Ver docs/planning/cxp.md.
  '/rdb/cxp': 'rdb.cxp.facturas',
  '/rdb/cxp/programacion': 'rdb.cxp.programacion',
  '/rdb/cxp/pagos': 'rdb.cxp.pagos',
  '/rdb/cxp/aging': 'rdb.cxp.aging',
  '/rdb/cxp/proveedores': 'rdb.cxp.proveedores',
  '/rdb/rh/personal': 'rdb.rh.empleados',
  '/rdb/rh/puestos': 'rdb.rh.puestos',
  '/rdb/rh/departamentos': 'rdb.rh.departamentos',

  // Settings
  // `/settings/empresas` pasó de admin-only a RBAC por módulo: el módulo
  // gobierna el acceso a la página; QUÉ empresas ve cada quien lo filtra la
  // UI desde core.usuarios_empresas. Ver migración 20260602160000.
  '/settings/empresas': 'settings.empresas',
  '/settings/acceso': 'settings.acceso',
  '/settings/notificaciones': 'settings.notificaciones',
};

/**
 * Landing de hub (URL default con routed tabs, ADR-030) → slug del módulo
 * padre umbrella. La visibilidad del hub en sidebar/paneles NO la decide el
 * sub-slug del primer tab (a eso mapea `ROUTE_TO_MODULE`, y así debe seguir:
 * el manual deriva sus docs de ahí) sino el padre **o cualquier sub-slug**:
 * un rol con acceso a Requisiciones pero no a Órdenes debe ver el hub Compras.
 * Consumido por `canSeeNavRoute`. Al liberar un hub nuevo, agregar su entrada
 * aquí (el test de sync en `permissions.test.ts` lo valida).
 */
export const HUB_PARENT_BY_ROUTE: Record<string, string> = {
  '/dilesa/proyectos': 'dilesa.proyectos',
  '/dilesa/ventas': 'dilesa.ventas',
  '/dilesa/cobranza': 'dilesa.cobranza',
  '/dilesa/cxp': 'dilesa.cxp',
  '/dilesa/construccion': 'dilesa.construccion',
  '/dilesa/compras': 'dilesa.compras',
  '/dilesa/saldos-bancos': 'dilesa.saldos-bancos',
  '/rdb/cxp': 'rdb.cxp',
  '/rdb/productos': 'rdb.productos',
  '/rdb/inventario': 'rdb.inventario',
};

/** Maps a nav section href to its empresa slug */
export const ROUTE_TO_EMPRESA: Record<string, string> = {
  '/rdb': 'rdb',
  '/family': 'sanren',
  '/travel': 'sanren',
  '/health': 'sanren',
  '/peptides': 'sanren',
  '/personas-fisicas': 'personas_fisicas',
  '/settings': 'settings',
};

/** These routes require admin (usuario.rol === 'admin') */
export const ADMIN_ONLY_ROUTES = new Set(['/rnd']);

// ── Fetcher ────────────────────────────────────────────────────────────────

export async function fetchPermissionsForUserId(
  supabase: SupabaseClient<Database>,
  userId: string
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
    .schema('core')
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
        .schema('core')
        .from('usuarios_empresas')
        .select('empresa_id, rol_id, activo')
        .eq('usuario_id', coreUser.id)
        .eq('activo', true),
      supabase.schema('core').from('modulos').select('id, slug, empresa_id'),
      supabase
        .schema('core')
        .from('permisos_rol')
        .select('rol_id, modulo_id, acceso_lectura, acceso_escritura'),
      supabase
        .schema('core')
        .from('permisos_usuario_excepcion')
        .select('empresa_id, modulo_id, acceso_lectura, acceso_escritura')
        .eq('usuario_id', coreUser.id),
      supabase.schema('core').from('empresas').select('id, slug'),
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
    const rolePerms = allPermisos.filter((p) => p.rol_id === ue.rol_id);
    for (const perm of rolePerms) {
      const moduloSlug = moduloIdToSlug.get(perm.modulo_id);
      if (!moduloSlug) continue;
      modulos.set(moduloSlug, {
        read: perm.acceso_lectura ?? false,
        write: perm.acceso_escritura ?? false,
      });
    }
  }

  for (const exc of userExcepciones) {
    const moduloSlug = moduloIdToSlug.get(exc.modulo_id);
    if (!moduloSlug) continue;
    modulos.set(moduloSlug, {
      read: exc.acceso_lectura ?? false,
      write: exc.acceso_escritura ?? false,
    });
  }

  return { isAdmin: false, loading: false, email, empresas, modulos };
}

export async function fetchUserPermissions(
  supabase: SupabaseClient<Database>
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
    .schema('core')
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
        .schema('core')
        .from('usuarios_empresas')
        .select('empresa_id, rol_id, activo')
        .eq('usuario_id', coreUser.id)
        .eq('activo', true),
      supabase.schema('core').from('modulos').select('id, slug, empresa_id'),
      supabase
        .schema('core')
        .from('permisos_rol')
        .select('rol_id, modulo_id, acceso_lectura, acceso_escritura'),
      supabase
        .schema('core')
        .from('permisos_usuario_excepcion')
        .select('empresa_id, modulo_id, acceso_lectura, acceso_escritura')
        .eq('usuario_id', coreUser.id),
      supabase.schema('core').from('empresas').select('id, slug'),
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
    const rolePerms = allPermisos.filter((p) => p.rol_id === ue.rol_id);

    for (const perm of rolePerms) {
      const moduloSlug = moduloIdToSlug.get(perm.modulo_id);
      if (!moduloSlug) continue;
      modulos.set(moduloSlug, {
        read: perm.acceso_lectura ?? false,
        write: perm.acceso_escritura ?? false,
      });
    }
  }

  // 7. Apply exceptions (override role-based)
  for (const exc of userExcepciones) {
    const moduloSlug = moduloIdToSlug.get(exc.modulo_id);
    if (!moduloSlug) continue;
    modulos.set(moduloSlug, {
      read: exc.acceso_lectura ?? false,
      write: exc.acceso_escritura ?? false,
    });
  }

  return { isAdmin: false, loading: false, email, empresas, modulos };
}

// ── Helpers ────────────────────────────────────────────────────────────────

export function canAccessEmpresa(perms: UserPermissions, empresaSlug: string): boolean {
  if (perms.isAdmin) return true;
  return perms.empresas.has(empresaSlug);
}

export function canAccessModulo(
  perms: UserPermissions,
  moduloSlug: string,
  mode: 'read' | 'write' = 'read'
): boolean {
  if (perms.isAdmin) return true;
  const access = perms.modulos.get(moduloSlug);
  if (!access) return false;
  return mode === 'read' ? access.read : access.write;
}

/**
 * Acceso al módulo o a cualquiera de sus sub-slugs (`<slug>.<tab>`). Solo
 * tiene sentido para slugs de hub umbrella (ADR-030) — para un módulo plano
 * el prefix no matchea nada y equivale a `canAccessModulo`.
 */
export function canAccessModuloOrChild(
  perms: UserPermissions,
  moduloSlug: string,
  mode: 'read' | 'write' = 'read'
): boolean {
  if (canAccessModulo(perms, moduloSlug, mode)) return true;
  const prefix = `${moduloSlug}.`;
  for (const [slug, access] of perms.modulos) {
    if (slug.startsWith(prefix) && (mode === 'read' ? access.read : access.write)) return true;
  }
  return false;
}

/**
 * ¿Esta entrada de navegación (sidebar / panel de empresa) es visible?
 *
 * - Ruta sin módulo mapeado → visible (gobierna el gate de empresa).
 * - Ruta con módulo → visible con acceso de lectura al módulo mapeado.
 * - Landing de hub (ADR-030) → visible también con acceso al padre umbrella
 *   o a CUALQUIER sub-slug del hub. Sin esto, un rol con permisos parciales
 *   (p. ej. Requisiciones sin Órdenes) pierde la puerta de entrada a todo el
 *   hub aunque sus tabs le funcionen — el contenido sigue gateado por
 *   `<RequireAccess>` en cada sub-page (SS5).
 */
export function canSeeNavRoute(perms: UserPermissions, href: string): boolean {
  const moduloSlug = ROUTE_TO_MODULE[href];
  if (!moduloSlug) return true;
  if (canAccessModulo(perms, moduloSlug)) return true;
  const hubParent = HUB_PARENT_BY_ROUTE[href];
  if (!hubParent) return false;
  return canAccessModuloOrChild(perms, hubParent);
}

export function isAdminOnly(pathname: string): boolean {
  return (
    ADMIN_ONLY_ROUTES.has(pathname) ||
    Array.from(ADMIN_ONLY_ROUTES).some((r) => pathname.startsWith(`${r}/`))
  );
}
