-- ============================================================================
-- DILESA · Sistema de hold + cola para asignación de inventario
-- ----------------------------------------------------------------------------
-- Beto describió el flujo operativo real (no implementado hasta hoy):
--   1. Vendedor crea Solicitud para Unidad X → queda como líder con hold de
--      2 días hábiles MX para completar expediente firmado.
--   2. Si otro vendedor crea Solicitud para la misma unidad, entra en cola
--      (posición 2, 3, …). La cola se ordena por created_at ASC.
--   3. Si el líder no completa expediente y se le acaba el hold → estado
--      pasa a 'expirada'. El siguiente en la cola sube a líder y arranca
--      su propio plazo de 2 días hábiles desde el momento del salto.
--   4. Cuando el líder concreta (Dirección/Nelcy autoriza), la venta pasa
--      a Fase 2 ('Asignada'). La unidad sale de inventario. Los demás de
--      la cola reciben aviso de "ya no disponible".
--
-- Decisiones cerradas con Beto:
--   D1. Deadline desde `created_at` de la solicitud.
--   D2. Nuevo líder arranca con 2 días hábiles frescos desde el salto
--       (NO hereda el deadline del líder anterior).
--   D3. Avisos por email a vendedor + cliente:
--       - al volverse líder (creación o promoción tras expiración)
--       - 4 horas antes de expirar (si no ha completado)
--       - al expirar (vendedor + cliente del que expira)
--       - al ser promovido (nuevo líder + cliente con tiempos)
--   D4. El sistema aplica solo a ventas creadas en BSOP. Las históricas
--       importadas de Coda (`coda_row_id IS NOT NULL`) NO entran a la cola.
--   D5. Cron corre cada hora — cubre el aviso 4h con tolerancia ≤1h.
--   D6. Vendedor expirado puede recrear solicitud; entra al final de la
--       cola por orden de timestamp (created_at de la nueva solicitud).
--
-- Cambios:
--   1. Constraint `ventas_estado_check`: agrega 'expirada'.
--   2. 6 columnas nuevas en `dilesa.ventas`:
--      - `expira_at timestamptz` (deadline del hold; lo calcula el INSERT)
--      - `expirada_at timestamptz` (auditoría)
--      - 4 timestamps idempotentes para emails:
--        - `notif_hold_creado_at`
--        - `notif_hold_promovido_at`
--        - `notif_hold_4h_at`
--        - `notif_hold_expirada_at`
--   3. Vista `dilesa.v_unidad_hold_queue` que computa la fila por unidad.
--   4. Función `dilesa.fn_expirar_ventas_vencidas()` para el cron.
--   5. Sub-slug nuevo `dilesa.ventas.autorizar` + backfill defensivo.
--   6. NOTIFY pgrst.
--
-- Iniciativa: `dilesa-prelaunch-audit` · Fase 2 hold + cola.
-- ============================================================================

BEGIN;

-- ── 1. Constraint estado: agregar 'expirada' ──────────────────────────────────

ALTER TABLE dilesa.ventas DROP CONSTRAINT IF EXISTS ventas_estado_check;
ALTER TABLE dilesa.ventas
  ADD CONSTRAINT ventas_estado_check
  CHECK (estado IN ('activa', 'desasignada', 'expirada'));

-- ── 2. Columnas nuevas en dilesa.ventas ───────────────────────────────────────

ALTER TABLE dilesa.ventas
  ADD COLUMN IF NOT EXISTS expira_at timestamptz,
  ADD COLUMN IF NOT EXISTS expirada_at timestamptz,
  ADD COLUMN IF NOT EXISTS notif_hold_creado_at timestamptz,
  ADD COLUMN IF NOT EXISTS notif_hold_promovido_at timestamptz,
  ADD COLUMN IF NOT EXISTS notif_hold_4h_at timestamptz,
  ADD COLUMN IF NOT EXISTS notif_hold_expirada_at timestamptz;

COMMENT ON COLUMN dilesa.ventas.expira_at IS
  'Deadline del hold de inventario. Calculado en TS al INSERT como created_at + 2 días hábiles MX. NULL para ventas históricas importadas de Coda.';
COMMENT ON COLUMN dilesa.ventas.expirada_at IS
  'Momento en que la venta pasó a estado=expirada. NULL si nunca expiró.';

-- ── 3. Vista de cola por unidad ──────────────────────────────────────────────
-- Solo entran ventas (1) activas, (2) en Fase 1 (Solicitud), (3) sin deleted_at,
-- (4) creadas en BSOP (no importadas de Coda).
-- La posición 1 es el líder; el resto está en cola por created_at ASC.

CREATE OR REPLACE VIEW dilesa.v_unidad_hold_queue
WITH (security_invoker = on) AS
SELECT
  v.unidad_id,
  v.id AS venta_id,
  v.empresa_id,
  v.persona_id,
  v.vendedor_usuario_id,
  v.created_at,
  v.expira_at,
  v.notif_hold_creado_at,
  v.notif_hold_promovido_at,
  v.notif_hold_4h_at,
  ROW_NUMBER() OVER (
    PARTITION BY v.unidad_id
    ORDER BY v.created_at ASC, v.id ASC
  ) AS posicion
FROM dilesa.ventas v
WHERE v.fase_posicion = 1
  AND v.estado = 'activa'
  AND v.deleted_at IS NULL
  AND v.coda_row_id IS NULL
  AND v.unidad_id IS NOT NULL;

COMMENT ON VIEW dilesa.v_unidad_hold_queue IS
  'Cola de holds por unidad — la posición 1 es el líder con hold activo. Solo aplica a ventas creadas en BSOP (coda_row_id IS NULL), Fase 1 (Solicitud), estado activa.';

GRANT SELECT ON dilesa.v_unidad_hold_queue TO authenticated;

-- ── 4. Función para el cron de expiración ────────────────────────────────────
-- Marca como 'expirada' las ventas líder cuyo `expira_at` ya pasó.
-- NO recalcula expira_at del nuevo líder — eso lo hace el cron en TS para
-- usar el helper `sumarDiasHabiles` (festivos MX).
-- Retorna la lista de IDs expirados para que el cron en TS envíe los emails
-- + setee expira_at del nuevo líder + envíe email de promovido.

CREATE OR REPLACE FUNCTION dilesa.fn_expirar_ventas_vencidas()
RETURNS TABLE (
  venta_id uuid,
  unidad_id uuid,
  persona_id uuid,
  vendedor_usuario_id uuid,
  empresa_id uuid
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH expiradas AS (
    UPDATE dilesa.ventas
    SET
      estado = 'expirada',
      expirada_at = now()
    WHERE id IN (
      SELECT v.id
      FROM dilesa.ventas v
      WHERE v.fase_posicion = 1
        AND v.estado = 'activa'
        AND v.deleted_at IS NULL
        AND v.coda_row_id IS NULL
        AND v.expira_at IS NOT NULL
        AND v.expira_at <= now()
        AND v.unidad_id IS NOT NULL
    )
    RETURNING ventas.id, ventas.unidad_id, ventas.persona_id,
              ventas.vendedor_usuario_id, ventas.empresa_id
  )
  SELECT e.id, e.unidad_id, e.persona_id, e.vendedor_usuario_id, e.empresa_id
  FROM expiradas e;
END;
$$;

COMMENT ON FUNCTION dilesa.fn_expirar_ventas_vencidas IS
  'Marca como expiradas las ventas líder cuyo expira_at ya pasó. Retorna IDs para que el cron en TS envíe emails y recalcule expira_at del nuevo líder con días hábiles MX.';

GRANT EXECUTE ON FUNCTION dilesa.fn_expirar_ventas_vencidas TO authenticated;

-- ── 5. Sub-slug RBAC: dilesa.ventas.autorizar ────────────────────────────────
-- Solo Dirección + el rol específico (Nelcy) tendrán escritura sobre esto.
-- En el backfill defensivo damos LECTURA a todos los roles que ya pueden
-- leer dilesa.ventas.lista (transparencia: cualquier vendedor puede ver
-- el estado del expediente) pero ESCRITURA solo se concede explícitamente
-- desde Settings → Acceso por el admin.

INSERT INTO core.modulos (slug, nombre, descripcion, empresa_id, seccion)
SELECT
  'dilesa.ventas.autorizar',
  'Ventas · Autorizar asignación',
  'Permiso de Dirección / autorizador específico para confirmar la asignación de una unidad cuando el expediente del líder está completo.',
  e.id,
  'operaciones'
FROM core.empresas e
WHERE e.slug = 'dilesa'
ON CONFLICT (empresa_id, slug) DO NOTHING;

-- Backfill defensivo: heredar permisos de lectura de `dilesa.ventas.lista`,
-- escritura = false por default (admin la concede explícita después).
INSERT INTO core.permisos_rol (rol_id, modulo_id, acceso_lectura, acceso_escritura)
SELECT
  pr.rol_id,
  m_auth.id,
  pr.acceso_lectura,
  false
FROM core.permisos_rol pr
JOIN core.modulos m_lista ON m_lista.id = pr.modulo_id
JOIN core.modulos m_auth ON m_auth.empresa_id = m_lista.empresa_id
                          AND m_auth.slug = 'dilesa.ventas.autorizar'
WHERE m_lista.slug = 'dilesa.ventas.lista'
ON CONFLICT (rol_id, modulo_id) DO NOTHING;

-- ── 6. Reload schema cache PostgREST ─────────────────────────────────────────

NOTIFY pgrst, 'reload schema';

COMMIT;
