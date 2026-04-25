-- RLS para erp.empleado_beneficiarios (Art. 501 LFT).
-- Replica el patrón empresa-scoped de erp.empleados:
-- acceso solo para usuarios de la empresa dueña o admins.

ALTER TABLE erp.empleado_beneficiarios ENABLE ROW LEVEL SECURITY;

CREATE POLICY erp_empleado_beneficiarios_select
  ON erp.empleado_beneficiarios
  FOR SELECT
  TO authenticated
  USING (core.fn_has_empresa(empresa_id) OR core.fn_is_admin());

CREATE POLICY erp_empleado_beneficiarios_insert
  ON erp.empleado_beneficiarios
  FOR INSERT
  TO authenticated
  WITH CHECK (core.fn_has_empresa(empresa_id) OR core.fn_is_admin());

CREATE POLICY erp_empleado_beneficiarios_update
  ON erp.empleado_beneficiarios
  FOR UPDATE
  TO authenticated
  USING (core.fn_has_empresa(empresa_id) OR core.fn_is_admin())
  WITH CHECK (core.fn_has_empresa(empresa_id) OR core.fn_is_admin());

CREATE POLICY erp_empleado_beneficiarios_delete
  ON erp.empleado_beneficiarios
  FOR DELETE
  TO authenticated
  USING (core.fn_has_empresa(empresa_id) OR core.fn_is_admin());
