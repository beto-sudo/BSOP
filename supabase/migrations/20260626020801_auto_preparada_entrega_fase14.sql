-- ╭─ 20260626020801_auto_preparada_entrega_fase14 ─╮
-- La Fase 14 (Preparada para Entrega) deja de ser una captura manual que podía
-- BRINCAR el pipeline y pasa a un cierre AUTOMÁTICO y SECUENCIAL.
--
-- Regla (2026-06-25, Beto): el pipeline avanza de 1 en 1; después de Escriturada
-- (11) van Detonada (12) y Facturada (13) — no se pueden saltar. "Poder preparar
-- la entrega" (subir el checklist) se habilita desde la Escritura, pero eso NO
-- coloca la venta en la fase 14: solo adelanta el documento. Antes, capturar la
-- 14 desde la 11 (gate especial `{14:11}`) hacía `fase_posicion = 14` saltándose
-- 12 y 13 — 6 ventas activas quedaron así (entre ellas la de Nancy Villarreal,
-- que disparó este hallazgo).
--
-- Nuevo modelo: la 14 se cierra sola cuando coinciden DOS condiciones, sin
-- importar el orden en que ocurran:
--   (a) Facturada (fase 13) cerrada — la previa inmediata, y
--   (b) el checklist de pre-entrega (`erp.adjuntos` rol `checklist_pre_entrega`)
--       cargado y vigente.
-- Dos triggers cubren los dos eventos que pueden completar el par: el cierre de
-- la fase 13 (INSERT en `dilesa.venta_fases`) y la subida del checklist (INSERT
-- en `erp.adjuntos`). La función de lógica es idempotente y solo ADELANTA la
-- posición (13 -> 14, nunca retrocede). El autor del cierre = quien subió el
-- checklist (quien certificó físicamente la vivienda), no quien facturó.
--
-- Espejo del patrón ya probado en `dilesa.fn_detonar_venta_desde_cxc` (auto-cierre
-- de la fase 12 al registrarse el abono de institución).

BEGIN;

-- ── Lógica idempotente del auto-cierre ───────────────────────────────────────
CREATE OR REPLACE FUNCTION dilesa.fn_auto_preparada_entrega(p_venta_id uuid)
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'dilesa', 'erp', 'public'
AS $function$
DECLARE
  v_venta           dilesa.ventas%ROWTYPE;
  v_checklist_por   uuid;
  v_checklist_fecha date;
  v_tiene_checklist boolean;
BEGIN
  SELECT * INTO v_venta
  FROM dilesa.ventas
  WHERE id = p_venta_id AND deleted_at IS NULL;
  IF NOT FOUND THEN
    RETURN;
  END IF;

  -- (b) Checklist de pre-entrega vigente (no sustituido). Tomamos autor y fecha
  -- del más reciente: "quién preparó la entrega" = quién subió el checklist
  -- firmado, no quién facturó.
  SELECT a.uploaded_by, a.created_at::date
    INTO v_checklist_por, v_checklist_fecha
  FROM erp.adjuntos a
  WHERE a.entidad_tipo = 'venta'
    AND a.entidad_id = p_venta_id
    AND a.rol = 'checklist_pre_entrega'
    AND a.sustituido_at IS NULL
  ORDER BY a.created_at DESC
  LIMIT 1;
  v_tiene_checklist := FOUND;
  IF NOT v_tiene_checklist THEN
    RETURN;  -- sin checklist: nada que cerrar
  END IF;

  -- (a) Facturada (13) cerrada — la previa inmediata. Solo desde aquí avanza a
  -- 14: jamás se brincan Detonada/Facturada.
  IF NOT EXISTS (
    SELECT 1 FROM dilesa.venta_fases
    WHERE venta_id = p_venta_id AND posicion = 13 AND deleted_at IS NULL
  ) THEN
    RETURN;
  END IF;

  -- Idempotencia: si la 14 ya está cerrada, salir (camino normal). El partial
  -- unique de `venta_fases` cubre la carrera de dos triggers simultáneos.
  IF EXISTS (
    SELECT 1 FROM dilesa.venta_fases
    WHERE venta_id = p_venta_id AND posicion = 14 AND deleted_at IS NULL
  ) THEN
    RETURN;
  END IF;

  INSERT INTO dilesa.venta_fases
    (empresa_id, venta_id, fase, posicion, fecha, registrado_por, notas)
  VALUES
    (v_venta.empresa_id, p_venta_id, 'Preparada para Entrega', 14,
     COALESCE(v_checklist_fecha, CURRENT_DATE), v_checklist_por,
     'Cierre automático: checklist de pre-entrega cargado y operación facturada');

  -- Caché de posición: solo ADELANTA (la fila 13 validada arriba garantiza la
  -- secuencialidad). El guard `< 14` impide retroceder.
  UPDATE dilesa.ventas
  SET fase_actual = 'Preparada para Entrega',
      fase_posicion = 14,
      updated_at = now()
  WHERE id = p_venta_id AND COALESCE(fase_posicion, 0) < 14;
END;
$function$;

-- ── Wrapper de trigger (resuelve la venta según la tabla disparadora) ─────────
CREATE OR REPLACE FUNCTION dilesa.tg_auto_preparada_entrega()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'dilesa', 'erp', 'public'
AS $function$
DECLARE
  v_venta_id uuid;
BEGIN
  IF TG_TABLE_NAME = 'venta_fases' THEN
    v_venta_id := NEW.venta_id;          -- se cerró la fase 13
  ELSIF TG_TABLE_NAME = 'adjuntos' THEN
    v_venta_id := NEW.entidad_id;        -- se subió el checklist
  ELSE
    RETURN NEW;
  END IF;

  -- Nunca romper el INSERT disparador por una falla del auto-cierre.
  BEGIN
    PERFORM dilesa.fn_auto_preparada_entrega(v_venta_id);
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'tg_auto_preparada_entrega fallo (tabla %, venta %): %',
      TG_TABLE_NAME, v_venta_id, SQLERRM;
  END;

  RETURN NEW;
END;
$function$;

-- ── Disparador 1: al cerrar la Facturada (fase 13) ───────────────────────────
DROP TRIGGER IF EXISTS trg_auto_preparada_entrega_fase ON dilesa.venta_fases;
CREATE TRIGGER trg_auto_preparada_entrega_fase
  AFTER INSERT ON dilesa.venta_fases
  FOR EACH ROW
  WHEN (NEW.posicion = 13 AND NEW.deleted_at IS NULL)
  EXECUTE FUNCTION dilesa.tg_auto_preparada_entrega();

-- ── Disparador 2: al subir el checklist de pre-entrega ────────────────────────
DROP TRIGGER IF EXISTS trg_auto_preparada_entrega_adjunto ON erp.adjuntos;
CREATE TRIGGER trg_auto_preparada_entrega_adjunto
  AFTER INSERT ON erp.adjuntos
  FOR EACH ROW
  WHEN (NEW.entidad_tipo = 'venta'
        AND NEW.rol = 'checklist_pre_entrega'
        AND NEW.sustituido_at IS NULL)
  EXECUTE FUNCTION dilesa.tg_auto_preparada_entrega();

-- Estas funciones SOLO las usa el trigger (SECURITY DEFINER corre como owner).
-- Revocar el EXECUTE por default a PUBLIC: `dilesa` está en `pgrst.db_schemas`,
-- así que sin esto `fn_auto_preparada_entrega` sería invocable como RPC y
-- cualquiera podría forzar el cierre de la fase 14 de una venta arbitraria.
REVOKE ALL ON FUNCTION dilesa.fn_auto_preparada_entrega(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION dilesa.tg_auto_preparada_entrega() FROM PUBLIC;

-- Funciones nuevas referenciadas por triggers; recarga el cache de PostgREST.
NOTIFY pgrst, 'reload schema';

COMMIT;
