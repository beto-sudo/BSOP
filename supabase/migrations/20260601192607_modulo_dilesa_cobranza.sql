-- ╭──────────────────────────────────────────────────────────────────╮
-- │  20260601192607_modulo_dilesa_cobranza                            │
-- │                                                                    │
-- │  Libera el módulo nuevo `dilesa.cobranza` (CxC Sprint 3) con sus   │
-- │  sub-slugs por tab (ADR-030), + backfill defensivo de permisos.   │
-- │                                                                    │
-- │  Tabs v1:                                                          │
-- │    - dilesa.cobranza.pagos — captura/consulta de abonos desde      │
-- │      administración (sin entrar venta por venta).                  │
-- │    - dilesa.cobranza.aging — antigüedad de saldos por cliente.     │
-- │  El padre `dilesa.cobranza` queda como umbrella del sidebar.       │
-- │                                                                    │
-- │  Permisos iniciales (Beto ajusta fino en /settings post-deploy):  │
-- │    - Administración / Contabilidad / Dirección → lectura+escritura │
-- │    - Gerencia Ventas / Vendedor → solo lectura                     │
-- │    - resto → sin acceso                                            │
-- │                                                                    │
-- │  Ver docs/planning/cxc.md (Sprint 3) y la regla "Liberación de     │
-- │  módulo nuevo" del CLAUDE.md del repo.                             │
-- ╰──────────────────────────────────────────────────────────────────╯

BEGIN;

-- ─── Módulo padre + sub-slugs ─────────────────────────────────────────

INSERT INTO core.modulos (slug, nombre, descripcion, empresa_id, seccion)
SELECT s.slug, s.nombre, s.descripcion, e.id, 'operaciones'
FROM (
  VALUES
    (
      'dilesa.cobranza',
      'Cobranza',
      'Cuentas por cobrar: captura de pagos, antigüedad de saldos y estado de cuenta'
    ),
    (
      'dilesa.cobranza.pagos',
      'Cobranza · Pagos',
      'Captura y consulta de abonos desde administración'
    ),
    (
      'dilesa.cobranza.aging',
      'Cobranza · Saldos',
      'Antigüedad de saldos por cliente y venta'
    )
) AS s(slug, nombre, descripcion)
CROSS JOIN core.empresas e
WHERE e.slug = 'dilesa'
ON CONFLICT (empresa_id, slug) DO NOTHING;

-- ─── Backfill defensivo de permisos por rol ───────────────────────────
-- Una fila por (rol × módulo) para que TODOS los roles aparezcan en la
-- UI de gestión de permisos. Los valores iniciales preservan el acceso
-- esperado; Beto refina después sin re-migrar.

INSERT INTO core.permisos_rol (rol_id, modulo_id, acceso_lectura, acceso_escritura)
SELECT
  r.id,
  m.id,
  CASE
    WHEN r.nombre IN ('Administración', 'Contabilidad', 'Dirección', 'Gerencia Ventas', 'Vendedor')
      THEN true
    ELSE false
  END AS acceso_lectura,
  CASE
    WHEN r.nombre IN ('Administración', 'Contabilidad', 'Dirección') THEN true
    ELSE false
  END AS acceso_escritura
FROM core.roles r
JOIN core.empresas e ON e.id = r.empresa_id AND e.slug = 'dilesa'
JOIN core.modulos m ON m.empresa_id = e.id
  AND m.slug IN ('dilesa.cobranza', 'dilesa.cobranza.pagos', 'dilesa.cobranza.aging')
ON CONFLICT (rol_id, modulo_id) DO NOTHING;

NOTIFY pgrst, 'reload schema';

COMMIT;
