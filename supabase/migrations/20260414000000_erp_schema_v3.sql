-- ============================================================
-- BSOP ERP Schema v3
-- Migration: 20260414000000_erp_schema_v3.sql
-- Date: 2026-04-14
-- Description: Full erp.* schema — all business operations,
--              every table scoped to empresa_id.
--
-- Schemas NOT touched: core, shared, rdb, playtomic, public
-- Prerequisites: core.empresas, core.usuarios,
--               shared.categorias, shared.estados,
--               shared.monedas, shared.prioridades
-- ============================================================

-- ─── Schema ──────────────────────────────────────────────────────────────────
CREATE SCHEMA IF NOT EXISTS erp;
COMMENT ON SCHEMA erp IS 'Toda la operación de negocio del grupo: RH, compras, inventario, finanzas, inmobiliario, automotriz, POS y agenda.';

-- ─── Generic updated_at trigger ──────────────────────────────────────────────
CREATE OR REPLACE FUNCTION erp.fn_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;
COMMENT ON FUNCTION erp.fn_set_updated_at() IS 'Trigger genérico que mantiene updated_at en cada UPDATE.';


-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║  PERSONAS / RH                                                           ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

-- ── erp.departamentos ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS erp.departamentos (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id  UUID NOT NULL REFERENCES core.empresas(id),
  nombre      TEXT NOT NULL,
  codigo      TEXT,
  padre_id    UUID REFERENCES erp.departamentos(id),
  activo      BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
COMMENT ON TABLE  erp.departamentos          IS 'Estructura organizacional por empresa. Soporta jerarquía vía padre_id.';
COMMENT ON COLUMN erp.departamentos.padre_id IS 'Departamento padre para jerarquía.';

CREATE INDEX IF NOT EXISTS erp_departamentos_empresa_id_idx ON erp.departamentos (empresa_id);
CREATE INDEX IF NOT EXISTS erp_departamentos_codigo_idx     ON erp.departamentos (empresa_id, codigo) WHERE codigo IS NOT NULL;
ALTER TABLE erp.departamentos ENABLE ROW LEVEL SECURITY;

-- ── erp.puestos ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS erp.puestos (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id      UUID NOT NULL REFERENCES core.empresas(id),
  departamento_id UUID REFERENCES erp.departamentos(id),
  nombre          TEXT NOT NULL,
  nivel           TEXT,
  sueldo_min      NUMERIC(14,2),
  sueldo_max      NUMERIC(14,2),
  activo          BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
COMMENT ON TABLE erp.puestos IS 'Catálogo de puestos por empresa.';

CREATE INDEX IF NOT EXISTS erp_puestos_empresa_id_idx      ON erp.puestos (empresa_id);
CREATE INDEX IF NOT EXISTS erp_puestos_departamento_id_idx ON erp.puestos (departamento_id);
ALTER TABLE erp.puestos ENABLE ROW LEVEL SECURITY;

-- ── erp.personas ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS erp.personas (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id       UUID NOT NULL REFERENCES core.empresas(id),
  nombre           TEXT NOT NULL,
  apellido_paterno TEXT,
  apellido_materno TEXT,
  email            TEXT,
  telefono         TEXT,
  rfc              TEXT,
  curp             TEXT,
  tipo             TEXT NOT NULL DEFAULT 'general'
                   CHECK (tipo IN ('empleado','proveedor','cliente','general')),
  activo           BOOLEAN NOT NULL DEFAULT true,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ,
  deleted_at       TIMESTAMPTZ
);
COMMENT ON TABLE  erp.personas      IS 'Registro maestro de personas físicas/morales. Base para empleados, proveedores y clientes.';
COMMENT ON COLUMN erp.personas.tipo IS 'Clasificación primaria; una persona puede vincularse a múltiples roles.';

CREATE INDEX IF NOT EXISTS erp_personas_empresa_id_idx ON erp.personas (empresa_id);
CREATE INDEX IF NOT EXISTS erp_personas_tipo_idx       ON erp.personas (empresa_id, tipo);
CREATE INDEX IF NOT EXISTS erp_personas_email_idx      ON erp.personas (empresa_id, email) WHERE email IS NOT NULL;
CREATE INDEX IF NOT EXISTS erp_personas_rfc_idx        ON erp.personas (empresa_id, rfc)   WHERE rfc IS NOT NULL;
CREATE INDEX IF NOT EXISTS erp_personas_deleted_idx    ON erp.personas (empresa_id) WHERE deleted_at IS NULL;
ALTER TABLE erp.personas ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER erp_personas_updated_at BEFORE UPDATE ON erp.personas FOR EACH ROW EXECUTE FUNCTION erp.fn_set_updated_at();

-- ── erp.empleados ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS erp.empleados (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id      UUID NOT NULL REFERENCES core.empresas(id),
  persona_id      UUID NOT NULL REFERENCES erp.personas(id),
  departamento_id UUID REFERENCES erp.departamentos(id),
  puesto_id       UUID REFERENCES erp.puestos(id),
  numero_empleado TEXT,
  fecha_ingreso   DATE,
  fecha_baja      DATE,
  motivo_baja     TEXT,
  reemplaza_a     UUID REFERENCES erp.empleados(id),
  activo          BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ,
  deleted_at      TIMESTAMPTZ
);
COMMENT ON TABLE  erp.empleados             IS 'Empleados por empresa. La identidad base vive en erp.personas.';
COMMENT ON COLUMN erp.empleados.reemplaza_a IS 'Empleado al que reemplaza; útil para historial de sucesiones.';

CREATE INDEX IF NOT EXISTS erp_empleados_empresa_id_idx      ON erp.empleados (empresa_id);
CREATE INDEX IF NOT EXISTS erp_empleados_persona_id_idx      ON erp.empleados (persona_id);
CREATE INDEX IF NOT EXISTS erp_empleados_departamento_id_idx ON erp.empleados (departamento_id);
CREATE INDEX IF NOT EXISTS erp_empleados_activo_idx          ON erp.empleados (empresa_id, activo);
CREATE INDEX IF NOT EXISTS erp_empleados_deleted_idx         ON erp.empleados (empresa_id) WHERE deleted_at IS NULL;
ALTER TABLE erp.empleados ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER erp_empleados_updated_at BEFORE UPDATE ON erp.empleados FOR EACH ROW EXECUTE FUNCTION erp.fn_set_updated_at();

-- ── erp.empleados_compensacion ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS erp.empleados_compensacion (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id      UUID NOT NULL REFERENCES core.empresas(id),
  empleado_id     UUID NOT NULL REFERENCES erp.empleados(id),
  sueldo_diario   NUMERIC(14,2),
  sueldo_mensual  NUMERIC(14,2),
  tipo_contrato   TEXT CHECK (tipo_contrato IN ('indefinido','temporal','por_obra','honorarios')),
  frecuencia_pago TEXT CHECK (frecuencia_pago IN ('semanal','quincenal','mensual')),
  fecha_inicio    DATE NOT NULL,
  fecha_fin       DATE,
  vigente         BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ
);
COMMENT ON TABLE erp.empleados_compensacion IS 'Historial de compensaciones. Solo vigente=true es el registro activo.';

CREATE INDEX IF NOT EXISTS erp_comp_empresa_id_idx  ON erp.empleados_compensacion (empresa_id);
CREATE INDEX IF NOT EXISTS erp_comp_empleado_id_idx ON erp.empleados_compensacion (empleado_id);
CREATE INDEX IF NOT EXISTS erp_comp_vigente_idx     ON erp.empleados_compensacion (empleado_id, vigente);
ALTER TABLE erp.empleados_compensacion ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER erp_comp_updated_at BEFORE UPDATE ON erp.empleados_compensacion FOR EACH ROW EXECUTE FUNCTION erp.fn_set_updated_at();

-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║  CATÁLOGOS DE NEGOCIO                                                    ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

-- ── erp.proveedores ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS erp.proveedores (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id       UUID NOT NULL REFERENCES core.empresas(id),
  persona_id       UUID NOT NULL REFERENCES erp.personas(id),
  codigo           TEXT,
  condiciones_pago TEXT,
  limite_credito   NUMERIC(14,2),
  activo           BOOLEAN NOT NULL DEFAULT true,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ,
  deleted_at       TIMESTAMPTZ
);
COMMENT ON TABLE erp.proveedores IS 'Catálogo de proveedores vinculados a erp.personas.';

CREATE INDEX IF NOT EXISTS erp_proveedores_empresa_id_idx ON erp.proveedores (empresa_id);
CREATE INDEX IF NOT EXISTS erp_proveedores_persona_id_idx ON erp.proveedores (persona_id);
CREATE INDEX IF NOT EXISTS erp_proveedores_codigo_idx     ON erp.proveedores (empresa_id, codigo) WHERE codigo IS NOT NULL;
CREATE INDEX IF NOT EXISTS erp_proveedores_deleted_idx    ON erp.proveedores (empresa_id) WHERE deleted_at IS NULL;
ALTER TABLE erp.proveedores ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER erp_proveedores_updated_at BEFORE UPDATE ON erp.proveedores FOR EACH ROW EXECUTE FUNCTION erp.fn_set_updated_at();

-- ── erp.clientes ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS erp.clientes (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id   UUID NOT NULL REFERENCES core.empresas(id),
  persona_id   UUID NOT NULL REFERENCES erp.personas(id),
  tipo         TEXT CHECK (tipo IN ('individual','empresa','gobierno')),
  perfil_extra JSONB,
  activo       BOOLEAN NOT NULL DEFAULT true,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ,
  deleted_at   TIMESTAMPTZ
);
COMMENT ON TABLE  erp.clientes              IS 'Catálogo de clientes vinculados a erp.personas.';
COMMENT ON COLUMN erp.clientes.perfil_extra IS 'Atributos extra por vertical (ANSA, DILESA, RDB, etc).';

CREATE INDEX IF NOT EXISTS erp_clientes_empresa_id_idx ON erp.clientes (empresa_id);
CREATE INDEX IF NOT EXISTS erp_clientes_persona_id_idx ON erp.clientes (persona_id);
CREATE INDEX IF NOT EXISTS erp_clientes_tipo_idx       ON erp.clientes (empresa_id, tipo);
CREATE INDEX IF NOT EXISTS erp_clientes_deleted_idx    ON erp.clientes (empresa_id) WHERE deleted_at IS NULL;
ALTER TABLE erp.clientes ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER erp_clientes_updated_at BEFORE UPDATE ON erp.clientes FOR EACH ROW EXECUTE FUNCTION erp.fn_set_updated_at();

-- ── erp.productos ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS erp.productos (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id    UUID NOT NULL REFERENCES core.empresas(id),
  categoria_id  UUID REFERENCES shared.categorias(id),
  codigo        TEXT,
  nombre        TEXT NOT NULL,
  descripcion   TEXT,
  tipo          TEXT NOT NULL DEFAULT 'producto'
                CHECK (tipo IN ('producto','servicio','insumo','refaccion')),
  unidad        TEXT NOT NULL DEFAULT 'pieza',
  inventariable BOOLEAN NOT NULL DEFAULT true,
  activo        BOOLEAN NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ,
  deleted_at    TIMESTAMPTZ
);
COMMENT ON TABLE erp.productos IS 'Catálogo maestro de productos, servicios e insumos por empresa.';

CREATE INDEX IF NOT EXISTS erp_productos_empresa_id_idx   ON erp.productos (empresa_id);
CREATE INDEX IF NOT EXISTS erp_productos_codigo_idx       ON erp.productos (empresa_id, codigo) WHERE codigo IS NOT NULL;
CREATE INDEX IF NOT EXISTS erp_productos_categoria_id_idx ON erp.productos (categoria_id);
CREATE INDEX IF NOT EXISTS erp_productos_tipo_idx         ON erp.productos (empresa_id, tipo);
CREATE INDEX IF NOT EXISTS erp_productos_deleted_idx      ON erp.productos (empresa_id) WHERE deleted_at IS NULL;
ALTER TABLE erp.productos ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER erp_productos_updated_at BEFORE UPDATE ON erp.productos FOR EACH ROW EXECUTE FUNCTION erp.fn_set_updated_at();

-- ── erp.productos_precios ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS erp.productos_precios (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id   UUID NOT NULL REFERENCES core.empresas(id),
  producto_id  UUID NOT NULL REFERENCES erp.productos(id),
  costo        NUMERIC(14,2),
  precio_venta NUMERIC(14,2),
  fecha_inicio DATE NOT NULL DEFAULT CURRENT_DATE,
  fecha_fin    DATE,
  vigente      BOOLEAN NOT NULL DEFAULT true,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
COMMENT ON TABLE erp.productos_precios IS 'Historial de costos y precios. Solo vigente=true es el precio activo.';

CREATE INDEX IF NOT EXISTS erp_precios_empresa_id_idx  ON erp.productos_precios (empresa_id);
CREATE INDEX IF NOT EXISTS erp_precios_producto_id_idx ON erp.productos_precios (producto_id);
CREATE INDEX IF NOT EXISTS erp_precios_vigente_idx     ON erp.productos_precios (producto_id, vigente);
ALTER TABLE erp.productos_precios ENABLE ROW LEVEL SECURITY;

-- ── erp.almacenes ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS erp.almacenes (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id     UUID NOT NULL REFERENCES core.empresas(id),
  nombre         TEXT NOT NULL,
  ubicacion      TEXT,
  responsable_id UUID REFERENCES erp.empleados(id),
  activo         BOOLEAN NOT NULL DEFAULT true,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
COMMENT ON TABLE erp.almacenes IS 'Ubicaciones físicas de inventario por empresa.';

CREATE INDEX IF NOT EXISTS erp_almacenes_empresa_id_idx ON erp.almacenes (empresa_id);
ALTER TABLE erp.almacenes ENABLE ROW LEVEL SECURITY;


-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║  INVENTARIO                                                              ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

-- ── erp.inventario ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS erp.inventario (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id        UUID NOT NULL REFERENCES core.empresas(id),
  producto_id       UUID NOT NULL REFERENCES erp.productos(id),
  almacen_id        UUID NOT NULL REFERENCES erp.almacenes(id),
  cantidad          NUMERIC(14,4) NOT NULL DEFAULT 0,
  cantidad_minima   NUMERIC(14,4),
  cantidad_maxima   NUMERIC(14,4),
  costo_promedio    NUMERIC(14,4),
  ultimo_movimiento TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ,
  UNIQUE (empresa_id, producto_id, almacen_id)
);
COMMENT ON TABLE erp.inventario IS 'Stock actual por producto y almacén. Se actualiza mediante movimientos_inventario.';

CREATE INDEX IF NOT EXISTS erp_inventario_empresa_id_idx  ON erp.inventario (empresa_id);
CREATE INDEX IF NOT EXISTS erp_inventario_producto_id_idx ON erp.inventario (producto_id);
CREATE INDEX IF NOT EXISTS erp_inventario_almacen_id_idx  ON erp.inventario (almacen_id);
ALTER TABLE erp.inventario ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER erp_inventario_updated_at BEFORE UPDATE ON erp.inventario FOR EACH ROW EXECUTE FUNCTION erp.fn_set_updated_at();

-- ── erp.movimientos_inventario ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS erp.movimientos_inventario (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id      UUID NOT NULL REFERENCES core.empresas(id),
  producto_id     UUID NOT NULL REFERENCES erp.productos(id),
  almacen_id      UUID NOT NULL REFERENCES erp.almacenes(id),
  tipo_movimiento TEXT NOT NULL
                  CHECK (tipo_movimiento IN ('entrada','salida','ajuste','transferencia','devolucion')),
  cantidad        NUMERIC(14,4) NOT NULL,
  costo_unitario  NUMERIC(14,4),
  referencia_tipo TEXT,
  referencia_id   UUID,
  notas           TEXT,
  created_by      UUID REFERENCES core.usuarios(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
COMMENT ON TABLE erp.movimientos_inventario IS 'Cada movimiento de inventario. referencia_tipo/id trazan el origen (OC, requisición, etc).';

CREATE INDEX IF NOT EXISTS erp_mov_inv_empresa_id_idx  ON erp.movimientos_inventario (empresa_id);
CREATE INDEX IF NOT EXISTS erp_mov_inv_producto_id_idx ON erp.movimientos_inventario (producto_id);
CREATE INDEX IF NOT EXISTS erp_mov_inv_almacen_id_idx  ON erp.movimientos_inventario (almacen_id);
CREATE INDEX IF NOT EXISTS erp_mov_inv_tipo_idx        ON erp.movimientos_inventario (empresa_id, tipo_movimiento);
CREATE INDEX IF NOT EXISTS erp_mov_inv_created_at_idx  ON erp.movimientos_inventario (empresa_id, created_at DESC);
ALTER TABLE erp.movimientos_inventario ENABLE ROW LEVEL SECURITY;

-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║  COMPRAS                                                                 ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

-- ── erp.requisiciones ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS erp.requisiciones (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id      UUID NOT NULL REFERENCES core.empresas(id),
  codigo          TEXT,
  solicitante_id  UUID REFERENCES erp.empleados(id),
  departamento_id UUID REFERENCES erp.departamentos(id),
  prioridad_id    UUID REFERENCES shared.prioridades(id),
  estado_id       UUID REFERENCES shared.estados(id),
  subtipo         TEXT CHECK (subtipo IN ('general','combustible','servicios','activos')),
  justificacion   TEXT,
  fecha_requerida DATE,
  autorizada_at   TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ,
  deleted_at      TIMESTAMPTZ
);
COMMENT ON TABLE  erp.requisiciones         IS 'Solicitudes de compra por empresa.';
COMMENT ON COLUMN erp.requisiciones.subtipo IS 'Subtipo operativo: general, combustible, servicios, activos.';

CREATE INDEX IF NOT EXISTS erp_req_empresa_id_idx     ON erp.requisiciones (empresa_id);
CREATE INDEX IF NOT EXISTS erp_req_codigo_idx         ON erp.requisiciones (empresa_id, codigo) WHERE codigo IS NOT NULL;
CREATE INDEX IF NOT EXISTS erp_req_solicitante_id_idx ON erp.requisiciones (solicitante_id);
CREATE INDEX IF NOT EXISTS erp_req_estado_id_idx      ON erp.requisiciones (estado_id);
CREATE INDEX IF NOT EXISTS erp_req_deleted_idx        ON erp.requisiciones (empresa_id) WHERE deleted_at IS NULL;
ALTER TABLE erp.requisiciones ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER erp_requisiciones_updated_at BEFORE UPDATE ON erp.requisiciones FOR EACH ROW EXECUTE FUNCTION erp.fn_set_updated_at();

-- ── erp.requisiciones_detalle ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS erp.requisiciones_detalle (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id      UUID NOT NULL REFERENCES core.empresas(id),
  requisicion_id  UUID NOT NULL REFERENCES erp.requisiciones(id) ON DELETE CASCADE,
  producto_id     UUID REFERENCES erp.productos(id),
  descripcion     TEXT,
  unidad          TEXT,
  cantidad        NUMERIC(14,4) NOT NULL DEFAULT 1,
  precio_estimado NUMERIC(14,2),
  notas           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
COMMENT ON TABLE erp.requisiciones_detalle IS 'Líneas de una requisición. producto_id puede ser NULL para artículos de texto libre.';

CREATE INDEX IF NOT EXISTS erp_req_det_empresa_id_idx     ON erp.requisiciones_detalle (empresa_id);
CREATE INDEX IF NOT EXISTS erp_req_det_requisicion_id_idx ON erp.requisiciones_detalle (requisicion_id);
ALTER TABLE erp.requisiciones_detalle ENABLE ROW LEVEL SECURITY;

-- ── erp.ordenes_compra ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS erp.ordenes_compra (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id        UUID NOT NULL REFERENCES core.empresas(id),
  requisicion_id    UUID REFERENCES erp.requisiciones(id),
  proveedor_id      UUID REFERENCES erp.proveedores(id),
  codigo            TEXT,
  estado_id         UUID REFERENCES shared.estados(id),
  moneda_id         UUID REFERENCES shared.monedas(id),
  subtotal          NUMERIC(14,2),
  iva               NUMERIC(14,2),
  total             NUMERIC(14,2),
  condiciones_pago  TEXT,
  fecha_entrega     DATE,
  direccion_entrega TEXT,
  autorizada_at     TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ,
  deleted_at        TIMESTAMPTZ
);
COMMENT ON TABLE erp.ordenes_compra IS 'Órdenes de compra emitidas a proveedores. Pueden derivar de una requisición o crearse directamente.';

CREATE INDEX IF NOT EXISTS erp_oc_empresa_id_idx   ON erp.ordenes_compra (empresa_id);
CREATE INDEX IF NOT EXISTS erp_oc_codigo_idx       ON erp.ordenes_compra (empresa_id, codigo) WHERE codigo IS NOT NULL;
CREATE INDEX IF NOT EXISTS erp_oc_proveedor_id_idx ON erp.ordenes_compra (proveedor_id);
CREATE INDEX IF NOT EXISTS erp_oc_estado_id_idx    ON erp.ordenes_compra (estado_id);
CREATE INDEX IF NOT EXISTS erp_oc_deleted_idx      ON erp.ordenes_compra (empresa_id) WHERE deleted_at IS NULL;
ALTER TABLE erp.ordenes_compra ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER erp_oc_updated_at BEFORE UPDATE ON erp.ordenes_compra FOR EACH ROW EXECUTE FUNCTION erp.fn_set_updated_at();

-- ── erp.ordenes_compra_detalle ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS erp.ordenes_compra_detalle (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id      UUID NOT NULL REFERENCES core.empresas(id),
  orden_compra_id UUID NOT NULL REFERENCES erp.ordenes_compra(id) ON DELETE CASCADE,
  producto_id     UUID REFERENCES erp.productos(id),
  descripcion     TEXT,
  unidad          TEXT,
  cantidad        NUMERIC(14,4) NOT NULL DEFAULT 1,
  precio_unitario NUMERIC(14,2),
  descuento       NUMERIC(14,2) DEFAULT 0,
  subtotal        NUMERIC(14,2),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
COMMENT ON TABLE erp.ordenes_compra_detalle IS 'Líneas de una orden de compra.';

CREATE INDEX IF NOT EXISTS erp_oc_det_empresa_id_idx ON erp.ordenes_compra_detalle (empresa_id);
CREATE INDEX IF NOT EXISTS erp_oc_det_oc_id_idx      ON erp.ordenes_compra_detalle (orden_compra_id);
ALTER TABLE erp.ordenes_compra_detalle ENABLE ROW LEVEL SECURITY;

-- ── erp.recepciones ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS erp.recepciones (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id      UUID NOT NULL REFERENCES core.empresas(id),
  orden_compra_id UUID REFERENCES erp.ordenes_compra(id),
  recibe_id       UUID REFERENCES erp.empleados(id),
  codigo          TEXT,
  estado_id       UUID REFERENCES shared.estados(id),
  fecha_recepcion DATE NOT NULL DEFAULT CURRENT_DATE,
  notas           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ
);
COMMENT ON TABLE erp.recepciones IS 'Registro de recepción física de mercancía contra OC.';

CREATE INDEX IF NOT EXISTS erp_rec_empresa_id_idx ON erp.recepciones (empresa_id);
CREATE INDEX IF NOT EXISTS erp_rec_oc_id_idx      ON erp.recepciones (orden_compra_id);
ALTER TABLE erp.recepciones ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER erp_recepciones_updated_at BEFORE UPDATE ON erp.recepciones FOR EACH ROW EXECUTE FUNCTION erp.fn_set_updated_at();

-- ── erp.recepciones_detalle ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS erp.recepciones_detalle (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id         UUID NOT NULL REFERENCES core.empresas(id),
  recepcion_id       UUID NOT NULL REFERENCES erp.recepciones(id) ON DELETE CASCADE,
  oc_detalle_id      UUID REFERENCES erp.ordenes_compra_detalle(id),
  producto_id        UUID REFERENCES erp.productos(id),
  cantidad_esperada  NUMERIC(14,4),
  cantidad_recibida  NUMERIC(14,4) NOT NULL DEFAULT 0,
  cantidad_rechazada NUMERIC(14,4) NOT NULL DEFAULT 0,
  notas              TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);
COMMENT ON TABLE erp.recepciones_detalle IS 'Cantidades recibidas vs esperadas por línea de OC.';

CREATE INDEX IF NOT EXISTS erp_rec_det_empresa_id_idx   ON erp.recepciones_detalle (empresa_id);
CREATE INDEX IF NOT EXISTS erp_rec_det_recepcion_id_idx ON erp.recepciones_detalle (recepcion_id);
ALTER TABLE erp.recepciones_detalle ENABLE ROW LEVEL SECURITY;

-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║  ACTIVOS FIJOS                                                           ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

-- ── erp.activos ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS erp.activos (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id        UUID NOT NULL REFERENCES core.empresas(id),
  codigo            TEXT,
  nombre            TEXT NOT NULL,
  descripcion       TEXT,
  clasificacion     TEXT,
  tipo              TEXT,
  marca             TEXT,
  modelo            TEXT,
  numero_serie      TEXT,
  fecha_adquisicion DATE,
  costo_adquisicion NUMERIC(14,2),
  valor_actual      NUMERIC(14,2),
  vida_util_anios   INTEGER,
  ubicacion         TEXT,
  responsable_id    UUID REFERENCES erp.empleados(id),
  estado_id         UUID REFERENCES shared.estados(id),
  metadata          JSONB,
  activo            BOOLEAN NOT NULL DEFAULT true,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ,
  deleted_at        TIMESTAMPTZ
);
COMMENT ON TABLE  erp.activos          IS 'Registro de activos fijos por empresa.';
COMMENT ON COLUMN erp.activos.metadata IS 'Campos extra: placa, modelo motor, póliza de seguro, etc.';

CREATE INDEX IF NOT EXISTS erp_activos_empresa_id_idx ON erp.activos (empresa_id);
CREATE INDEX IF NOT EXISTS erp_activos_codigo_idx     ON erp.activos (empresa_id, codigo) WHERE codigo IS NOT NULL;
CREATE INDEX IF NOT EXISTS erp_activos_tipo_idx       ON erp.activos (empresa_id, tipo);
CREATE INDEX IF NOT EXISTS erp_activos_deleted_idx    ON erp.activos (empresa_id) WHERE deleted_at IS NULL;
ALTER TABLE erp.activos ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER erp_activos_updated_at BEFORE UPDATE ON erp.activos FOR EACH ROW EXECUTE FUNCTION erp.fn_set_updated_at();

-- ── erp.activos_mantenimiento ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS erp.activos_mantenimiento (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id  UUID NOT NULL REFERENCES core.empresas(id),
  activo_id   UUID NOT NULL REFERENCES erp.activos(id),
  tipo        TEXT CHECK (tipo IN ('preventivo','correctivo','revision')),
  descripcion TEXT,
  fecha       DATE NOT NULL DEFAULT CURRENT_DATE,
  costo       NUMERIC(14,2),
  proveedor_id UUID REFERENCES erp.proveedores(id),
  notas       TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ
);
COMMENT ON TABLE erp.activos_mantenimiento IS 'Historial de mantenimientos preventivos y correctivos de activos.';

CREATE INDEX IF NOT EXISTS erp_activos_mant_empresa_id_idx ON erp.activos_mantenimiento (empresa_id);
CREATE INDEX IF NOT EXISTS erp_activos_mant_activo_id_idx  ON erp.activos_mantenimiento (activo_id);
CREATE INDEX IF NOT EXISTS erp_activos_mant_tipo_idx       ON erp.activos_mantenimiento (empresa_id, tipo);
ALTER TABLE erp.activos_mantenimiento ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER erp_activos_mant_updated_at BEFORE UPDATE ON erp.activos_mantenimiento FOR EACH ROW EXECUTE FUNCTION erp.fn_set_updated_at();


-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║  GESTIÓN / AGENDA                                                        ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

-- ── erp.tasks ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS erp.tasks (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id    UUID NOT NULL REFERENCES core.empresas(id),
  titulo        TEXT NOT NULL,
  descripcion   TEXT,
  asignado_a    UUID REFERENCES erp.empleados(id),
  creado_por    UUID REFERENCES core.usuarios(id),
  prioridad_id  UUID REFERENCES shared.prioridades(id),
  estado        TEXT NOT NULL DEFAULT 'pendiente'
                CHECK (estado IN ('pendiente','en_progreso','bloqueado','completado','cancelado')),
  fecha_vence   DATE,
  entidad_tipo  TEXT,
  entidad_id    UUID,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ
);
COMMENT ON TABLE  erp.tasks            IS 'Tareas operativas por empresa.';
COMMENT ON COLUMN erp.tasks.entidad_tipo IS 'Objeto relacionado: requisicion, activo, venta_inmobiliaria, etc.';

CREATE INDEX IF NOT EXISTS erp_tasks_empresa_id_idx  ON erp.tasks (empresa_id);
CREATE INDEX IF NOT EXISTS erp_tasks_asignado_a_idx  ON erp.tasks (empresa_id, asignado_a);
CREATE INDEX IF NOT EXISTS erp_tasks_estado_idx      ON erp.tasks (empresa_id, estado);
CREATE INDEX IF NOT EXISTS erp_tasks_fecha_vence_idx ON erp.tasks (empresa_id, fecha_vence);
ALTER TABLE erp.tasks ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER erp_tasks_updated_at BEFORE UPDATE ON erp.tasks FOR EACH ROW EXECUTE FUNCTION erp.fn_set_updated_at();

-- ── erp.task_comentarios ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS erp.task_comentarios (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id UUID NOT NULL REFERENCES core.empresas(id),
  task_id    UUID NOT NULL REFERENCES erp.tasks(id) ON DELETE CASCADE,
  autor_id   UUID REFERENCES core.usuarios(id),
  contenido  TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
COMMENT ON TABLE erp.task_comentarios IS 'Comentarios e historial de una tarea.';

CREATE INDEX IF NOT EXISTS erp_task_com_empresa_id_idx ON erp.task_comentarios (empresa_id);
CREATE INDEX IF NOT EXISTS erp_task_com_task_id_idx    ON erp.task_comentarios (task_id);
ALTER TABLE erp.task_comentarios ENABLE ROW LEVEL SECURITY;

-- ── erp.citas ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS erp.citas (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id       UUID NOT NULL REFERENCES core.empresas(id),
  tipo             TEXT NOT NULL CHECK (tipo IN ('servicio','ventas','visita')),
  persona_id       UUID REFERENCES erp.personas(id),
  cliente_id       UUID REFERENCES erp.clientes(id),
  responsable_id   UUID REFERENCES erp.empleados(id),
  fecha_hora       TIMESTAMPTZ NOT NULL,
  duracion_minutos INTEGER DEFAULT 60,
  lugar            TEXT,
  estado           TEXT NOT NULL DEFAULT 'programada'
                   CHECK (estado IN ('programada','confirmada','cancelada','completada','no_asistio')),
  notas            TEXT,
  creado_por       UUID REFERENCES core.usuarios(id),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ
);
COMMENT ON TABLE  erp.citas      IS 'Citas con clientes: servicio ANSA, visitas DILESA, ventas. Vinculada a persona o cliente.';
COMMENT ON COLUMN erp.citas.tipo IS 'servicio = ANSA taller; ventas = ventas presenciales; visita = DILESA/RDB.';

CREATE INDEX IF NOT EXISTS erp_citas_empresa_id_idx   ON erp.citas (empresa_id);
CREATE INDEX IF NOT EXISTS erp_citas_tipo_idx         ON erp.citas (empresa_id, tipo);
CREATE INDEX IF NOT EXISTS erp_citas_fecha_hora_idx   ON erp.citas (empresa_id, fecha_hora);
CREATE INDEX IF NOT EXISTS erp_citas_estado_idx       ON erp.citas (empresa_id, estado);
CREATE INDEX IF NOT EXISTS erp_citas_persona_id_idx   ON erp.citas (persona_id);
ALTER TABLE erp.citas ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER erp_citas_updated_at BEFORE UPDATE ON erp.citas FOR EACH ROW EXECUTE FUNCTION erp.fn_set_updated_at();

-- ── erp.juntas ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS erp.juntas (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id       UUID NOT NULL REFERENCES core.empresas(id),
  titulo           TEXT NOT NULL,
  descripcion      TEXT,
  fecha_hora       TIMESTAMPTZ NOT NULL,
  duracion_minutos INTEGER DEFAULT 60,
  lugar            TEXT,
  estado           TEXT NOT NULL DEFAULT 'programada'
                   CHECK (estado IN ('programada','en_curso','completada','cancelada')),
  tipo             TEXT CHECK (tipo IN ('operativa','directiva','seguimiento','emergencia')),
  creado_por       UUID REFERENCES core.usuarios(id),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ
);
COMMENT ON TABLE erp.juntas IS 'Juntas operativas internas. Tiene hijos: juntas_asistencia y juntas_notas.';

CREATE INDEX IF NOT EXISTS erp_juntas_empresa_id_idx ON erp.juntas (empresa_id);
CREATE INDEX IF NOT EXISTS erp_juntas_fecha_hora_idx ON erp.juntas (empresa_id, fecha_hora);
CREATE INDEX IF NOT EXISTS erp_juntas_estado_idx     ON erp.juntas (empresa_id, estado);
ALTER TABLE erp.juntas ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER erp_juntas_updated_at BEFORE UPDATE ON erp.juntas FOR EACH ROW EXECUTE FUNCTION erp.fn_set_updated_at();

-- ── erp.juntas_asistencia ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS erp.juntas_asistencia (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id  UUID NOT NULL REFERENCES core.empresas(id),
  junta_id    UUID NOT NULL REFERENCES erp.juntas(id) ON DELETE CASCADE,
  persona_id  UUID REFERENCES erp.personas(id),
  asistio     BOOLEAN DEFAULT NULL,
  notas       TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (junta_id, persona_id)
);
COMMENT ON TABLE  erp.juntas_asistencia        IS 'Registro de asistencia a juntas.';
COMMENT ON COLUMN erp.juntas_asistencia.asistio IS 'NULL = sin confirmar, TRUE = asistió, FALSE = no asistió.';

CREATE INDEX IF NOT EXISTS erp_juntas_asist_empresa_id_idx ON erp.juntas_asistencia (empresa_id);
CREATE INDEX IF NOT EXISTS erp_juntas_asist_junta_id_idx   ON erp.juntas_asistencia (junta_id);
ALTER TABLE erp.juntas_asistencia ENABLE ROW LEVEL SECURITY;

-- ── erp.juntas_notas ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS erp.juntas_notas (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id UUID NOT NULL REFERENCES core.empresas(id),
  junta_id   UUID NOT NULL REFERENCES erp.juntas(id) ON DELETE CASCADE,
  orden      INTEGER NOT NULL DEFAULT 1,
  contenido  TEXT NOT NULL,
  creado_por UUID REFERENCES core.usuarios(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
COMMENT ON TABLE  erp.juntas_notas      IS 'Notas/minutas de una junta, ordenadas por orden.';
COMMENT ON COLUMN erp.juntas_notas.orden IS 'Orden de aparición dentro de la minuta.';

CREATE INDEX IF NOT EXISTS erp_juntas_notas_empresa_id_idx ON erp.juntas_notas (empresa_id);
CREATE INDEX IF NOT EXISTS erp_juntas_notas_junta_id_idx   ON erp.juntas_notas (junta_id, orden);
ALTER TABLE erp.juntas_notas ENABLE ROW LEVEL SECURITY;

-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║  ADJUNTOS & APROBACIONES                                                 ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

-- ── erp.adjuntos ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS erp.adjuntos (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id    UUID NOT NULL REFERENCES core.empresas(id),
  entidad_tipo  TEXT NOT NULL,
  entidad_id    UUID NOT NULL,
  uploaded_by   UUID REFERENCES core.usuarios(id),
  nombre        TEXT NOT NULL,
  url           TEXT NOT NULL,
  tipo_mime     TEXT,
  tamano_bytes  BIGINT,
  metadata      JSONB,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
COMMENT ON TABLE  erp.adjuntos             IS 'Archivos adjuntos polimórficos por empresa.';
COMMENT ON COLUMN erp.adjuntos.entidad_tipo IS 'Tabla origen: "requisicion", "orden_compra", "activo", "contrato", etc.';
COMMENT ON COLUMN erp.adjuntos.entidad_id   IS 'UUID del registro al que pertenece el adjunto.';

CREATE INDEX IF NOT EXISTS erp_adjuntos_empresa_id_idx ON erp.adjuntos (empresa_id);
CREATE INDEX IF NOT EXISTS erp_adjuntos_entidad_idx    ON erp.adjuntos (empresa_id, entidad_tipo, entidad_id);
ALTER TABLE erp.adjuntos ENABLE ROW LEVEL SECURITY;

-- ── erp.aprobaciones ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS erp.aprobaciones (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id   UUID NOT NULL REFERENCES core.empresas(id),
  entidad_tipo TEXT NOT NULL,
  entidad_id   UUID NOT NULL,
  paso         INTEGER NOT NULL DEFAULT 1,
  aprobador_id UUID REFERENCES core.usuarios(id),
  estado       TEXT NOT NULL DEFAULT 'pendiente'
               CHECK (estado IN ('pendiente','aprobado','rechazado','cancelado')),
  comentario   TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
COMMENT ON TABLE  erp.aprobaciones             IS 'Flujo de aprobaciones multi-paso por entidad y empresa.';
COMMENT ON COLUMN erp.aprobaciones.entidad_tipo IS 'Tabla origen: "requisicion", "orden_compra", etc.';
COMMENT ON COLUMN erp.aprobaciones.paso         IS 'Número de paso en el flujo (1 = primer aprobador).';

CREATE INDEX IF NOT EXISTS erp_aprobaciones_empresa_id_idx ON erp.aprobaciones (empresa_id);
CREATE INDEX IF NOT EXISTS erp_aprobaciones_entidad_idx    ON erp.aprobaciones (empresa_id, entidad_tipo, entidad_id);
CREATE INDEX IF NOT EXISTS erp_aprobaciones_estado_idx     ON erp.aprobaciones (empresa_id, estado);
ALTER TABLE erp.aprobaciones ENABLE ROW LEVEL SECURITY;


-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║  FINANZAS                                                                ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

-- ── erp.cuentas_bancarias ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS erp.cuentas_bancarias (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id    UUID NOT NULL REFERENCES core.empresas(id),
  nombre        TEXT NOT NULL,
  tipo          TEXT CHECK (tipo IN ('cheques','ahorro','inversion','credito')),
  moneda_id     UUID REFERENCES shared.monedas(id),
  numero_cuenta TEXT,
  clabe         TEXT,
  banco         TEXT,
  saldo_actual  NUMERIC(14,2) DEFAULT 0,
  activo        BOOLEAN NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ
);
COMMENT ON TABLE erp.cuentas_bancarias IS 'Cuentas bancarias por empresa.';

CREATE INDEX IF NOT EXISTS erp_cuentas_empresa_id_idx ON erp.cuentas_bancarias (empresa_id);
CREATE INDEX IF NOT EXISTS erp_cuentas_tipo_idx       ON erp.cuentas_bancarias (empresa_id, tipo);
ALTER TABLE erp.cuentas_bancarias ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER erp_cuentas_updated_at BEFORE UPDATE ON erp.cuentas_bancarias FOR EACH ROW EXECUTE FUNCTION erp.fn_set_updated_at();

-- ── erp.gastos ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS erp.gastos (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id   UUID NOT NULL REFERENCES core.empresas(id),
  categoria_id UUID REFERENCES shared.categorias(id),
  descripcion  TEXT NOT NULL,
  monto        NUMERIC(14,2) NOT NULL,
  moneda_id    UUID REFERENCES shared.monedas(id),
  fecha        DATE NOT NULL DEFAULT CURRENT_DATE,
  metodo_pago  TEXT CHECK (metodo_pago IN ('efectivo','transferencia','tarjeta','cheque')),
  referencia   TEXT,
  creado_por   UUID REFERENCES core.usuarios(id),
  registrado   BOOLEAN NOT NULL DEFAULT false,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ
);
COMMENT ON TABLE erp.gastos IS 'Registro de gastos operativos por empresa.';

CREATE INDEX IF NOT EXISTS erp_gastos_empresa_id_idx   ON erp.gastos (empresa_id);
CREATE INDEX IF NOT EXISTS erp_gastos_categoria_id_idx ON erp.gastos (categoria_id);
CREATE INDEX IF NOT EXISTS erp_gastos_fecha_idx        ON erp.gastos (empresa_id, fecha DESC);
ALTER TABLE erp.gastos ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER erp_gastos_updated_at BEFORE UPDATE ON erp.gastos FOR EACH ROW EXECUTE FUNCTION erp.fn_set_updated_at();

-- ── erp.movimientos_bancarios ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS erp.movimientos_bancarios (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id   UUID NOT NULL REFERENCES core.empresas(id),
  cuenta_id    UUID NOT NULL REFERENCES erp.cuentas_bancarias(id),
  tipo         TEXT NOT NULL CHECK (tipo IN ('cargo','abono')),
  monto        NUMERIC(14,2) NOT NULL,
  moneda_id    UUID REFERENCES shared.monedas(id),
  fecha        DATE NOT NULL DEFAULT CURRENT_DATE,
  descripcion  TEXT,
  referencia   TEXT,
  categoria_id UUID REFERENCES shared.categorias(id),
  conciliado   BOOLEAN NOT NULL DEFAULT false,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ
);
COMMENT ON TABLE erp.movimientos_bancarios IS 'Movimientos bancarios (cargos y abonos) por cuenta y empresa.';

CREATE INDEX IF NOT EXISTS erp_mov_ban_empresa_id_idx ON erp.movimientos_bancarios (empresa_id);
CREATE INDEX IF NOT EXISTS erp_mov_ban_cuenta_id_idx  ON erp.movimientos_bancarios (cuenta_id);
CREATE INDEX IF NOT EXISTS erp_mov_ban_fecha_idx      ON erp.movimientos_bancarios (empresa_id, fecha DESC);
CREATE INDEX IF NOT EXISTS erp_mov_ban_conciliado_idx ON erp.movimientos_bancarios (empresa_id, conciliado);
ALTER TABLE erp.movimientos_bancarios ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER erp_mov_ban_updated_at BEFORE UPDATE ON erp.movimientos_bancarios FOR EACH ROW EXECUTE FUNCTION erp.fn_set_updated_at();

-- ── erp.conciliaciones ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS erp.conciliaciones (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id            UUID NOT NULL REFERENCES core.empresas(id),
  movimiento_bancario_id UUID NOT NULL REFERENCES erp.movimientos_bancarios(id),
  gasto_id              UUID REFERENCES erp.gastos(id),
  monto_aplicado        NUMERIC(14,2) NOT NULL,
  creado_por            UUID REFERENCES core.usuarios(id),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);
COMMENT ON TABLE erp.conciliaciones IS 'Conciliación entre movimientos bancarios y gastos.';

CREATE INDEX IF NOT EXISTS erp_concil_empresa_id_idx ON erp.conciliaciones (empresa_id);
CREATE INDEX IF NOT EXISTS erp_concil_mov_id_idx     ON erp.conciliaciones (movimiento_bancario_id);
CREATE INDEX IF NOT EXISTS erp_concil_gasto_id_idx   ON erp.conciliaciones (gasto_id);
ALTER TABLE erp.conciliaciones ENABLE ROW LEVEL SECURITY;

-- ── erp.facturas ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS erp.facturas (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id      UUID NOT NULL REFERENCES core.empresas(id),
  uuid_sat        TEXT,
  flujo           TEXT NOT NULL CHECK (flujo IN ('ingreso','egreso')),
  tipo_ingreso_id UUID REFERENCES shared.categorias(id),
  persona_id      UUID REFERENCES erp.personas(id),
  emisor_rfc      TEXT,
  emisor_nombre   TEXT,
  receptor_rfc    TEXT,
  subtotal        NUMERIC(14,2),
  iva             NUMERIC(14,2),
  total           NUMERIC(14,2),
  fecha_emision   DATE NOT NULL,
  fecha_vencimiento DATE,
  xml_url         TEXT,
  pdf_url         TEXT,
  estado_id       UUID REFERENCES shared.estados(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ
);
COMMENT ON TABLE erp.facturas IS 'Facturas SAT (ingreso y egreso) por empresa.';

CREATE INDEX IF NOT EXISTS erp_facturas_empresa_id_idx ON erp.facturas (empresa_id);
CREATE INDEX IF NOT EXISTS erp_facturas_flujo_idx      ON erp.facturas (empresa_id, flujo);
CREATE INDEX IF NOT EXISTS erp_facturas_uuid_sat_idx   ON erp.facturas (uuid_sat) WHERE uuid_sat IS NOT NULL;
CREATE INDEX IF NOT EXISTS erp_facturas_fecha_idx      ON erp.facturas (empresa_id, fecha_emision DESC);
ALTER TABLE erp.facturas ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER erp_facturas_updated_at BEFORE UPDATE ON erp.facturas FOR EACH ROW EXECUTE FUNCTION erp.fn_set_updated_at();

-- ── erp.pagos_provisionales ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS erp.pagos_provisionales (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id       UUID NOT NULL REFERENCES core.empresas(id),
  anio_fiscal      INTEGER NOT NULL,
  mes              INTEGER NOT NULL CHECK (mes BETWEEN 1 AND 12),
  base_gravable    NUMERIC(14,2),
  isr_calculado    NUMERIC(14,2),
  pago             NUMERIC(14,2),
  fecha_pago       DATE,
  comprobante_url  TEXT,
  estado           TEXT NOT NULL DEFAULT 'pendiente'
                   CHECK (estado IN ('pendiente','pagado','omitido')),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ,
  UNIQUE (empresa_id, anio_fiscal, mes)
);
COMMENT ON TABLE erp.pagos_provisionales IS 'Control de pagos provisionales ISR por empresa.';

CREATE INDEX IF NOT EXISTS erp_pagos_prov_empresa_id_idx ON erp.pagos_provisionales (empresa_id);
CREATE INDEX IF NOT EXISTS erp_pagos_prov_anio_mes_idx   ON erp.pagos_provisionales (empresa_id, anio_fiscal, mes);
ALTER TABLE erp.pagos_provisionales ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER erp_pagos_prov_updated_at BEFORE UPDATE ON erp.pagos_provisionales FOR EACH ROW EXECUTE FUNCTION erp.fn_set_updated_at();

-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║  RDB / POS                                                               ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

-- ── erp.turnos ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS erp.turnos (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id  UUID NOT NULL REFERENCES core.empresas(id),
  nombre      TEXT NOT NULL,
  hora_inicio TIME,
  hora_fin    TIME,
  activo      BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
COMMENT ON TABLE erp.turnos IS 'Catálogo de turnos por empresa (mañana, tarde, noche, etc).';

CREATE INDEX IF NOT EXISTS erp_turnos_empresa_id_idx ON erp.turnos (empresa_id);
ALTER TABLE erp.turnos ENABLE ROW LEVEL SECURITY;

-- ── erp.cortes_caja ───────────────────────────────────────────────────────────
-- Estructura análoga a rdb.cortes pero en erp y con referencias tipadas.
CREATE TABLE IF NOT EXISTS erp.cortes_caja (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id           UUID NOT NULL REFERENCES core.empresas(id),
  turno_id             UUID REFERENCES erp.turnos(id),
  cajero_id            UUID REFERENCES erp.empleados(id),
  caja_nombre          TEXT,
  corte_nombre         TEXT,
  tipo                 TEXT NOT NULL DEFAULT 'normal'
                       CHECK (tipo IN ('normal','parcial','especial')),
  estado               TEXT NOT NULL DEFAULT 'abierto'
                       CHECK (estado IN ('abierto','cerrado','validado','cancelado')),
  efectivo_inicial     NUMERIC(12,2) DEFAULT 0,
  efectivo_contado     NUMERIC(12,2),
  total_ventas         NUMERIC(12,2) DEFAULT 0,
  total_efectivo       NUMERIC(12,2) DEFAULT 0,
  total_tarjeta        NUMERIC(12,2) DEFAULT 0,
  total_transferencia  NUMERIC(12,2) DEFAULT 0,
  diferencia           NUMERIC(12,2),
  observaciones        TEXT,
  fecha_operativa      DATE DEFAULT CURRENT_DATE,
  abierto_at           TIMESTAMPTZ DEFAULT now(),
  cerrado_at           TIMESTAMPTZ,
  validado_at          TIMESTAMPTZ,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ
);
COMMENT ON TABLE  erp.cortes_caja           IS 'Cortes de caja por empresa con referencias a turno y cajero.';
COMMENT ON COLUMN erp.cortes_caja.cajero_id IS 'Empleado responsable del corte (FK a erp.empleados).';
COMMENT ON COLUMN erp.cortes_caja.turno_id  IS 'Turno al que pertenece el corte (FK a erp.turnos).';

CREATE INDEX IF NOT EXISTS erp_cortes_empresa_id_idx    ON erp.cortes_caja (empresa_id);
CREATE INDEX IF NOT EXISTS erp_cortes_turno_id_idx      ON erp.cortes_caja (turno_id);
CREATE INDEX IF NOT EXISTS erp_cortes_cajero_id_idx     ON erp.cortes_caja (cajero_id);
CREATE INDEX IF NOT EXISTS erp_cortes_estado_idx        ON erp.cortes_caja (empresa_id, estado);
CREATE INDEX IF NOT EXISTS erp_cortes_fecha_operativa_idx ON erp.cortes_caja (empresa_id, fecha_operativa DESC);
ALTER TABLE erp.cortes_caja ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER erp_cortes_updated_at BEFORE UPDATE ON erp.cortes_caja FOR EACH ROW EXECUTE FUNCTION erp.fn_set_updated_at();

-- ── erp.corte_conteo_denominaciones ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS erp.corte_conteo_denominaciones (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id   UUID NOT NULL REFERENCES core.empresas(id),
  corte_id     UUID NOT NULL REFERENCES erp.cortes_caja(id) ON DELETE CASCADE,
  denominacion NUMERIC(10,2) NOT NULL,
  tipo         TEXT NOT NULL CHECK (tipo IN ('billete','moneda')),
  cantidad     INTEGER NOT NULL DEFAULT 0 CHECK (cantidad >= 0),
  subtotal     NUMERIC(12,2) GENERATED ALWAYS AS (denominacion * cantidad) STORED,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (corte_id, denominacion)
);
COMMENT ON TABLE erp.corte_conteo_denominaciones IS 'Conteo físico de billetes y monedas al cierre de caja.';

CREATE INDEX IF NOT EXISTS erp_conteo_empresa_id_idx ON erp.corte_conteo_denominaciones (empresa_id);
CREATE INDEX IF NOT EXISTS erp_conteo_corte_id_idx   ON erp.corte_conteo_denominaciones (corte_id);
ALTER TABLE erp.corte_conteo_denominaciones ENABLE ROW LEVEL SECURITY;

-- ── erp.movimientos_caja ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS erp.movimientos_caja (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id   UUID NOT NULL REFERENCES core.empresas(id),
  corte_id     UUID REFERENCES erp.cortes_caja(id),
  tipo         TEXT NOT NULL CHECK (tipo IN ('entrada','salida','fondo','devolucion')),
  monto        NUMERIC(12,2) NOT NULL,
  concepto     TEXT,
  referencia   TEXT,
  realizado_por UUID REFERENCES erp.empleados(id),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
COMMENT ON TABLE erp.movimientos_caja IS 'Entradas y salidas manuales de caja no ligadas a ventas.';

CREATE INDEX IF NOT EXISTS erp_mov_caja_empresa_id_idx ON erp.movimientos_caja (empresa_id);
CREATE INDEX IF NOT EXISTS erp_mov_caja_corte_id_idx   ON erp.movimientos_caja (corte_id);
CREATE INDEX IF NOT EXISTS erp_mov_caja_tipo_idx       ON erp.movimientos_caja (empresa_id, tipo);
ALTER TABLE erp.movimientos_caja ENABLE ROW LEVEL SECURITY;

-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║  DILESA / INMOBILIARIO                                                   ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

-- ── erp.proyectos ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS erp.proyectos (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id   UUID NOT NULL REFERENCES core.empresas(id),
  codigo       TEXT,
  nombre       TEXT NOT NULL,
  descripcion  TEXT,
  tipo         TEXT CHECK (tipo IN ('residencial','comercial','industrial','mixto')),
  ubicacion    TEXT,
  estado_id    UUID REFERENCES shared.estados(id),
  presupuesto  NUMERIC(16,2),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ
);
COMMENT ON TABLE erp.proyectos IS 'Proyectos inmobiliarios de DILESA.';

CREATE INDEX IF NOT EXISTS erp_proyectos_empresa_id_idx ON erp.proyectos (empresa_id);
CREATE INDEX IF NOT EXISTS erp_proyectos_codigo_idx     ON erp.proyectos (empresa_id, codigo) WHERE codigo IS NOT NULL;
CREATE INDEX IF NOT EXISTS erp_proyectos_tipo_idx       ON erp.proyectos (empresa_id, tipo);
ALTER TABLE erp.proyectos ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER erp_proyectos_updated_at BEFORE UPDATE ON erp.proyectos FOR EACH ROW EXECUTE FUNCTION erp.fn_set_updated_at();

-- ── erp.lotes ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS erp.lotes (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id      UUID NOT NULL REFERENCES core.empresas(id),
  proyecto_id     UUID NOT NULL REFERENCES erp.proyectos(id),
  codigo          TEXT,
  manzana         TEXT,
  lote            TEXT,
  superficie_m2   NUMERIC(10,2),
  precio_lista    NUMERIC(14,2),
  precio_venta    NUMERIC(14,2),
  estado          TEXT NOT NULL DEFAULT 'disponible'
                  CHECK (estado IN ('disponible','apartado','vendido','no_disponible')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ
);
COMMENT ON TABLE erp.lotes IS 'Lotes dentro de un proyecto inmobiliario.';

CREATE INDEX IF NOT EXISTS erp_lotes_empresa_id_idx  ON erp.lotes (empresa_id);
CREATE INDEX IF NOT EXISTS erp_lotes_proyecto_id_idx ON erp.lotes (proyecto_id);
CREATE INDEX IF NOT EXISTS erp_lotes_estado_idx      ON erp.lotes (empresa_id, estado);
CREATE INDEX IF NOT EXISTS erp_lotes_codigo_idx      ON erp.lotes (empresa_id, codigo) WHERE codigo IS NOT NULL;
ALTER TABLE erp.lotes ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER erp_lotes_updated_at BEFORE UPDATE ON erp.lotes FOR EACH ROW EXECUTE FUNCTION erp.fn_set_updated_at();

-- ── erp.ventas_inmobiliarias ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS erp.ventas_inmobiliarias (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id   UUID NOT NULL REFERENCES core.empresas(id),
  cliente_id   UUID REFERENCES erp.clientes(id),
  lote_id      UUID NOT NULL REFERENCES erp.lotes(id),
  vendedor_id  UUID REFERENCES erp.empleados(id),
  codigo       TEXT,
  precio_venta NUMERIC(14,2) NOT NULL,
  enganche     NUMERIC(14,2) DEFAULT 0,
  plazo_meses  INTEGER DEFAULT 0,
  estado_id    UUID REFERENCES shared.estados(id),
  fecha_venta  DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ
);
COMMENT ON TABLE erp.ventas_inmobiliarias IS 'Ventas de lotes a clientes.';

CREATE INDEX IF NOT EXISTS erp_ventas_inm_empresa_id_idx ON erp.ventas_inmobiliarias (empresa_id);
CREATE INDEX IF NOT EXISTS erp_ventas_inm_lote_id_idx    ON erp.ventas_inmobiliarias (lote_id);
CREATE INDEX IF NOT EXISTS erp_ventas_inm_cliente_id_idx ON erp.ventas_inmobiliarias (cliente_id);
CREATE INDEX IF NOT EXISTS erp_ventas_inm_estado_id_idx  ON erp.ventas_inmobiliarias (estado_id);
ALTER TABLE erp.ventas_inmobiliarias ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER erp_ventas_inm_updated_at BEFORE UPDATE ON erp.ventas_inmobiliarias FOR EACH ROW EXECUTE FUNCTION erp.fn_set_updated_at();

-- ── erp.contratos ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS erp.contratos (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id       UUID NOT NULL REFERENCES core.empresas(id),
  venta_id         UUID REFERENCES erp.ventas_inmobiliarias(id),
  tipo             TEXT CHECK (tipo IN ('compraventa','promesa','arrendamiento','otro')),
  numero_contrato  TEXT,
  contenido_url    TEXT,
  fecha_firma      DATE,
  fecha_vencimiento DATE,
  estado_id        UUID REFERENCES shared.estados(id),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
COMMENT ON TABLE erp.contratos IS 'Contratos inmobiliarios ligados a una venta.';

CREATE INDEX IF NOT EXISTS erp_contratos_empresa_id_idx ON erp.contratos (empresa_id);
CREATE INDEX IF NOT EXISTS erp_contratos_venta_id_idx   ON erp.contratos (venta_id);
ALTER TABLE erp.contratos ENABLE ROW LEVEL SECURITY;

-- ── erp.cobranza ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS erp.cobranza (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id       UUID NOT NULL REFERENCES core.empresas(id),
  venta_id         UUID NOT NULL REFERENCES erp.ventas_inmobiliarias(id),
  cliente_id       UUID REFERENCES erp.clientes(id),
  numero_pago      INTEGER NOT NULL,
  monto            NUMERIC(14,2) NOT NULL,
  fecha_vencimiento DATE NOT NULL,
  fecha_pago       DATE,
  estado           TEXT NOT NULL DEFAULT 'pendiente'
                   CHECK (estado IN ('pendiente','pagado','vencido','parcial','condonado')),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ
);
COMMENT ON TABLE erp.cobranza IS 'Programa de pagos de una venta inmobiliaria.';

CREATE INDEX IF NOT EXISTS erp_cobranza_empresa_id_idx ON erp.cobranza (empresa_id);
CREATE INDEX IF NOT EXISTS erp_cobranza_venta_id_idx   ON erp.cobranza (venta_id);
CREATE INDEX IF NOT EXISTS erp_cobranza_estado_idx     ON erp.cobranza (empresa_id, estado);
CREATE INDEX IF NOT EXISTS erp_cobranza_vencimiento_idx ON erp.cobranza (empresa_id, fecha_vencimiento);
ALTER TABLE erp.cobranza ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER erp_cobranza_updated_at BEFORE UPDATE ON erp.cobranza FOR EACH ROW EXECUTE FUNCTION erp.fn_set_updated_at();

-- ── erp.pagos ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS erp.pagos (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id  UUID NOT NULL REFERENCES core.empresas(id),
  cobranza_id UUID NOT NULL REFERENCES erp.cobranza(id),
  monto       NUMERIC(14,2) NOT NULL,
  metodo      TEXT CHECK (metodo IN ('efectivo','transferencia','cheque','tarjeta')),
  referencia  TEXT,
  fecha_pago  DATE NOT NULL DEFAULT CURRENT_DATE,
  recibio_id  UUID REFERENCES erp.empleados(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
COMMENT ON TABLE erp.pagos IS 'Pagos registrados contra un cargo de cobranza.';

CREATE INDEX IF NOT EXISTS erp_pagos_empresa_id_idx  ON erp.pagos (empresa_id);
CREATE INDEX IF NOT EXISTS erp_pagos_cobranza_id_idx ON erp.pagos (cobranza_id);
ALTER TABLE erp.pagos ENABLE ROW LEVEL SECURITY;

-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║  ANSA / AUTOMOTRIZ                                                       ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

-- ── erp.vehiculos ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS erp.vehiculos (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id   UUID NOT NULL REFERENCES core.empresas(id),
  vin          TEXT,
  marca        TEXT NOT NULL,
  modelo       TEXT NOT NULL,
  anio         INTEGER,
  color        TEXT,
  precio_lista NUMERIC(14,2),
  estado       TEXT NOT NULL DEFAULT 'disponible'
               CHECK (estado IN ('disponible','apartado','vendido','demo','servicio')),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ
);
COMMENT ON TABLE erp.vehiculos IS 'Inventario de vehículos ANSA (Stellantis: Chrysler, Dodge, Jeep, Ram, Fiat, Peugeot).';

CREATE INDEX IF NOT EXISTS erp_vehiculos_empresa_id_idx ON erp.vehiculos (empresa_id);
CREATE INDEX IF NOT EXISTS erp_vehiculos_vin_idx        ON erp.vehiculos (vin) WHERE vin IS NOT NULL;
CREATE INDEX IF NOT EXISTS erp_vehiculos_estado_idx     ON erp.vehiculos (empresa_id, estado);
ALTER TABLE erp.vehiculos ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER erp_vehiculos_updated_at BEFORE UPDATE ON erp.vehiculos FOR EACH ROW EXECUTE FUNCTION erp.fn_set_updated_at();

-- ── erp.ventas_autos ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS erp.ventas_autos (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id   UUID NOT NULL REFERENCES core.empresas(id),
  vehiculo_id  UUID NOT NULL REFERENCES erp.vehiculos(id),
  cliente_id   UUID REFERENCES erp.clientes(id),
  vendedor_id  UUID REFERENCES erp.empleados(id),
  tipo         TEXT NOT NULL DEFAULT 'contado'
               CHECK (tipo IN ('contado','credito','arrendamiento','flotilla')),
  precio_venta NUMERIC(14,2) NOT NULL,
  comision     NUMERIC(14,2),
  estado_id    UUID REFERENCES shared.estados(id),
  fecha_venta  DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ
);
COMMENT ON TABLE erp.ventas_autos IS 'Ventas de vehículos de ANSA.';

CREATE INDEX IF NOT EXISTS erp_ventas_autos_empresa_id_idx  ON erp.ventas_autos (empresa_id);
CREATE INDEX IF NOT EXISTS erp_ventas_autos_vehiculo_id_idx ON erp.ventas_autos (vehiculo_id);
CREATE INDEX IF NOT EXISTS erp_ventas_autos_cliente_id_idx  ON erp.ventas_autos (cliente_id);
CREATE INDEX IF NOT EXISTS erp_ventas_autos_tipo_idx        ON erp.ventas_autos (empresa_id, tipo);
CREATE INDEX IF NOT EXISTS erp_ventas_autos_fecha_idx       ON erp.ventas_autos (empresa_id, fecha_venta DESC);
ALTER TABLE erp.ventas_autos ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER erp_ventas_autos_updated_at BEFORE UPDATE ON erp.ventas_autos FOR EACH ROW EXECUTE FUNCTION erp.fn_set_updated_at();

-- ── erp.ventas_tickets ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS erp.ventas_tickets (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id  UUID NOT NULL REFERENCES core.empresas(id),
  cliente_id  UUID REFERENCES erp.clientes(id),
  vendedor_id UUID REFERENCES erp.empleados(id),
  codigo      TEXT,
  total       NUMERIC(14,2) NOT NULL DEFAULT 0,
  estado_id   UUID REFERENCES shared.estados(id),
  fecha       DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ
);
COMMENT ON TABLE erp.ventas_tickets IS 'Tickets de venta de refacciones y servicios de mostrador.';

CREATE INDEX IF NOT EXISTS erp_ventas_tick_empresa_id_idx ON erp.ventas_tickets (empresa_id);
CREATE INDEX IF NOT EXISTS erp_ventas_tick_cliente_id_idx ON erp.ventas_tickets (cliente_id);
CREATE INDEX IF NOT EXISTS erp_ventas_tick_fecha_idx      ON erp.ventas_tickets (empresa_id, fecha DESC);
CREATE INDEX IF NOT EXISTS erp_ventas_tick_codigo_idx     ON erp.ventas_tickets (empresa_id, codigo) WHERE codigo IS NOT NULL;
ALTER TABLE erp.ventas_tickets ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER erp_ventas_tick_updated_at BEFORE UPDATE ON erp.ventas_tickets FOR EACH ROW EXECUTE FUNCTION erp.fn_set_updated_at();

-- ── erp.ventas_refacciones_detalle ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS erp.ventas_refacciones_detalle (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id      UUID NOT NULL REFERENCES core.empresas(id),
  ticket_id       UUID NOT NULL REFERENCES erp.ventas_tickets(id) ON DELETE CASCADE,
  producto_id     UUID REFERENCES erp.productos(id),
  descripcion     TEXT,
  cantidad        NUMERIC(14,4) NOT NULL DEFAULT 1,
  precio_unitario NUMERIC(14,2),
  descuento       NUMERIC(14,2) DEFAULT 0,
  total           NUMERIC(14,2),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
COMMENT ON TABLE erp.ventas_refacciones_detalle IS 'Líneas de detalle de un ticket de refacciones.';

CREATE INDEX IF NOT EXISTS erp_ref_det_empresa_id_idx ON erp.ventas_refacciones_detalle (empresa_id);
CREATE INDEX IF NOT EXISTS erp_ref_det_ticket_id_idx  ON erp.ventas_refacciones_detalle (ticket_id);
ALTER TABLE erp.ventas_refacciones_detalle ENABLE ROW LEVEL SECURITY;

-- ── erp.taller_servicio ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS erp.taller_servicio (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id     UUID NOT NULL REFERENCES core.empresas(id),
  vehiculo_id    UUID REFERENCES erp.vehiculos(id),
  cliente_id     UUID REFERENCES erp.clientes(id),
  tecnico_id     UUID REFERENCES erp.empleados(id),
  tipo           TEXT CHECK (tipo IN ('garantia','mantenimiento','correctivo','hojalata_pintura')),
  descripcion    TEXT,
  total          NUMERIC(14,2),
  estado_id      UUID REFERENCES shared.estados(id),
  fecha_entrada  DATE NOT NULL DEFAULT CURRENT_DATE,
  fecha_entrega  DATE,
  vin_externo    TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ
);
COMMENT ON TABLE  erp.taller_servicio           IS 'Órdenes de servicio del taller ANSA.';
COMMENT ON COLUMN erp.taller_servicio.vin_externo IS 'VIN del vehículo si no está en inventario propio.';

CREATE INDEX IF NOT EXISTS erp_taller_empresa_id_idx   ON erp.taller_servicio (empresa_id);
CREATE INDEX IF NOT EXISTS erp_taller_vehiculo_id_idx  ON erp.taller_servicio (vehiculo_id);
CREATE INDEX IF NOT EXISTS erp_taller_cliente_id_idx   ON erp.taller_servicio (cliente_id);
CREATE INDEX IF NOT EXISTS erp_taller_tipo_idx         ON erp.taller_servicio (empresa_id, tipo);
CREATE INDEX IF NOT EXISTS erp_taller_estado_id_idx    ON erp.taller_servicio (estado_id);
ALTER TABLE erp.taller_servicio ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER erp_taller_updated_at BEFORE UPDATE ON erp.taller_servicio FOR EACH ROW EXECUTE FUNCTION erp.fn_set_updated_at();

-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║  RLS POLICIES (empresa_id-scoped, generic pattern)                       ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
-- All erp.* tables use the same pattern:
--   authenticated users can only see rows for their assigned empresa_ids.
-- service_role bypasses RLS.
-- The policy relies on core.usuarios_empresas for membership.
--
-- Note: Replace with your actual RLS pattern once auth flows are finalized.
--       These are intentionally permissive (empresa membership) — add
--       column-level or role-level policies as needed per vertical.

DO $$
DECLARE
  tbl TEXT;
  tables TEXT[] := ARRAY[
    'departamentos','puestos','personas','empleados','empleados_compensacion',
    'proveedores','clientes','productos','productos_precios','almacenes',
    'inventario','movimientos_inventario',
    'requisiciones','requisiciones_detalle',
    'ordenes_compra','ordenes_compra_detalle',
    'recepciones','recepciones_detalle',
    'activos','activos_mantenimiento',
    'tasks','task_comentarios','citas','juntas','juntas_asistencia','juntas_notas',
    'adjuntos','aprobaciones',
    'cuentas_bancarias','gastos','movimientos_bancarios','conciliaciones',
    'facturas','pagos_provisionales',
    'turnos','cortes_caja','corte_conteo_denominaciones','movimientos_caja',
    'proyectos','lotes','ventas_inmobiliarias','contratos','cobranza','pagos',
    'vehiculos','ventas_autos','ventas_tickets','ventas_refacciones_detalle','taller_servicio'
  ];
  pol_name TEXT;
BEGIN
  FOREACH tbl IN ARRAY tables LOOP
    pol_name := 'erp_' || tbl || '_empresa_select';
    EXECUTE format(
      $pol$
        DROP POLICY IF EXISTS %I ON erp.%I;
        CREATE POLICY %I ON erp.%I
          FOR SELECT TO authenticated
          USING (
            empresa_id IN (
              SELECT ue.empresa_id
              FROM core.usuarios_empresas ue
              JOIN core.usuarios u ON u.id = ue.usuario_id
              WHERE lower(u.email) = lower(auth.email())
                AND ue.activo = true
            )
          );
      $pol$,
      pol_name, tbl,
      pol_name, tbl
    );

    pol_name := 'erp_' || tbl || '_empresa_insert';
    EXECUTE format(
      $pol$
        DROP POLICY IF EXISTS %I ON erp.%I;
        CREATE POLICY %I ON erp.%I
          FOR INSERT TO authenticated
          WITH CHECK (
            empresa_id IN (
              SELECT ue.empresa_id
              FROM core.usuarios_empresas ue
              JOIN core.usuarios u ON u.id = ue.usuario_id
              WHERE lower(u.email) = lower(auth.email())
                AND ue.activo = true
            )
          );
      $pol$,
      pol_name, tbl,
      pol_name, tbl
    );

    pol_name := 'erp_' || tbl || '_empresa_update';
    EXECUTE format(
      $pol$
        DROP POLICY IF EXISTS %I ON erp.%I;
        CREATE POLICY %I ON erp.%I
          FOR UPDATE TO authenticated
          USING (
            empresa_id IN (
              SELECT ue.empresa_id
              FROM core.usuarios_empresas ue
              JOIN core.usuarios u ON u.id = ue.usuario_id
              WHERE lower(u.email) = lower(auth.email())
                AND ue.activo = true
            )
          );
      $pol$,
      pol_name, tbl,
      pol_name, tbl
    );

  END LOOP;
END;
$$;


-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║  GRANTS                                                                  ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

GRANT USAGE ON SCHEMA erp TO authenticated, service_role;

-- service_role: full access (used by backend functions and triggers)
GRANT ALL ON ALL TABLES    IN SCHEMA erp TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA erp TO service_role;
GRANT ALL ON ALL ROUTINES  IN SCHEMA erp TO service_role;

-- authenticated: standard CRUD (RLS policies above enforce empresa scope)
GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA erp TO authenticated;

-- Tables where authenticated should NOT delete directly
-- (use soft-delete or service_role functions instead):
-- personas, empleados, productos, activos, proveedores, clientes
-- ordenes_compra, requisiciones — already have deleted_at columns.
-- Explicitly revoke DELETE for extra safety:
REVOKE DELETE ON
  erp.personas,
  erp.empleados,
  erp.productos,
  erp.activos,
  erp.proveedores,
  erp.clientes,
  erp.ordenes_compra,
  erp.requisiciones
FROM authenticated;


-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║  RELOAD PostgREST                                                        ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
NOTIFY pgrst, 'reload config';
NOTIFY pgrst, 'reload schema';
