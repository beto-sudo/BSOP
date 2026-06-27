-- ╭─ 20260627010103_revertir_gate_fase14_facturada_reconciliar ─╮
-- Revierte el gate del auto-cierre de la Fase 14 (Preparada para Entrega) de
-- Detonada (12) de vuelta a Facturada (13), y reconcilia las ventas que el
-- backfill de 20260626210952 (#1075) re-adelantó a 14 sin tener factura.
--
-- Contexto (Beto, 2026-06-26): la factura (fase 13) es un CANDADO DURO del
-- pipeline — una venta NO debe pasar de "Facturación" hasta que se genere el
-- CFDI, aunque ya tenga el checklist de pre-entrega cargado y el pago detonado.
-- El cambio #1075 (gate = Detonada 12) rompió esa invariante: dejó que viviendas
-- pagadas con checklist BRINCARAN a "Preparada para Entrega" sin facturar, y su
-- backfill re-adelantó 4 ventas que la reconciliación 20260626021255 había
-- regresado a 12 la noche anterior (Julio César/M11-L4, Nancy/M22-L1,
-- Christopher/M3-L16, Eduardo/M4-L29). Operación las vio "adelantarse solas".
--
-- Regla restaurada: la 14 se cierra sola cuando coinciden DOS condiciones:
--   (a) Facturada (fase 13) cerrada — el candado duro, y
--   (b) el checklist de pre-entrega (`erp.adjuntos` rol `checklist_pre_entrega`)
--       cargado y vigente.
-- La revisión de pre-entrega (subir el checklist) se sigue pudiendo hacer ANTES
-- de facturar — solo que NO avanza la fase: el adjunto se guarda y, cuando se
-- factura, el trigger recoge la venta. Espejo de 20260626020801 (#1048).
--
-- NOTA: el salto "inteligente" al facturar (si la entrega física ya ocurrió,
-- pasar directo a Entrega/Encuesta respetando fechas previas) es un rediseño
-- aparte (iniciativa) — esta migración solo restaura el candado correcto.

BEGIN;

-- ── Lógica idempotente del auto-cierre (gate = Facturada 13) ─────────────────
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

  -- (a) Facturada (13) cerrada — el candado duro. Solo desde aquí avanza a 14:
  -- jamás se brinca la facturación.
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

-- ── Disparador 1: vuelve a la fase 13 (Facturada), no la 12 ──────────────────
DROP TRIGGER IF EXISTS trg_auto_preparada_entrega_fase ON dilesa.venta_fases;
CREATE TRIGGER trg_auto_preparada_entrega_fase
  AFTER INSERT ON dilesa.venta_fases
  FOR EACH ROW
  WHEN (NEW.posicion = 13 AND NEW.deleted_at IS NULL)
  EXECUTE FUNCTION dilesa.tg_auto_preparada_entrega();

-- El disparador 2 (subida del checklist en erp.adjuntos) NO cambia: sigue
-- cubriendo el caso en que el checklist llega después de la factura.

-- Defensa de superficie (idempotente): estas funciones solo las usa el trigger.
REVOKE ALL ON FUNCTION dilesa.fn_auto_preparada_entrega(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION dilesa.tg_auto_preparada_entrega() FROM PUBLIC;

NOTIFY pgrst, 'reload schema';

-- ── Reconciliación: regresar a fase real las que están en 14 sin factura ─────
-- Identifica por CONDICIÓN (activa + pos 14 + sin Facturada 13), no por IDs:
-- idempotente y robusto al Preview branch (vacío → no matchea nada). NO toca
-- `erp.adjuntos` (el checklist se conserva como evento) ni la casa física.
-- Inline (sin tabla temporal) para ser robusto a cómo se aplique la migración.
--
-- 1) Soft-delete de la fila `venta_fases` pos 14 (cerrada sin factura). Va
--    PRIMERO: filtra por `ventas.fase_posicion = 14`, que el paso 2 todavía no
--    ha movido. El soft-delete (UPDATE) no dispara el auto-cierre (es AFTER
--    INSERT). NO toca `erp.adjuntos` (el checklist se conserva como evento).
UPDATE dilesa.venta_fases vf
SET deleted_at = now(), updated_at = now()
WHERE vf.posicion = 14
  AND vf.deleted_at IS NULL
  AND vf.venta_id IN (
    SELECT v.id FROM dilesa.ventas v
    WHERE v.estado = 'activa'
      AND v.deleted_at IS NULL
      AND v.fase_posicion = 14
      AND NOT EXISTS (
        SELECT 1 FROM dilesa.venta_fases x
        WHERE x.venta_id = v.id AND x.posicion = 13 AND x.deleted_at IS NULL
      )
  );

-- 2) Regresar el caché de posición a la última fase real: 12 (Detonada) si ya
--    está cerrada, si no 11 (Escriturada). El trigger
--    `fn_sync_unidad_estado_por_fase` recalcula el estado de la unidad: 11/12
--    siguen mapeando a 'escriturada' (solo-adelanta no degrada).
UPDATE dilesa.ventas v
SET fase_posicion = CASE WHEN EXISTS (
        SELECT 1 FROM dilesa.venta_fases x
        WHERE x.venta_id = v.id AND x.posicion = 12 AND x.deleted_at IS NULL
      ) THEN 12 ELSE 11 END,
    fase_actual = CASE WHEN EXISTS (
        SELECT 1 FROM dilesa.venta_fases x
        WHERE x.venta_id = v.id AND x.posicion = 12 AND x.deleted_at IS NULL
      ) THEN 'Detonada' ELSE 'Escriturada' END,
    updated_at = now()
WHERE v.estado = 'activa'
  AND v.deleted_at IS NULL
  AND v.fase_posicion = 14
  AND NOT EXISTS (
    SELECT 1 FROM dilesa.venta_fases x
    WHERE x.venta_id = v.id AND x.posicion = 13 AND x.deleted_at IS NULL
  );

COMMIT;
