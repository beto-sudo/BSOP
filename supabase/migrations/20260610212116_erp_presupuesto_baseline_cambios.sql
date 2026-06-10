-- ╭──────────────────────────────────────────────────────────────────╮
-- │  20260610212116_erp_presupuesto_baseline_cambios                  │
-- │                                                                    │
-- │  Sprint 1 de `dilesa-presupuesto-baseline`. Gobierno del           │
-- │  presupuesto de proyectos: baseline por proyecto + órdenes de      │
-- │  cambio (aditivas/deductivas) autorizadas por Dirección.           │
-- │                                                                    │
-- │  1. erp.presupuesto_baselines + erp.presupuesto_baseline_partidas  │
-- │     — snapshot inmutable del presupuesto inicial (solo via RPC;    │
-- │     sin grants de escritura directa).                              │
-- │  2. erp.presupuesto_cambios — la orden de cambio ES el registro    │
-- │     de la decisión: tipo + delta + motivo estructurado + adjuntos  │
-- │     (erp.adjuntos entidad_tipo='presupuesto_cambios').             │
-- │  3. Trigger guard en erp.presupuesto_partidas — post-baseline,     │
-- │     `presupuesto_aprobado` SOLO se mueve via RPC (flag de sesión   │
-- │     `app.presupuesto_gate`). Necesario porque el costeo escribe    │
-- │     la tabla directo desde el browser y la RLS no filtra por rol.  │
-- │  4. RPCs fn_presupuesto_baseline_autorizar +                       │
-- │     fn_presupuesto_cambio_resolver — gate Dirección server-side    │
-- │     (erp.fn_es_direccion) + core.audit_log con antes/después       │
-- │     (patrón CxC).                                                  │
-- │  5. Vista erp.v_presupuesto_reconciliacion — invariante            │
-- │     vigente = baseline + Σ cambios autorizados (drift visible).    │
-- ╰──────────────────────────────────────────────────────────────────╯

BEGIN;

-- ─── 1. Baseline (cabecera + snapshot por partida) ────────────────────

CREATE TABLE IF NOT EXISTS erp.presupuesto_baselines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL REFERENCES core.empresas (id),
  proyecto_id uuid NOT NULL UNIQUE REFERENCES dilesa.proyectos (id),
  total numeric NOT NULL DEFAULT 0,
  partidas_count integer NOT NULL DEFAULT 0,
  notas text,
  autorizado_por uuid NOT NULL,
  autorizado_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE erp.presupuesto_baselines IS
  'Presupuesto inicial autorizado (baseline) por proyecto — v1: UNIQUE(proyecto_id), sin re-baseline. Inmutable: se crea SOLO via erp.fn_presupuesto_baseline_autorizar (sin grants de escritura directa). Iniciativa dilesa-presupuesto-baseline.';

CREATE TABLE IF NOT EXISTS erp.presupuesto_baseline_partidas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  baseline_id uuid NOT NULL REFERENCES erp.presupuesto_baselines (id) ON DELETE CASCADE,
  empresa_id uuid NOT NULL REFERENCES core.empresas (id),
  partida_id uuid NOT NULL REFERENCES erp.presupuesto_partidas (id),
  monto_baseline numeric NOT NULL DEFAULT 0,
  -- Snapshot descriptivo: si la partida se reclasifica después, el
  -- baseline conserva cómo se veía al congelar.
  concepto_texto text,
  etapa text,
  UNIQUE (baseline_id, partida_id)
);

COMMENT ON TABLE erp.presupuesto_baseline_partidas IS
  'Snapshot por partida del presupuesto inicial. Partidas creadas después del baseline NO aparecen aquí (su baseline es 0; nacen con orden de cambio aditiva).';

CREATE INDEX IF NOT EXISTS presupuesto_baseline_partidas_partida_idx
  ON erp.presupuesto_baseline_partidas (partida_id);

-- ─── 2. Órdenes de cambio (aditivas / deductivas) ─────────────────────

CREATE TABLE IF NOT EXISTS erp.presupuesto_cambios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL REFERENCES core.empresas (id),
  proyecto_id uuid NOT NULL REFERENCES dilesa.proyectos (id),
  partida_id uuid NOT NULL REFERENCES erp.presupuesto_partidas (id),

  tipo text NOT NULL CHECK (tipo IN ('aditiva', 'deductiva')),
  -- Delta siempre positivo; el signo lo da `tipo`.
  monto_delta numeric NOT NULL CHECK (monto_delta > 0),

  -- Motivo estructurado (decisión D4): categoría + texto obligatorio.
  motivo_categoria text NOT NULL CHECK (
    motivo_categoria IN ('alcance', 'precio_mercado', 'error_estimacion', 'adjudicacion', 'reasignacion', 'otro')
  ),
  motivo text NOT NULL CHECK (length(btrim(motivo)) > 0),

  estado text NOT NULL DEFAULT 'solicitada' CHECK (
    estado IN ('solicitada', 'autorizada', 'rechazada', 'cancelada')
  ),

  solicitado_por uuid NOT NULL,
  solicitado_at timestamptz NOT NULL DEFAULT now(),
  resuelto_por uuid,
  resuelto_at timestamptz,
  motivo_rechazo text,
  cancelada_at timestamptz,
  cancelada_por uuid,

  -- Snapshot local del efecto al autorizar (además de core.audit_log).
  monto_aprobado_antes numeric,
  monto_aprobado_despues numeric,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE erp.presupuesto_cambios IS
  'Orden de cambio presupuestal: TODO movimiento de presupuesto_aprobado post-baseline pasa por aquí (aditiva o deductiva, ambas con autorización de Dirección — decisiones D2/D3). La orden es el expediente de la decisión: motivo estructurado + adjuntos en erp.adjuntos (entidad_tipo=presupuesto_cambios). Resolución SOLO via erp.fn_presupuesto_cambio_resolver.';
COMMENT ON COLUMN erp.presupuesto_cambios.monto_delta IS
  'Siempre > 0; el signo lo da `tipo` (aditiva suma, deductiva resta).';

CREATE INDEX IF NOT EXISTS presupuesto_cambios_proyecto_estado_idx
  ON erp.presupuesto_cambios (proyecto_id, estado);
CREATE INDEX IF NOT EXISTS presupuesto_cambios_partida_idx
  ON erp.presupuesto_cambios (partida_id);
CREATE INDEX IF NOT EXISTS presupuesto_cambios_empresa_idx
  ON erp.presupuesto_cambios (empresa_id);

-- ─── 3. RLS + grants ──────────────────────────────────────────────────
-- Baselines: lectura para miembros; CERO escritura directa (la RPC
-- SECURITY DEFINER es el único camino — inmutabilidad por construcción).
-- Cambios: miembros leen y solicitan/editan; resolver es solo-RPC
-- (trigger guard abajo).

ALTER TABLE erp.presupuesto_baselines ENABLE ROW LEVEL SECURITY;
ALTER TABLE erp.presupuesto_baseline_partidas ENABLE ROW LEVEL SECURITY;
ALTER TABLE erp.presupuesto_cambios ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='erp' AND tablename='presupuesto_baselines' AND policyname='presupuesto_baselines_select') THEN
    CREATE POLICY presupuesto_baselines_select ON erp.presupuesto_baselines FOR SELECT TO authenticated
      USING (core.fn_has_empresa(empresa_id) OR core.fn_is_admin());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='erp' AND tablename='presupuesto_baseline_partidas' AND policyname='presupuesto_baseline_partidas_select') THEN
    CREATE POLICY presupuesto_baseline_partidas_select ON erp.presupuesto_baseline_partidas FOR SELECT TO authenticated
      USING (core.fn_has_empresa(empresa_id) OR core.fn_is_admin());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='erp' AND tablename='presupuesto_cambios' AND policyname='presupuesto_cambios_select') THEN
    CREATE POLICY presupuesto_cambios_select ON erp.presupuesto_cambios FOR SELECT TO authenticated
      USING (core.fn_has_empresa(empresa_id) OR core.fn_is_admin());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='erp' AND tablename='presupuesto_cambios' AND policyname='presupuesto_cambios_modify') THEN
    CREATE POLICY presupuesto_cambios_modify ON erp.presupuesto_cambios FOR ALL TO authenticated
      USING (core.fn_has_empresa(empresa_id) OR core.fn_is_admin())
      WITH CHECK (core.fn_has_empresa(empresa_id) OR core.fn_is_admin());
  END IF;
END $$;

GRANT SELECT ON erp.presupuesto_baselines TO authenticated;
GRANT SELECT ON erp.presupuesto_baseline_partidas TO authenticated;
-- Sin DELETE: una solicitud se retira con estado='cancelada', no se borra.
GRANT SELECT, INSERT, UPDATE ON erp.presupuesto_cambios TO authenticated;

-- ─── 4. Gate Dirección server-side ────────────────────────────────────
-- admin global (core.usuarios.rol) O rol "Dirección" activo en la
-- empresa (core.roles + core.usuarios_empresas). Mismo criterio que
-- EffectiveUser.direccionEmpresaIds en la capa app.

CREATE OR REPLACE FUNCTION erp.fn_es_direccion(p_empresa_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = core, public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM core.usuarios u
    WHERE u.id = auth.uid() AND u.activo AND u.rol = 'admin'
  ) OR EXISTS (
    SELECT 1
    FROM core.usuarios_empresas ue
    JOIN core.roles r ON r.id = ue.rol_id
    WHERE ue.usuario_id = auth.uid()
      AND ue.empresa_id = p_empresa_id
      AND ue.activo
      AND r.empresa_id = p_empresa_id
      AND r.nombre ILIKE 'direcci%n'
  );
$$;

COMMENT ON FUNCTION erp.fn_es_direccion IS
  'Gate de autorización presupuestal: admin global O rol "Dirección" activo en la empresa. Espejo SQL de EffectiveUser.direccionEmpresaIds.';

-- ─── 5. Trigger guard: el monto vigente solo se mueve via RPC ─────────
-- Post-baseline, presupuesto_aprobado queda bloqueado a edición directa
-- (el costeo escribe desde el browser con RLS por-empresa; sin esto el
-- gobierno sería bypasseable). El flag de sesión `app.presupuesto_gate`
-- (set_config local a la transacción) lo setean SOLO las RPCs.

CREATE OR REPLACE FUNCTION erp.fn_presupuesto_partidas_guard()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_cambia_monto boolean;
  v_soft_delete boolean;
  v_cambia_proyecto boolean;
BEGIN
  -- INSERT: una partida nueva en proyecto con baseline nace en $0 — su
  -- presupuesto se asigna con una orden de cambio aditiva (así también
  -- queda con motivo + expediente). monto_estimado sí puede traer valor.
  IF TG_OP = 'INSERT' THEN
    IF COALESCE(NEW.presupuesto_aprobado, 0) <> 0
       AND COALESCE(current_setting('app.presupuesto_gate', true), '') <> 'on'
       AND NEW.proyecto_id IS NOT NULL
       AND EXISTS (SELECT 1 FROM erp.presupuesto_baselines b WHERE b.proyecto_id = NEW.proyecto_id) THEN
      RAISE EXCEPTION 'El proyecto tiene presupuesto inicial autorizado: la partida nueva nace en $0 y su presupuesto se asigna con una orden de cambio aditiva (erp.presupuesto_cambios).'
        USING ERRCODE = 'P0001';
    END IF;
    RETURN NEW;
  END IF;

  v_cambia_monto := NEW.presupuesto_aprobado IS DISTINCT FROM OLD.presupuesto_aprobado;
  v_soft_delete := NEW.deleted_at IS NOT NULL AND OLD.deleted_at IS NULL;
  v_cambia_proyecto := NEW.proyecto_id IS DISTINCT FROM OLD.proyecto_id;

  IF NOT (v_cambia_monto OR v_soft_delete OR v_cambia_proyecto) THEN
    RETURN NEW;
  END IF;

  IF COALESCE(current_setting('app.presupuesto_gate', true), '') = 'on' THEN
    RETURN NEW;
  END IF;

  -- Mover una partida de proyecto saca/mete presupuesto sin orden de
  -- cambio — bloqueado si cualquiera de los dos proyectos tiene baseline.
  IF v_cambia_proyecto AND EXISTS (
    SELECT 1 FROM erp.presupuesto_baselines b
    WHERE b.proyecto_id IN (OLD.proyecto_id, NEW.proyecto_id)
  ) THEN
    RAISE EXCEPTION 'No se puede mover la partida de proyecto: hay presupuesto inicial autorizado (baseline). Usa órdenes de cambio.'
      USING ERRCODE = 'P0001';
  END IF;

  IF OLD.proyecto_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM erp.presupuesto_baselines b WHERE b.proyecto_id = OLD.proyecto_id
  ) THEN
    RETURN NEW; -- sin baseline: formación, edición libre
  END IF;

  IF v_cambia_monto THEN
    RAISE EXCEPTION 'El proyecto tiene presupuesto inicial autorizado: presupuesto_aprobado solo se modifica con una orden de cambio autorizada por Dirección (erp.presupuesto_cambios).'
      USING ERRCODE = 'P0001';
  END IF;

  IF v_soft_delete AND COALESCE(OLD.presupuesto_aprobado, 0) <> 0 THEN
    RAISE EXCEPTION 'Partida con presupuesto vigente en proyecto con baseline: llévala a $0 con una orden de cambio deductiva antes de eliminarla.'
      USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_presupuesto_partidas_guard ON erp.presupuesto_partidas;
CREATE TRIGGER trg_presupuesto_partidas_guard
  BEFORE INSERT OR UPDATE ON erp.presupuesto_partidas
  FOR EACH ROW EXECUTE FUNCTION erp.fn_presupuesto_partidas_guard();

-- Guard de las órdenes: resolver (autorizada/rechazada) es solo-RPC;
-- las resueltas/canceladas son inmutables (expediente histórico). Lo
-- editable por miembros: una orden `solicitada` (corregirla o
-- cancelarla).

CREATE OR REPLACE FUNCTION erp.fn_presupuesto_cambios_guard()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  -- Integridad al solicitar: la partida debe existir, estar activa y
  -- pertenecer al proyecto/empresa declarados; las órdenes solo tienen
  -- sentido en proyectos con baseline (antes, la edición es libre).
  IF TG_OP = 'INSERT' THEN
    IF NOT EXISTS (
      SELECT 1 FROM erp.presupuesto_partidas pp
      WHERE pp.id = NEW.partida_id
        AND pp.deleted_at IS NULL
        AND pp.proyecto_id = NEW.proyecto_id
        AND pp.empresa_id = NEW.empresa_id
    ) THEN
      RAISE EXCEPTION 'La partida no existe, no está activa o no pertenece al proyecto/empresa de la orden.'
        USING ERRCODE = 'P0001';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM erp.presupuesto_baselines b WHERE b.proyecto_id = NEW.proyecto_id) THEN
      RAISE EXCEPTION 'El proyecto aún no tiene presupuesto inicial autorizado: edita la partida directamente (las órdenes de cambio aplican post-baseline).'
        USING ERRCODE = 'P0001';
    END IF;
    IF NEW.estado <> 'solicitada' THEN
      RAISE EXCEPTION 'Una orden de cambio nace en estado solicitada.'
        USING ERRCODE = 'P0001';
    END IF;
    RETURN NEW;
  END IF;

  -- UPDATE
  IF COALESCE(current_setting('app.presupuesto_gate', true), '') = 'on' THEN
    RETURN NEW;
  END IF;
  IF OLD.estado <> 'solicitada' THEN
    RAISE EXCEPTION 'La orden de cambio ya fue resuelta (estado: %) y es inmutable.', OLD.estado
      USING ERRCODE = 'P0001';
  END IF;
  IF NEW.estado NOT IN ('solicitada', 'cancelada') THEN
    RAISE EXCEPTION 'Autorizar o rechazar una orden de cambio es exclusivo de la RPC erp.fn_presupuesto_cambio_resolver.'
      USING ERRCODE = 'P0001';
  END IF;
  IF NEW.resuelto_por IS NOT NULL OR NEW.resuelto_at IS NOT NULL
     OR NEW.monto_aprobado_antes IS NOT NULL OR NEW.monto_aprobado_despues IS NOT NULL THEN
    RAISE EXCEPTION 'Los campos de resolución los escribe la RPC erp.fn_presupuesto_cambio_resolver.'
      USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_presupuesto_cambios_guard ON erp.presupuesto_cambios;
CREATE TRIGGER trg_presupuesto_cambios_guard
  BEFORE INSERT OR UPDATE ON erp.presupuesto_cambios
  FOR EACH ROW EXECUTE FUNCTION erp.fn_presupuesto_cambios_guard();

-- ─── 6. RPC: autorizar presupuesto inicial (baseline) ─────────────────

CREATE OR REPLACE FUNCTION erp.fn_presupuesto_baseline_autorizar(
  p_proyecto_id uuid,
  p_notas text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = erp, core, public
AS $$
DECLARE
  v_empresa_id uuid;
  v_baseline_id uuid;
  v_total numeric;
  v_count integer;
  v_preliminares integer;
BEGIN
  IF p_proyecto_id IS NULL THEN
    RAISE EXCEPTION 'p_proyecto_id requerido';
  END IF;

  -- Lock de las partidas activas del proyecto: el snapshot se congela
  -- sobre un estado consistente.
  PERFORM 1 FROM erp.presupuesto_partidas
    WHERE proyecto_id = p_proyecto_id AND deleted_at IS NULL
    FOR UPDATE;

  SELECT empresa_id INTO v_empresa_id
  FROM erp.presupuesto_partidas
  WHERE proyecto_id = p_proyecto_id AND deleted_at IS NULL
  LIMIT 1;
  IF v_empresa_id IS NULL THEN
    RAISE EXCEPTION 'El proyecto no tiene partidas activas; no hay presupuesto que autorizar.';
  END IF;

  IF NOT erp.fn_es_direccion(v_empresa_id) THEN
    RAISE EXCEPTION 'Solo Dirección puede autorizar el presupuesto inicial.';
  END IF;

  IF EXISTS (SELECT 1 FROM erp.presupuesto_baselines WHERE proyecto_id = p_proyecto_id) THEN
    RAISE EXCEPTION 'El proyecto ya tiene presupuesto inicial autorizado (v1 no contempla re-baseline).';
  END IF;

  SELECT count(*) INTO v_preliminares
  FROM erp.presupuesto_partidas
  WHERE proyecto_id = p_proyecto_id AND deleted_at IS NULL AND estado = 'preliminar';
  IF v_preliminares > 0 THEN
    RAISE EXCEPTION 'Hay % partida(s) en estado preliminar: autorízalas o descártalas antes de congelar el presupuesto inicial.', v_preliminares;
  END IF;

  INSERT INTO erp.presupuesto_baselines (empresa_id, proyecto_id, notas, autorizado_por)
  VALUES (v_empresa_id, p_proyecto_id, NULLIF(btrim(COALESCE(p_notas, '')), ''), auth.uid())
  RETURNING id INTO v_baseline_id;

  -- Normaliza el vigente y congela el snapshot: el monto congelado es
  -- COALESCE(presupuesto_aprobado, monto_estimado, 0) — cubre partidas
  -- capturadas solo con estimado durante la formación. El invariante
  -- arranca limpio: vigente = baseline + 0 cambios.
  PERFORM set_config('app.presupuesto_gate', 'on', true);
  WITH norm AS (
    UPDATE erp.presupuesto_partidas pp
      SET presupuesto_aprobado = COALESCE(pp.presupuesto_aprobado, pp.monto_estimado, 0),
          updated_at = now()
      WHERE pp.proyecto_id = p_proyecto_id AND pp.deleted_at IS NULL
      RETURNING pp.id, pp.empresa_id, pp.presupuesto_aprobado, pp.concepto_texto, pp.etapa
  )
  INSERT INTO erp.presupuesto_baseline_partidas
    (baseline_id, empresa_id, partida_id, monto_baseline, concepto_texto, etapa)
  SELECT v_baseline_id, n.empresa_id, n.id, COALESCE(n.presupuesto_aprobado, 0), n.concepto_texto, n.etapa
  FROM norm n;
  PERFORM set_config('app.presupuesto_gate', '', true);

  SELECT COALESCE(SUM(monto_baseline), 0), count(*) INTO v_total, v_count
  FROM erp.presupuesto_baseline_partidas
  WHERE baseline_id = v_baseline_id;

  UPDATE erp.presupuesto_baselines
    SET total = v_total, partidas_count = v_count
    WHERE id = v_baseline_id;

  INSERT INTO core.audit_log (empresa_id, usuario_id, accion, tabla, registro_id, datos_nuevos)
  VALUES (v_empresa_id, auth.uid(), 'presupuesto_baseline_autorizado', 'erp.presupuesto_baselines', v_baseline_id,
    jsonb_build_object('proyecto_id', p_proyecto_id, 'total', v_total, 'partidas', v_count, 'notas', p_notas));

  RETURN v_baseline_id;
END;
$$;

COMMENT ON FUNCTION erp.fn_presupuesto_baseline_autorizar IS
  'Congela el presupuesto inicial del proyecto (baseline, decisión D1): snapshot de todas las partidas activas + normaliza presupuesto_aprobado. Gate Dirección + audit_log. Falla si ya hay baseline o si quedan partidas preliminares.';

-- ─── 7. RPC: resolver orden de cambio ─────────────────────────────────

CREATE OR REPLACE FUNCTION erp.fn_presupuesto_cambio_resolver(
  p_cambio_id uuid,
  p_decision text,
  p_motivo_rechazo text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = erp, core, public
AS $$
DECLARE
  v_cambio erp.presupuesto_cambios%ROWTYPE;
  v_partida erp.presupuesto_partidas%ROWTYPE;
  v_antes numeric;
  v_despues numeric;
  v_delta numeric;
BEGIN
  IF p_decision NOT IN ('autorizada', 'rechazada') THEN
    RAISE EXCEPTION 'Decisión inválida: % (esperado: autorizada | rechazada)', p_decision;
  END IF;

  SELECT * INTO v_cambio FROM erp.presupuesto_cambios WHERE id = p_cambio_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Orden de cambio no encontrada.';
  END IF;
  IF v_cambio.estado <> 'solicitada' THEN
    RAISE EXCEPTION 'La orden de cambio ya fue resuelta (estado: %).', v_cambio.estado;
  END IF;

  IF NOT erp.fn_es_direccion(v_cambio.empresa_id) THEN
    RAISE EXCEPTION 'Solo Dirección puede resolver órdenes de cambio.';
  END IF;

  PERFORM set_config('app.presupuesto_gate', 'on', true);

  IF p_decision = 'rechazada' THEN
    IF p_motivo_rechazo IS NULL OR length(btrim(p_motivo_rechazo)) = 0 THEN
      RAISE EXCEPTION 'El rechazo requiere motivo.';
    END IF;
    UPDATE erp.presupuesto_cambios
      SET estado = 'rechazada',
          resuelto_por = auth.uid(),
          resuelto_at = now(),
          motivo_rechazo = p_motivo_rechazo,
          updated_at = now()
      WHERE id = p_cambio_id;
    PERFORM set_config('app.presupuesto_gate', '', true);

    INSERT INTO core.audit_log (empresa_id, usuario_id, accion, tabla, registro_id, datos_nuevos)
    VALUES (v_cambio.empresa_id, auth.uid(), 'presupuesto_cambio_rechazado', 'erp.presupuesto_cambios', p_cambio_id,
      jsonb_build_object('partida_id', v_cambio.partida_id, 'proyecto_id', v_cambio.proyecto_id,
        'tipo', v_cambio.tipo, 'delta', v_cambio.monto_delta, 'motivo_rechazo', p_motivo_rechazo));

    RETURN jsonb_build_object('estado', 'rechazada');
  END IF;

  -- p_decision = 'autorizada': aplica el delta al vigente.
  SELECT * INTO v_partida FROM erp.presupuesto_partidas WHERE id = v_cambio.partida_id FOR UPDATE;
  IF NOT FOUND OR v_partida.deleted_at IS NOT NULL THEN
    RAISE EXCEPTION 'La partida de la orden ya no está activa.';
  END IF;

  v_antes := COALESCE(v_partida.presupuesto_aprobado, 0);
  v_delta := CASE v_cambio.tipo WHEN 'aditiva' THEN v_cambio.monto_delta ELSE -v_cambio.monto_delta END;
  v_despues := v_antes + v_delta;
  IF v_despues < 0 THEN
    RAISE EXCEPTION 'La deductiva (%) dejaría la partida en negativo (vigente actual: %).', v_cambio.monto_delta, v_antes;
  END IF;

  UPDATE erp.presupuesto_partidas
    SET presupuesto_aprobado = v_despues, updated_at = now()
    WHERE id = v_partida.id;

  UPDATE erp.presupuesto_cambios
    SET estado = 'autorizada',
        resuelto_por = auth.uid(),
        resuelto_at = now(),
        monto_aprobado_antes = v_antes,
        monto_aprobado_despues = v_despues,
        updated_at = now()
    WHERE id = p_cambio_id;

  PERFORM set_config('app.presupuesto_gate', '', true);

  INSERT INTO core.audit_log (empresa_id, usuario_id, accion, tabla, registro_id, datos_anteriores, datos_nuevos)
  VALUES (v_cambio.empresa_id, auth.uid(), 'presupuesto_cambio_autorizado', 'erp.presupuesto_cambios', p_cambio_id,
    jsonb_build_object('presupuesto_aprobado', v_antes),
    jsonb_build_object('presupuesto_aprobado', v_despues, 'partida_id', v_cambio.partida_id,
      'proyecto_id', v_cambio.proyecto_id, 'tipo', v_cambio.tipo, 'delta', v_cambio.monto_delta,
      'motivo_categoria', v_cambio.motivo_categoria));

  RETURN jsonb_build_object('estado', 'autorizada', 'antes', v_antes, 'despues', v_despues);
END;
$$;

COMMENT ON FUNCTION erp.fn_presupuesto_cambio_resolver IS
  'Resuelve una orden de cambio (autorizada|rechazada) con gate Dirección. Al autorizar aplica el delta a presupuesto_aprobado (vía flag de sesión que el trigger guard respeta) y registra antes/después en core.audit_log. Rechazo requiere motivo.';

-- ─── 8. Vista de reconciliación ───────────────────────────────────────
-- Invariante por partida (solo proyectos con baseline):
--   vigente = monto_baseline + Σ cambios autorizados  →  drift = 0.
-- Cualquier fila con drift ≠ 0 es un hallazgo (escritura imprevista).

CREATE OR REPLACE VIEW erp.v_presupuesto_reconciliacion
WITH (security_invoker = on) AS
SELECT
  pp.id AS partida_id,
  pp.empresa_id,
  pp.proyecto_id,
  b.id AS baseline_id,
  pp.concepto_texto,
  pp.etapa,
  COALESCE(bp.monto_baseline, 0) AS monto_baseline,
  COALESCE(cam.cambios_netos, 0) AS cambios_netos,
  COALESCE(pp.presupuesto_aprobado, 0) AS vigente,
  COALESCE(pp.presupuesto_aprobado, 0)
    - (COALESCE(bp.monto_baseline, 0) + COALESCE(cam.cambios_netos, 0)) AS drift
FROM erp.presupuesto_partidas pp
JOIN erp.presupuesto_baselines b ON b.proyecto_id = pp.proyecto_id
LEFT JOIN erp.presupuesto_baseline_partidas bp
  ON bp.baseline_id = b.id AND bp.partida_id = pp.id
LEFT JOIN LATERAL (
  SELECT SUM(CASE c.tipo WHEN 'aditiva' THEN c.monto_delta ELSE -c.monto_delta END) AS cambios_netos
  FROM erp.presupuesto_cambios c
  WHERE c.partida_id = pp.id AND c.estado = 'autorizada'
) cam ON true
WHERE pp.deleted_at IS NULL;

COMMENT ON VIEW erp.v_presupuesto_reconciliacion IS
  'Reconciliación del gobierno presupuestal: vigente vs (baseline + Σ órdenes autorizadas) por partida. drift ≠ 0 = escritura fuera del flujo (hallazgo). Solo proyectos con baseline.';

NOTIFY pgrst, 'reload schema';

COMMIT;
