-- ════════════════════════════════════════════════════════════════════════════
-- Sprint dilesa-3a — Cerrar FK diferida construccion_lote → contratistas
-- ════════════════════════════════════════════════════════════════════════════
--
-- En dilesa-2a, dilesa.construccion_lote.contratista_principal_id se creó sin
-- FK porque dilesa.contratistas aún no existía. Ahora que ambas tablas viven,
-- cerramos el ciclo.
--
-- Envuelto en to_regclass() per GOVERNANCE §1 — en DB fresca la guarda evita
-- errores si la cadena llegara a orden distinto. El check de pg_constraint
-- hace la migración idempotente.

DO $$
BEGIN
  IF to_regclass('dilesa.contratistas') IS NOT NULL
     AND to_regclass('dilesa.construccion_lote') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
       FROM pg_constraint
       WHERE conname = 'fk_construccion_lote_contratista_principal'
     )
  THEN
    ALTER TABLE dilesa.construccion_lote
      ADD CONSTRAINT fk_construccion_lote_contratista_principal
      FOREIGN KEY (contratista_principal_id)
      REFERENCES dilesa.contratistas(id)
      ON DELETE SET NULL;
  END IF;
END $$;

-- Índice ya creado en la migración original de construccion_lote
-- (dilesa_construccion_lote_contratista_idx); no se duplica.
