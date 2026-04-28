-- Sprint 1 — Empleados multi-puesto
-- Modelo N:M para puestos por empleado + refactor de erp.v_empleados_full.
-- Ver docs/adr/013_empleados_multi_puesto_modelo.md y docs/planning/empleados-multi-puesto.md

BEGIN;

-- ============================================================
-- 1) Tabla erp.empleados_puestos (relación N:M empleado ↔ puesto)
-- ============================================================
CREATE TABLE IF NOT EXISTS erp.empleados_puestos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL REFERENCES core.empresas(id) ON DELETE RESTRICT,
  empleado_id uuid NOT NULL REFERENCES erp.empleados(id) ON DELETE CASCADE,
  puesto_id uuid NOT NULL REFERENCES erp.puestos(id) ON DELETE RESTRICT,
  principal boolean NOT NULL DEFAULT false,
  fecha_inicio date,
  fecha_fin date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz
);

COMMENT ON TABLE erp.empleados_puestos IS
  'Relación N:M entre empleados y puestos. Permite que una persona-empresa tenga múltiples roles (Accionista + Comité + Consejo, etc.) sin duplicar la fila en erp.empleados. Ver ADR-013.';

COMMENT ON COLUMN erp.empleados_puestos.empresa_id IS
  'Denormalizado desde erp.empleados para que las policies RLS no tengan que JOIN. Debe coincidir con empleado.empresa_id y puesto.empresa_id (validado por trigger).';

COMMENT ON COLUMN erp.empleados_puestos.principal IS
  'true = este es el puesto principal del empleado (el que se devuelve como puesto_id/puesto escalar en v_empleados_full). Solo uno principal vigente por empleado.';

COMMENT ON COLUMN erp.empleados_puestos.fecha_fin IS
  'NULL = vigente. Una fila con fecha_fin no NULL es histórica y no aparece en v_empleados_full.puestos[].';

-- ============================================================
-- 2) Índices
-- ============================================================

-- Solo un puesto principal vigente por empleado
CREATE UNIQUE INDEX IF NOT EXISTS empleados_puestos_un_principal_por_empleado
  ON erp.empleados_puestos (empleado_id)
  WHERE principal = true AND fecha_fin IS NULL;

-- (empleado, puesto) único mientras esté vigente
CREATE UNIQUE INDEX IF NOT EXISTS empleados_puestos_unique_empleado_puesto_vigente
  ON erp.empleados_puestos (empleado_id, puesto_id)
  WHERE fecha_fin IS NULL;

CREATE INDEX IF NOT EXISTS empleados_puestos_empleado_id_idx ON erp.empleados_puestos (empleado_id);
CREATE INDEX IF NOT EXISTS empleados_puestos_puesto_id_idx ON erp.empleados_puestos (puesto_id);
CREATE INDEX IF NOT EXISTS empleados_puestos_empresa_id_idx ON erp.empleados_puestos (empresa_id);

-- ============================================================
-- 3) Trigger: validar coherencia de empresa_id con empleado y puesto
-- ============================================================
CREATE OR REPLACE FUNCTION erp.fn_empleados_puestos_validate_empresa()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_empleado_empresa uuid;
  v_puesto_empresa uuid;
BEGIN
  SELECT empresa_id INTO v_empleado_empresa FROM erp.empleados WHERE id = NEW.empleado_id;
  SELECT empresa_id INTO v_puesto_empresa FROM erp.puestos WHERE id = NEW.puesto_id;

  IF v_empleado_empresa IS NULL THEN
    RAISE EXCEPTION 'empleado_id % no existe en erp.empleados', NEW.empleado_id;
  END IF;
  IF v_puesto_empresa IS NULL THEN
    RAISE EXCEPTION 'puesto_id % no existe en erp.puestos', NEW.puesto_id;
  END IF;
  IF NEW.empresa_id <> v_empleado_empresa THEN
    RAISE EXCEPTION 'empresa_id (%) debe coincidir con empleado.empresa_id (%)', NEW.empresa_id, v_empleado_empresa;
  END IF;
  IF NEW.empresa_id <> v_puesto_empresa THEN
    RAISE EXCEPTION 'empresa_id (%) debe coincidir con puesto.empresa_id (%)', NEW.empresa_id, v_puesto_empresa;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_empleados_puestos_validate_empresa
  BEFORE INSERT OR UPDATE OF empresa_id, empleado_id, puesto_id ON erp.empleados_puestos
  FOR EACH ROW
  EXECUTE FUNCTION erp.fn_empleados_puestos_validate_empresa();

-- ============================================================
-- 4) Trigger: updated_at
-- ============================================================
CREATE TRIGGER erp_empleados_puestos_updated_at
  BEFORE UPDATE ON erp.empleados_puestos
  FOR EACH ROW
  EXECUTE FUNCTION erp.fn_set_updated_at();

-- ============================================================
-- 5) RLS (mismo patrón que erp.empleados_compensacion)
-- ============================================================
ALTER TABLE erp.empleados_puestos ENABLE ROW LEVEL SECURITY;

CREATE POLICY erp_empleados_puestos_select ON erp.empleados_puestos
  FOR SELECT TO authenticated
  USING (core.fn_has_empresa(empresa_id) OR core.fn_is_admin());

CREATE POLICY erp_empleados_puestos_insert ON erp.empleados_puestos
  FOR INSERT TO authenticated
  WITH CHECK (core.fn_has_empresa(empresa_id) OR core.fn_is_admin());

CREATE POLICY erp_empleados_puestos_update ON erp.empleados_puestos
  FOR UPDATE TO authenticated
  USING (core.fn_has_empresa(empresa_id) OR core.fn_is_admin())
  WITH CHECK (core.fn_has_empresa(empresa_id) OR core.fn_is_admin());

CREATE POLICY erp_empleados_puestos_delete ON erp.empleados_puestos
  FOR DELETE TO authenticated
  USING (core.fn_has_empresa(empresa_id) OR core.fn_is_admin());

-- ============================================================
-- 6) Backfill: cada empleado vigente con puesto_id actual → 1 fila principal
-- ============================================================
INSERT INTO erp.empleados_puestos (empresa_id, empleado_id, puesto_id, principal, fecha_inicio)
SELECT
  e.empresa_id,
  e.id,
  e.puesto_id,
  true,
  e.fecha_ingreso
FROM erp.empleados e
WHERE e.puesto_id IS NOT NULL
  AND e.deleted_at IS NULL
ON CONFLICT DO NOTHING;

-- ============================================================
-- 7) Refactor de erp.v_empleados_full
-- Preserva columnas escalares (puesto_id, puesto) usando puesto principal nuevo,
-- con fallback a empleados.puesto_id por compatibilidad durante Sprint 2.
-- Agrega columna `puestos` (jsonb array) con todos los puestos vigentes.
-- ============================================================
DROP VIEW IF EXISTS erp.v_empleados_full;

CREATE VIEW erp.v_empleados_full
WITH (security_invoker = on) AS
SELECT
  e.id AS empleado_id,
  e.empresa_id,
  e.numero_empleado,
  e.fecha_ingreso,
  e.fecha_baja,
  e.motivo_baja,
  e.email_empresa,
  e.activo AS empleado_activo,
  p.id AS persona_id,
  p.nombre,
  p.apellido_paterno,
  p.apellido_materno,
  ((p.nombre || ' '::text) || COALESCE(p.apellido_paterno, ''::text)) || ' '::text || COALESCE(p.apellido_materno, ''::text) AS nombre_completo,
  p.email AS email_personal,
  p.telefono,
  p.rfc,
  p.curp,
  p.nss,
  p.fecha_nacimiento,
  EXTRACT(year FROM age(p.fecha_nacimiento::timestamptz)) AS edad,
  d.id AS departamento_id,
  d.nombre AS departamento,
  -- Compatibilidad: puesto_id/puesto = principal vigente, fallback a empleados.puesto_id
  COALESCE(pu_principal.id, pu_legacy.id) AS puesto_id,
  COALESCE(pu_principal.nombre, pu_legacy.nombre) AS puesto,
  -- Nuevo: array jsonb de todos los puestos vigentes (principal primero)
  COALESCE(
    (
      SELECT jsonb_agg(
               jsonb_build_object(
                 'puesto_id', pu_all.id,
                 'nombre', pu_all.nombre,
                 'principal', ep.principal,
                 'fecha_inicio', ep.fecha_inicio,
                 'fecha_fin', ep.fecha_fin
               ) ORDER BY ep.principal DESC, pu_all.nombre
             )
      FROM erp.empleados_puestos ep
      JOIN erp.puestos pu_all ON pu_all.id = ep.puesto_id
      WHERE ep.empleado_id = e.id AND ep.fecha_fin IS NULL
    ),
    '[]'::jsonb
  ) AS puestos,
  c.sueldo_diario,
  c.sueldo_mensual,
  c.comisiones_mensuales,
  c.bonificaciones_mensuales,
  c.compensaciones_mensuales,
  COALESCE(c.sueldo_mensual, 0::numeric) + COALESCE(c.comisiones_mensuales, 0::numeric) + COALESCE(c.bonificaciones_mensuales, 0::numeric) + COALESCE(c.compensaciones_mensuales, 0::numeric) AS total_percepciones_mensuales,
  c.sdi,
  c.tipo_contrato,
  c.frecuencia_pago,
  EXTRACT(year FROM age(e.fecha_ingreso::timestamptz)) AS antiguedad_anios
FROM erp.empleados e
JOIN erp.personas p ON p.id = e.persona_id
LEFT JOIN erp.departamentos d ON d.id = e.departamento_id
LEFT JOIN LATERAL (
  SELECT pu.id, pu.nombre
  FROM erp.empleados_puestos ep
  JOIN erp.puestos pu ON pu.id = ep.puesto_id
  WHERE ep.empleado_id = e.id AND ep.principal = true AND ep.fecha_fin IS NULL
  LIMIT 1
) pu_principal ON true
LEFT JOIN erp.puestos pu_legacy ON pu_legacy.id = e.puesto_id
LEFT JOIN erp.empleados_compensacion c ON c.empleado_id = e.id AND c.vigente = true
WHERE e.deleted_at IS NULL AND p.deleted_at IS NULL;

COMMIT;
