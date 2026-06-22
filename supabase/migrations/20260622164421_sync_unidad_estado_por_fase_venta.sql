-- ╭─ 20260622164421_sync_unidad_estado_por_fase_venta ─╮
-- Sincroniza `dilesa.unidades.estado` con el avance de fase de su venta.
--
-- Problema: al marcar fase (`marcarFase`) se actualiza `ventas.fase_posicion`
-- pero NADA movía `unidades.estado` hacia adelante. La unidad se ponía
-- 'asignada' al autorizar Fase 2 y ahí se quedaba, aunque la venta llegara a
-- Escriturada (11) o Entregada (15+). El estado 'escriturada'/'entregada' que
-- algunas unidades sí tienen venía del import de Coda, no del flujo vivo. Esto
-- descuadraba el Resumen del proyecto (cuenta por `unidades.estado`) contra el
-- Reporte de Ventas (cuenta por `numero_escritura`+`fecha_escritura`).
--
-- Fix: (1) trigger que ADELANTA el estado comercial de la unidad según la fase
-- más avanzada de sus ventas vigentes; (2) backfill de las unidades ya
-- desfasadas. El trigger es monótono (solo adelanta), nunca retrocede ni pisa
-- estados físicos (planeada/lote_urbanizado/en_construccion/terminada). El
-- retroceso/liberación lo siguen gobernando las server actions de la app
-- (regresarAFase / desasignarVenta), igual que hoy.

BEGIN;

-- ── 1) Función del trigger ──────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION dilesa.fn_sync_unidad_estado_por_fase()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_max_fase int;
  v_objetivo text;
BEGIN
  IF NEW.unidad_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Punto más avanzado alcanzado por las ventas VIGENTES de la unidad. Una
  -- unidad puede tener >1 venta activa/terminada (re-asignaciones); manda la
  -- más avanzada para no degradar el estado por una venta vieja.
  SELECT max(v.fase_posicion) INTO v_max_fase
  FROM dilesa.ventas v
  WHERE v.unidad_id = NEW.unidad_id
    AND v.estado IN ('activa', 'terminada');

  IF v_max_fase IS NULL THEN
    RETURN NEW;
  ELSIF v_max_fase >= 15 THEN          -- Entregada / Conformidad / Op. Terminada
    v_objetivo := 'entregada';
  ELSIF v_max_fase >= 11 THEN          -- Escriturada / Detonada / Facturada / Prep. entrega
    v_objetivo := 'escriturada';
  ELSE
    RETURN NEW;                        -- fase < 11: la asignación la gobierna la app
  END IF;

  -- Solo ADELANTA. El guard por estado de origen impide retroceder y respeta
  -- los estados físicos previos a la venta.
  UPDATE dilesa.unidades u
  SET estado = v_objetivo
  WHERE u.id = NEW.unidad_id
    AND u.estado <> v_objetivo
    AND ( (v_objetivo = 'entregada'   AND u.estado IN ('asignada', 'vendida', 'escriturada'))
       OR (v_objetivo = 'escriturada' AND u.estado IN ('asignada', 'vendida')) );

  RETURN NEW;
END;
$$;

-- ── 2) Trigger sobre dilesa.ventas ──────────────────────────────────────────
-- Dispara en alta de venta y cuando cambia la posición de fase. NO dispara en
-- desasignar (ese UPDATE no toca fase_posicion), así que la reversión
-- 'asignada'→'terminada' de la app sigue intacta.
DROP TRIGGER IF EXISTS trg_sync_unidad_estado_por_fase ON dilesa.ventas;
CREATE TRIGGER trg_sync_unidad_estado_por_fase
  AFTER INSERT OR UPDATE OF fase_posicion ON dilesa.ventas
  FOR EACH ROW
  EXECUTE FUNCTION dilesa.fn_sync_unidad_estado_por_fase();

-- ── 3) Backfill de unidades ya desfasadas ───────────────────────────────────
-- Mismo criterio que el trigger, aplicado al universo actual. Idempotente: una
-- segunda corrida no encuentra filas (el guard por estado de origen las excluye).
WITH venta_vigente AS (
  SELECT DISTINCT ON (v.unidad_id)
         v.unidad_id,
         v.fase_posicion
  FROM dilesa.ventas v
  WHERE v.unidad_id IS NOT NULL
    AND v.estado IN ('activa', 'terminada')
  ORDER BY v.unidad_id, v.fase_posicion DESC NULLS LAST
)
UPDATE dilesa.unidades u
SET estado = CASE
               WHEN vv.fase_posicion >= 15 THEN 'entregada'
               ELSE 'escriturada'
             END
FROM venta_vigente vv
WHERE vv.unidad_id = u.id
  AND u.deleted_at IS NULL
  AND ( (vv.fase_posicion >= 15 AND u.estado IN ('asignada', 'vendida', 'escriturada'))
     OR (vv.fase_posicion >= 11 AND vv.fase_posicion < 15 AND u.estado IN ('asignada', 'vendida')) );

COMMIT;
