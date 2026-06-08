-- ╭─ 20260608202003_dilesa_fase09_validacion_patronal_rbac ─╮
-- Sprint 7g — Fase 9 (Validación Patronal).
--
-- Fase simple de un solo documento: Gerencia Ventas (o Dirección) sube el
-- PDF de la Validación Patronal que el patrón le entrega al empleado/cliente.
-- No hay tercero de catálogo ni email — el documento se obtiene fuera del
-- sistema (el cliente lo solicita a su patrón) y aquí solo se archiva + cierra
-- la fase. Análogo a Fase 5 (Avalúo Cerrado) pero sin monto.
--
-- Cambios:
--   1. Columna nueva `fecha_validacion_patronal` en dilesa.ventas.
--   2. Sub-slug `dilesa.ventas.fase09_validacion_patronal` en core.modulos.
--   3. Backfill RBAC: lectura todos los que ven dilesa.ventas, escritura
--      Gerencia Ventas + Dirección.

BEGIN;

-- ── 1. Columna en dilesa.ventas ──────────────────────────────────────────
ALTER TABLE dilesa.ventas
  ADD COLUMN IF NOT EXISTS fecha_validacion_patronal date;

COMMENT ON COLUMN dilesa.ventas.fecha_validacion_patronal IS
  'Fecha de la Validación Patronal entregada por el patrón al empleado (cierre de Fase 9).';

-- ── 2. Sub-slug en core.modulos ──────────────────────────────────────────
DO $$
DECLARE
  v_empresa_id uuid;
  v_seccion text;
BEGIN
  SELECT id INTO v_empresa_id FROM core.empresas WHERE slug = 'dilesa';
  SELECT seccion INTO v_seccion FROM core.modulos
    WHERE empresa_id = v_empresa_id AND slug = 'dilesa.ventas' LIMIT 1;

  INSERT INTO core.modulos (slug, nombre, descripcion, empresa_id, seccion)
  VALUES
    ('dilesa.ventas.fase09_validacion_patronal',
     'Ventas — Fase 9 (Validación Patronal)',
     'Carga del PDF de la Validación Patronal que el patrón entrega al empleado. Documento obtenido fuera del sistema; aquí solo se archiva y cierra la fase.',
     v_empresa_id, v_seccion)
  ON CONFLICT (empresa_id, slug) DO NOTHING;
END $$;

-- ── 3. Backfill defensivo de permisos ────────────────────────────────────
INSERT INTO core.permisos_rol (rol_id, modulo_id, acceso_lectura, acceso_escritura)
SELECT
  pr.rol_id,
  m_new.id,
  true AS acceso_lectura,
  (r.nombre IN ('Gerencia Ventas', 'Dirección')) AS acceso_escritura
FROM core.permisos_rol pr
JOIN core.modulos m_old
  ON m_old.id = pr.modulo_id
 AND m_old.slug = 'dilesa.ventas'
JOIN core.roles r
  ON r.id = pr.rol_id
CROSS JOIN core.modulos m_new
WHERE m_new.slug = 'dilesa.ventas.fase09_validacion_patronal'
  AND m_new.empresa_id = (SELECT id FROM core.empresas WHERE slug = 'dilesa')
  AND m_old.empresa_id = (SELECT id FROM core.empresas WHERE slug = 'dilesa')
  AND pr.acceso_lectura = true
ON CONFLICT (rol_id, modulo_id) DO NOTHING;

NOTIFY pgrst, 'reload schema';

COMMIT;
