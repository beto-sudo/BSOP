-- ╭─ 20260625175121_agregar_copa_a_fn_factor_universal ─╮
-- Agrega la "copa" (medida de servicio del bar = 1.5 onzas = 44.36025 ml) al
-- conversor universal de unidades, para capturar recetas servidas por copa.
--
-- Espejo en TS: lib/unidades.ts (PESO_POR_UNIDAD). Mantener ambos en sync.
-- Reescrito desde la versión viva en prod (ya incluía onza), único cambio:
-- la fila ('copa', 'V', 44.36025).

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
      ('copa',      'V', 44.36025),
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
