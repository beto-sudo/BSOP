-- ============================================================
-- 20260414000040_personal_enhanced.sql
-- Add missing HR fields from Coda Personal (grid-rCQIDVP9Qq)
--   - personas: nss, fecha_nacimiento
--   - empleados: email_empresa
--   - empleados_compensacion: comisiones, bonificaciones, compensaciones, sdi
-- ============================================================

-- ── personas: campos faltantes ──────────────────────────────────────────────

ALTER TABLE erp.personas
  ADD COLUMN IF NOT EXISTS nss               TEXT,
  ADD COLUMN IF NOT EXISTS fecha_nacimiento  DATE;

COMMENT ON COLUMN erp.personas.nss              IS 'Número de Seguro Social (IMSS).';
COMMENT ON COLUMN erp.personas.fecha_nacimiento IS 'Fecha de nacimiento de la persona.';

-- ── empleados: email empresa ────────────────────────────────────────────────

ALTER TABLE erp.empleados
  ADD COLUMN IF NOT EXISTS email_empresa  TEXT;

COMMENT ON COLUMN erp.empleados.email_empresa IS 'Correo electrónico corporativo del empleado.';

-- ── empleados_compensacion: desglose de percepciones ────────────────────────

ALTER TABLE erp.empleados_compensacion
  ADD COLUMN IF NOT EXISTS comisiones_mensuales     NUMERIC(14,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS bonificaciones_mensuales  NUMERIC(14,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS compensaciones_mensuales  NUMERIC(14,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS sdi                       NUMERIC(14,2);

COMMENT ON COLUMN erp.empleados_compensacion.comisiones_mensuales     IS 'Comisiones mensuales fijas o promedio.';
COMMENT ON COLUMN erp.empleados_compensacion.bonificaciones_mensuales IS 'Bonificaciones mensuales fijas o promedio.';
COMMENT ON COLUMN erp.empleados_compensacion.compensaciones_mensuales IS 'Compensaciones mensuales adicionales.';
COMMENT ON COLUMN erp.empleados_compensacion.sdi                      IS 'Salario Diario Integrado para fines de IMSS.';

-- ── Vista: empleados_full (para UI y consultas rápidas) ─────────────────────

CREATE OR REPLACE VIEW erp.v_empleados_full AS
SELECT
  e.id                                        AS empleado_id,
  e.empresa_id,
  e.numero_empleado,
  e.fecha_ingreso,
  e.fecha_baja,
  e.motivo_baja,
  e.email_empresa,
  e.activo                                     AS empleado_activo,
  p.id                                         AS persona_id,
  p.nombre,
  p.apellido_paterno,
  p.apellido_materno,
  p.nombre || ' ' || COALESCE(p.apellido_paterno, '') || ' ' || COALESCE(p.apellido_materno, '') AS nombre_completo,
  p.email                                      AS email_personal,
  p.telefono,
  p.rfc,
  p.curp,
  p.nss,
  p.fecha_nacimiento,
  EXTRACT(YEAR FROM age(p.fecha_nacimiento))  AS edad,
  d.id                                         AS departamento_id,
  d.nombre                                     AS departamento,
  pu.id                                        AS puesto_id,
  pu.nombre                                    AS puesto,
  c.sueldo_diario,
  c.sueldo_mensual,
  c.comisiones_mensuales,
  c.bonificaciones_mensuales,
  c.compensaciones_mensuales,
  COALESCE(c.sueldo_mensual, 0)
    + COALESCE(c.comisiones_mensuales, 0)
    + COALESCE(c.bonificaciones_mensuales, 0)
    + COALESCE(c.compensaciones_mensuales, 0)  AS total_percepciones_mensuales,
  c.sdi,
  c.tipo_contrato,
  c.frecuencia_pago,
  EXTRACT(YEAR FROM age(e.fecha_ingreso))     AS antiguedad_anios
FROM erp.empleados e
JOIN erp.personas p            ON p.id = e.persona_id
LEFT JOIN erp.departamentos d  ON d.id = e.departamento_id
LEFT JOIN erp.puestos pu       ON pu.id = e.puesto_id
LEFT JOIN erp.empleados_compensacion c ON c.empleado_id = e.id AND c.vigente = true
WHERE e.deleted_at IS NULL
  AND p.deleted_at IS NULL;

COMMENT ON VIEW erp.v_empleados_full IS 'Vista completa de empleados con persona, puesto, departamento y compensación activa.';
