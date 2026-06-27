-- ╭─ 20260627203307_dilesa_entrega_evento_motor_post_factura ─╮
-- Sprint 2 de la iniciativa `dilesa-entrega-desacoplada` (ADR-052).
-- Desacopla pre-entrega y entrega del candado de factura: pasan de "fases que se
-- cierran" a EVENTOS con fecha real. Un motor único (fn_avanzar_post_factura)
-- proyecta esos eventos a la posición al facturar (13 -> 14/15). Reemplaza a
-- fn_auto_preparada_entrega (que solo cubría el caso 14).

BEGIN;

-- ───────────────────────────────────────────────────────────────────────────
-- 1) Columnas de evento: fecha real (editable, puede ser ANTERIOR a la factura).
--    Patrón de los hitos fechados ya existentes (fecha_escritura, fecha_detonacion…).
-- ───────────────────────────────────────────────────────────────────────────
ALTER TABLE dilesa.ventas
  ADD COLUMN IF NOT EXISTS fecha_pre_entrega date,
  ADD COLUMN IF NOT EXISTS fecha_entrega date;

COMMENT ON COLUMN dilesa.ventas.fecha_pre_entrega IS
  'Fecha real de la revisión de pre-entrega (evento, ADR-052). No avanza fase por sí sola; fn_avanzar_post_factura la proyecta a la posición al facturar.';
COMMENT ON COLUMN dilesa.ventas.fecha_entrega IS
  'Fecha real de la entrega física al cliente (evento, ADR-052). Idem fecha_pre_entrega.';

-- ───────────────────────────────────────────────────────────────────────────
-- 2) Backfill desde el historial de fases, donde ya existan las filas 14/15.
--    Corre ANTES de instalar el motor/triggers: no dispara nada. Las ventas que
--    ya están en 14/15 no se mueven (el motor nunca retrocede).
-- ───────────────────────────────────────────────────────────────────────────
UPDATE dilesa.ventas v
SET fecha_pre_entrega = vf.fecha
FROM dilesa.venta_fases vf
WHERE vf.venta_id = v.id AND vf.posicion = 14 AND vf.deleted_at IS NULL
  AND v.fecha_pre_entrega IS NULL;

UPDATE dilesa.ventas v
SET fecha_entrega = vf.fecha
FROM dilesa.venta_fases vf
WHERE vf.venta_id = v.id AND vf.posicion = 15 AND vf.deleted_at IS NULL
  AND v.fecha_entrega IS NULL;

-- ───────────────────────────────────────────────────────────────────────────
-- 3) Motor único: fn_avanzar_post_factura (14 y 15). Idempotente, nunca retrocede,
--    rellena venta_fases con FECHAS REALES (no la de hoy) — timeline sin huecos.
-- ───────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION dilesa.fn_avanzar_post_factura(p_venta_id uuid)
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'dilesa', 'erp', 'public'
AS $function$
DECLARE
  v_venta    dilesa.ventas%ROWTYPE;
  v_objetivo int;
  v_pre_por  uuid;
  v_ent_por  uuid;
BEGIN
  SELECT * INTO v_venta FROM dilesa.ventas WHERE id = p_venta_id AND deleted_at IS NULL;
  IF NOT FOUND THEN
    RETURN;
  END IF;

  -- Candado duro: la factura (13) debe estar cerrada. Sin factura no hay avance.
  IF NOT EXISTS (
    SELECT 1 FROM dilesa.venta_fases
    WHERE venta_id = p_venta_id AND posicion = 13 AND deleted_at IS NULL
  ) THEN
    RETURN;
  END IF;

  -- Objetivo = último paso físico ejecutado (ADR-052 D4).
  v_objetivo := 13;
  IF v_venta.fecha_entrega IS NOT NULL THEN
    v_objetivo := 15;
  ELSIF v_venta.fecha_pre_entrega IS NOT NULL THEN
    v_objetivo := 14;
  END IF;

  -- Nunca retrocede ni se redispara sobre sí mismo.
  IF v_objetivo <= COALESCE(v_venta.fase_posicion, 0) THEN
    RETURN;
  END IF;

  -- Autor de cada evento (para registrado_por de la fila de historial).
  SELECT a.uploaded_by INTO v_pre_por
  FROM erp.adjuntos a
  WHERE a.entidad_tipo = 'venta' AND a.entidad_id = p_venta_id
    AND a.rol = 'checklist_pre_entrega' AND a.sustituido_at IS NULL
  ORDER BY a.created_at DESC LIMIT 1;

  SELECT a.uploaded_by INTO v_ent_por
  FROM erp.adjuntos a
  WHERE a.entidad_tipo = 'venta' AND a.entidad_id = p_venta_id
    AND a.rol = 'checklist_entrega' AND a.sustituido_at IS NULL
  ORDER BY a.created_at DESC LIMIT 1;

  -- Rellenar filas intermedias con sus FECHAS REALES, en orden, sin duplicar.
  IF v_objetivo >= 14 AND NOT EXISTS (
    SELECT 1 FROM dilesa.venta_fases
    WHERE venta_id = p_venta_id AND posicion = 14 AND deleted_at IS NULL
  ) THEN
    INSERT INTO dilesa.venta_fases
      (empresa_id, venta_id, fase, posicion, fecha, registrado_por, notas)
    VALUES
      (v_venta.empresa_id, p_venta_id, 'Preparada para Entrega', 14,
       COALESCE(v_venta.fecha_pre_entrega, v_venta.fecha_entrega, CURRENT_DATE),
       v_pre_por, 'Avance automático post-factura (ADR-052)');
  END IF;

  IF v_objetivo >= 15 AND NOT EXISTS (
    SELECT 1 FROM dilesa.venta_fases
    WHERE venta_id = p_venta_id AND posicion = 15 AND deleted_at IS NULL
  ) THEN
    INSERT INTO dilesa.venta_fases
      (empresa_id, venta_id, fase, posicion, fecha, registrado_por, notas)
    VALUES
      (v_venta.empresa_id, p_venta_id, 'Entregada', 15,
       COALESCE(v_venta.fecha_entrega, CURRENT_DATE),
       v_ent_por, 'Avance automático post-factura (ADR-052)');
  END IF;

  UPDATE dilesa.ventas
  SET fase_actual = CASE v_objetivo
                      WHEN 15 THEN 'Entregada'
                      WHEN 14 THEN 'Preparada para Entrega'
                      ELSE fase_actual
                    END,
      fase_posicion = v_objetivo,
      updated_at = now()
  WHERE id = p_venta_id AND COALESCE(fase_posicion, 0) < v_objetivo;
END;
$function$;

COMMENT ON FUNCTION dilesa.fn_avanzar_post_factura(uuid) IS
  'ADR-052: proyecta los eventos pre-entrega/entrega (fechas en dilesa.ventas) a la posición de fase, una vez facturada la operación (13). 13->14 si hay fecha_pre_entrega; ->15 si hay fecha_entrega. Idempotente, nunca retrocede. Reemplaza fn_auto_preparada_entrega.';

-- ───────────────────────────────────────────────────────────────────────────
-- 4) Disparadores. Retiramos el auto-cierre viejo (solo 14) — tenía DOS gatillos:
--    uno en venta_fases (al cerrar la 13) y uno en erp.adjuntos (al subir el
--    checklist). En el modelo nuevo el disparo es por la fecha-evento, así que
--    ambos se reemplazan por: al facturar, y al registrar un evento ya facturado.
-- ───────────────────────────────────────────────────────────────────────────
DROP TRIGGER IF EXISTS trg_auto_preparada_entrega_fase ON dilesa.venta_fases;
DROP TRIGGER IF EXISTS trg_auto_preparada_entrega_adjunto ON erp.adjuntos;
DROP FUNCTION IF EXISTS dilesa.tg_auto_preparada_entrega();
DROP FUNCTION IF EXISTS dilesa.fn_auto_preparada_entrega(uuid);

-- 4a) Al cerrar la 13 (facturar): proyecta los eventos ya registrados.
--     Solo escucha posicion=13 → no se redispara cuando el motor inserta 14/15.
CREATE OR REPLACE FUNCTION dilesa.tg_avanzar_post_factura_fase()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'dilesa', 'erp', 'public'
AS $fn$
BEGIN
  -- Fail-open: el avance nunca tumba el INSERT de la fila de fase.
  BEGIN
    PERFORM dilesa.fn_avanzar_post_factura(NEW.venta_id);
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'tg_avanzar_post_factura_fase fallo (venta %): %', NEW.venta_id, SQLERRM;
  END;
  RETURN NEW;
END;
$fn$;

CREATE TRIGGER trg_avanzar_post_factura_fase
  AFTER INSERT ON dilesa.venta_fases
  FOR EACH ROW
  WHEN (NEW.posicion = 13)
  EXECUTE FUNCTION dilesa.tg_avanzar_post_factura_fase();

-- 4b) Al registrar un evento (set de fecha) estando ya facturado: el caso normal
--     (facturas, entregas semanas después). El `UPDATE OF` + el `WHEN` evitan que
--     el UPDATE de fase_posicion del propio motor lo re-dispare (no toca fechas).
CREATE OR REPLACE FUNCTION dilesa.tg_avanzar_post_factura_evento()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'dilesa', 'erp', 'public'
AS $fn$
BEGIN
  BEGIN
    PERFORM dilesa.fn_avanzar_post_factura(NEW.id);
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'tg_avanzar_post_factura_evento fallo (venta %): %', NEW.id, SQLERRM;
  END;
  RETURN NEW;
END;
$fn$;

CREATE TRIGGER trg_avanzar_post_factura_evento
  AFTER UPDATE OF fecha_pre_entrega, fecha_entrega ON dilesa.ventas
  FOR EACH ROW
  WHEN (NEW.fecha_pre_entrega IS DISTINCT FROM OLD.fecha_pre_entrega
     OR NEW.fecha_entrega IS DISTINCT FROM OLD.fecha_entrega)
  EXECUTE FUNCTION dilesa.tg_avanzar_post_factura_evento();

-- Recarga el cache de PostgREST por las columnas nuevas.
NOTIFY pgrst, 'reload schema';

COMMIT;
