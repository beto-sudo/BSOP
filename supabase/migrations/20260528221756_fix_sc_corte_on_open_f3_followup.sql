-- ============================================================
-- MIGRATION: 20260528221756_fix_sc_corte_on_open_f3_followup
--
-- Follow-up de ADR-035 (F3). Saneamiento de la lógica "Sin Corte"
-- (Corte-SC), listada en docs/adr/035_rdb_waitry_paid_false_no_venta.md
-- (sección "Pendientes").
--
-- Existían DOS funciones gemelas con bugs latentes:
--
--   1. rdb.handle_sc_corte_on_open  -> CÓDIGO MUERTO.
--      - Sin trigger asociado: el guard de su migración original
--        (20260410020000) sólo creaba el trigger si rdb.cortes existía,
--        y rdb.cortes NUNCA existió en prod (to_regclass = NULL).
--      - Su body referencia rdb.cortes (relación inexistente) → fallaría
--        en runtime si llegara a invocarse.
--      - Arrastra el typo 'order_cancelled' y no filtra paid.
--      Se ELIMINA: limpia los 3 problemas por eliminación, sin riesgo
--      (nada la invoca).
--
--   2. erp.handle_sc_corte_on_open  -> VIVA y ACTIVA.
--      - Trigger trg_sc_corte_on_open_erp AFTER INSERT en erp.cortes_caja.
--      - 93 Corte-SC creados (último 2026-05-26) → lógica en uso, NO se
--        elimina; se corrigen los 2 bugs que sí le aplican:
--          a) typo 'order_cancelled' -> 'order_canceled'
--             (el status real que escribe el ingest es 'order_canceled',
--              una L — americano; el filtro nunca matcheaba).
--          b) filtro paid IS TRUE (semántica F3: paid<>true NO es venta,
--             igual que rdb.v_cortes_totales / rdb.v_waitry_pedidos).
--      - NO tiene el problema #3 (usa erp.cortes_caja, no rdb.cortes).
--
-- SIN BACKFILL (consistente con F3): el corte_id histórico en pedidos
-- paid=false / cancelados se preserva. La vista rdb.v_cortes_totales ya
-- los excluye (status <> 'order_canceled' AND paid IS TRUE), por lo que
-- NO inflan ningún total — el bug era latente. Este cambio es PREVENTIVO:
-- evita que futuros Corte-SC agrupen pedidos no vendidos (hoy 9/93 cortes
-- SC quedaron sin ninguna venta real; 35 pedidos no-pagados/cancelados
-- cayeron en algún Corte-SC). El saneamiento de esos históricos, si se
-- desea, es un paso aparte fuera de esta migración.
-- ============================================================

-- ─────────────── 1. Eliminar la versión muerta (rdb) ───────────────
DROP FUNCTION IF EXISTS rdb.handle_sc_corte_on_open();

-- ─────────────── 2. Corregir la versión viva (erp) ───────────────
CREATE OR REPLACE FUNCTION erp.handle_sc_corte_on_open()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = erp, rdb, public
AS $$
DECLARE
  v_primer_huerfano   TIMESTAMPTZ;
  v_ultimo_huerfano   TIMESTAMPTZ;
  v_fecha_sc          DATE;
  v_base_nombre       TEXT;
  v_corte_nombre      TEXT;
  v_sufijo            INTEGER;
  v_sc_corte_id       UUID;
  v_count_huerfanos   INTEGER;
  v_ultimo_cierre     TIMESTAMPTZ;
BEGIN
  IF NEW.estado != 'abierto' THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(MAX(cerrado_at), '1970-01-01'::TIMESTAMPTZ)
  INTO v_ultimo_cierre
  FROM erp.cortes_caja
  WHERE empresa_id = NEW.empresa_id
    AND id != NEW.id
    AND cerrado_at IS NOT NULL
    AND cerrado_at < NEW.abierto_at;

  -- Huérfanos en el gap. F3: sólo ventas reales (paid IS TRUE) y no
  -- canceladas ('order_canceled', una L — status real del ingest).
  SELECT COUNT(*), MIN("timestamp"), MAX("timestamp")
  INTO v_count_huerfanos, v_primer_huerfano, v_ultimo_huerfano
  FROM rdb.waitry_pedidos
  WHERE corte_id IS NULL
    AND status != 'order_canceled'
    AND paid IS TRUE
    AND "timestamp" > v_ultimo_cierre
    AND "timestamp" < NEW.abierto_at;

  IF v_count_huerfanos = 0 OR v_primer_huerfano IS NULL THEN
    RETURN NEW;
  END IF;

  v_fecha_sc := (v_primer_huerfano AT TIME ZONE 'America/Matamoros')::DATE;
  v_base_nombre := 'Corte-SC-' || TO_CHAR(v_fecha_sc, 'YYYY-MM-DD');
  v_sufijo := 1;
  v_corte_nombre := v_base_nombre;

  WHILE EXISTS (
    SELECT 1 FROM erp.cortes_caja
    WHERE empresa_id = NEW.empresa_id
      AND corte_nombre = v_corte_nombre
  ) LOOP
    v_sufijo := v_sufijo + 1;
    v_corte_nombre := v_base_nombre || '-' || v_sufijo;
  END LOOP;

  INSERT INTO erp.cortes_caja (
    empresa_id,
    caja_nombre,
    corte_nombre,
    tipo,
    estado,
    efectivo_inicial,
    observaciones,
    fecha_operativa,
    abierto_at,
    cerrado_at
  ) VALUES (
    NEW.empresa_id,
    COALESCE(NEW.caja_nombre, 'Sin Corte'),
    v_corte_nombre,
    'especial',
    'cerrado',
    0,
    'Generado automáticamente por trigger al abrir ' || COALESCE(NEW.corte_nombre, NEW.id::TEXT),
    v_fecha_sc,
    v_primer_huerfano,
    v_ultimo_huerfano
  ) RETURNING id INTO v_sc_corte_id;

  UPDATE rdb.waitry_pedidos
  SET corte_id = v_sc_corte_id,
      updated_at = now()
  WHERE corte_id IS NULL
    AND status != 'order_canceled'
    AND paid IS TRUE
    AND "timestamp" > v_ultimo_cierre
    AND "timestamp" < NEW.abierto_at;

  RETURN NEW;
END;
$$;

NOTIFY pgrst, 'reload schema';
