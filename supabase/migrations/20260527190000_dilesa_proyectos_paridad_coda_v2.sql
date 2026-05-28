-- Iniciativa: dilesa-proyectos-paridad-coda (Sprint C / v2).
--
-- Continuación de `20260527000100_dilesa_proyectos_paridad_coda.sql`.
-- Cubre las columnas Coda no migradas en Sprint A: 6 campos capturables
-- nuevos en `dilesa.proyectos` (b) + 7 derivaciones extra sobre
-- `dilesa.unidades` reescribiendo la vista `v_proyecto_avances` (a).
-- Decisión documentada en `docs/planning/dilesa-proyectos-paridad-coda.md`
-- §Sprint C.
--
-- Diferido a un Sprint posterior (no aplica aquí):
--   - Bitácora de Obra, Archivos ZCU, Control de Documentos (acrónimos
--     y modelado pendiente — categoría c).
--   - Parque Disponible Inicial/Final, Escrituración del periodo,
--     Cumplimiento % (requieren parámetro temporal — necesita RPC).
--   - Captura del "valor de accesorios y muebles" al liberar una unidad
--     que estaba como muestra (Beto: "cuando ya no las necesitamos se
--     les quita el check mark y se les agrega el valor de los
--     accesorios y muebles"). Probable columna `valor_accesorios` en
--     `dilesa.unidades` + workflow UI — fuera de v2.
--
-- Patrón: ADD COLUMN IF NOT EXISTS para idempotencia. Vista se reemplaza
-- entera (CREATE OR REPLACE) preservando el contrato del Sprint A y
-- agregando columnas nuevas al final.

BEGIN;

-- ════════════════════════════════════════════════════════════════════════════
-- 1) 6 columnas capturables nuevas en `dilesa.proyectos`
-- ════════════════════════════════════════════════════════════════════════════

ALTER TABLE dilesa.proyectos
  ADD COLUMN IF NOT EXISTS clasificacion_inmobiliaria text,
  ADD COLUMN IF NOT EXISTS area_comercial_m2          numeric,
  ADD COLUMN IF NOT EXISTS area_residencial_m2        numeric,
  ADD COLUMN IF NOT EXISTS area_vialidades_m2         numeric,
  ADD COLUMN IF NOT EXISTS precio_m2_excedente        numeric,
  ADD COLUMN IF NOT EXISTS costo_mo                   numeric;

COMMENT ON COLUMN dilesa.proyectos.clasificacion_inmobiliaria IS
  'Clasificación comercial del proyecto. Valores observados en Coda: ''Interes Social'', ''Medio'', ''Residencial''. Texto libre — se modela como enum si la cardinalidad se estabiliza.';
COMMENT ON COLUMN dilesa.proyectos.area_comercial_m2 IS
  'Superficie destinada a uso comercial dentro del proyecto, en m². Subset de `area_m2`.';
COMMENT ON COLUMN dilesa.proyectos.area_residencial_m2 IS
  'Superficie destinada a uso residencial dentro del proyecto, en m². Base del cálculo de densidad de vivienda.';
COMMENT ON COLUMN dilesa.proyectos.area_vialidades_m2 IS
  'Superficie ocupada por vialidades, banquetas y equipamiento, en m². Subset de `area_m2`.';
COMMENT ON COLUMN dilesa.proyectos.precio_m2_excedente IS
  'Precio en MXN por m² excedente cuando un lote rebasa el tamaño promedio del prototipo.';
COMMENT ON COLUMN dilesa.proyectos.costo_mo IS
  'Costo de mano de obra del proyecto, en MXN. Componente del costo de construcción capturado por separado para análisis de margen.';

-- ════════════════════════════════════════════════════════════════════════════
-- 2) Flag `es_muestra` en `dilesa.unidades` (casa demo / show home)
-- ════════════════════════════════════════════════════════════════════════════
-- Beto (2026-05-27): "normalmente en los fraccionamientos armamos casas
-- para demostración y cuando están como demo no están disponibles para
-- venta; cuando ya no las necesitamos se les quita el check mark y se
-- les agrega el valor de los accesorios y muebles que tiene y se pone a
-- disposición del equipo de ventas".
--
-- v2 captura el flag. La parte de "valor de accesorios" al liberarla
-- se difiere al sprint siguiente — requiere columna nueva
-- `valor_accesorios` + workflow UI (servir action "Liberar de demo a
-- inventario" que pida el monto).

ALTER TABLE dilesa.unidades
  ADD COLUMN IF NOT EXISTS es_muestra boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN dilesa.unidades.es_muestra IS
  'Casa demo / show home. Cuando es true, la unidad NO está disponible para venta aunque esté terminada. Se desmarca cuando deja de ser muestra (en ese momento se captura el valor de accesorios — pendiente Sprint D).';

CREATE INDEX IF NOT EXISTS idx_unidades_es_muestra
  ON dilesa.unidades (proyecto_id) WHERE es_muestra = true;

-- ════════════════════════════════════════════════════════════════════════════
-- 3) Reescribir `dilesa.v_proyecto_avances` agregando derivaciones nuevas
-- ════════════════════════════════════════════════════════════════════════════
-- Preserva todas las columnas del Sprint A en el mismo orden (contrato
-- usado por <ProyectoDetalle> y <ProyectosModule>). Agrega al final:
--   - casas_muestra (count de unidades con `es_muestra=true`)
--   - lotes_comerciales, lotes_residenciales (segmentación de mix)
--   - tamano_lote_promedio_m2 (AVG area_m2 en unidades)
--   - inventario_formalizado (vendida + escriturada + entregada)
--   - inventario_disponible_venta (terminadas, NO muestra, sin
--     compromiso — porque las muestra NO están disponibles para venta)
--   - casas_asignadas, casas_entregadas (etapas del pipeline)
--   - densidad_vivienda (lotes residenciales por hectárea de área
--     residencial; NULL si falta área residencial capturada)
--
-- Tipo_lote distintos en datos reales (case-sensitive):
--   'Interes Social' (1220), 'Residencial Medio' (320),
--   'Residencial' (15), 'Comercial' (12), 'Equipamiento' (1),
--   'Area Verde (Donación Municipal)' (22).
-- Por convención: "residencial" = los 3 habitacionales (Interes Social
-- + Residencial Medio + Residencial). "Comercial" = exclusivo Comercial.

CREATE OR REPLACE VIEW dilesa.v_proyecto_avances
WITH (security_invoker = on) AS
WITH u AS (
  SELECT
    proyecto_id,
    COUNT(*)                                                                                           AS total,
    COUNT(*) FILTER (WHERE estado IN ('terminada','asignada','vendida','escriturada','entregada'))    AS construidas,
    COUNT(*) FILTER (WHERE estado IN ('vendida','escriturada','entregada','asignada'))                AS vendidas,
    COUNT(*) FILTER (WHERE estado <> 'planeada')                                                       AS con_avance_urb,
    COUNT(*) FILTER (WHERE estado = 'terminada')                                                       AS terminadas,
    COUNT(*) FILTER (WHERE estado = 'en_construccion')                                                 AS en_construccion,
    COUNT(*) FILTER (WHERE estado = 'escriturada')                                                     AS escrituradas,
    COUNT(*) FILTER (WHERE estado = 'asignada')                                                        AS asignadas,
    COUNT(*) FILTER (WHERE estado = 'entregada')                                                       AS entregadas,
    COUNT(*) FILTER (WHERE estado IN ('vendida','escriturada','entregada'))                            AS formalizadas,
    COUNT(*) FILTER (WHERE es_muestra)                                                                 AS muestra,
    COUNT(*) FILTER (WHERE estado = 'terminada' AND NOT es_muestra)                                    AS disponible_venta,
    COUNT(*) FILTER (WHERE tipo_lote = 'Comercial')                                                    AS comerciales,
    COUNT(*) FILTER (WHERE tipo_lote IN ('Interes Social','Residencial Medio','Residencial'))          AS residenciales,
    AVG(area_m2)                                                                                       AS lote_promedio_m2,
    AVG(precio) FILTER (WHERE estado IN ('vendida','escriturada','entregada') AND precio IS NOT NULL)  AS ticket_promedio,
    SUM(precio) FILTER (WHERE estado IN ('vendida','escriturada','entregada') AND precio IS NOT NULL)  AS ventas_totales
  FROM dilesa.unidades
  WHERE deleted_at IS NULL
  GROUP BY proyecto_id
)
SELECT
  p.id                                                                                 AS proyecto_id,
  p.empresa_id,
  COALESCE(u.total, 0)                                                                 AS lotes_total,
  COALESCE(u.construidas, 0)                                                           AS lotes_construidos,
  COALESCE(u.vendidas, 0)                                                              AS lotes_vendidos,
  COALESCE(u.con_avance_urb, 0)                                                        AS lotes_urbanizados,
  COALESCE(u.terminadas, 0)                                                            AS casas_terminadas,
  COALESCE(u.en_construccion, 0)                                                       AS casas_en_construccion,
  COALESCE(u.escrituradas, 0)                                                          AS casas_escrituradas,
  CASE WHEN u.total > 0 THEN ROUND(100.0 * u.con_avance_urb / u.total, 2) ELSE NULL END AS avance_urb_pct,
  CASE WHEN u.total > 0 THEN ROUND(100.0 * u.construidas    / u.total, 2) ELSE NULL END AS avance_const_pct,
  CASE WHEN u.total > 0 THEN ROUND(100.0 * u.vendidas       / u.total, 2) ELSE NULL END AS avance_vts_pct,
  GREATEST(0, COALESCE(u.total, 0) - COALESCE(u.vendidas, 0))                          AS parque_disponible,
  u.ticket_promedio,
  COALESCE(u.ventas_totales, 0)                                                        AS ventas_totales,
  -- Estado sugerido (regla estricta: construidas=total Y vendidas=total).
  CASE
    WHEN u.total IS NULL OR u.total = 0 THEN p.estado
    WHEN u.construidas = u.total AND u.vendidas = u.total THEN 'completado'
    ELSE 'ejecutando'
  END                                                                                  AS estado_sugerido,
  p.estado                                                                             AS estado_actual,
  p.tipo                                                                               AS tipo,
  -- ── Nuevas columnas Sprint C ────────────────────────────────────────────
  COALESCE(u.asignadas, 0)                                                             AS casas_asignadas,
  COALESCE(u.entregadas, 0)                                                            AS casas_entregadas,
  COALESCE(u.muestra, 0)                                                               AS casas_muestra,
  COALESCE(u.formalizadas, 0)                                                          AS inventario_formalizado,
  -- Disponible para venta: terminadas Y NO marcadas como muestra (las
  -- muestra no están disponibles para venta aunque estén terminadas).
  COALESCE(u.disponible_venta, 0)                                                      AS inventario_disponible_venta,
  COALESCE(u.comerciales, 0)                                                           AS lotes_comerciales,
  COALESCE(u.residenciales, 0)                                                         AS lotes_residenciales,
  u.lote_promedio_m2                                                                   AS tamano_lote_promedio_m2,
  -- Densidad de vivienda = lotes residenciales / (área residencial / 10,000).
  -- NULL cuando falta área residencial capturada en el proyecto.
  CASE
    WHEN p.area_residencial_m2 IS NULL OR p.area_residencial_m2 <= 0 THEN NULL
    ELSE ROUND((COALESCE(u.residenciales, 0)::numeric / (p.area_residencial_m2 / 10000.0))::numeric, 2)
  END                                                                                  AS densidad_vivienda
FROM dilesa.proyectos p
LEFT JOIN u ON u.proyecto_id = p.id
WHERE p.deleted_at IS NULL;

COMMENT ON VIEW dilesa.v_proyecto_avances IS
  'Agregados derivados de `dilesa.unidades` por proyecto. Sprint A: avance %, conteos básicos, ticket, ventas, estado sugerido. Sprint C: segmentación comercial/residencial, lote promedio, inventario formalizado/disponible (excluye muestra), casas asignadas/entregadas/muestra, densidad de vivienda. Reemplaza las 46 fórmulas de la tabla Coda *Proyectos.';

NOTIFY pgrst, 'reload schema';

COMMIT;
