-- ╭──────────────────────────────────────────────────────────────────╮
-- │  20260601152629_erp_cxc_subledger                                  │
-- │                                                                    │
-- │  Foundation de Cuentas por Cobrar (CxC) — el lado "ingresos" del   │
-- │  patrón de subledger gemelo (ADR-037). Crea las 3 capas:           │
-- │    1. erp.cxc_cargos          — el adeudo (parcialidad/mensualidad) │
-- │    2. erp.cxc_pagos           — el abono del cliente o institución  │
-- │    3. erp.cxc_pago_aplicaciones — aplicación N:M abono → cargos     │
-- │  + extiende erp.movimientos_bancarios con referencia polimórfica    │
-- │    (gancho de tesorería que CxP también consume).                  │
-- │                                                                    │
-- │  Iniciativa: `cxc` (Sprint 1, PR A1 — DDL). Ver                    │
-- │  `docs/planning/cxc.md` y `docs/adr/037_subledger_gemelo_cxc_cxp`. │
-- │                                                                    │
-- │  Este PR es DDL puro: tablas vacías + ALTER aditivo + trigger de   │
-- │  saldo + RLS. NO incluye RPCs de originación/pago (PR A2) ni la     │
-- │  migración de datos de `dilesa.venta_pagos` (PR A3).               │
-- ╰──────────────────────────────────────────────────────────────────╯

BEGIN;

-- ─── Foundation: referencia polimórfica en movimientos_bancarios ──────
-- ADR-037 D4. Permite que un movimiento bancario apunte de vuelta al
-- subledger que lo originó (un abono CxC, un pago CxP, un gasto, etc.)
-- sin acoplar tablas. Lo entrega CxC; CxP lo consume tal cual.

ALTER TABLE erp.movimientos_bancarios
  ADD COLUMN IF NOT EXISTS referencia_tipo text,
  ADD COLUMN IF NOT EXISTS referencia_id uuid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'movimientos_bancarios_referencia_tipo_chk'
  ) THEN
    ALTER TABLE erp.movimientos_bancarios
      ADD CONSTRAINT movimientos_bancarios_referencia_tipo_chk
      CHECK (
        referencia_tipo IS NULL OR referencia_tipo IN (
          'cxc_pago', 'cxp_pago', 'gasto', 'transferencia', 'corte', 'otro'
        )
      );
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS movimientos_bancarios_referencia_idx
  ON erp.movimientos_bancarios (referencia_tipo, referencia_id);

COMMENT ON COLUMN erp.movimientos_bancarios.referencia_tipo IS
  'Tipo de documento del sistema que originó el movimiento (cxc_pago, cxp_pago, gasto, transferencia, corte, otro). ADR-037 D4.';
COMMENT ON COLUMN erp.movimientos_bancarios.referencia_id IS
  'PK del documento referenciado según referencia_tipo. Sin FK física (polimórfico).';

-- ─── Capa 1: erp.cxc_cargos (el adeudo) ───────────────────────────────

CREATE TABLE IF NOT EXISTS erp.cxc_cargos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL REFERENCES core.empresas (id),

  -- Cliente: se ancla por persona (consistente con dilesa.ventas.persona_id).
  -- erp.clientes se resuelve por persona_id cuando se necesita.
  persona_id uuid NOT NULL REFERENCES erp.personas (id),

  -- ── Originación (ADR-037 D5) ────────────────────────────────────────
  -- Polimórfico: apunta al documento de negocio que generó el cargo.
  -- En v1 solo 'venta_dilesa' → origen_id = dilesa.ventas.id.
  origen_tipo text NOT NULL DEFAULT 'venta_dilesa' CHECK (
    origen_tipo IN ('venta_dilesa', 'manual', 'otro')
  ),
  origen_id uuid,

  -- ── Naturaleza del cargo ───────────────────────────────────────────
  tipo_cargo text NOT NULL CHECK (
    tipo_cargo IN ('enganche', 'mensualidad', 'credito', 'contado', 'otro')
  ),
  -- Orden dentro del plan (parcialidad 1..N del enganche, mensualidad k).
  numero integer NOT NULL DEFAULT 1,
  concepto text,

  -- ── Montos ─────────────────────────────────────────────────────────
  monto numeric(14, 2) NOT NULL CHECK (monto >= 0),
  -- monto_pagado lo recalcula el trigger desde cxc_pago_aplicaciones.
  monto_pagado numeric(14, 2) NOT NULL DEFAULT 0 CHECK (monto_pagado >= 0),
  -- saldo derivado, nunca capturado (ADR-037 D3).
  saldo numeric(14, 2) GENERATED ALWAYS AS (monto - COALESCE(monto_pagado, 0)) STORED,

  fecha_vencimiento date,

  -- estado derivado por trigger (pendiente/parcial/liquidado/cancelado).
  -- 'vencido' NO se almacena — es fecha_vencimiento < today() sobre un
  -- cargo no liquidado (ADR-037 D3).
  estado text NOT NULL DEFAULT 'pendiente' CHECK (
    estado IN ('pendiente', 'parcial', 'liquidado', 'cancelado')
  ),

  -- Quién se espera que pague: gobierna la cobranza activa (ADR-037 D6).
  -- 'cliente' → recordatorios/estado de cuenta; 'institucion' → solo
  -- visibilidad del adeudo (INFONAVIT/FOVISSSTE/banco).
  fuente_esperada text NOT NULL DEFAULT 'cliente' CHECK (
    fuente_esperada IN ('cliente', 'institucion')
  ),

  notas text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

COMMENT ON TABLE erp.cxc_cargos IS
  'Cuentas por Cobrar — el adeudo (parcialidad de enganche, mensualidad, evento de crédito). Una fila por cargo del plan de pagos. ADR-037 D1.';
COMMENT ON COLUMN erp.cxc_cargos.persona_id IS
  'Cliente que debe, por persona (consistente con dilesa.ventas.persona_id).';
COMMENT ON COLUMN erp.cxc_cargos.origen_id IS
  'Documento de negocio que originó el cargo (dilesa.ventas.id cuando origen_tipo=venta_dilesa). Polimórfico, sin FK física.';
COMMENT ON COLUMN erp.cxc_cargos.saldo IS
  'Derivado: monto - monto_pagado. Generado, nunca capturado.';
COMMENT ON COLUMN erp.cxc_cargos.fuente_esperada IS
  'cliente (cobranza activa) vs institucion (solo visibilidad del adeudo). ADR-037 D6.';

CREATE INDEX IF NOT EXISTS cxc_cargos_empresa_idx ON erp.cxc_cargos (empresa_id);
CREATE INDEX IF NOT EXISTS cxc_cargos_persona_idx ON erp.cxc_cargos (persona_id);
CREATE INDEX IF NOT EXISTS cxc_cargos_origen_idx ON erp.cxc_cargos (origen_tipo, origen_id);
CREATE INDEX IF NOT EXISTS cxc_cargos_estado_venc_idx
  ON erp.cxc_cargos (estado, fecha_vencimiento)
  WHERE deleted_at IS NULL;

-- ─── Capa 2: erp.cxc_pagos (el abono) ─────────────────────────────────

CREATE TABLE IF NOT EXISTS erp.cxc_pagos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL REFERENCES core.empresas (id),
  persona_id uuid NOT NULL REFERENCES erp.personas (id),

  fecha date NOT NULL DEFAULT CURRENT_DATE,
  monto_total numeric(14, 2) NOT NULL CHECK (monto_total > 0),

  -- Fuente del abono (ADR-037 D6): cliente directo vs institución.
  fuente text NOT NULL DEFAULT 'cliente' CHECK (
    fuente IN ('cliente', 'institucion')
  ),
  forma_pago text CHECK (
    forma_pago IS NULL OR forma_pago IN (
      'efectivo', 'transferencia', 'cheque', 'tarjeta', 'deposito', 'otro'
    )
  ),
  referencia text,

  -- Cuenta donde cayó el abono. NULL hasta conocerla; cuando se llena,
  -- la RPC de registro emite el movimiento bancario (PR A2).
  cuenta_bancaria_id uuid REFERENCES erp.cuentas_bancarias (id),

  -- CFDI: lo genera CONTPAQi; BSOP solo referencia el folio fiscal.
  uuid_sat text,
  -- Comprobante (voucher/PDF). Referencia suave a erp.adjuntos.
  comprobante_adjunto_id uuid,

  notas text,
  registrado_por uuid REFERENCES auth.users (id) DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,

  -- Trazabilidad de la migración desde Coda "Depositos Clientes".
  coda_row_id text
);

COMMENT ON TABLE erp.cxc_pagos IS
  'Cuentas por Cobrar — el abono de un cliente o institución. Se aplica a 1..N cargos vía cxc_pago_aplicaciones. Absorbe dilesa.venta_pagos (módulo Coda Depositos Clientes). ADR-037 D1.';
COMMENT ON COLUMN erp.cxc_pagos.fuente IS
  'cliente vs institucion (INFONAVIT/FOVISSSTE/banco). ADR-037 D6.';
COMMENT ON COLUMN erp.cxc_pagos.uuid_sat IS
  'Folio fiscal del CFDI de ingreso generado en CONTPAQi. BSOP no timbra; solo referencia.';

CREATE INDEX IF NOT EXISTS cxc_pagos_empresa_idx ON erp.cxc_pagos (empresa_id);
CREATE INDEX IF NOT EXISTS cxc_pagos_persona_idx ON erp.cxc_pagos (persona_id);
CREATE INDEX IF NOT EXISTS cxc_pagos_fecha_idx ON erp.cxc_pagos (fecha DESC);
CREATE UNIQUE INDEX IF NOT EXISTS cxc_pagos_coda_row_unq
  ON erp.cxc_pagos (coda_row_id) WHERE coda_row_id IS NOT NULL;

-- ─── Capa 3: erp.cxc_pago_aplicaciones (la aplicación N:M) ─────────────

CREATE TABLE IF NOT EXISTS erp.cxc_pago_aplicaciones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL REFERENCES core.empresas (id),
  pago_id uuid NOT NULL REFERENCES erp.cxc_pagos (id) ON DELETE CASCADE,
  cargo_id uuid NOT NULL REFERENCES erp.cxc_cargos (id),
  monto_aplicado numeric(14, 2) NOT NULL CHECK (monto_aplicado > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  -- Un par (pago, cargo) se aplica una sola vez; reasignar = UPDATE/DELETE.
  CONSTRAINT cxc_pago_aplicaciones_pago_cargo_unq UNIQUE (pago_id, cargo_id)
);

COMMENT ON TABLE erp.cxc_pago_aplicaciones IS
  'Aplicación N:M de un abono a uno o varios cargos. La invariante Σ aplicaciones del pago ≤ pago.monto_total se valida en la RPC de aplicación (PR A2). ADR-037 D1.';

CREATE INDEX IF NOT EXISTS cxc_pago_aplicaciones_pago_idx
  ON erp.cxc_pago_aplicaciones (pago_id);
CREATE INDEX IF NOT EXISTS cxc_pago_aplicaciones_cargo_idx
  ON erp.cxc_pago_aplicaciones (cargo_id);

-- ─── Trigger: recálculo de saldo del cargo (ADR-037 D3) ───────────────
-- AFTER INSERT/UPDATE/DELETE en aplicaciones → recalcula monto_pagado y
-- estado del/los cargo(s) afectado(s) con SELECT SUM directo (sin
-- recursión: el trigger vive en aplicaciones, no en cargos).

CREATE OR REPLACE FUNCTION erp.fn_cxc_recalc_cargo_saldo()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = erp, public
AS $$
DECLARE
  v_cargos uuid[] := ARRAY[]::uuid[];
  v_cargo_id uuid;
  v_pagado numeric(14, 2);
BEGIN
  IF (TG_OP = 'INSERT' OR TG_OP = 'UPDATE') THEN
    v_cargos := array_append(v_cargos, NEW.cargo_id);
  END IF;
  IF (TG_OP = 'DELETE' OR TG_OP = 'UPDATE') THEN
    v_cargos := array_append(v_cargos, OLD.cargo_id);
  END IF;

  FOR v_cargo_id IN SELECT DISTINCT unnest(v_cargos) LOOP
    SELECT COALESCE(SUM(a.monto_aplicado), 0)
      INTO v_pagado
      FROM erp.cxc_pago_aplicaciones a
     WHERE a.cargo_id = v_cargo_id;

    UPDATE erp.cxc_cargos cg
       SET monto_pagado = v_pagado,
           estado = CASE
             WHEN cg.estado = 'cancelado' THEN 'cancelado'
             WHEN v_pagado <= 0 THEN 'pendiente'
             WHEN v_pagado >= cg.monto THEN 'liquidado'
             ELSE 'parcial'
           END,
           updated_at = now()
     WHERE cg.id = v_cargo_id;
  END LOOP;

  RETURN NULL;
END;
$$;

COMMENT ON FUNCTION erp.fn_cxc_recalc_cargo_saldo() IS
  'Recalcula cxc_cargos.monto_pagado y estado desde cxc_pago_aplicaciones. Trigger AFTER en aplicaciones (sin recursión). ADR-037 D3.';

DROP TRIGGER IF EXISTS trg_cxc_recalc_cargo_saldo ON erp.cxc_pago_aplicaciones;
CREATE TRIGGER trg_cxc_recalc_cargo_saldo
  AFTER INSERT OR UPDATE OR DELETE ON erp.cxc_pago_aplicaciones
  FOR EACH ROW EXECUTE FUNCTION erp.fn_cxc_recalc_cargo_saldo();

-- ─── RLS ──────────────────────────────────────────────────────────────
-- Patrón canónico (igual que erp.finiquitos): SELECT/INSERT a miembros
-- de la empresa o admin; UPDATE/DELETE solo admin (las mutaciones de
-- negocio pasan por RPCs SECURITY DEFINER en PR A2, que bypassean RLS).

ALTER TABLE erp.cxc_cargos ENABLE ROW LEVEL SECURITY;
ALTER TABLE erp.cxc_pagos ENABLE ROW LEVEL SECURITY;
ALTER TABLE erp.cxc_pago_aplicaciones ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['cxc_cargos', 'cxc_pagos', 'cxc_pago_aplicaciones'] LOOP
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
