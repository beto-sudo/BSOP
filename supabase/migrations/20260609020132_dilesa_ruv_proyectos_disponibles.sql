-- ============================================================================
-- DILESA · RUV — vista de proyectos elegibles para el alta de frentes
-- ----------------------------------------------------------------------------
-- Iniciativa `dilesa-ruv` · Sprint 4. El dropdown de "Nuevo frente" debe ofrecer
-- SOLO proyectos (a) cuya construcción no está terminada (estado <> 'completado')
-- y (b) que aún tienen lotes por registrar en un frente (unidades.frente_id IS
-- NULL). El INNER JOIN garantiza (b); el WHERE garantiza (a).
-- ============================================================================

CREATE OR REPLACE VIEW dilesa.v_ruv_proyectos_disponibles WITH (security_invoker = on) AS
SELECT
  p.id,
  p.empresa_id,
  p.nombre,
  count(u.id) AS lotes_disponibles
FROM dilesa.proyectos p
JOIN dilesa.unidades u
  ON u.proyecto_id = p.id
  AND u.frente_id IS NULL
  AND u.deleted_at IS NULL
WHERE p.estado <> 'completado'
  AND p.deleted_at IS NULL
GROUP BY p.id, p.empresa_id, p.nombre;

COMMENT ON VIEW dilesa.v_ruv_proyectos_disponibles IS
  'Proyectos elegibles para dar de alta un frente RUV: construcción no terminada (estado <> completado) y con lotes aún por registrar (unidades.frente_id IS NULL). Alimenta el dropdown de proyecto del alta de frentes.';

NOTIFY pgrst, 'reload schema';
