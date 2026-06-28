-- ╭──────────────────────────────────────────────────────────────────╮
-- │  20260628014634_dilesa_promover_caras_espectacular                  │
-- │                                                                    │
-- │  Iniciativa `arrendamiento` — fix S1e. Promueve cada cara de los    │
-- │  espectaculares/unipolares (hoy en activo_espectacular.caras_detalle │
-- │  jsonb: Flujo/Contraflujo) a un activo HIJO (tipo='cara',           │
-- │  activo_padre_id), heredando el destino rentable del padre. Así el  │
-- │  form de arrendamiento puede elegir la cara (no el espectacular     │
-- │  completo). Ver ADR-052 + S1a (que creó tipo 'cara' + activo_cara). │
-- │                                                                    │
-- │  Idempotente (NOT EXISTS por nombre) y robusta a Preview (si no hay  │
-- │  espectaculares, 0 filas). Data-only: no cambia schema. NO toca      │
-- │  dinero ni permisos.                                                │
-- ╰──────────────────────────────────────────────────────────────────╯

BEGIN;

-- 1. Master: un activo hijo tipo='cara' por cada elemento de caras_detalle,
--    heredando empresa/estado/destino/geo del espectacular padre.
INSERT INTO dilesa.activos (
  empresa_id, tipo, nombre, estado, activo_padre_id, destino_id,
  municipio, estado_geo, direccion_referencia, latitud, longitud
)
SELECT
  a.empresa_id, 'cara',
  a.nombre || ' — ' || COALESCE(c.elem->>'cara', 'Cara') ||
    CASE WHEN NULLIF(c.elem->>'alias', '') IS NOT NULL THEN ' (' || (c.elem->>'alias') || ')' ELSE '' END,
  a.estado, a.id, a.destino_id,
  a.municipio, a.estado_geo, a.direccion_referencia, a.latitud, a.longitud
FROM dilesa.activos a
JOIN dilesa.activo_espectacular ae ON ae.activo_id = a.id
CROSS JOIN LATERAL jsonb_array_elements(ae.caras_detalle) AS c(elem)
WHERE a.tipo IN ('espectacular', 'unipolar')
  AND a.deleted_at IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM dilesa.activos h
    WHERE h.activo_padre_id = a.id
      AND h.tipo = 'cara'
      AND h.deleted_at IS NULL
      AND h.nombre = a.nombre || ' — ' || COALESCE(c.elem->>'cara', 'Cara') ||
        CASE WHEN NULLIF(c.elem->>'alias', '') IS NOT NULL THEN ' (' || (c.elem->>'alias') || ')' ELSE '' END
  );

-- 2. Satélite activo_cara: metadata física de cada cara (orientación,
--    iluminación, scoring) tomada de caras_detalle. Match por el nombre del
--    hijo (que incluye cara + alias). Idempotente.
INSERT INTO dilesa.activo_cara (
  activo_id, empresa_id, orientacion, iluminado, scoring, notas
)
SELECT
  h.id, h.empresa_id,
  c.elem->>'cara',
  COALESCE((c.elem->>'iluminado')::boolean, false),
  NULLIF(c.elem->'scoring'->>'puntos', '')::numeric,
  NULLIF(c.elem->>'alias', '')
FROM dilesa.activos h
JOIN dilesa.activos a ON a.id = h.activo_padre_id
JOIN dilesa.activo_espectacular ae ON ae.activo_id = a.id
CROSS JOIN LATERAL jsonb_array_elements(ae.caras_detalle) AS c(elem)
WHERE h.tipo = 'cara'
  AND h.deleted_at IS NULL
  AND h.nombre = a.nombre || ' — ' || COALESCE(c.elem->>'cara', 'Cara') ||
    CASE WHEN NULLIF(c.elem->>'alias', '') IS NOT NULL THEN ' (' || (c.elem->>'alias') || ')' ELSE '' END
  AND NOT EXISTS (SELECT 1 FROM dilesa.activo_cara ac WHERE ac.activo_id = h.id);

NOTIFY pgrst, 'reload schema';

COMMIT;
