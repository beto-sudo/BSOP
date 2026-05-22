-- ════════════════════════════════════════════════════════════════════════════
-- Iniciativa dilesa-portafolio-activos · Sprint 2 — Schema base v2
-- ════════════════════════════════════════════════════════════════════════════
--
-- Construye el schema `dilesa` v2: el modelo Portafolio de Activos ↔ Proyectos
-- que reemplaza el pipeline lineal v1 (demolido en Sprint 1, PR #482).
--
-- Diseño: supabase/adr/009_dilesa_portafolio_taxonomia.md (4 entidades raíz,
-- patrón master + satélite) y supabase/adr/010_dilesa_portafolio_jerarquia.md
-- (jerarquía padre/hijo, vínculo Proyecto↔Activo, prorrateo de CapEx).
--
-- El schema `dilesa` ya existe (recreado vacío en la migración de demolición).
-- Esta migración solo crea tablas dentro de él.
--
-- Convenciones (ADR-009 §Convenciones): RLS por empresa_id con
-- core.fn_has_empresa/fn_is_admin; created_at/updated_at con
-- core.fn_set_updated_at(); deleted_at soft-delete; discriminadores como
-- text + CHECK. Satélites llevan empresa_id denormalizado para RLS uniforme.

BEGIN;

-- ════════════════════════════════════════════════════════════════════════════
-- 1) dilesa.activos — el portafolio (master)
-- ════════════════════════════════════════════════════════════════════════════
CREATE TABLE dilesa.activos (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id    uuid NOT NULL REFERENCES core.empresas(id) ON DELETE RESTRICT,
  tipo          text NOT NULL,
  nombre        text NOT NULL,
  estado        text NOT NULL DEFAULT 'prospecto',
  activo_padre_id uuid REFERENCES dilesa.activos(id) ON DELETE SET NULL,
  clave_interna text,

  -- Ubicación
  municipio            text,
  estado_geo           text,
  direccion_referencia text,
  latitud              numeric(10, 7),
  longitud             numeric(10, 7),

  -- Físico / legal / fiscal
  area_m2          numeric(14, 2),
  situacion_legal  text,
  numero_escritura text,
  clave_catastral  text,

  -- Económico
  valor_estimado numeric(16, 2),

  notas      text,
  documentos jsonb NOT NULL DEFAULT '[]'::jsonb,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,

  CONSTRAINT activos_tipo_check CHECK (tipo IN (
    'terreno','espectacular','unipolar','casa','local','plaza',
    'edificio','nave','departamento','lote','infraestructura'
  )),
  CONSTRAINT activos_estado_check CHECK (estado IN (
    'prospecto','adquirido','operando','en_intervencion','desincorporado'
  )),
  CONSTRAINT activos_documentos_es_array CHECK (jsonb_typeof(documentos) = 'array'),
  CONSTRAINT activos_no_self_parent CHECK (activo_padre_id IS NULL OR activo_padre_id <> id),
  CONSTRAINT activos_clave_interna_empresa_uk
    UNIQUE NULLS NOT DISTINCT (empresa_id, clave_interna)
);

CREATE INDEX dilesa_activos_empresa_tipo_idx
  ON dilesa.activos(empresa_id, tipo) WHERE deleted_at IS NULL;
CREATE INDEX dilesa_activos_padre_idx
  ON dilesa.activos(activo_padre_id) WHERE deleted_at IS NULL;
CREATE INDEX dilesa_activos_estado_idx
  ON dilesa.activos(empresa_id, estado) WHERE deleted_at IS NULL;

ALTER TABLE dilesa.activos ENABLE ROW LEVEL SECURITY;
CREATE POLICY activos_select ON dilesa.activos
  FOR SELECT TO authenticated
  USING (deleted_at IS NULL AND (core.fn_has_empresa(empresa_id) OR core.fn_is_admin()));
CREATE POLICY activos_write ON dilesa.activos
  FOR ALL TO authenticated
  USING (core.fn_has_empresa(empresa_id) OR core.fn_is_admin())
  WITH CHECK (core.fn_has_empresa(empresa_id) OR core.fn_is_admin());

CREATE TRIGGER dilesa_activos_updated_at
  BEFORE UPDATE ON dilesa.activos
  FOR EACH ROW EXECUTE FUNCTION core.fn_set_updated_at();

COMMENT ON TABLE dilesa.activos IS
  'Portafolio de activos DILESA (master). Discriminador `tipo`; campos específicos por tipo en satélites dilesa.activo_<tipo>. Jerarquía padre/hijo via activo_padre_id. Ver ADR-009/010.';

-- ════════════════════════════════════════════════════════════════════════════
-- 2) Satélites de activo (1:1 con el master, uno por tipo)
--    Un satélite por cada tipo de activo con campos propios. Diseñados con
--    criterio de dominio inmobiliario — NO copiados de Coda (que está
--    deficiente). La importación desde Coda llenará lo que traiga; los
--    campos sin dato quedan NULL y se completan después.
-- ════════════════════════════════════════════════════════════════════════════
CREATE TABLE dilesa.activo_terreno (
  activo_id  uuid PRIMARY KEY REFERENCES dilesa.activos(id) ON DELETE CASCADE,
  empresa_id uuid NOT NULL REFERENCES core.empresas(id) ON DELETE RESTRICT,
  uso_suelo            text,
  zonificacion         text,
  factibilidad_agua          boolean,
  factibilidad_drenaje       boolean,
  factibilidad_electricidad  boolean,
  factibilidad_vialidad      boolean,
  areas_afectacion_m2  numeric(14, 2),
  notas      text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE dilesa.activo_terreno ENABLE ROW LEVEL SECURITY;
CREATE POLICY activo_terreno_select ON dilesa.activo_terreno
  FOR SELECT TO authenticated
  USING (core.fn_has_empresa(empresa_id) OR core.fn_is_admin());
CREATE POLICY activo_terreno_write ON dilesa.activo_terreno
  FOR ALL TO authenticated
  USING (core.fn_has_empresa(empresa_id) OR core.fn_is_admin())
  WITH CHECK (core.fn_has_empresa(empresa_id) OR core.fn_is_admin());
CREATE TRIGGER dilesa_activo_terreno_updated_at
  BEFORE UPDATE ON dilesa.activo_terreno
  FOR EACH ROW EXECUTE FUNCTION core.fn_set_updated_at();
COMMENT ON TABLE dilesa.activo_terreno IS
  'Satélite 1:1 de dilesa.activos para tipo=terreno: uso de suelo, factibilidades, zonificación.';

CREATE TABLE dilesa.activo_lote (
  activo_id   uuid PRIMARY KEY REFERENCES dilesa.activos(id) ON DELETE CASCADE,
  empresa_id  uuid NOT NULL REFERENCES core.empresas(id) ON DELETE RESTRICT,
  manzana     text,
  numero_lote text,
  condicion   text,
  frente_m    numeric(10, 2),
  fondo_m     numeric(10, 2),
  notas       text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT activo_lote_condicion_check
    CHECK (condicion IS NULL OR condicion IN ('esquina','intermedio','cabecera'))
);
ALTER TABLE dilesa.activo_lote ENABLE ROW LEVEL SECURITY;
CREATE POLICY activo_lote_select ON dilesa.activo_lote
  FOR SELECT TO authenticated
  USING (core.fn_has_empresa(empresa_id) OR core.fn_is_admin());
CREATE POLICY activo_lote_write ON dilesa.activo_lote
  FOR ALL TO authenticated
  USING (core.fn_has_empresa(empresa_id) OR core.fn_is_admin())
  WITH CHECK (core.fn_has_empresa(empresa_id) OR core.fn_is_admin());
CREATE TRIGGER dilesa_activo_lote_updated_at
  BEFORE UPDATE ON dilesa.activo_lote
  FOR EACH ROW EXECUTE FUNCTION core.fn_set_updated_at();
COMMENT ON TABLE dilesa.activo_lote IS
  'Satélite 1:1 de dilesa.activos para tipo=lote: manzana, número, condición, dimensiones.';

-- activo_espectacular — estructura publicitaria tipo panel
CREATE TABLE dilesa.activo_espectacular (
  activo_id  uuid PRIMARY KEY REFERENCES dilesa.activos(id) ON DELETE CASCADE,
  empresa_id uuid NOT NULL REFERENCES core.empresas(id) ON DELETE RESTRICT,
  caras                   integer,
  ancho_m                 numeric(8, 2),
  alto_m                  numeric(8, 2),
  iluminado               boolean,
  orientacion             text,
  vialidad                text,
  trafico_estimado_diario integer,
  anunciante_actual       text,
  renta_mensual           numeric(14, 2),
  contrato_vigente_hasta  date,
  notas      text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE dilesa.activo_espectacular ENABLE ROW LEVEL SECURITY;
CREATE POLICY activo_espectacular_select ON dilesa.activo_espectacular
  FOR SELECT TO authenticated
  USING (core.fn_has_empresa(empresa_id) OR core.fn_is_admin());
CREATE POLICY activo_espectacular_write ON dilesa.activo_espectacular
  FOR ALL TO authenticated
  USING (core.fn_has_empresa(empresa_id) OR core.fn_is_admin())
  WITH CHECK (core.fn_has_empresa(empresa_id) OR core.fn_is_admin());
CREATE TRIGGER dilesa_activo_espectacular_updated_at
  BEFORE UPDATE ON dilesa.activo_espectacular
  FOR EACH ROW EXECUTE FUNCTION core.fn_set_updated_at();
COMMENT ON TABLE dilesa.activo_espectacular IS
  'Satélite 1:1 de dilesa.activos para tipo=espectacular: panel publicitario sobre estructura.';

-- activo_unipolar — panel publicitario sobre poste único
CREATE TABLE dilesa.activo_unipolar (
  activo_id  uuid PRIMARY KEY REFERENCES dilesa.activos(id) ON DELETE CASCADE,
  empresa_id uuid NOT NULL REFERENCES core.empresas(id) ON DELETE RESTRICT,
  caras                   integer,
  ancho_m                 numeric(8, 2),
  alto_m                  numeric(8, 2),
  altura_poste_m          numeric(8, 2),
  iluminado               boolean,
  orientacion             text,
  vialidad                text,
  trafico_estimado_diario integer,
  anunciante_actual       text,
  renta_mensual           numeric(14, 2),
  contrato_vigente_hasta  date,
  notas      text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE dilesa.activo_unipolar ENABLE ROW LEVEL SECURITY;
CREATE POLICY activo_unipolar_select ON dilesa.activo_unipolar
  FOR SELECT TO authenticated
  USING (core.fn_has_empresa(empresa_id) OR core.fn_is_admin());
CREATE POLICY activo_unipolar_write ON dilesa.activo_unipolar
  FOR ALL TO authenticated
  USING (core.fn_has_empresa(empresa_id) OR core.fn_is_admin())
  WITH CHECK (core.fn_has_empresa(empresa_id) OR core.fn_is_admin());
CREATE TRIGGER dilesa_activo_unipolar_updated_at
  BEFORE UPDATE ON dilesa.activo_unipolar
  FOR EACH ROW EXECUTE FUNCTION core.fn_set_updated_at();
COMMENT ON TABLE dilesa.activo_unipolar IS
  'Satélite 1:1 de dilesa.activos para tipo=unipolar: panel publicitario sobre poste único.';

-- activo_casa — vivienda unifamiliar
CREATE TABLE dilesa.activo_casa (
  activo_id  uuid PRIMARY KEY REFERENCES dilesa.activos(id) ON DELETE CASCADE,
  empresa_id uuid NOT NULL REFERENCES core.empresas(id) ON DELETE RESTRICT,
  recamaras           integer,
  banos               numeric(4, 1),
  m2_construccion     numeric(10, 2),
  m2_terreno          numeric(10, 2),
  niveles             integer,
  cochera_autos       integer,
  ano_construccion    integer,
  estado_conservacion text,
  notas      text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE dilesa.activo_casa ENABLE ROW LEVEL SECURITY;
CREATE POLICY activo_casa_select ON dilesa.activo_casa
  FOR SELECT TO authenticated
  USING (core.fn_has_empresa(empresa_id) OR core.fn_is_admin());
CREATE POLICY activo_casa_write ON dilesa.activo_casa
  FOR ALL TO authenticated
  USING (core.fn_has_empresa(empresa_id) OR core.fn_is_admin())
  WITH CHECK (core.fn_has_empresa(empresa_id) OR core.fn_is_admin());
CREATE TRIGGER dilesa_activo_casa_updated_at
  BEFORE UPDATE ON dilesa.activo_casa
  FOR EACH ROW EXECUTE FUNCTION core.fn_set_updated_at();
COMMENT ON TABLE dilesa.activo_casa IS
  'Satélite 1:1 de dilesa.activos para tipo=casa: vivienda unifamiliar.';

-- activo_departamento — unidad habitacional en edificio/complejo
CREATE TABLE dilesa.activo_departamento (
  activo_id  uuid PRIMARY KEY REFERENCES dilesa.activos(id) ON DELETE CASCADE,
  empresa_id uuid NOT NULL REFERENCES core.empresas(id) ON DELETE RESTRICT,
  recamaras               integer,
  banos                   numeric(4, 1),
  m2_construccion         numeric(10, 2),
  nivel                   integer,
  tiene_balcon            boolean,
  cajones_estacionamiento integer,
  mantenimiento_mensual   numeric(12, 2),
  notas      text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE dilesa.activo_departamento ENABLE ROW LEVEL SECURITY;
CREATE POLICY activo_departamento_select ON dilesa.activo_departamento
  FOR SELECT TO authenticated
  USING (core.fn_has_empresa(empresa_id) OR core.fn_is_admin());
CREATE POLICY activo_departamento_write ON dilesa.activo_departamento
  FOR ALL TO authenticated
  USING (core.fn_has_empresa(empresa_id) OR core.fn_is_admin())
  WITH CHECK (core.fn_has_empresa(empresa_id) OR core.fn_is_admin());
CREATE TRIGGER dilesa_activo_departamento_updated_at
  BEFORE UPDATE ON dilesa.activo_departamento
  FOR EACH ROW EXECUTE FUNCTION core.fn_set_updated_at();
COMMENT ON TABLE dilesa.activo_departamento IS
  'Satélite 1:1 de dilesa.activos para tipo=departamento: unidad habitacional en edificio o complejo.';

-- activo_local — local comercial
CREATE TABLE dilesa.activo_local (
  activo_id  uuid PRIMARY KEY REFERENCES dilesa.activos(id) ON DELETE CASCADE,
  empresa_id uuid NOT NULL REFERENCES core.empresas(id) ON DELETE RESTRICT,
  m2_rentable    numeric(10, 2),
  frente_m       numeric(8, 2),
  planta         text,
  giro_permitido text,
  tiene_bodega   boolean,
  banos          integer,
  estado_obra    text,
  notas      text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT activo_local_estado_obra_check
    CHECK (estado_obra IS NULL OR estado_obra IN ('obra_gris','acabados','habilitado'))
);
ALTER TABLE dilesa.activo_local ENABLE ROW LEVEL SECURITY;
CREATE POLICY activo_local_select ON dilesa.activo_local
  FOR SELECT TO authenticated
  USING (core.fn_has_empresa(empresa_id) OR core.fn_is_admin());
CREATE POLICY activo_local_write ON dilesa.activo_local
  FOR ALL TO authenticated
  USING (core.fn_has_empresa(empresa_id) OR core.fn_is_admin())
  WITH CHECK (core.fn_has_empresa(empresa_id) OR core.fn_is_admin());
CREATE TRIGGER dilesa_activo_local_updated_at
  BEFORE UPDATE ON dilesa.activo_local
  FOR EACH ROW EXECUTE FUNCTION core.fn_set_updated_at();
COMMENT ON TABLE dilesa.activo_local IS
  'Satélite 1:1 de dilesa.activos para tipo=local: local comercial.';

-- activo_plaza — plaza comercial (activo padre de locales)
CREATE TABLE dilesa.activo_plaza (
  activo_id  uuid PRIMARY KEY REFERENCES dilesa.activos(id) ON DELETE CASCADE,
  empresa_id uuid NOT NULL REFERENCES core.empresas(id) ON DELETE RESTRICT,
  locales_totales         integer,
  area_rentable_total_m2  numeric(12, 2),
  area_comun_m2           numeric(12, 2),
  cajones_estacionamiento integer,
  tiene_anchor            boolean,
  anchor_nombre           text,
  notas      text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE dilesa.activo_plaza ENABLE ROW LEVEL SECURITY;
CREATE POLICY activo_plaza_select ON dilesa.activo_plaza
  FOR SELECT TO authenticated
  USING (core.fn_has_empresa(empresa_id) OR core.fn_is_admin());
CREATE POLICY activo_plaza_write ON dilesa.activo_plaza
  FOR ALL TO authenticated
  USING (core.fn_has_empresa(empresa_id) OR core.fn_is_admin())
  WITH CHECK (core.fn_has_empresa(empresa_id) OR core.fn_is_admin());
CREATE TRIGGER dilesa_activo_plaza_updated_at
  BEFORE UPDATE ON dilesa.activo_plaza
  FOR EACH ROW EXECUTE FUNCTION core.fn_set_updated_at();
COMMENT ON TABLE dilesa.activo_plaza IS
  'Satélite 1:1 de dilesa.activos para tipo=plaza: plaza comercial, activo padre de locales.';

-- activo_edificio — edificio (oficinas / mixto / habitacional)
CREATE TABLE dilesa.activo_edificio (
  activo_id  uuid PRIMARY KEY REFERENCES dilesa.activos(id) ON DELETE CASCADE,
  empresa_id uuid NOT NULL REFERENCES core.empresas(id) ON DELETE RESTRICT,
  niveles                 integer,
  m2_rentable_total       numeric(12, 2),
  m2_construccion_total   numeric(12, 2),
  elevadores              integer,
  uso                     text,
  cajones_estacionamiento integer,
  notas      text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE dilesa.activo_edificio ENABLE ROW LEVEL SECURITY;
CREATE POLICY activo_edificio_select ON dilesa.activo_edificio
  FOR SELECT TO authenticated
  USING (core.fn_has_empresa(empresa_id) OR core.fn_is_admin());
CREATE POLICY activo_edificio_write ON dilesa.activo_edificio
  FOR ALL TO authenticated
  USING (core.fn_has_empresa(empresa_id) OR core.fn_is_admin())
  WITH CHECK (core.fn_has_empresa(empresa_id) OR core.fn_is_admin());
CREATE TRIGGER dilesa_activo_edificio_updated_at
  BEFORE UPDATE ON dilesa.activo_edificio
  FOR EACH ROW EXECUTE FUNCTION core.fn_set_updated_at();
COMMENT ON TABLE dilesa.activo_edificio IS
  'Satélite 1:1 de dilesa.activos para tipo=edificio.';

-- activo_nave — nave industrial
CREATE TABLE dilesa.activo_nave (
  activo_id  uuid PRIMARY KEY REFERENCES dilesa.activos(id) ON DELETE CASCADE,
  empresa_id uuid NOT NULL REFERENCES core.empresas(id) ON DELETE RESTRICT,
  m2_techados           numeric(12, 2),
  m2_patio              numeric(12, 2),
  altura_libre_m        numeric(8, 2),
  andenes_carga         integer,
  subestacion_electrica boolean,
  uso_suelo_industrial  boolean,
  notas      text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE dilesa.activo_nave ENABLE ROW LEVEL SECURITY;
CREATE POLICY activo_nave_select ON dilesa.activo_nave
  FOR SELECT TO authenticated
  USING (core.fn_has_empresa(empresa_id) OR core.fn_is_admin());
CREATE POLICY activo_nave_write ON dilesa.activo_nave
  FOR ALL TO authenticated
  USING (core.fn_has_empresa(empresa_id) OR core.fn_is_admin())
  WITH CHECK (core.fn_has_empresa(empresa_id) OR core.fn_is_admin());
CREATE TRIGGER dilesa_activo_nave_updated_at
  BEFORE UPDATE ON dilesa.activo_nave
  FOR EACH ROW EXECUTE FUNCTION core.fn_set_updated_at();
COMMENT ON TABLE dilesa.activo_nave IS
  'Satélite 1:1 de dilesa.activos para tipo=nave: nave industrial / bodega.';

-- activo_infraestructura — vialidades, canales, áreas verdes, equipamiento
CREATE TABLE dilesa.activo_infraestructura (
  activo_id  uuid PRIMARY KEY REFERENCES dilesa.activos(id) ON DELETE CASCADE,
  empresa_id uuid NOT NULL REFERENCES core.empresas(id) ON DELETE RESTRICT,
  subtipo               text,
  longitud_m            numeric(12, 2),
  estado_mantenimiento  text,
  entregado_a_municipio boolean,
  notas      text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT activo_infraestructura_subtipo_check
    CHECK (subtipo IS NULL OR subtipo IN ('vialidad','canal','area_verde','equipamiento'))
);
ALTER TABLE dilesa.activo_infraestructura ENABLE ROW LEVEL SECURITY;
CREATE POLICY activo_infraestructura_select ON dilesa.activo_infraestructura
  FOR SELECT TO authenticated
  USING (core.fn_has_empresa(empresa_id) OR core.fn_is_admin());
CREATE POLICY activo_infraestructura_write ON dilesa.activo_infraestructura
  FOR ALL TO authenticated
  USING (core.fn_has_empresa(empresa_id) OR core.fn_is_admin())
  WITH CHECK (core.fn_has_empresa(empresa_id) OR core.fn_is_admin());
CREATE TRIGGER dilesa_activo_infraestructura_updated_at
  BEFORE UPDATE ON dilesa.activo_infraestructura
  FOR EACH ROW EXECUTE FUNCTION core.fn_set_updated_at();
COMMENT ON TABLE dilesa.activo_infraestructura IS
  'Satélite 1:1 de dilesa.activos para tipo=infraestructura: vialidades, canales, áreas verdes, equipamiento.';

-- ════════════════════════════════════════════════════════════════════════════
-- 3) dilesa.proyectos_plantillas — plantillas editables por tipo de proyecto
-- ════════════════════════════════════════════════════════════════════════════
CREATE TABLE dilesa.proyectos_plantillas (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id  uuid REFERENCES core.empresas(id) ON DELETE RESTRICT,
  tipo_proyecto text NOT NULL,
  nombre      text NOT NULL,
  descripcion text,
  es_oficial  boolean NOT NULL DEFAULT false,
  definicion  jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  deleted_at  timestamptz,
  CONSTRAINT proyectos_plantillas_tipo_check CHECK (tipo_proyecto IN (
    'anteproyecto','desarrollo','remodelacion','reconversion',
    'subdivision','comercializacion','operacion'
  )),
  CONSTRAINT proyectos_plantillas_definicion_es_obj
    CHECK (jsonb_typeof(definicion) = 'object')
);
CREATE INDEX dilesa_proyectos_plantillas_tipo_idx
  ON dilesa.proyectos_plantillas(tipo_proyecto) WHERE deleted_at IS NULL;
ALTER TABLE dilesa.proyectos_plantillas ENABLE ROW LEVEL SECURITY;
CREATE POLICY proyectos_plantillas_select ON dilesa.proyectos_plantillas
  FOR SELECT TO authenticated
  USING (deleted_at IS NULL AND (
    empresa_id IS NULL OR core.fn_has_empresa(empresa_id) OR core.fn_is_admin()
  ));
CREATE POLICY proyectos_plantillas_write ON dilesa.proyectos_plantillas
  FOR ALL TO authenticated
  USING (empresa_id IS NULL OR core.fn_has_empresa(empresa_id) OR core.fn_is_admin())
  WITH CHECK (empresa_id IS NULL OR core.fn_has_empresa(empresa_id) OR core.fn_is_admin());
CREATE TRIGGER dilesa_proyectos_plantillas_updated_at
  BEFORE UPDATE ON dilesa.proyectos_plantillas
  FOR EACH ROW EXECUTE FUNCTION core.fn_set_updated_at();
COMMENT ON TABLE dilesa.proyectos_plantillas IS
  'Plantillas editables por tipo de proyecto. definicion jsonb = tareas/hitos/KPIs. es_oficial=true cuando la plantilla maduró. empresa_id NULL = plantilla global.';

-- ════════════════════════════════════════════════════════════════════════════
-- 4) dilesa.proyectos — la intervención (master)
-- ════════════════════════════════════════════════════════════════════════════
CREATE TABLE dilesa.proyectos (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id  uuid NOT NULL REFERENCES core.empresas(id) ON DELETE RESTRICT,
  tipo        text NOT NULL,
  nombre      text NOT NULL,
  estado      text NOT NULL DEFAULT 'propuesta',
  proyecto_padre_id      uuid REFERENCES dilesa.proyectos(id) ON DELETE SET NULL,
  proyecto_predecesor_id uuid REFERENCES dilesa.proyectos(id) ON DELETE SET NULL,
  plantilla_id           uuid REFERENCES dilesa.proyectos_plantillas(id) ON DELETE SET NULL,
  regla_prorrateo  text NOT NULL DEFAULT 'm2_beneficiados',
  presupuesto_estimado numeric(16, 2),
  fecha_inicio         date,
  fecha_fin_estimada   date,
  notas      text,
  documentos jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  CONSTRAINT proyectos_tipo_check CHECK (tipo IN (
    'anteproyecto','desarrollo','remodelacion','reconversion',
    'subdivision','comercializacion','operacion'
  )),
  CONSTRAINT proyectos_estado_check CHECK (estado IN (
    'propuesta','analisis','aprobado','ejecutando','completado','archivado'
  )),
  CONSTRAINT proyectos_regla_prorrateo_check CHECK (regla_prorrateo IN (
    'm2_beneficiados','por_unidad','por_valor_comercial','manual'
  )),
  CONSTRAINT proyectos_documentos_es_array CHECK (jsonb_typeof(documentos) = 'array'),
  CONSTRAINT proyectos_no_self_parent
    CHECK (proyecto_padre_id IS NULL OR proyecto_padre_id <> id)
);
CREATE INDEX dilesa_proyectos_empresa_tipo_idx
  ON dilesa.proyectos(empresa_id, tipo) WHERE deleted_at IS NULL;
CREATE INDEX dilesa_proyectos_padre_idx
  ON dilesa.proyectos(proyecto_padre_id) WHERE deleted_at IS NULL;
CREATE INDEX dilesa_proyectos_estado_idx
  ON dilesa.proyectos(empresa_id, estado) WHERE deleted_at IS NULL;
ALTER TABLE dilesa.proyectos ENABLE ROW LEVEL SECURITY;
CREATE POLICY proyectos_select ON dilesa.proyectos
  FOR SELECT TO authenticated
  USING (deleted_at IS NULL AND (core.fn_has_empresa(empresa_id) OR core.fn_is_admin()));
CREATE POLICY proyectos_write ON dilesa.proyectos
  FOR ALL TO authenticated
  USING (core.fn_has_empresa(empresa_id) OR core.fn_is_admin())
  WITH CHECK (core.fn_has_empresa(empresa_id) OR core.fn_is_admin());
CREATE TRIGGER dilesa_proyectos_updated_at
  BEFORE UPDATE ON dilesa.proyectos
  FOR EACH ROW EXECUTE FUNCTION core.fn_set_updated_at();
COMMENT ON TABLE dilesa.proyectos IS
  'Proyectos DILESA (master). Discriminador `tipo` (anteproyecto/desarrollo/etc.). Jerarquía madre/sub-proyecto via proyecto_padre_id; anteproyecto ganador via proyecto_predecesor_id. Ver ADR-009/010.';

-- ════════════════════════════════════════════════════════════════════════════
-- 5) dilesa.productos — catálogo de unidad-tipo por proyecto
-- ════════════════════════════════════════════════════════════════════════════
CREATE TABLE dilesa.productos (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id  uuid NOT NULL REFERENCES core.empresas(id) ON DELETE RESTRICT,
  proyecto_id uuid NOT NULL REFERENCES dilesa.proyectos(id) ON DELETE CASCADE,
  nombre      text NOT NULL,
  descripcion text,
  atributos   jsonb NOT NULL DEFAULT '{}'::jsonb,
  valor_comercial_referencia numeric(16, 2),
  costo_referencia           numeric(16, 2),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  deleted_at  timestamptz,
  CONSTRAINT productos_atributos_es_obj CHECK (jsonb_typeof(atributos) = 'object')
);
CREATE INDEX dilesa_productos_proyecto_idx
  ON dilesa.productos(proyecto_id) WHERE deleted_at IS NULL;
ALTER TABLE dilesa.productos ENABLE ROW LEVEL SECURITY;
CREATE POLICY productos_select ON dilesa.productos
  FOR SELECT TO authenticated
  USING (deleted_at IS NULL AND (core.fn_has_empresa(empresa_id) OR core.fn_is_admin()));
CREATE POLICY productos_write ON dilesa.productos
  FOR ALL TO authenticated
  USING (core.fn_has_empresa(empresa_id) OR core.fn_is_admin())
  WITH CHECK (core.fn_has_empresa(empresa_id) OR core.fn_is_admin());
CREATE TRIGGER dilesa_productos_updated_at
  BEFORE UPDATE ON dilesa.productos
  FOR EACH ROW EXECUTE FUNCTION core.fn_set_updated_at();
COMMENT ON TABLE dilesa.productos IS
  'Catálogo de unidad-tipo por proyecto (prototipo de vivienda, tipo de local, etc.). Polimórfico via atributos jsonb. Ver ADR-009.';

-- ════════════════════════════════════════════════════════════════════════════
-- 6) dilesa.unidades — la pieza física vendible/rentable
-- ════════════════════════════════════════════════════════════════════════════
CREATE TABLE dilesa.unidades (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id   uuid NOT NULL REFERENCES core.empresas(id) ON DELETE RESTRICT,
  proyecto_id  uuid NOT NULL REFERENCES dilesa.proyectos(id) ON DELETE CASCADE,
  producto_id  uuid REFERENCES dilesa.productos(id) ON DELETE SET NULL,
  activo_id    uuid REFERENCES dilesa.activos(id) ON DELETE SET NULL,
  identificador text NOT NULL,
  estado       text NOT NULL DEFAULT 'planeada',
  area_m2      numeric(14, 2),
  precio       numeric(16, 2),
  notas        text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  deleted_at   timestamptz,
  CONSTRAINT unidades_estado_check CHECK (estado IN (
    'planeada','disponible','reservada','comprometida','cerrada'
  ))
);
CREATE INDEX dilesa_unidades_proyecto_idx
  ON dilesa.unidades(proyecto_id) WHERE deleted_at IS NULL;
CREATE INDEX dilesa_unidades_producto_idx
  ON dilesa.unidades(producto_id) WHERE deleted_at IS NULL;
CREATE INDEX dilesa_unidades_activo_idx
  ON dilesa.unidades(activo_id) WHERE deleted_at IS NULL;
ALTER TABLE dilesa.unidades ENABLE ROW LEVEL SECURITY;
CREATE POLICY unidades_select ON dilesa.unidades
  FOR SELECT TO authenticated
  USING (deleted_at IS NULL AND (core.fn_has_empresa(empresa_id) OR core.fn_is_admin()));
CREATE POLICY unidades_write ON dilesa.unidades
  FOR ALL TO authenticated
  USING (core.fn_has_empresa(empresa_id) OR core.fn_is_admin())
  WITH CHECK (core.fn_has_empresa(empresa_id) OR core.fn_is_admin());
CREATE TRIGGER dilesa_unidades_updated_at
  BEFORE UPDATE ON dilesa.unidades
  FOR EACH ROW EXECUTE FUNCTION core.fn_set_updated_at();
COMMENT ON TABLE dilesa.unidades IS
  'Pieza física vendible/rentable (lote, local, departamento). producto_id reclasificable hasta comprometer; activo_id se llena cuando la unidad se libera al portafolio. Ver ADR-010.';

-- ════════════════════════════════════════════════════════════════════════════
-- 7) dilesa.proyecto_activos — vínculo M:N Proyecto↔Activo (input/output)
-- ════════════════════════════════════════════════════════════════════════════
CREATE TABLE dilesa.proyecto_activos (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id  uuid NOT NULL REFERENCES core.empresas(id) ON DELETE RESTRICT,
  proyecto_id uuid NOT NULL REFERENCES dilesa.proyectos(id) ON DELETE CASCADE,
  activo_id   uuid NOT NULL REFERENCES dilesa.activos(id) ON DELETE CASCADE,
  rol         text NOT NULL,
  notas       text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT proyecto_activos_rol_check CHECK (rol IN ('input','output')),
  CONSTRAINT proyecto_activos_uk UNIQUE (proyecto_id, activo_id, rol)
);
CREATE INDEX dilesa_proyecto_activos_proyecto_idx ON dilesa.proyecto_activos(proyecto_id);
CREATE INDEX dilesa_proyecto_activos_activo_idx ON dilesa.proyecto_activos(activo_id);
ALTER TABLE dilesa.proyecto_activos ENABLE ROW LEVEL SECURITY;
CREATE POLICY proyecto_activos_select ON dilesa.proyecto_activos
  FOR SELECT TO authenticated
  USING (core.fn_has_empresa(empresa_id) OR core.fn_is_admin());
CREATE POLICY proyecto_activos_write ON dilesa.proyecto_activos
  FOR ALL TO authenticated
  USING (core.fn_has_empresa(empresa_id) OR core.fn_is_admin())
  WITH CHECK (core.fn_has_empresa(empresa_id) OR core.fn_is_admin());
COMMENT ON TABLE dilesa.proyecto_activos IS
  'Vínculo M:N Proyecto↔Activo. rol=input: activos sobre los que interviene; rol=output: activos que genera. Ver ADR-010.';

-- ════════════════════════════════════════════════════════════════════════════
-- 8) dilesa.proyecto_prorrateo — asignación manual de CapEx compartido
--    Solo se usa cuando proyecto madre tiene regla_prorrateo='manual'.
-- ════════════════════════════════════════════════════════════════════════════
CREATE TABLE dilesa.proyecto_prorrateo (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id        uuid NOT NULL REFERENCES core.empresas(id) ON DELETE RESTRICT,
  proyecto_madre_id uuid NOT NULL REFERENCES dilesa.proyectos(id) ON DELETE CASCADE,
  sub_proyecto_id   uuid NOT NULL REFERENCES dilesa.proyectos(id) ON DELETE CASCADE,
  porcentaje        numeric(7, 4) NOT NULL,
  notas             text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT proyecto_prorrateo_pct_check CHECK (porcentaje >= 0 AND porcentaje <= 100),
  CONSTRAINT proyecto_prorrateo_uk UNIQUE (proyecto_madre_id, sub_proyecto_id),
  CONSTRAINT proyecto_prorrateo_distintos CHECK (proyecto_madre_id <> sub_proyecto_id)
);
CREATE INDEX dilesa_proyecto_prorrateo_madre_idx ON dilesa.proyecto_prorrateo(proyecto_madre_id);
ALTER TABLE dilesa.proyecto_prorrateo ENABLE ROW LEVEL SECURITY;
CREATE POLICY proyecto_prorrateo_select ON dilesa.proyecto_prorrateo
  FOR SELECT TO authenticated
  USING (core.fn_has_empresa(empresa_id) OR core.fn_is_admin());
CREATE POLICY proyecto_prorrateo_write ON dilesa.proyecto_prorrateo
  FOR ALL TO authenticated
  USING (core.fn_has_empresa(empresa_id) OR core.fn_is_admin())
  WITH CHECK (core.fn_has_empresa(empresa_id) OR core.fn_is_admin());
CREATE TRIGGER dilesa_proyecto_prorrateo_updated_at
  BEFORE UPDATE ON dilesa.proyecto_prorrateo
  FOR EACH ROW EXECUTE FUNCTION core.fn_set_updated_at();
COMMENT ON TABLE dilesa.proyecto_prorrateo IS
  'Asignación explícita de CapEx compartido a sub-proyectos. Solo aplica con regla_prorrateo=manual; las otras reglas se calculan en vista. Ver ADR-010.';

-- ════════════════════════════════════════════════════════════════════════════
-- 9) Soporte de proyecto: tareas, hitos, documentos, responsables
-- ════════════════════════════════════════════════════════════════════════════
CREATE TABLE dilesa.proyecto_tareas (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id  uuid NOT NULL REFERENCES core.empresas(id) ON DELETE RESTRICT,
  proyecto_id uuid NOT NULL REFERENCES dilesa.proyectos(id) ON DELETE CASCADE,
  titulo      text NOT NULL,
  descripcion text,
  estado      text NOT NULL DEFAULT 'pendiente',
  prioridad   text NOT NULL DEFAULT 'media',
  responsable_id   uuid REFERENCES erp.empleados(id) ON DELETE SET NULL,
  fecha_limite     date,
  fecha_completada date,
  orden       integer NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  deleted_at  timestamptz,
  CONSTRAINT proyecto_tareas_estado_check CHECK (estado IN (
    'pendiente','en_curso','completada','cancelada'
  )),
  CONSTRAINT proyecto_tareas_prioridad_check CHECK (prioridad IN ('alta','media','baja'))
);
CREATE INDEX dilesa_proyecto_tareas_proyecto_idx
  ON dilesa.proyecto_tareas(proyecto_id) WHERE deleted_at IS NULL;
CREATE INDEX dilesa_proyecto_tareas_responsable_idx
  ON dilesa.proyecto_tareas(responsable_id) WHERE deleted_at IS NULL;
ALTER TABLE dilesa.proyecto_tareas ENABLE ROW LEVEL SECURITY;
CREATE POLICY proyecto_tareas_select ON dilesa.proyecto_tareas
  FOR SELECT TO authenticated
  USING (deleted_at IS NULL AND (core.fn_has_empresa(empresa_id) OR core.fn_is_admin()));
CREATE POLICY proyecto_tareas_write ON dilesa.proyecto_tareas
  FOR ALL TO authenticated
  USING (core.fn_has_empresa(empresa_id) OR core.fn_is_admin())
  WITH CHECK (core.fn_has_empresa(empresa_id) OR core.fn_is_admin());
CREATE TRIGGER dilesa_proyecto_tareas_updated_at
  BEFORE UPDATE ON dilesa.proyecto_tareas
  FOR EACH ROW EXECUTE FUNCTION core.fn_set_updated_at();
COMMENT ON TABLE dilesa.proyecto_tareas IS
  'Tareas de un proyecto. Agnóstico al tipo de proyecto (hereda el patrón del módulo Tareas existente).';

CREATE TABLE dilesa.proyecto_hitos (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id  uuid NOT NULL REFERENCES core.empresas(id) ON DELETE RESTRICT,
  proyecto_id uuid NOT NULL REFERENCES dilesa.proyectos(id) ON DELETE CASCADE,
  nombre      text NOT NULL,
  descripcion text,
  fecha_objetivo date,
  fecha_real     date,
  estado      text NOT NULL DEFAULT 'pendiente',
  orden       integer NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  deleted_at  timestamptz,
  CONSTRAINT proyecto_hitos_estado_check CHECK (estado IN (
    'pendiente','alcanzado','atrasado'
  ))
);
CREATE INDEX dilesa_proyecto_hitos_proyecto_idx
  ON dilesa.proyecto_hitos(proyecto_id) WHERE deleted_at IS NULL;
ALTER TABLE dilesa.proyecto_hitos ENABLE ROW LEVEL SECURITY;
CREATE POLICY proyecto_hitos_select ON dilesa.proyecto_hitos
  FOR SELECT TO authenticated
  USING (deleted_at IS NULL AND (core.fn_has_empresa(empresa_id) OR core.fn_is_admin()));
CREATE POLICY proyecto_hitos_write ON dilesa.proyecto_hitos
  FOR ALL TO authenticated
  USING (core.fn_has_empresa(empresa_id) OR core.fn_is_admin())
  WITH CHECK (core.fn_has_empresa(empresa_id) OR core.fn_is_admin());
CREATE TRIGGER dilesa_proyecto_hitos_updated_at
  BEFORE UPDATE ON dilesa.proyecto_hitos
  FOR EACH ROW EXECUTE FUNCTION core.fn_set_updated_at();
COMMENT ON TABLE dilesa.proyecto_hitos IS
  'Hitos macro de un proyecto (factibilidades, permisos, obra, comercialización, cierre).';

CREATE TABLE dilesa.proyecto_documentos (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id  uuid NOT NULL REFERENCES core.empresas(id) ON DELETE RESTRICT,
  proyecto_id uuid NOT NULL REFERENCES dilesa.proyectos(id) ON DELETE CASCADE,
  nombre      text NOT NULL,
  tipo        text,
  url         text NOT NULL,
  notas       text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  created_by  uuid REFERENCES core.usuarios(id) ON DELETE SET NULL,
  deleted_at  timestamptz
);
CREATE INDEX dilesa_proyecto_documentos_proyecto_idx
  ON dilesa.proyecto_documentos(proyecto_id) WHERE deleted_at IS NULL;
ALTER TABLE dilesa.proyecto_documentos ENABLE ROW LEVEL SECURITY;
CREATE POLICY proyecto_documentos_select ON dilesa.proyecto_documentos
  FOR SELECT TO authenticated
  USING (deleted_at IS NULL AND (core.fn_has_empresa(empresa_id) OR core.fn_is_admin()));
CREATE POLICY proyecto_documentos_write ON dilesa.proyecto_documentos
  FOR ALL TO authenticated
  USING (core.fn_has_empresa(empresa_id) OR core.fn_is_admin())
  WITH CHECK (core.fn_has_empresa(empresa_id) OR core.fn_is_admin());
COMMENT ON TABLE dilesa.proyecto_documentos IS
  'Legajo documental de un proyecto (planos, factibilidades, permisos, contratos).';

CREATE TABLE dilesa.proyecto_responsables (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id   uuid NOT NULL REFERENCES core.empresas(id) ON DELETE RESTRICT,
  proyecto_id  uuid NOT NULL REFERENCES dilesa.proyectos(id) ON DELETE CASCADE,
  empleado_id  uuid REFERENCES erp.empleados(id) ON DELETE SET NULL,
  rol          text NOT NULL,
  externo      boolean NOT NULL DEFAULT false,
  nombre_externo text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT proyecto_responsables_quien_check CHECK (
    (externo = false AND empleado_id IS NOT NULL)
    OR (externo = true AND nombre_externo IS NOT NULL)
  )
);
CREATE INDEX dilesa_proyecto_responsables_proyecto_idx
  ON dilesa.proyecto_responsables(proyecto_id);
ALTER TABLE dilesa.proyecto_responsables ENABLE ROW LEVEL SECURITY;
CREATE POLICY proyecto_responsables_select ON dilesa.proyecto_responsables
  FOR SELECT TO authenticated
  USING (core.fn_has_empresa(empresa_id) OR core.fn_is_admin());
CREATE POLICY proyecto_responsables_write ON dilesa.proyecto_responsables
  FOR ALL TO authenticated
  USING (core.fn_has_empresa(empresa_id) OR core.fn_is_admin())
  WITH CHECK (core.fn_has_empresa(empresa_id) OR core.fn_is_admin());
COMMENT ON TABLE dilesa.proyecto_responsables IS
  'Responsables de un proyecto. Internos via empleado_id; externos (arquitecto, notario, contratista) via nombre_externo.';

NOTIFY pgrst, 'reload schema';

COMMIT;
