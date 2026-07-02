-- ╭─ 20260702033009_dilesa_fn_activo_zona ─╮
-- Iniciativa `dilesa-portafolio-predios` · S2 — las RPCs de alta/edición de
-- activos aprenden la columna nueva `dilesa.activos.zona` (agrupador por
-- fraccionamiento, S1). Redefinición desde la versión viva
-- (20260617012647, única definición en el historial) + zona en el INSERT y
-- el UPDATE del master. Sin cambios de firma ni de permisos.

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
    empresa_id, tipo, nombre, estado, destino_id, clave_interna, zona, municipio, estado_geo,
    direccion_referencia, latitud, longitud, area_m2, situacion_legal,
    numero_escritura, clave_catastral, valor_estimado, notas
  ) VALUES (
    p_empresa_id, p_tipo,
    p_master->>'nombre',
    COALESCE(NULLIF(p_master->>'estado', ''), 'prospecto'),
    NULLIF(p_master->>'destino_id', '')::uuid,
    NULLIF(p_master->>'clave_interna', ''),
    NULLIF(p_master->>'zona', ''),
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
    zona = NULLIF(p_master->>'zona', ''),
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

NOTIFY pgrst, 'reload schema';

COMMIT;
