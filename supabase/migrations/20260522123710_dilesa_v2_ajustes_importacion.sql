-- ════════════════════════════════════════════════════════════════════════════
-- Iniciativa dilesa-portafolio-activos · Sprint 3 — Ajustes de schema v2
-- para la importación desde Coda
-- ════════════════════════════════════════════════════════════════════════════
--
-- El mapeo Coda → v2 (docs/planning/dilesa-portafolio-mapeo-coda.md) reveló
-- que el schema v2, diseñado sobrio, no captura todo lo que las tablas de
-- Coda registran. Tres ajustes, validados con Beto:
--
--   1. activo_terreno — campos del ciclo de adquisición/gestión del terreno
--      (decisión A: el detalle de adquisición vive en el satélite).
--   2. activos.estado — agregar 'descartado' (terreno evaluado y descartado
--      es un estado terminal legítimo, no contemplado en el enum inicial).
--   3. proyectos — columnas de "alcance" (área, lotes, fecha de licencia) y
--      desglose de costos. Los conteos vivos (lotes vendidos, casas
--      terminadas) NO se agregan: se derivan de dilesa.unidades.

BEGIN;

-- ── 1) dilesa.activo_terreno — ciclo de adquisición y gestión ────────────────
ALTER TABLE dilesa.activo_terreno
  ADD COLUMN tipo_terreno          text,
  ADD COLUMN objetivo              text,
  ADD COLUMN zona_sector           text,
  ADD COLUMN propietario_nombre    text,
  ADD COLUMN propietario_telefono  text,
  ADD COLUMN corredor_nombre       text,
  ADD COLUMN corredor_telefono     text,
  ADD COLUMN precio_solicitado_m2  numeric(14, 2),
  ADD COLUMN precio_ofertado_m2    numeric(14, 2),
  ADD COLUMN valor_objetivo_compra numeric(16, 2),
  ADD COLUMN origen                text,
  ADD COLUMN estatus_propiedad     text,
  ADD COLUMN etapa                 text,
  ADD COLUMN decision_actual       text,
  ADD COLUMN prioridad             text,
  ADD COLUMN responsable           text,
  ADD COLUMN fecha_ultima_revision date,
  ADD COLUMN siguiente_accion      text;

ALTER TABLE dilesa.activo_terreno
  ADD CONSTRAINT activo_terreno_prioridad_check
  CHECK (prioridad IS NULL OR prioridad IN ('alta', 'media', 'baja'));

COMMENT ON COLUMN dilesa.activo_terreno.etapa IS
  'Etapa fina del terreno desde Coda (detectado, en_revision, en_negociacion, etc.). El estado grueso vive en dilesa.activos.estado.';

-- ── 2) dilesa.activos.estado — agregar 'descartado' ──────────────────────────
ALTER TABLE dilesa.activos DROP CONSTRAINT activos_estado_check;
ALTER TABLE dilesa.activos ADD CONSTRAINT activos_estado_check CHECK (estado IN (
  'prospecto', 'adquirido', 'operando', 'en_intervencion', 'desincorporado', 'descartado'
));

-- ── 3) dilesa.proyectos — alcance + desglose de costos ───────────────────────
-- area/lotes/fecha_licencia = alcance declarado del proyecto. El desglose de
-- costos complementa presupuesto_estimado (que se mantiene como total). Los
-- presupuestos vienen incompletos de Coda — los huecos quedan NULL.
ALTER TABLE dilesa.proyectos
  ADD COLUMN area_m2                numeric(14, 2),
  ADD COLUMN area_vendible_m2       numeric(14, 2),
  ADD COLUMN areas_verdes_m2        numeric(14, 2),
  ADD COLUMN lotes_proyectados      integer,
  ADD COLUMN fecha_licencia         date,
  ADD COLUMN costo_terreno          numeric(16, 2),
  ADD COLUMN costo_urbanizacion     numeric(16, 2),
  ADD COLUMN costo_construccion     numeric(16, 2),
  ADD COLUMN costo_comercializacion numeric(16, 2);

NOTIFY pgrst, 'reload schema';

COMMIT;
