-- ╭─ 20260611213218_estados_cuenta ─╮
-- Iniciativa: conciliacion-bancaria · v0 — archivo mensual de estados de
-- cuenta bancarios con totales de carátula, para conciliación a nivel mes
-- (checksum interno + continuidad inter-mes + cruce vs snapshot capturado).
-- Ver docs/planning/conciliacion-bancaria.md
--
-- Una fila por cuenta × mes. El PDF original se archiva en el bucket
-- `adjuntos` (path en archivo_path); `extraccion` guarda el payload crudo de
-- la extracción IA para audit. La conciliación v1 (nivel movimiento) vendrá
-- en tabla aparte cuando CxC/CxP emitan movimientos bancarios (ADR-037).

BEGIN;

CREATE TABLE IF NOT EXISTS erp.estados_cuenta (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id        uuid NOT NULL REFERENCES core.empresas (id),
  cuenta_id         uuid NOT NULL REFERENCES erp.cuentas_bancarias (id),
  -- Primer día del mes del periodo (CHECK abajo). UNIQUE por cuenta.
  periodo           date NOT NULL,
  fecha_corte       date NOT NULL,
  saldo_inicial     numeric NOT NULL,
  depositos         numeric NOT NULL DEFAULT 0,
  retiros           numeric NOT NULL DEFAULT 0,
  saldo_final       numeric NOT NULL,
  -- Posición en inversiones al corte (ej. reporto Monex), reportada por el
  -- banco FUERA del saldo vista. Saldo real de la cuenta = final + inversiones.
  saldo_inversiones numeric NOT NULL DEFAULT 0,
  num_abonos        integer,
  num_cargos        integer,
  comisiones        numeric,
  -- Path dentro del bucket `adjuntos` (convención ADR-022).
  archivo_path      text,
  -- Payload crudo de la extracción IA (audit de qué leyó el modelo).
  extraccion        jsonb,
  notas             text,
  capturado_por     uuid,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz,
  CONSTRAINT estados_cuenta_periodo_dia1 CHECK (periodo = date_trunc('month', periodo)::date),
  CONSTRAINT estados_cuenta_cuenta_periodo_uniq UNIQUE (cuenta_id, periodo)
);

CREATE INDEX IF NOT EXISTS estados_cuenta_empresa_periodo_idx
  ON erp.estados_cuenta (empresa_id, periodo DESC);

-- RLS canónica erp: aislamiento por empresa (patrón de erp.cuenta_saldos)
ALTER TABLE erp.estados_cuenta ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS erp_estados_cuenta_select ON erp.estados_cuenta;
CREATE POLICY erp_estados_cuenta_select ON erp.estados_cuenta FOR SELECT
  USING (core.fn_has_empresa(empresa_id) OR core.fn_is_admin());

DROP POLICY IF EXISTS erp_estados_cuenta_insert ON erp.estados_cuenta;
CREATE POLICY erp_estados_cuenta_insert ON erp.estados_cuenta FOR INSERT
  WITH CHECK (core.fn_has_empresa(empresa_id) OR core.fn_is_admin());

DROP POLICY IF EXISTS erp_estados_cuenta_update ON erp.estados_cuenta;
CREATE POLICY erp_estados_cuenta_update ON erp.estados_cuenta FOR UPDATE
  USING (core.fn_has_empresa(empresa_id) OR core.fn_is_admin())
  WITH CHECK (core.fn_has_empresa(empresa_id) OR core.fn_is_admin());

DROP POLICY IF EXISTS erp_estados_cuenta_delete ON erp.estados_cuenta;
CREATE POLICY erp_estados_cuenta_delete ON erp.estados_cuenta FOR DELETE
  USING (core.fn_has_empresa(empresa_id) OR core.fn_is_admin());

NOTIFY pgrst, 'reload schema';

COMMIT;
