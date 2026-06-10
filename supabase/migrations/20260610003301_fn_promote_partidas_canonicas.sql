-- ╭─ 20260610003301_fn_promote_partidas_canonicas ─╮
-- fn_proyecto_promote_anteproyecto: el paso 6 (copia de partidas autorizadas
-- al desarrollo nuevo) leía/escribía `dilesa.proyecto_presupuesto_partidas`,
-- tabla DEPRECADA desde el rediseño del costeo (ADR-040). Lo redirige al
-- modelo canónico `erp.presupuesto_partidas` (0 filas vivas en la deprecada —
-- sin datos que migrar). Fase 2 de `dilesa-flujo-gasto` (convergencia
-- checklist ↔ ciclo P2P): junto con el fix del sync en
-- app/dilesa/proyectos/anteproyectos/actions.ts, las partidas que nacen del
-- checklist son visibles para v_partida_control / tab Gasto / hilo del gasto.
-- El resto de la función queda IDÉNTICO a la versión vigente.
--
-- Timestamp generado con `npm run db:new` (anti-colisión multi-sesión).

BEGIN;

CREATE OR REPLACE FUNCTION dilesa.fn_proyecto_promote_anteproyecto(p_anteproyecto_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'dilesa'
AS $function$
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
  --    Fase 2 dilesa-flujo-gasto: modelo CANÓNICO erp.presupuesto_partidas
  --    (ADR-040) en lugar de la tabla deprecada dilesa.*. Conserva
  --    clasificación (concepto_id/etapa) y autorización; el monto estimado
  --    de la cotización se vuelve presupuesto aprobado del desarrollo.
  INSERT INTO erp.presupuesto_partidas (
    empresa_id, proyecto_id, tarea_origen_id, concepto_texto, concepto_id,
    etapa, monto_estimado, presupuesto_aprobado, fuente,
    proveedor_persona_id, estado, autorizado_at, autorizado_por, notas
  )
  SELECT
    pp.empresa_id, v_nuevo_id, NULL, pp.concepto_texto, pp.concepto_id,
    pp.etapa, pp.monto_estimado, pp.monto_estimado, pp.fuente,
    pp.proveedor_persona_id, 'planeada', pp.autorizado_at, pp.autorizado_por,
    pp.notas
  FROM erp.presupuesto_partidas pp
  WHERE pp.proyecto_id = p_anteproyecto_id
    AND pp.deleted_at IS NULL
    AND pp.estado = 'autorizada';

  -- 7) Marcar anteproyecto como completado.
  UPDATE dilesa.proyectos
  SET estado = 'completado', updated_at = NOW()
  WHERE id = p_anteproyecto_id;

  RETURN v_nuevo_id;
END;
$function$;

NOTIFY pgrst, 'reload schema';

COMMIT;
