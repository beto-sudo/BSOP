-- ============================================================================
-- DILESA · Ventas captura Fase 1 — schema para cálculo de precio
-- ----------------------------------------------------------------------------
-- Sprint 7a del módulo Ventas. Agrega lo necesario para calcular el precio de
-- venta de una unidad al momento de capturar una Solicitud de Asignación:
--
-- 1. Extensiones a `dilesa.proyectos`:
--    - precio_m2_excedente: precio por m² del terreno excedente al lote promedio
--    - tamano_lote_promedio: m² del lote "base" por proyecto
--    - clasificacion_inmobiliaria: 'interes_social' | 'residencial_medio' |
--      'residencial_alto' — determina el % de esquina (15% / 3.2% / 3.2%)
--
-- 2. Extensión a `dilesa.unidades`:
--    - valor_venta_futuro_snapshot: monto "+1% por mes faltante" que en Coda se
--      calcula dinámicamente desde tareas de obra pendientes. Mientras no
--      tengamos módulo de obra en BSOP, se guarda como snapshot manual desde
--      Coda en cada refresh del cron.
--
-- 3. Catálogos nuevos:
--    - dilesa.tipos_credito (10 tipos del CSV con costo_venta_adicional_pct +
--      apoyo_infonavit_monto)
--    - dilesa.promociones (catálogo de bonos/descuentos por prototipo)
--
-- Idempotente: ADD COLUMN IF NOT EXISTS + CREATE TABLE IF NOT EXISTS.
-- ============================================================================

BEGIN;

-- ── dilesa.proyectos: campos del cálculo ────────────────────────────────────
ALTER TABLE dilesa.proyectos
  ADD COLUMN IF NOT EXISTS precio_m2_excedente numeric(12,2),
  ADD COLUMN IF NOT EXISTS tamano_lote_promedio numeric(8,2),
  ADD COLUMN IF NOT EXISTS clasificacion_inmobiliaria text;

ALTER TABLE dilesa.proyectos
  DROP CONSTRAINT IF EXISTS proyectos_clasificacion_inmobiliaria_check;
ALTER TABLE dilesa.proyectos
  ADD CONSTRAINT proyectos_clasificacion_inmobiliaria_check
  CHECK (clasificacion_inmobiliaria IS NULL OR clasificacion_inmobiliaria IN (
    'interes_social',
    'residencial_medio',
    'residencial_alto',
    'plaza_comercial',
    'industrial',
    'mixto'
  ));

COMMENT ON COLUMN dilesa.proyectos.precio_m2_excedente IS
  'Precio por m² aplicado al terreno excedente al tamaño_lote_promedio. Coda: Precio M² Excedente.';
COMMENT ON COLUMN dilesa.proyectos.tamano_lote_promedio IS
  'm² del lote base/promedio del proyecto. Lotes mayores generan excedente.';
COMMENT ON COLUMN dilesa.proyectos.clasificacion_inmobiliaria IS
  'Tipo de proyecto. Determina el % esquina (interés social=15%, residencial=3.2%).';

-- ── dilesa.unidades: snapshot de valor venta futuro ─────────────────────────
ALTER TABLE dilesa.unidades
  ADD COLUMN IF NOT EXISTS valor_venta_futuro_snapshot numeric(14,2) DEFAULT 0;

COMMENT ON COLUMN dilesa.unidades.valor_venta_futuro_snapshot IS
  'Monto +1% por mes faltante de obra. Snapshot del cálculo dinámico de Coda mientras no tengamos módulo de obra. Refrescado por el cron diario.';

-- ── dilesa.tipos_credito: catálogo ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS dilesa.tipos_credito (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL REFERENCES core.empresas(id) ON DELETE RESTRICT,
  nombre text NOT NULL,
  costo_venta_adicional_pct numeric(5,4) NOT NULL DEFAULT 0,
  apoyo_infonavit_monto numeric(14,2) NOT NULL DEFAULT 0,
  activo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  CONSTRAINT tipos_credito_nombre_empresa_uk UNIQUE (empresa_id, nombre)
);

CREATE INDEX IF NOT EXISTS dilesa_tipos_credito_empresa_idx
  ON dilesa.tipos_credito (empresa_id) WHERE deleted_at IS NULL;

ALTER TABLE dilesa.tipos_credito ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tipos_credito_select ON dilesa.tipos_credito;
CREATE POLICY tipos_credito_select ON dilesa.tipos_credito
  FOR SELECT TO authenticated
  USING (deleted_at IS NULL AND (core.fn_has_empresa(empresa_id) OR core.fn_is_admin()));

DROP POLICY IF EXISTS tipos_credito_write ON dilesa.tipos_credito;
CREATE POLICY tipos_credito_write ON dilesa.tipos_credito
  TO authenticated
  USING (core.fn_has_empresa(empresa_id) OR core.fn_is_admin())
  WITH CHECK (core.fn_has_empresa(empresa_id) OR core.fn_is_admin());

DROP TRIGGER IF EXISTS dilesa_tipos_credito_updated_at ON dilesa.tipos_credito;
CREATE TRIGGER dilesa_tipos_credito_updated_at
  BEFORE UPDATE ON dilesa.tipos_credito
  FOR EACH ROW EXECUTE FUNCTION core.fn_set_updated_at();

COMMENT ON TABLE dilesa.tipos_credito IS
  'Catálogo de tipos de crédito DILESA. Sprint 7a Ventas. costo_venta_adicional_pct se suma al precio (ej. Fovissste +6%); apoyo_infonavit_monto se resta del pago directo del cliente (ej. $30,000 en Infonavit Tradicional).';

-- Seed: 10 tipos del CSV proporcionado por Beto
INSERT INTO dilesa.tipos_credito (empresa_id, nombre, costo_venta_adicional_pct, apoyo_infonavit_monto)
SELECT id, t.nombre, t.costo_pct, t.apoyo
FROM core.empresas e
CROSS JOIN (VALUES
  ('Infonavit Tradicional',    0.0000, 30000),
  ('Infonavit Unamos',         0.0000, 30000),
  ('Hipotecario',              0.0000,     0),
  ('Contado',                  0.0000,     0),
  ('Fovissste Tradicional',    0.0600,     0),
  ('Cofinavit',                0.0000,     0),
  ('Infonavit Conyugal',       0.0000, 30000),
  ('Fovissste para Todos',     0.0600,     0),
  ('Infonavit/Fovissste',      0.0600,     0),
  ('IMSS',                     0.0600,     0)
) AS t(nombre, costo_pct, apoyo)
WHERE e.slug = 'dilesa'
ON CONFLICT (empresa_id, nombre) DO UPDATE
SET costo_venta_adicional_pct = EXCLUDED.costo_venta_adicional_pct,
    apoyo_infonavit_monto = EXCLUDED.apoyo_infonavit_monto;

-- ── dilesa.promociones: catálogo ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS dilesa.promociones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL REFERENCES core.empresas(id) ON DELETE RESTRICT,
  nombre text NOT NULL,
  descripcion text,
  /** Array de producto_id (dilesa.productos.id) a los que aplica. Vacío = a ninguno (catálogo declarativo). */
  productos_aplicables uuid[] NOT NULL DEFAULT '{}',
  activa boolean NOT NULL DEFAULT true,
  vigencia_inicio date,
  vigencia_fin date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE INDEX IF NOT EXISTS dilesa_promociones_empresa_idx
  ON dilesa.promociones (empresa_id) WHERE deleted_at IS NULL;

ALTER TABLE dilesa.promociones ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS promociones_select ON dilesa.promociones;
CREATE POLICY promociones_select ON dilesa.promociones
  FOR SELECT TO authenticated
  USING (deleted_at IS NULL AND (core.fn_has_empresa(empresa_id) OR core.fn_is_admin()));

DROP POLICY IF EXISTS promociones_write ON dilesa.promociones;
CREATE POLICY promociones_write ON dilesa.promociones
  TO authenticated
  USING (core.fn_has_empresa(empresa_id) OR core.fn_is_admin())
  WITH CHECK (core.fn_has_empresa(empresa_id) OR core.fn_is_admin());

DROP TRIGGER IF EXISTS dilesa_promociones_updated_at ON dilesa.promociones;
CREATE TRIGGER dilesa_promociones_updated_at
  BEFORE UPDATE ON dilesa.promociones
  FOR EACH ROW EXECUTE FUNCTION core.fn_set_updated_at();

COMMENT ON TABLE dilesa.promociones IS
  'Catálogo de promociones/bonos DILESA. Sprint 7a Ventas. Vendedor selecciona al capturar Solicitud si aplica al prototipo de la unidad.';

-- Seed: 1 promoción vigente del CSV (Bono $15k para LDLE-ISC)
INSERT INTO dilesa.promociones (empresa_id, nombre, productos_aplicables, activa)
SELECT
  e.id,
  'Bono de hasta $15,000 en gastos de escrituración',
  COALESCE(ARRAY(SELECT id FROM dilesa.productos WHERE empresa_id = e.id AND nombre = 'LDLE-ISC'), '{}')::uuid[],
  true
FROM core.empresas e
WHERE e.slug = 'dilesa'
ON CONFLICT DO NOTHING;

NOTIFY pgrst, 'reload schema';

COMMIT;
