-- ════════════════════════════════════════════════════════════════════════════
-- Sprint dilesa-1a — dilesa.anteproyectos_prototipos_referencia (M:N)
-- ════════════════════════════════════════════════════════════════════════════
--
-- Enlaza cada anteproyecto con los prototipos que sirven de referencia para
-- su análisis financiero. La vista `dilesa.v_anteproyectos_analisis` usa esta
-- tabla para promediar valor_comercial, costos y derivar utilidad/margen
-- proyectados del anteproyecto.
--
-- Reemplaza el lookup de Coda "Prototipos Referencia para Análisis" — ver
-- /mnt/DILESA/knowledge/modules/anteproyectos-deep-dive.md §3 fila 35.

CREATE TABLE IF NOT EXISTS dilesa.anteproyectos_prototipos_referencia (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id       uuid NOT NULL REFERENCES core.empresas(id) ON DELETE RESTRICT,
  anteproyecto_id  uuid NOT NULL REFERENCES dilesa.anteproyectos(id) ON DELETE CASCADE,
  prototipo_id     uuid NOT NULL REFERENCES dilesa.prototipos(id) ON DELETE CASCADE,
  coda_row_id      text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT anteproyectos_prototipos_ref_uk
    UNIQUE (anteproyecto_id, prototipo_id)
);

CREATE INDEX IF NOT EXISTS dilesa_anteproyectos_prototipos_ref_empresa_idx
  ON dilesa.anteproyectos_prototipos_referencia(empresa_id);
CREATE INDEX IF NOT EXISTS dilesa_anteproyectos_prototipos_ref_ap_idx
  ON dilesa.anteproyectos_prototipos_referencia(anteproyecto_id);
CREATE INDEX IF NOT EXISTS dilesa_anteproyectos_prototipos_ref_proto_idx
  ON dilesa.anteproyectos_prototipos_referencia(prototipo_id);
CREATE UNIQUE INDEX IF NOT EXISTS dilesa_anteproyectos_prototipos_ref_coda_row_idx
  ON dilesa.anteproyectos_prototipos_referencia(empresa_id, coda_row_id)
  WHERE coda_row_id IS NOT NULL;

ALTER TABLE dilesa.anteproyectos_prototipos_referencia ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS anteproyectos_prototipos_ref_select
  ON dilesa.anteproyectos_prototipos_referencia;
CREATE POLICY anteproyectos_prototipos_ref_select
  ON dilesa.anteproyectos_prototipos_referencia
  FOR SELECT TO authenticated
  USING (core.fn_has_empresa(empresa_id) OR core.fn_is_admin());

DROP POLICY IF EXISTS anteproyectos_prototipos_ref_write
  ON dilesa.anteproyectos_prototipos_referencia;
CREATE POLICY anteproyectos_prototipos_ref_write
  ON dilesa.anteproyectos_prototipos_referencia
  FOR ALL TO authenticated
  USING (core.fn_has_empresa(empresa_id) OR core.fn_is_admin())
  WITH CHECK (core.fn_has_empresa(empresa_id) OR core.fn_is_admin());

COMMENT ON TABLE dilesa.anteproyectos_prototipos_referencia IS
  'M:N anteproyecto↔prototipo para análisis financiero proyectado. Alimenta v_anteproyectos_analisis.';
