-- Iniciativa: dilesa-proyectos-paridad-coda (Sprint D — avance sobre vivienda).
--
-- Problema (Beto, 2026-06-05): los desarrollos terminados (Loma Verde,
-- Loma Verde 2, Lomas del Valle, Paseo del Valle) aparecían "en construcción"
-- y "en ejecución" al ~98% aunque toda la vivienda está construida y vendida.
-- Causa raíz: `v_proyecto_avances` medía construcción/ventas sobre el TOTAL de
-- unidades, metiendo en el denominador unidades que nunca se construyen ni se
-- venden como vivienda:
--   - Áreas verdes de donación municipal (se donan al municipio).
--   - Equipamiento urbano.
--   - Lotes comerciales (terreno vendible, no vivienda — "pasan al portafolio
--     de terrenos" según Beto).
-- Con la regla estricta del 2026-05-26 (`construidas = total AND vendidas =
-- total`) ningún fraccionamiento terminado podía llegar a 100% ni a
-- estado_sugerido='completado', porque siempre le quedaban esas unidades.
--
-- Cambio:
--   1. v_proyecto_avances: `avance_const_pct`, `avance_vts_pct`,
--      `parque_disponible` y `estado_sugerido` se calculan ahora sobre
--      VIVIENDA ACTIVA = unidades cuyo tipo_lote NO es comercial / donación
--      municipal / área verde / equipamiento, Y que aún no fueron liberadas
--      al portafolio de activos (activo_id IS NULL). Todas las demás columnas
--      (conteos informativos, urbanización, comerciales/residenciales, ticket,
--      ventas totales, densidad) se preservan idénticas.
--   2. Paseo del Valle (PDV): sus 15 lotes residenciales ya se escrituraron a
--      los socios de DILESA — pasan de 'lote_urbanizado' a 'escriturada'.
--   3. Estados de proyecto: LV, LV2 y PDV pasan a 'completado' (su vivienda
--      quedó 100% construida y vendida/escriturada). LDV queda 'ejecutando'
--      hasta liberar al portafolio sus 2 casas en uso (1 renta, 1 oficina) —
--      eso es la Fase 2 (mecanismo unidad → activo).
--
-- Regla de transición (refina la estricta del 2026-05-26): un desarrollo pasa
-- a 'completado' cuando su VIVIENDA está 100% construida y 100% vendida. Las
-- unidades no-vivienda (comercial / donación municipal) y las liberadas al
-- portafolio no cuentan. Documentado en
-- docs/planning/dilesa-proyectos-paridad-coda.md §Sprint D.
--
-- Verificado en dry-run contra prod (2026-06-05): LV 241/241→100/100 completado,
-- LV2 274/274→100/100 completado, PDV 15/15→100/100 completado,
-- LDV 228/226→100/99.12 ejecutando (sube a 100/100 al liberar las 2 casas).

BEGIN;

CREATE OR REPLACE VIEW dilesa.v_proyecto_avances WITH (security_invoker = on) AS
WITH u AS (
  SELECT
    unidades.proyecto_id,
    count(*) AS total,
    count(*) FILTER (WHERE unidades.estado = ANY (ARRAY['terminada'::text, 'asignada'::text, 'vendida'::text, 'escriturada'::text, 'entregada'::text])) AS construidas,
    count(*) FILTER (WHERE unidades.estado = ANY (ARRAY['vendida'::text, 'escriturada'::text, 'entregada'::text, 'asignada'::text])) AS vendidas,
    count(*) FILTER (WHERE unidades.estado <> 'planeada'::text) AS con_avance_urb,
    count(*) FILTER (WHERE unidades.estado = 'terminada'::text) AS terminadas,
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
    -- VIVIENDA ACTIVA: base nueva para avance de construcción/ventas y estado
    -- sugerido. Excluye no-vivienda (comercial / donación municipal / área
    -- verde / equipamiento) y unidades ya liberadas al portafolio (activo_id).
    -- El predicado usa POSIX regex sobre lower(tipo_lote) para tolerar la
    -- nomenclatura sucia heredada de Coda ("Area Verde (Donación Municipal)"
    -- vs "municipal", mayúsculas inconsistentes).
    count(*) FILTER (
      WHERE unidades.activo_id IS NULL
        AND lower(coalesce(unidades.tipo_lote, '')) !~ '(comercial|municipal|donaci|area verde|equipamiento)'
    ) AS viv_total,
    count(*) FILTER (
      WHERE unidades.activo_id IS NULL
        AND lower(coalesce(unidades.tipo_lote, '')) !~ '(comercial|municipal|donaci|area verde|equipamiento)'
        AND unidades.estado = ANY (ARRAY['terminada'::text, 'asignada'::text, 'vendida'::text, 'escriturada'::text, 'entregada'::text])
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
  -- Avance de construcción/ventas AHORA sobre vivienda activa (no sobre el total).
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

-- (2) Paseo del Valle: los 15 lotes residenciales ya se escrituraron a los
-- socios de DILESA. Su estado pasa de 'lote_urbanizado' a 'escriturada'.
UPDATE dilesa.unidades up
SET estado = 'escriturada', updated_at = now()
FROM dilesa.proyectos p
WHERE up.proyecto_id = p.id
  AND p.empresa_id = 'f5942ed4-7a6b-4c39-af18-67b9fbf7f479'::uuid  -- DILESA
  AND p.clave_interna = 'PDV'
  AND p.deleted_at IS NULL
  AND up.deleted_at IS NULL
  AND up.estado = 'lote_urbanizado';

-- (3) Estados de proyecto: LV, LV2 y PDV → completado (su vivienda quedó al
-- 100%). LDV se actualiza en la Fase 2 tras liberar las 2 casas al portafolio.
UPDATE dilesa.proyectos
SET estado = 'completado', updated_at = now()
WHERE empresa_id = 'f5942ed4-7a6b-4c39-af18-67b9fbf7f479'::uuid  -- DILESA
  AND clave_interna IN ('LV', 'LV2', 'PDV')
  AND deleted_at IS NULL
  AND estado = 'ejecutando';

NOTIFY pgrst, 'reload schema';

COMMIT;
