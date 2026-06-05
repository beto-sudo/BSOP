-- Iniciativa dilesa-compras · Sprint Cotizaciones (RFQ) · Fase 1 · D2
-- Schema de la cotización formal multi-proveedor (RFQ): el "¿a quién y a qué
-- precio?" antes de comprometer. Cierra el círculo P2P.
--
-- Modelo (4 tablas en erp, espejo del patrón de ordenes_compra/requisiciones):
--   cotizaciones                 — la RFQ (tipo compra|obra decide a qué adjudica).
--   cotizacion_lineas            — qué se pide (anclado a partida, D12).
--   cotizacion_proveedores       — los invitados y su respuesta (monto/condiciones).
--   cotizacion_proveedor_precios — precio por línea por proveedor (matriz comparativa).
--
-- Adjudicación: la RFQ engendra una OC (materiales) o un contrato de obra (mano de
-- obra) — FKs nuevas erp.ordenes_compra.cotizacion_id + dilesa.contratos_construccion.cotizacion_id.
-- Montos c/IVA (ADR-038, frontera 8%), igual que el resto de compras.
--
-- RLS: patrón de las hermanas (aislamiento por empresa via core.fn_has_empresa).
-- RBAC: sub-slug nuevo dilesa.compras.cotizaciones (tab del hub /dilesa/compras,
-- ADR-030) + backfill de permisos clonando del hermano dilesa.compras.ordenes.
-- Tablas vacías: aditivo puro, no afecta datos ni otras empresas.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Tablas
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS erp.cotizaciones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL REFERENCES core.empresas (id),
  codigo text,
  -- 'compra' → adjudica a OC (materiales); 'obra' → adjudica a contrato (mano de obra).
  tipo text NOT NULL DEFAULT 'compra' CHECK (tipo IN ('compra', 'obra')),
  requisicion_id uuid REFERENCES erp.requisiciones (id),
  descripcion text,
  estado text NOT NULL DEFAULT 'abierta'
    CHECK (estado IN ('abierta', 'comparada', 'adjudicada', 'cancelada')),
  fecha_limite date,
  adjudicado_proveedor_id uuid REFERENCES erp.proveedores (id),
  creado_por uuid REFERENCES core.usuarios (id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE TABLE IF NOT EXISTS erp.cotizacion_lineas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL REFERENCES core.empresas (id),
  cotizacion_id uuid NOT NULL REFERENCES erp.cotizaciones (id) ON DELETE CASCADE,
  -- Ancla al presupuesto (D12); null en gasto suelto (texto libre).
  partida_id uuid REFERENCES erp.presupuesto_partidas (id),
  descripcion text,
  cantidad numeric NOT NULL DEFAULT 1,
  unidad text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS erp.cotizacion_proveedores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL REFERENCES core.empresas (id),
  cotizacion_id uuid NOT NULL REFERENCES erp.cotizaciones (id) ON DELETE CASCADE,
  proveedor_id uuid NOT NULL REFERENCES erp.proveedores (id),
  estado text NOT NULL DEFAULT 'invitado'
    CHECK (estado IN ('invitado', 'respondida', 'elegida', 'descartada')),
  monto_total numeric,
  tiempo_entrega text,
  condiciones text,
  -- Link al PDF/adjunto de la cotización del proveedor (la captura va en UI Fase 2).
  adjunto_url text,
  notas text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (cotizacion_id, proveedor_id)
);

CREATE TABLE IF NOT EXISTS erp.cotizacion_proveedor_precios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL REFERENCES core.empresas (id),
  cotizacion_proveedor_id uuid NOT NULL
    REFERENCES erp.cotizacion_proveedores (id) ON DELETE CASCADE,
  cotizacion_linea_id uuid NOT NULL
    REFERENCES erp.cotizacion_lineas (id) ON DELETE CASCADE,
  precio_unitario numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (cotizacion_proveedor_id, cotizacion_linea_id)
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Índices (FK lookups + filtros)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_cotizaciones_empresa ON erp.cotizaciones (empresa_id);
CREATE INDEX IF NOT EXISTS idx_cotizaciones_requisicion ON erp.cotizaciones (requisicion_id);
CREATE INDEX IF NOT EXISTS idx_cotizacion_lineas_cotizacion ON erp.cotizacion_lineas (cotizacion_id);
CREATE INDEX IF NOT EXISTS idx_cotizacion_lineas_partida ON erp.cotizacion_lineas (partida_id);
CREATE INDEX IF NOT EXISTS idx_cotizacion_proveedores_cotizacion ON erp.cotizacion_proveedores (cotizacion_id);
CREATE INDEX IF NOT EXISTS idx_cotizacion_proveedores_proveedor ON erp.cotizacion_proveedores (proveedor_id);
CREATE INDEX IF NOT EXISTS idx_cotizacion_precios_proveedor ON erp.cotizacion_proveedor_precios (cotizacion_proveedor_id);
CREATE INDEX IF NOT EXISTS idx_cotizacion_precios_linea ON erp.cotizacion_proveedor_precios (cotizacion_linea_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Triggers updated_at (función estándar erp.fn_set_updated_at)
-- ─────────────────────────────────────────────────────────────────────────────

DROP TRIGGER IF EXISTS erp_cotizaciones_updated_at ON erp.cotizaciones;
CREATE TRIGGER erp_cotizaciones_updated_at BEFORE UPDATE ON erp.cotizaciones
  FOR EACH ROW EXECUTE FUNCTION erp.fn_set_updated_at();

DROP TRIGGER IF EXISTS erp_cotizacion_proveedores_updated_at ON erp.cotizacion_proveedores;
CREATE TRIGGER erp_cotizacion_proveedores_updated_at BEFORE UPDATE ON erp.cotizacion_proveedores
  FOR EACH ROW EXECUTE FUNCTION erp.fn_set_updated_at();

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Grants + RLS (patrón de erp.ordenes_compra: authenticated, aislado por empresa)
-- ─────────────────────────────────────────────────────────────────────────────

GRANT SELECT, INSERT, UPDATE, DELETE ON erp.cotizaciones TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON erp.cotizacion_lineas TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON erp.cotizacion_proveedores TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON erp.cotizacion_proveedor_precios TO authenticated;

ALTER TABLE erp.cotizaciones ENABLE ROW LEVEL SECURITY;
ALTER TABLE erp.cotizacion_lineas ENABLE ROW LEVEL SECURITY;
ALTER TABLE erp.cotizacion_proveedores ENABLE ROW LEVEL SECURITY;
ALTER TABLE erp.cotizacion_proveedor_precios ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  t text;
  pred text := '(core.fn_has_empresa(empresa_id) OR core.fn_is_admin())';
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'cotizaciones', 'cotizacion_lineas', 'cotizacion_proveedores', 'cotizacion_proveedor_precios'
  ] LOOP
    EXECUTE format('DROP POLICY IF EXISTS erp_%1$s_select ON erp.%1$s', t);
    EXECUTE format('DROP POLICY IF EXISTS erp_%1$s_insert ON erp.%1$s', t);
    EXECUTE format('DROP POLICY IF EXISTS erp_%1$s_update ON erp.%1$s', t);
    EXECUTE format('DROP POLICY IF EXISTS erp_%1$s_delete ON erp.%1$s', t);
    EXECUTE format('CREATE POLICY erp_%1$s_select ON erp.%1$s FOR SELECT TO authenticated USING %2$s', t, pred);
    EXECUTE format('CREATE POLICY erp_%1$s_insert ON erp.%1$s FOR INSERT TO authenticated WITH CHECK %2$s', t, pred);
    EXECUTE format('CREATE POLICY erp_%1$s_update ON erp.%1$s FOR UPDATE TO authenticated USING %2$s WITH CHECK %2$s', t, pred);
    EXECUTE format('CREATE POLICY erp_%1$s_delete ON erp.%1$s FOR DELETE TO authenticated USING %2$s', t, pred);
  END LOOP;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. FKs de adjudicación (la OC / el contrato nacen de una cotización)
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE erp.ordenes_compra ADD COLUMN IF NOT EXISTS cotizacion_id uuid;
ALTER TABLE dilesa.contratos_construccion ADD COLUMN IF NOT EXISTS cotizacion_id uuid;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ordenes_compra_cotizacion_id_fkey') THEN
    ALTER TABLE erp.ordenes_compra
      ADD CONSTRAINT ordenes_compra_cotizacion_id_fkey
      FOREIGN KEY (cotizacion_id) REFERENCES erp.cotizaciones (id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'contratos_construccion_cotizacion_id_fkey') THEN
    ALTER TABLE dilesa.contratos_construccion
      ADD CONSTRAINT contratos_construccion_cotizacion_id_fkey
      FOREIGN KEY (cotizacion_id) REFERENCES erp.cotizaciones (id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_ordenes_compra_cotizacion ON erp.ordenes_compra (cotizacion_id) WHERE cotizacion_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_contratos_construccion_cotizacion ON dilesa.contratos_construccion (cotizacion_id) WHERE cotizacion_id IS NOT NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. RBAC: sub-slug dilesa.compras.cotizaciones + backfill de permisos
--    (clona del hermano dilesa.compras.ordenes; ADR-030 / regla "4 lugares")
-- ─────────────────────────────────────────────────────────────────────────────

INSERT INTO core.modulos (slug, nombre, descripcion, empresa_id, seccion)
SELECT 'dilesa.compras.cotizaciones', 'Compras · Cotizaciones',
       'Cotización formal multi-proveedor (RFQ): pedir precio a N, comparar y adjudicar a OC o contrato',
       d.id, 'operaciones'
FROM (SELECT id FROM core.empresas WHERE slug = 'dilesa') d
ON CONFLICT (empresa_id, slug) DO NOTHING;

INSERT INTO core.permisos_rol (rol_id, modulo_id, acceso_lectura, acceso_escritura)
SELECT pr.rol_id, nuevo.id, pr.acceso_lectura, pr.acceso_escritura
FROM core.permisos_rol pr
JOIN core.modulos src ON src.id = pr.modulo_id AND src.slug = 'dilesa.compras.ordenes'
JOIN core.modulos nuevo ON nuevo.empresa_id = src.empresa_id
  AND nuevo.slug = 'dilesa.compras.cotizaciones'
ON CONFLICT (rol_id, modulo_id) DO NOTHING;

NOTIFY pgrst, 'reload schema';
