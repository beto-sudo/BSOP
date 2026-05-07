-- Prevent duplicate OCs from a single requisición while the OC is still in
-- the open part of the workflow (borrador → enviada). Once an OC is `cerrada`,
-- additional OCs against the same requisición are allowed (legitimate
-- reorder pattern observed in production: 7191a213 had 2 closed OCs from the
-- same requisición with separate physical receptions).
--
-- The previous lack of any constraint allowed the same requisición to spawn
-- multiple live OCs (typically via double-click on "Generar OC", or by
-- regenerating after a stale page refresh). See requisición
-- e967a56c-b259-47e3-9655-324c08240434 (3 OCs) and 2 other live cases that
-- were soft-deleted as part of this fix.

CREATE UNIQUE INDEX IF NOT EXISTS erp_oc_unique_requisicion_open
  ON erp.ordenes_compra (requisicion_id)
  WHERE requisicion_id IS NOT NULL
    AND deleted_at IS NULL
    AND estado IN ('borrador', 'enviada');

NOTIFY pgrst, 'reload schema';
