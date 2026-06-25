-- ╭─ 20260625154104_rdb_micheladas_cervezas_rename_licores ─╮
-- Recategoriza catálogo de RDB (solo datos): mueve las micheladas/cheladas de
-- "Bebidas Prep." a "Cervezas" y renombra la categoría "Licores" →
-- "Bebidas Alcohólicas".
--
-- ALCANCE (solo datos; ningún cambio de schema):
--   1. Mover a "Cervezas" los 5 productos michelada/chelada que hoy están en
--      "Bebidas Prep." (codigos 1446345, 1276054, 1275941, 1300695, 1343837).
--   2. RENAME categoría "Licores" → "Bebidas Alcohólicas" (sus 52 productos
--      no se tocan).
--
-- ROBUSTEZ:
--   Todo se condiciona a que la empresa RDB exista (no-op en branches sin datos
--   de producción, ej. Supabase Preview). El movimiento se acota a productos
--   hoy en "Bebidas Prep." (idempotente: re-correr no re-mueve nada).
--
-- Timestamp generado con `npm run db:new` (anti-colisión multi-sesión:
-- estrictamente mayor que toda migración local + de PRs abiertos).

BEGIN;

DO $$
DECLARE
  v_empresa   uuid := 'e52ac307-9373-4115-b65e-1178f0c4e1aa';
  v_bebprep_id uuid;
  v_cervezas_id uuid;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM core.empresas WHERE id = v_empresa) THEN
    RAISE NOTICE 'Empresa RDB ausente (branch sin datos de producción) — migración no-op.';
    RETURN;
  END IF;

  -- 1. Mover micheladas/cheladas de "Bebidas Prep." → "Cervezas"
  SELECT id INTO v_bebprep_id  FROM erp.categorias_producto WHERE empresa_id = v_empresa AND nombre = 'Bebidas Prep.';
  SELECT id INTO v_cervezas_id FROM erp.categorias_producto WHERE empresa_id = v_empresa AND nombre = 'Cervezas';

  IF v_cervezas_id IS NOT NULL AND v_bebprep_id IS NOT NULL THEN
    UPDATE erp.productos
    SET categoria_id = v_cervezas_id
    WHERE empresa_id = v_empresa
      AND categoria_id = v_bebprep_id
      AND codigo IN ('1446345','1276054','1275941','1300695','1343837');
  END IF;

  -- 2. Rename "Licores" → "Bebidas Alcohólicas"
  UPDATE erp.categorias_producto
  SET nombre = 'Bebidas Alcohólicas'
  WHERE empresa_id = v_empresa AND nombre = 'Licores';

  RAISE NOTICE 'Recategorización RDB OK: micheladas/cheladas → Cervezas, Licores → Bebidas Alcohólicas.';
END;
$$;

-- La vista rdb.v_waitry_productos_categoria resuelve producto→categoría en vivo;
-- recargar el cache de PostgREST para que los embeds reflejen los cambios.
NOTIFY pgrst, 'reload schema';

COMMIT;
