-- ╭──────────────────────────────────────────────────────────────────╮
-- │  20260601155951_dilesa_cxc_originacion_plan_pagos                  │
-- │                                                                    │
-- │  CxC Sprint 1 — PR A2: originación del plan de pagos para DILESA.  │
-- │                                                                    │
-- │  1. Términos del enganche en dilesa.ventas (capturados en la       │
-- │     venta; opción A cerrada con Beto): # parcialidades, fecha del   │
-- │     primer pago, periodicidad. Default 1 parcialidad (el enganche   │
-- │     suele ser pago único con el que se hace el apartado).          │
-- │  2. RPC dilesa.fn_generar_plan_pagos(venta_id) — deriva los cargos │
-- │     de erp.cxc_cargos desde los términos de la venta (ADR-037 D5). │
-- │                                                                    │
-- │  Modelo de negocio (validado con Beto sobre 1,175 ventas activas): │
-- │  ~96% son crédito institucional (Infonavit/Fovissste/Cofinavit/    │
-- │  Hipotecario) → el cliente paga el ENGANCHE y la institución       │
-- │  DISPONE el resto al escriturar (evento único). 50 son Contado     │
-- │  (cliente paga el total, normalmente de una). NO existe crédito    │
-- │  propio (DILESA no financia directo). Ancla del cargo total =      │
-- │  valor_escrituracion (fallback precio_asignacion).                 │
-- │                                                                    │
-- │  Ver docs/planning/cxc.md y docs/adr/037_subledger_gemelo_cxc_cxp. │
-- ╰──────────────────────────────────────────────────────────────────╯

BEGIN;

-- ─── 1. Términos del enganche en la venta ─────────────────────────────

ALTER TABLE dilesa.ventas
  ADD COLUMN IF NOT EXISTS enganche_num_parcialidades integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS enganche_fecha_primer_pago date,
  ADD COLUMN IF NOT EXISTS enganche_periodicidad text NOT NULL DEFAULT 'mensual';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ventas_enganche_num_parcialidades_chk'
  ) THEN
    ALTER TABLE dilesa.ventas
      ADD CONSTRAINT ventas_enganche_num_parcialidades_chk
      CHECK (enganche_num_parcialidades >= 1);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ventas_enganche_periodicidad_chk'
  ) THEN
    ALTER TABLE dilesa.ventas
      ADD CONSTRAINT ventas_enganche_periodicidad_chk
      CHECK (enganche_periodicidad IN ('mensual', 'quincenal'));
  END IF;
END $$;

COMMENT ON COLUMN dilesa.ventas.enganche_num_parcialidades IS
  'Número de parcialidades en que se cobra el enganche al cliente. Default 1 (pago único). CxC.';
COMMENT ON COLUMN dilesa.ventas.enganche_fecha_primer_pago IS
  'Fecha de la primera parcialidad del enganche. Base del calendario que genera fn_generar_plan_pagos.';
COMMENT ON COLUMN dilesa.ventas.enganche_periodicidad IS
  'Periodicidad de las parcialidades del enganche: mensual (default) o quincenal.';

-- ─── 2. Originación: dilesa.fn_generar_plan_pagos ─────────────────────
-- Deriva los cargos de erp.cxc_cargos desde una venta. Idempotente
-- mientras no haya abonos aplicados (regenerable). ADR-037 D5.

CREATE OR REPLACE FUNCTION dilesa.fn_generar_plan_pagos(p_venta_id uuid)
  RETURNS integer
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = dilesa, erp, public
AS $$
DECLARE
  v dilesa.ventas%ROWTYPE;
  v_total numeric(14, 2);
  v_enganche numeric(14, 2);
  v_num integer;
  v_fecha0 date;
  v_periodo interval;
  v_es_contado boolean;
  v_disposicion numeric(14, 2);
  v_con_abonos integer;
  v_parcial numeric(14, 2);
  v_acum numeric(14, 2) := 0;
  v_count integer := 0;
  k integer;
  v_venc date;
BEGIN
  SELECT * INTO v FROM dilesa.ventas WHERE id = p_venta_id AND deleted_at IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Venta % no existe o está borrada', p_venta_id;
  END IF;

  -- Idempotencia: no regenerar si ya hay abonos aplicados (rompería saldos).
  SELECT count(*) INTO v_con_abonos
    FROM erp.cxc_cargos c
    JOIN erp.cxc_pago_aplicaciones a ON a.cargo_id = c.id
   WHERE c.origen_tipo = 'venta_dilesa' AND c.origen_id = p_venta_id;
  IF v_con_abonos > 0 THEN
    RAISE EXCEPTION 'La venta % ya tiene abonos aplicados; ajustar manualmente, no regenerar', p_venta_id;
  END IF;

  -- Limpia cargos previos sin abonos (regenerable).
  DELETE FROM erp.cxc_cargos
   WHERE origen_tipo = 'venta_dilesa' AND origen_id = p_venta_id;

  v_total := COALESCE(v.valor_escrituracion, v.precio_asignacion);
  IF v_total IS NULL OR v_total <= 0 THEN
    RAISE EXCEPTION 'Venta % sin valor_escrituracion ni precio_asignacion', p_venta_id;
  END IF;

  v_enganche := LEAST(COALESCE(v.enganche_requerido, 0), v_total);
  v_num := GREATEST(COALESCE(v.enganche_num_parcialidades, 1), 1);
  v_fecha0 := COALESCE(v.enganche_fecha_primer_pago, CURRENT_DATE);
  v_periodo := CASE COALESCE(v.enganche_periodicidad, 'mensual')
                 WHEN 'quincenal' THEN interval '15 days'
                 ELSE interval '1 month'
               END;
  v_es_contado := (lower(COALESCE(v.tipo_credito, '')) = 'contado');

  IF v_es_contado THEN
    -- El cliente paga el total, en v_num parcialidades.
    v_acum := 0;
    FOR k IN 1..v_num LOOP
      IF k < v_num THEN
        v_parcial := round(v_total / v_num, 2);
        v_acum := v_acum + v_parcial;
      ELSE
        v_parcial := v_total - v_acum; -- última absorbe el residuo
      END IF;
      v_venc := (v_fecha0 + (v_periodo * (k - 1)))::date;
      INSERT INTO erp.cxc_cargos (
        empresa_id, persona_id, origen_tipo, origen_id,
        tipo_cargo, numero, concepto, monto, fecha_vencimiento, fuente_esperada
      ) VALUES (
        v.empresa_id, v.persona_id, 'venta_dilesa', p_venta_id,
        'contado', k, 'Pago de contado ' || k || '/' || v_num, v_parcial, v_venc, 'cliente'
      );
      v_count := v_count + 1;
    END LOOP;
  ELSE
    -- Crédito institucional: enganche (cliente) + disposición (institución).
    IF v_enganche > 0 THEN
      v_acum := 0;
      FOR k IN 1..v_num LOOP
        IF k < v_num THEN
          v_parcial := round(v_enganche / v_num, 2);
          v_acum := v_acum + v_parcial;
        ELSE
          v_parcial := v_enganche - v_acum;
        END IF;
        v_venc := (v_fecha0 + (v_periodo * (k - 1)))::date;
        INSERT INTO erp.cxc_cargos (
          empresa_id, persona_id, origen_tipo, origen_id,
          tipo_cargo, numero, concepto, monto, fecha_vencimiento, fuente_esperada
        ) VALUES (
          v.empresa_id, v.persona_id, 'venta_dilesa', p_venta_id,
          'enganche', k, 'Enganche ' || k || '/' || v_num, v_parcial, v_venc, 'cliente'
        );
        v_count := v_count + 1;
      END LOOP;
    END IF;

    v_disposicion := v_total - v_enganche;
    IF v_disposicion > 0 THEN
      INSERT INTO erp.cxc_cargos (
        empresa_id, persona_id, origen_tipo, origen_id,
        tipo_cargo, numero, concepto, monto, fecha_vencimiento, fuente_esperada
      ) VALUES (
        v.empresa_id, v.persona_id, 'venta_dilesa', p_venta_id,
        'credito', v_num + 1,
        'Disposición de crédito (' || COALESCE(v.tipo_credito, 'institucional') || ')',
        v_disposicion, v.fecha_escritura, 'institucion'
      );
      v_count := v_count + 1;
    END IF;
  END IF;

  INSERT INTO core.audit_log (empresa_id, usuario_id, accion, tabla, registro_id, datos_nuevos)
  VALUES (
    v.empresa_id, auth.uid(), 'cxc_plan_generado', 'erp.cxc_cargos', p_venta_id,
    jsonb_build_object(
      'cargos', v_count, 'total', v_total, 'enganche', v_enganche,
      'num_parcialidades', v_num, 'tipo_credito', v.tipo_credito, 'es_contado', v_es_contado
    )
  );

  RETURN v_count;
END;
$$;

COMMENT ON FUNCTION dilesa.fn_generar_plan_pagos(uuid) IS
  'Genera el plan de cargos CxC de una venta DILESA: parcialidades de enganche (cliente) + disposición institucional (evento único), o contado. Ancla a valor_escrituracion. Idempotente sin abonos. ADR-037 D5.';

NOTIFY pgrst, 'reload schema';

COMMIT;
