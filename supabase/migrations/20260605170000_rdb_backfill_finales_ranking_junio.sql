-- Backfill puntual (3º de la serie): producto "Finales de Ranking" (codigo Waitry 1455988).
--
-- Torneo nuevo del menú de Waitry de junio 2026, vendido (18 inscripciones × $500 = $9,000)
-- antes de darse de alta en erp.productos. Como el reporte de ventas por categoría enlaza por
-- codigo (waitry_productos.product_id = erp.productos.codigo), caía en "Sin categoría" en el tab
-- Comparativo (semana S23 / acumulado junio). Mismo fenómeno que el backfill 20260605160000 de mayo
-- — la causa de raíz (auto-alta entrante de productos nuevos de Waitry) vive en la iniciativa
-- rdb-waitry-autoalta-productos (proposed).
--
-- Alta: categoria 'Torneos' (aprobada por Beto 2026-06-05), tipo='servicio' (como los demás torneos),
-- inventariable=false (solo para enlace del reporte, no entra a conteo de stock).
-- Idempotente (NOT EXISTS por empresa+codigo) y robusto a Preview (JOIN core.empresas +
-- erp.categorias_producto por nombre → inserta 0 filas si el branch no tiene los datos). DML puro.

INSERT INTO erp.productos (empresa_id, codigo, nombre, tipo, categoria_id, inventariable)
SELECT e.id, '1455988', 'Finales de Ranking', 'servicio', c.id, false
FROM core.empresas e
JOIN erp.categorias_producto c ON c.empresa_id = e.id AND c.nombre = 'Torneos'
WHERE e.id = 'e52ac307-9373-4115-b65e-1178f0c4e1aa'::uuid
  AND NOT EXISTS (
    SELECT 1 FROM erp.productos p
    WHERE p.empresa_id = e.id AND p.codigo = '1455988'
  );
