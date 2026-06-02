-- ╭──────────────────────────────────────────────────────────────────╮
-- │  20260602001532_modulos_rdb_cxp                                    │
-- │                                                                    │
-- │  Libera el módulo nuevo `rdb.cxp` (CxP Sprint 3) con sus sub-slugs │
-- │  por tab (ADR-030), + backfill defensivo de permisos.             │
-- │                                                                    │
-- │  Tabs v1 (ruta /rdb/cxp):                                          │
-- │    - rdb.cxp.facturas    — lista de facturas de egreso + drawer.   │
-- │    - rdb.cxp.aging       — antigüedad de saldos por proveedor.     │
-- │    - rdb.cxp.proveedores — agregado por proveedor.                 │
-- │  El padre `rdb.cxp` queda como umbrella del sidebar (sección       │
-- │  Administración).                                                  │
-- │                                                                    │
-- │  Backfill (paso 2): clona los permisos que cada rol RDB tiene      │
-- │  sobre `rdb.ordenes_compra` (módulo de Compras comparable) hacia   │
-- │  los 4 slugs nuevos, para que los roles actuales conserven el      │
-- │  acceso esperado. Beto refina fino en /settings post-deploy sin    │
-- │  re-migrar. Sin esto, agregar el sub-slug ESCONDERÍA el módulo a   │
-- │  no-admin users (canAccessModulo retorna false cuando el slug no   │
-- │  está en permissions.modulos).                                     │
-- │                                                                    │
-- │  Ver docs/planning/cxp.md (Sprint 3) y la regla "Liberación de     │
-- │  módulo nuevo" del CLAUDE.md del repo + ADR-030.                   │
-- ╰──────────────────────────────────────────────────────────────────╯

BEGIN;

-- ─── Módulo padre + sub-slugs ─────────────────────────────────────────
-- Sección 'administracion' (taxonomía ADR-014). El valor almacenado en
-- core.modulos.seccion es el slug en minúsculas/sin acento ('administracion',
-- 'compras', 'rh', …), no la etiqueta visible — se respeta la convención
-- de las filas existentes de RDB.

INSERT INTO core.modulos (slug, nombre, descripcion, empresa_id, seccion)
SELECT s.slug, s.nombre, s.descripcion, e.id, 'administracion'
FROM (
  VALUES
    (
      'rdb.cxp',
      'CxP',
      'Cuentas por pagar: facturas de egreso, antigüedad de saldos y saldo por proveedor'
    ),
    (
      'rdb.cxp.facturas',
      'CxP · Facturas',
      'Lista de facturas de egreso con saldo, estado y carga de XML CFDI'
    ),
    (
      'rdb.cxp.aging',
      'CxP · Saldos',
      'Antigüedad de saldos por proveedor en buckets de vencimiento'
    ),
    (
      'rdb.cxp.proveedores',
      'CxP · Proveedores',
      'Agregado por proveedor: saldo total, facturas abiertas y último pago'
    )
) AS s(slug, nombre, descripcion)
CROSS JOIN core.empresas e
WHERE e.slug = 'rdb'
ON CONFLICT (empresa_id, slug) DO NOTHING;

-- ─── Backfill defensivo de permisos por rol ───────────────────────────
-- Clona (acceso_lectura, acceso_escritura) que cada rol RDB tiene sobre
-- `rdb.ordenes_compra` hacia cada slug nuevo de CxP. Compras → CxP es el
-- antecesor natural del flujo (OC cerrada → factura → pago), así que el
-- mismo conjunto de roles que ve Compras ve CxP. Idempotente vía
-- ON CONFLICT (rol_id, modulo_id) DO NOTHING.

INSERT INTO core.permisos_rol (rol_id, modulo_id, acceso_lectura, acceso_escritura)
SELECT pr.rol_id, nuevo.id, pr.acceso_lectura, pr.acceso_escritura
FROM core.permisos_rol pr
JOIN core.modulos oc ON oc.id = pr.modulo_id AND oc.slug = 'rdb.ordenes_compra'
JOIN core.empresas e ON e.id = oc.empresa_id AND e.slug = 'rdb'
JOIN core.modulos nuevo ON nuevo.empresa_id = e.id
  AND nuevo.slug IN ('rdb.cxp', 'rdb.cxp.facturas', 'rdb.cxp.aging', 'rdb.cxp.proveedores')
ON CONFLICT (rol_id, modulo_id) DO NOTHING;

NOTIFY pgrst, 'reload schema';

COMMIT;
