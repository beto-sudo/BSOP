-- Iniciativa `dilesa-proyectos-checklist-inline` Sprint 4B (refinamiento).
--
-- Beto pidió 2 ajustes al análisis financiero tras revisar el preview:
--
-- 1) Clasificación inmobiliaria debe ser multiselect — un proyecto
--    puede combinar tipos (ej. Lomas del Bosque = Interés Social +
--    Residencial Medio). Cambiamos modelo: la columna existente
--    `clasificacion_inmobiliaria` text se conserva por back-compat con
--    funciones SQL (fn_calcular_precio_venta, fn_proyecto_promote_*),
--    se sincroniza con el primer elemento del array.
--
-- 2) Prototipo de referencia debe ser un selector único contra
--    `dilesa.productos`. Agregamos FK `prototipo_referencia_id`.
--    Cuando hay valor, el UI autopopula `valor_comercial_referencia`
--    del producto seleccionado (server action en `actions.ts`).
--    Si NULL, fallback a captura manual chips
--    (`prototipos_referencia text[]` que ya existía sigue como
--    backup textual / deprecated).

BEGIN;

ALTER TABLE dilesa.proyectos
  ADD COLUMN IF NOT EXISTS clasificaciones_inmobiliarias text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS prototipo_referencia_id uuid REFERENCES dilesa.productos(id);

COMMENT ON COLUMN dilesa.proyectos.clasificaciones_inmobiliarias IS
  'Multiselect de clasificaciones (Interés Social, Residencial Medio, etc.). Sprint 4B refinamiento. Reemplaza `clasificacion_inmobiliaria` text; esa se conserva sincronizada con [0] para back-compat con fn_calcular_precio_venta + fn_proyecto_promote_anteproyecto.';
COMMENT ON COLUMN dilesa.proyectos.prototipo_referencia_id IS
  'FK al prototipo en dilesa.productos que sirve de referencia para autopopular valor_comercial_referencia. NULL = captura manual de chips (prototipos_referencia text[]).';

-- Backfill: migrar los valores existentes (10 rows con clasificación
-- viva: 7 interes_social + 2 residencial_medio + 1 residencial_alto).
UPDATE dilesa.proyectos
SET clasificaciones_inmobiliarias = ARRAY[clasificacion_inmobiliaria]
WHERE clasificacion_inmobiliaria IS NOT NULL
  AND cardinality(clasificaciones_inmobiliarias) = 0;

-- Trigger: sincronizar `clasificacion_inmobiliaria` singular con el
-- primer elemento del array para que las funciones SQL legacy
-- (fn_calcular_precio_venta) sigan leyendo un valor coherente.
CREATE OR REPLACE FUNCTION dilesa.fn_sync_clasificacion_singular()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, dilesa
AS $$
BEGIN
  IF NEW.clasificaciones_inmobiliarias IS NULL
     OR cardinality(NEW.clasificaciones_inmobiliarias) = 0 THEN
    NEW.clasificacion_inmobiliaria := NULL;
  ELSE
    NEW.clasificacion_inmobiliaria := NEW.clasificaciones_inmobiliarias[1];
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_clasificacion_singular ON dilesa.proyectos;
CREATE TRIGGER trg_sync_clasificacion_singular
BEFORE INSERT OR UPDATE OF clasificaciones_inmobiliarias ON dilesa.proyectos
FOR EACH ROW
EXECUTE FUNCTION dilesa.fn_sync_clasificacion_singular();

NOTIFY pgrst, 'reload schema';

COMMIT;
