-- ╭─ 20260702131512_dilesa_prediales_municipio_nava ─╮
-- Iniciativa `dilesa-portafolio-predios` — corrección de datos (Beto,
-- 2026-07-02): las parcelas ejidales de Villa de Fuente están en el
-- municipio de NAVA, no en Piedras Negras (el loader de S1 asumió Piedras
-- Negras para todo). Se corrigen los activos del Excel de parcelas (zona
-- Ejido Villa de Fuente + los 2 ranchos del mismo listado) y sus cuentas
-- prediales. El convenio 60% NO les aplica (es con el municipio de Piedras
-- Negras) — ya estaban cargadas sin convenio, no hay nada que revertir.

BEGIN;

WITH objetivo AS (
  SELECT a.id
  FROM dilesa.activos a
  JOIN core.empresas e ON e.id = a.empresa_id AND e.slug = 'dilesa'
  WHERE a.deleted_at IS NULL
    AND (a.zona = 'Ejido Villa de Fuente'
         OR a.clave_interna IN ('RANCHO-SANTA-MONICA', 'RANCHO-SAN-MARCOS'))
)
UPDATE dilesa.activos a
SET municipio = 'Nava'
FROM objetivo o
WHERE a.id = o.id AND a.municipio IS DISTINCT FROM 'Nava';

WITH objetivo AS (
  SELECT a.id
  FROM dilesa.activos a
  JOIN core.empresas e ON e.id = a.empresa_id AND e.slug = 'dilesa'
  WHERE a.deleted_at IS NULL
    AND (a.zona = 'Ejido Villa de Fuente'
         OR a.clave_interna IN ('RANCHO-SANTA-MONICA', 'RANCHO-SAN-MARCOS'))
)
UPDATE dilesa.cuentas_prediales cp
SET municipio = 'Nava'
FROM objetivo o
WHERE cp.activo_id = o.id AND cp.municipio IS DISTINCT FROM 'Nava';

NOTIFY pgrst, 'reload schema';

COMMIT;
