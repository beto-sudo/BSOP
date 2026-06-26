-- ╭─ 20260626210952_auto_preparada_entrega_gate_detonada ─╮
-- Relaja el gate del auto-cierre de la Fase 14 (Preparada para Entrega): la
-- condición pasa de Facturada (13) a Detonada (12).
--
-- Contexto (Beto, 2026-06-26): la regla anterior (#1048, migración
-- 20260626020801) exigía Facturada (13) + checklist para preparar/entregar. En
-- la práctica eso bloqueaba viviendas ya PAGADAS (Detonada, 12) y con su
-- pre-entrega lista, esperando únicamente a que Contabilidad facturara — la
-- facturación puede ir por detrás de la entrega. Caso real: M22-L1-LDLE y
-- M11-L4-LDLE, ambas en 12 con checklist cargado, sin poder imprimir el
-- checklist de entrega al cliente.
--
-- Nueva regla: la 14 se cierra sola cuando coinciden DOS condiciones, sin
-- importar el orden:
--   (a) Detonada (fase 12) cerrada — el pago recibido. Sigue siendo imposible
--       preparar/entregar antes del pago (preserva la decisión 2026-06-22 "la
--       entrega exige pago"); solo se suelta el requisito de Facturada.
--   (b) el checklist de pre-entrega (`erp.adjuntos` rol `checklist_pre_entrega`)
--       cargado y vigente.
-- La facturación (13) deja de ser prerrequisito de la 14. El pipeline sigue sin
-- brincarse el pago: 12 es obligatorio. Disparadores: el cierre de la fase 12
-- (INSERT en `dilesa.venta_fases`) y la subida del checklist (INSERT en
-- `erp.adjuntos`). La función es idempotente y solo ADELANTA (12 -> 14).
--
-- Cierra el ciclo abierto por la reconciliación 20260626021255, que había
-- regresado a 12/11 las ventas que estaban en 14 sin Facturada: con el gate en
-- Detonada, las que ya pagaron + tienen checklist vuelven a 14 (backfill al pie).

BEGIN;

-- ── Lógica idempotente del auto-cierre (gate = Detonada 12) ──────────────────
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

  -- (a) Detonada (12) cerrada — el pago recibido. La entrega exige pago; la
  -- facturación (13) ya NO es prerrequisito. Solo desde aquí avanza a 14: el
  -- pago nunca se brinca.
  IF NOT EXISTS (
    SELECT 1 FROM dilesa.venta_fases
    WHERE venta_id = p_venta_id AND posicion = 12 AND deleted_at IS NULL
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
     'Cierre automático: checklist de pre-entrega cargado y pago detonado');

  -- Caché de posición: solo ADELANTA (la fila 12 validada arriba garantiza que
  -- el pago entró). El guard `< 14` impide retroceder. NOTA: el caché puede
  -- saltar de 12 a 14 cuando la 13 (Facturada) aún no se cierra — es esperado:
  -- la facturación va por detrás y la 13 se cerrará a su tiempo sin afectar a 14.
  UPDATE dilesa.ventas
  SET fase_actual = 'Preparada para Entrega',
      fase_posicion = 14,
      updated_at = now()
  WHERE id = p_venta_id AND COALESCE(fase_posicion, 0) < 14;
END;
$function$;

-- ── Disparador 1: ahora al cerrar la Detonada (fase 12), no la 13 ────────────
-- El disparador sobre la fase 13 deja de ser necesario (12 es la condición y
-- siempre ocurre antes que 13). Lo recreamos sobre la 12.
DROP TRIGGER IF EXISTS trg_auto_preparada_entrega_fase ON dilesa.venta_fases;
CREATE TRIGGER trg_auto_preparada_entrega_fase
  AFTER INSERT ON dilesa.venta_fases
  FOR EACH ROW
  WHEN (NEW.posicion = 12 AND NEW.deleted_at IS NULL)
  EXECUTE FUNCTION dilesa.tg_auto_preparada_entrega();

-- El disparador 2 (subida del checklist en erp.adjuntos) no cambia: sigue
-- cubriendo el caso en que el checklist llega después del pago.

NOTIFY pgrst, 'reload schema';

-- ── Backfill: recoger las ventas que ya califican con el gate nuevo ──────────
-- Activas, con Detonada (12) cerrada + checklist vigente, aún sin la 14. Incluye
-- las que la reconciliación 20260626021255 había regresado a 12. Idempotente
-- (la función no hace nada si la 14 ya existe) y robusto a Preview (vacío → 0).
DO $backfill$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT v.id
    FROM dilesa.ventas v
    WHERE v.deleted_at IS NULL
      AND v.estado = 'activa'
      AND EXISTS (
        SELECT 1 FROM dilesa.venta_fases vf
        WHERE vf.venta_id = v.id AND vf.posicion = 12 AND vf.deleted_at IS NULL
      )
      AND NOT EXISTS (
        SELECT 1 FROM dilesa.venta_fases vf
        WHERE vf.venta_id = v.id AND vf.posicion = 14 AND vf.deleted_at IS NULL
      )
      AND EXISTS (
        SELECT 1 FROM erp.adjuntos a
        WHERE a.entidad_tipo = 'venta' AND a.entidad_id = v.id
          AND a.rol = 'checklist_pre_entrega' AND a.sustituido_at IS NULL
      )
  LOOP
    PERFORM dilesa.fn_auto_preparada_entrega(r.id);
  END LOOP;
END
$backfill$;

COMMIT;
