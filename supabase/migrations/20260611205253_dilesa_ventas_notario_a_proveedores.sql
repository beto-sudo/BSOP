-- ╭─ 20260611205253_dilesa_ventas_notario_a_proveedores ─╮
-- Centralización del catálogo de notarías (pedido de Beto 2026-06-11):
-- `dilesa.ventas.notario_id` deja de apuntar a `erp.personas` (catálogo
-- paralelo `tipo='notario'`) y pasa a `erp.proveedores` (categoría
-- `notaria`), la misma fuente que ya usa `erp.documentos.notario_proveedor_id`.
-- La persona ligada al proveedor lleva el contacto; la edición vive en el
-- módulo Proveedores. El código (selector F7, emails de dictamen y
-- escrituración, PDF, magic link, F10) lee vía lib/dilesa/notarios.ts.
--
-- Data: remap genérico persona→su proveedor-notaría; los huérfanos quedan
-- NULL (en prod solo existe 1 fila con notario_id — una prueba — que cae a
-- NULL). En Preview branches sin datos ambos UPDATE son no-op.

BEGIN;

-- 1. Remap: ventas cuyo notario_id apunta a la persona ligada de un
--    proveedor-notaría → el id del proveedor.
UPDATE dilesa.ventas v
SET notario_id = pr.id
FROM erp.proveedores pr
WHERE v.notario_id IS NOT NULL
  AND pr.persona_id = v.notario_id
  AND pr.categoria = 'notaria'
  AND pr.deleted_at IS NULL;

-- 2. Huérfanos (persona sin proveedor-notaría, p.ej. registros de prueba):
--    NULL para que la FK nueva valide.
UPDATE dilesa.ventas v
SET notario_id = NULL
WHERE v.notario_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM erp.proveedores pr
    WHERE pr.id = v.notario_id AND pr.deleted_at IS NULL
  );

-- 3. FK swap.
ALTER TABLE dilesa.ventas DROP CONSTRAINT ventas_notario_id_fkey;
ALTER TABLE dilesa.ventas
  ADD CONSTRAINT ventas_notario_id_fkey
  FOREIGN KEY (notario_id) REFERENCES erp.proveedores(id);

COMMENT ON COLUMN dilesa.ventas.notario_id IS
  'Notaría asignada en F7 — FK a erp.proveedores (categoria=''notaria''). '
  'El contacto (nombre/email/teléfono) vive en la persona ligada al '
  'proveedor (erp.proveedores.persona_id → erp.personas); se edita en el '
  'módulo Proveedores. Antes apuntaba a erp.personas tipo=''notario'' '
  '(catálogo paralelo retirado).';

NOTIFY pgrst, 'reload schema';

COMMIT;
