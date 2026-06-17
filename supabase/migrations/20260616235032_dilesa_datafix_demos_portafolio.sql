-- ╭─ 20260616235032_dilesa_datafix_demos_portafolio ─╮
-- Iniciativa dilesa-portafolio-destinos · Sprint 1 · DATA-FIX de inventario.
--
-- Lleva a BSOP la realidad de Coda (tabla Inventario, columna Demo=true): 23
-- casas demo que en BSOP NO estaban marcadas ni en el portafolio.
--   1) Marca es_muestra=true en las 23 (paridad de reporte con Coda).
--   2) Libera al portafolio (destino "Demo / Show House") las 21 de LDLE+LDS que
--      aún no estaban (10 terminadas + 9 en obra + 2 terminadas). Replica la
--      lógica del RPC fn_liberar_unidad_portafolio en batch (activo + satélite
--      activo_casa + liga unidades.activo_id). Todas son tipo casa.
--   3) Realinea a destino "Demo" las 2 de LDV que YA estaban en el portafolio
--      (estaban como uso_propio/renta).
--
-- Idempotente: el paso 2 solo toca unidades con activo_id IS NULL; re-correr no
-- duplica. Reversible con dilesa.fn_regresar_unidad_proyecto. Robusto a Preview
-- (JOIN a core.empresas → 0 filas si no hay datos).
--
-- ⚠ DATA-FIX DE INVENTARIO EN PROD — aplicar solo con OK explícito de Beto.
--
-- Depende de: 20260616234057 (catálogo + destino_id) y 20260616234205 (RPC v2).

BEGIN;

-- Identificadores de las 23 demos (de Coda Demo=true, 2026-06-16).
CREATE TEMP TABLE _coda_demos(identificador text) ON COMMIT DROP;
INSERT INTO _coda_demos(identificador) VALUES
  -- LDLE (10) · todas terminada
  ('M21-L34-LDLE'),('M21-L35-LDLE'),('M23-L6-LDLE'),('M5-L38-LDLE'),('M6-L13-LDLE'),
  ('M12-L1-LDLE'),('M14-L1-LDLE'),('M14-L2-LDLE'),('M14-L3-LDLE'),('M14-L4-LDLE'),
  -- LDS (11) · 9 en obra + 2 terminada
  ('M9-L12-LDS'),('M13-L2-LDS'),('M13-L3-LDS'),('M13-L4-LDS'),('M13-L5-LDS'),('M13-L7-LDS'),
  ('M13-L8-LDS'),('M13-L9-LDS'),('M13-L10-LDS'),('M13-L11-LDS'),('M15-L2-LDS'),
  -- LDV (2) · ya en portafolio
  ('M10-L2-LDV'),('M14-L1-LDV');

-- ── 1) Marcar es_muestra en las 23 ──────────────────────────────────────────
UPDATE dilesa.unidades u
SET es_muestra = true, updated_at = now()
FROM _coda_demos d, core.empresas e
WHERE u.identificador = d.identificador
  AND u.empresa_id = e.id AND e.slug = 'dilesa'
  AND u.deleted_at IS NULL
  AND u.es_muestra = false;

-- ── 2) Liberar al portafolio (destino Demo) las que aún no están ─────────────
-- Inserta el activo master (tipo casa), su satélite, y liga unidades.activo_id.
WITH emp AS (SELECT id FROM core.empresas WHERE slug = 'dilesa'),
destino_demo AS (
  SELECT id FROM dilesa.portafolio_destinos
  WHERE empresa_id = (SELECT id FROM emp) AND slug = 'demo' AND deleted_at IS NULL
),
candidatas AS (
  SELECT u.*
  FROM dilesa.unidades u
  JOIN _coda_demos d ON d.identificador = u.identificador
  WHERE u.empresa_id = (SELECT id FROM emp)
    AND u.deleted_at IS NULL
    AND u.activo_id IS NULL                 -- aún no liberadas (excluye las 2 de LDV)
),
nuevos AS (
  INSERT INTO dilesa.activos
    (empresa_id, tipo, nombre, estado, modalidad, destino_id, clave_interna, area_m2,
     valor_estimado, situacion_legal, notas)
  SELECT
    c.empresa_id, 'casa',
    'Casa ' || COALESCE(NULLIF(c.calle, ''), 'sin calle') || ' (' || c.identificador || ')',
    'operando', 'uso_propio', (SELECT id FROM destino_demo), c.identificador, c.area_m2,
    COALESCE(c.precio, 0), 'Escriturado a DILESA',
    'Liberado al portafolio (data-fix demos Coda 2026-06-16) con destino Demo / Show House.'
  FROM candidatas c
  RETURNING id AS activo_id, clave_interna AS identificador, empresa_id, area_m2
),
sat AS (
  INSERT INTO dilesa.activo_casa (activo_id, empresa_id, m2_terreno, m2_construccion)
  SELECT n.activo_id, n.empresa_id, n.area_m2, c.m2_construccion
  FROM nuevos n
  JOIN candidatas c ON c.identificador = n.identificador AND c.empresa_id = n.empresa_id
  RETURNING activo_id
)
UPDATE dilesa.unidades u
SET activo_id = n.activo_id, updated_at = now()
FROM nuevos n
WHERE u.identificador = n.identificador AND u.empresa_id = n.empresa_id;

-- ── 3) Realinear a destino Demo las 2 de LDV ya en portafolio ────────────────
UPDATE dilesa.activos a
SET destino_id = pd.id,
    modalidad = 'uso_propio',
    updated_at = now()
FROM dilesa.unidades u, dilesa.portafolio_destinos pd, core.empresas e
WHERE u.activo_id = a.id
  AND u.identificador IN ('M10-L2-LDV', 'M14-L1-LDV')
  AND u.empresa_id = e.id AND e.slug = 'dilesa'
  AND pd.empresa_id = e.id AND pd.slug = 'demo' AND pd.deleted_at IS NULL
  AND a.deleted_at IS NULL;

NOTIFY pgrst, 'reload schema';

COMMIT;
