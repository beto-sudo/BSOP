-- ============================================================
-- MIGRATION: 20260410020000_rdb_trigger_sc_corte_on_open
--
-- Cuando un cajero abre un corte nuevo, este trigger detecta si
-- existen pedidos huérfanos (corte_id IS NULL) que cayeron en
-- el gap entre el último corte cerrado y la apertura del nuevo.
--
-- Si los hay:
--   1. Genera un Corte-SC-YYYY-MM-DD (o -2, -3... si ya existe ese día)
--      con hora_inicio = primer pedido huérfano
--           hora_fin   = último pedido huérfano
--           estado     = 'cerrado' (ya pasó)
--           tipo       = 'sin_corte'
--   2. Asigna esos pedidos huérfanos al Corte-SC recién creado
--   3. El corte nuevo del cajero queda abierto normalmente
-- ============================================================

CREATE OR REPLACE FUNCTION rdb.handle_sc_corte_on_open()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = rdb, public
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
  -- Solo actuar en INSERT (apertura de corte nuevo)
  -- y solo si el nuevo corte tiene estado 'abierto'
  IF NEW.estado != 'abierto' THEN
    RETURN NEW;
  END IF;

  -- Obtener la hora_fin del último corte cerrado (cualquier tipo)
  -- anterior al nuevo. Si no hay ninguno, usar epoch como límite inferior.
  SELECT COALESCE(MAX(hora_fin), '1970-01-01'::TIMESTAMPTZ)
  INTO v_ultimo_cierre
  FROM rdb.cortes
  WHERE id != NEW.id
    AND hora_fin IS NOT NULL
    AND hora_fin < NEW.hora_inicio;

  -- Contar pedidos huérfanos en el gap:
  --   timestamp > último cierre  AND  timestamp < hora_inicio del nuevo corte
  SELECT
    COUNT(*),
    MIN("timestamp"),
    MAX("timestamp")
  INTO v_count_huerfanos, v_primer_huerfano, v_ultimo_huerfano
  FROM rdb.waitry_pedidos
  WHERE corte_id IS NULL
    AND status != 'order_cancelled'
    AND "timestamp" > v_ultimo_cierre
    AND "timestamp" < NEW.hora_inicio;

  -- Si no hay huérfanos, no hacer nada
  IF v_count_huerfanos = 0 OR v_primer_huerfano IS NULL THEN
    RETURN NEW;
  END IF;

  -- Determinar la fecha del SC (basada en el primer pedido huérfano, hora local CDT)
  v_fecha_sc := (v_primer_huerfano AT TIME ZONE 'America/Matamoros')::DATE;

  -- Generar nombre único: Corte-SC-YYYY-MM-DD, Corte-SC-YYYY-MM-DD-2, -3...
  v_base_nombre := 'Corte-SC-' || TO_CHAR(v_fecha_sc, 'YYYY-MM-DD');
  v_sufijo := 1;
  v_corte_nombre := v_base_nombre;

  WHILE EXISTS (
    SELECT 1 FROM rdb.cortes WHERE corte_nombre = v_corte_nombre
  ) LOOP
    v_sufijo := v_sufijo + 1;
    v_corte_nombre := v_base_nombre || '-' || v_sufijo;
  END LOOP;

  -- Crear el Corte-SC
  INSERT INTO rdb.cortes (
    corte_nombre,
    hora_inicio,
    hora_fin,
    estado,
    tipo,
    fecha_operativa,
    observaciones
  ) VALUES (
    v_corte_nombre,
    v_primer_huerfano,
    v_ultimo_huerfano,
    'cerrado',
    'sin_corte',
    v_fecha_sc,
    'Generado automáticamente por trigger al abrir ' || COALESCE(NEW.corte_nombre, NEW.id::TEXT)
  )
  RETURNING id INTO v_sc_corte_id;

  -- Asignar los pedidos huérfanos al Corte-SC
  UPDATE rdb.waitry_pedidos
  SET corte_id  = v_sc_corte_id,
      updated_at = now()
  WHERE corte_id IS NULL
    AND status != 'order_cancelled'
    AND "timestamp" > v_ultimo_cierre
    AND "timestamp" < NEW.hora_inicio;

  RAISE NOTICE 'Corte SC creado: % con % pedidos (% → %)',
    v_corte_nombre, v_count_huerfanos, v_primer_huerfano, v_ultimo_huerfano;

  RETURN NEW;
END;
$$;

-- Crear el trigger en rdb.cortes (AFTER INSERT)
-- EDITED 2026-04-23 (drift-1.5): rdb.cortes ambient.
DO $do$
BEGIN
  IF to_regclass('rdb.cortes') IS NOT NULL THEN
    DROP TRIGGER IF EXISTS trg_sc_corte_on_open ON rdb.cortes;
    CREATE TRIGGER trg_sc_corte_on_open
    AFTER INSERT ON rdb.cortes
    FOR EACH ROW
    EXECUTE FUNCTION rdb.handle_sc_corte_on_open();
  END IF;
END $do$;
