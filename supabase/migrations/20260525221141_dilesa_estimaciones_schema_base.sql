-- ============================================================================
-- Iniciativa: dilesa-estimaciones · Sprint 1 — Schema base
-- ============================================================================
-- Crea el módulo de Estimaciones de pago a contratistas DILESA. ADR-033.
--
-- Componentes:
--   - dilesa.estimaciones (1 fila por cierre por contratista)
--   - dilesa.estimacion_tareas (M:1 con UNIQUE en tarea_terminada_id = lock)
--   - v_tareas_pendientes_de_pago (vista — tareas palomeadas no en ninguna est)
--   - v_estimaciones_resumen (vista — agregaciones por contratista/estado/semana)
--   - fn_generar_estimacion_borrador(contratista_id, fecha_cierre) → uuid
--   - fn_tarea_terminada_esta_pagada(tarea_id) → bool (helper para lock)
--   - tg_ctt_lock_pagadas: trigger BEFORE UPDATE/DELETE en construccion_tareas_terminadas
--
-- Patrón estándar BSOP:
--   - PK uuid + DEFAULT gen_random_uuid()
--   - empresa_id NOT NULL → core.empresas
--   - created_at/updated_at via core.fn_set_updated_at()
--   - deleted_at para soft-delete
--   - RLS habilitado con core.fn_has_empresa() + core.fn_is_admin()
--
-- Migración aditiva pura — no toca tablas existentes (solo agrega trigger).
-- ============================================================================

-- ── 1. Tabla: dilesa.estimaciones ────────────────────────────────────────────

CREATE TABLE dilesa.estimaciones (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id              uuid NOT NULL REFERENCES core.empresas(id) ON DELETE RESTRICT,
  codigo                  text NOT NULL,
  contratista_id          uuid NOT NULL REFERENCES erp.personas(id) ON DELETE RESTRICT,
  fecha_cierre            date NOT NULL,
  fecha_pago_programado   date NOT NULL,
  -- Montos snapshot al cierre (no derivados — preservan integridad histórica).
  monto_bruto             numeric(14,2) NOT NULL DEFAULT 0,
  retencion_pct           numeric(5,2) NOT NULL DEFAULT 5.0
    CHECK (retencion_pct >= 0 AND retencion_pct <= 100),
  retencion_monto         numeric(14,2) NOT NULL DEFAULT 0,
  monto_neto              numeric(14,2) NOT NULL DEFAULT 0,
  -- Factura del contratista (capturada al transicionar a 'facturada').
  factura_url             text,
  factura_folio           text,
  factura_fecha           date,
  -- Audit trail apunta a core.usuarios (ADR-033 D9 — patrón del módulo
  -- construcción para revisado_por_user_id).
  aprobada_por_user_id    uuid REFERENCES core.usuarios(id) ON DELETE SET NULL,
  aprobada_at             timestamptz,
  pagada_por_user_id      uuid REFERENCES core.usuarios(id) ON DELETE SET NULL,
  pagada_at               timestamptz,
  referencia_pago         text,
  -- Estado del ciclo de cobro.
  estado                  text NOT NULL DEFAULT 'borrador'
    CHECK (estado IN ('borrador','aprobada','facturada','pagada','cancelada')),
  notas                   text,
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now(),
  deleted_at              timestamptz,
  CONSTRAINT estimaciones_codigo_uk UNIQUE (empresa_id, codigo)
);

COMMENT ON TABLE dilesa.estimaciones IS
  'Ciclo de pago semanal a contratistas DILESA. ADR-033. Una fila por cierre '
  '(típicamente miércoles) por contratista. Acumula tareas palomeadas no '
  'pagadas vía dilesa.estimacion_tareas (M:1).';
COMMENT ON COLUMN dilesa.estimaciones.codigo IS
  'Formato: EST-YYYY-WNN-<abrev>-NNN. Ej: EST-2026-W22-MAYA-001.';
COMMENT ON COLUMN dilesa.estimaciones.fecha_cierre IS
  'Día en que el gerente de construcción cerró la estimación. '
  'Convención DILESA: miércoles, pero el campo es DATE libre.';
COMMENT ON COLUMN dilesa.estimaciones.fecha_pago_programado IS
  'Día programado para el pago (default fecha_cierre + 1).';
COMMENT ON COLUMN dilesa.estimaciones.retencion_pct IS
  'Porcentaje de retención aplicado (default 5% — convención DILESA). '
  'Editable solo en estado borrador.';
COMMENT ON COLUMN dilesa.estimaciones.estado IS
  'Flujo: borrador → aprobada → facturada → pagada. Alterna a cancelada '
  'desde borrador/aprobada (libera tareas). Ver ADR-033 D3.';

CREATE INDEX idx_estimaciones_empresa ON dilesa.estimaciones(empresa_id);
CREATE INDEX idx_estimaciones_contratista ON dilesa.estimaciones(contratista_id);
CREATE INDEX idx_estimaciones_estado ON dilesa.estimaciones(estado)
  WHERE deleted_at IS NULL;
CREATE INDEX idx_estimaciones_fecha_cierre ON dilesa.estimaciones(fecha_cierre DESC)
  WHERE deleted_at IS NULL;
CREATE INDEX idx_estimaciones_pendientes_pago ON dilesa.estimaciones(contratista_id, fecha_cierre)
  WHERE estado IN ('aprobada','facturada') AND deleted_at IS NULL;

CREATE TRIGGER tg_estimaciones_updated_at
  BEFORE UPDATE ON dilesa.estimaciones
  FOR EACH ROW EXECUTE FUNCTION core.fn_set_updated_at();

ALTER TABLE dilesa.estimaciones ENABLE ROW LEVEL SECURITY;

CREATE POLICY estimaciones_rls_select ON dilesa.estimaciones
  FOR SELECT USING (core.fn_has_empresa(empresa_id) OR core.fn_is_admin());
CREATE POLICY estimaciones_rls_insert ON dilesa.estimaciones
  FOR INSERT WITH CHECK (core.fn_has_empresa(empresa_id) OR core.fn_is_admin());
CREATE POLICY estimaciones_rls_update ON dilesa.estimaciones
  FOR UPDATE USING (core.fn_has_empresa(empresa_id) OR core.fn_is_admin());
CREATE POLICY estimaciones_rls_delete ON dilesa.estimaciones
  FOR DELETE USING (core.fn_has_empresa(empresa_id) OR core.fn_is_admin());

-- ── 2. Tabla: dilesa.estimacion_tareas (M:1 con UNIQUE = lock) ───────────────

CREATE TABLE dilesa.estimacion_tareas (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id          uuid NOT NULL REFERENCES core.empresas(id) ON DELETE RESTRICT,
  estimacion_id       uuid NOT NULL REFERENCES dilesa.estimaciones(id) ON DELETE CASCADE,
  tarea_terminada_id  uuid NOT NULL REFERENCES dilesa.construccion_tareas_terminadas(id) ON DELETE RESTRICT,
  -- Denormalizado para queries fast del desglose (sin tener que JOIN a CTT).
  construccion_id     uuid NOT NULL REFERENCES dilesa.construccion(id) ON DELETE RESTRICT,
  -- Snapshot del monto bruto al momento del cierre. NO se re-deriva — preserva
  -- integridad histórica si el contrato cambia post-pago.
  monto_calculado     numeric(14,2) NOT NULL,
  created_at          timestamptz NOT NULL DEFAULT now(),
  -- Constraint absoluto: 1 tarea = 1 estimación. Ver ADR-033 D2.
  CONSTRAINT estimacion_tareas_tarea_uk UNIQUE (tarea_terminada_id)
);

COMMENT ON TABLE dilesa.estimacion_tareas IS
  'Vínculo M:1 estimación ← tareas terminadas. UNIQUE absoluto en '
  'tarea_terminada_id impide que una tarea entre a 2 estimaciones. '
  'Si una estimación se cancela, el DELETE CASCADE libera las tareas.';
COMMENT ON COLUMN dilesa.estimacion_tareas.monto_calculado IS
  'Snapshot del monto bruto al cierre = COALESCE(captura, % × valor_contrato_mo). '
  'No se re-deriva — preserva integridad si el contrato cambia post-pago.';

CREATE INDEX idx_estimacion_tareas_estimacion ON dilesa.estimacion_tareas(estimacion_id);
CREATE INDEX idx_estimacion_tareas_construccion ON dilesa.estimacion_tareas(construccion_id);

ALTER TABLE dilesa.estimacion_tareas ENABLE ROW LEVEL SECURITY;

CREATE POLICY estimacion_tareas_rls_select ON dilesa.estimacion_tareas
  FOR SELECT USING (core.fn_has_empresa(empresa_id) OR core.fn_is_admin());
CREATE POLICY estimacion_tareas_rls_insert ON dilesa.estimacion_tareas
  FOR INSERT WITH CHECK (core.fn_has_empresa(empresa_id) OR core.fn_is_admin());
CREATE POLICY estimacion_tareas_rls_update ON dilesa.estimacion_tareas
  FOR UPDATE USING (core.fn_has_empresa(empresa_id) OR core.fn_is_admin());
CREATE POLICY estimacion_tareas_rls_delete ON dilesa.estimacion_tareas
  FOR DELETE USING (core.fn_has_empresa(empresa_id) OR core.fn_is_admin());

-- ── 3. Vista: v_tareas_pendientes_de_pago ────────────────────────────────────
-- Tareas palomeadas que aún NO entraron a ninguna estimación.
-- Filtros:
--   - construccion no soft-deleted
--   - construccion.estado != 'cancelada' (ADR-033 D10 / R1: obras canceladas
--     cierran su ciclo de pago)
--   - tarea_terminada no soft-deleted
--   - tarea NO está en estimacion_tareas (lock por UNIQUE garantiza)

CREATE OR REPLACE VIEW dilesa.v_tareas_pendientes_de_pago AS
SELECT
  ctt.id                  AS tarea_terminada_id,
  ctt.empresa_id,
  c.id                    AS construccion_id,
  c.codigo                AS construccion_codigo,
  c.unidad_id,
  c.contratista_id,
  ctt.plantilla_tarea_id,
  ctt.fecha_terminada,
  ctt.revisado_por_user_id,
  ctt.revisado_por_persona_id,
  -- MO calculada: COALESCE(captura, % × valor_contrato). Mismo cálculo que
  -- usa el trigger fn_tg_construccion_avance para mo_ejecutado.
  COALESCE(
    ctt.mano_obra_pagada,
    pt.porcentaje_costo * c.valor_contrato_mo
  )                       AS monto_calculado
FROM dilesa.construccion_tareas_terminadas ctt
JOIN dilesa.plantilla_tareas pt ON pt.id = ctt.plantilla_tarea_id
JOIN dilesa.construccion c ON c.id = ctt.construccion_id
WHERE ctt.deleted_at IS NULL
  AND c.deleted_at IS NULL
  AND c.estado != 'cancelada'
  AND NOT EXISTS (
    SELECT 1 FROM dilesa.estimacion_tareas et
    WHERE et.tarea_terminada_id = ctt.id
  );

COMMENT ON VIEW dilesa.v_tareas_pendientes_de_pago IS
  'Tareas palomeadas listas para entrar a próxima estimación. ADR-033 D10. '
  'Excluye obras canceladas y tareas ya vinculadas a alguna estimación.';

-- ── 4. Vista: v_estimaciones_resumen ─────────────────────────────────────────
-- Agregaciones para dashboards: por contratista × estado × semana.

CREATE OR REPLACE VIEW dilesa.v_estimaciones_resumen AS
SELECT
  e.empresa_id,
  e.contratista_id,
  e.estado,
  EXTRACT(ISOYEAR FROM e.fecha_cierre)::int AS anio_iso,
  EXTRACT(WEEK FROM e.fecha_cierre)::int    AS semana_iso,
  COUNT(*)                                  AS estimaciones_count,
  SUM(e.monto_bruto)                        AS monto_bruto_total,
  SUM(e.retencion_monto)                    AS retencion_total,
  SUM(e.monto_neto)                         AS monto_neto_total
FROM dilesa.estimaciones e
WHERE e.deleted_at IS NULL
GROUP BY e.empresa_id, e.contratista_id, e.estado,
         EXTRACT(ISOYEAR FROM e.fecha_cierre), EXTRACT(WEEK FROM e.fecha_cierre);

COMMENT ON VIEW dilesa.v_estimaciones_resumen IS
  'Agregaciones de estimaciones por contratista × estado × semana ISO. '
  'Para dashboards de pagos.';

-- ── 5. Helper: fn_tarea_terminada_esta_pagada(tarea_id) → bool ───────────────
-- Usado por el trigger de lock y por el UI (para mostrar warning).

CREATE OR REPLACE FUNCTION dilesa.fn_tarea_terminada_esta_pagada(p_tarea_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM dilesa.estimacion_tareas et
    JOIN dilesa.estimaciones e ON e.id = et.estimacion_id
    WHERE et.tarea_terminada_id = p_tarea_id
      AND e.estado = 'pagada'
      AND e.deleted_at IS NULL
  );
$$;

COMMENT ON FUNCTION dilesa.fn_tarea_terminada_esta_pagada(uuid) IS
  'Devuelve true si la tarea está vinculada a una estimación en estado pagada. '
  'Usado por trigger tg_ctt_lock_pagadas y por UI client-side.';

-- ── 6. Trigger lock: BEFORE UPDATE/DELETE en construccion_tareas_terminadas ──
-- ADR-033 D8. Bloquea modificaciones de tareas pagadas. El override de
-- dirección se agrega en Sprint 2 (cuando los roles existan). Sprint 1: lock
-- absoluto.

CREATE OR REPLACE FUNCTION dilesa.fn_tg_ctt_lock_pagadas()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_tarea_id uuid := COALESCE(NEW.id, OLD.id);
  v_codigo_estimacion text;
BEGIN
  -- Si la tarea está en una estimación pagada, bloquear.
  -- (Sprint 2 agregará excepción para rol 'direccion'.)
  IF dilesa.fn_tarea_terminada_esta_pagada(v_tarea_id) THEN
    SELECT e.codigo INTO v_codigo_estimacion
    FROM dilesa.estimacion_tareas et
    JOIN dilesa.estimaciones e ON e.id = et.estimacion_id
    WHERE et.tarea_terminada_id = v_tarea_id
      AND e.estado = 'pagada'
      AND e.deleted_at IS NULL
    LIMIT 1;

    RAISE EXCEPTION 'Tarea bloqueada: está incluida en estimación pagada (%). '
                    'No se puede modificar ni eliminar. Si requieres ajuste, '
                    'pide a dirección.', v_codigo_estimacion
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN COALESCE(NEW, OLD);
END $$;

COMMENT ON FUNCTION dilesa.fn_tg_ctt_lock_pagadas() IS
  'Trigger function: bloquea UPDATE/DELETE en construccion_tareas_terminadas '
  'si la tarea ya está en una estimación pagada. ADR-033 D8.';

CREATE TRIGGER tg_ctt_lock_pagadas
  BEFORE UPDATE OR DELETE ON dilesa.construccion_tareas_terminadas
  FOR EACH ROW EXECUTE FUNCTION dilesa.fn_tg_ctt_lock_pagadas();

-- ── 7. RPC: fn_generar_estimacion_borrador ───────────────────────────────────
-- ADR-033 D10. Genera una estimación en borrador con todas las tareas
-- pendientes del contratista hasta la fecha de cierre.

CREATE OR REPLACE FUNCTION dilesa.fn_generar_estimacion_borrador(
  p_contratista_id uuid,
  p_fecha_cierre date DEFAULT CURRENT_DATE,
  p_retencion_pct numeric DEFAULT 5.0
)
RETURNS uuid
LANGUAGE plpgsql
AS $$
DECLARE
  v_empresa_id uuid;
  v_abreviacion text;
  v_estimacion_id uuid;
  v_codigo text;
  v_anio int;
  v_semana int;
  v_seq int;
  v_monto_bruto numeric(14,2);
  v_retencion_monto numeric(14,2);
  v_monto_neto numeric(14,2);
  v_tareas_count int;
BEGIN
  -- 1. Resolver empresa (DILESA — buscamos por slug) y abreviación del contratista.
  SELECT id INTO v_empresa_id
  FROM core.empresas
  WHERE slug = 'dilesa'
  LIMIT 1;

  IF v_empresa_id IS NULL THEN
    RAISE EXCEPTION 'No se encontró empresa con slug = dilesa';
  END IF;

  SELECT cd.abreviacion INTO v_abreviacion
  FROM dilesa.contratistas_datos cd
  WHERE cd.persona_id = p_contratista_id
    AND cd.deleted_at IS NULL
    AND cd.empresa_id = v_empresa_id;

  IF v_abreviacion IS NULL THEN
    v_abreviacion := 'CONT';
  END IF;

  -- 2. Verificar que existen tareas pendientes para este contratista.
  SELECT COUNT(*) INTO v_tareas_count
  FROM dilesa.v_tareas_pendientes_de_pago vp
  WHERE vp.contratista_id = p_contratista_id
    AND vp.fecha_terminada <= p_fecha_cierre;

  IF v_tareas_count = 0 THEN
    -- No hay tareas pendientes — devuelve NULL (caller maneja UX).
    RETURN NULL;
  END IF;

  -- 3. Calcular código secuencial. Año/semana ISO del cierre + N para
  --    contratista en esa semana.
  v_anio := EXTRACT(ISOYEAR FROM p_fecha_cierre)::int;
  v_semana := EXTRACT(WEEK FROM p_fecha_cierre)::int;

  SELECT COUNT(*) + 1 INTO v_seq
  FROM dilesa.estimaciones e
  WHERE e.contratista_id = p_contratista_id
    AND EXTRACT(ISOYEAR FROM e.fecha_cierre) = v_anio
    AND EXTRACT(WEEK FROM e.fecha_cierre) = v_semana
    AND e.deleted_at IS NULL;

  v_codigo := format('EST-%s-W%s-%s-%s',
                     v_anio,
                     LPAD(v_semana::text, 2, '0'),
                     v_abreviacion,
                     LPAD(v_seq::text, 3, '0'));

  -- 4. INSERT estimación borrador con totales en 0 (se llenan después del INSERT
  --    de estimacion_tareas, por simplicidad transaccional).
  INSERT INTO dilesa.estimaciones (
    empresa_id, codigo, contratista_id, fecha_cierre, fecha_pago_programado,
    monto_bruto, retencion_pct, retencion_monto, monto_neto, estado
  ) VALUES (
    v_empresa_id, v_codigo, p_contratista_id, p_fecha_cierre,
    p_fecha_cierre + INTERVAL '1 day',
    0, p_retencion_pct, 0, 0, 'borrador'
  )
  RETURNING id INTO v_estimacion_id;

  -- 5. INSERT N filas en estimacion_tareas con snapshot del monto.
  INSERT INTO dilesa.estimacion_tareas (
    empresa_id, estimacion_id, tarea_terminada_id, construccion_id, monto_calculado
  )
  SELECT
    vp.empresa_id, v_estimacion_id, vp.tarea_terminada_id, vp.construccion_id,
    vp.monto_calculado
  FROM dilesa.v_tareas_pendientes_de_pago vp
  WHERE vp.contratista_id = p_contratista_id
    AND vp.fecha_terminada <= p_fecha_cierre;

  -- 6. Calcular totales y persistirlos en la estimación.
  SELECT COALESCE(SUM(monto_calculado), 0) INTO v_monto_bruto
  FROM dilesa.estimacion_tareas
  WHERE estimacion_id = v_estimacion_id;

  v_retencion_monto := v_monto_bruto * (p_retencion_pct / 100);
  v_monto_neto := v_monto_bruto - v_retencion_monto;

  UPDATE dilesa.estimaciones
  SET monto_bruto = v_monto_bruto,
      retencion_monto = v_retencion_monto,
      monto_neto = v_monto_neto
  WHERE id = v_estimacion_id;

  RETURN v_estimacion_id;
END $$;

COMMENT ON FUNCTION dilesa.fn_generar_estimacion_borrador(uuid, date, numeric) IS
  'Genera estimación en borrador con todas las tareas pendientes del '
  'contratista hasta la fecha de cierre. Devuelve estimacion_id (o NULL '
  'si no hay tareas pendientes). ADR-033 D10.';

-- ── 8. Refresh PostgREST cache ───────────────────────────────────────────────
NOTIFY pgrst, 'reload schema';
