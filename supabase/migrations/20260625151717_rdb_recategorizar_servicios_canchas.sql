-- ╭─ 20260625151717_rdb_recategorizar_servicios_canchas ─╮
-- Recategoriza el catálogo de RDB: renombra "Uso de cancha" → "Renta cancha
-- Coach" y divide "Servicios" en 5 categorías (rentas de cancha por deporte,
-- clínica y propina), eliminando "Servicios" una vez vacía. Solo datos.
--
-- CONTEXTO:
--   Las categorías del catálogo de RDB (erp.categorias_producto, leídas por
--   el tab "Por categoría" de /rdb/ventas vía rdb.v_waitry_productos_categoria)
--   mezclaban en "Servicios" rentas de cancha de 3 deportes, clínica y propinas.
--   Beto pidió (2026-06-25) un desglose más fino del negocio deportivo.
--
-- ALCANCE (solo datos; ningún cambio de schema):
--   1. RENAME categoría "Uso de cancha" → "Renta cancha Coach" (reorden 93→96).
--      Sus 9 productos (Uso cancha coach…) no se tocan.
--   2. CREATE 5 categorías nuevas: Renta cancha Pádel/Tenis/Pickleball,
--      Clínica Especializada, Propina.
--   3. Recategorizar los 14 productos de "Servicios" hacia esas categorías:
--        Renta cancha Pádel      ← 1298689 (Renta Cancha Padel), 1277228 (Renta de Pala Adidas)
--        Renta cancha Tenis      ← 1298702, 1298703
--        Renta cancha Pickleball ← 1298714, 1298715, 1298716, 1298717
--        Clínica Especializada   ← 1436058
--        Propina                 ← 1301141, 1301142, 1301143, 1301144, 1301145
--   4. DELETE categoría "Servicios" una vez vacía.
--
--   Decisión de Beto sobre el huérfano "Renta de Pala Adidas" (accesorio, no
--   cancha): va a "Renta cancha Pádel" y "Servicios" se elimina por completo.
--
-- ROBUSTEZ:
--   Todo se condiciona a que la empresa RDB exista (no-op en branches sin datos
--   de producción, ej. Supabase Preview). Las altas son idempotentes (NOT
--   EXISTS); los UPDATE se acotan a productos hoy en "Servicios" para no tocar
--   códigos duplicados que vivan en otra categoría; el DELETE solo procede si la
--   categoría quedó vacía (si no, aborta con EXCEPTION).
--
-- Timestamp generado con `npm run db:new` (anti-colisión multi-sesión:
-- estrictamente mayor que toda migración local + de PRs abiertos).

BEGIN;

DO $$
DECLARE
  v_empresa      uuid := 'e52ac307-9373-4115-b65e-1178f0c4e1aa';
  v_servicios_id uuid;
  v_padel_id     uuid;
  v_tenis_id     uuid;
  v_pickle_id    uuid;
  v_clinica_id   uuid;
  v_propina_id   uuid;
  v_restantes    integer;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM core.empresas WHERE id = v_empresa) THEN
    RAISE NOTICE 'Empresa RDB ausente (branch sin datos de producción) — migración no-op.';
    RETURN;
  END IF;

  -- 1. Rename "Uso de cancha" → "Renta cancha Coach" (+ reorden para agrupar las rentas)
  UPDATE erp.categorias_producto
  SET nombre = 'Renta cancha Coach', orden = 96
  WHERE empresa_id = v_empresa AND nombre = 'Uso de cancha';

  -- 2. Alta de las 5 categorías nuevas (idempotente)
  INSERT INTO erp.categorias_producto (empresa_id, nombre, color, orden)
  SELECT v_empresa, x.nombre, x.color, x.orden
  FROM (VALUES
    ('Renta cancha Pádel',      '#14b8a6', 93),
    ('Renta cancha Tenis',      '#22c55e', 94),
    ('Renta cancha Pickleball', '#10b981', 95),
    ('Clínica Especializada',   '#f97316', 97),
    ('Propina',                 '#94a3b8', 98)
  ) AS x(nombre, color, orden)
  WHERE NOT EXISTS (
    SELECT 1 FROM erp.categorias_producto c
    WHERE c.empresa_id = v_empresa AND c.nombre = x.nombre
  );

  -- Resolver ids
  SELECT id INTO v_servicios_id FROM erp.categorias_producto WHERE empresa_id = v_empresa AND nombre = 'Servicios';
  SELECT id INTO v_padel_id     FROM erp.categorias_producto WHERE empresa_id = v_empresa AND nombre = 'Renta cancha Pádel';
  SELECT id INTO v_tenis_id     FROM erp.categorias_producto WHERE empresa_id = v_empresa AND nombre = 'Renta cancha Tenis';
  SELECT id INTO v_pickle_id    FROM erp.categorias_producto WHERE empresa_id = v_empresa AND nombre = 'Renta cancha Pickleball';
  SELECT id INTO v_clinica_id   FROM erp.categorias_producto WHERE empresa_id = v_empresa AND nombre = 'Clínica Especializada';
  SELECT id INTO v_propina_id   FROM erp.categorias_producto WHERE empresa_id = v_empresa AND nombre = 'Propina';

  -- 3. Recategorizar — acotado a productos hoy en "Servicios"
  IF v_servicios_id IS NOT NULL THEN
    UPDATE erp.productos SET categoria_id = v_padel_id
      WHERE empresa_id = v_empresa AND categoria_id = v_servicios_id AND codigo IN ('1298689','1277228');
    UPDATE erp.productos SET categoria_id = v_tenis_id
      WHERE empresa_id = v_empresa AND categoria_id = v_servicios_id AND codigo IN ('1298702','1298703');
    UPDATE erp.productos SET categoria_id = v_pickle_id
      WHERE empresa_id = v_empresa AND categoria_id = v_servicios_id AND codigo IN ('1298714','1298715','1298716','1298717');
    UPDATE erp.productos SET categoria_id = v_clinica_id
      WHERE empresa_id = v_empresa AND categoria_id = v_servicios_id AND codigo IN ('1436058');
    UPDATE erp.productos SET categoria_id = v_propina_id
      WHERE empresa_id = v_empresa AND categoria_id = v_servicios_id AND codigo IN ('1301141','1301142','1301143','1301144','1301145');

    -- 4. Eliminar "Servicios" solo si quedó vacía
    SELECT count(*) INTO v_restantes
    FROM erp.productos WHERE empresa_id = v_empresa AND categoria_id = v_servicios_id;

    IF v_restantes > 0 THEN
      RAISE EXCEPTION 'Servicios aún tiene % producto(s) sin recategorizar — no se elimina', v_restantes;
    END IF;

    DELETE FROM erp.categorias_producto WHERE id = v_servicios_id;
  END IF;

  RAISE NOTICE 'Recategorización RDB OK: Uso de cancha→Renta cancha Coach, 5 categorías nuevas, Servicios eliminada.';
END;
$$;

-- La vista rdb.v_waitry_productos_categoria resuelve producto→categoría en vivo;
-- recargar el cache de PostgREST para que los embeds reflejen los cambios.
NOTIFY pgrst, 'reload schema';

COMMIT;
