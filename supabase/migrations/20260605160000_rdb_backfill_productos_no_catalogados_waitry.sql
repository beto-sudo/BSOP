-- Backfill: alta en catálogo de 38 productos vendidos en Waitry (POS) pero ausentes de erp.productos.
--
-- Contexto: el reporte "ventas por categoría" de /rdb/ventas enlaza cada línea de venta con su
-- producto por codigo (rdb.waitry_productos.product_id = erp.productos.codigo) y de ahí toma la
-- categoría. Cuando un producto nuevo se da de alta en el menú de Waitry pero nunca se captura en
-- erp.productos, sus ventas caen en "Sin categoría" — no por falta de categoría, sino por falta del
-- producto en el catálogo. El webhook entrante (supabase/functions/waitry-webhook) registra la venta
-- pero no crea el producto en erp.productos, así que el hueco se reabre con cada producto nuevo del
-- menú. Este es el 2º backfill puntual; el 1º fue 20260521164159 (iniciativa rdb-ventas-por-categoria).
-- La solución de raíz (auto-alta entrante) vive en su propia iniciativa.
--
-- Estos 38 son los product_id vendidos en mayo 2026 sin match en erp.productos (verificado read-only:
-- ninguno existe en el catálogo, en ningún estado). Se dan de alta con:
--   - codigo = product_id de Waitry (cierra el enlace del reporte).
--   - categoria_id resuelta por nombre (lista aprobada por Beto 2026-06-05).
--   - inventariable = false: existen solo para el enlace del reporte; NO entran al conteo de stock
--     (Pablo puede activar inventario desde la UI para los que lleven stock propio). Replica el estado
--     ya normal en RDB (59 productos con clasificacion='inventariable' + inventariable=false).
--   - tipo = 'servicio' para uso de cancha / torneos; 'producto' para el resto.
--
-- Idempotente (NOT EXISTS por empresa+codigo) y robusto a Preview (JOIN a core.empresas: si la
-- empresa/categorías no existen en el branch, inserta 0 filas en vez de romper por FK). Solo DML —
-- no cambia el schema, no requiere regenerar SCHEMA_REF/types.

INSERT INTO erp.productos (empresa_id, codigo, nombre, tipo, categoria_id, inventariable)
SELECT e.id, v.codigo, v.nombre, v.tipo, c.id, false
FROM (VALUES
  ('1434067', 'Taquito de Guisado',              'producto', 'Comida'),
  ('1446341', 'flautas orden 6',                 'producto', 'Comida'),
  ('1411722', 'Hamburguesa',                     'producto', 'Comida'),
  ('1445946', 'Papas fritas con queso',          'producto', 'Comida'),
  ('1446340', 'flautas orden 4',                 'producto', 'Comida'),
  ('1434068', 'Taquito de Barbacoa',             'producto', 'Comida'),
  ('1430865', 'Fruta con chamoy',                'producto', 'Comida'),
  ('1446343', 'hamburguesa con queso',           'producto', 'Comida'),
  ('1446344', 'hamburguesa con papas',           'producto', 'Comida'),
  ('1432665', 'Elote en vaso',                   'producto', 'Comida'),
  ('1447166', 'Orden de tacos',                  'producto', 'Comida'),
  ('1447164', 'Taquito de Chicharron',           'producto', 'Comida'),
  ('1446342', 'hamburguesa tocino y queso',      'producto', 'Comida'),
  ('1446347', 'fritos con queso',                'producto', 'Comida'),
  ('1447150', 'tacos de bistec harina',          'producto', 'Comida'),
  ('1447160', 'Taquito de Papas con chorizo',    'producto', 'Comida'),
  ('1447161', 'Taquito de Frijoles con chorizo', 'producto', 'Comida'),
  ('1447163', 'Taquito de huevo machacado',      'producto', 'Comida'),
  ('1447165', 'Taquito de deshebrada',           'producto', 'Comida'),
  ('1432294', 'BLUE POWER',                      'producto', 'Bebidas Prep.'),
  ('1432295', 'PROTEIN LATTE',                   'producto', 'Bebidas Prep.'),
  ('1432285', 'POWER PADEL',                     'producto', 'Bebidas Prep.'),
  ('1432292', 'CHOCOLATE SMASH',                 'producto', 'Bebidas Prep.'),
  ('1432293', 'BERRY RECOVERY',                  'producto', 'Bebidas Prep.'),
  ('1446345', 'chelada',                         'producto', 'Bebidas Prep.'),
  ('1446346', 'clamato preparado con mineral',   'producto', 'Bebidas Prep.'),
  ('1300106', 'Maestro Dobel Diamante Derecho',  'producto', 'Licores'),
  ('1300155', 'Whiskey Etiqueta Roja Pintado',   'producto', 'Licores'),
  ('1277189', 'Whiskey Etiqueta Negra Pintado',  'producto', 'Licores'),
  ('1300148', 'Whiskey Etiqueta Roja Preparado', 'producto', 'Licores'),
  ('1300154', 'Whiskey Etiqueta Roja Derecho',   'producto', 'Licores'),
  ('1405713', 'Playera de torneo',               'producto', 'Merchandise'),
  ('1300145', 'Gorra RDB',                       'producto', 'Merchandise'),
  ('1432668', 'Tostitos con elote',              'producto', 'Snacks'),
  ('1432666', 'Fritos',                          'producto', 'Snacks'),
  ('1435706', 'Uso cancha coach Manuel',         'servicio', 'Uso de cancha'),
  ('1435699', 'Uso cancha coach Paco',           'servicio', 'Uso de cancha'),
  ('1364564', 'Torneo Tenis $200',               'servicio', 'Torneos')
) AS v(codigo, nombre, tipo, categoria_nombre)
JOIN core.empresas e
  ON e.id = 'e52ac307-9373-4115-b65e-1178f0c4e1aa'::uuid
LEFT JOIN erp.categorias_producto c
  ON c.empresa_id = e.id AND c.nombre = v.categoria_nombre
WHERE NOT EXISTS (
  SELECT 1 FROM erp.productos p
  WHERE p.empresa_id = e.id AND p.codigo = v.codigo
);
