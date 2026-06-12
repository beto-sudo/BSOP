-- ╭─ 20260612215625_dilesa_ventas_estado_terminada ─╮
-- Estado 'terminada' en dilesa.ventas (sprint estados-venta, iniciativa
-- dilesa-ventas-captura-colaborativa).
--
-- Problema: "Operación Terminada" es la fase 17 del pipeline pero llegar ahí
-- no cambiaba el `estado` — la venta quedaba 'activa' para siempre. En prod
-- 1,238 de 1,239 activas ya tienen escritura (histórico Coda cerrado), así
-- que "activa" no distinguía pipeline vivo de operación concluida y
-- contaminaba KPIs (Estancadas >180d, Días en pipeline) y filtros.
--
-- Modelo: `estado` = ciclo de vida del registro; `fase` = avance en pipeline.
--   activa      → viva en pipeline (fases 1-16)
--   terminada   → alcanzó fase 17 (terminal feliz)            ← NUEVO
--   desasignada → caída (terminal, ya existía)
--   expirada    → hold vencido (terminal, ya existía)
--
-- La sincronía fase↔estado vive en un trigger (no en capa app) para que
-- marcarFase, regresarAFase y cualquier data-fix futuro mantengan la
-- invariante sin acordarse de ella.

BEGIN;

-- ── 1. Constraint: agregar 'terminada' al vocabulario ───────────────────────
ALTER TABLE dilesa.ventas DROP CONSTRAINT IF EXISTS ventas_estado_check;
ALTER TABLE dilesa.ventas ADD CONSTRAINT ventas_estado_check
  CHECK (estado IN ('activa', 'terminada', 'desasignada', 'expirada'));

-- ── 2. Trigger de sincronía fase_posicion ↔ estado ──────────────────────────
-- Solo transmuta activa↔terminada; jamás toca estados terminales tristes
-- (desasignada/expirada): una venta caída que conserve fase 17 en su caché
-- no debe "revivir" como terminada.
CREATE OR REPLACE FUNCTION dilesa.fn_ventas_sync_estado_terminada()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF NEW.estado = 'activa' AND NEW.fase_posicion = 17 THEN
    NEW.estado := 'terminada';
  ELSIF NEW.estado = 'terminada' AND (NEW.fase_posicion IS NULL OR NEW.fase_posicion < 17) THEN
    NEW.estado := 'activa';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_ventas_sync_estado_terminada ON dilesa.ventas;
CREATE TRIGGER trg_ventas_sync_estado_terminada
  BEFORE INSERT OR UPDATE ON dilesa.ventas
  FOR EACH ROW
  EXECUTE FUNCTION dilesa.fn_ventas_sync_estado_terminada();

-- ── 3. Backfill: activas que ya alcanzaron la fase 17 → terminada ───────────
-- Criterio conservador, consistente con el data-fix de 20260612025311: solo
-- fase_posicion = 17. Las ~45 activas sin fase NO se tocan — no hay evidencia
-- de conclusión (el data-fix de ayer ya cerró las que tenían unidad
-- entregada); quedan como pendiente de clasificación operativa.
-- En prod al 2026-06-12: 1,093 filas.
UPDATE dilesa.ventas
SET estado = 'terminada'
WHERE deleted_at IS NULL
  AND estado = 'activa'
  AND fase_posicion = 17;

-- ── 4. Recargar PostgREST ────────────────────────────────────────────────────
NOTIFY pgrst, 'reload schema';

COMMIT;
