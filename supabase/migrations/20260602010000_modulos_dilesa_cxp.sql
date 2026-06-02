-- ╭──────────────────────────────────────────────────────────────────╮
-- │  20260602010000_modulos_dilesa_cxp                                 │
-- │                                                                    │
-- │  Libera el módulo `dilesa.cxp` (rollout DILESA del CxP) con sus    │
-- │  sub-slugs por tab (ADR-030), + backfill defensivo de permisos.   │
-- │  Espejo de la migración RDB 20260602001532_modulos_rdb_cxp.sql.   │
-- │                                                                    │
-- │  Tabs v1 (ruta /dilesa/cxp):                                      │
-- │    - dilesa.cxp.facturas    — lista de facturas de egreso + drawer.│
-- │    - dilesa.cxp.aging       — antigüedad de saldos por proveedor.  │
-- │    - dilesa.cxp.proveedores — agregado por proveedor.             │
-- │  El padre `dilesa.cxp` queda como umbrella del sidebar (sección    │
-- │  Administración).                                                  │
-- │                                                                    │
-- │  Backfill (paso 2): clona los permisos que cada rol DILESA tiene   │
-- │  sobre `dilesa.cobranza` (el módulo CxC, misma sección/finanzas —  │
-- │  gemelo natural del subledger, ADR-037) hacia los 4 slugs nuevos, │
-- │  para que los roles actuales conserven el acceso esperado. Beto    │
-- │  refina fino en /settings post-deploy sin re-migrar. Sin esto,     │
-- │  agregar el sub-slug ESCONDERÍA el módulo a no-admin users         │
-- │  (canAccessModulo retorna false cuando el slug no está en          │
-- │  permissions.modulos).                                            │
-- │                                                                    │
-- │  Ver docs/planning/cxp.md (rollout DILESA) y la regla "Liberación  │
-- │  de módulo nuevo" del CLAUDE.md del repo + ADR-030.               │
-- ╰──────────────────────────────────────────────────────────────────╯

BEGIN;

-- ─── Módulo padre + sub-slugs ─────────────────────────────────────────
-- Sección 'administracion' (taxonomía ADR-014). El valor almacenado en
-- core.modulos.seccion es el slug en minúsculas/sin acento ('administracion',
-- 'compras', 'rh', …), no la etiqueta visible — se respeta la convención
-- de las filas existentes de DILESA. Resuelve empresa_id con JOIN a
-- core.empresas WHERE slug='dilesa' (robusto a Preview branch sin datos).

INSERT INTO core.modulos (slug, nombre, descripcion, empresa_id, seccion)
SELECT s.slug, s.nombre, s.descripcion, e.id, 'administracion'
FROM (
  VALUES
    (
      'dilesa.cxp',
      'CxP',
      'Cuentas por pagar: facturas de egreso, antigüedad de saldos y saldo por proveedor'
    ),
    (
      'dilesa.cxp.facturas',
      'CxP · Facturas',
      'Lista de facturas de egreso con saldo, estado y carga de XML CFDI'
    ),
    (
      'dilesa.cxp.aging',
      'CxP · Saldos',
      'Antigüedad de saldos por proveedor en buckets de vencimiento'
    ),
    (
      'dilesa.cxp.proveedores',
      'CxP · Proveedores',
      'Agregado por proveedor: saldo total, facturas abiertas y último pago'
    )
) AS s(slug, nombre, descripcion)
CROSS JOIN core.empresas e
WHERE e.slug = 'dilesa'
ON CONFLICT (empresa_id, slug) DO NOTHING;

-- ─── Backfill defensivo de permisos por rol ───────────────────────────
-- Clona (acceso_lectura, acceso_escritura) que cada rol DILESA tiene sobre
-- `dilesa.cobranza` (módulo CxC, misma sección Administración — gemelo del
-- subledger, ADR-037) hacia cada slug nuevo de CxP. El mismo conjunto de
-- roles que ve CxC ve CxP. Idempotente vía ON CONFLICT (rol_id, modulo_id)
-- DO NOTHING.

INSERT INTO core.permisos_rol (rol_id, modulo_id, acceso_lectura, acceso_escritura)
SELECT pr.rol_id, nuevo.id, pr.acceso_lectura, pr.acceso_escritura
FROM core.permisos_rol pr
JOIN core.modulos cxc ON cxc.id = pr.modulo_id AND cxc.slug = 'dilesa.cobranza'
JOIN core.empresas e ON e.id = cxc.empresa_id AND e.slug = 'dilesa'
JOIN core.modulos nuevo ON nuevo.empresa_id = e.id
  AND nuevo.slug IN ('dilesa.cxp', 'dilesa.cxp.facturas', 'dilesa.cxp.aging', 'dilesa.cxp.proveedores')
ON CONFLICT (rol_id, modulo_id) DO NOTHING;

NOTIFY pgrst, 'reload schema';

COMMIT;
