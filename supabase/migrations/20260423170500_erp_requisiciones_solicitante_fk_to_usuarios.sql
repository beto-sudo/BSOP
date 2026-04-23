-- erp.requisiciones.solicitante_id: mover FK de erp.empleados → core.usuarios.
--
-- Razón: el "solicitante" es quien pidió algo (cuenta BSOP, cross-empresa),
-- no un empleado formal de la empresa. La FK original forzaba crear
-- "empleados fantasma" en cada empresa para gente que pide desde BSOP
-- hub — modelo incorrecto para el caso multi-empresa.
--
-- Impacto: en el código actual `solicitante_id` solo se selecciona/propaga
-- sin JOIN contra erp.empleados (ver app/rdb/requisiciones/page.tsx), y
-- todas las requisiciones existentes tenían `solicitante_id = NULL`, así
-- que no hay datos que migrar.

ALTER TABLE erp.requisiciones
  DROP CONSTRAINT IF EXISTS requisiciones_solicitante_id_fkey;

ALTER TABLE erp.requisiciones
  ADD CONSTRAINT requisiciones_solicitante_id_fkey
  FOREIGN KEY (solicitante_id) REFERENCES core.usuarios(id);
