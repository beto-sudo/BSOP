-- ╭──────────────────────────────────────────────────────────────────╮
-- │  20260610223000_dilesa_contratos_estimaciones_s1                  │
-- │                                                                    │
-- │  Sprint 1 de `dilesa-contratos-estimaciones`. La estimación de    │
-- │  contrato de obra es el DEVENGO autorizado (D4); la factura es    │
-- │  flexible (D5): por-estimación (actual) o total-del-contrato.     │
-- │                                                                    │
-- │  1. erp.facturas.contrato_id — la factura total se liga directo   │
-- │     al contrato; las facturas por estimación lo heredan           │
-- │     (backfill vía obra_estimacion_id). También heredan partida_id │
-- │     del contrato para que la capa "pagado" fluya a la partida.    │
-- │  2. dilesa.obra_estimaciones — ciclo borrador → autorizada        │
-- │     (Dirección, D2) → pagada (+ cancelada existente). Backfill:   │
-- │     históricas → autorizada (ya operaron); con factura pagada →   │
-- │     pagada. Guard trigger: estado/montos inmutables post-         │
-- │     autorización salvo vía RPC (flag app.obra_estimacion_gate).   │
-- │  3. RPC dilesa.obra_estimacion_autorizar — gate Dirección         │
-- │     (erp.fn_es_direccion, de dilesa-presupuesto-baseline) +       │
-- │     core.audit_log. obra_estimacion_cancelar aprende estado.      │
-- │  4. erp.cxp_pagos.obra_estimacion_id — liga pago ↔ estimación.    │
-- │     UNIQUE parcial (1 pago activo por estimación, anti-duplicado) │
-- │     + integridad (solo estimaciones autorizadas) + sync: pago     │
-- │     pagado → estimación pagada; reversa → autorizada.             │
-- │  5. erp.v_partida_control — la capa "ejercido" de partidas con    │
-- │     contrato pasa a Σ estimaciones autorizadas (avance real, no   │
-- │     documentos fiscales). Facturas ligadas a contrato/estimación  │
-- │     salen de ejercido (siguen alimentando "pagado"); gasto        │
-- │     directo y OC no cambian.                                      │
-- │                                                                    │
-- │  Nota de transición: cxp_factura_desde_estimacion ahora exige     │
-- │  estimación autorizada — aplicar esta migración junto con la UI   │
-- │  de autorización (S2) para no frenar la emisión de estimaciones   │
-- │  nuevas. Las existentes quedan autorizadas por el backfill.       │
-- ╰──────────────────────────────────────────────────────────────────╯

BEGIN;

-- ─── 1. erp.facturas.contrato_id (D5: factura flexible) ───────────────

ALTER TABLE erp.facturas
  ADD COLUMN IF NOT EXISTS contrato_id uuid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'facturas_contrato_id_fkey'
  ) THEN
    ALTER TABLE erp.facturas
      ADD CONSTRAINT facturas_contrato_id_fkey
      FOREIGN KEY (contrato_id) REFERENCES dilesa.contratos_construccion(id) ON DELETE SET NULL;
  END IF;
END $$;

COMMENT ON COLUMN erp.facturas.contrato_id IS
  'Contrato de obra (dilesa.contratos_construccion) al que pertenece la factura. Factura TOTAL del contrato: contrato_id sin obra_estimacion_id. Factura por estimación: ambos (heredado). Iniciativa dilesa-contratos-estimaciones, D5.';

CREATE INDEX IF NOT EXISTS idx_facturas_contrato_id
  ON erp.facturas (contrato_id)
  WHERE contrato_id IS NOT NULL;

-- Backfill: las facturas por estimación heredan el contrato de su estimación.
UPDATE erp.facturas f
SET contrato_id = e.contrato_id
FROM dilesa.obra_estimaciones e
WHERE f.obra_estimacion_id = e.id
  AND f.contrato_id IS NULL;

-- Backfill: heredan también la partida del contrato (ADR-042: contrato 1:1
-- partida) — así sus pagos (cxp_pago_aplicaciones) cuentan en la capa
-- "pagado" de v_partida_control. Sin esto, el pago de obra es invisible
-- para el control presupuestal.
UPDATE erp.facturas f
SET partida_id = c.partida_id
FROM dilesa.contratos_construccion c
WHERE f.contrato_id = c.id
  AND f.partida_id IS NULL
  AND c.partida_id IS NOT NULL;

-- ─── 2. Ciclo de estados en dilesa.obra_estimaciones (D4) ─────────────

ALTER TABLE dilesa.obra_estimaciones
  ADD COLUMN IF NOT EXISTS estado text NOT NULL DEFAULT 'borrador',
  ADD COLUMN IF NOT EXISTS autorizada_por uuid,
  ADD COLUMN IF NOT EXISTS autorizada_at timestamptz,
  ADD COLUMN IF NOT EXISTS pagada_at timestamptz;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'obra_estimaciones_estado_check'
  ) THEN
    ALTER TABLE dilesa.obra_estimaciones
      ADD CONSTRAINT obra_estimaciones_estado_check
      CHECK (estado IN ('borrador', 'autorizada', 'pagada', 'cancelada'));
  END IF;
END $$;

COMMENT ON COLUMN dilesa.obra_estimaciones.estado IS
  'borrador → autorizada (Dirección, vía dilesa.obra_estimacion_autorizar) → pagada (cuando su pago CxP se ejecuta). cancelada vía obra_estimacion_cancelar. El devengo (capa ejercido de v_partida_control) = autorizada + pagada. D2/D4 de dilesa-contratos-estimaciones.';
COMMENT ON COLUMN dilesa.obra_estimaciones.autorizada_por IS
  'Quién autorizó el devengo (Dirección). NULL en históricas pre-gobierno (backfill 2026-06: nacieron autorizadas).';

-- Backfill (ANTES del guard trigger): las históricas ya operaron →
-- autorizada; si su factura activa ya está pagada → pagada; canceladas →
-- cancelada. autorizada_por queda NULL (pre-gobierno, documentado arriba).
UPDATE dilesa.obra_estimaciones e
SET estado = CASE
  WHEN e.cancelada_at IS NOT NULL THEN 'cancelada'
  WHEN EXISTS (
    SELECT 1 FROM erp.facturas f
    WHERE f.obra_estimacion_id = e.id
      AND f.cancelada_at IS NULL
      AND f.estado_cxp = 'pagada'
  ) THEN 'pagada'
  ELSE 'autorizada'
END
WHERE e.estado = 'borrador';

-- pagada_at best-effort para las backfilleadas a 'pagada': fecha del último
-- pago ejecutado aplicado a su factura.
UPDATE dilesa.obra_estimaciones e
SET pagada_at = q.ultimo_pago
FROM (
  SELECT f.obra_estimacion_id AS est_id, max(p.pagado_at) AS ultimo_pago
  FROM erp.facturas f
  JOIN erp.cxp_pago_aplicaciones a ON a.factura_id = f.id
  JOIN erp.cxp_pagos p ON p.id = a.pago_id AND p.estado = 'pagado'
  WHERE f.obra_estimacion_id IS NOT NULL
    AND f.cancelada_at IS NULL
  GROUP BY f.obra_estimacion_id
) q
WHERE e.id = q.est_id
  AND e.estado = 'pagada'
  AND e.pagada_at IS NULL;

-- Índice para la capa ejercido de v_partida_control (suma por contrato).
CREATE INDEX IF NOT EXISTS obra_estimaciones_contrato_estado_idx
  ON dilesa.obra_estimaciones (contrato_id, estado)
  WHERE deleted_at IS NULL;

-- ─── 3. Guard: el ciclo solo se mueve vía RPC ──────────────────────────
-- La RLS de obra_estimaciones permite escribir a cualquier miembro de la
-- empresa (la captura es browser-direct); sin guard, el gobierno sería
-- bypasseable. El flag `app.obra_estimacion_gate` (set_config local a la
-- transacción) lo setean SOLO las RPCs y el sync de pago.

CREATE OR REPLACE FUNCTION dilesa.fn_obra_estimaciones_guard()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.estado <> 'borrador'
       AND COALESCE(current_setting('app.obra_estimacion_gate', true), '') <> 'on' THEN
      RAISE EXCEPTION 'Una estimación nace en borrador; la autoriza Dirección (dilesa.obra_estimacion_autorizar).'
        USING ERRCODE = 'P0001';
    END IF;
    RETURN NEW;
  END IF;

  -- UPDATE
  IF COALESCE(current_setting('app.obra_estimacion_gate', true), '') = 'on' THEN
    RETURN NEW;
  END IF;

  IF OLD.estado = 'cancelada' THEN
    RAISE EXCEPTION 'La estimación está cancelada y es inmutable.'
      USING ERRCODE = 'P0001';
  END IF;

  IF NEW.estado IS DISTINCT FROM OLD.estado THEN
    RAISE EXCEPTION 'El estado de la estimación solo cambia vía RPC: autorizar (Dirección), cancelar con motivo, o la ejecución de su pago en CxP.'
      USING ERRCODE = 'P0001';
  END IF;

  IF NEW.autorizada_por IS DISTINCT FROM OLD.autorizada_por
     OR NEW.autorizada_at IS DISTINCT FROM OLD.autorizada_at
     OR NEW.pagada_at IS DISTINCT FROM OLD.pagada_at THEN
    RAISE EXCEPTION 'Los campos de autorización/pago los escriben las RPCs.'
      USING ERRCODE = 'P0001';
  END IF;

  IF OLD.estado IN ('autorizada', 'pagada') THEN
    -- Devengo autorizado: el monto y su sustancia son inmutables. Para
    -- corregir: cancelar con motivo + capturar de nuevo. Editables quedan
    -- los descriptivos (etiqueta, orden, nota_pago, factura_ref).
    IF NEW.monto_total IS DISTINCT FROM OLD.monto_total
       OR NEW.subtotal IS DISTINCT FROM OLD.subtotal
       OR NEW.iva IS DISTINCT FROM OLD.iva
       OR NEW.iva_tasa IS DISTINCT FROM OLD.iva_tasa
       OR NEW.retencion IS DISTINCT FROM OLD.retencion
       OR NEW.es_anticipo IS DISTINCT FROM OLD.es_anticipo
       OR NEW.es_finiquito IS DISTINCT FROM OLD.es_finiquito
       OR NEW.fecha IS DISTINCT FROM OLD.fecha
       OR NEW.contrato_id IS DISTINCT FROM OLD.contrato_id THEN
      RAISE EXCEPTION 'La estimación ya está autorizada (es devengo del contrato): montos, fecha y contrato son inmutables. Cancélala con motivo y captura una nueva.'
        USING ERRCODE = 'P0001';
    END IF;
    IF NEW.deleted_at IS NOT NULL AND OLD.deleted_at IS NULL THEN
      RAISE EXCEPTION 'Una estimación autorizada no se elimina: cancélala con motivo (queda visible y auditable).'
        USING ERRCODE = 'P0001';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_obra_estimaciones_guard ON dilesa.obra_estimaciones;
CREATE TRIGGER trg_obra_estimaciones_guard
  BEFORE INSERT OR UPDATE ON dilesa.obra_estimaciones
  FOR EACH ROW EXECUTE FUNCTION dilesa.fn_obra_estimaciones_guard();

-- ─── 4. RPC: autorizar estimación (gate Dirección, D2) ────────────────

CREATE OR REPLACE FUNCTION dilesa.obra_estimacion_autorizar(p_estimacion_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = dilesa, erp, core, public
AS $$
DECLARE
  v_est dilesa.obra_estimaciones%ROWTYPE;
BEGIN
  SELECT * INTO v_est FROM dilesa.obra_estimaciones WHERE id = p_estimacion_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Estimación no encontrada';
  END IF;
  IF v_est.deleted_at IS NOT NULL THEN
    RAISE EXCEPTION 'La estimación está eliminada';
  END IF;
  IF v_est.estado = 'cancelada' OR v_est.cancelada_at IS NOT NULL THEN
    RAISE EXCEPTION 'La estimación está cancelada';
  END IF;
  IF v_est.estado <> 'borrador' THEN
    RAISE EXCEPTION 'Solo una estimación en borrador se puede autorizar (estado actual: %)', v_est.estado;
  END IF;
  IF COALESCE(v_est.monto_total, 0) = 0 THEN
    RAISE EXCEPTION 'La estimación no tiene monto — captúralo antes de autorizar';
  END IF;
  IF NOT erp.fn_es_direccion(v_est.empresa_id) THEN
    RAISE EXCEPTION 'Solo Dirección puede autorizar estimaciones de contrato';
  END IF;

  PERFORM set_config('app.obra_estimacion_gate', 'on', true);
  UPDATE dilesa.obra_estimaciones
    SET estado = 'autorizada',
        autorizada_por = auth.uid(),
        autorizada_at = now(),
        updated_at = now()
    WHERE id = p_estimacion_id;
  PERFORM set_config('app.obra_estimacion_gate', '', true);

  INSERT INTO core.audit_log (empresa_id, usuario_id, accion, tabla, registro_id, datos_anteriores, datos_nuevos)
  VALUES (v_est.empresa_id, auth.uid(), 'obra_estimacion_autorizada', 'dilesa.obra_estimaciones', p_estimacion_id,
    jsonb_build_object('estado', v_est.estado),
    jsonb_build_object('estado', 'autorizada', 'contrato_id', v_est.contrato_id,
      'etiqueta', v_est.etiqueta, 'monto_total', v_est.monto_total));
END;
$$;

COMMENT ON FUNCTION dilesa.obra_estimacion_autorizar IS
  'Autoriza el devengo de una estimación de contrato de obra (borrador → autorizada). Gate Dirección (erp.fn_es_direccion) + core.audit_log. A partir de aquí cuenta en la capa ejercido de erp.v_partida_control y puede emitirse/pagarse en CxP. D2/D4 de dilesa-contratos-estimaciones.';

GRANT EXECUTE ON FUNCTION dilesa.obra_estimacion_autorizar(uuid) TO authenticated;

-- ─── 5. obra_estimacion_cancelar aprende el ciclo ─────────────────────
-- Cambios vs 20260607180000: setea estado='cancelada' (consistencia con el
-- ciclo), bloquea cancelar una 'pagada' (su pago ya se ejecutó: cancela el
-- pago primero) y bloquea si hay pago CxP activo ligado. Conserva el
-- gating original (admin O quien la capturó) + bloqueo por factura activa.

CREATE OR REPLACE FUNCTION dilesa.obra_estimacion_cancelar(
  p_estimacion_id uuid,
  p_motivo text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = dilesa, erp, core, public
AS $$
DECLARE
  v_est dilesa.obra_estimaciones%ROWTYPE;
  v_uid uuid := auth.uid();
BEGIN
  SELECT * INTO v_est FROM dilesa.obra_estimaciones WHERE id = p_estimacion_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Estimación no encontrada';
  END IF;
  IF v_est.deleted_at IS NOT NULL THEN
    RAISE EXCEPTION 'La estimación está eliminada';
  END IF;
  IF v_est.cancelada_at IS NOT NULL OR v_est.estado = 'cancelada' THEN
    RAISE EXCEPTION 'La estimación ya está cancelada';
  END IF;
  IF v_est.estado = 'pagada' THEN
    RAISE EXCEPTION 'La estimación ya está pagada. Cancela primero su pago en Cuentas por Pagar (la regresa a autorizada).';
  END IF;
  IF coalesce(btrim(p_motivo), '') = '' THEN
    RAISE EXCEPTION 'El motivo de cancelación es obligatorio';
  END IF;

  IF NOT (core.fn_is_admin() OR v_est.creado_por = v_uid) THEN
    RAISE EXCEPTION 'Solo un administrador o quien capturó la estimación puede cancelarla';
  END IF;

  IF EXISTS (
    SELECT 1 FROM erp.facturas f
    WHERE f.obra_estimacion_id = p_estimacion_id
      AND f.cancelada_at IS NULL
  ) THEN
    RAISE EXCEPTION 'La estimación ya fue emitida a Cuentas por Pagar. Cancela primero la factura ligada.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM erp.cxp_pagos p
    WHERE p.obra_estimacion_id = p_estimacion_id
      AND p.deleted_at IS NULL
      AND p.estado NOT IN ('rechazado', 'cancelado')
  ) THEN
    RAISE EXCEPTION 'La estimación tiene un pago CxP activo ligado. Cancela primero el pago.';
  END IF;

  PERFORM set_config('app.obra_estimacion_gate', 'on', true);
  UPDATE dilesa.obra_estimaciones
    SET estado = 'cancelada',
        cancelada_at = now(),
        cancelada_por = v_uid,
        motivo_cancelacion = btrim(p_motivo),
        updated_at = now()
    WHERE id = p_estimacion_id;
  PERFORM set_config('app.obra_estimacion_gate', '', true);

  INSERT INTO core.audit_log (empresa_id, usuario_id, accion, tabla, registro_id, datos_anteriores, datos_nuevos)
  VALUES (v_est.empresa_id, v_uid, 'obra_estimacion_cancelada', 'dilesa.obra_estimaciones', p_estimacion_id,
    jsonb_build_object('estado', v_est.estado),
    jsonb_build_object('estado', 'cancelada', 'contrato_id', v_est.contrato_id,
      'etiqueta', v_est.etiqueta, 'monto_total', v_est.monto_total, 'motivo', btrim(p_motivo)));
END;
$$;

-- ─── 6. erp.cxp_pagos.obra_estimacion_id (estimación → pago) ──────────

ALTER TABLE erp.cxp_pagos
  ADD COLUMN IF NOT EXISTS obra_estimacion_id uuid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'cxp_pagos_obra_estimacion_id_fkey'
  ) THEN
    ALTER TABLE erp.cxp_pagos
      ADD CONSTRAINT cxp_pagos_obra_estimacion_id_fkey
      FOREIGN KEY (obra_estimacion_id) REFERENCES dilesa.obra_estimaciones(id) ON DELETE SET NULL;
  END IF;
END $$;

COMMENT ON COLUMN erp.cxp_pagos.obra_estimacion_id IS
  'Estimación de contrato de obra que origina este pago. El pago se aplica a la factura que corresponda (propia de la estimación o la factura TOTAL del contrato); al ejecutarse, la estimación pasa a pagada (trigger sync). Anti-duplicado: 1 pago activo por estimación. Iniciativa dilesa-contratos-estimaciones.';

-- 1 pago ACTIVO por estimación (anti-duplicado). Re-programable si el
-- anterior se rechazó/canceló.
CREATE UNIQUE INDEX IF NOT EXISTS ux_cxp_pagos_obra_estimacion_activa
  ON erp.cxp_pagos (obra_estimacion_id)
  WHERE obra_estimacion_id IS NOT NULL
    AND deleted_at IS NULL
    AND estado NOT IN ('rechazado', 'cancelado');

-- Integridad al ligar: la estimación debe existir, ser de la misma empresa
-- y estar autorizada (no se programa pago de un borrador ni de cancelada).
CREATE OR REPLACE FUNCTION erp.fn_cxp_pago_obra_estimacion_integridad()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = erp, dilesa, public
AS $$
DECLARE
  v_est record;
BEGIN
  IF NEW.obra_estimacion_id IS NULL THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.obra_estimacion_id IS NOT DISTINCT FROM OLD.obra_estimacion_id THEN
    RETURN NEW;
  END IF;

  SELECT e.empresa_id, e.estado, e.deleted_at INTO v_est
  FROM dilesa.obra_estimaciones e
  WHERE e.id = NEW.obra_estimacion_id;
  IF NOT FOUND OR v_est.deleted_at IS NOT NULL THEN
    RAISE EXCEPTION 'La estimación ligada al pago no existe o está eliminada.'
      USING ERRCODE = 'P0001';
  END IF;
  IF v_est.empresa_id <> NEW.empresa_id THEN
    RAISE EXCEPTION 'La estimación pertenece a otra empresa.'
      USING ERRCODE = 'P0001';
  END IF;
  IF v_est.estado NOT IN ('autorizada', 'pagada') THEN
    RAISE EXCEPTION 'Solo se liga un pago a una estimación autorizada por Dirección (estado actual: %).', v_est.estado
      USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_cxp_pago_obra_estimacion_integridad ON erp.cxp_pagos;
CREATE TRIGGER trg_cxp_pago_obra_estimacion_integridad
  BEFORE INSERT OR UPDATE OF obra_estimacion_id ON erp.cxp_pagos
  FOR EACH ROW EXECUTE FUNCTION erp.fn_cxp_pago_obra_estimacion_integridad();

-- Sync del ciclo: el pago ejecutado marca su estimación como pagada; la
-- reversa (cancelar/rechazar un pago ejecutado) la regresa a autorizada.
-- SECURITY DEFINER: el UPDATE cruza a dilesa bajo el gate (no depende de
-- la RLS del usuario que ejecuta el pago).
CREATE OR REPLACE FUNCTION erp.fn_cxp_pago_sync_obra_estimacion()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = erp, dilesa, public
AS $$
DECLARE
  v_era_pagado boolean := false;
  v_es_pagado boolean := NEW.estado = 'pagado' AND NEW.deleted_at IS NULL;
BEGIN
  -- Si un pago ejecutado se re-apunta a otra estimación, la anterior se libera.
  IF TG_OP = 'UPDATE'
     AND OLD.obra_estimacion_id IS NOT NULL
     AND OLD.obra_estimacion_id IS DISTINCT FROM NEW.obra_estimacion_id
     AND OLD.estado = 'pagado' AND OLD.deleted_at IS NULL THEN
    PERFORM set_config('app.obra_estimacion_gate', 'on', true);
    UPDATE dilesa.obra_estimaciones
      SET estado = 'autorizada', pagada_at = NULL, updated_at = now()
      WHERE id = OLD.obra_estimacion_id AND estado = 'pagada';
    PERFORM set_config('app.obra_estimacion_gate', '', true);
  END IF;

  IF NEW.obra_estimacion_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.obra_estimacion_id IS NOT DISTINCT FROM NEW.obra_estimacion_id THEN
    v_era_pagado := OLD.estado = 'pagado' AND OLD.deleted_at IS NULL;
  END IF;

  IF v_es_pagado AND NOT v_era_pagado THEN
    PERFORM set_config('app.obra_estimacion_gate', 'on', true);
    UPDATE dilesa.obra_estimaciones
      SET estado = 'pagada',
          pagada_at = COALESCE(NEW.pagado_at, now()),
          updated_at = now()
      WHERE id = NEW.obra_estimacion_id AND estado = 'autorizada';
    PERFORM set_config('app.obra_estimacion_gate', '', true);
  ELSIF v_era_pagado AND NOT v_es_pagado THEN
    PERFORM set_config('app.obra_estimacion_gate', 'on', true);
    UPDATE dilesa.obra_estimaciones
      SET estado = 'autorizada', pagada_at = NULL, updated_at = now()
      WHERE id = NEW.obra_estimacion_id AND estado = 'pagada';
    PERFORM set_config('app.obra_estimacion_gate', '', true);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_cxp_pago_sync_obra_estimacion ON erp.cxp_pagos;
CREATE TRIGGER trg_cxp_pago_sync_obra_estimacion
  AFTER INSERT OR UPDATE OF estado, obra_estimacion_id, deleted_at ON erp.cxp_pagos
  FOR EACH ROW EXECUTE FUNCTION erp.fn_cxp_pago_sync_obra_estimacion();

-- ─── 7. cxp_factura_desde_estimacion: gobierno + herencia ─────────────
-- Cambios vs 20260602200000: (a) exige estimación AUTORIZADA (D2: el
-- devengo lo aprueba Dirección antes de generar documentos de pago);
-- (b) bloquea el modo mixto — si el contrato ya tiene factura TOTAL activa,
-- los avances se pagan aplicando pagos a esa factura, no emitiendo
-- facturas por estimación; (c) la factura hereda contrato_id + partida_id.

CREATE OR REPLACE FUNCTION erp.cxp_factura_desde_estimacion(
  p_estimacion_id uuid,
  p_condiciones_pago_dias integer DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'erp', 'dilesa', 'public'
AS $function$
DECLARE
  v_est record;
  v_ctr record;
  v_existing uuid;
  v_factura_id uuid;
BEGIN
  -- Estimación de origen.
  SELECT e.id, e.monto_total, e.fecha, e.etiqueta, e.factura_ref, e.contrato_id, e.estado
    INTO v_est
  FROM dilesa.obra_estimaciones e
  WHERE e.id = p_estimacion_id AND e.deleted_at IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'La estimación % no existe', p_estimacion_id;
  END IF;

  -- D2: el devengo lo autoriza Dirección antes de emitir a CxP.
  IF v_est.estado NOT IN ('autorizada', 'pagada') THEN
    RAISE EXCEPTION 'La estimación debe estar autorizada por Dirección antes de emitirse a CxP (estado actual: %)', v_est.estado;
  END IF;

  -- Neto a CxP (ADR-039 D3): solo montos positivos generan factura. Las
  -- amortizaciones del anticipo (filas negativas / NC) no se emiten.
  IF v_est.monto_total IS NULL OR v_est.monto_total <= 0 THEN
    RAISE EXCEPTION
      'Solo se emiten a CxP estimaciones con monto > 0 (las amortizaciones/negativas no generan factura)';
  END IF;

  -- ¿Ya emitida (factura activa)?
  SELECT id INTO v_existing
  FROM erp.facturas
  WHERE obra_estimacion_id = p_estimacion_id AND cancelada_at IS NULL;
  IF FOUND THEN
    RAISE EXCEPTION 'La estimación % ya tiene una factura de egreso (%)', p_estimacion_id, v_existing;
  END IF;

  -- Contrato → contratista (= proveedor) + empresa + tasa IVA + partida.
  SELECT c.id, c.empresa_id, c.contratista_id, c.codigo, c.iva_tasa, c.partida_id
    INTO v_ctr
  FROM dilesa.contratos_construccion c
  WHERE c.id = v_est.contrato_id AND c.deleted_at IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'El contrato de la estimación no existe o fue borrado';
  END IF;

  -- D5: si el contrato ya tiene factura TOTAL activa, los avances se pagan
  -- aplicando pagos a esa factura — emitir otra duplicaría el cargo.
  IF EXISTS (
    SELECT 1 FROM erp.facturas f
    WHERE f.contrato_id = v_ctr.id
      AND f.obra_estimacion_id IS NULL
      AND f.cancelada_at IS NULL
      AND f.estado_cxp <> 'cancelada'
  ) THEN
    RAISE EXCEPTION 'El contrato % ya tiene una factura total activa: programa el pago de la estimación aplicándolo a esa factura (no se emite factura nueva).', v_ctr.codigo;
  END IF;

  -- Reúsa el alta canónica de CxP (valida total, inserta egreso 'por_pagar',
  -- escribe audit_log). Captura inclusiva: sin uuid_sat (se timbra/adjunta luego).
  v_factura_id := erp.cxp_factura_alta(
    p_empresa_id := v_ctr.empresa_id,
    p_proveedor_id := v_ctr.contratista_id,
    p_total := v_est.monto_total,
    p_fecha_emision := COALESCE(v_est.fecha, CURRENT_DATE),
    p_condiciones_pago_dias := p_condiciones_pago_dias,
    p_tasa_iva := v_ctr.iva_tasa,
    p_notas := 'Obra ' || v_ctr.codigo || ' · estimación ' || COALESCE(v_est.etiqueta, '(s/etiqueta)')
      || COALESCE(' · fact ' || v_est.factura_ref, '')
  );

  -- Liga la factura a su estimación de origen y hereda contrato + partida
  -- (la partida hace visible el pago en v_partida_control.pagado).
  UPDATE erp.facturas
    SET obra_estimacion_id = p_estimacion_id,
        contrato_id = v_ctr.id,
        partida_id = COALESCE(partida_id, v_ctr.partida_id)
    WHERE id = v_factura_id;

  RETURN v_factura_id;
END;
$function$;

-- ─── 8. v_partida_control: ejercido = devengo autorizado (D4) ─────────
-- Para partidas con contrato de obra, "ejercido" = Σ estimaciones
-- AUTORIZADAS (avance real, incluye amortizaciones negativas del
-- anticipo), no documentos fiscales: una factura total anticipada ya no
-- distorsiona el avance. Las facturas ligadas a contrato/estimación salen
-- de la capa ejercido (siguen alimentando "pagado" vía aplicaciones).
-- OC (recibido) y facturas directas (sin OC, sin contrato) no cambian.

CREATE OR REPLACE VIEW erp.v_partida_control AS
SELECT pp.id AS partida_id,
    pp.empresa_id,
    pp.proyecto_id,
    pp.concepto_id,
    pp.concepto_texto,
    pp.etapa,
    pp.estado,
    pp.presupuesto_aprobado,
    COALESCE(comp.comprometido, 0::numeric) + COALESCE(con.comprometido_contratos, 0::numeric) AS comprometido,
    COALESCE(ej.ejercido, 0::numeric) AS ejercido,
    COALESCE(pg.pagado, 0::numeric) AS pagado,
    pp.gasto_real_total AS gasto_real_manual,
    COALESCE(pp.presupuesto_aprobado, 0::numeric)
      - (COALESCE(comp.comprometido, 0::numeric) + COALESCE(con.comprometido_contratos, 0::numeric)) AS disponible
   FROM erp.presupuesto_partidas pp
     LEFT JOIN LATERAL (
            SELECT sum(ocd.cantidad * COALESCE(ocd.precio_real, ocd.precio_unitario, 0::numeric)) AS comprometido
              FROM erp.ordenes_compra_detalle ocd
                JOIN erp.ordenes_compra oc ON oc.id = ocd.orden_compra_id
             WHERE ocd.partida_id = pp.id
               AND (oc.estado = ANY (ARRAY['enviada'::text, 'parcial'::text, 'cerrada'::text]))
          ) comp ON true
     LEFT JOIN LATERAL (
            -- ADR-042: el contrato de obra compromete su partida (1:1). Activo = deleted_at IS NULL.
            -- Filtra por empresa_id (aislamiento defensivo: la vista no es security_invoker).
            SELECT sum(c.valor_total) AS comprometido_contratos
              FROM dilesa.contratos_construccion c
             WHERE c.partida_id = pp.id
               AND c.empresa_id = pp.empresa_id
               AND c.deleted_at IS NULL
          ) con ON true
     LEFT JOIN LATERAL (
            -- Devengado: recibido de OC + facturas directas (sin OC y sin
            -- contrato/estimación) + estimaciones de obra autorizadas (D4,
            -- dilesa-contratos-estimaciones). Las facturas de obra NO se
            -- cuentan aquí (su devengo son las estimaciones); las facturas
            -- CON OC tampoco (su recepción ya las contó).
            SELECT COALESCE((
                     SELECT sum(ocd.cantidad_recibida * COALESCE(ocd.precio_real, ocd.precio_unitario, 0::numeric))
                       FROM erp.ordenes_compra_detalle ocd
                      WHERE ocd.partida_id = pp.id
                   ), 0::numeric)
                 + COALESCE((
                     SELECT sum(f.total)
                       FROM erp.facturas f
                      WHERE f.partida_id = pp.id
                        AND f.orden_compra_id IS NULL
                        AND f.obra_estimacion_id IS NULL
                        AND f.contrato_id IS NULL
                        AND f.flujo = 'egreso'
                        AND f.cancelada_at IS NULL
                        AND f.estado_cxp <> 'cancelada'
                   ), 0::numeric)
                 + COALESCE((
                     SELECT sum(e.monto_total)
                       FROM dilesa.obra_estimaciones e
                         JOIN dilesa.contratos_construccion c ON c.id = e.contrato_id
                      WHERE c.partida_id = pp.id
                        AND c.empresa_id = pp.empresa_id
                        AND c.deleted_at IS NULL
                        AND e.deleted_at IS NULL
                        AND (e.estado = ANY (ARRAY['autorizada'::text, 'pagada'::text]))
                   ), 0::numeric) AS ejercido
          ) ej ON true
     LEFT JOIN LATERAL (
            SELECT sum(app.monto_aplicado) AS pagado
              FROM erp.cxp_pago_aplicaciones app
                JOIN erp.facturas f ON f.id = app.factura_id
             WHERE f.partida_id = pp.id
          ) pg ON true
  WHERE pp.deleted_at IS NULL;

NOTIFY pgrst, 'reload schema';

COMMIT;
