-- ============================================================
-- Phase 1: Migrate rdb operational tables → erp schema
-- SAFE: Does NOT touch waitry_* tables, triggers, or cortes
-- RDB empresa_id: e52ac307-9373-4115-b65e-1178f0c4e1aa
-- ============================================================

-- ============================================================
-- 0. Add missing cajas table to erp (not in original DDL)
-- ============================================================
CREATE TABLE IF NOT EXISTS erp.cajas (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id  uuid NOT NULL REFERENCES core.empresas(id),
  nombre      text NOT NULL,
  ubicacion   text,
  responsable_id uuid REFERENCES erp.empleados(id),
  activo      boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz
);

ALTER TABLE erp.cajas ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_erp_cajas_empresa ON erp.cajas(empresa_id);

COMMENT ON TABLE erp.cajas IS 'Cajas registradoras por empresa (POS).';

-- RLS for cajas (same pattern as other erp tables)
DO $$
BEGIN
  EXECUTE format('
    CREATE POLICY "erp_cajas_empresa_select" ON erp.cajas FOR SELECT TO authenticated
      USING (empresa_id IN (
        SELECT ue.empresa_id FROM core.usuarios_empresas ue
        JOIN core.usuarios u ON u.id = ue.usuario_id
        WHERE lower(u.email) = lower(auth.email()) AND ue.activo = true
      ));
    CREATE POLICY "erp_cajas_empresa_insert" ON erp.cajas FOR INSERT TO authenticated
      WITH CHECK (empresa_id IN (
        SELECT ue.empresa_id FROM core.usuarios_empresas ue
        JOIN core.usuarios u ON u.id = ue.usuario_id
        WHERE lower(u.email) = lower(auth.email()) AND ue.activo = true
      ));
    CREATE POLICY "erp_cajas_empresa_update" ON erp.cajas FOR UPDATE TO authenticated
      USING (empresa_id IN (
        SELECT ue.empresa_id FROM core.usuarios_empresas ue
        JOIN core.usuarios u ON u.id = ue.usuario_id
        WHERE lower(u.email) = lower(auth.email()) AND ue.activo = true
      ));
  ');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

GRANT ALL ON erp.cajas TO service_role;

-- Add trigger for updated_at
CREATE TRIGGER set_updated_at_erp_cajas
  BEFORE UPDATE ON erp.cajas
  FOR EACH ROW EXECUTE FUNCTION erp.fn_set_updated_at();

-- Expose again
ALTER ROLE authenticator SET pgrst.db_schemas = 'public, graphql_public, rdb, playtomic, core, shared, erp';
NOTIFY pgrst, 'reload schema';

-- ============================================================
-- DATA MIGRATIONS — EDITED 2026-04-23 (drift-1.5)
-- All INSERT...SELECT FROM rdb.* sources are guarded with to_regclass()
-- so a fresh DB (Preview Branch / dev local) without the rdb.* legacy
-- tables ends up with empty erp.* tables, which is the correct state.
-- Production already has the data migrated.
-- ============================================================

-- 1. CAJAS (5 rows) → erp.cajas
DO $do$ BEGIN
  IF to_regclass('rdb.cajas') IS NOT NULL THEN
    INSERT INTO erp.cajas (id, empresa_id, nombre, responsable_id, activo, created_at, updated_at)
    SELECT c.id, 'e52ac307-9373-4115-b65e-1178f0c4e1aa'::uuid, c.nombre,
           NULL, true, now(), now()
    FROM rdb.cajas c
    ON CONFLICT (id) DO NOTHING;
  END IF;
END $do$;

-- 2. PROVEEDORES → erp.personas + erp.proveedores
DO $do$ BEGIN
  IF to_regclass('rdb.proveedores') IS NOT NULL THEN
    INSERT INTO erp.personas (id, empresa_id, nombre, apellido_paterno, apellido_materno, email, telefono, rfc, tipo, activo, created_at, updated_at)
    SELECT
      gen_random_uuid(),
      'e52ac307-9373-4115-b65e-1178f0c4e1aa'::uuid,
      split_part(p.nombre, ' ', 1),
      CASE WHEN position(' ' in p.nombre) > 0 THEN substring(p.nombre from position(' ' in p.nombre) + 1) ELSE NULL END,
      NULL, p.email, p.telefono, p.rfc, 'proveedor', p.activo,
      COALESCE(p.created_at, now()), COALESCE(p.updated_at, now())
    FROM rdb.proveedores p
    ON CONFLICT DO NOTHING;

    INSERT INTO erp.proveedores (id, empresa_id, persona_id, codigo, condiciones_pago, limite_credito, activo, created_at, updated_at, deleted_at)
    SELECT
      p.id, 'e52ac307-9373-4115-b65e-1178f0c4e1aa'::uuid, per.id,
      NULL, NULL, NULL, p.activo,
      COALESCE(p.created_at, now()), COALESCE(p.updated_at, now()), NULL
    FROM rdb.proveedores p
    LEFT JOIN erp.personas per
      ON per.empresa_id = 'e52ac307-9373-4115-b65e-1178f0c4e1aa'::uuid
     AND per.nombre = split_part(p.nombre, ' ', 1)
     AND per.tipo = 'proveedor'
    ON CONFLICT (id) DO NOTHING;
  END IF;
END $do$;

-- 3. PRODUCTOS → erp.productos + erp.productos_precios
DO $do$ BEGIN
  IF to_regclass('rdb.productos') IS NOT NULL THEN
    INSERT INTO erp.productos (id, empresa_id, codigo, nombre, descripcion, tipo, categoria_id, unidad, inventariable, activo, created_at, updated_at, deleted_at)
    SELECT
      p.id, 'e52ac307-9373-4115-b65e-1178f0c4e1aa'::uuid,
      p.waitry_item_id::text, p.nombre, p.descripcion,
      CASE
        WHEN p.categoria = 'Deportes' THEN 'servicio'
        WHEN p.categoria = 'Propinas' THEN 'servicio'
        ELSE 'producto'
      END,
      NULL, p.unidad, p.inventariable, p.activo,
      COALESCE(p.created_at, now()), COALESCE(p.updated_at, now()), NULL
    FROM rdb.productos p
    ON CONFLICT (id) DO NOTHING;

    INSERT INTO erp.productos_precios (id, empresa_id, producto_id, costo, precio_venta, fecha_inicio, vigente, created_at)
    SELECT
      gen_random_uuid(), 'e52ac307-9373-4115-b65e-1178f0c4e1aa'::uuid, p.id,
      p.costo_unitario, p.precio,
      COALESCE(p.created_at::date, current_date), true,
      COALESCE(p.created_at, now())
    FROM rdb.productos p
    WHERE p.costo_unitario IS NOT NULL OR p.precio IS NOT NULL
    ON CONFLICT DO NOTHING;
  END IF;
END $do$;

-- 4. REQUISICIONES → erp.requisiciones
DO $do$ BEGIN
  IF to_regclass('rdb.requisiciones') IS NOT NULL THEN
    INSERT INTO erp.requisiciones (id, empresa_id, codigo, solicitante_id, departamento_id, prioridad_id, estado_id, subtipo, justificacion, fecha_requerida, autorizada_at, created_at, updated_at, deleted_at)
    SELECT
      r.id, 'e52ac307-9373-4115-b65e-1178f0c4e1aa'::uuid, r.folio,
      NULL, NULL, NULL, NULL, NULL, r.notas, r.fecha_necesidad,
      CASE WHEN r.estatus IN ('aprobada', 'autorizada') THEN r.updated_at ELSE NULL END,
      COALESCE(r.created_at, now()), COALESCE(r.updated_at, now()), NULL
    FROM rdb.requisiciones r
    ON CONFLICT (id) DO NOTHING;
  END IF;
END $do$;

-- 5. REQUISICIONES_ITEMS → erp.requisiciones_detalle
DO $do$ BEGIN
  IF to_regclass('rdb.requisiciones_items') IS NOT NULL THEN
    INSERT INTO erp.requisiciones_detalle (id, empresa_id, requisicion_id, producto_id, descripcion, unidad, cantidad, precio_estimado, notas)
    SELECT
      ri.id, 'e52ac307-9373-4115-b65e-1178f0c4e1aa'::uuid, ri.requisicion_id,
      ri.producto_id, ri.descripcion, ri.unidad, ri.cantidad, NULL, ri.notas
    FROM rdb.requisiciones_items ri
    ON CONFLICT (id) DO NOTHING;
  END IF;
END $do$;

-- 6. ORDENES_COMPRA → erp.ordenes_compra
DO $do$ BEGIN
  IF to_regclass('rdb.ordenes_compra') IS NOT NULL THEN
    INSERT INTO erp.ordenes_compra (id, empresa_id, requisicion_id, proveedor_id, codigo, estado_id, subtotal, iva, total, condiciones_pago, fecha_entrega, direccion_entrega, autorizada_at, created_at, updated_at, deleted_at)
    SELECT
      oc.id, 'e52ac307-9373-4115-b65e-1178f0c4e1aa'::uuid,
      oc.requisicion_id, oc.proveedor_id, oc.folio,
      NULL, NULL, NULL, COALESCE(oc.total_real, oc.total_estimado),
      NULL, oc.fecha_recepcion, NULL, NULL,
      COALESCE(oc.created_at, now()), COALESCE(oc.updated_at, now()), NULL
    FROM rdb.ordenes_compra oc
    ON CONFLICT (id) DO NOTHING;
  END IF;
END $do$;

-- 7. ORDENES_COMPRA_ITEMS → erp.ordenes_compra_detalle
DO $do$ BEGIN
  IF to_regclass('rdb.ordenes_compra_items') IS NOT NULL THEN
    INSERT INTO erp.ordenes_compra_detalle (id, empresa_id, orden_compra_id, producto_id, descripcion, unidad, cantidad, precio_unitario, descuento, subtotal)
    SELECT
      oci.id, 'e52ac307-9373-4115-b65e-1178f0c4e1aa'::uuid,
      oci.orden_id, oci.producto_id, oci.descripcion, NULL,
      oci.cantidad, oci.precio_unitario, NULL, oci.subtotal
    FROM rdb.ordenes_compra_items oci
    ON CONFLICT (id) DO NOTHING;
  END IF;
END $do$;

-- 0b. Default almacen for RDB — only if the RDB empresa exists.
DO $do$ BEGIN
  IF EXISTS (
    SELECT 1 FROM core.empresas
    WHERE id = 'e52ac307-9373-4115-b65e-1178f0c4e1aa'::uuid
  ) THEN
    INSERT INTO erp.almacenes (id, empresa_id, nombre, ubicacion, responsable_id, activo, created_at)
    VALUES (
      gen_random_uuid(),
      'e52ac307-9373-4115-b65e-1178f0c4e1aa'::uuid,
      'Almacén Principal RDB',
      'Rincón del Bosque',
      NULL,
      true,
      now()
    ) ON CONFLICT DO NOTHING;
  END IF;
END $do$;

-- 8. INVENTARIO_MOVIMIENTOS → erp.movimientos_inventario
DO $do$ BEGIN
  IF to_regclass('rdb.inventario_movimientos') IS NOT NULL THEN
    INSERT INTO erp.movimientos_inventario (id, empresa_id, producto_id, almacen_id, tipo_movimiento, cantidad, costo_unitario, referencia_tipo, referencia_id, notas, created_by, created_at)
    SELECT
      im.id, 'e52ac307-9373-4115-b65e-1178f0c4e1aa'::uuid,
      im.producto_id,
      (SELECT id FROM erp.almacenes WHERE empresa_id = 'e52ac307-9373-4115-b65e-1178f0c4e1aa'::uuid LIMIT 1),
      im.tipo, im.cantidad, im.costo_unitario,
      im.referencia_tipo, COALESCE(im.referencia_id, im.oc_id),
      im.notas, NULL,
      COALESCE(im.created_at, now())
    FROM rdb.inventario_movimientos im
    ON CONFLICT (id) DO NOTHING;
  END IF;
END $do$;

-- ============================================================
-- 9. TASKS: Skip for now — erp.tasks has different schema (estado text vs estado_id FK, etc.)
--     Will migrate separately after code changes
-- ============================================================


-- ============================================================
-- GRANTS
-- ============================================================
GRANT ALL ON ALL TABLES IN SCHEMA erp TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA erp TO service_role;
