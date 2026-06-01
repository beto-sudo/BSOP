-- Iniciativa dilesa-contratos-obra · Sprint 1 (schema)
--
-- Generaliza el contrato de obra para soportar NO-vivienda (urbanización,
-- obras de cabecera, tareas/trámites sueltos) + presupuesto de obra por
-- proyecto (replica la hoja RESUMEN de los Excel) + estimaciones de monto
-- (replica las hojas de detalle).
--
-- IVA: DILESA opera en frontera → tasa general 8%; algunos proveedores sin el
-- estímulo facturan al 16% (excepción). El desglose subtotal/IVA/total se
-- guarda DONDE esté especificado (no se infiere una tasa fija); `iva_tasa`
-- registra 8 ó 16 cuando se conoce. Renglones sin desglose entran solo con su
-- total y se completan al capturar/revisar la factura real.
--
-- No-destructivo: solo ADD COLUMN (con DEFAULT que backfilea los contratos de
-- vivienda existentes) + 2 tablas nuevas. No toca datos existentes.

-- ── 1) Generalizar dilesa.contratos_construccion ──────────────────────────
ALTER TABLE dilesa.contratos_construccion
  ADD COLUMN IF NOT EXISTS tipo           text         NOT NULL DEFAULT 'vivienda',
  ADD COLUMN IF NOT EXISTS anticipo_pct   numeric(5,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS retencion_pct  numeric(5,2) NOT NULL DEFAULT 5,
  ADD COLUMN IF NOT EXISTS valor_subtotal numeric(14,2),  -- sin IVA (no-vivienda); vivienda = null
  ADD COLUMN IF NOT EXISTS valor_iva      numeric(14,2),  -- valor_total (existente) = total c/IVA
  ADD COLUMN IF NOT EXISTS iva_tasa       numeric(5,2);   -- 8 (frontera) | 16 (excepción) | null

ALTER TABLE dilesa.contratos_construccion
  DROP CONSTRAINT IF EXISTS contratos_construccion_tipo_chk;
ALTER TABLE dilesa.contratos_construccion
  ADD CONSTRAINT contratos_construccion_tipo_chk
  CHECK (tipo IN ('vivienda', 'urbanizacion', 'obra_cabecera', 'tarea_menor'));

COMMENT ON COLUMN dilesa.contratos_construccion.tipo IS
  'vivienda (objeto = lotes) | urbanizacion | obra_cabecera | tarea_menor. '
  'Los contratos existentes quedan vivienda por DEFAULT.';
COMMENT ON COLUMN dilesa.contratos_construccion.anticipo_pct IS
  '% de anticipo del contrato (no-vivienda: 30/50/60% variable). Vivienda = 0.';
COMMENT ON COLUMN dilesa.contratos_construccion.retencion_pct IS
  '% retenido como fondo de garantía (vivienda 5%, urbanización suele 10%).';
COMMENT ON COLUMN dilesa.contratos_construccion.iva_tasa IS
  'Tasa de IVA del contrato: 8 (frontera, lo común) | 16 (proveedor sin estímulo) | null si no especificado.';

-- ── 2) Presupuesto de obra por proyecto (replica hoja RESUMEN) ────────────
CREATE TABLE IF NOT EXISTS dilesa.obra_presupuesto (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id              uuid NOT NULL REFERENCES core.empresas(id) ON DELETE RESTRICT,
  proyecto_id             uuid NOT NULL REFERENCES dilesa.proyectos(id) ON DELETE RESTRICT,
  etapa                   text,                  -- 'Anteproyecto' | 'Urbanización' | ...
  concepto                text NOT NULL,
  orden                   integer NOT NULL DEFAULT 0,
  presupuesto_previo      numeric(14,2),         -- total c/IVA (referencia)
  presupuesto_actualizado numeric(14,2),         -- total c/IVA (referencia)
  gasto_real_subtotal     numeric(14,2),         -- desglose donde esté especificado (facturado / CFDI)
  gasto_real_iva          numeric(14,2),
  gasto_real_total        numeric(14,2),
  gasto_real_iva_tasa     numeric(5,2),          -- 8 | 16 | null
  proveedor_texto         text,                  -- nombre tal cual del Excel (incl. Municipio/CFE/DILESA)
  proveedor_persona_id    uuid REFERENCES erp.personas(id) ON DELETE SET NULL,
  contrato_id             uuid REFERENCES dilesa.contratos_construccion(id) ON DELETE SET NULL,
  factura_ref             text,
  fecha_compromiso        date,
  notas                   text,
  source_ref              text,                  -- traza del origen (ej. 'LDS/RESUMEN/r37')
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now(),
  deleted_at              timestamptz
);
COMMENT ON TABLE dilesa.obra_presupuesto IS
  'Presupuesto de obra por proyecto (concepto x etapa): presupuesto previo/'
  'actualizado vs gasto real. Replica la hoja RESUMEN de los Excel de proyecto. '
  'IVA (8% frontera / 16% excepción) desglosado en gasto_real donde esté '
  'especificado; presupuesto queda como total c/IVA (referencia).';

ALTER TABLE dilesa.obra_presupuesto ENABLE ROW LEVEL SECURITY;
CREATE POLICY obra_presupuesto_select ON dilesa.obra_presupuesto FOR SELECT
  USING (deleted_at IS NULL AND (core.fn_has_empresa(empresa_id) OR core.fn_is_admin()));
CREATE POLICY obra_presupuesto_modify ON dilesa.obra_presupuesto FOR ALL
  USING (core.fn_has_empresa(empresa_id) OR core.fn_is_admin())
  WITH CHECK (core.fn_has_empresa(empresa_id) OR core.fn_is_admin());
CREATE TRIGGER tg_obra_presupuesto_updated_at BEFORE UPDATE ON dilesa.obra_presupuesto
  FOR EACH ROW EXECUTE FUNCTION core.fn_set_updated_at();
CREATE INDEX obra_presupuesto_proyecto_idx ON dilesa.obra_presupuesto (proyecto_id) WHERE deleted_at IS NULL;
CREATE INDEX obra_presupuesto_contrato_idx ON dilesa.obra_presupuesto (contrato_id) WHERE deleted_at IS NULL;

-- ── 3) Estimaciones de monto por contrato (replica hojas de detalle) ──────
CREATE TABLE IF NOT EXISTS dilesa.obra_estimaciones (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id    uuid NOT NULL REFERENCES core.empresas(id) ON DELETE RESTRICT,
  contrato_id   uuid NOT NULL REFERENCES dilesa.contratos_construccion(id) ON DELETE CASCADE,
  etiqueta      text NOT NULL,             -- 'Anticipo' | '1' | '2A' | 'Finiquito' | '1 adicional'
  orden         integer NOT NULL DEFAULT 0,
  fecha         date,
  factura_ref   text,
  subtotal      numeric(14,2),             -- desglose donde esté especificado (CFDI)
  iva           numeric(14,2),
  iva_tasa      numeric(5,2),              -- 8 | 16 | null
  monto_total   numeric(14,2) NOT NULL DEFAULT 0,
  retencion     numeric(14,2) NOT NULL DEFAULT 0,
  es_anticipo   boolean NOT NULL DEFAULT false,
  es_finiquito  boolean NOT NULL DEFAULT false,
  nota_pago     text,                      -- 'pagada' | 'pag 13 oct' (texto libre del Excel)
  source_ref    text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  deleted_at    timestamptz
);
COMMENT ON TABLE dilesa.obra_estimaciones IS
  'Estimaciones de monto por contrato de obra no-vivienda (anticipo + numeradas '
  '+ finiquito; etiqueta libre). IVA (8% frontera / 16% excepción) desglosado '
  'donde esté especificado. Vivienda usa dilesa.estimaciones (por tareas '
  'terminadas, ADR-033) — esta tabla es para monto directo por avance.';

ALTER TABLE dilesa.obra_estimaciones ENABLE ROW LEVEL SECURITY;
CREATE POLICY obra_estimaciones_select ON dilesa.obra_estimaciones FOR SELECT
  USING (deleted_at IS NULL AND (core.fn_has_empresa(empresa_id) OR core.fn_is_admin()));
CREATE POLICY obra_estimaciones_modify ON dilesa.obra_estimaciones FOR ALL
  USING (core.fn_has_empresa(empresa_id) OR core.fn_is_admin())
  WITH CHECK (core.fn_has_empresa(empresa_id) OR core.fn_is_admin());
CREATE TRIGGER tg_obra_estimaciones_updated_at BEFORE UPDATE ON dilesa.obra_estimaciones
  FOR EACH ROW EXECUTE FUNCTION core.fn_set_updated_at();
CREATE INDEX obra_estimaciones_contrato_idx ON dilesa.obra_estimaciones (contrato_id) WHERE deleted_at IS NULL;

NOTIFY pgrst, 'reload schema';
