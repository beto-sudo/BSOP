-- ╭──────────────────────────────────────────────────────────────────╮
-- │  20260702160035_dilesa_activo_movimientos                          │
-- │                                                                    │
-- │  Iniciativa `dilesa-portafolio-predios` — S5 (ADR-055).            │
-- │  Subdivisiones / fusiones / relotificaciones de predios con        │
-- │  trazabilidad completa:                                            │
-- │    · activo_movimientos       — evento inmutable (append-only)     │
-- │    · activo_movimiento_partes — origen(es) ↔ resultante(s)         │
-- │    · fn_ejecutar_movimiento_activos — RPC atómica                  │
-- │  Los orígenes se DESINCORPORAN (nunca se borran); sus cuentas      │
-- │  prediales pasan a baja_* conservando historial. Los resultantes   │
-- │  nacen con activo_padre_id = primer origen (linaje).               │
-- ╰──────────────────────────────────────────────────────────────────╯

BEGIN;

-- ─────────────────────────────────────────────────────────────────────
-- 1. Tablas
-- ─────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS dilesa.activo_movimientos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL REFERENCES core.empresas (id),
  tipo text NOT NULL CHECK (tipo IN ('subdivision', 'fusion', 'relotificacion')),
  fecha date NOT NULL,
  documento_id uuid REFERENCES erp.documentos (id),
  superficie_origen_m2 numeric,
  superficie_resultante_m2 numeric,
  notas text,
  creado_por uuid REFERENCES core.usuarios (id),
  created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE dilesa.activo_movimientos IS
  'Evento de transformación catastral de predios (subdivisión/fusión/relotificación). Append-only — audit trail; ADR-055. La diferencia de superficies se anota, no bloquea (ceder área al municipio es normal).';

CREATE TABLE IF NOT EXISTS dilesa.activo_movimiento_partes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL REFERENCES core.empresas (id),
  movimiento_id uuid NOT NULL REFERENCES dilesa.activo_movimientos (id) ON DELETE CASCADE,
  activo_id uuid NOT NULL REFERENCES dilesa.activos (id),
  rol text NOT NULL CHECK (rol IN ('origen', 'resultante')),
  CONSTRAINT activo_movimiento_partes_uk UNIQUE (movimiento_id, activo_id, rol)
);

COMMENT ON TABLE dilesa.activo_movimiento_partes IS
  'Activos que participan en un movimiento catastral, con su rol. Subdivisión = 1 origen → N resultantes; fusión = N → 1; relotificación = N → M. ADR-055.';

CREATE INDEX IF NOT EXISTS activo_movimientos_empresa_idx
  ON dilesa.activo_movimientos (empresa_id);
CREATE INDEX IF NOT EXISTS activo_mov_partes_movimiento_idx
  ON dilesa.activo_movimiento_partes (movimiento_id);
CREATE INDEX IF NOT EXISTS activo_mov_partes_activo_idx
  ON dilesa.activo_movimiento_partes (activo_id);

-- ─────────────────────────────────────────────────────────────────────
-- 2. RLS (set-membership; grants por DEFAULT PRIVILEGES del schema)
-- ─────────────────────────────────────────────────────────────────────

ALTER TABLE dilesa.activo_movimientos ENABLE ROW LEVEL SECURITY;
ALTER TABLE dilesa.activo_movimiento_partes ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  pred text := '(empresa_id IN (SELECT core.fn_current_empresa_ids()) OR core.fn_is_admin())';
  r record;
BEGIN
  FOR r IN SELECT * FROM (VALUES
    ('activo_movimientos'),
    ('activo_movimiento_partes')
  ) AS x(tbl) LOOP
    EXECUTE format('DROP POLICY IF EXISTS %1$s_select ON dilesa.%1$s', r.tbl);
    EXECUTE format('DROP POLICY IF EXISTS %1$s_insert ON dilesa.%1$s', r.tbl);
    EXECUTE format('CREATE POLICY %1$s_select ON dilesa.%1$s FOR SELECT TO authenticated USING %2$s', r.tbl, pred);
    EXECUTE format('CREATE POLICY %1$s_insert ON dilesa.%1$s FOR INSERT TO authenticated WITH CHECK %2$s', r.tbl, pred);
    -- Sin policies de UPDATE/DELETE: el movimiento es append-only (ADR-055).
  END LOOP;
END $$;

-- ─────────────────────────────────────────────────────────────────────
-- 3. RPC atómica
--    p_resultantes: jsonb array de objetos
--      { nombre*, tipo*, area_m2, clave_catastral, clave_interna,
--        zona, municipio, destino_id, notas }
--    Lo no provisto hereda del primer origen (zona/municipio/estado_geo/
--    situacion_legal).
-- ─────────────────────────────────────────────────────────────────────

CREATE FUNCTION dilesa.fn_ejecutar_movimiento_activos(
  p_tipo         text,
  p_origen_ids   uuid[],
  p_resultantes  jsonb,
  p_fecha        date,
  p_documento_id uuid DEFAULT NULL,
  p_notas        text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = dilesa, public
AS $$
DECLARE
  v_empresa_id   uuid;
  v_primer       RECORD;
  v_mov_id       uuid;
  v_res          jsonb;
  v_res_ids      uuid[] := '{}';
  v_activo_id    uuid;
  v_sup_origen   numeric := 0;
  v_sup_result   numeric := 0;
  v_n_origen     int;
  v_n_result     int;
  v_baja         text;
  o              uuid;
BEGIN
  IF p_tipo NOT IN ('subdivision', 'fusion', 'relotificacion') THEN
    RAISE EXCEPTION 'Tipo de movimiento no válido: %', p_tipo;
  END IF;

  v_n_origen := COALESCE(array_length(p_origen_ids, 1), 0);
  v_n_result := COALESCE(jsonb_array_length(p_resultantes), 0);
  IF v_n_origen = 0 OR v_n_result = 0 THEN
    RAISE EXCEPTION 'El movimiento requiere al menos un origen y un resultante';
  END IF;
  IF p_tipo = 'subdivision' AND (v_n_origen <> 1 OR v_n_result < 2) THEN
    RAISE EXCEPTION 'Una subdivisión parte 1 predio en 2 o más';
  END IF;
  IF p_tipo = 'fusion' AND (v_n_origen < 2 OR v_n_result <> 1) THEN
    RAISE EXCEPTION 'Una fusión une 2 o más predios en 1';
  END IF;

  -- Orígenes: vivos, no desincorporados, de una sola empresa.
  SELECT count(DISTINCT empresa_id) INTO v_n_origen
  FROM dilesa.activos WHERE id = ANY (p_origen_ids) AND deleted_at IS NULL;
  IF v_n_origen <> 1 THEN
    RAISE EXCEPTION 'Los predios origen no existen o son de empresas distintas';
  END IF;
  IF EXISTS (
    SELECT 1 FROM dilesa.activos
    WHERE id = ANY (p_origen_ids) AND deleted_at IS NULL
      AND estado IN ('desincorporado', 'descartado')
  ) THEN
    RAISE EXCEPTION 'Algún predio origen ya está desincorporado/descartado';
  END IF;

  SELECT * INTO v_primer FROM dilesa.activos
  WHERE id = p_origen_ids[1] AND deleted_at IS NULL;
  v_empresa_id := v_primer.empresa_id;

  SELECT COALESCE(sum(area_m2), 0) INTO v_sup_origen
  FROM dilesa.activos WHERE id = ANY (p_origen_ids);

  -- Superficie resultante desde el payload (la tabla es append-only — sin
  -- policy de UPDATE — así que el evento nace completo).
  SELECT COALESCE(sum(NULLIF(r->>'area_m2', '')::numeric), 0) INTO v_sup_result
  FROM jsonb_array_elements(p_resultantes) r;

  INSERT INTO dilesa.activo_movimientos
    (empresa_id, tipo, fecha, documento_id, superficie_origen_m2,
     superficie_resultante_m2, notas, creado_por)
  VALUES
    (v_empresa_id, p_tipo, p_fecha, p_documento_id, v_sup_origen, v_sup_result,
     NULLIF(p_notas, ''),
     (SELECT u.id FROM core.usuarios u WHERE u.id = auth.uid()))
  RETURNING id INTO v_mov_id;

  INSERT INTO dilesa.activo_movimiento_partes (empresa_id, movimiento_id, activo_id, rol)
  SELECT v_empresa_id, v_mov_id, unnest(p_origen_ids), 'origen';

  -- Resultantes: nacen ligados al linaje (padre = primer origen).
  FOR v_res IN SELECT * FROM jsonb_array_elements(p_resultantes) LOOP
    IF COALESCE(v_res->>'nombre', '') = '' OR COALESCE(v_res->>'tipo', '') = '' THEN
      RAISE EXCEPTION 'Cada resultante requiere nombre y tipo';
    END IF;
    IF v_res->>'tipo' NOT IN ('terreno', 'lote', 'casa', 'local', 'plaza', 'edificio',
                              'nave', 'departamento', 'infraestructura') THEN
      RAISE EXCEPTION 'Tipo de resultante no válido: %', v_res->>'tipo';
    END IF;

    INSERT INTO dilesa.activos
      (empresa_id, tipo, nombre, estado, activo_padre_id, zona, municipio, estado_geo,
       area_m2, situacion_legal, clave_catastral, clave_interna, destino_id, notas)
    VALUES
      (v_empresa_id,
       v_res->>'tipo',
       v_res->>'nombre',
       'adquirido',
       p_origen_ids[1],
       COALESCE(NULLIF(v_res->>'zona', ''), v_primer.zona),
       COALESCE(NULLIF(v_res->>'municipio', ''), v_primer.municipio),
       v_primer.estado_geo,
       NULLIF(v_res->>'area_m2', '')::numeric,
       v_primer.situacion_legal,
       NULLIF(v_res->>'clave_catastral', ''),
       NULLIF(v_res->>'clave_interna', ''),
       NULLIF(v_res->>'destino_id', '')::uuid,
       'Resultante de ' || p_tipo || ' del ' || p_fecha || ' (predio origen: '
         || v_primer.nombre || '). ' || COALESCE(NULLIF(v_res->>'notas', ''), ''))
    RETURNING id INTO v_activo_id;

    -- Satélite mínimo del tipo (editable después desde el form).
    EXECUTE format(
      'INSERT INTO dilesa.activo_%I (activo_id, empresa_id) VALUES ($1, $2) ON CONFLICT (activo_id) DO NOTHING',
      v_res->>'tipo'
    ) USING v_activo_id, v_empresa_id;

    -- Cuenta predial nueva si ya se conoce la clave catastral.
    IF COALESCE(v_res->>'clave_catastral', '') <> '' THEN
      INSERT INTO dilesa.cuentas_prediales
        (empresa_id, activo_id, clave_catastral, superficie_fiscal_m2, municipio)
      VALUES
        (v_empresa_id, v_activo_id, v_res->>'clave_catastral',
         NULLIF(v_res->>'area_m2', '')::numeric,
         COALESCE(NULLIF(v_res->>'municipio', ''), v_primer.municipio))
      ON CONFLICT (empresa_id, clave_catastral) DO NOTHING;
    END IF;

    v_res_ids := v_res_ids || v_activo_id;

    INSERT INTO dilesa.activo_movimiento_partes (empresa_id, movimiento_id, activo_id, rol)
    VALUES (v_empresa_id, v_mov_id, v_activo_id, 'resultante');
  END LOOP;

  -- Orígenes: desincorporar + baja lógica de sus cuentas prediales.
  v_baja := CASE p_tipo WHEN 'fusion' THEN 'baja_fusion' ELSE 'baja_subdivision' END;
  FOREACH o IN ARRAY p_origen_ids LOOP
    UPDATE dilesa.activos
    SET estado = 'desincorporado',
        notas = COALESCE(notas || E'\n', '') || 'Desincorporado por ' || p_tipo
                || ' del ' || p_fecha || ' (movimiento ' || v_mov_id || ').',
        updated_at = now()
    WHERE id = o;
  END LOOP;

  UPDATE dilesa.cuentas_prediales
  SET estatus = v_baja, updated_at = now()
  WHERE activo_id = ANY (p_origen_ids) AND estatus = 'activa';

  RETURN jsonb_build_object(
    'movimiento_id', v_mov_id,
    'resultantes', to_jsonb(v_res_ids),
    'superficie_origen_m2', v_sup_origen,
    'superficie_resultante_m2', v_sup_result
  );
END;
$$;

GRANT EXECUTE ON FUNCTION dilesa.fn_ejecutar_movimiento_activos(text, uuid[], jsonb, date, uuid, text) TO authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;
