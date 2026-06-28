-- ╭──────────────────────────────────────────────────────────────────╮
-- │  20260628183124_erp_arrendamiento_generar_cargos                    │
-- │                                                                    │
-- │  Iniciativa `arrendamiento` — Sprint 2 (FINANCIERO, gate D5).       │
-- │  RPC que genera el cargo de renta del periodo para cada contrato    │
-- │  vigente: 1 cargo por contrato/mes (suma de sus líneas vigentes,    │
-- │  con IVA, menos retenciones), en erp.cxc_cargos con                 │
-- │  origen_tipo='arrendamiento' y periodo='YYYYMM'. IDEMPOTENTE        │
-- │  (ON CONFLICT contra el índice parcial de S1b) → el cron mensual    │
-- │  puede correr 2 veces sin duplicar. La llama el cron (S2b) y el     │
-- │  botón "Generar cargos del mes" de la UI (S2c). Ver ADR-052 D5.     │
-- ╰──────────────────────────────────────────────────────────────────╯

BEGIN;

CREATE OR REPLACE FUNCTION erp.arrendamiento_generar_cargos(
  p_empresa_id uuid,
  p_periodo text
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'erp', 'public'
AS $function$
DECLARE
  v_inicio date;
  v_fin date;
  v_creados integer := 0;
  r record;
BEGIN
  IF p_periodo !~ '^\d{6}$' THEN
    RAISE EXCEPTION 'El periodo debe ser YYYYMM (recibido: %)', p_periodo;
  END IF;
  v_inicio := to_date(p_periodo, 'YYYYMM');
  v_fin := (v_inicio + interval '1 month' - interval '1 day')::date;

  FOR r IN
    SELECT
      a.id AS arrendamiento_id,
      COALESCE(a.pagador_persona_id, a.arrendatario_persona_id) AS persona_id,
      COALESCE(a.dia_corte, 1) AS dia_corte,
      -- Total del contrato para el mes = Σ líneas vigentes (subtotal + IVA −
      -- retenciones). El periodo de renta vigente por línea sale del LATERAL.
      SUM(
        rp.monto
        + rp.monto * COALESCE(l.iva_tasa_pct, 0) / 100.0
        - rp.monto * COALESCE(l.retencion_isr_pct, 0) / 100.0
        - rp.monto * COALESCE(l.retencion_iva_pct, 0) / 100.0
      ) AS monto_total
    FROM erp.arrendamientos a
    JOIN erp.arrendamiento_lineas l
      ON l.arrendamiento_id = a.id
      AND l.estado IN ('vigente', 'por_vencer')
    JOIN LATERAL (
      SELECT p.monto
      FROM erp.arrendamiento_renta_periodos p
      WHERE p.linea_id = l.id
        AND p.vigencia_inicio <= v_fin
        AND (p.vigencia_fin IS NULL OR p.vigencia_fin >= v_inicio)
      ORDER BY p.vigencia_inicio DESC
      LIMIT 1
    ) rp ON true
    WHERE a.empresa_id = p_empresa_id
      AND a.estado IN ('vigente', 'por_vencer')
      AND a.deleted_at IS NULL
      AND a.fecha_inicio IS NOT NULL
      AND a.fecha_inicio <= v_fin
      AND (a.fecha_fin IS NULL OR a.fecha_fin >= v_inicio)
    GROUP BY a.id, a.pagador_persona_id, a.arrendatario_persona_id, a.dia_corte
  LOOP
    INSERT INTO erp.cxc_cargos (
      empresa_id, persona_id, origen_tipo, origen_id, tipo_cargo, numero,
      concepto, monto, fecha_vencimiento, periodo, fuente_esperada
    ) VALUES (
      p_empresa_id, r.persona_id, 'arrendamiento', r.arrendamiento_id, 'renta',
      (substr(p_periodo, 5, 2))::integer,
      'Renta ' || p_periodo,
      round(r.monto_total, 2),
      (v_inicio + (r.dia_corte - 1) * interval '1 day')::date,
      p_periodo,
      'cliente'
    )
    ON CONFLICT (origen_id, periodo) WHERE origen_tipo = 'arrendamiento' AND deleted_at IS NULL
    DO NOTHING;
    IF FOUND THEN
      v_creados := v_creados + 1;
    END IF;
  END LOOP;

  RETURN v_creados;
END;
$function$;

REVOKE ALL ON FUNCTION erp.arrendamiento_generar_cargos(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION erp.arrendamiento_generar_cargos(uuid, text) TO authenticated, service_role;

COMMENT ON FUNCTION erp.arrendamiento_generar_cargos(uuid, text) IS
  'Genera el cargo de renta del periodo (YYYYMM) por contrato vigente en erp.cxc_cargos (origen_tipo=arrendamiento). Idempotente. La llama el cron mensual y el botón de la UI. Iniciativa arrendamiento S2.';

NOTIFY pgrst, 'reload schema';

COMMIT;
