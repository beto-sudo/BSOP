-- RPC `dilesa.fn_proyecto_promote_anteproyecto` — convierte un
-- anteproyecto en un nuevo proyecto tipo desarrollo, preservando el
-- anteproyecto como histórico inmutable.
--
-- Sprint 4 de la iniciativa `dilesa-proyectos-anteproyectos`.
-- Cierra la conversión gated por la tarea canónica
-- "Aprobación de Comité de Inversión" (orden 16 de la plantilla seed).
--
-- Algoritmo (7 pasos transaccionales):
-- 1. Cargar el anteproyecto (RAISE si no existe / tipo distinto /
--    deleted).
-- 2. Validar idempotencia: si ya existe un desarrollo con
--    proyecto_predecesor_id = <anteproyecto>, RAISE con mensaje claro.
-- 3. Validar gate: tarea con `plantilla_tarea_id` cuya `nombre` sea
--    "Aprobación de Comité de Inversión" debe estar `estado='completada'`.
--    Si no existe la tarea o no está completada, RAISE.
-- 4. INSERT nuevo row en `dilesa.proyectos` con tipo='desarrollo',
--    `proyecto_predecesor_id` = anteproyecto, copiando campos físicos
--    y financieros; estado='aprobado'.
-- 5. Copiar tareas "rehogables" — aquellas con
--    `aplicacion_snapshot IN ('desarrollo', 'ambas')` y
--    `estado IN ('en_curso', 'completada')`. Las pendientes/bloqueadas
--    se quedan en el anteproyecto.
-- 6. Instanciar tareas exclusivas de desarrollo desde el catálogo
--    (aplicacion IN ('desarrollo', 'ambas')) que NO se llevaron del
--    anteproyecto. Fechas objetivo = desde la fecha de promoción
--    (calculadas en cliente vía Sprint 3, aquí solo NULL — el
--    Sprint 4 deja al cliente repoblar tareas con `populatePlantilla`
--    sobre el nuevo proyecto si quiere fechas frescas).
-- 7. Copiar partidas autorizadas de presupuesto al nuevo proyecto con
--    estado='planeada', monto_aprobado=monto_estimado, monto_ejercido=0.
-- 8. Marcar el anteproyecto: `estado='completado'` (queda como
--    histórico inmutable referenciado por proyecto_predecesor_id).
--
-- Retorna el `id` del nuevo proyecto creado.
--
-- RLS via SECURITY INVOKER (default) — el caller debe tener acceso a
-- la empresa del anteproyecto. Las políticas existentes de proyectos /
-- proyecto_tareas / proyecto_presupuesto_partidas se respetan.

BEGIN;

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
  v_gate_estado text;
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

  -- 3) Validar gate: tarea "Aprobación de Comité de Inversión" completada.
  SELECT t.estado INTO v_gate_estado
  FROM dilesa.proyecto_tareas t
  JOIN dilesa.plantilla_proyecto_tareas p ON p.id = t.plantilla_tarea_id
  WHERE t.proyecto_id = p_anteproyecto_id
    AND p.nombre = 'Aprobación de Comité de Inversión'
    AND t.deleted_at IS NULL
  LIMIT 1;
  IF v_gate_estado IS NULL THEN
    RAISE EXCEPTION 'El anteproyecto no tiene la tarea "Aprobación de Comité de Inversión". Pobla la plantilla canónica primero.'
      USING ERRCODE = 'P0002';
  END IF;
  IF v_gate_estado <> 'completada' THEN
    RAISE EXCEPTION 'La tarea "Aprobación de Comité de Inversión" debe estar completada antes de promover (estado actual: %)',
      v_gate_estado USING ERRCODE = '22023';
  END IF;

  -- 4) INSERT nuevo proyecto (desarrollo).
  INSERT INTO dilesa.proyectos (
    empresa_id, tipo, nombre, estado, proyecto_padre_id,
    proyecto_predecesor_id, plantilla_id, regla_prorrateo,
    presupuesto_estimado, fecha_inicio, fecha_fin_estimada, notas,
    documentos, area_m2, area_vendible_m2, areas_verdes_m2,
    lotes_proyectados, costo_terreno, costo_urbanizacion,
    costo_construccion, costo_comercializacion, clave_interna,
    precio_m2_excedente, tamano_lote_promedio, clasificacion_inmobiliaria
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
    v_anteproyecto.clasificacion_inmobiliaria
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

  -- 6) Sprint 4 v1 NO instancia tareas nuevas de desarrollo
  --    automáticamente — el operador puede llamar populatePlantilla
  --    sobre el nuevo proyecto (Sprint 3) si quiere las tareas del
  --    catálogo. Esto evita duplicación de lógica de cálculo de fechas
  --    en SQL.

  -- 7) Copia partidas autorizadas → planeadas en el nuevo proyecto.
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

  -- 8) Marcar anteproyecto como completado.
  UPDATE dilesa.proyectos
  SET estado = 'completado', updated_at = NOW()
  WHERE id = p_anteproyecto_id;

  RETURN v_nuevo_id;
END;
$$;

COMMENT ON FUNCTION dilesa.fn_proyecto_promote_anteproyecto(uuid) IS
  'Convierte un anteproyecto en un nuevo proyecto tipo desarrollo, preservando el anteproyecto como histórico (proyecto_predecesor_id). Gated por tarea "Aprobación de Comité de Inversión" completada. Sprint 4 de dilesa-proyectos-anteproyectos.';

GRANT EXECUTE ON FUNCTION dilesa.fn_proyecto_promote_anteproyecto(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;
