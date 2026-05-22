-- ════════════════════════════════════════════════════════════════════════════
-- Iniciativa dilesa-portafolio-activos · Sprint 3 — Fase 4: schema de
-- comercialización (ventas)
-- ════════════════════════════════════════════════════════════════════════════
--
-- La importación de la tabla Clientes de Coda (docs/planning/
-- dilesa-portafolio-mapeo-coda.md § 6) necesita estructura de ventas que el
-- schema v2 no tiene. Cuatro tablas nuevas en `dilesa`:
--
--   · venta_fase_catalogo — las 17 fases del pipeline de ventas (seed).
--   · ventas              — la transacción: liga comprador (erp.personas,
--                           FK cross-schema) ↔ unidad (dilesa.unidades).
--   · venta_fases         — log del pipeline: una fila por fase alcanzada
--                           (fecha + quién). Reemplaza las 17 columnas
--                           planas de Coda; es el timeline del pipeline.
--   · venta_pagos         — los depósitos del cliente (1:N).
--
-- El comprador reusa `erp.personas` (tipo='cliente') — no se extiende. El
-- expediente digital (PDFs) usa `erp.adjuntos` y se migra en Fase 4.5.
-- Las GRANT salen de `ALTER DEFAULT PRIVILEGES IN SCHEMA dilesa` (migración
-- 20260521201557).

BEGIN;

-- ════════════════════════════════════════════════════════════════════════════
-- 1) dilesa.venta_fase_catalogo — catálogo de las 17 fases del pipeline
-- ════════════════════════════════════════════════════════════════════════════
CREATE TABLE dilesa.venta_fase_catalogo (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id  uuid NOT NULL REFERENCES core.empresas(id) ON DELETE RESTRICT,
  posicion    integer NOT NULL,
  nombre      text NOT NULL,
  rol         text,
  descripcion text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  deleted_at  timestamptz,
  CONSTRAINT venta_fase_catalogo_posicion_uk UNIQUE (empresa_id, posicion),
  CONSTRAINT venta_fase_catalogo_nombre_uk UNIQUE (empresa_id, nombre)
);
ALTER TABLE dilesa.venta_fase_catalogo ENABLE ROW LEVEL SECURITY;
CREATE POLICY venta_fase_catalogo_select ON dilesa.venta_fase_catalogo
  FOR SELECT TO authenticated
  USING (deleted_at IS NULL AND (core.fn_has_empresa(empresa_id) OR core.fn_is_admin()));
CREATE POLICY venta_fase_catalogo_write ON dilesa.venta_fase_catalogo
  FOR ALL TO authenticated
  USING (core.fn_has_empresa(empresa_id) OR core.fn_is_admin())
  WITH CHECK (core.fn_has_empresa(empresa_id) OR core.fn_is_admin());
CREATE TRIGGER dilesa_venta_fase_catalogo_updated_at
  BEFORE UPDATE ON dilesa.venta_fase_catalogo
  FOR EACH ROW EXECUTE FUNCTION core.fn_set_updated_at();
COMMENT ON TABLE dilesa.venta_fase_catalogo IS
  'Catálogo de las 17 fases del pipeline de ventas DILESA (Coda "Fase de Venta"). Ver mapeo § 6.3.';

-- ════════════════════════════════════════════════════════════════════════════
-- 2) dilesa.ventas — la transacción de venta
-- ════════════════════════════════════════════════════════════════════════════
CREATE TABLE dilesa.ventas (
  id                              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id                      uuid NOT NULL REFERENCES core.empresas(id) ON DELETE RESTRICT,
  persona_id                      uuid NOT NULL REFERENCES erp.personas(id) ON DELETE RESTRICT,
  -- unidad_id es nullable: algunas filas de Coda (desasignadas, borradores)
  -- no traen unidad resoluble. El import amarra lo que puede.
  unidad_id                       uuid REFERENCES dilesa.unidades(id) ON DELETE RESTRICT,
  estado                          text NOT NULL DEFAULT 'activa',
  fase_actual                     text,
  fase_posicion                   integer,
  tipo_credito                    text,
  valor_comercial                 numeric(16, 2),
  valor_escrituracion             numeric(16, 2),
  precio_asignacion               numeric(16, 2),
  monto_credito_titular           numeric(16, 2),
  monto_credito_cotitular         numeric(16, 2),
  credito_titular_ref             text,
  credito_cotitular_ref           text,
  enganche_requerido              numeric(16, 2),
  descuento_total                 numeric(16, 2),
  comision_vendedor               numeric(16, 2),
  comision_gerencia               numeric(16, 2),
  anticipo_comision               numeric(16, 2),
  vendedor                        text,
  notario                         text,
  casa_valuadora                  text,
  monto_avaluo                    numeric(16, 2),
  gastos_escrituracion            numeric(16, 2),
  numero_escritura                text,
  fecha_escritura                 date,
  es_pep                          boolean,
  ocupacion                       text,
  ine_numero                      text,
  forma_pago                      text,
  uso_efectivo                    text,
  conocimiento_dueno_beneficiario text,
  motivo_desasignacion            text,
  notas                           text,
  created_at                      timestamptz NOT NULL DEFAULT now(),
  updated_at                      timestamptz NOT NULL DEFAULT now(),
  deleted_at                      timestamptz,
  CONSTRAINT ventas_estado_check CHECK (estado IN ('activa', 'desasignada'))
);
CREATE INDEX dilesa_ventas_persona_idx ON dilesa.ventas(persona_id) WHERE deleted_at IS NULL;
CREATE INDEX dilesa_ventas_unidad_idx ON dilesa.ventas(unidad_id) WHERE deleted_at IS NULL;
ALTER TABLE dilesa.ventas ENABLE ROW LEVEL SECURITY;
CREATE POLICY ventas_select ON dilesa.ventas
  FOR SELECT TO authenticated
  USING (deleted_at IS NULL AND (core.fn_has_empresa(empresa_id) OR core.fn_is_admin()));
CREATE POLICY ventas_write ON dilesa.ventas
  FOR ALL TO authenticated
  USING (core.fn_has_empresa(empresa_id) OR core.fn_is_admin())
  WITH CHECK (core.fn_has_empresa(empresa_id) OR core.fn_is_admin());
CREATE TRIGGER dilesa_ventas_updated_at
  BEFORE UPDATE ON dilesa.ventas
  FOR EACH ROW EXECUTE FUNCTION core.fn_set_updated_at();
COMMENT ON TABLE dilesa.ventas IS
  'Venta de una unidad a un comprador. persona_id → erp.personas (cross-schema). El pipeline de fases vive en dilesa.venta_fases. Ver mapeo § 6.';

-- ════════════════════════════════════════════════════════════════════════════
-- 3) dilesa.venta_fases — log del pipeline (una fila por fase alcanzada)
-- ════════════════════════════════════════════════════════════════════════════
CREATE TABLE dilesa.venta_fases (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id     uuid NOT NULL REFERENCES core.empresas(id) ON DELETE RESTRICT,
  venta_id       uuid NOT NULL REFERENCES dilesa.ventas(id) ON DELETE CASCADE,
  fase           text NOT NULL,
  posicion       integer,
  fecha          date,
  registrado_por uuid REFERENCES core.usuarios(id) ON DELETE SET NULL,
  notas          text,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  deleted_at     timestamptz,
  CONSTRAINT venta_fases_uk UNIQUE (venta_id, fase)
);
CREATE INDEX dilesa_venta_fases_venta_idx ON dilesa.venta_fases(venta_id) WHERE deleted_at IS NULL;
ALTER TABLE dilesa.venta_fases ENABLE ROW LEVEL SECURITY;
CREATE POLICY venta_fases_select ON dilesa.venta_fases
  FOR SELECT TO authenticated
  USING (deleted_at IS NULL AND (core.fn_has_empresa(empresa_id) OR core.fn_is_admin()));
CREATE POLICY venta_fases_write ON dilesa.venta_fases
  FOR ALL TO authenticated
  USING (core.fn_has_empresa(empresa_id) OR core.fn_is_admin())
  WITH CHECK (core.fn_has_empresa(empresa_id) OR core.fn_is_admin());
CREATE TRIGGER dilesa_venta_fases_updated_at
  BEFORE UPDATE ON dilesa.venta_fases
  FOR EACH ROW EXECUTE FUNCTION core.fn_set_updated_at();
COMMENT ON TABLE dilesa.venta_fases IS
  'Log del pipeline de una venta: una fila por fase alcanzada con fecha y quién la registró. Timeline del pipeline. Ver mapeo § 6.3.';

-- ════════════════════════════════════════════════════════════════════════════
-- 4) dilesa.venta_pagos — depósitos del cliente
-- ════════════════════════════════════════════════════════════════════════════
CREATE TABLE dilesa.venta_pagos (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL REFERENCES core.empresas(id) ON DELETE RESTRICT,
  venta_id   uuid NOT NULL REFERENCES dilesa.ventas(id) ON DELETE CASCADE,
  fecha      date,
  monto      numeric(16, 2) NOT NULL,
  tipo       text,
  notas      text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);
CREATE INDEX dilesa_venta_pagos_venta_idx ON dilesa.venta_pagos(venta_id) WHERE deleted_at IS NULL;
ALTER TABLE dilesa.venta_pagos ENABLE ROW LEVEL SECURITY;
CREATE POLICY venta_pagos_select ON dilesa.venta_pagos
  FOR SELECT TO authenticated
  USING (deleted_at IS NULL AND (core.fn_has_empresa(empresa_id) OR core.fn_is_admin()));
CREATE POLICY venta_pagos_write ON dilesa.venta_pagos
  FOR ALL TO authenticated
  USING (core.fn_has_empresa(empresa_id) OR core.fn_is_admin())
  WITH CHECK (core.fn_has_empresa(empresa_id) OR core.fn_is_admin());
CREATE TRIGGER dilesa_venta_pagos_updated_at
  BEFORE UPDATE ON dilesa.venta_pagos
  FOR EACH ROW EXECUTE FUNCTION core.fn_set_updated_at();
COMMENT ON TABLE dilesa.venta_pagos IS
  'Depósitos/pagos de un cliente sobre su venta (1:N). Coda "Depositos Clientes". Ver mapeo § 6.4.';

-- ════════════════════════════════════════════════════════════════════════════
-- 5) Seed — las 17 fases del pipeline de ventas para DILESA
-- ════════════════════════════════════════════════════════════════════════════
-- JOIN a core.empresas + NOT EXISTS: idempotente y seguro en el Preview branch
-- (que corre sin datos de prod — si no existe la empresa 'dilesa', no inserta).
INSERT INTO dilesa.venta_fase_catalogo (empresa_id, posicion, nombre, rol)
SELECT e.id, f.posicion, f.nombre, f.rol
FROM core.empresas e
CROSS JOIN (VALUES
  (1, 'Solicitud de Asignación', 'Todos'),
  (2, 'Asignada', 'Gerencia General'),
  (3, 'Formalizada', 'Gerencia General'),
  (4, 'Solicitud de Avalúo', 'Gerencia de Ventas'),
  (5, 'Avalúo Cerrado', 'Gerencia de Ventas'),
  (6, 'Inscrita', 'Gerencia de Ventas'),
  (7, 'Solicitud de Dictaminación', 'Gerencia de Ventas'),
  (8, 'Dictaminada', 'Gerencia de Ventas'),
  (9, 'Validación Patronal', 'Vendedores'),
  (10, 'Firmas Programadas', 'Gerencia General'),
  (11, 'Escriturada', 'Comité'),
  (12, 'Detonada', 'Administración'),
  (13, 'Facturada', 'Administración'),
  (14, 'Preparada para Entrega', 'Atención a Clientes'),
  (15, 'Entregada', 'Atención a Clientes'),
  (16, 'Comisión Pagada', 'Comité'),
  (17, 'Operación Terminada', 'Administración')
) AS f(posicion, nombre, rol)
WHERE e.slug = 'dilesa'
  AND NOT EXISTS (
    SELECT 1 FROM dilesa.venta_fase_catalogo c WHERE c.empresa_id = e.id
  );

NOTIFY pgrst, 'reload schema';

COMMIT;
