-- ════════════════════════════════════════════════════════════════════════════
-- Sprint dilesa-4a — dilesa.inventario_vivienda
-- ════════════════════════════════════════════════════════════════════════════
--
-- Unidad comercializable: "materialización" del cruce lote + prototipo +
-- construcción, ya lista para entrar al pipeline de ventas. Un registro por
-- construcción activa (UNIQUE parcial sobre construccion_lote_id); histórico
-- vía soft-delete cuando se demuele/rehace una unidad.
--
-- La transición construccion_lote → inventario_vivienda NO se hace vía
-- trigger en este sprint. Se crea manualmente (endpoint app o batch
-- controlado) para que Dilesa valide que la vivienda está lista antes de
-- exponerla al equipo comercial.
--
-- lote_id, proyecto_id y prototipo_id se cachean como FKs directas (además de
-- obtenerse por inferencia desde construccion_lote) para habilitar búsquedas
-- rápidas por proyecto/prototipo/lote sin joins en caliente.
--
-- Sin datos — la migración Coda → BSOP va en dilesa-4b.

CREATE TABLE IF NOT EXISTS dilesa.inventario_vivienda (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id   uuid NOT NULL REFERENCES core.empresas(id) ON DELETE RESTRICT,

  -- Vínculos principales
  construccion_lote_id uuid NOT NULL REFERENCES dilesa.construccion_lote(id) ON DELETE RESTRICT,
  lote_id              uuid NOT NULL REFERENCES dilesa.lotes(id)              ON DELETE RESTRICT,
  proyecto_id          uuid NOT NULL REFERENCES dilesa.proyectos(id)          ON DELETE RESTRICT,
  prototipo_id         uuid NOT NULL REFERENCES dilesa.prototipos(id)         ON DELETE RESTRICT,

  -- Identidad comercial
  codigo_unidad        text,
  fase_inventario_id   uuid REFERENCES dilesa.fases_inventario(id) ON DELETE SET NULL,

  estado_comercial text NOT NULL DEFAULT 'disponible',

  -- Precios
  precio_lista        numeric(14,2),
  precio_promocional  numeric(14,2),
  promocion_id        uuid REFERENCES dilesa.promociones_ventas(id) ON DELETE SET NULL,

  -- Apartado (pre-venta formal)
  cliente_apartado_id         uuid REFERENCES erp.personas(id) ON DELETE SET NULL,
  fecha_apartado              date,
  monto_apartado              numeric(14,2),
  fecha_vencimiento_apartado  date,

  -- Fechas clave del ciclo comercial
  fecha_disponibilidad date,
  fecha_venta          date,
  fecha_escrituracion  date,
  fecha_entrega        date,

  observaciones text,

  -- Gestión estándar
  etapa                 text,
  decision_actual       text,
  prioridad             text,
  responsable_id        uuid REFERENCES erp.empleados(id) ON DELETE SET NULL,
  fecha_ultima_revision date,
  siguiente_accion      text,

  -- Técnicas
  coda_row_id text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  deleted_at  timestamptz,

  CONSTRAINT inventario_vivienda_prioridad_check
    CHECK (prioridad IS NULL OR prioridad IN ('alta','media','baja')),
  CONSTRAINT inventario_vivienda_estado_check
    CHECK (estado_comercial IN (
      'disponible','apartada','vendida','escriturada','entregada','postventa','cancelada'
    )),
  CONSTRAINT inventario_vivienda_precio_lista_nonneg_check
    CHECK (precio_lista IS NULL OR precio_lista >= 0),
  CONSTRAINT inventario_vivienda_precio_promocional_nonneg_check
    CHECK (precio_promocional IS NULL OR precio_promocional >= 0),
  CONSTRAINT inventario_vivienda_monto_apartado_nonneg_check
    CHECK (monto_apartado IS NULL OR monto_apartado >= 0),
  -- Coherencia de estado 'apartada' con campos de apartado
  CONSTRAINT inventario_vivienda_apartada_requiere_datos_check
    CHECK (
      estado_comercial <> 'apartada'
      OR (cliente_apartado_id IS NOT NULL AND fecha_apartado IS NOT NULL)
    ),
  -- Orden lógico de fechas: venta ≤ escrituración ≤ entrega
  CONSTRAINT inventario_vivienda_fecha_escr_ge_venta_check
    CHECK (fecha_escrituracion IS NULL
           OR fecha_venta IS NULL
           OR fecha_escrituracion >= fecha_venta),
  CONSTRAINT inventario_vivienda_fecha_entrega_ge_escr_check
    CHECK (fecha_entrega IS NULL
           OR fecha_escrituracion IS NULL
           OR fecha_entrega >= fecha_escrituracion),
  -- Código único por empresa cuando está presente
  CONSTRAINT inventario_vivienda_codigo_unidad_uk
    UNIQUE NULLS NOT DISTINCT (empresa_id, codigo_unidad)
);

-- UNIQUE parcial: una fila de inventario activa por construccion_lote.
-- El histórico (demoliciones/rework) convive via soft-delete.
CREATE UNIQUE INDEX IF NOT EXISTS dilesa_inventario_vivienda_construccion_activa_uk
  ON dilesa.inventario_vivienda(construccion_lote_id) WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS dilesa_inventario_vivienda_empresa_idx
  ON dilesa.inventario_vivienda(empresa_id) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS dilesa_inventario_vivienda_coda_row_idx
  ON dilesa.inventario_vivienda(empresa_id, coda_row_id) WHERE coda_row_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS dilesa_inventario_vivienda_lote_idx
  ON dilesa.inventario_vivienda(lote_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS dilesa_inventario_vivienda_proyecto_idx
  ON dilesa.inventario_vivienda(proyecto_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS dilesa_inventario_vivienda_prototipo_idx
  ON dilesa.inventario_vivienda(prototipo_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS dilesa_inventario_vivienda_fase_idx
  ON dilesa.inventario_vivienda(fase_inventario_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS dilesa_inventario_vivienda_estado_idx
  ON dilesa.inventario_vivienda(estado_comercial) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS dilesa_inventario_vivienda_cliente_apartado_idx
  ON dilesa.inventario_vivienda(cliente_apartado_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS dilesa_inventario_vivienda_promocion_idx
  ON dilesa.inventario_vivienda(promocion_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS dilesa_inventario_vivienda_responsable_idx
  ON dilesa.inventario_vivienda(responsable_id) WHERE deleted_at IS NULL;

ALTER TABLE dilesa.inventario_vivienda ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS inventario_vivienda_select ON dilesa.inventario_vivienda;
CREATE POLICY inventario_vivienda_select ON dilesa.inventario_vivienda
  FOR SELECT TO authenticated
  USING (
    deleted_at IS NULL AND (
      core.fn_has_empresa(empresa_id) OR core.fn_is_admin()
    )
  );

DROP POLICY IF EXISTS inventario_vivienda_write ON dilesa.inventario_vivienda;
CREATE POLICY inventario_vivienda_write ON dilesa.inventario_vivienda
  FOR ALL TO authenticated
  USING (core.fn_has_empresa(empresa_id) OR core.fn_is_admin())
  WITH CHECK (core.fn_has_empresa(empresa_id) OR core.fn_is_admin());

DROP TRIGGER IF EXISTS dilesa_inventario_vivienda_updated_at ON dilesa.inventario_vivienda;
CREATE TRIGGER dilesa_inventario_vivienda_updated_at
  BEFORE UPDATE ON dilesa.inventario_vivienda
  FOR EACH ROW EXECUTE FUNCTION core.fn_set_updated_at();

COMMENT ON TABLE dilesa.inventario_vivienda IS
  'Unidad comercializable (lote + prototipo + construcción materializados). UNIQUE parcial (construccion_lote_id WHERE deleted_at IS NULL): un inventario activo por construcción; histórico vía soft-delete. Transición desde construccion_lote es manual/endpoint — NO trigger automático. estado_comercial con workflow disponible→apartada→vendida→escriturada→entregada→postventa (+ cancelada). CHECKs de consistencia: estado=apartada requiere cliente+fecha_apartado; fechas en orden venta→escrituración→entrega.';
