-- Iniciativa: dilesa-portafolio-activos (Sprint — liberación unidad → activo).
--
-- Beto (2026-06-05): al cerrar los fraccionamientos terminados, la vivienda y
-- los terrenos comerciales que NO se vendieron deben "convertirse a activo del
-- portafolio de DILESA — una vivienda puede ser rentada o vendida igual que los
-- terrenos comerciales". En Lomas del Valle hay 2 casas terminadas: 1 rentada
-- (Gardenia) y 1 usada como oficina (Magnolias); más 6 lotes comerciales
-- (5 en LDV sobre Av. Marina + 1 en LV2 sobre Av. de las Industrias).
--
-- El campo `dilesa.unidades.activo_id` ya estaba cableado en el schema ("se
-- llena cuando la unidad se libera al portafolio") pero el workflow nunca se
-- construyó. Esta migración:
--   1. Agrega `modalidad` a `dilesa.activos` — el `estado` (prospecto/adquirido/
--      operando/...) es ciclo de vida y no expresa el DESTINO del activo
--      (renta / venta / uso propio). Ortogonal al estado.
--   2. Libera 8 unidades al portafolio: crea el `dilesa.activos` (master) +
--      satélite por tipo (activo_casa / activo_lote) + liga `unidades.activo_id`.
--      Idempotente: solo procesa unidades con `activo_id IS NULL`.
--   3. Lomas del Valle → 'completado'. Al salir las 2 casas del inventario de
--      vivienda (activo_id deja de ser NULL), v_proyecto_avances recalcula la
--      vivienda activa a 226/226 = 100% y el estado_sugerido pasa a completado.
--
-- El server action + UI reutilizable ("Liberar al portafolio") viajan en el
-- mismo PR (app/dilesa/proyectos/actions.ts + componentes). Esta migración hace
-- el backfill puntual de las 8 unidades con los valores confirmados por Beto.
-- Decisiones en docs/planning/dilesa-portafolio-activos.md §Liberación.

BEGIN;

-- (1) modalidad: destino del activo en el portafolio (ortogonal a `estado`).
ALTER TABLE dilesa.activos ADD COLUMN IF NOT EXISTS modalidad text;
ALTER TABLE dilesa.activos DROP CONSTRAINT IF EXISTS activos_modalidad_check;
ALTER TABLE dilesa.activos
  ADD CONSTRAINT activos_modalidad_check
  CHECK (modalidad IS NULL OR modalidad = ANY (ARRAY['renta'::text, 'venta'::text, 'uso_propio'::text, 'renta_venta'::text, 'sin_definir'::text]));

COMMENT ON COLUMN dilesa.activos.modalidad IS 'Destino del activo en el portafolio: renta / venta / uso_propio / renta_venta / sin_definir. Ortogonal a `estado` (ciclo de vida).';

-- (2) Liberar las 8 unidades al portafolio. Idempotente por activo_id IS NULL.
DO $$
DECLARE
  r RECORD;
  v_activo_id uuid;
  v_tipo text;
  v_modalidad text;
  v_estado text;
  v_nombre text;
BEGIN
  FOR r IN
    SELECT u.id, u.empresa_id, u.identificador, u.tipo_lote, u.area_m2,
           u.m2_construccion, u.precio, u.manzana, u.numero_lote, u.calle,
           p.clave_interna, p.nombre AS proyecto_nombre
    FROM dilesa.unidades u
    JOIN dilesa.proyectos p ON p.id = u.proyecto_id
    WHERE u.id IN (
      -- 2 casas LDV
      '2a049d3f-927f-4ef1-9607-81928d59ea88',  -- M14-L1-LDV (Gardenia)  → renta
      '8714eeb4-d63a-4c1d-911d-ac7a47f48890',  -- M10-L2-LDV (Magnolias) → oficina (uso_propio)
      -- 6 lotes comerciales (LDV + LV2) → venta
      '6732dbb3-30bc-472f-b718-fe31468bd0b2',  -- M2-L18-LDV
      'eb39bd76-3da1-41a9-b4aa-074a85ce7516',  -- M2-L19-LDV
      'c3886d95-76d4-495a-ae65-28dfb9db3b07',  -- M2-L20-LDV
      '76626191-192f-4612-9688-a07051e02bd8',  -- M2-L21-LDV
      '70479cca-1095-41b0-b50f-4ef42fff6cb5',  -- M2-L22-LDV
      '4fca562b-c48e-4fa4-9c24-d0ffa3d21787'   -- M5-L13-LV2
    )
    AND u.activo_id IS NULL
    AND u.deleted_at IS NULL
  LOOP
    IF r.tipo_lote = 'Comercial' THEN
      v_tipo := 'lote'; v_modalidad := 'venta'; v_estado := 'adquirido';
      v_nombre := 'Lote comercial ' || COALESCE(r.calle, '') || ' (' || r.identificador || ')';
    ELSIF r.identificador = 'M14-L1-LDV' THEN
      v_tipo := 'casa'; v_modalidad := 'renta'; v_estado := 'operando';
      v_nombre := 'Casa ' || COALESCE(r.calle, '') || ' (' || r.identificador || ')';
    ELSE  -- M10-L2-LDV → oficina
      v_tipo := 'casa'; v_modalidad := 'uso_propio'; v_estado := 'operando';
      v_nombre := 'Casa ' || COALESCE(r.calle, '') || ' (' || r.identificador || ')';
    END IF;

    INSERT INTO dilesa.activos
      (empresa_id, tipo, nombre, estado, modalidad, clave_interna, municipio,
       estado_geo, area_m2, valor_estimado, situacion_legal, notas)
    VALUES
      (r.empresa_id, v_tipo, v_nombre, v_estado, v_modalidad, r.identificador,
       'Piedras Negras', 'Coahuila', r.area_m2, r.precio, 'Escriturado a DILESA',
       'Liberado al portafolio desde la unidad ' || r.identificador ||
       ' del fraccionamiento ' || r.proyecto_nombre || ' (terminado). Migración 20260605181000.')
    RETURNING id INTO v_activo_id;

    IF v_tipo = 'casa' THEN
      INSERT INTO dilesa.activo_casa (activo_id, empresa_id, m2_terreno, m2_construccion, estado_conservacion)
      VALUES (v_activo_id, r.empresa_id, r.area_m2, r.m2_construccion, 'nuevo');
    ELSE
      -- `condicion` (esquina/intermedio/cabecera) se deja NULL: es la posición
      -- del lote, no su urbanización; se captura después si hace falta.
      INSERT INTO dilesa.activo_lote (activo_id, empresa_id, manzana, numero_lote)
      VALUES (v_activo_id, r.empresa_id, r.manzana, r.numero_lote);
    END IF;

    UPDATE dilesa.unidades SET activo_id = v_activo_id, updated_at = now() WHERE id = r.id;
  END LOOP;
END $$;

-- (3) Lomas del Valle → completado (su vivienda activa quedó 226/226 = 100%).
UPDATE dilesa.proyectos
SET estado = 'completado', updated_at = now()
WHERE empresa_id = 'f5942ed4-7a6b-4c39-af18-67b9fbf7f479'::uuid  -- DILESA
  AND clave_interna = 'LDV'
  AND deleted_at IS NULL
  AND estado = 'ejecutando';

NOTIFY pgrst, 'reload schema';

COMMIT;
