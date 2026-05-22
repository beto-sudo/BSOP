-- ════════════════════════════════════════════════════════════════════════════
-- Iniciativa dilesa-portafolio-activos · Sprint 3 — fix: clave_interna en proyectos
-- ════════════════════════════════════════════════════════════════════════════
--
-- El mapeo (docs/planning/dilesa-portafolio-mapeo-coda.md § 3) preveía mapear
-- la "Abreviación" de Coda (LDLD, ALDE, PDV…) a `proyectos.clave_interna`,
-- pero la columna no se incluyó en la migración de ajustes 20260522123710.
-- Esta migración la agrega — código corto del proyecto.
--
-- A diferencia de `dilesa.activos.clave_interna` (UNIQUE NULLS NOT DISTINCT),
-- aquí la unicidad usa el default (NULLs distintos): la `clave_interna` es
-- opcional y los anteproyectos nunca la tienen — varias filas con valor NULL
-- son legítimas. El constraint solo impide dos proyectos con el MISMO código
-- no nulo dentro de una empresa.

BEGIN;

ALTER TABLE dilesa.proyectos ADD COLUMN clave_interna text;

ALTER TABLE dilesa.proyectos
  ADD CONSTRAINT proyectos_clave_interna_empresa_uk
  UNIQUE (empresa_id, clave_interna);

NOTIFY pgrst, 'reload schema';

COMMIT;
