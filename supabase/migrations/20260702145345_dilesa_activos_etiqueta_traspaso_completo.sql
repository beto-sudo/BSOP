-- ╭──────────────────────────────────────────────────────────────────╮
-- │  20260702145345_dilesa_activos_etiqueta_traspaso_completo         │
-- │                                                                    │
-- │  Iniciativa `dilesa-portafolio-predios` — pedidos de Beto          │
-- │  2026-07-02:                                                       │
-- │  1. `activos.etiqueta`: identificador corto visible en la lista    │
-- │     (antes se abusaba de `municipio` para eso). Data-fix: las 14   │
-- │     casas con descripción en municipio la mueven a etiqueta y      │
-- │     municipio queda el real (L. Encinos=Nava; LDV/LDS=P. Negras,   │
-- │     confirmado por Beto).                                          │
-- │  2. Traspaso completo unidad→activo: calle, número oficial,        │
-- │     esquina y frente verde en los satélites casa/lote; la RPC de   │
-- │     liberar los copia (v3, redefinida desde la versión viva        │
-- │     20260616234205) junto con zona (fraccionamiento) y dirección;  │
-- │     backfill de las 29 unidades ya traspasadas.                    │
-- │  3. Las RPCs de captura (viva: 20260702033009) aprenden            │
-- │     `etiqueta`.                                                    │
-- ╰──────────────────────────────────────────────────────────────────╯

BEGIN;

-- ─────────────────────────────────────────────────────────────────────
-- 1. Columnas nuevas
-- ─────────────────────────────────────────────────────────────────────

ALTER TABLE dilesa.activos ADD COLUMN IF NOT EXISTS etiqueta text;

COMMENT ON COLUMN dilesa.activos.etiqueta IS
  'Identificador corto operativo visible en el listado (p.ej. "Demo Prototipo A", "Renta COINS"). Nace porque municipio se usaba para esto. Iniciativa dilesa-portafolio-predios.';

ALTER TABLE dilesa.activo_casa
  ADD COLUMN IF NOT EXISTS calle text,
  ADD COLUMN IF NOT EXISTS numero_oficial text,
  ADD COLUMN IF NOT EXISTS es_esquina boolean,
  ADD COLUMN IF NOT EXISTS tiene_frente_verde boolean;

ALTER TABLE dilesa.activo_lote
  ADD COLUMN IF NOT EXISTS calle text,
  ADD COLUMN IF NOT EXISTS numero_oficial text,
  ADD COLUMN IF NOT EXISTS es_esquina boolean,
  ADD COLUMN IF NOT EXISTS tiene_frente_verde boolean;

-- ─────────────────────────────────────────────────────────────────────
-- 2. fn_liberar_unidad_portafolio v3 — copia TODO lo heredable de la
--    unidad (redefinición desde la versión viva 20260616234205; misma
--    firma). Delta v2→v3: zona = nombre del proyecto, dirección
--    calle+número en el master, y los 4 campos físicos nuevos en los
--    satélites casa/lote.
-- ─────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION dilesa.fn_liberar_unidad_portafolio(
  p_unidad_id  uuid,
  p_tipo       text,
  p_destino_id uuid,
  p_valor      numeric DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = dilesa, public
AS $$
DECLARE
  u            RECORD;
  d            RECORD;
  v_activo_id  uuid;
  v_nombre     text;
  v_estado     text;
  v_modalidad  text;
  v_venta_viva text;
  v_nota_extra text := '';
  v_proyecto   text;
  v_direccion  text;
BEGIN
  SELECT * INTO u FROM dilesa.unidades WHERE id = p_unidad_id AND deleted_at IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Unidad no encontrada';
  END IF;
  IF u.activo_id IS NOT NULL THEN
    RAISE EXCEPTION 'La unidad ya está en el portafolio';
  END IF;
  IF p_tipo NOT IN ('casa', 'lote', 'local', 'terreno', 'departamento', 'edificio', 'nave') THEN
    RAISE EXCEPTION 'Tipo de activo no soportado: %', p_tipo;
  END IF;

  -- Destino del catálogo (debe existir, estar activo y ser de la misma empresa).
  SELECT * INTO d FROM dilesa.portafolio_destinos
   WHERE id = p_destino_id AND empresa_id = u.empresa_id AND activo AND deleted_at IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Destino de portafolio no válido o inactivo';
  END IF;

  -- Guard: no liberar una unidad con venta viva, salvo admin (queda anotado).
  SELECT v.estado INTO v_venta_viva
  FROM dilesa.ventas v
  WHERE v.unidad_id = p_unidad_id AND v.deleted_at IS NULL
    AND v.estado IN ('activa', 'terminada')
  LIMIT 1;
  IF v_venta_viva IS NOT NULL THEN
    IF NOT core.fn_is_admin() THEN
      RAISE EXCEPTION 'La unidad tiene una venta % — desasígnala antes de liberarla al portafolio', v_venta_viva;
    END IF;
    v_nota_extra := ' (liberada por admin pese a venta ' || v_venta_viva || ')';
  END IF;

  -- `cuenta_venta` ⇒ activo en cartera (adquirido); resto ⇒ en operación.
  v_estado := CASE WHEN d.cuenta_venta THEN 'adquirido' ELSE 'operando' END;

  -- modalidad legacy derivada del destino (respeta el CHECK de 5 valores).
  v_modalidad := CASE d.slug
                   WHEN 'arrendamiento' THEN 'renta'
                   WHEN 'venta'         THEN 'venta'
                   WHEN 'renta_venta'   THEN 'renta_venta'
                   WHEN 'sin_definir'   THEN 'sin_definir'
                   ELSE 'uso_propio'   -- demo / oficina / bodega / uso_propio
                 END;

  v_nombre := initcap(p_tipo) || ' ' || COALESCE(NULLIF(u.calle, ''), 'sin calle')
              || ' (' || u.identificador || ')';

  -- v3: fraccionamiento (zona) y dirección calle + número oficial.
  SELECT p.nombre INTO v_proyecto FROM dilesa.proyectos p WHERE p.id = u.proyecto_id;
  v_direccion := NULLIF(trim(COALESCE(u.calle, '') || ' ' || COALESCE(u.numero_oficial, '')), '');

  INSERT INTO dilesa.activos
    (empresa_id, tipo, nombre, estado, modalidad, destino_id, clave_interna, zona,
     direccion_referencia, area_m2, valor_estimado, situacion_legal, notas)
  VALUES
    (u.empresa_id, p_tipo, v_nombre, v_estado, v_modalidad, d.id, u.identificador, v_proyecto,
     v_direccion, u.area_m2, COALESCE(p_valor, u.precio), 'Escriturado a DILESA',
     'Liberado al portafolio desde la unidad ' || u.identificador
       || ' con destino ' || d.label || '.' || v_nota_extra)
  RETURNING id INTO v_activo_id;

  -- Satélite por tipo, con TODOS los campos físicos heredables de la unidad.
  IF p_tipo = 'casa' THEN
    INSERT INTO dilesa.activo_casa
      (activo_id, empresa_id, m2_terreno, m2_construccion, calle, numero_oficial,
       es_esquina, tiene_frente_verde)
    VALUES
      (v_activo_id, u.empresa_id, u.area_m2, u.m2_construccion, u.calle, u.numero_oficial,
       u.es_esquina, u.tiene_frente_verde);
  ELSIF p_tipo = 'lote' THEN
    INSERT INTO dilesa.activo_lote
      (activo_id, empresa_id, manzana, numero_lote, calle, numero_oficial,
       es_esquina, tiene_frente_verde)
    VALUES
      (v_activo_id, u.empresa_id, u.manzana, u.numero_lote, u.calle, u.numero_oficial,
       u.es_esquina, u.tiene_frente_verde);
  ELSIF p_tipo = 'local' THEN
    INSERT INTO dilesa.activo_local (activo_id, empresa_id, m2_rentable)
    VALUES (v_activo_id, u.empresa_id, u.area_m2);
  ELSIF p_tipo = 'terreno' THEN
    INSERT INTO dilesa.activo_terreno (activo_id, empresa_id)
    VALUES (v_activo_id, u.empresa_id);
  ELSIF p_tipo = 'departamento' THEN
    INSERT INTO dilesa.activo_departamento (activo_id, empresa_id)
    VALUES (v_activo_id, u.empresa_id);
  END IF;
  -- edificio / nave: el master basta; satélite opcional capturable después.

  -- Liga la unidad al activo y, si el destino es demo, márcala como muestra
  -- (paridad de reporte; el marcador operativo de "fuera de ventas" es activo_id).
  UPDATE dilesa.unidades
  SET activo_id = v_activo_id,
      es_muestra = (es_muestra OR d.slug = 'demo'),
      updated_at = now()
  WHERE id = p_unidad_id;

  RETURN v_activo_id;
END;
$$;

GRANT EXECUTE ON FUNCTION dilesa.fn_liberar_unidad_portafolio(uuid, text, uuid, numeric) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────
-- 3. RPCs de captura aprenden `etiqueta` (redefinición desde la versión
--    viva 20260702033009; sin cambio de firma).
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
                    'nave', 'plaza', 'espectacular', 'unipolar', 'infraestructura') THEN
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
    etiqueta = NULLIF(p_master->>'etiqueta', ''),
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

GRANT EXECUTE ON FUNCTION dilesa.fn_alta_activo(uuid, text, jsonb, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION dilesa.fn_actualizar_activo(uuid, jsonb, jsonb) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────
-- 4. Backfill de las unidades YA traspasadas (idempotente: solo llena
--    lo vacío, nunca pisa capturas manuales).
-- ─────────────────────────────────────────────────────────────────────

-- 4a. Master: zona = fraccionamiento, dirección calle + número oficial.
UPDATE dilesa.activos a
SET zona = COALESCE(a.zona, p.nombre),
    direccion_referencia = COALESCE(
      a.direccion_referencia,
      NULLIF(trim(COALESCE(u.calle, '') || ' ' || COALESCE(u.numero_oficial, '')), '')
    ),
    updated_at = now()
FROM dilesa.unidades u
JOIN dilesa.proyectos p ON p.id = u.proyecto_id
WHERE u.activo_id = a.id AND u.deleted_at IS NULL AND a.deleted_at IS NULL
  AND (a.zona IS NULL OR a.direccion_referencia IS NULL);

-- 4b. Satélite casa.
UPDATE dilesa.activo_casa s
SET calle = COALESCE(s.calle, u.calle),
    numero_oficial = COALESCE(s.numero_oficial, u.numero_oficial),
    es_esquina = COALESCE(s.es_esquina, u.es_esquina),
    tiene_frente_verde = COALESCE(s.tiene_frente_verde, u.tiene_frente_verde),
    m2_terreno = COALESCE(s.m2_terreno, u.area_m2),
    m2_construccion = COALESCE(s.m2_construccion, u.m2_construccion),
    updated_at = now()
FROM dilesa.unidades u
WHERE u.activo_id = s.activo_id AND u.deleted_at IS NULL;

-- 4c. Satélite lote.
UPDATE dilesa.activo_lote s
SET calle = COALESCE(s.calle, u.calle),
    numero_oficial = COALESCE(s.numero_oficial, u.numero_oficial),
    es_esquina = COALESCE(s.es_esquina, u.es_esquina),
    tiene_frente_verde = COALESCE(s.tiene_frente_verde, u.tiene_frente_verde),
    manzana = COALESCE(s.manzana, u.manzana),
    numero_lote = COALESCE(s.numero_lote, u.numero_lote),
    updated_at = now()
FROM dilesa.unidades u
WHERE u.activo_id = s.activo_id AND u.deleted_at IS NULL;

-- ─────────────────────────────────────────────────────────────────────
-- 5. Data-fix: municipio usado como descripción (14 casas). La
--    descripción pasa a `etiqueta`; municipio queda el real por
--    fraccionamiento (confirmado por Beto 2026-07-02: Lomas de los
--    Encinos = Nava; Lomas del Valle y Lomas del Sol = Piedras Negras).
--    Idempotente: tras correr, municipio ∈ {Nava, Piedras Negras} y la
--    fila deja de matchear.
-- ─────────────────────────────────────────────────────────────────────

UPDATE dilesa.activos a
SET etiqueta = COALESCE(a.etiqueta, a.municipio),
    municipio = CASE WHEN p.nombre = 'Lomas de los Encinos' THEN 'Nava'
                     ELSE 'Piedras Negras' END,
    updated_at = now()
FROM dilesa.unidades u
JOIN dilesa.proyectos p ON p.id = u.proyecto_id
WHERE u.activo_id = a.id AND u.deleted_at IS NULL AND a.deleted_at IS NULL
  AND a.municipio IS NOT NULL
  AND a.municipio NOT IN ('Piedras Negras', 'Nava');

-- 5b. Municipio de las demás traspasadas de los 3 fraccionamientos
--     confirmados (las que quedaron NULL). Otros fraccionamientos se
--     quedan NULL hasta confirmar su municipio.
UPDATE dilesa.activos a
SET municipio = CASE WHEN p.nombre = 'Lomas de los Encinos' THEN 'Nava'
                     ELSE 'Piedras Negras' END,
    estado_geo = COALESCE(a.estado_geo, 'Coahuila'),
    updated_at = now()
FROM dilesa.unidades u
JOIN dilesa.proyectos p ON p.id = u.proyecto_id
WHERE u.activo_id = a.id AND u.deleted_at IS NULL AND a.deleted_at IS NULL
  AND a.municipio IS NULL
  AND p.nombre IN ('Lomas de los Encinos', 'Lomas del Valle', 'Lomas del Sol');

NOTIFY pgrst, 'reload schema';

COMMIT;
