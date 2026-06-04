-- MIGRATION: Módulo Peptides — schema `peptides` (base de info de sourcing)
-- Iniciativa `sanren-peptides` · Sprint 1 (docs/planning/sanren-peptides.md).
--
-- 5 tablas: peptidos (catálogo curado), vendors (snapshot sheets STG;
-- nota_personal preservada), tests (COA por batch — core filtrable),
-- insumos (proveedores), notas (hallazgos/alertas curados).
-- La bitácora NO vive aquí: reusa health.protocolo_* (decisión D2).
--
-- SEGURIDAD: igual que health.protocolo_* — RLS DENY-ALL + grants solo a
-- service_role. La app lee/escribe server-side (service_role BYPASSRLS).
-- Links blandos por texto (vendor_codigo, peptido), no FK uuid: el import es
-- snapshot-replace con nombres ruidosos de fuente comunitaria.
--
-- Aplicada a prod 2026-06-03 vía connector apply_migration (drift multi-sesión:
-- migraciones remotas 20260602020000/180000 de otras sesiones sin archivo local
-- — no se tocan). Versión asignada: 20260604002322.

CREATE SCHEMA IF NOT EXISTS peptides;

-- 1) Catálogo de péptidos (curado)
CREATE TABLE IF NOT EXISTS peptides.peptidos (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre           text NOT NULL UNIQUE,
  aliases          text[],
  clase            text,
  descripcion      text,
  protocolo_tipico text,
  reconstitucion   text,
  cautelas         text,
  fuente           text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE peptides.peptidos IS 'Catálogo de referencia de péptidos (curado). Iniciativa sanren-peptides.';

DROP TRIGGER IF EXISTS trg_peptides_peptidos_updated_at ON peptides.peptidos;
CREATE TRIGGER trg_peptides_peptidos_updated_at
  BEFORE UPDATE ON peptides.peptidos
  FOR EACH ROW EXECUTE FUNCTION core.fn_set_updated_at();

-- 2) Vendors (snapshot; nota_personal preservada)
CREATE TABLE IF NOT EXISTS peptides.vendors (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo          text NOT NULL UNIQUE,
  nombre          text,
  estado          text NOT NULL DEFAULT 'activo' CHECK (estado IN ('activo','removido','warning')),
  precio_mg       numeric,
  precio_mg_sale  numeric,
  moneda          text DEFAULT 'USD',
  us_warehouse    boolean,
  china_warehouse boolean,
  eu_warehouse    boolean,
  metodos_pago    text,
  primer_contacto text,
  garantia        text,
  notas           text,
  nota_personal   text,
  fuente_url      text,
  imported_at     timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE peptides.vendors IS 'Vendors de péptidos (snapshot sheets STG). notas = historial/warnings; nota_personal = de Beto (sobrevive re-import). Iniciativa sanren-peptides.';

-- 3) Tests / COA (snapshot-replace)
CREATE TABLE IF NOT EXISTS peptides.tests (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_codigo    text,
  peptido          text,
  test_date        date,
  batch            text,
  expected_mass_mg numeric,
  mass_mg          numeric,
  purity_pct       numeric,
  tfa              text,
  endotoxin        text,
  test_lab         text,
  file_name        text,
  lab_url          text,
  imported_at      timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE peptides.tests IS 'COA/testing por batch (pureza/endotoxina/masa). Links blandos por texto. Snapshot-replace. Iniciativa sanren-peptides.';
CREATE INDEX IF NOT EXISTS idx_peptides_tests_peptido ON peptides.tests (peptido);
CREATE INDEX IF NOT EXISTS idx_peptides_tests_vendor ON peptides.tests (vendor_codigo);
CREATE INDEX IF NOT EXISTS idx_peptides_tests_purity ON peptides.tests (purity_pct);

-- 4) Insumos (snapshot-replace)
CREATE TABLE IF NOT EXISTS peptides.insumos (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  proveedor   text NOT NULL UNIQUE,
  url         text,
  productos   text,
  imported_at timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE peptides.insumos IS 'Proveedores de insumos (bac water, viales, jeringas). Snapshot-replace. Iniciativa sanren-peptides.';

-- 5) Notas / hallazgos (curado)
CREATE TABLE IF NOT EXISTS peptides.notas (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  titulo        text,
  cuerpo        text,
  tags          text[],
  tipo          text CHECK (tipo IN ('alerta','hallazgo','protocolo','nota')),
  peptido       text,
  vendor_codigo text,
  fuente        text,
  fecha         timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE peptides.notas IS 'Hallazgos/alertas curados (Telegram/wiki/doc/manual), taggeables y ligables a péptido/vendor. Iniciativa sanren-peptides.';
CREATE INDEX IF NOT EXISTS idx_peptides_notas_peptido ON peptides.notas (peptido);
CREATE INDEX IF NOT EXISTS idx_peptides_notas_tipo ON peptides.notas (tipo);

-- Seguridad: RLS deny-all + grants solo a service_role
ALTER TABLE peptides.peptidos ENABLE ROW LEVEL SECURITY;
ALTER TABLE peptides.vendors  ENABLE ROW LEVEL SECURITY;
ALTER TABLE peptides.tests    ENABLE ROW LEVEL SECURITY;
ALTER TABLE peptides.insumos  ENABLE ROW LEVEL SECURITY;
ALTER TABLE peptides.notas    ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON SCHEMA peptides FROM PUBLIC, anon, authenticated, authenticator;
GRANT USAGE ON SCHEMA peptides TO service_role;

REVOKE ALL ON peptides.peptidos, peptides.vendors, peptides.tests, peptides.insumos, peptides.notas FROM PUBLIC, anon, authenticator, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON peptides.peptidos, peptides.vendors, peptides.tests, peptides.insumos, peptides.notas TO service_role;

-- Exponer schema a PostgREST (valor vivo verificado + append peptides)
ALTER ROLE authenticator
  SET pgrst.db_schemas = 'public, graphql_public, core, erp, rdb, playtomic, dilesa, maquinaria, health, peptides';

NOTIFY pgrst, 'reload config';
NOTIFY pgrst, 'reload schema';
