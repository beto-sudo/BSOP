-- Iniciativa `dilesa-proyectos-checklist-inline` Sprint 4B.
--
-- Agrega las columnas faltantes en `dilesa.proyectos` para soportar
-- la sección "Análisis Financiero" del detalle del anteproyecto.
-- Beto pidió paridad con la vista Coda donde cada concepto de costo
-- tiene 2 valores: Referencia (proyecto comparable histórico) y
-- Proyecto (estimación del anteproyecto actual).
--
-- Las columnas existentes (`costo_urbanizacion`, `costo_construccion`,
-- `costo_comercializacion`, `costo_mo`) representan el lado "Proyecto"
-- y se mantienen sin cambio. Solo agregamos las contrapartes
-- _referencia (para los conceptos que no la tenían) y las columnas
-- completamente nuevas (RUV, Seguro Calidad, Materiales, Valor
-- Comercial, Infraestructura Cabecera, Valor Predio).
--
-- Costo Materiales reemplaza conceptualmente lo que se capturaba en
-- `costo_construccion` cuando aplicaba; ambos coexisten porque
-- algunos proyectos solo manejan "construcción" como total y otros
-- desglosan materiales+MO. Documentado en el componente.
--
-- Todas son `numeric` nullable salvo `infraestructura_cabecera_necesaria`
-- que es boolean default false.

BEGIN;

ALTER TABLE dilesa.proyectos
  ADD COLUMN IF NOT EXISTS valor_comercial_referencia numeric,
  ADD COLUMN IF NOT EXISTS valor_comercial_proyecto numeric,
  ADD COLUMN IF NOT EXISTS costo_urbanizacion_referencia numeric,
  ADD COLUMN IF NOT EXISTS costo_materiales_referencia numeric,
  ADD COLUMN IF NOT EXISTS costo_materiales_proyecto numeric,
  ADD COLUMN IF NOT EXISTS costo_mo_referencia numeric,
  ADD COLUMN IF NOT EXISTS registro_ruv_referencia numeric,
  ADD COLUMN IF NOT EXISTS registro_ruv_proyecto numeric,
  ADD COLUMN IF NOT EXISTS seguro_calidad_referencia numeric,
  ADD COLUMN IF NOT EXISTS seguro_calidad_proyecto numeric,
  ADD COLUMN IF NOT EXISTS costo_comercializacion_referencia numeric,
  ADD COLUMN IF NOT EXISTS infraestructura_cabecera_necesaria boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS valor_predio numeric,
  ADD COLUMN IF NOT EXISTS prototipos_referencia text[] NOT NULL DEFAULT '{}'::text[];

COMMENT ON COLUMN dilesa.proyectos.valor_comercial_referencia IS
  'Valor comercial promedio de unidades del proyecto referencia (último fraccionamiento similar). Sprint 4B.';
COMMENT ON COLUMN dilesa.proyectos.valor_comercial_proyecto IS
  'Valor comercial estimado de unidades del proyecto actual. Sprint 4B.';
COMMENT ON COLUMN dilesa.proyectos.costo_urbanizacion_referencia IS
  'Costo total de urbanización del proyecto referencia. Sprint 4B (la versión _proyecto vive en costo_urbanizacion).';
COMMENT ON COLUMN dilesa.proyectos.costo_materiales_referencia IS
  'Costo de materiales del proyecto referencia. Sprint 4B.';
COMMENT ON COLUMN dilesa.proyectos.costo_materiales_proyecto IS
  'Costo estimado de materiales del proyecto actual. Sprint 4B.';
COMMENT ON COLUMN dilesa.proyectos.costo_mo_referencia IS
  'Costo de mano de obra del proyecto referencia. Sprint 4B (la versión _proyecto vive en costo_mo).';
COMMENT ON COLUMN dilesa.proyectos.registro_ruv_referencia IS
  'Costo de registro RUV del proyecto referencia. Sprint 4B.';
COMMENT ON COLUMN dilesa.proyectos.registro_ruv_proyecto IS
  'Costo estimado de registro RUV del proyecto actual. Sprint 4B.';
COMMENT ON COLUMN dilesa.proyectos.seguro_calidad_referencia IS
  'Costo de seguro de calidad del proyecto referencia. Sprint 4B.';
COMMENT ON COLUMN dilesa.proyectos.seguro_calidad_proyecto IS
  'Costo estimado de seguro de calidad del proyecto actual. Sprint 4B.';
COMMENT ON COLUMN dilesa.proyectos.costo_comercializacion_referencia IS
  'Costo de comercialización del proyecto referencia. Sprint 4B (la versión _proyecto vive en costo_comercializacion).';
COMMENT ON COLUMN dilesa.proyectos.infraestructura_cabecera_necesaria IS
  'Bandera: el proyecto requiere infraestructura de cabecera (agua/energía/drenaje extra). Sprint 4B.';
COMMENT ON COLUMN dilesa.proyectos.valor_predio IS
  'Valor actual estimado del predio (puede diferir de costo_terreno por plusvalía). Sprint 4B.';
COMMENT ON COLUMN dilesa.proyectos.prototipos_referencia IS
  'Array de nombres de prototipos del proyecto referencia (chip display). Sprint 4B v1: text[] simple; v2 podría FK-ear a dilesa.productos.';

NOTIFY pgrst, 'reload schema';

COMMIT;
