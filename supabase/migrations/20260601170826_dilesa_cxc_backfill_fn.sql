-- ╭──────────────────────────────────────────────────────────────────╮
-- │  20260601170826_dilesa_cxc_backfill_fn                             │
-- │                                                                    │
-- │  CxC Sprint 1 — PR A4: función de backfill desde Coda.            │
-- │                                                                    │
-- │  Define dilesa.fn_backfill_cxc() que reconstruye el subledger CxC  │
-- │  desde los datos existentes:                                       │
-- │    1. Genera el plan de cargos (fn_generar_plan_pagos) para cada   │
-- │       venta planificable (activa o con pagos).                     │
-- │    2. Migra dilesa.venta_pagos → erp.cxc_pagos con la fuente       │
-- │       mapeada (tipo explícito; nulls por heurística de monto).     │
-- │    3. Aplica FIFO cada abono a los cargos de su venta por fuente.  │
-- │  Idempotente: skip de pagos ya migrados (coda_row_id) y de planes  │
-- │  con abonos.                                                       │
-- │                                                                    │
-- │  La migración SOLO define la función; el backfill se EJECUTA como  │
-- │  paso operativo (SELECT dilesa.fn_backfill_cxc()) para ver las     │
-- │  métricas. One-off sobre datos de prod (Preview no tiene datos).   │
-- │                                                                    │
-- │  Ver docs/planning/cxc.md.                                         │
-- ╰──────────────────────────────────────────────────────────────────╯

BEGIN;

CREATE OR REPLACE FUNCTION dilesa.fn_backfill_cxc()
  RETURNS TABLE(metrica text, valor bigint)
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = dilesa, erp, public
AS $fn$
DECLARE
  v_venta uuid;
  vp record;
  v_pago_id uuid;
  v_fuente text;
  v_restante numeric(14, 2);
  v_aplicar numeric(14, 2);
  c record;
  n_planes bigint := 0;
  n_skip_plan bigint := 0;
  n_pagos bigint := 0;
  n_aplic bigint := 0;
BEGIN
  -- ── 1. Generar planes para ventas relevantes ──────────────────────
  FOR v_venta IN
    SELECT ve.id
      FROM dilesa.ventas ve
     WHERE ve.deleted_at IS NULL
       AND ve.valor_escrituracion IS NOT NULL
       AND (
         ve.estado = 'activa'
         OR EXISTS (SELECT 1 FROM dilesa.venta_pagos pp
                     WHERE pp.venta_id = ve.id AND pp.deleted_at IS NULL)
       )
  LOOP
    BEGIN
      PERFORM dilesa.fn_generar_plan_pagos(v_venta);
      n_planes := n_planes + 1;
    EXCEPTION WHEN OTHERS THEN
      -- Venta con datos incompletos o con abonos ya aplicados: se omite.
      n_skip_plan := n_skip_plan + 1;
    END;
  END LOOP;

  -- ── 2 + 3. Migrar abonos + aplicar FIFO ───────────────────────────
  FOR vp IN
    SELECT pp.id, pp.venta_id, pp.fecha, pp.monto, pp.tipo, pp.notas, pp.coda_row_id,
           ve.empresa_id, ve.persona_id, ve.valor_escrituracion
      FROM dilesa.venta_pagos pp
      JOIN dilesa.ventas ve ON ve.id = pp.venta_id
     WHERE pp.deleted_at IS NULL
       AND ve.deleted_at IS NULL
       AND ve.valor_escrituracion IS NOT NULL
     ORDER BY pp.venta_id, pp.fecha ASC NULLS LAST, pp.created_at ASC
  LOOP
    -- Idempotencia: skip si ya migrado.
    IF vp.coda_row_id IS NOT NULL
       AND EXISTS (SELECT 1 FROM erp.cxc_pagos WHERE coda_row_id = vp.coda_row_id) THEN
      CONTINUE;
    END IF;

    -- Skip montos no positivos (no son abonos válidos).
    IF vp.monto IS NULL OR vp.monto <= 0 THEN
      CONTINUE;
    END IF;

    -- Mapeo de fuente.
    v_fuente := CASE
      WHEN vp.tipo IN ('Pago Infonavit', 'Pago Fovissste', 'Pago Banco') THEN 'institucion'
      WHEN vp.tipo IN ('Deposito Directo Cliente', 'Abono a Pagare') THEN 'cliente'
      WHEN vp.tipo IS NULL AND vp.monto >= COALESCE(vp.valor_escrituracion, 1e12) * 0.4 THEN 'institucion'
      ELSE 'cliente'
    END;

    INSERT INTO erp.cxc_pagos (
      empresa_id, persona_id, origen_tipo, origen_id, fecha, monto_total,
      fuente, forma_pago, notas, coda_row_id
    ) VALUES (
      vp.empresa_id, vp.persona_id, 'venta_dilesa', vp.venta_id,
      COALESCE(vp.fecha, CURRENT_DATE), vp.monto, v_fuente, NULL,
      NULLIF(trim(COALESCE(vp.tipo, '') || COALESCE(' — ' || vp.notas, '')), ''), vp.coda_row_id
    ) RETURNING id INTO v_pago_id;
    n_pagos := n_pagos + 1;

    -- FIFO a los cargos de la venta y fuente.
    v_restante := vp.monto;
    FOR c IN
      SELECT id, saldo FROM erp.cxc_cargos
       WHERE origen_tipo = 'venta_dilesa' AND origen_id = vp.venta_id
         AND fuente_esperada = v_fuente
         AND estado <> 'cancelado' AND deleted_at IS NULL AND saldo > 0
       ORDER BY fecha_vencimiento ASC NULLS LAST, numero ASC
    LOOP
      EXIT WHEN v_restante <= 0;
      v_aplicar := LEAST(v_restante, c.saldo);
      INSERT INTO erp.cxc_pago_aplicaciones (empresa_id, pago_id, cargo_id, monto_aplicado)
      VALUES (vp.empresa_id, v_pago_id, c.id, v_aplicar);
      v_restante := v_restante - v_aplicar;
      n_aplic := n_aplic + 1;
    END LOOP;
  END LOOP;

  metrica := 'planes_generados'; valor := n_planes; RETURN NEXT;
  metrica := 'planes_omitidos'; valor := n_skip_plan; RETURN NEXT;
  metrica := 'pagos_migrados'; valor := n_pagos; RETURN NEXT;
  metrica := 'aplicaciones'; valor := n_aplic; RETURN NEXT;
END;
$fn$;

COMMENT ON FUNCTION dilesa.fn_backfill_cxc() IS
  'Backfill one-off del subledger CxC desde dilesa.venta_pagos (Coda). Genera planes + migra abonos con fuente mapeada + aplica FIFO. Idempotente por coda_row_id. Ver cxc PR A4.';

NOTIFY pgrst, 'reload schema';

COMMIT;
