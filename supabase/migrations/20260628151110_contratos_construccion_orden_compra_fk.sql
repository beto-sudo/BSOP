-- ╭─ 20260628151110_contratos_construccion_orden_compra_fk ─╮
-- Sprint 3 · iniciativa dilesa-adjudicacion-contrato-obra
--
-- Liga OC ↔ Contrato. El caso "labor + material" (raro, opt-in) genera DOS
-- artefactos desde una misma cotización: una OC (material) y un Contrato (mano de
-- obra). Esta FK deja al contrato apuntar a su OC hermana.
--
-- ON DELETE SET NULL: si la OC se borra/cancela físicamente, el contrato no se
-- cae (sigue válido por su lado). Índice único PARCIAL: una OC liga a lo más un
-- contrato vivo (orden_compra_id repetido solo si el contrato está borrado).
--
-- Additiva y defensiva: columna nullable, sin reescritura ni lock pesado. La RLS
-- de dilesa.contratos_construccion se hereda. NOTA: la FK es cross-schema
-- (dilesa → erp); PostgREST NO la embebe en .schema('dilesa') (se leen con dos
-- queries / .in()), pero la integridad referencial sí aplica en la DB.

BEGIN;

ALTER TABLE dilesa.contratos_construccion
  ADD COLUMN IF NOT EXISTS orden_compra_id uuid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'contratos_construccion_orden_compra_id_fkey'
  ) THEN
    ALTER TABLE dilesa.contratos_construccion
      ADD CONSTRAINT contratos_construccion_orden_compra_id_fkey
      FOREIGN KEY (orden_compra_id) REFERENCES erp.ordenes_compra(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS contratos_construccion_orden_compra_id_uniq
  ON dilesa.contratos_construccion (orden_compra_id)
  WHERE orden_compra_id IS NOT NULL AND deleted_at IS NULL;

COMMENT ON COLUMN dilesa.contratos_construccion.orden_compra_id IS
  'OC hermana cuando la adjudicación generó OC (material) + Contrato (mano de obra) — opt-in "ambos". FK cross-schema a erp.ordenes_compra, ON DELETE SET NULL.';

-- Recarga el cache de PostgREST (columna nueva en tabla con embeds):
NOTIFY pgrst, 'reload schema';

COMMIT;
