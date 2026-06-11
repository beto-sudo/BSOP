-- ╭─ 20260611145319_normaliza_unidades_rdb ─╮
-- Normaliza unidades capturadas como texto libre en RDB al catálogo canónico
-- de lib/unidades.ts (minúsculas, singular, sin typos), previo al cambio de
-- UI que reemplaza los inputs libres por dropdown.
--
-- Valores observados en prod (2026-06-11): 'Pieza' (productos 78, receta 37,
-- requisiciones 753), 'kilos'/'Kilos' (9), 'litto' (1, typo de litro).
-- Solo filas de la empresa RDB; DILESA y demás empresas no se tocan.
-- Idempotente; en Preview branches sin datos afecta 0 filas.

BEGIN;

CREATE TEMP TABLE _unidades_map (de text PRIMARY KEY, a text NOT NULL);
INSERT INTO _unidades_map (de, a) VALUES
  ('Pieza', 'pieza'),
  ('pza', 'pieza'),
  ('Kilos', 'kilo'),
  ('kilos', 'kilo'),
  ('Litro', 'litro'),
  ('litto', 'litro');

UPDATE erp.productos p
SET unidad = m.a, updated_at = now()
FROM _unidades_map m
WHERE p.empresa_id = 'e52ac307-9373-4115-b65e-1178f0c4e1aa'
  AND p.unidad = m.de;

UPDATE erp.producto_receta pr
SET unidad = m.a, updated_at = now()
FROM _unidades_map m
WHERE pr.empresa_id = 'e52ac307-9373-4115-b65e-1178f0c4e1aa'
  AND pr.unidad = m.de;

-- requisiciones_detalle no tiene updated_at
UPDATE erp.requisiciones_detalle rd
SET unidad = m.a
FROM _unidades_map m
WHERE rd.empresa_id = 'e52ac307-9373-4115-b65e-1178f0c4e1aa'
  AND rd.unidad = m.de;

DROP TABLE _unidades_map;

COMMIT;
