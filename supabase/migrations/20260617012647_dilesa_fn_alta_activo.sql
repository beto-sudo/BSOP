-- ╭─ 20260617012647_dilesa_fn_alta_activo ─╮
-- Iniciativa dilesa-portafolio-expediente · Sprint 1 — captura/alta de activos.
--
-- El módulo Portafolio era 100% read-only. Estas RPCs desbloquean dar de alta y
-- editar un activo desde la UI, de forma ATÓMICA (master dilesa.activos + su
-- satélite dilesa.activo_<tipo> en la misma transacción — un alta a medias
-- dejaría satélites huérfanos).
--
--   - fn_alta_activo: inserta el master + el satélite del tipo. Devuelve el id.
--   - fn_actualizar_activo: actualiza master + satélite.
--
-- El satélite se llena con jsonb_populate_record (mapea los campos del form por
-- nombre, sin escribir 28 parámetros). Soporte rico para terreno y espectacular
-- (los 2 tipos que el negocio carga ahora); el resto crea el satélite mínimo,
-- editable cuando se soporte su form. Los timestamps NO se listan en el INSERT,
-- así sus DEFAULT now() actúan.
--
-- SECURITY INVOKER (patrón dilesa): RLS aplica al caller. La UI + el server
-- action restringen a admin global / Dirección DILESA.

BEGIN;

CREATE OR REPLACE FUNCTION dilesa.fn_alta_activo(
  p_empresa_id uuid,
  p_tipo       text,
  p_master     jsonb,
  p_satelite   jsonb DEFAULT '{}'::jsonb
) RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = dilesa, public
AS $$
DECLARE
  v_id uuid;
BEGIN
  IF p_tipo NOT IN ('casa', 'lote', 'local', 'terreno', 'departamento', 'edificio',
                    'nave', 'plaza', 'espectacular', 'unipolar', 'infraestructura') THEN
    RAISE EXCEPTION 'Tipo de activo no válido: %', p_tipo;
  END IF;
  IF COALESCE(p_master->>'nombre', '') = '' THEN
    RAISE EXCEPTION 'El nombre del activo es obligatorio';
  END IF;

  INSERT INTO dilesa.activos (
    empresa_id, tipo, nombre, estado, destino_id, clave_interna, municipio, estado_geo,
    direccion_referencia, latitud, longitud, area_m2, situacion_legal,
    numero_escritura, clave_catastral, valor_estimado, notas
  ) VALUES (
    p_empresa_id, p_tipo,
    p_master->>'nombre',
    COALESCE(NULLIF(p_master->>'estado', ''), 'prospecto'),
    NULLIF(p_master->>'destino_id', '')::uuid,
    NULLIF(p_master->>'clave_interna', ''),
    NULLIF(p_master->>'municipio', ''),
    NULLIF(p_master->>'estado_geo', ''),
    NULLIF(p_master->>'direccion_referencia', ''),
    NULLIF(p_master->>'latitud', '')::numeric,
    NULLIF(p_master->>'longitud', '')::numeric,
    NULLIF(p_master->>'area_m2', '')::numeric,
    NULLIF(p_master->>'situacion_legal', ''),
    NULLIF(p_master->>'numero_escritura', ''),
    NULLIF(p_master->>'clave_catastral', ''),
    NULLIF(p_master->>'valor_estimado', '')::numeric,
    NULLIF(p_master->>'notas', '')
  ) RETURNING id INTO v_id;

  PERFORM dilesa._activo_upsert_satelite(v_id, p_empresa_id, p_tipo, p_satelite);
  RETURN v_id;
END;
$$;

-- Inserta/recrea el satélite del tipo desde un jsonb. Idempotente por tipo:
-- borra el satélite previo y lo reinserta (para reusar desde alta y edición).
CREATE OR REPLACE FUNCTION dilesa._activo_upsert_satelite(
  p_activo_id uuid,
  p_empresa_id uuid,
  p_tipo text,
  p_sat jsonb
) RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = dilesa, public
AS $$
BEGIN
  IF p_tipo = 'terreno' THEN
    DELETE FROM dilesa.activo_terreno WHERE activo_id = p_activo_id;
    INSERT INTO dilesa.activo_terreno (
      activo_id, empresa_id, uso_suelo, zonificacion, factibilidad_agua,
      factibilidad_drenaje, factibilidad_electricidad, factibilidad_vialidad,
      areas_afectacion_m2, tipo_terreno, objetivo, zona_sector, propietario_nombre,
      propietario_telefono, corredor_nombre, corredor_telefono, precio_solicitado_m2,
      precio_ofertado_m2, valor_objetivo_compra, origen, estatus_propiedad, etapa,
      decision_actual, prioridad, responsable, fecha_ultima_revision, siguiente_accion, notas
    )
    SELECT p_activo_id, p_empresa_id, r.uso_suelo, r.zonificacion, r.factibilidad_agua,
      r.factibilidad_drenaje, r.factibilidad_electricidad, r.factibilidad_vialidad,
      r.areas_afectacion_m2, r.tipo_terreno, r.objetivo, r.zona_sector, r.propietario_nombre,
      r.propietario_telefono, r.corredor_nombre, r.corredor_telefono, r.precio_solicitado_m2,
      r.precio_ofertado_m2, r.valor_objetivo_compra, r.origen, r.estatus_propiedad, r.etapa,
      r.decision_actual, r.prioridad, r.responsable, r.fecha_ultima_revision, r.siguiente_accion, r.notas
    FROM jsonb_populate_record(NULL::dilesa.activo_terreno, p_sat) r;

  ELSIF p_tipo = 'espectacular' THEN
    DELETE FROM dilesa.activo_espectacular WHERE activo_id = p_activo_id;
    INSERT INTO dilesa.activo_espectacular (
      activo_id, empresa_id, caras, ancho_m, alto_m, iluminado, orientacion, vialidad,
      trafico_estimado_diario, anunciante_actual, renta_mensual, contrato_vigente_hasta, notas
    )
    SELECT p_activo_id, p_empresa_id, r.caras, r.ancho_m, r.alto_m, r.iluminado, r.orientacion,
      r.vialidad, r.trafico_estimado_diario, r.anunciante_actual, r.renta_mensual,
      r.contrato_vigente_hasta, r.notas
    FROM jsonb_populate_record(NULL::dilesa.activo_espectacular, p_sat) r;

  ELSIF p_tipo = 'lote' THEN
    DELETE FROM dilesa.activo_lote WHERE activo_id = p_activo_id;
    INSERT INTO dilesa.activo_lote (activo_id, empresa_id, manzana, numero_lote, condicion, frente_m, fondo_m, notas)
    SELECT p_activo_id, p_empresa_id, r.manzana, r.numero_lote, r.condicion, r.frente_m, r.fondo_m, r.notas
    FROM jsonb_populate_record(NULL::dilesa.activo_lote, p_sat) r;

  ELSIF p_tipo = 'local' THEN
    DELETE FROM dilesa.activo_local WHERE activo_id = p_activo_id;
    INSERT INTO dilesa.activo_local (activo_id, empresa_id, m2_rentable, frente_m, planta, giro_permitido, tiene_bodega, banos, estado_obra, notas)
    SELECT p_activo_id, p_empresa_id, r.m2_rentable, r.frente_m, r.planta, r.giro_permitido, r.tiene_bodega, r.banos, r.estado_obra, r.notas
    FROM jsonb_populate_record(NULL::dilesa.activo_local, p_sat) r;

  ELSE
    -- Tipos sin form rico todavía: satélite mínimo (solo PK + empresa), si la tabla existe.
    EXECUTE format(
      'INSERT INTO dilesa.activo_%I (activo_id, empresa_id) VALUES ($1, $2) ON CONFLICT (activo_id) DO NOTHING',
      p_tipo
    ) USING p_activo_id, p_empresa_id;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION dilesa.fn_actualizar_activo(
  p_activo_id uuid,
  p_master    jsonb,
  p_satelite  jsonb DEFAULT '{}'::jsonb
) RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = dilesa, public
AS $$
DECLARE
  a RECORD;
BEGIN
  SELECT id, empresa_id, tipo INTO a FROM dilesa.activos WHERE id = p_activo_id AND deleted_at IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Activo no encontrado';
  END IF;
  IF COALESCE(p_master->>'nombre', '') = '' THEN
    RAISE EXCEPTION 'El nombre del activo es obligatorio';
  END IF;

  UPDATE dilesa.activos SET
    nombre = p_master->>'nombre',
    estado = COALESCE(NULLIF(p_master->>'estado', ''), estado),
    destino_id = NULLIF(p_master->>'destino_id', '')::uuid,
    clave_interna = NULLIF(p_master->>'clave_interna', ''),
    municipio = NULLIF(p_master->>'municipio', ''),
    estado_geo = NULLIF(p_master->>'estado_geo', ''),
    direccion_referencia = NULLIF(p_master->>'direccion_referencia', ''),
    latitud = NULLIF(p_master->>'latitud', '')::numeric,
    longitud = NULLIF(p_master->>'longitud', '')::numeric,
    area_m2 = NULLIF(p_master->>'area_m2', '')::numeric,
    situacion_legal = NULLIF(p_master->>'situacion_legal', ''),
    numero_escritura = NULLIF(p_master->>'numero_escritura', ''),
    clave_catastral = NULLIF(p_master->>'clave_catastral', ''),
    valor_estimado = NULLIF(p_master->>'valor_estimado', '')::numeric,
    notas = NULLIF(p_master->>'notas', ''),
    updated_at = now()
  WHERE id = p_activo_id;

  -- El satélite se recrea desde el jsonb completo del form (re-upsert por tipo).
  IF p_satelite IS NOT NULL AND p_satelite <> '{}'::jsonb THEN
    PERFORM dilesa._activo_upsert_satelite(p_activo_id, a.empresa_id, a.tipo, p_satelite);
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION dilesa.fn_alta_activo(uuid, text, jsonb, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION dilesa._activo_upsert_satelite(uuid, uuid, text, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION dilesa.fn_actualizar_activo(uuid, jsonb, jsonb) TO authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;
