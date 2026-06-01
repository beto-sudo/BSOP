-- ╭──────────────────────────────────────────────────────────────────╮
-- │  20260601200000_erp_cxp_subledger                                  │
-- │                                                                    │
-- │  Foundation de Cuentas por Pagar (CxP) — el lado "egresos" del     │
-- │  patrón de subledger gemelo (ADR-037). Espejo de CxC:              │
-- │    1. erp.facturas (extendida)   — el documento de adeudo (egreso) │
-- │    2. erp.cxp_pagos              — el pago al proveedor            │
-- │    3. erp.cxp_pago_aplicaciones  — aplicación N:M pago → facturas  │
-- │  + helper es_comite_ejecutivo (aprobación) + RPCs + trigger saldo. │
-- │                                                                    │
-- │  Reusa la referencia polimórfica de erp.movimientos_bancarios que  │
-- │  entregó CxC (referencia_tipo='cxp_pago').                         │
-- │                                                                    │
-- │  Iniciativa: `cxp` (Sprint 1, DB-puro). Ver docs/planning/cxp.md   │
-- │  y docs/adr/037_subledger_gemelo_cxc_cxp.                          │
-- │                                                                    │
-- │  Asimetría documentada (ADR-037 D2): CxP usa erp.facturas como     │
-- │  documento (semántica fiscal SAT), no una tabla cxp_cargos.        │
-- │  erp.facturas está vacía hoy → el backfill es no-op.               │
-- ╰──────────────────────────────────────────────────────────────────╯

BEGIN;

-- ─── 1. Extender erp.facturas para CxP ────────────────────────────────
-- Aditivo e idempotente. El legacy `estado_id` se deja coexistir (no se
-- toca); CxP opera con `estado_cxp`. RLS de facturas ya existe (canónica).

ALTER TABLE erp.facturas
  ADD COLUMN IF NOT EXISTS orden_compra_id uuid REFERENCES erp.ordenes_compra (id),
  ADD COLUMN IF NOT EXISTS proveedor_id uuid REFERENCES erp.personas (id),
  ADD COLUMN IF NOT EXISTS condiciones_pago_dias integer,
  ADD COLUMN IF NOT EXISTS fecha_pago_programada date,
  ADD COLUMN IF NOT EXISTS monto_pagado numeric(14, 2) NOT NULL DEFAULT 0 CHECK (monto_pagado >= 0),
  ADD COLUMN IF NOT EXISTS saldo numeric(14, 2)
    GENERATED ALWAYS AS (COALESCE(total, 0) - COALESCE(monto_pagado, 0)) STORED,
  ADD COLUMN IF NOT EXISTS estado_cxp text NOT NULL DEFAULT 'borrador' CHECK (
    estado_cxp IN ('borrador', 'por_pagar', 'parcial', 'pagada', 'cancelada')
  ),
  ADD COLUMN IF NOT EXISTS forma_pago_sat text,
  ADD COLUMN IF NOT EXISTS metodo_pago_sat text CHECK (
    metodo_pago_sat IS NULL OR metodo_pago_sat IN ('PUE', 'PPD')
  ),
  ADD COLUMN IF NOT EXISTS uso_cfdi text,
  ADD COLUMN IF NOT EXISTS tasa_iva numeric(5, 2),
  ADD COLUMN IF NOT EXISTS retencion_iva numeric(14, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS retencion_isr numeric(14, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS motivo_cancelacion text,
  ADD COLUMN IF NOT EXISTS cancelada_at timestamptz,
  ADD COLUMN IF NOT EXISTS cancelada_por uuid REFERENCES auth.users (id);

COMMENT ON COLUMN erp.facturas.estado_cxp IS
  'Estado CxP (borrador/por_pagar/parcial/pagada/cancelada). Coexiste con el legacy estado_id, que CxP no usa. ADR-037.';
COMMENT ON COLUMN erp.facturas.saldo IS
  'Derivado: total - monto_pagado. Generado, nunca capturado. monto_pagado lo recalcula el trigger desde cxp_pago_aplicaciones.';
COMMENT ON COLUMN erp.facturas.proveedor_id IS
  'Proveedor (erp.personas). Denormaliza el emisor para queries de CxP; complementa emisor_rfc.';

CREATE INDEX IF NOT EXISTS facturas_estado_cxp_idx
  ON erp.facturas (estado_cxp, fecha_pago_programada);
CREATE INDEX IF NOT EXISTS facturas_proveedor_idx ON erp.facturas (proveedor_id);
CREATE INDEX IF NOT EXISTS facturas_orden_compra_idx ON erp.facturas (orden_compra_id);

-- Backfill: facturas de egreso existentes pasan a 'por_pagar'. Hoy la
-- tabla está vacía → no-op; queda por correctitud futura.
UPDATE erp.facturas
   SET estado_cxp = 'por_pagar'
 WHERE flujo = 'egreso' AND estado_cxp = 'borrador';

-- ─── 2. erp.cxp_pagos (el pago al proveedor) ──────────────────────────

CREATE TABLE IF NOT EXISTS erp.cxp_pagos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL REFERENCES core.empresas (id),
  -- Proveedor denormalizado (consistente con facturas.proveedor_id).
  proveedor_id uuid REFERENCES erp.personas (id),

  monto_total numeric(14, 2) NOT NULL CHECK (monto_total > 0),
  fecha_programada date,
  -- Real, NULL hasta ejecutarse (marcar_pagado).
  fecha_pago date,

  cuenta_bancaria_id uuid REFERENCES erp.cuentas_bancarias (id),
  metodo_pago text CHECK (
    metodo_pago IS NULL OR metodo_pago IN ('transferencia', 'cheque', 'efectivo', 'tarjeta')
  ),
  referencia text,

  -- Ciclo de vida: programado → aprobado → pagado. rechazado/cancelado
  -- son salidas. Solo 'pagado' implica dinero realmente fuera (emite
  -- movimiento bancario en marcar_pagado).
  estado text NOT NULL DEFAULT 'programado' CHECK (
    estado IN ('programado', 'aprobado', 'pagado', 'rechazado', 'cancelado')
  ),

  programado_por uuid REFERENCES auth.users (id) DEFAULT auth.uid(),
  aprobado_por uuid REFERENCES auth.users (id),
  aprobado_at timestamptz,
  pagado_por uuid REFERENCES auth.users (id),
  pagado_at timestamptz,

  notas text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

COMMENT ON TABLE erp.cxp_pagos IS
  'Cuentas por Pagar — el pago a un proveedor. Se aplica a 1..N facturas vía cxp_pago_aplicaciones. Espejo de erp.cxc_pagos. ADR-037 D1.';
COMMENT ON COLUMN erp.cxp_pagos.estado IS
  'programado → aprobado (Comité) → pagado (emite movimiento bancario). rechazado/cancelado revierten aplicaciones.';

CREATE INDEX IF NOT EXISTS cxp_pagos_empresa_idx ON erp.cxp_pagos (empresa_id);
CREATE INDEX IF NOT EXISTS cxp_pagos_proveedor_idx ON erp.cxp_pagos (proveedor_id);
CREATE INDEX IF NOT EXISTS cxp_pagos_estado_idx
  ON erp.cxp_pagos (estado, fecha_programada) WHERE deleted_at IS NULL;

-- ─── 3. erp.cxp_pago_aplicaciones (la aplicación N:M) ─────────────────

CREATE TABLE IF NOT EXISTS erp.cxp_pago_aplicaciones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL REFERENCES core.empresas (id),
  pago_id uuid NOT NULL REFERENCES erp.cxp_pagos (id) ON DELETE CASCADE,
  factura_id uuid NOT NULL REFERENCES erp.facturas (id),
  monto_aplicado numeric(14, 2) NOT NULL CHECK (monto_aplicado > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT cxp_pago_aplicaciones_pago_factura_unq UNIQUE (pago_id, factura_id)
);

COMMENT ON TABLE erp.cxp_pago_aplicaciones IS
  'Aplicación N:M de un pago a una o varias facturas. La invariante Σ aplicaciones = pago.monto_total se valida en la RPC de programación. Espejo de erp.cxc_pago_aplicaciones. ADR-037 D1.';

CREATE INDEX IF NOT EXISTS cxp_pago_aplicaciones_pago_idx
  ON erp.cxp_pago_aplicaciones (pago_id);
CREATE INDEX IF NOT EXISTS cxp_pago_aplicaciones_factura_idx
  ON erp.cxp_pago_aplicaciones (factura_id);

-- ─── 4. Trigger: recálculo de saldo de la factura (ADR-037 D3) ────────
-- AFTER INSERT/UPDATE/DELETE en aplicaciones → recalcula monto_pagado y
-- estado_cxp de la(s) factura(s). SELECT SUM directo, sin recursión (el
-- trigger vive en aplicaciones). cancelar/rechazar borran las aplicaciones
-- → este trigger las descuenta. Mismo patrón que CxC.

CREATE OR REPLACE FUNCTION erp.fn_cxp_recalc_factura_saldo()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = erp, public
AS $$
DECLARE
  v_facturas uuid[] := ARRAY[]::uuid[];
  v_factura_id uuid;
  v_pagado numeric(14, 2);
BEGIN
  IF (TG_OP = 'INSERT' OR TG_OP = 'UPDATE') THEN
    v_facturas := array_append(v_facturas, NEW.factura_id);
  END IF;
  IF (TG_OP = 'DELETE' OR TG_OP = 'UPDATE') THEN
    v_facturas := array_append(v_facturas, OLD.factura_id);
  END IF;

  FOR v_factura_id IN SELECT DISTINCT unnest(v_facturas) LOOP
    SELECT COALESCE(SUM(a.monto_aplicado), 0)
      INTO v_pagado
      FROM erp.cxp_pago_aplicaciones a
     WHERE a.factura_id = v_factura_id;

    UPDATE erp.facturas f
       SET monto_pagado = v_pagado,
           estado_cxp = CASE
             WHEN f.estado_cxp = 'cancelada' THEN 'cancelada'
             WHEN f.total > 0 AND v_pagado >= f.total THEN 'pagada'
             WHEN v_pagado > 0 THEN 'parcial'
             WHEN f.estado_cxp = 'borrador' THEN 'borrador'
             ELSE 'por_pagar'
           END,
           updated_at = now()
     WHERE f.id = v_factura_id;
  END LOOP;

  RETURN NULL;
END;
$$;

COMMENT ON FUNCTION erp.fn_cxp_recalc_factura_saldo() IS
  'Recalcula erp.facturas.monto_pagado y estado_cxp desde cxp_pago_aplicaciones. Trigger AFTER en aplicaciones (sin recursión). ADR-037 D3.';

DROP TRIGGER IF EXISTS trg_cxp_recalc_factura_saldo ON erp.cxp_pago_aplicaciones;
CREATE TRIGGER trg_cxp_recalc_factura_saldo
  AFTER INSERT OR UPDATE OR DELETE ON erp.cxp_pago_aplicaciones
  FOR EACH ROW EXECUTE FUNCTION erp.fn_cxp_recalc_factura_saldo();

-- ─── 5. Helper: erp.es_comite_ejecutivo ───────────────────────────────
-- Membresía del Comité Ejecutivo de una empresa. Mapea usuario → persona
-- por EMAIL (core.usuarios no tiene persona_id) → empleado → puesto
-- "Comité Ejecutivo". SIN override de admin (control financiero estricto,
-- decisión de Beto 2026-06-01): solo el puesto aprueba pagos. ILIKE
-- 'comit%ejecutivo' evita atrapar "Asistente Ejecutivo".
-- TODO: si la cadena por email resulta frágil (empleados_puestos sucio en
-- COAGAN/ANSA al hacer rollout), agregar fallback de whitelist.

CREATE OR REPLACE FUNCTION erp.es_comite_ejecutivo(p_usuario_id uuid, p_empresa_id uuid)
  RETURNS boolean
  LANGUAGE plpgsql
  STABLE
  SECURITY DEFINER
  SET search_path = erp, public
AS $$
DECLARE
  v_email text;
BEGIN
  IF p_usuario_id IS NULL OR p_empresa_id IS NULL THEN
    RETURN false;
  END IF;

  SELECT email INTO v_email
    FROM core.usuarios WHERE id = p_usuario_id;
  IF v_email IS NULL THEN
    RETURN false;
  END IF;

  RETURN EXISTS (
    SELECT 1
      FROM erp.personas pe
      JOIN erp.empleados e
        ON e.persona_id = pe.id
       AND e.empresa_id = p_empresa_id
       AND e.deleted_at IS NULL
       AND COALESCE(e.activo, true)
      JOIN erp.empleados_puestos ep
        ON ep.empleado_id = e.id
       AND ep.empresa_id = p_empresa_id
       AND (ep.fecha_fin IS NULL OR ep.fecha_fin >= CURRENT_DATE)
      JOIN erp.puestos pu
        ON pu.id = ep.puesto_id
       AND pu.nombre ILIKE 'comit%ejecutivo'
     WHERE lower(pe.email) = lower(v_email)
  );
END;
$$;

COMMENT ON FUNCTION erp.es_comite_ejecutivo(uuid, uuid) IS
  'true si el usuario pertenece al puesto "Comité Ejecutivo" de la empresa (mapeo usuario→persona por email). Sin override de admin (control financiero estricto). Gobierna cxp_pago_aprobar.';

-- ─── 6. RPCs de CxP ───────────────────────────────────────────────────

-- 6a. Alta de factura de egreso. Acepta uuid_sat (dedup) — el endpoint de
-- ingesta XML (Sprint 2) parsea el CFDI y llama aquí. Si trae OC, valida
-- empresa y proveedor.
CREATE OR REPLACE FUNCTION erp.cxp_factura_alta(
  p_empresa_id uuid,
  p_proveedor_id uuid,
  p_total numeric,
  p_subtotal numeric DEFAULT NULL,
  p_iva numeric DEFAULT NULL,
  p_fecha_emision date DEFAULT CURRENT_DATE,
  p_condiciones_pago_dias integer DEFAULT NULL,
  p_orden_compra_id uuid DEFAULT NULL,
  p_uuid_sat text DEFAULT NULL,
  p_emisor_rfc text DEFAULT NULL,
  p_emisor_nombre text DEFAULT NULL,
  p_receptor_rfc text DEFAULT NULL,
  p_forma_pago_sat text DEFAULT NULL,
  p_metodo_pago_sat text DEFAULT NULL,
  p_uso_cfdi text DEFAULT NULL,
  p_tasa_iva numeric DEFAULT NULL,
  p_retencion_iva numeric DEFAULT 0,
  p_retencion_isr numeric DEFAULT 0,
  p_xml_url text DEFAULT NULL,
  p_pdf_url text DEFAULT NULL,
  p_notas text DEFAULT NULL
)
  RETURNS uuid
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = erp, public
AS $$
DECLARE
  v_factura_id uuid;
  v_oc record;
  v_venc date;
BEGIN
  IF p_total IS NULL OR p_total <= 0 THEN
    RAISE EXCEPTION 'El total de la factura debe ser > 0';
  END IF;

  -- Dedup por folio fiscal.
  IF p_uuid_sat IS NOT NULL THEN
    SELECT id INTO v_factura_id FROM erp.facturas WHERE uuid_sat = p_uuid_sat;
    IF FOUND THEN
      RAISE EXCEPTION 'Ya existe una factura con uuid_sat % (id %)', p_uuid_sat, v_factura_id;
    END IF;
  END IF;

  -- Validación de OC (si se liga): misma empresa y mismo proveedor.
  IF p_orden_compra_id IS NOT NULL THEN
    SELECT empresa_id, proveedor_id, total_a_pagar INTO v_oc
      FROM erp.ordenes_compra WHERE id = p_orden_compra_id AND deleted_at IS NULL;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'La orden de compra % no existe', p_orden_compra_id;
    END IF;
    IF v_oc.empresa_id <> p_empresa_id THEN
      RAISE EXCEPTION 'La OC pertenece a otra empresa';
    END IF;
    IF p_proveedor_id IS NOT NULL AND v_oc.proveedor_id IS DISTINCT FROM p_proveedor_id THEN
      RAISE EXCEPTION 'El proveedor de la factura no coincide con el de la OC';
    END IF;
  END IF;

  v_venc := CASE
    WHEN p_condiciones_pago_dias IS NOT NULL
      THEN p_fecha_emision + (p_condiciones_pago_dias || ' days')::interval
    ELSE NULL
  END;

  INSERT INTO erp.facturas (
    empresa_id, flujo, proveedor_id, persona_id, orden_compra_id,
    uuid_sat, emisor_rfc, emisor_nombre, receptor_rfc,
    subtotal, iva, total, fecha_emision, fecha_vencimiento,
    condiciones_pago_dias, fecha_pago_programada,
    forma_pago_sat, metodo_pago_sat, uso_cfdi, tasa_iva,
    retencion_iva, retencion_isr, xml_url, pdf_url, estado_cxp
  ) VALUES (
    p_empresa_id, 'egreso', p_proveedor_id, p_proveedor_id, p_orden_compra_id,
    p_uuid_sat, p_emisor_rfc, p_emisor_nombre, p_receptor_rfc,
    p_subtotal, p_iva, p_total, p_fecha_emision, v_venc,
    p_condiciones_pago_dias, v_venc,
    p_forma_pago_sat, p_metodo_pago_sat, p_uso_cfdi, p_tasa_iva,
    COALESCE(p_retencion_iva, 0), COALESCE(p_retencion_isr, 0), p_xml_url, p_pdf_url, 'por_pagar'
  ) RETURNING id INTO v_factura_id;

  INSERT INTO core.audit_log (empresa_id, usuario_id, accion, tabla, registro_id, datos_nuevos)
  VALUES (p_empresa_id, auth.uid(), 'cxp_factura_alta', 'erp.facturas', v_factura_id,
    jsonb_build_object('total', p_total, 'proveedor_id', p_proveedor_id,
      'orden_compra_id', p_orden_compra_id, 'uuid_sat', p_uuid_sat));

  RETURN v_factura_id;
END;
$$;

-- 6b. Cancelar factura. Bloquea si tiene pagos vivos aplicados.
CREATE OR REPLACE FUNCTION erp.cxp_factura_cancelar(
  p_factura_id uuid,
  p_motivo text DEFAULT NULL
)
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = erp, public
AS $$
DECLARE
  v_empresa_id uuid;
BEGIN
  SELECT empresa_id INTO v_empresa_id
    FROM erp.facturas WHERE id = p_factura_id AND estado_cxp <> 'cancelada';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Factura % no existe o ya está cancelada', p_factura_id;
  END IF;

  IF EXISTS (
    SELECT 1 FROM erp.cxp_pago_aplicaciones a
      JOIN erp.cxp_pagos p ON p.id = a.pago_id
     WHERE a.factura_id = p_factura_id
       AND p.deleted_at IS NULL
       AND p.estado NOT IN ('rechazado', 'cancelado')
  ) THEN
    RAISE EXCEPTION 'No se puede cancelar: la factura tiene pagos programados/aprobados/pagados. Cancela los pagos primero.';
  END IF;

  UPDATE erp.facturas
     SET estado_cxp = 'cancelada',
         motivo_cancelacion = p_motivo,
         cancelada_at = now(),
         cancelada_por = auth.uid(),
         updated_at = now()
   WHERE id = p_factura_id;

  INSERT INTO core.audit_log (empresa_id, usuario_id, accion, tabla, registro_id, datos_nuevos)
  VALUES (v_empresa_id, auth.uid(), 'cxp_factura_cancelada', 'erp.facturas', p_factura_id,
    jsonb_build_object('motivo', p_motivo));
END;
$$;

-- 6c. Programar pago: crea cxp_pagos (programado) + aplicaciones.
-- p_aplicaciones = [{ "factura_id": uuid, "monto": numeric }, ...].
-- monto_total = Σ montos. Valida que cada factura sea de la empresa, no
-- cancelada, y que el monto no exceda su saldo.
CREATE OR REPLACE FUNCTION erp.cxp_pago_programar(
  p_empresa_id uuid,
  p_proveedor_id uuid,
  p_aplicaciones jsonb,
  p_metodo_pago text DEFAULT NULL,
  p_fecha_programada date DEFAULT NULL,
  p_cuenta_bancaria_id uuid DEFAULT NULL,
  p_referencia text DEFAULT NULL,
  p_notas text DEFAULT NULL
)
  RETURNS uuid
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = erp, public
AS $$
DECLARE
  v_pago_id uuid;
  v_total numeric(14, 2);
  r record;
  v_factura record;
BEGIN
  SELECT COALESCE(SUM((x->>'monto')::numeric), 0) INTO v_total
    FROM jsonb_array_elements(p_aplicaciones) x;
  IF v_total <= 0 THEN
    RAISE EXCEPTION 'El pago debe aplicar a un monto > 0';
  END IF;

  INSERT INTO erp.cxp_pagos (
    empresa_id, proveedor_id, monto_total, fecha_programada,
    cuenta_bancaria_id, metodo_pago, referencia, estado, notas
  ) VALUES (
    p_empresa_id, p_proveedor_id, v_total, p_fecha_programada,
    p_cuenta_bancaria_id, p_metodo_pago, p_referencia, 'programado', p_notas
  ) RETURNING id INTO v_pago_id;

  FOR r IN SELECT (x->>'factura_id')::uuid AS factura_id, (x->>'monto')::numeric AS monto
             FROM jsonb_array_elements(p_aplicaciones) x
  LOOP
    IF r.monto IS NULL OR r.monto <= 0 THEN
      CONTINUE;
    END IF;
    SELECT empresa_id, estado_cxp, saldo INTO v_factura
      FROM erp.facturas WHERE id = r.factura_id;
    IF NOT FOUND OR v_factura.empresa_id <> p_empresa_id THEN
      RAISE EXCEPTION 'Factura % no existe o es de otra empresa', r.factura_id;
    END IF;
    IF v_factura.estado_cxp = 'cancelada' THEN
      RAISE EXCEPTION 'Factura % está cancelada', r.factura_id;
    END IF;
    IF r.monto > v_factura.saldo THEN
      RAISE EXCEPTION 'El monto (%) excede el saldo de la factura % (%)', r.monto, r.factura_id, v_factura.saldo;
    END IF;
    INSERT INTO erp.cxp_pago_aplicaciones (empresa_id, pago_id, factura_id, monto_aplicado)
    VALUES (p_empresa_id, v_pago_id, r.factura_id, r.monto);
  END LOOP;

  INSERT INTO core.audit_log (empresa_id, usuario_id, accion, tabla, registro_id, datos_nuevos)
  VALUES (p_empresa_id, auth.uid(), 'cxp_pago_programado', 'erp.cxp_pagos', v_pago_id,
    jsonb_build_object('monto_total', v_total, 'proveedor_id', p_proveedor_id,
      'aplicaciones', p_aplicaciones));

  RETURN v_pago_id;
END;
$$;

-- 6d. Aprobar pago: solo Comité Ejecutivo. Concurrencia: FOR UPDATE +
-- check de estado actual.
CREATE OR REPLACE FUNCTION erp.cxp_pago_aprobar(p_pago_id uuid)
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = erp, public
AS $$
DECLARE
  v erp.cxp_pagos%ROWTYPE;
BEGIN
  SELECT * INTO v FROM erp.cxp_pagos
   WHERE id = p_pago_id AND deleted_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pago % no existe o está cancelado', p_pago_id;
  END IF;
  IF v.estado <> 'programado' THEN
    RAISE EXCEPTION 'El pago no está en estado programado (estado actual: %)', v.estado;
  END IF;
  IF NOT erp.es_comite_ejecutivo(auth.uid(), v.empresa_id) THEN
    RAISE EXCEPTION 'Solo un miembro del Comité Ejecutivo puede aprobar pagos';
  END IF;

  UPDATE erp.cxp_pagos
     SET estado = 'aprobado', aprobado_por = auth.uid(), aprobado_at = now(), updated_at = now()
   WHERE id = p_pago_id;

  INSERT INTO core.audit_log (empresa_id, usuario_id, accion, tabla, registro_id, datos_nuevos)
  VALUES (v.empresa_id, auth.uid(), 'cxp_pago_aprobado', 'erp.cxp_pagos', p_pago_id, '{}'::jsonb);
END;
$$;

-- 6e. Marcar pagado: registra el pago real + emite movimiento bancario
-- (tipo 'cargo' = egreso/débito de la cuenta; referencia_tipo='cxp_pago').
CREATE OR REPLACE FUNCTION erp.cxp_pago_marcar_pagado(
  p_pago_id uuid,
  p_fecha_pago date DEFAULT CURRENT_DATE,
  p_referencia text DEFAULT NULL
)
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = erp, public
AS $$
DECLARE
  v erp.cxp_pagos%ROWTYPE;
BEGIN
  SELECT * INTO v FROM erp.cxp_pagos
   WHERE id = p_pago_id AND deleted_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pago % no existe o está cancelado', p_pago_id;
  END IF;
  IF v.estado <> 'aprobado' THEN
    RAISE EXCEPTION 'El pago debe estar aprobado antes de marcarse pagado (estado actual: %)', v.estado;
  END IF;

  UPDATE erp.cxp_pagos
     SET estado = 'pagado',
         fecha_pago = p_fecha_pago,
         referencia = COALESCE(p_referencia, referencia),
         pagado_por = auth.uid(),
         pagado_at = now(),
         updated_at = now()
   WHERE id = p_pago_id;

  -- Gancho de tesorería (ADR-037 D4). Solo si se conoce la cuenta.
  IF v.cuenta_bancaria_id IS NOT NULL THEN
    INSERT INTO erp.movimientos_bancarios (
      empresa_id, cuenta_id, tipo, monto, fecha, descripcion, referencia,
      referencia_tipo, referencia_id, conciliado
    ) VALUES (
      v.empresa_id, v.cuenta_bancaria_id, 'cargo', v.monto_total, p_fecha_pago,
      'Pago CxP', COALESCE(p_referencia, v.referencia), 'cxp_pago', p_pago_id, false
    );
  END IF;

  INSERT INTO core.audit_log (empresa_id, usuario_id, accion, tabla, registro_id, datos_nuevos)
  VALUES (v.empresa_id, auth.uid(), 'cxp_pago_pagado', 'erp.cxp_pagos', p_pago_id,
    jsonb_build_object('fecha_pago', p_fecha_pago, 'referencia', p_referencia,
      'monto', v.monto_total, 'cuenta_bancaria_id', v.cuenta_bancaria_id));
END;
$$;

-- 6f. Cancelar pago: soft-delete + revierte aplicaciones (el trigger
-- recalcula saldos). Bloquea si ya está pagado (requiere reversa manual).
CREATE OR REPLACE FUNCTION erp.cxp_pago_cancelar(
  p_pago_id uuid,
  p_motivo text DEFAULT NULL
)
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = erp, public
AS $$
DECLARE
  v erp.cxp_pagos%ROWTYPE;
BEGIN
  SELECT * INTO v FROM erp.cxp_pagos
   WHERE id = p_pago_id AND deleted_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pago % no existe o ya está cancelado', p_pago_id;
  END IF;
  IF v.estado = 'pagado' THEN
    RAISE EXCEPTION 'No se puede cancelar un pago ya ejecutado; registra una reversa.';
  END IF;

  DELETE FROM erp.cxp_pago_aplicaciones WHERE pago_id = p_pago_id;

  UPDATE erp.cxp_pagos
     SET estado = 'cancelado',
         deleted_at = now(),
         notas = COALESCE(notas || ' | ', '') || 'Cancelado: ' || COALESCE(p_motivo, 's/motivo'),
         updated_at = now()
   WHERE id = p_pago_id;

  INSERT INTO core.audit_log (empresa_id, usuario_id, accion, tabla, registro_id, datos_nuevos)
  VALUES (v.empresa_id, auth.uid(), 'cxp_pago_cancelado', 'erp.cxp_pagos', p_pago_id,
    jsonb_build_object('motivo', p_motivo));
END;
$$;

-- ─── 7. RLS (solo tablas nuevas; facturas ya tiene RLS canónica) ──────
-- SELECT/INSERT a miembros de la empresa o admin; UPDATE/DELETE solo
-- admin. Las mutaciones de negocio pasan por las RPCs SECURITY DEFINER.

ALTER TABLE erp.cxp_pagos ENABLE ROW LEVEL SECURITY;
ALTER TABLE erp.cxp_pago_aplicaciones ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['cxp_pagos', 'cxp_pago_aplicaciones'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I_select ON erp.%I', t, t);
    EXECUTE format(
      'CREATE POLICY %I_select ON erp.%I FOR SELECT TO authenticated '
      'USING (core.fn_has_empresa(empresa_id) OR core.fn_is_admin())', t, t);

    EXECUTE format('DROP POLICY IF EXISTS %I_insert ON erp.%I', t, t);
    EXECUTE format(
      'CREATE POLICY %I_insert ON erp.%I FOR INSERT TO authenticated '
      'WITH CHECK (core.fn_has_empresa(empresa_id) OR core.fn_is_admin())', t, t);

    EXECUTE format('DROP POLICY IF EXISTS %I_update ON erp.%I', t, t);
    EXECUTE format(
      'CREATE POLICY %I_update ON erp.%I FOR UPDATE TO authenticated '
      'USING (core.fn_is_admin()) WITH CHECK (core.fn_is_admin())', t, t);

    EXECUTE format('DROP POLICY IF EXISTS %I_delete ON erp.%I', t, t);
    EXECUTE format(
      'CREATE POLICY %I_delete ON erp.%I FOR DELETE TO authenticated '
      'USING (core.fn_is_admin())', t, t);
  END LOOP;
END $$;

-- ─── Reload PostgREST ─────────────────────────────────────────────────

NOTIFY pgrst, 'reload schema';

COMMIT;
