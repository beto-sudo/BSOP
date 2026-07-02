-- ╭──────────────────────────────────────────────────────────────────╮
-- │  20260702220043_dilesa_espacio_publicitario_y_municipios          │
-- │                                                                    │
-- │  Iniciativa `dilesa-portafolio-predios` — pedidos de Beto          │
-- │  2026-07-02 (tarde):                                               │
-- │  1. Tipo `espacio_publicitario` con SUBTIPO absorbe                │
-- │     espectacular/unipolar/padel: la tabla satélite                 │
-- │     activo_espectacular se RENOMBRA a activo_espacio_publicitario  │
-- │     (+ columna subtipo), las 26 estructuras migran de tipo, y los  │
-- │     10 padel quedan subtipo='padel'. Las CARAS (tipo cara, lo que  │
-- │     renta arrendamiento) no se tocan. activo_unipolar queda vacía  │
-- │     y deprecada (sin DROP — limpieza futura).                      │
-- │  2. Municipios: espacios publicitarios y sus caras → Piedras       │
-- │     Negras; estado_geo='Coahuila' donde municipio ∈ {P. Negras,    │
-- │     Nava}. Los prospectos en evaluación quedan vacíos a propósito  │
-- │     (se capturan al evaluar — decisión Beto).                      │
-- ╰──────────────────────────────────────────────────────────────────╯

BEGIN;

-- ─────────────────────────────────────────────────────────────────────
-- 1. Satélite: rename + subtipo
-- ─────────────────────────────────────────────────────────────────────

ALTER TABLE dilesa.activo_espectacular RENAME TO activo_espacio_publicitario;

ALTER TABLE dilesa.activo_espacio_publicitario
  ADD COLUMN IF NOT EXISTS subtipo text NOT NULL DEFAULT 'espectacular'
    CHECK (subtipo IN ('espectacular', 'unipolar', 'padel', 'valla', 'otro'));

COMMENT ON TABLE dilesa.activo_espacio_publicitario IS
  'Satélite 1:1 de dilesa.activos para tipo=espacio_publicitario: estructura publicitaria (espectacular, unipolar, lona en cancha de padel, valla…) — el subtipo distingue la forma física. Sus caras rentables son activos hijos tipo=cara (ADR-052). Antes se llamaba activo_espectacular. Iniciativa dilesa-portafolio-predios.';

-- ─────────────────────────────────────────────────────────────────────
-- 2. Tipo nuevo en el master + migración de las estructuras
-- ─────────────────────────────────────────────────────────────────────

ALTER TABLE dilesa.activos DROP CONSTRAINT IF EXISTS activos_tipo_check;
ALTER TABLE dilesa.activos ADD CONSTRAINT activos_tipo_check CHECK (tipo IN (
  'terreno', 'espacio_publicitario', 'casa', 'local', 'plaza',
  'edificio', 'nave', 'departamento', 'lote', 'infraestructura', 'cara',
  -- Legacy en retiro: sin filas tras esta migración; se quitan del CHECK
  -- cuando se dropee activo_unipolar.
  'espectacular', 'unipolar'
));

UPDATE dilesa.activo_espacio_publicitario s
SET subtipo = 'padel'
FROM dilesa.activos a
WHERE a.id = s.activo_id AND a.deleted_at IS NULL
  AND (a.nombre ILIKE '%padel%' OR a.nombre ILIKE '%pádel%');

UPDATE dilesa.activos
SET tipo = 'espacio_publicitario', updated_at = now()
WHERE tipo IN ('espectacular', 'unipolar') AND deleted_at IS NULL;

COMMENT ON TABLE dilesa.activo_unipolar IS
  'DEPRECADA (2026-07-02): los unipolares son subtipo de activo_espacio_publicitario. Vacía; pendiente de drop en una limpieza futura.';

-- ─────────────────────────────────────────────────────────────────────
-- 3. RPC de alta acepta el tipo nuevo (redefiniciones desde la versión
--    viva 20260702145345; fn_actualizar_activo NO cambia — no valida
--    tipo). El branch del satélite usa la tabla renombrada.
-- ─────────────────────────────────────────────────────────────────────

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
                    'nave', 'plaza', 'espacio_publicitario', 'infraestructura') THEN
    RAISE EXCEPTION 'Tipo de activo no válido: %', p_tipo;
  END IF;
  IF COALESCE(p_master->>'nombre', '') = '' THEN
    RAISE EXCEPTION 'El nombre del activo es obligatorio';
  END IF;

  INSERT INTO dilesa.activos (
    empresa_id, tipo, nombre, estado, destino_id, clave_interna, etiqueta, zona, municipio,
    estado_geo, direccion_referencia, latitud, longitud, area_m2, situacion_legal,
    numero_escritura, clave_catastral, valor_estimado, notas
  ) VALUES (
    p_empresa_id, p_tipo,
    p_master->>'nombre',
    COALESCE(NULLIF(p_master->>'estado', ''), 'prospecto'),
    NULLIF(p_master->>'destino_id', '')::uuid,
    NULLIF(p_master->>'clave_interna', ''),
    NULLIF(p_master->>'etiqueta', ''),
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

  ELSIF p_tipo = 'espacio_publicitario' THEN
    DELETE FROM dilesa.activo_espacio_publicitario WHERE activo_id = p_activo_id;
    INSERT INTO dilesa.activo_espacio_publicitario (
      activo_id, empresa_id, subtipo, caras, ancho_m, alto_m, iluminado, orientacion, vialidad,
      trafico_estimado_diario, anunciante_actual, renta_mensual, contrato_vigente_hasta, notas
    )
    SELECT p_activo_id, p_empresa_id, COALESCE(NULLIF(r.subtipo, ''), 'espectacular'),
      r.caras, r.ancho_m, r.alto_m, r.iluminado, r.orientacion,
      r.vialidad, r.trafico_estimado_diario, r.anunciante_actual, r.renta_mensual,
      r.contrato_vigente_hasta, r.notas
    FROM jsonb_populate_record(NULL::dilesa.activo_espacio_publicitario, p_sat) r;

  ELSIF p_tipo = 'lote' THEN
    DELETE FROM dilesa.activo_lote WHERE activo_id = p_activo_id;
    INSERT INTO dilesa.activo_lote (activo_id, empresa_id, manzana, numero_lote, condicion, frente_m, fondo_m, calle, numero_oficial, es_esquina, tiene_frente_verde, notas)
    SELECT p_activo_id, p_empresa_id, r.manzana, r.numero_lote, r.condicion, r.frente_m, r.fondo_m, r.calle, r.numero_oficial, r.es_esquina, r.tiene_frente_verde, r.notas
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

GRANT EXECUTE ON FUNCTION dilesa.fn_alta_activo(uuid, text, jsonb, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION dilesa._activo_upsert_satelite(uuid, uuid, text, jsonb) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────
-- 4. Data-fix de municipios/estado (Beto 2026-07-02):
--    espacios publicitarios y sus caras → Piedras Negras; Coahuila donde
--    hay municipio conocido. Prospectos quedan como están.
-- ─────────────────────────────────────────────────────────────────────

UPDATE dilesa.activos
SET municipio = 'Piedras Negras', updated_at = now()
WHERE deleted_at IS NULL AND municipio IS NULL
  AND tipo IN ('espacio_publicitario', 'cara');

UPDATE dilesa.activos
SET estado_geo = 'Coahuila', updated_at = now()
WHERE deleted_at IS NULL AND estado_geo IS NULL
  AND municipio IN ('Piedras Negras', 'Nava');

NOTIFY pgrst, 'reload schema';

COMMIT;
