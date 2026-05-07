-- CHECK constraint sobre erp.proveedores.categoria con catálogo canónico
-- de categorías de proveedores. Extensible vía ALTER (drop + recreate).
--
-- Acompañado de:
--   1. Deduplicación de notarios (FRANCISCO CEDILLO mergeado a LIC.
--      FRANCISCO JAVIER CEDILLO; LIC. GUILLERMO LOPEZ ELIZONDO mergeado
--      al regular GUILLERMO NICOLAS LOPEZ ELIZONDO con RFC).
--   2. Cleanup del prefijo "LIC." de los nombres de los notarios
--      restantes (los docs ligados quedan intactos via FK por UUID).
--   3. Auto-categorización heurística de los 201 proveedores DILESA
--      del padrón CONTPAQi (15 quedaron en "otros" para revisión manual).
--
-- Esos pasos son data-only y se aplicaron via MCP execute_sql contra DB
-- live antes de este commit; este archivo solo registra el cambio de
-- schema (CHECK constraint).

ALTER TABLE erp.proveedores
  DROP CONSTRAINT IF EXISTS proveedores_categoria_chk;

ALTER TABLE erp.proveedores
  ADD CONSTRAINT proveedores_categoria_chk
  CHECK (
    categoria IS NULL
    OR categoria = ANY (ARRAY[
      'notaria',
      'banca',
      'gobierno_y_servicios_publicos',
      'materiales_construccion',
      'ferreteria',
      'maquinaria_y_equipos',
      'tecnologia_y_software',
      'telecomunicaciones',
      'seguros',
      'servicios_profesionales',
      'retail_y_consumibles',
      'hospedaje_y_viajes',
      'combustibles_y_gas',
      'transportes_y_fletes',
      'alimentos_y_bebidas',
      'personas_fisicas',
      'otros'
    ])
  );

COMMENT ON COLUMN erp.proveedores.categoria IS
  'Categoría principal del proveedor (lo que provee). Lista canónica codificada en CHECK constraint. Para agregar: ALTER CONSTRAINT proveedores_categoria_chk con la lista expandida.';

NOTIFY pgrst, 'reload schema';
