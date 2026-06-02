-- ╭──────────────────────────────────────────────────────────────────╮
-- │  20260602020000_modulos_cxp_pagos_subslugs                         │
-- │                                                                    │
-- │  CxP Sprint 4 — libera los 2 tabs nuevos del módulo CxP para AMBAS │
-- │  empresas (RDB + DILESA) como sub-slugs (ADR-030):                 │
-- │    - <empresa>.cxp.programacion — selección de facturas a pagar   │
-- │      → genera 1 cxp_pago por proveedor.                           │
-- │    - <empresa>.cxp.pagos        — lista de pagos por estado +      │
-- │      aprobar / marcar pagado / cancelar.                          │
-- │                                                                    │
-- │  El padre `<empresa>.cxp` (umbrella del sidebar) NO cambia. Los    │
-- │  4 sub-slugs nuevos heredan `seccion='administracion'` del padre.  │
-- │                                                                    │
-- │  Backfill defensivo (paso 2): clona los permisos que cada rol      │
-- │  tiene sobre el sub-slug `<empresa>.cxp.facturas` (el tab hermano  │
-- │  del mismo módulo CxP) hacia los 2 sub-slugs nuevos de esa         │
-- │  empresa. Así los roles que ya ven Facturas ven también            │
-- │  Programación y Pagos. Beto refina fino en /settings post-deploy   │
-- │  sin re-migrar. Sin esto, agregar el sub-slug ESCONDERÍA el tab a  │
-- │  no-admin users (canAccessModulo retorna false cuando el slug no   │
-- │  está en permissions.modulos).                                    │
-- │                                                                    │
-- │  Nota: la AUTORIDAD para aprobar pagos vive en el RPC              │
-- │  erp.cxp_pago_aprobar (gate rol "Dirección", server-side); el      │
-- │  permiso de módulo solo gobierna ver/usar el tab. Un usuario con   │
-- │  acceso al tab pero sin rol Dirección verá el botón "Aprobar" pero │
-- │  el RPC lo rechazará con un error claro.                          │
-- │                                                                    │
-- │  Ver docs/planning/cxp.md (Sprint 4) y la regla "Liberación de     │
-- │  módulo nuevo" del CLAUDE.md del repo + ADR-030.                  │
-- ╰──────────────────────────────────────────────────────────────────╯

BEGIN;

-- ─── Sub-slugs nuevos (RDB + DILESA) ──────────────────────────────────
-- Sección 'administracion' (taxonomía ADR-014), heredada del padre. El
-- valor almacenado en core.modulos.seccion es el slug en minúsculas/sin
-- acento — se respeta la convención de las filas CxP existentes.
-- Resuelve empresa_id con JOIN a core.empresas (robusto a Preview branch
-- sin datos de prod).

INSERT INTO core.modulos (slug, nombre, descripcion, empresa_id, seccion)
SELECT s.slug, s.nombre, s.descripcion, e.id, 'administracion'
FROM (
  VALUES
    (
      'rdb',
      'rdb.cxp.programacion',
      'CxP · Programación',
      'Selección de facturas por vencer para programar pagos por proveedor'
    ),
    (
      'rdb',
      'rdb.cxp.pagos',
      'CxP · Pagos',
      'Pagos a proveedores: programados, aprobados, pagados y cancelados'
    ),
    (
      'dilesa',
      'dilesa.cxp.programacion',
      'CxP · Programación',
      'Selección de facturas por vencer para programar pagos por proveedor'
    ),
    (
      'dilesa',
      'dilesa.cxp.pagos',
      'CxP · Pagos',
      'Pagos a proveedores: programados, aprobados, pagados y cancelados'
    )
) AS s(empresa_slug, slug, nombre, descripcion)
JOIN core.empresas e ON e.slug = s.empresa_slug
ON CONFLICT (empresa_id, slug) DO NOTHING;

-- ─── Backfill defensivo de permisos por rol ───────────────────────────
-- Clona (acceso_lectura, acceso_escritura) que cada rol tiene sobre el
-- sub-slug hermano `<empresa>.cxp.facturas` hacia cada sub-slug nuevo de
-- la misma empresa. Mismo módulo CxP → mismo conjunto de roles. Idempotente
-- vía ON CONFLICT (rol_id, modulo_id) DO NOTHING. El JOIN por empresa_id
-- garantiza que RDB clona de rdb.cxp.facturas y DILESA de dilesa.cxp.facturas.

INSERT INTO core.permisos_rol (rol_id, modulo_id, acceso_lectura, acceso_escritura)
SELECT pr.rol_id, nuevo.id, pr.acceso_lectura, pr.acceso_escritura
FROM core.permisos_rol pr
JOIN core.modulos facturas
  ON facturas.id = pr.modulo_id
 AND facturas.slug IN ('rdb.cxp.facturas', 'dilesa.cxp.facturas')
JOIN core.modulos nuevo
  ON nuevo.empresa_id = facturas.empresa_id
 AND nuevo.slug IN (
   'rdb.cxp.programacion', 'rdb.cxp.pagos',
   'dilesa.cxp.programacion', 'dilesa.cxp.pagos'
 )
ON CONFLICT (rol_id, modulo_id) DO NOTHING;

NOTIFY pgrst, 'reload schema';

COMMIT;
