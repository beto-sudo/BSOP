-- ╭──────────────────────────────────────────────────────────────────╮
-- │  20260627204830_erp_arrendamiento_schema_base                      │
-- │                                                                    │
-- │  Iniciativa `arrendamiento` — Sprint 1a (schema base, DDL puro).   │
-- │  Crea el modelo de contrato de arrendamiento (master + líneas +    │
-- │  serie de renta por periodo + depósitos + puente CFDI) y el        │
-- │  catálogo de INPC. Promueve la CARA de espectacular a activo hijo. │
-- │                                                                    │
-- │  NO toca erp.cxc_* ni la RPC de ventas (eso es S1b, financiero,    │
-- │  gate D5). Aditivo y reversible. Ver docs/planning/arrendamiento.md │
-- │  y docs/adr/052_arrendamiento_regimen_fiscal_legal.md.            │
-- ╰──────────────────────────────────────────────────────────────────╯

BEGIN;

CREATE EXTENSION IF NOT EXISTS btree_gist;

-- ─────────────────────────────────────────────────────────────────────
-- 1. Cara de espectacular → activo hijo (ADR-052; como plaza→local)
--    La cara deja de vivir solo en activo_espectacular.caras_detalle (jsonb
--    sin identidad estable) y pasa a ser un activo de primera clase con FK,
--    para que la línea de contrato la referencie sin doble-verdad.
-- ─────────────────────────────────────────────────────────────────────

ALTER TABLE dilesa.activos DROP CONSTRAINT IF EXISTS activos_tipo_check;
ALTER TABLE dilesa.activos ADD CONSTRAINT activos_tipo_check CHECK (tipo IN (
  'terreno', 'espectacular', 'unipolar', 'casa', 'local', 'plaza',
  'edificio', 'nave', 'departamento', 'lote', 'infraestructura', 'cara'
));

CREATE TABLE IF NOT EXISTS dilesa.activo_cara (
  activo_id uuid PRIMARY KEY REFERENCES dilesa.activos (id) ON DELETE CASCADE,
  empresa_id uuid NOT NULL REFERENCES core.empresas (id),
  -- La cara hereda la estructura de su espectacular padre (activo_padre_id).
  orientacion text,
  vialidad text,
  ancho_m numeric,
  alto_m numeric,
  iluminado boolean,
  trafico_estimado_diario integer,
  scoring numeric,
  notas text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE dilesa.activo_cara IS
  'Satélite 1:1 de dilesa.activos para tipo=cara: una cara rentable de un espectacular/unipolar (activo_padre_id apunta a la estructura). ADR-052.';

-- ─────────────────────────────────────────────────────────────────────
-- 2. erp.inpc_indices — catálogo NACIONAL del INPC (sin empresa_id;
--    es dato de referencia compartido). Captura manual asistida en v1.
-- ─────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS erp.inpc_indices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  anio integer NOT NULL,
  mes integer NOT NULL CHECK (mes BETWEEN 1 AND 12),
  valor numeric(12, 4) NOT NULL CHECK (valor > 0),
  fuente text NOT NULL DEFAULT 'INEGI',
  estado text NOT NULL DEFAULT 'capturado' CHECK (estado IN ('pendiente_indice', 'capturado', 'aprobado')),
  capturado_por uuid,
  aprobado_por uuid,
  fecha_publicacion date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT inpc_indices_anio_mes_uk UNIQUE (anio, mes)
);

COMMENT ON TABLE erp.inpc_indices IS
  'Catálogo del INPC nacional (INEGI), una fila por mes. Fuente del incremento de renta al aniversario (ADR-052 D5). Global, sin empresa_id.';

-- ─────────────────────────────────────────────────────────────────────
-- 3. erp.arrendamientos — el contrato (master). 4 roles de persona
--    separados (ADR-052): arrendatario / pagador / receptor fiscal /
--    arrendador-emisor. La cobranza se origina en cxc con
--    origen_tipo='arrendamiento' (S1b).
-- ─────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS erp.arrendamientos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL REFERENCES core.empresas (id),

  -- 4 roles (ADR-052 D1/D2). pagador/receptor/arrendador NULL → se asume
  -- el arrendatario / la empresa (DILESA PM) respectivamente.
  arrendatario_persona_id uuid NOT NULL REFERENCES erp.personas (id),
  pagador_persona_id uuid REFERENCES erp.personas (id),
  receptor_fiscal_persona_id uuid REFERENCES erp.personas (id),
  arrendador_persona_id uuid REFERENCES erp.personas (id),

  folio text,
  tipo_plazo text NOT NULL DEFAULT 'plazo' CHECK (tipo_plazo IN ('plazo', 'campana')),
  fecha_inicio date,
  fecha_fin date,
  dia_corte integer CHECK (dia_corte BETWEEN 1 AND 28),

  -- Incremento (ADR-052 D5). INPC_base se snapshotea al firmar.
  esquema_incremento text NOT NULL DEFAULT 'inpc_mas_pct'
    CHECK (esquema_incremento IN ('inpc_mas_pct', 'fijo', 'ninguno')),
  pct_adicional numeric NOT NULL DEFAULT 2.0,
  inpc_base_anio integer,
  inpc_base_mes integer CHECK (inpc_base_mes IS NULL OR inpc_base_mes BETWEEN 1 AND 12),

  tipo_renovacion text NOT NULL DEFAULT 'manual'
    CHECK (tipo_renovacion IN ('manual', 'automatica', 'tacita_reconduccion')),
  penalizacion_terminacion_meses numeric NOT NULL DEFAULT 2,

  requiere_fiador boolean NOT NULL DEFAULT false,
  fiador_persona_id uuid REFERENCES erp.personas (id),

  -- Gate: solo MXN en v1 (ADR-052; sin contratos USD hoy).
  moneda text NOT NULL DEFAULT 'MXN' CHECK (moneda = 'MXN'),
  deposito_meses numeric NOT NULL DEFAULT 1,

  estado text NOT NULL DEFAULT 'borrador'
    CHECK (estado IN ('borrador', 'vigente', 'por_vencer', 'renovado', 'terminado', 'rescindido')),

  notas text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

COMMENT ON TABLE erp.arrendamientos IS
  'Contrato de arrendamiento (master). Multiempresa (golden DILESA). Cobranza vía erp.cxc_* con origen_tipo=arrendamiento (S1b). NO se relaciona con erp.contratos (legacy de ventas). Iniciativa arrendamiento, ADR-052.';
COMMENT ON COLUMN erp.arrendamientos.pagador_persona_id IS
  'A quién se le cobra (→ cxc.persona_id). NULL = el arrendatario. Puede diferir: facturas a la marca pero cobra la agencia.';
COMMENT ON COLUMN erp.arrendamientos.arrendador_persona_id IS
  'NULL = la empresa (DILESA PM). Se llena para subarriendo / terreno de tercero PF (gobierna retención, ADR-052 D2).';

-- ─────────────────────────────────────────────────────────────────────
-- 4. erp.arrendamiento_lineas — los espacios rentados (1 contrato : N).
--    Régimen fiscal por línea (ADR-052 D1). Anti-doble-booking por activo
--    + rango de vigencia (EXCLUDE, ADR-052).
-- ─────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS erp.arrendamiento_lineas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL REFERENCES core.empresas (id),
  arrendamiento_id uuid NOT NULL REFERENCES erp.arrendamientos (id) ON DELETE CASCADE,

  -- FK cross-schema al portafolio. supabase-js NO la embebe → dos queries
  -- con .in() (reference_supabase_cross_schema_fk). La integridad sí aplica.
  activo_id uuid NOT NULL REFERENCES dilesa.activos (id),

  tipo_operacion_fiscal text NOT NULL DEFAULT 'arrendamiento_inmueble'
    CHECK (tipo_operacion_fiscal IN ('arrendamiento_inmueble', 'espacio_publicitario', 'servicio_publicidad')),

  renta_subtotal numeric(14, 2) NOT NULL CHECK (renta_subtotal >= 0),
  regimen_iva text NOT NULL DEFAULT 'tasa_8' CHECK (regimen_iva IN ('exento', 'tasa_8', 'tasa_16')),
  iva_tasa_pct numeric NOT NULL DEFAULT 8,
  iva_fundamento text,
  lugar_expedicion text,
  iva_validado_por uuid,
  iva_validado_at timestamptz,

  -- Retención por arrendador/emisor (ADR-052 D2); default 0 (DILESA PM).
  sujeto_retencion boolean NOT NULL DEFAULT false,
  retencion_isr_pct numeric NOT NULL DEFAULT 0,
  retencion_iva_pct numeric NOT NULL DEFAULT 0,

  -- Vigencia de la línea (campañas cortas pueden diferir del contrato).
  vigencia_inicio date,
  vigencia_fin date,

  estado text NOT NULL DEFAULT 'borrador'
    CHECK (estado IN ('borrador', 'vigente', 'por_vencer', 'terminado', 'rescindido')),

  notas text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  -- Anti-doble-booking: el mismo activo no puede tener dos líneas vivas con
  -- vigencias que se traslapen (ADR-052). Borradores/terminados quedan fuera.
  CONSTRAINT arrendamiento_lineas_no_overlap EXCLUDE USING gist (
    activo_id WITH =,
    daterange(vigencia_inicio, vigencia_fin) WITH &&
  ) WHERE (estado IN ('vigente', 'por_vencer'))
);

COMMENT ON TABLE erp.arrendamiento_lineas IS
  'Espacio rentado de un contrato (1 contrato : N líneas). El activo_id puede ser un local, terreno, casa o una CARA de espectacular (activo hijo). Régimen fiscal por línea, ADR-052.';

-- ─────────────────────────────────────────────────────────────────────
-- 5. erp.arrendamiento_renta_periodos — serie temporal de renta POR LÍNEA
--    (append-only). El incremento INSERTA un periodo; nunca re-tarifa.
-- ─────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS erp.arrendamiento_renta_periodos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL REFERENCES core.empresas (id),
  linea_id uuid NOT NULL REFERENCES erp.arrendamiento_lineas (id) ON DELETE CASCADE,

  vigencia_inicio date NOT NULL,
  vigencia_fin date,
  monto numeric(14, 2) NOT NULL CHECK (monto >= 0),
  inpc_aplicado numeric(12, 4),
  pct_aplicado numeric,

  created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE erp.arrendamiento_renta_periodos IS
  'Renta vigente por periodo y por línea (append-only). El cron lee el periodo vigente; el incremento al aniversario inserta un periodo nuevo, nunca re-tarifa cargos pasados. ADR-052 D5.';

-- ─────────────────────────────────────────────────────────────────────
-- 6. erp.arrendamiento_depositos — depósito en garantía (pasivo, flujo
--    propio; ADR-052 D3). Entra como movimiento_bancario, no por cxc_pagos.
-- ─────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS erp.arrendamiento_depositos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL REFERENCES core.empresas (id),
  arrendamiento_id uuid NOT NULL REFERENCES erp.arrendamientos (id) ON DELETE CASCADE,

  monto numeric(14, 2) NOT NULL CHECK (monto >= 0),
  deposito_naturaleza text NOT NULL DEFAULT 'garantia_reembolsable'
    CHECK (deposito_naturaleza IN ('garantia_reembolsable', 'anticipo_renta', 'mixto')),
  estado text NOT NULL DEFAULT 'recibido'
    CHECK (estado IN ('recibido', 'retenido', 'aplicado', 'devuelto')),
  aplicable_a_renta_desde date,
  cfdi_requerido_en_recepcion boolean NOT NULL DEFAULT false,

  -- Entrada/salida del dinero por tesorería (sin pasar por cxc_pagos).
  movimiento_bancario_id uuid REFERENCES erp.movimientos_bancarios (id),
  plazo_devolucion_dias integer NOT NULL DEFAULT 30,
  fecha_recibido date,
  fecha_devuelto date,

  notas text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE erp.arrendamiento_depositos IS
  'Depósito en garantía (pasivo). garantia_reembolsable no se factura al recibirse; aplicado a renta sí dispara CFDI. ADR-052 D3.';

-- ─────────────────────────────────────────────────────────────────────
-- 7. erp.arrendamiento_cfdis — puente cargo/periodo ↔ CFDI (BSOP no timbra;
--    referencia el XML de CONTPAQi). Separa factura de ingreso del REP de
--    pago (ADR-052 D4).
-- ─────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS erp.arrendamiento_cfdis (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL REFERENCES core.empresas (id),
  arrendamiento_id uuid NOT NULL REFERENCES erp.arrendamientos (id) ON DELETE CASCADE,
  linea_id uuid REFERENCES erp.arrendamiento_lineas (id) ON DELETE SET NULL,
  -- El cargo de renta vive en erp.cxc_cargos (creado en S1b). FK válida ya.
  cxc_cargo_id uuid REFERENCES erp.cxc_cargos (id) ON DELETE SET NULL,
  periodo text,

  tipo text NOT NULL CHECK (tipo IN ('factura_ingreso', 'rep_pago', 'nota_credito')),
  uuid_sat text NOT NULL,
  monto numeric(14, 2),
  fecha date,
  adjunto_id uuid,

  created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE erp.arrendamiento_cfdis IS
  'Puente entre un cargo/periodo de renta y el CFDI timbrado por CONTPAQi (tipo factura_ingreso | rep_pago | nota_credito). BSOP solo referencia uuid_sat. ADR-052 D4.';

-- ─────────────────────────────────────────────────────────────────────
-- 8. Índices
-- ─────────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS activo_cara_empresa_idx ON dilesa.activo_cara (empresa_id);
CREATE INDEX IF NOT EXISTS arrendamientos_empresa_idx ON erp.arrendamientos (empresa_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS arrendamientos_arrendatario_idx ON erp.arrendamientos (arrendatario_persona_id);
CREATE INDEX IF NOT EXISTS arrendamientos_estado_idx ON erp.arrendamientos (estado) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS arr_lineas_arrendamiento_idx ON erp.arrendamiento_lineas (arrendamiento_id);
CREATE INDEX IF NOT EXISTS arr_lineas_activo_idx ON erp.arrendamiento_lineas (activo_id);
CREATE INDEX IF NOT EXISTS arr_periodos_linea_idx ON erp.arrendamiento_renta_periodos (linea_id);
CREATE INDEX IF NOT EXISTS arr_depositos_arrendamiento_idx ON erp.arrendamiento_depositos (arrendamiento_id);
CREATE INDEX IF NOT EXISTS arr_cfdis_arrendamiento_idx ON erp.arrendamiento_cfdis (arrendamiento_id);
CREATE INDEX IF NOT EXISTS arr_cfdis_cargo_idx ON erp.arrendamiento_cfdis (cxc_cargo_id);

-- ─────────────────────────────────────────────────────────────────────
-- 9. Triggers updated_at
-- ─────────────────────────────────────────────────────────────────────

DO $$
DECLARE
  t record;
BEGIN
  FOR t IN SELECT * FROM (VALUES
    ('dilesa', 'activo_cara'),
    ('erp', 'inpc_indices'),
    ('erp', 'arrendamientos'),
    ('erp', 'arrendamiento_lineas'),
    ('erp', 'arrendamiento_depositos')
  ) AS x(sch, tbl) LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %1$s_%2$s_updated_at ON %1$s.%2$s', t.sch, t.tbl);
    EXECUTE format(
      'CREATE TRIGGER %1$s_%2$s_updated_at BEFORE UPDATE ON %1$s.%2$s FOR EACH ROW EXECUTE FUNCTION core.fn_set_updated_at()',
      t.sch, t.tbl
    );
  END LOOP;
END $$;

-- ─────────────────────────────────────────────────────────────────────
-- 10. Grants + RLS (set-membership — evita el timeout por-fila de
--     fn_has_empresa, reference_rls_fn_has_empresa_per_row)
-- ─────────────────────────────────────────────────────────────────────

GRANT SELECT, INSERT, UPDATE, DELETE ON dilesa.activo_cara TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON erp.arrendamientos TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON erp.arrendamiento_lineas TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON erp.arrendamiento_renta_periodos TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON erp.arrendamiento_depositos TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON erp.arrendamiento_cfdis TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON erp.inpc_indices TO authenticated;

ALTER TABLE dilesa.activo_cara ENABLE ROW LEVEL SECURITY;
ALTER TABLE erp.arrendamientos ENABLE ROW LEVEL SECURITY;
ALTER TABLE erp.arrendamiento_lineas ENABLE ROW LEVEL SECURITY;
ALTER TABLE erp.arrendamiento_renta_periodos ENABLE ROW LEVEL SECURITY;
ALTER TABLE erp.arrendamiento_depositos ENABLE ROW LEVEL SECURITY;
ALTER TABLE erp.arrendamiento_cfdis ENABLE ROW LEVEL SECURITY;
ALTER TABLE erp.inpc_indices ENABLE ROW LEVEL SECURITY;

-- Tablas empresa-scoped: set-membership.
DO $$
DECLARE
  pred text := '(empresa_id IN (SELECT core.fn_current_empresa_ids()) OR core.fn_is_admin())';
  r record;
BEGIN
  FOR r IN SELECT * FROM (VALUES
    ('dilesa', 'activo_cara'),
    ('erp', 'arrendamientos'),
    ('erp', 'arrendamiento_lineas'),
    ('erp', 'arrendamiento_renta_periodos'),
    ('erp', 'arrendamiento_depositos'),
    ('erp', 'arrendamiento_cfdis')
  ) AS x(sch, tbl) LOOP
    EXECUTE format('DROP POLICY IF EXISTS %2$s_select ON %1$s.%2$s', r.sch, r.tbl);
    EXECUTE format('DROP POLICY IF EXISTS %2$s_insert ON %1$s.%2$s', r.sch, r.tbl);
    EXECUTE format('DROP POLICY IF EXISTS %2$s_update ON %1$s.%2$s', r.sch, r.tbl);
    EXECUTE format('DROP POLICY IF EXISTS %2$s_delete ON %1$s.%2$s', r.sch, r.tbl);
    EXECUTE format('CREATE POLICY %2$s_select ON %1$s.%2$s FOR SELECT TO authenticated USING %3$s', r.sch, r.tbl, pred);
    EXECUTE format('CREATE POLICY %2$s_insert ON %1$s.%2$s FOR INSERT TO authenticated WITH CHECK %3$s', r.sch, r.tbl, pred);
    EXECUTE format('CREATE POLICY %2$s_update ON %1$s.%2$s FOR UPDATE TO authenticated USING %3$s WITH CHECK %3$s', r.sch, r.tbl, pred);
    EXECUTE format('CREATE POLICY %2$s_delete ON %1$s.%2$s FOR DELETE TO authenticated USING %3$s', r.sch, r.tbl, pred);
  END LOOP;
END $$;

-- erp.inpc_indices es catálogo NACIONAL (sin empresa_id): lectura para todo
-- usuario autenticado; escritura solo admin.
DROP POLICY IF EXISTS inpc_indices_select ON erp.inpc_indices;
DROP POLICY IF EXISTS inpc_indices_write ON erp.inpc_indices;
CREATE POLICY inpc_indices_select ON erp.inpc_indices FOR SELECT TO authenticated USING (true);
CREATE POLICY inpc_indices_write ON erp.inpc_indices FOR ALL TO authenticated
  USING (core.fn_is_admin()) WITH CHECK (core.fn_is_admin());

NOTIFY pgrst, 'reload schema';

COMMIT;
