-- Sprint 3.5 de `dilesa-proyectos-checklist-inline`: autorización de
-- cotización (y cualquier paso financiero en el futuro).
--
-- Agrega `autorizado_at` + `autorizado_por` a `dilesa.proyecto_tarea_pasos`
-- mismo patrón que `dilesa.proyecto_presupuesto_partidas` (Sprint 2).
--
-- Para v1 solo aplica a `cotizacion`. La server action que mueve un
-- paso de pendiente → hecho NO setea autorización; un endpoint
-- separado `autorizarPaso(tareaId, paso)` lo hace, gateado por rol
-- director / admin a nivel app.

BEGIN;

ALTER TABLE dilesa.proyecto_tarea_pasos
  ADD COLUMN IF NOT EXISTS autorizado_at timestamptz,
  ADD COLUMN IF NOT EXISTS autorizado_por uuid REFERENCES core.usuarios(id);

COMMENT ON COLUMN dilesa.proyecto_tarea_pasos.autorizado_at IS
  'Timestamp de autorización por dirección. Aplica primariamente a paso=cotizacion. NULL = no autorizado todavía. Sprint 3.5.';
COMMENT ON COLUMN dilesa.proyecto_tarea_pasos.autorizado_por IS
  'Usuario que autorizó el paso. FK a core.usuarios. Sprint 3.5.';

NOTIFY pgrst, 'reload schema';

COMMIT;
