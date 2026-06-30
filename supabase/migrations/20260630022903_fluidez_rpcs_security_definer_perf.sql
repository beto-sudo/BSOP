-- Performance del radar/fluidez: lecturas pesadas vía SECURITY DEFINER
-- — iniciativa dilesa-fluidez-pipeline.
--
-- PROBLEMA (medido con EXPLAIN en prod): las vistas v_fase_vara /
-- v_venta_fase_duraciones / v_ventas_lista_antiguedad son `security_invoker`, así
-- que bajo el rol `authenticated` evalúan la RLS de ventas/venta_fases POR FILA
-- — `core.fn_has_empresa(empresa_id)` + `dilesa.fn_es_vendedor_restringido()`,
-- funciones que consultan tablas core. Sobre ~15k filas de venta_fases son
-- segundos → el radar truena con "statement timeout" y la lista tarda 7s. Como
-- superusuario (RLS off) la misma query corre en 32ms: la RLS-por-fila es el cuello.
--
-- FIX: exponer las lecturas como funciones SECURITY DEFINER que (1) autorizan la
-- empresa UNA vez (no por fila) y (2) escanean como owner (RLS de las bases
-- saltada), filtrando explícito por `p_empresa`. Devuelven solo datos de tiempo
-- agregados/por-tramo, no info financiera ni PII. La autorización por fila se
-- reemplaza por un guard único + filtro por empresa → vuelve a ~30ms.
--
-- Patrón de seguridad: guard `fn_has_empresa(p_empresa) OR fn_is_admin()` arriba
-- (lee el auth.uid() del llamador vía GUC, intacto bajo SECURITY DEFINER), luego
-- el escaneo acotado a esa empresa. REVOKE PUBLIC + GRANT authenticated.

BEGIN;

-- 1) Vara por fase (benchmark histórico + meta). La consumen radar, lista,
--    expediente y la pestaña Fluidez en CADA carga → es la lectura más caliente.
CREATE OR REPLACE FUNCTION dilesa.fn_fase_vara(p_empresa uuid)
RETURNS TABLE(posicion int, fase text, mediana numeric, p90 numeric, n bigint, meta numeric, vara numeric)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = dilesa, core, public
AS $$
BEGIN
  IF NOT (core.fn_has_empresa(p_empresa) OR core.fn_is_admin()) THEN
    RAISE EXCEPTION 'Sin acceso a la empresa' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
    SELECT v.posicion, v.fase, v.mediana, v.p90, v.n, v.meta, v.vara
    FROM dilesa.v_fase_vara v
    WHERE v.empresa_id = p_empresa;
END;
$$;

COMMENT ON FUNCTION dilesa.fn_fase_vara(uuid) IS
  'Vara por fase (benchmark+meta) sin RLS-por-fila: guard de empresa una vez + escaneo como owner. Fix de performance (dilesa-fluidez-pipeline).';

REVOKE ALL ON FUNCTION dilesa.fn_fase_vara(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION dilesa.fn_fase_vara(uuid) TO authenticated;

-- 2) Antigüedad en fase de la lista (días en la fase actual por venta activa).
CREATE OR REPLACE FUNCTION dilesa.fn_ventas_lista_antiguedad(p_empresa uuid)
RETURNS TABLE(venta_id uuid, fase_posicion int, fase_actual text, dias_en_fase int)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = dilesa, core, public
AS $$
BEGIN
  IF NOT (core.fn_has_empresa(p_empresa) OR core.fn_is_admin()) THEN
    RAISE EXCEPTION 'Sin acceso a la empresa' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
    SELECT a.venta_id, a.fase_posicion, a.fase_actual, a.dias_en_fase
    FROM dilesa.v_ventas_lista_antiguedad a
    WHERE a.empresa_id = p_empresa;
END;
$$;

COMMENT ON FUNCTION dilesa.fn_ventas_lista_antiguedad(uuid) IS
  'Días en fase actual por venta activa, sin RLS-por-fila. Fix de performance (dilesa-fluidez-pipeline).';

REVOKE ALL ON FUNCTION dilesa.fn_ventas_lista_antiguedad(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION dilesa.fn_ventas_lista_antiguedad(uuid) TO authenticated;

-- 3) Calificación por fase en el periodo (radar). Ya era función pero
--    SECURITY INVOKER → heredaba la RLS-por-fila de v_venta_fase_duraciones.
--    La pasamos a SECURITY DEFINER + guard (misma firma → CREATE OR REPLACE).
CREATE OR REPLACE FUNCTION dilesa.fn_fase_calificacion(
  p_empresa uuid,
  p_desde date DEFAULT NULL,
  p_hasta date DEFAULT NULL
)
RETURNS TABLE(posicion int, fase text, n bigint, mediana numeric, p90 numeric)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = dilesa, core, public
AS $$
BEGIN
  IF NOT (core.fn_has_empresa(p_empresa) OR core.fn_is_admin()) THEN
    RAISE EXCEPTION 'Sin acceso a la empresa' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
    SELECT
      d.posicion,
      d.fase,
      count(*)::bigint AS n,
      percentile_cont(0.5) WITHIN GROUP (ORDER BY d.dias_en_fase)::numeric(8, 1) AS mediana,
      percentile_cont(0.9) WITHIN GROUP (ORDER BY d.dias_en_fase)::numeric(8, 1) AS p90
    FROM dilesa.v_venta_fase_duraciones d
    WHERE d.empresa_id = p_empresa
      AND NOT d.es_tramo_abierto
      AND NOT d.es_negativo
      AND d.posicion <= 14
      AND (p_desde IS NULL OR d.fecha_salida >= p_desde)
      AND (p_hasta IS NULL OR d.fecha_salida <= p_hasta)
    GROUP BY d.posicion, d.fase;
END;
$$;

REVOKE ALL ON FUNCTION dilesa.fn_fase_calificacion(uuid, date, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION dilesa.fn_fase_calificacion(uuid, date, date) TO authenticated;

-- Recarga el cache de PostgREST para exponer las funciones nuevas/redefinidas.
NOTIFY pgrst, 'reload schema';

COMMIT;
