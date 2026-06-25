-- ╭─ 20260625172555_agregar_onza_a_fn_factor_universal ─╮
-- Agrega la onza fluida (US, 29.5735 ml) al conversor universal de unidades, para
-- que las recetas medidas en onzas (medida típica de licor en el bar) descuenten
-- la fracción correcta de la presentación.
--
-- Espejo en TS: lib/unidades.ts (PESO_POR_UNIDAD). Mantener ambos en sync.
-- Reescrito desde la versión viva en prod (pg_get_functiondef, 2026-06-25),
-- único cambio: la fila ('onza', 'V', 29.5735).

BEGIN;

CREATE OR REPLACE FUNCTION erp.fn_factor_universal(p_de text, p_a text)
RETURNS numeric
LANGUAGE sql
IMMUTABLE
AS $fn$
  WITH u(nombre, dim, peso) AS (
    VALUES
      ('mililitro', 'V', 1::numeric),
      ('litro',     'V', 1000),
      ('onza',      'V', 29.5735),
      ('galon',     'V', 3785.412),
      ('gramo',     'M', 1),
      ('kilo',      'M', 1000)
  )
  SELECT CASE WHEN d.dim = a.dim THEN d.peso / a.peso END
  FROM u d, u a
  WHERE d.nombre = lower(btrim(p_de))
    AND a.nombre = lower(btrim(p_a));
$fn$;

COMMIT;
