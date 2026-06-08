-- Iniciativa: dilesa-proyectos-paridad-coda (Sprint D.1 — avance de
-- construcción = casas terminadas, no lotes).
--
-- Problema (Beto, 2026-06-07): el correo al Consejo mostraba el avance de
-- construcción de Lomas de los Encinos (LDLE) en 92.48%, número imposible. El
-- avance de construcción debe ser "casas terminadas / total de lotes para
-- vivienda de cada proyecto".
--
-- Causa raíz: el Sprint D (migración 20260605183000) corrigió el DENOMINADOR
-- (avance sobre vivienda activa, excluyendo comercial/donación municipal/área
-- verde/equipamiento + unidades liberadas al portafolio) pero el NUMERADOR
-- `viv_construidas` seguía contando como "construida" cualquier unidad en estado
-- terminada/asignada/vendida/escriturada/entregada, SIN verificar que tuviera
-- casa. En LDLE eso metía en el numerador:
--   - 117 lotes URBANIZADOS en estado 'terminada' pero SIN casa
--     (`producto_id IS NULL`): son lotes listos, no casas construidas. Esta es
--     la causa principal del inflado.
--   - 59 casas 'asignada' (apartadas por cliente): en DILESA la asignación
--     puede ser preventa sobre plano, antes de construir → no están terminadas.
--   652/705 = 92.48%. Restando ambas fuentes: 476/705 = 67.52%.
--
-- Cambio (solo dos agregados de la vista; el resto idéntico a 20260605183000):
--   1. `viv_construidas` (base de `avance_const_pct` y de `estado_sugerido`):
--      una unidad de vivienda activa cuenta como construida solo si
--        (a) su producto final ya se formalizó: estado IN
--            ('vendida','escriturada','entregada') — sea casa o lote vendido
--            como lote (caso Paseo del Valle: 15 lotes escriturados a socios,
--            sin casa → deben seguir contando para no romper su 100%), O
--        (b) es una CASA terminada en inventario: estado='terminada' AND
--            producto_id IS NOT NULL.
--      Excluye: lotes urbanizados en inventario ('terminada' sin casa),
--      'asignada' (preventa), 'en_construccion', 'planeada'.
--   2. `terminadas` (columna `casas_terminadas`, "Terminadas" en el correo y en
--      el detalle del proyecto): exige `producto_id IS NOT NULL` para no contar
--      lotes urbanizados como casas terminadas (LDLE 281 → 164 casas reales).
--
-- Verificado en dry-run contra prod (2026-06-07) — sin regresiones:
--   LDLE 92.48 → 67.52, LDS 89.13 → 80.43 (los 2 en ejecución),
--   LV/LV2/LDV/PDV se mantienen 100.00 y estado_sugerido='completado'
--   (PDV son lotes escriturados; cuentan por la cláusula (a)),
--   LDLD/ALDE en 0.00. casas_terminadas: LDLE 281→164, LDS 21→21, resto igual.

BEGIN;

CREATE OR REPLACE VIEW dilesa.v_proyecto_avances WITH (security_invoker = on) AS
WITH u AS (
  SELECT
    unidades.proyecto_id,
    count(*) AS total,
    count(*) FILTER (WHERE unidades.estado = ANY (ARRAY['terminada'::text, 'asignada'::text, 'vendida'::text, 'escriturada'::text, 'entregada'::text])) AS construidas,
    count(*) FILTER (WHERE unidades.estado = ANY (ARRAY['vendida'::text, 'escriturada'::text, 'entregada'::text, 'asignada'::text])) AS vendidas,
    count(*) FILTER (WHERE unidades.estado <> 'planeada'::text) AS con_avance_urb,
    -- Solo CASAS terminadas en inventario (con producto): un lote urbanizado
    -- terminado (sin casa) no es una casa terminada.
    count(*) FILTER (WHERE unidades.estado = 'terminada'::text AND unidades.producto_id IS NOT NULL) AS terminadas,
    count(*) FILTER (WHERE unidades.estado = 'en_construccion'::text) AS en_construccion,
    count(*) FILTER (WHERE unidades.estado = 'escriturada'::text) AS escrituradas,
    count(*) FILTER (WHERE unidades.estado = 'asignada'::text) AS asignadas,
    count(*) FILTER (WHERE unidades.estado = 'entregada'::text) AS entregadas,
    count(*) FILTER (WHERE unidades.estado = ANY (ARRAY['vendida'::text, 'escriturada'::text, 'entregada'::text])) AS formalizadas,
    count(*) FILTER (WHERE unidades.es_muestra) AS muestra,
    count(*) FILTER (WHERE unidades.estado = 'terminada'::text AND NOT unidades.es_muestra) AS disponible_venta,
    count(*) FILTER (WHERE unidades.tipo_lote = 'Comercial'::text) AS comerciales,
    count(*) FILTER (WHERE unidades.tipo_lote = ANY (ARRAY['Interes Social'::text, 'Residencial Medio'::text, 'Residencial'::text])) AS residenciales,
    avg(unidades.area_m2) AS lote_promedio_m2,
    avg(unidades.precio) FILTER (WHERE (unidades.estado = ANY (ARRAY['vendida'::text, 'escriturada'::text, 'entregada'::text])) AND unidades.precio IS NOT NULL) AS ticket_promedio,
    sum(unidades.precio) FILTER (WHERE (unidades.estado = ANY (ARRAY['vendida'::text, 'escriturada'::text, 'entregada'::text])) AND unidades.precio IS NOT NULL) AS ventas_totales,
    -- VIVIENDA ACTIVA: base para avance de construcción/ventas y estado
    -- sugerido. Excluye no-vivienda (comercial / donación municipal / área
    -- verde / equipamiento) y unidades ya liberadas al portafolio (activo_id).
    count(*) FILTER (
      WHERE unidades.activo_id IS NULL
        AND lower(coalesce(unidades.tipo_lote, '')) !~ '(comercial|municipal|donaci|area verde|equipamiento)'
    ) AS viv_total,
    -- CONSTRUIDA = producto final formalizado (vendida/escriturada/entregada,
    -- sea casa o lote vendido como lote) O casa terminada en inventario
    -- (terminada CON producto). Excluye lotes urbanizados sin vender
    -- ('terminada' sin producto) y 'asignada' (preventa, puede no estar
    -- construida).
    count(*) FILTER (
      WHERE unidades.activo_id IS NULL
        AND lower(coalesce(unidades.tipo_lote, '')) !~ '(comercial|municipal|donaci|area verde|equipamiento)'
        AND (
          unidades.estado = ANY (ARRAY['vendida'::text, 'escriturada'::text, 'entregada'::text])
          OR (unidades.estado = 'terminada'::text AND unidades.producto_id IS NOT NULL)
        )
    ) AS viv_construidas,
    count(*) FILTER (
      WHERE unidades.activo_id IS NULL
        AND lower(coalesce(unidades.tipo_lote, '')) !~ '(comercial|municipal|donaci|area verde|equipamiento)'
        AND unidades.estado = ANY (ARRAY['vendida'::text, 'escriturada'::text, 'entregada'::text, 'asignada'::text])
    ) AS viv_vendidas
  FROM dilesa.unidades
  WHERE unidades.deleted_at IS NULL
  GROUP BY unidades.proyecto_id
)
SELECT
  p.id AS proyecto_id,
  p.empresa_id,
  COALESCE(u.total, 0::bigint) AS lotes_total,
  COALESCE(u.construidas, 0::bigint) AS lotes_construidos,
  COALESCE(u.vendidas, 0::bigint) AS lotes_vendidos,
  COALESCE(u.con_avance_urb, 0::bigint) AS lotes_urbanizados,
  COALESCE(u.terminadas, 0::bigint) AS casas_terminadas,
  COALESCE(u.en_construccion, 0::bigint) AS casas_en_construccion,
  COALESCE(u.escrituradas, 0::bigint) AS casas_escrituradas,
  CASE WHEN u.total > 0 THEN round(100.0 * u.con_avance_urb::numeric / u.total::numeric, 2) ELSE NULL::numeric END AS avance_urb_pct,
  -- Avance de construcción = casas terminadas / total lotes vivienda activa.
  CASE WHEN u.viv_total > 0 THEN round(100.0 * u.viv_construidas::numeric / u.viv_total::numeric, 2) ELSE NULL::numeric END AS avance_const_pct,
  CASE WHEN u.viv_total > 0 THEN round(100.0 * u.viv_vendidas::numeric / u.viv_total::numeric, 2) ELSE NULL::numeric END AS avance_vts_pct,
  -- Parque disponible = vivienda activa aún no vendida (coherente con el avance).
  GREATEST(0::bigint, COALESCE(u.viv_total, 0::bigint) - COALESCE(u.viv_vendidas, 0::bigint)) AS parque_disponible,
  u.ticket_promedio,
  COALESCE(u.ventas_totales, 0::numeric) AS ventas_totales,
  -- Estado sugerido: completado cuando la VIVIENDA activa está 100% construida
  -- y 100% vendida. Si el proyecto no tiene vivienda activa (anteproyecto, o
  -- todo liberado al portafolio) preserva el estado real.
  CASE
    WHEN u.viv_total IS NULL OR u.viv_total = 0 THEN p.estado
    WHEN u.viv_construidas = u.viv_total AND u.viv_vendidas = u.viv_total THEN 'completado'::text
    ELSE 'ejecutando'::text
  END AS estado_sugerido,
  p.estado AS estado_actual,
  p.tipo,
  COALESCE(u.asignadas, 0::bigint) AS casas_asignadas,
  COALESCE(u.entregadas, 0::bigint) AS casas_entregadas,
  COALESCE(u.muestra, 0::bigint) AS casas_muestra,
  COALESCE(u.formalizadas, 0::bigint) AS inventario_formalizado,
  COALESCE(u.disponible_venta, 0::bigint) AS inventario_disponible_venta,
  COALESCE(u.comerciales, 0::bigint) AS lotes_comerciales,
  COALESCE(u.residenciales, 0::bigint) AS lotes_residenciales,
  u.lote_promedio_m2 AS tamano_lote_promedio_m2,
  CASE
    WHEN p.area_residencial_m2 IS NULL OR p.area_residencial_m2 <= 0::numeric THEN NULL::numeric
    ELSE round(COALESCE(u.residenciales, 0::bigint)::numeric / (p.area_residencial_m2 / 10000.0), 2)
  END AS densidad_vivienda
FROM dilesa.proyectos p
LEFT JOIN u ON u.proyecto_id = p.id
WHERE p.deleted_at IS NULL;

NOTIFY pgrst, 'reload schema';

COMMIT;
