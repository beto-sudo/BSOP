-- ╭─ 20260617031232_dilesa_activo_espectacular_scoring ─╮
-- Iniciativa dilesa-portafolio-expediente · espectaculares.
--
-- Modela el grano "1 activo = 1 estructura física" (decisión Beto 2026-06-17):
-- cada panel tiene 2 caras (Flujo/Contraflujo o Norte/Sur) con precio y scoring
-- de medios distintos, guardadas en `caras_detalle` jsonb. Las columnas escalares
-- existentes (caras int, iluminado, renta_mensual, vialidad) quedan como agregado
-- para el render genérico. + `dueno_terreno` (el suelo donde se monta el panel,
-- rentado a un tercero — dato del doc Coda).
--
-- Aditiva (ADD COLUMN). No toca datos existentes.

BEGIN;

ALTER TABLE dilesa.activo_espectacular
  ADD COLUMN IF NOT EXISTS caras_detalle jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS dueno_terreno text;

COMMENT ON COLUMN dilesa.activo_espectacular.caras_detalle IS
  'Detalle por cara: [{cara, alias, iluminado, renta_mensual, scoring:{trafico,visibilidad,angulos,iluminacion,puntos,demanda}}]. El panel es 1 activo; las caras viven aquí.';
COMMENT ON COLUMN dilesa.activo_espectacular.dueno_terreno IS
  'Dueño del terreno donde se monta el panel (DILESA le renta el suelo). Distinto del anunciante (renta de entrada).';

NOTIFY pgrst, 'reload schema';

COMMIT;
