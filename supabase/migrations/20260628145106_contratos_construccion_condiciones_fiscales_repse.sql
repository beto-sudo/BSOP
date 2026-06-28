-- ╭─ 20260628145106_contratos_construccion_condiciones_fiscales_repse ─╮
-- Sprint 2 · iniciativa dilesa-adjudicacion-contrato-obra
--
-- Las condiciones del contrato de obra se capturan donde se comprometen. Agrega:
--   • forma_pago / modalidad_precio (alzado | unitarios | administracion)
--   • RETENCIÓN FISCAL separada de la garantía. `retencion_pct` (ya existente) es
--     la retención de GARANTÍA (civil — DILESA la guarda y la regresa en el
--     finiquito). Estas dos son FISCALES (DILESA retiene y ENTERA al SAT):
--       - retencion_fiscal_isr_pct  (servicios — típico 1.25 % estatal o el que aplique)
--       - retencion_fiscal_iva_pct  (6 % de IVA, SOLO servicios especializados REPSE
--         con personal a disposición; NO regla general post-reforma 2021)
--   • es_mano_obra / personal_a_disposicion — `personal_a_disposicion` (no solo
--     "mano de obra") es lo que detona el riesgo REPSE y la retención de IVA 6 %.
--   • repse_override_* — audit del override de Dirección cuando se contrata mano de
--     obra a disposición a un contratista sin REPSE vigente (admin-nunca-bloqueado).
--
-- Línea roja: NO toca los acumuladores de runtime de CxP de obra (anticipo
-- amortizado / retención acumulada / tope) — esos son de dilesa-obra-estimaciones-cxp.
-- Additiva y defensiva: columnas nullable/DEFAULT, sin reescritura ni lock pesado.
-- RLS de dilesa.contratos_construccion (empresa-scoped) se hereda sin cambios.

BEGIN;

ALTER TABLE dilesa.contratos_construccion
  ADD COLUMN IF NOT EXISTS forma_pago text,
  ADD COLUMN IF NOT EXISTS modalidad_precio text,
  ADD COLUMN IF NOT EXISTS es_mano_obra boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS personal_a_disposicion boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS retencion_fiscal_isr_pct numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS retencion_fiscal_iva_pct numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS repse_override_at timestamptz,
  ADD COLUMN IF NOT EXISTS repse_override_por uuid,
  ADD COLUMN IF NOT EXISTS repse_override_motivo text;

-- modalidad_precio acotada (nullable = "sin especificar"; las filas existentes son NULL).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'contratos_construccion_modalidad_precio_chk'
  ) THEN
    ALTER TABLE dilesa.contratos_construccion
      ADD CONSTRAINT contratos_construccion_modalidad_precio_chk
      CHECK (modalidad_precio IS NULL OR modalidad_precio IN ('alzado', 'unitarios', 'administracion'));
  END IF;
END $$;

COMMENT ON COLUMN dilesa.contratos_construccion.forma_pago IS
  'Forma/condiciones de pago acordadas (ej. transferencia 15 días, contra estimación).';
COMMENT ON COLUMN dilesa.contratos_construccion.modalidad_precio IS
  'Modalidad de precio: alzado (precio fijo) | unitarios (por concepto) | administracion (costo + honorario).';
COMMENT ON COLUMN dilesa.contratos_construccion.es_mano_obra IS
  'El contrato es de mano de obra / servicio (no suministro de material).';
COMMENT ON COLUMN dilesa.contratos_construccion.personal_a_disposicion IS
  'Personal del contratista a disposición de DILESA → detona riesgo REPSE + retención de IVA 6 % (servicios especializados, reforma 2021). Distinto de obra a resultado.';
COMMENT ON COLUMN dilesa.contratos_construccion.retencion_fiscal_isr_pct IS
  'Retención FISCAL de ISR (se entera al SAT). Distinta de retencion_pct (garantía civil que se regresa en el finiquito).';
COMMENT ON COLUMN dilesa.contratos_construccion.retencion_fiscal_iva_pct IS
  'Retención FISCAL de IVA (se entera al SAT). 6 % aplica SOLO a servicios especializados REPSE con personal a disposición.';
COMMENT ON COLUMN dilesa.contratos_construccion.repse_override_motivo IS
  'Motivo del override de Dirección al contratar mano de obra a disposición sin REPSE vigente (con repse_override_at/_por como audit).';

-- Recarga el cache de PostgREST (columnas nuevas en tabla con embeds):
NOTIFY pgrst, 'reload schema';

COMMIT;
