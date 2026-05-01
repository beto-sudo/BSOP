-- Sprint 1 — Schema delta para import de empleados CONTPAQi (DILESA + RDB)
--
-- Iniciativa: import-empleados-contpaqi (ver docs/planning/import-empleados-contpaqi.md).
--
-- Pasos:
--   1. ALTER core.empresas — agregar rpi_imss (Registro Patronal IMSS).
--   2. ALTER erp.empleados — agregar 6 columnas nuevas (umf, zona_salario,
--      regimen_imss, tipo_prestacion, sindicalizado, metodo_pago_sat).
--   3. CREATE TABLE erp.empleados_pago — banco/cuenta/CLABE 1:N por empleado
--      con vigente bool (mismo patrón que erp.empleados_compensacion).
--   4. CREATE TABLE erp.empleados_import_log — audit trail del import,
--      una fila por insert/update/baja aplicada.
--   5. NOTIFY pgrst para refrescar el cache de schema.
--
-- Notas:
--   - NO existe UNIQUE constraint en erp.empleados.(empresa_id, persona_id),
--     verificado en supabase/migrations/20260414000000_erp_schema_v3.sql:117-121
--     (solo hay INDEX no-único). Por lo tanto NO hay que relajar nada para
--     soportar el caso RDB-en-DILESA (alta+baja en DILESA, alta nueva en RDB).
--   - RLS sigue el patrón canónico: SELECT/INSERT/UPDATE abiertos a miembros de
--     la empresa o admin; DELETE solo admin. empleados_import_log es write-only
--     desde la app (admin o función con SECURITY DEFINER) — DELETE solo admin.

BEGIN;

-- =============================================================================
-- 1. core.empresas — Registro Patronal IMSS
-- =============================================================================
ALTER TABLE core.empresas
  ADD COLUMN IF NOT EXISTS rpi_imss text;

COMMENT ON COLUMN core.empresas.rpi_imss IS
  'Registro Patronal IMSS de la empresa (ej. A3226708107). Atributo del patrón, no del empleado. Cargado desde el Excel CONTPAQi en la iniciativa import-empleados-contpaqi.';

-- =============================================================================
-- 2. erp.empleados — campos IMSS y SAT por empleado
-- =============================================================================
ALTER TABLE erp.empleados
  ADD COLUMN IF NOT EXISTS umf text,
  ADD COLUMN IF NOT EXISTS zona_salario text,
  ADD COLUMN IF NOT EXISTS regimen_imss text,
  ADD COLUMN IF NOT EXISTS tipo_prestacion text,
  ADD COLUMN IF NOT EXISTS sindicalizado text,
  ADD COLUMN IF NOT EXISTS metodo_pago_sat text;

COMMENT ON COLUMN erp.empleados.umf IS
  'Unidad de Medicina Familiar IMSS asignada al empleado (ej. "79"). Origen: CONTPAQi Nóminas.';

COMMENT ON COLUMN erp.empleados.zona_salario IS
  'Zona de salario mínimo CONASAMI (A=ZLFN, B/C=resto). Origen: CONTPAQi Nóminas. Se cruza con lib/hr/salario-minimo-zona.ts.';

COMMENT ON COLUMN erp.empleados.regimen_imss IS
  'Código SAT del régimen del empleado (ej. "02" = Sueldos). Origen: CONTPAQi Nóminas.';

COMMENT ON COLUMN erp.empleados.tipo_prestacion IS
  'Nivel de prestaciones: "De_Ley" o "Superior_a_Ley". Origen: CONTPAQi Nóminas.';

COMMENT ON COLUMN erp.empleados.sindicalizado IS
  'Categoría laboral: "C" (Confianza) o "S" (Sindicalizado). Origen: CONTPAQi Nóminas.';

COMMENT ON COLUMN erp.empleados.metodo_pago_sat IS
  'Código SAT del método de pago (ej. "28" = transferencia). Origen: CONTPAQi Nóminas.';

-- =============================================================================
-- 3. erp.empleados_pago — banco/cuenta/CLABE por empleado, 1:N con vigente
-- =============================================================================
CREATE TABLE erp.empleados_pago (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL REFERENCES core.empresas(id),
  empleado_id uuid NOT NULL REFERENCES erp.empleados(id) ON DELETE CASCADE,
  banco_codigo text,
  banco_nombre text,
  numero_cuenta text,
  clabe text,
  sucursal text,
  vigente boolean NOT NULL DEFAULT true,
  fecha_inicio date,
  fecha_fin date,
  notas text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz,

  -- Al menos uno de banco_codigo o banco_nombre debe estar.
  CONSTRAINT chk_empleados_pago_banco_present CHECK (
    (banco_codigo IS NOT NULL AND length(trim(banco_codigo)) > 0)
    OR (banco_nombre IS NOT NULL AND length(trim(banco_nombre)) > 0)
  ),
  -- Al menos uno de numero_cuenta o clabe debe estar.
  CONSTRAINT chk_empleados_pago_identificador_present CHECK (
    (numero_cuenta IS NOT NULL AND length(trim(numero_cuenta)) > 0)
    OR (clabe IS NOT NULL AND length(trim(clabe)) > 0)
  ),
  -- CLABE mexicana = 18 dígitos (cuando se proporcione).
  CONSTRAINT chk_empleados_pago_clabe_format CHECK (
    clabe IS NULL OR clabe ~ '^[0-9]{18}$'
  )
);

COMMENT ON TABLE erp.empleados_pago IS
  'Cuenta bancaria de pago de nómina por empleado. 1:N con vigente=true para el activo, mismo patrón que erp.empleados_compensacion. Histórico de cambios de cuenta queda en filas con vigente=false. Iniciativa: import-empleados-contpaqi.';

COMMENT ON COLUMN erp.empleados_pago.banco_codigo IS
  'Código de banco SAT/SPEI de 3 dígitos (ej. "012" = BBVA Bancomer). Cuando se conoce, se prefiere sobre banco_nombre.';

COMMENT ON COLUMN erp.empleados_pago.vigente IS
  'true = cuenta activa para depósitos. Solo una vigente por empleado (uq_empleados_pago_vigente).';

CREATE INDEX idx_empleados_pago_empleado_id
  ON erp.empleados_pago (empleado_id);

CREATE INDEX idx_empleados_pago_empresa_id
  ON erp.empleados_pago (empresa_id);

CREATE INDEX idx_empleados_pago_vigente
  ON erp.empleados_pago (empleado_id, vigente);

-- Solo una cuenta vigente por empleado.
CREATE UNIQUE INDEX uq_empleados_pago_vigente
  ON erp.empleados_pago (empleado_id)
  WHERE vigente = true;

ALTER TABLE erp.empleados_pago ENABLE ROW LEVEL SECURITY;

CREATE POLICY erp_empleados_pago_select ON erp.empleados_pago
  FOR SELECT USING (core.fn_has_empresa(empresa_id) OR core.fn_is_admin());
CREATE POLICY erp_empleados_pago_insert ON erp.empleados_pago
  FOR INSERT WITH CHECK (core.fn_has_empresa(empresa_id) OR core.fn_is_admin());
CREATE POLICY erp_empleados_pago_update ON erp.empleados_pago
  FOR UPDATE USING (core.fn_has_empresa(empresa_id) OR core.fn_is_admin());
CREATE POLICY erp_empleados_pago_delete ON erp.empleados_pago
  FOR DELETE USING (core.fn_is_admin());

CREATE TRIGGER trg_empleados_pago_updated_at
  BEFORE UPDATE ON erp.empleados_pago
  FOR EACH ROW EXECUTE FUNCTION core.fn_set_updated_at();

-- =============================================================================
-- 4. erp.empleados_import_log — audit trail del import CONTPAQi
-- =============================================================================
CREATE TABLE erp.empleados_import_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL REFERENCES core.empresas(id),
  empleado_id uuid REFERENCES erp.empleados(id) ON DELETE SET NULL,
  persona_id uuid REFERENCES erp.personas(id) ON DELETE SET NULL,
  snapshot_fecha date NOT NULL,
  origen text NOT NULL,
  accion text NOT NULL,
  match_metodo text,
  diff jsonb NOT NULL DEFAULT '{}'::jsonb,
  notas text,
  created_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT chk_empleados_import_log_accion CHECK (
    accion IN ('insert', 'update', 'baja', 'skip', 'conflict')
  ),
  CONSTRAINT chk_empleados_import_log_match_metodo CHECK (
    match_metodo IS NULL OR match_metodo IN ('curp', 'rfc', 'fuzzy_nombre_fecha', 'numero_empleado', 'manual')
  )
);

COMMENT ON TABLE erp.empleados_import_log IS
  'Audit trail del import de empleados desde CONTPAQi (o futuras fuentes). Una fila por acción aplicada al empleado/persona en cada snapshot. diff jsonb captura el cambio exacto. Iniciativa: import-empleados-contpaqi.';

COMMENT ON COLUMN erp.empleados_import_log.origen IS
  'Identificador de la fuente y snapshot, ej. "contpaqi_export_2026-04-30".';

COMMENT ON COLUMN erp.empleados_import_log.accion IS
  'insert | update | baja | skip | conflict. "skip" = persona excluida (ej. accionista no presente). "conflict" = match ambiguo, requiere resolución manual.';

COMMENT ON COLUMN erp.empleados_import_log.match_metodo IS
  'Cómo se hizo match con la persona existente: curp | rfc | fuzzy_nombre_fecha | numero_empleado | manual. NULL en inserts nuevos.';

COMMENT ON COLUMN erp.empleados_import_log.diff IS
  'Cambios aplicados como jsonb. Para insert: snapshot completo. Para update: { "campo": { "antes": ..., "despues": ... } }. Para baja: { "fecha_baja": "...", "motivo_baja": "..." }.';

CREATE INDEX idx_empleados_import_log_empresa_id
  ON erp.empleados_import_log (empresa_id);

CREATE INDEX idx_empleados_import_log_empleado_id
  ON erp.empleados_import_log (empleado_id);

CREATE INDEX idx_empleados_import_log_persona_id
  ON erp.empleados_import_log (persona_id);

CREATE INDEX idx_empleados_import_log_snapshot
  ON erp.empleados_import_log (snapshot_fecha, origen);

ALTER TABLE erp.empleados_import_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY erp_empleados_import_log_select ON erp.empleados_import_log
  FOR SELECT USING (core.fn_has_empresa(empresa_id) OR core.fn_is_admin());
CREATE POLICY erp_empleados_import_log_insert ON erp.empleados_import_log
  FOR INSERT WITH CHECK (core.fn_has_empresa(empresa_id) OR core.fn_is_admin());
-- UPDATE y DELETE solo admin: el log es append-only por construcción.
CREATE POLICY erp_empleados_import_log_update ON erp.empleados_import_log
  FOR UPDATE USING (core.fn_is_admin());
CREATE POLICY erp_empleados_import_log_delete ON erp.empleados_import_log
  FOR DELETE USING (core.fn_is_admin());

-- =============================================================================
-- 5. Refrescar cache de PostgREST
-- =============================================================================
NOTIFY pgrst, 'reload schema';

COMMIT;
