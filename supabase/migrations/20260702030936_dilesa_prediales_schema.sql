-- ╭──────────────────────────────────────────────────────────────────╮
-- │  20260702030936_dilesa_prediales_schema                            │
-- │                                                                    │
-- │  Iniciativa `dilesa-portafolio-predios` — S1a (schema, DDL puro).  │
-- │  Control de impuesto predial por cuenta catastral:                 │
-- │    · cuentas_prediales    — 1 fila por clave catastral, FK activo  │
-- │    · prediales_ejercicios — cuenta × año (montos, estado, pago)    │
-- │    · prediales_convenios  — acuerdos de descuento con el municipio │
-- │                                                                    │
-- │  v1 = registro y control (decisión Beto 2026-07-01): NO toca CxP   │
-- │  ni tesorería. Aditivo y reversible.                               │
-- │  Ver docs/planning/dilesa-portafolio-predios.md.                   │
-- ╰──────────────────────────────────────────────────────────────────╯

BEGIN;

-- ─────────────────────────────────────────────────────────────────────
-- 0. dilesa.activos.zona — agrupador ligero por fraccionamiento/zona
--    (p.ej. "Lomas del Sol", "Ejido Villa de Fuente"). Se prefirió una
--    columna a crear pseudo-activos padre: el fraccionamiento vendido no
--    es un activo de DILESA; activo_padre_id queda reservado para linaje
--    real (plaza→local, subdivisiones).
-- ─────────────────────────────────────────────────────────────────────

ALTER TABLE dilesa.activos ADD COLUMN IF NOT EXISTS zona text;

COMMENT ON COLUMN dilesa.activos.zona IS
  'Fraccionamiento/zona a la que pertenece el predio (agrupador de UI y prediales). Texto libre normalizado por el loader. Iniciativa dilesa-portafolio-predios.';

CREATE INDEX IF NOT EXISTS activos_zona_idx
  ON dilesa.activos (empresa_id, zona) WHERE deleted_at IS NULL;

-- ─────────────────────────────────────────────────────────────────────
-- 1. dilesa.prediales_convenios — acuerdo con el municipio que modifica
--    lo exigible de uno o más ejercicios (p.ej. reducción 60% 2026-2027
--    a cambio de área verde en relotificación; acuerdo de palabra — este
--    registro ES el papel).
-- ─────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS dilesa.prediales_convenios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL REFERENCES core.empresas (id),
  nombre text NOT NULL,
  descuento_pct numeric NOT NULL DEFAULT 0 CHECK (descuento_pct >= 0 AND descuento_pct <= 100),
  ejercicio_desde integer NOT NULL,
  ejercicio_hasta integer NOT NULL,
  contraprestacion text,
  estado text NOT NULL DEFAULT 'vigente'
    CHECK (estado IN ('propuesto', 'vigente', 'cumplido', 'cancelado')),
  notas text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT prediales_convenios_rango_ck CHECK (ejercicio_hasta >= ejercicio_desde)
);

COMMENT ON TABLE dilesa.prediales_convenios IS
  'Acuerdos con el municipio que modifican lo exigible del predial (descuentos, condonaciones). El descuento se aplica al CALCULAR el adeudo neto — nunca reescribe los montos capturados del recibo. Iniciativa dilesa-portafolio-predios.';
COMMENT ON COLUMN dilesa.prediales_convenios.contraprestacion IS
  'Qué dio/da la empresa a cambio (p.ej. "predial 2025 pagado completo + entrega de área verde en relotificación"). Los acuerdos de palabra se documentan aquí íntegros.';

-- ─────────────────────────────────────────────────────────────────────
-- 2. dilesa.cuentas_prediales — identidad fiscal del predio ante
--    catastro. Entidad propia (no columnas de activos): una clave puede
--    amparar macro-lotes, sobrevive subdivisiones y a futuro podrá
--    ligarse a unidades de inventario en venta sin duplicarlas como
--    activos (columna unidad_id se agregará cuando se necesite).
-- ─────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS dilesa.cuentas_prediales (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL REFERENCES core.empresas (id),
  activo_id uuid REFERENCES dilesa.activos (id) ON DELETE SET NULL,
  clave_catastral text NOT NULL,
  folio text,
  municipio text,
  superficie_fiscal_m2 numeric,
  estatus text NOT NULL DEFAULT 'activa'
    CHECK (estatus IN ('activa', 'baja_subdivision', 'baja_fusion', 'baja_venta', 'baja_otro')),
  notas text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  CONSTRAINT cuentas_prediales_clave_uk UNIQUE (empresa_id, clave_catastral)
);

COMMENT ON TABLE dilesa.cuentas_prediales IS
  'Cuenta catastral del municipio (1 fila por clave). FK opcional al activo del portafolio; al subdividir/fusionar la cuenta vieja pasa a estatus baja_* y nacen cuentas nuevas. Iniciativa dilesa-portafolio-predios.';
COMMENT ON COLUMN dilesa.cuentas_prediales.folio IS
  'Folio del recibo/registro municipal. NO es único (los Excel de origen lo repiten entre predios).';
COMMENT ON COLUMN dilesa.cuentas_prediales.superficie_fiscal_m2 IS
  'Superficie según catastro (puede diferir de activos.area_m2, que es la operativa/escriturada).';

-- ─────────────────────────────────────────────────────────────────────
-- 3. dilesa.prediales_ejercicios — el estado del impuesto de UNA cuenta
--    en UN año. Montos tal como los expide el municipio (sin cálculo de
--    recargos propio — decisión Beto 2026-07-01). El comprobante de pago
--    va en erp.adjuntos (entidad_tipo='prediales_ejercicios').
-- ─────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS dilesa.prediales_ejercicios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL REFERENCES core.empresas (id),
  cuenta_id uuid NOT NULL REFERENCES dilesa.cuentas_prediales (id) ON DELETE CASCADE,
  ejercicio integer NOT NULL CHECK (ejercicio BETWEEN 2000 AND 2100),

  -- Montos del recibo municipal (todos opcionales: hay filas históricas
  -- marcadas solo como pagadas, sin desglose).
  predial numeric,
  recargos numeric,
  aseo numeric,
  recargos_aseo numeric,
  bomberos numeric,
  recargos_bomberos numeric,

  convenio_id uuid REFERENCES dilesa.prediales_convenios (id) ON DELETE SET NULL,

  estado text NOT NULL DEFAULT 'pendiente'
    CHECK (estado IN ('pendiente', 'pagado', 'convenio', 'condonado')),
  fecha_pago date,
  monto_pagado numeric,
  pagado_por uuid REFERENCES core.usuarios (id),

  notas text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT prediales_ejercicios_cuenta_anio_uk UNIQUE (cuenta_id, ejercicio)
);

COMMENT ON TABLE dilesa.prediales_ejercicios IS
  'Impuesto predial de una cuenta catastral en un ejercicio fiscal. Montos = lo que expide el municipio (captura manual, sin recálculo de recargos). El adeudo neto se deriva: suma de montos − descuento del convenio referenciado. v1 registro/control, sin CxP. Iniciativa dilesa-portafolio-predios.';
COMMENT ON COLUMN dilesa.prediales_ejercicios.estado IS
  'pendiente = adeudo vivo · pagado = liquidado (fecha/monto/comprobante) · convenio = exigible reducido por convenio vigente · condonado = el municipio lo perdonó.';
COMMENT ON COLUMN dilesa.prediales_ejercicios.monto_pagado IS
  'Lo realmente pagado (puede diferir de la suma de montos por descuentos de pronto pago o convenio).';

-- ─────────────────────────────────────────────────────────────────────
-- 4. Índices
-- ─────────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS cuentas_prediales_empresa_idx
  ON dilesa.cuentas_prediales (empresa_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS cuentas_prediales_activo_idx
  ON dilesa.cuentas_prediales (activo_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS prediales_ejercicios_cuenta_idx
  ON dilesa.prediales_ejercicios (cuenta_id);
CREATE INDEX IF NOT EXISTS prediales_ejercicios_ejercicio_idx
  ON dilesa.prediales_ejercicios (empresa_id, ejercicio);
CREATE INDEX IF NOT EXISTS prediales_ejercicios_estado_idx
  ON dilesa.prediales_ejercicios (empresa_id, estado);
CREATE INDEX IF NOT EXISTS prediales_convenios_empresa_idx
  ON dilesa.prediales_convenios (empresa_id);

-- ─────────────────────────────────────────────────────────────────────
-- 5. Triggers updated_at
-- ─────────────────────────────────────────────────────────────────────

DO $$
DECLARE
  t record;
BEGIN
  FOR t IN SELECT * FROM (VALUES
    ('cuentas_prediales'),
    ('prediales_ejercicios'),
    ('prediales_convenios')
  ) AS x(tbl) LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS dilesa_%1$s_updated_at ON dilesa.%1$s', t.tbl);
    EXECUTE format(
      'CREATE TRIGGER dilesa_%1$s_updated_at BEFORE UPDATE ON dilesa.%1$s FOR EACH ROW EXECUTE FUNCTION core.fn_set_updated_at()',
      t.tbl
    );
  END LOOP;
END $$;

-- ─────────────────────────────────────────────────────────────────────
-- 6. RLS (set-membership — evita el timeout por-fila de fn_has_empresa).
--    Los grants vienen de los DEFAULT PRIVILEGES del schema dilesa.
-- ─────────────────────────────────────────────────────────────────────

ALTER TABLE dilesa.cuentas_prediales ENABLE ROW LEVEL SECURITY;
ALTER TABLE dilesa.prediales_ejercicios ENABLE ROW LEVEL SECURITY;
ALTER TABLE dilesa.prediales_convenios ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  pred text := '(empresa_id IN (SELECT core.fn_current_empresa_ids()) OR core.fn_is_admin())';
  r record;
BEGIN
  FOR r IN SELECT * FROM (VALUES
    ('cuentas_prediales'),
    ('prediales_ejercicios'),
    ('prediales_convenios')
  ) AS x(tbl) LOOP
    EXECUTE format('DROP POLICY IF EXISTS %1$s_select ON dilesa.%1$s', r.tbl);
    EXECUTE format('DROP POLICY IF EXISTS %1$s_insert ON dilesa.%1$s', r.tbl);
    EXECUTE format('DROP POLICY IF EXISTS %1$s_update ON dilesa.%1$s', r.tbl);
    EXECUTE format('DROP POLICY IF EXISTS %1$s_delete ON dilesa.%1$s', r.tbl);
    EXECUTE format('CREATE POLICY %1$s_select ON dilesa.%1$s FOR SELECT TO authenticated USING %2$s', r.tbl, pred);
    EXECUTE format('CREATE POLICY %1$s_insert ON dilesa.%1$s FOR INSERT TO authenticated WITH CHECK %2$s', r.tbl, pred);
    EXECUTE format('CREATE POLICY %1$s_update ON dilesa.%1$s FOR UPDATE TO authenticated USING %2$s WITH CHECK %2$s', r.tbl, pred);
    EXECUTE format('CREATE POLICY %1$s_delete ON dilesa.%1$s FOR DELETE TO authenticated USING %2$s', r.tbl, pred);
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';

COMMIT;
