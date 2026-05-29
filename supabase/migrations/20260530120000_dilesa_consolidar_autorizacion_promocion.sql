-- Iniciativa `dilesa-proyectos-checklist-inline` Sprint 4A.
--
-- Beto pidió consolidar las 4 tareas redundantes del catálogo
-- en una sola autorización integrada con la promoción a desarrollo:
--
--   - "Cotización de Urbanización"           → reemplazada por captura
--   - "Cotización de Construcción de Vivienda" → en columnas de costos
--   - "Cotización de Comercialización"       → del análisis financiero
--   - "Aprobación de Comité de Inversión"    → reemplazada por el rol
--                                              del usuario que llama
--                                              fn_proyecto_promote_*
--
-- La RPC `fn_proyecto_promote_anteproyecto` ya no valida que exista
-- la tarea Comité completada. El control de quién puede promover se
-- hace ahora en el server action (rol admin/director) — patrón
-- consistente con `autorizarPaso` (Sprint 3.5) y `autorizarPartida`
-- (Sprint 2).
--
-- Backfill: las 20 instancias vivas en `proyecto_tareas` (4 tareas ×
-- 5 anteproyectos), sus 80 pasos en `proyecto_tarea_pasos`, sus
-- dependencias en ambas tablas de dependencias, y las 4 rows del
-- catálogo se eliminan (soft-delete donde aplica, hard-delete para
-- las dependencias N:M).
--
-- Verificado pre-migración:
--   - 0 adjuntos colgando de los pasos a borrar.
--   - 0 partidas vinculadas a las tareas (las cotizaciones del
--     Sprint 2 no se llegaron a usar; los montos viven en pasos).
--   - 0 instancias en `proyecto_tareas` con `resultado_documento_url`
--     poblado para estas 4 tareas (los 27 archivos del Sprint 1.5
--     son de tareas de trámites/factibilidades, no cotizaciones).

BEGIN;

-- ════════════════════════════════════════════════════════════════════════════
-- 1) Soft-delete las 20 instancias en `dilesa.proyecto_tareas`.
-- ════════════════════════════════════════════════════════════════════════════
-- Las 80 instancias de paso en `proyecto_tarea_pasos` se sueltan por
-- FK ON DELETE CASCADE en `tarea_id` (ver migración 20260529160000).
-- Pero la tarea tiene `deleted_at` (no hard delete), así que los pasos
-- también van por soft delete.

UPDATE dilesa.proyecto_tareas
SET deleted_at = NOW()
WHERE plantilla_tarea_id IN (
  SELECT id FROM dilesa.plantilla_proyecto_tareas
  WHERE nombre IN (
    'Cotización de Urbanización',
    'Cotización de Construcción de Vivienda',
    'Cotización de Comercialización',
    'Aprobación de Comité de Inversión'
  )
)
AND deleted_at IS NULL;

UPDATE dilesa.proyecto_tarea_pasos
SET deleted_at = NOW()
WHERE tarea_id IN (
  SELECT id FROM dilesa.proyecto_tareas
  WHERE plantilla_tarea_id IN (
    SELECT id FROM dilesa.plantilla_proyecto_tareas
    WHERE nombre IN (
      'Cotización de Urbanización',
      'Cotización de Construcción de Vivienda',
      'Cotización de Comercialización',
      'Aprobación de Comité de Inversión'
    )
  )
)
AND deleted_at IS NULL;

-- ════════════════════════════════════════════════════════════════════════════
-- 2) Hard-delete dependencias entre instancias.
-- ════════════════════════════════════════════════════════════════════════════
-- Estas tablas N:M no tienen `deleted_at`. Borramos los edges donde
-- cualquiera de los 2 endpoints pertenezca a una tarea eliminada.

DELETE FROM dilesa.proyecto_tareas_dependencias
WHERE tarea_id IN (
  SELECT id FROM dilesa.proyecto_tareas
  WHERE plantilla_tarea_id IN (
    SELECT id FROM dilesa.plantilla_proyecto_tareas
    WHERE nombre IN (
      'Cotización de Urbanización',
      'Cotización de Construcción de Vivienda',
      'Cotización de Comercialización',
      'Aprobación de Comité de Inversión'
    )
  )
)
OR depende_de_tarea_id IN (
  SELECT id FROM dilesa.proyecto_tareas
  WHERE plantilla_tarea_id IN (
    SELECT id FROM dilesa.plantilla_proyecto_tareas
    WHERE nombre IN (
      'Cotización de Urbanización',
      'Cotización de Construcción de Vivienda',
      'Cotización de Comercialización',
      'Aprobación de Comité de Inversión'
    )
  )
);

-- ════════════════════════════════════════════════════════════════════════════
-- 3) Hard-delete dependencias en el catálogo.
-- ════════════════════════════════════════════════════════════════════════════

DELETE FROM dilesa.plantilla_proyecto_tareas_dependencias
WHERE plantilla_tarea_id IN (
  SELECT id FROM dilesa.plantilla_proyecto_tareas
  WHERE nombre IN (
    'Cotización de Urbanización',
    'Cotización de Construcción de Vivienda',
    'Cotización de Comercialización',
    'Aprobación de Comité de Inversión'
  )
)
OR depende_de_plantilla_tarea_id IN (
  SELECT id FROM dilesa.plantilla_proyecto_tareas
  WHERE nombre IN (
    'Cotización de Urbanización',
    'Cotización de Construcción de Vivienda',
    'Cotización de Comercialización',
    'Aprobación de Comité de Inversión'
  )
);

-- ════════════════════════════════════════════════════════════════════════════
-- 4) Soft-delete las 4 rows del catálogo.
-- ════════════════════════════════════════════════════════════════════════════
-- También marcamos `activa = false` para que `populatePlantilla` no las
-- re-instancie aunque alguien las re-active manualmente sin pensar.

UPDATE dilesa.plantilla_proyecto_tareas
SET deleted_at = NOW(),
    activa = false,
    updated_at = NOW()
WHERE nombre IN (
  'Cotización de Urbanización',
  'Cotización de Construcción de Vivienda',
  'Cotización de Comercialización',
  'Aprobación de Comité de Inversión'
)
AND deleted_at IS NULL;

-- ════════════════════════════════════════════════════════════════════════════
-- 5) Reemplazar RPC `fn_proyecto_promote_anteproyecto`: sin gate de
--    tarea Comité; queda el control de rol en el server action.
-- ════════════════════════════════════════════════════════════════════════════
-- Conserva todos los pasos previos excepto el #3 (validar gate). Se
-- agrega comentario explicando que el control de quién puede llamar
-- esta RPC pasó al server action (rol admin/director).

CREATE OR REPLACE FUNCTION dilesa.fn_proyecto_promote_anteproyecto(
  p_anteproyecto_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, dilesa
AS $$
DECLARE
  v_anteproyecto dilesa.proyectos%ROWTYPE;
  v_nuevo_id uuid;
  v_existente uuid;
BEGIN
  -- 1) Cargar anteproyecto.
  SELECT * INTO v_anteproyecto
  FROM dilesa.proyectos
  WHERE id = p_anteproyecto_id AND deleted_at IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Anteproyecto % no encontrado', p_anteproyecto_id
      USING ERRCODE = 'P0002';
  END IF;
  IF v_anteproyecto.tipo <> 'anteproyecto' THEN
    RAISE EXCEPTION 'El proyecto % no es un anteproyecto (tipo=%)',
      p_anteproyecto_id, v_anteproyecto.tipo USING ERRCODE = '22023';
  END IF;

  -- 2) Idempotencia: no debe existir desarrollo con
  --    proyecto_predecesor_id apuntando a este anteproyecto.
  SELECT id INTO v_existente
  FROM dilesa.proyectos
  WHERE proyecto_predecesor_id = p_anteproyecto_id
    AND tipo = 'desarrollo'
    AND deleted_at IS NULL
  LIMIT 1;
  IF FOUND THEN
    RAISE EXCEPTION 'Anteproyecto % ya fue convertido al desarrollo %',
      p_anteproyecto_id, v_existente USING ERRCODE = '23505';
  END IF;

  -- 3) Sprint 4A: el gate de "Aprobación de Comité de Inversión" se
  --    eliminó. El control de quién puede llamar esta RPC vive ahora en
  --    el server action `promoteAnteproyecto`: solo rol admin/director.

  -- 4) INSERT nuevo proyecto (desarrollo). Incluye los campos
  --    capturados después de la migración original (clasificacion,
  --    area_comercial_m2, area_residencial_m2, area_vialidades_m2,
  --    costo_mo) para que la copia sea completa.
  INSERT INTO dilesa.proyectos (
    empresa_id, tipo, nombre, estado, proyecto_padre_id,
    proyecto_predecesor_id, plantilla_id, regla_prorrateo,
    presupuesto_estimado, fecha_inicio, fecha_fin_estimada, notas,
    documentos, area_m2, area_vendible_m2, areas_verdes_m2,
    lotes_proyectados, costo_terreno, costo_urbanizacion,
    costo_construccion, costo_comercializacion, clave_interna,
    precio_m2_excedente, tamano_lote_promedio, clasificacion_inmobiliaria,
    area_comercial_m2, area_residencial_m2, area_vialidades_m2, costo_mo
  )
  VALUES (
    v_anteproyecto.empresa_id, 'desarrollo', v_anteproyecto.nombre, 'aprobado',
    v_anteproyecto.proyecto_padre_id, p_anteproyecto_id,
    v_anteproyecto.plantilla_id, v_anteproyecto.regla_prorrateo,
    v_anteproyecto.presupuesto_estimado, CURRENT_DATE, v_anteproyecto.fecha_fin_estimada,
    v_anteproyecto.notas, '[]'::jsonb,
    v_anteproyecto.area_m2, v_anteproyecto.area_vendible_m2, v_anteproyecto.areas_verdes_m2,
    v_anteproyecto.lotes_proyectados, v_anteproyecto.costo_terreno, v_anteproyecto.costo_urbanizacion,
    v_anteproyecto.costo_construccion, v_anteproyecto.costo_comercializacion, NULL,
    v_anteproyecto.precio_m2_excedente, v_anteproyecto.tamano_lote_promedio,
    v_anteproyecto.clasificacion_inmobiliaria,
    v_anteproyecto.area_comercial_m2, v_anteproyecto.area_residencial_m2,
    v_anteproyecto.area_vialidades_m2, v_anteproyecto.costo_mo
  )
  RETURNING id INTO v_nuevo_id;

  -- 5) Rehoga tareas útiles (aplicacion_snapshot desarrollo|ambas y
  --    estado en_curso|completada). Crea filas nuevas en el desarrollo,
  --    NO mueve las del anteproyecto (preserva histórico).
  INSERT INTO dilesa.proyecto_tareas (
    empresa_id, proyecto_id, plantilla_tarea_id, titulo, descripcion,
    estado, prioridad, responsable_id, fecha_limite, fecha_completada,
    orden, tipo_snapshot, subtipo_snapshot, entidad_responsable_snapshot,
    aplicacion_snapshot, obligatoriedad_snapshot, se_entrega_a_snapshot,
    requiere_archivo_snapshot, formato_archivo_snapshot,
    duracion_dias_habiles_snapshot, fecha_objetivo_inicio,
    fecha_objetivo_fin, resultado_monto, resultado_documento_url
  )
  SELECT
    v_anteproyecto.empresa_id, v_nuevo_id, t.plantilla_tarea_id, t.titulo, t.descripcion,
    t.estado, t.prioridad, t.responsable_id, t.fecha_limite, t.fecha_completada,
    t.orden, t.tipo_snapshot, t.subtipo_snapshot, t.entidad_responsable_snapshot,
    t.aplicacion_snapshot, t.obligatoriedad_snapshot, t.se_entrega_a_snapshot,
    t.requiere_archivo_snapshot, t.formato_archivo_snapshot,
    t.duracion_dias_habiles_snapshot, t.fecha_objetivo_inicio,
    t.fecha_objetivo_fin, t.resultado_monto, t.resultado_documento_url
  FROM dilesa.proyecto_tareas t
  WHERE t.proyecto_id = p_anteproyecto_id
    AND t.deleted_at IS NULL
    AND t.aplicacion_snapshot IN ('desarrollo', 'ambas')
    AND t.estado IN ('en_curso', 'completada');

  -- 6) Copia partidas autorizadas → planeadas en el nuevo proyecto.
  INSERT INTO dilesa.proyecto_presupuesto_partidas (
    empresa_id, proyecto_id, tarea_origen_id, partida, descripcion,
    unidad, cantidad, monto_estimado, monto_aprobado, monto_ejercido,
    fuente, proveedor_persona_id, estado, autorizado_at, autorizado_por,
    notas
  )
  SELECT
    pp.empresa_id, v_nuevo_id, NULL, pp.partida, pp.descripcion,
    pp.unidad, pp.cantidad, pp.monto_estimado, pp.monto_estimado, 0,
    pp.fuente, pp.proveedor_persona_id, 'planeada', pp.autorizado_at, pp.autorizado_por,
    pp.notas
  FROM dilesa.proyecto_presupuesto_partidas pp
  WHERE pp.proyecto_id = p_anteproyecto_id
    AND pp.deleted_at IS NULL
    AND pp.estado = 'autorizada';

  -- 7) Marcar anteproyecto como completado.
  UPDATE dilesa.proyectos
  SET estado = 'completado', updated_at = NOW()
  WHERE id = p_anteproyecto_id;

  RETURN v_nuevo_id;
END;
$$;

COMMENT ON FUNCTION dilesa.fn_proyecto_promote_anteproyecto(uuid) IS
  'Promueve un anteproyecto a desarrollo. Sprint 4A (2026-05-30): se eliminó el gate de tarea "Aprobación de Comité de Inversión"; el control de quién puede llamar la RPC vive en el server action (rol admin/director).';

NOTIFY pgrst, 'reload schema';

COMMIT;
