-- ╭─ 20260625193524_dilesa_catalogo_cuentas ─╮
-- Iniciativa dilesa-catalogo-contable · Sprint 1 · schema.
-- Catálogo de cuentas contables (estructura de CONTPAQi / código agrupador SAT),
-- jerárquico y por empresa. Es la base para clasificar contablemente los egresos
-- que ya pasan por CxP (Sprint 2) y, a futuro, para migrar la contabilidad de
-- CONTPAQi a BSOP. v1 NO incluye partida doble / pólizas / balanza (línea roja).
--
-- La CARGA de las 1,331 cuentas de DILESA va en una migración de datos aparte
-- (la emite el loader scripts/import-contpaqi/dilesa_catalogo_cuentas.py).
--
-- Aditivo puro: tabla nueva vacía, no afecta datos ni otras empresas.

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Tabla
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS erp.cuentas_contables (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL REFERENCES core.empresas (id),
  -- Número natural de CONTPAQi, segmentado (máscara 3-2-3, p.ej. '601-01-000').
  -- Clave de negocio por empresa.
  numero text NOT NULL,
  -- Crudo de 8 dígitos como viene en el export ('60101000'); traza al origen.
  codigo_contpaqi text,
  nombre text NOT NULL,
  -- Naturaleza del saldo. Deriva del tipo de cuenta CONTPAQi en el loader.
  naturaleza text NOT NULL CHECK (naturaleza IN ('deudora', 'acreedora')),
  -- Grupo mayor, del primer dígito (1 Activo … 8 Cuentas de orden).
  tipo text NOT NULL CHECK (tipo IN (
    'activo', 'pasivo', 'capital', 'ingreso', 'costo', 'gasto', 'resultado', 'orden'
  )),
  -- Profundidad jerárquica del export (0 = grupo, 1 = mayor, 2.. = subcuentas).
  nivel integer NOT NULL,
  -- Jerarquía padre-hijo dentro del catálogo de la MISMA empresa.
  cuenta_padre_id uuid REFERENCES erp.cuentas_contables (id),
  -- Código agrupador SAT (Anexo 24), notación de punto ('601.01'). Columna text
  -- por ahora; la tabla de referencia nacional se difiere (ver planning doc).
  codigo_agrupador_sat text,
  -- Solo las hojas (cuentas de detalle) son afectables/registrables.
  afectable boolean NOT NULL DEFAULT true,
  activa boolean NOT NULL DEFAULT true,
  -- Procedencia del registro ('contpaqi' para el import; 'manual' para altas en BSOP).
  origen text NOT NULL DEFAULT 'contpaqi',
  notas text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  UNIQUE (empresa_id, numero)
);

COMMENT ON TABLE erp.cuentas_contables IS
  'Catálogo de cuentas contables por empresa (estructura CONTPAQi / agrupador SAT). Iniciativa dilesa-catalogo-contable.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Índices (FK lookups + filtros del selector de CxP)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_cuentas_contables_empresa
  ON erp.cuentas_contables (empresa_id);
CREATE INDEX IF NOT EXISTS idx_cuentas_contables_padre
  ON erp.cuentas_contables (cuenta_padre_id) WHERE cuenta_padre_id IS NOT NULL;
-- El selector de CxP filtra a hojas activas vivas: índice parcial estrecho.
CREATE INDEX IF NOT EXISTS idx_cuentas_contables_afectables
  ON erp.cuentas_contables (empresa_id, numero)
  WHERE afectable AND activa AND deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_cuentas_contables_agrupador
  ON erp.cuentas_contables (codigo_agrupador_sat) WHERE codigo_agrupador_sat IS NOT NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Trigger updated_at (función estándar erp.fn_set_updated_at)
-- ─────────────────────────────────────────────────────────────────────────────

DROP TRIGGER IF EXISTS erp_cuentas_contables_updated_at ON erp.cuentas_contables;
CREATE TRIGGER erp_cuentas_contables_updated_at BEFORE UPDATE ON erp.cuentas_contables
  FOR EACH ROW EXECUTE FUNCTION erp.fn_set_updated_at();

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Grants + RLS (aislamiento por empresa, set-membership — evita el timeout
--    por-fila de fn_has_empresa, ver reference_rls_fn_has_empresa_per_row)
-- ─────────────────────────────────────────────────────────────────────────────

GRANT SELECT, INSERT, UPDATE, DELETE ON erp.cuentas_contables TO authenticated;

ALTER TABLE erp.cuentas_contables ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  pred text := '(empresa_id IN (SELECT core.fn_current_empresa_ids()) OR core.fn_is_admin())';
BEGIN
  DROP POLICY IF EXISTS erp_cuentas_contables_select ON erp.cuentas_contables;
  DROP POLICY IF EXISTS erp_cuentas_contables_insert ON erp.cuentas_contables;
  DROP POLICY IF EXISTS erp_cuentas_contables_update ON erp.cuentas_contables;
  DROP POLICY IF EXISTS erp_cuentas_contables_delete ON erp.cuentas_contables;
  EXECUTE format('CREATE POLICY erp_cuentas_contables_select ON erp.cuentas_contables FOR SELECT TO authenticated USING %s', pred);
  EXECUTE format('CREATE POLICY erp_cuentas_contables_insert ON erp.cuentas_contables FOR INSERT TO authenticated WITH CHECK %s', pred);
  EXECUTE format('CREATE POLICY erp_cuentas_contables_update ON erp.cuentas_contables FOR UPDATE TO authenticated USING %1$s WITH CHECK %1$s', pred);
  EXECUTE format('CREATE POLICY erp_cuentas_contables_delete ON erp.cuentas_contables FOR DELETE TO authenticated USING %s', pred);
END $$;

-- Recarga el cache de PostgREST (tabla nueva expuesta vía supabase-js):
NOTIFY pgrst, 'reload schema';

COMMIT;
