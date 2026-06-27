-- ╭─ 20260627005802_reconciliacion_repo_reproducibilidad ─╮
-- Sprint 0.5 de `derivados-sin-drift` (cat A — solo arregla la reproducibilidad
-- del repo; funcionalmente no-op sobre prod). Hace que una DB reconstruida desde
-- las migraciones (shadow) coincida con prod en dos puntos donde el repo divergía:
--
--  (1) FK core.usuarios.junta_activa_id → erp.juntas: prod la tiene, pero la
--      migración original (20260421001805) la creó con
--      `ADD COLUMN IF NOT EXISTS ... REFERENCES`, que es no-op si la columna ya
--      existe → en una DB fresca la columna preexiste y la FK se pierde. La
--      re-creamos idempotente (no-op en prod, la agrega en shadow).
--  (2) erp.v_oc_cerradas_pendientes_pago: vista throwaway (handoff a CxP) que NO
--      se usa en código y prod ya no tiene; la dropeamos del repo para que el
--      shadow tampoco la cree.

BEGIN;

-- (1) FK reproducible junta_activa_id → erp.juntas (guard por relación, no por nombre).
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'core.usuarios'::regclass
      AND contype = 'f'
      AND confrelid = 'erp.juntas'::regclass
  ) THEN
    ALTER TABLE core.usuarios
      ADD CONSTRAINT usuarios_junta_activa_id_fkey
      FOREIGN KEY (junta_activa_id) REFERENCES erp.juntas(id) ON DELETE SET NULL;
  END IF;
END $$;

-- (2) Vista throwaway muerta — fuera del repo (no-op en prod, ya no existe).
DROP VIEW IF EXISTS erp.v_oc_cerradas_pendientes_pago;

NOTIFY pgrst, 'reload schema';

COMMIT;
