-- ╭──────────────────────────────────────────────────────────────────╮
-- │  20260627214333_erp_arrendamiento_alta_rpc                          │
-- │                                                                    │
-- │  Iniciativa `arrendamiento` — Sprint 1c. RPC de alta atómica del    │
-- │  contrato: master + N líneas + periodo de renta inicial por línea, │
-- │  en una sola transacción, con invariantes:                         │
-- │    · cada activo de la línea debe tener destino cuenta_renta=true   │
-- │    · anti-doble-booking lo garantiza el EXCLUDE de S1a (aquí se     │
-- │      captura el error y se traduce a un mensaje claro).            │
-- │                                                                    │
-- │  SECURITY INVOKER (como dilesa.fn_alta_activo): respeta RLS         │
-- │  set-membership. NO mueve dinero ni toca cxc. Ver ADR-052.        │
-- ╰──────────────────────────────────────────────────────────────────╯

BEGIN;

CREATE OR REPLACE FUNCTION erp.arrendamiento_alta(
  p_empresa_id uuid,
  p_master jsonb,
  p_lineas jsonb DEFAULT '[]'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SET search_path TO 'erp', 'public'
AS $function$
DECLARE
  v_id uuid;
  v_linea jsonb;
  v_linea_id uuid;
  v_activo_id uuid;
  v_cuenta_renta boolean;
  v_vig_inicio date;
  v_vig_fin date;
  v_subtotal numeric(14, 2);
BEGIN
  IF COALESCE(p_master->>'arrendatario_persona_id', '') = '' THEN
    RAISE EXCEPTION 'El arrendatario es obligatorio';
  END IF;
  IF jsonb_typeof(p_lineas) <> 'array' OR jsonb_array_length(p_lineas) = 0 THEN
    RAISE EXCEPTION 'El contrato necesita al menos una línea (espacio rentado)';
  END IF;

  INSERT INTO erp.arrendamientos (
    empresa_id, arrendatario_persona_id, pagador_persona_id, receptor_fiscal_persona_id,
    arrendador_persona_id, folio, tipo_plazo, fecha_inicio, fecha_fin, dia_corte,
    esquema_incremento, pct_adicional, inpc_base_anio, inpc_base_mes, tipo_renovacion,
    penalizacion_terminacion_meses, requiere_fiador, fiador_persona_id, deposito_meses,
    estado, notas
  ) VALUES (
    p_empresa_id,
    (p_master->>'arrendatario_persona_id')::uuid,
    NULLIF(p_master->>'pagador_persona_id', '')::uuid,
    NULLIF(p_master->>'receptor_fiscal_persona_id', '')::uuid,
    NULLIF(p_master->>'arrendador_persona_id', '')::uuid,
    NULLIF(p_master->>'folio', ''),
    COALESCE(NULLIF(p_master->>'tipo_plazo', ''), 'plazo'),
    NULLIF(p_master->>'fecha_inicio', '')::date,
    NULLIF(p_master->>'fecha_fin', '')::date,
    NULLIF(p_master->>'dia_corte', '')::integer,
    COALESCE(NULLIF(p_master->>'esquema_incremento', ''), 'inpc_mas_pct'),
    COALESCE(NULLIF(p_master->>'pct_adicional', '')::numeric, 2.0),
    NULLIF(p_master->>'inpc_base_anio', '')::integer,
    NULLIF(p_master->>'inpc_base_mes', '')::integer,
    COALESCE(NULLIF(p_master->>'tipo_renovacion', ''), 'manual'),
    COALESCE(NULLIF(p_master->>'penalizacion_terminacion_meses', '')::numeric, 2),
    COALESCE((p_master->>'requiere_fiador')::boolean, false),
    NULLIF(p_master->>'fiador_persona_id', '')::uuid,
    COALESCE(NULLIF(p_master->>'deposito_meses', '')::numeric, 1),
    COALESCE(NULLIF(p_master->>'estado', ''), 'borrador'),
    NULLIF(p_master->>'notas', '')
  ) RETURNING id INTO v_id;

  FOR v_linea IN SELECT * FROM jsonb_array_elements(p_lineas)
  LOOP
    v_activo_id := (v_linea->>'activo_id')::uuid;
    IF v_activo_id IS NULL THEN
      RAISE EXCEPTION 'Cada línea necesita activo_id';
    END IF;

    -- Invariante: el activo debe estar marcado para renta en el portafolio.
    SELECT d.cuenta_renta INTO v_cuenta_renta
      FROM dilesa.activos a
      LEFT JOIN dilesa.portafolio_destinos d ON d.id = a.destino_id
     WHERE a.id = v_activo_id AND a.empresa_id = p_empresa_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'El activo % no existe en esta empresa', v_activo_id;
    END IF;
    IF NOT COALESCE(v_cuenta_renta, false) THEN
      RAISE EXCEPTION 'El activo % no tiene un destino con cuenta_renta=true (no está marcado para arrendamiento)', v_activo_id;
    END IF;

    v_subtotal := COALESCE(NULLIF(v_linea->>'renta_subtotal', '')::numeric, 0);
    v_vig_inicio := NULLIF(v_linea->>'vigencia_inicio', '')::date;
    v_vig_fin := NULLIF(v_linea->>'vigencia_fin', '')::date;

    INSERT INTO erp.arrendamiento_lineas (
      empresa_id, arrendamiento_id, activo_id, tipo_operacion_fiscal,
      renta_subtotal, regimen_iva, iva_tasa_pct, iva_fundamento, lugar_expedicion,
      sujeto_retencion, retencion_isr_pct, retencion_iva_pct,
      vigencia_inicio, vigencia_fin, estado, notas
    ) VALUES (
      p_empresa_id, v_id, v_activo_id,
      COALESCE(NULLIF(v_linea->>'tipo_operacion_fiscal', ''), 'arrendamiento_inmueble'),
      v_subtotal,
      COALESCE(NULLIF(v_linea->>'regimen_iva', ''), 'tasa_8'),
      COALESCE(NULLIF(v_linea->>'iva_tasa_pct', '')::numeric, 8),
      NULLIF(v_linea->>'iva_fundamento', ''),
      NULLIF(v_linea->>'lugar_expedicion', ''),
      COALESCE((v_linea->>'sujeto_retencion')::boolean, false),
      COALESCE(NULLIF(v_linea->>'retencion_isr_pct', '')::numeric, 0),
      COALESCE(NULLIF(v_linea->>'retencion_iva_pct', '')::numeric, 0),
      v_vig_inicio, v_vig_fin,
      COALESCE(NULLIF(v_linea->>'estado', ''), 'borrador'),
      NULLIF(v_linea->>'notas', '')
    ) RETURNING id INTO v_linea_id;

    -- Periodo de renta inicial (serie append-only; el incremento al
    -- aniversario insertará periodos nuevos, ADR-052 D5).
    IF v_vig_inicio IS NOT NULL THEN
      INSERT INTO erp.arrendamiento_renta_periodos (
        empresa_id, linea_id, vigencia_inicio, vigencia_fin, monto
      ) VALUES (
        p_empresa_id, v_linea_id, v_vig_inicio, v_vig_fin, v_subtotal
      );
    END IF;
  END LOOP;

  INSERT INTO core.audit_log (empresa_id, usuario_id, accion, tabla, registro_id, datos_nuevos)
  VALUES (p_empresa_id, auth.uid(), 'arrendamiento_alta', 'erp.arrendamientos', v_id,
    jsonb_build_object('lineas', jsonb_array_length(p_lineas)));

  RETURN v_id;
EXCEPTION
  WHEN exclusion_violation THEN
    RAISE EXCEPTION 'Un activo ya está rentado en esas fechas (traslape de vigencia). Revisa las líneas del contrato.';
END;
$function$;

REVOKE ALL ON FUNCTION erp.arrendamiento_alta(uuid, jsonb, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION erp.arrendamiento_alta(uuid, jsonb, jsonb) TO authenticated;

COMMENT ON FUNCTION erp.arrendamiento_alta(uuid, jsonb, jsonb) IS
  'Alta atómica de contrato de arrendamiento: master + N líneas + periodo de renta inicial. Valida cuenta_renta por activo; traduce el EXCLUDE de doble-booking a mensaje claro. SECURITY INVOKER (respeta RLS). Iniciativa arrendamiento S1c.';

NOTIFY pgrst, 'reload schema';

COMMIT;
