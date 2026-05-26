-- Plantilla canónica de tareas para proyectos DILESA + extender
-- `proyecto_tareas` + presupuesto de partidas.
--
-- Sprint 3 de la iniciativa `dilesa-proyectos-anteproyectos` (ver
-- docs/planning/dilesa-proyectos-anteproyectos.md).
--
-- Modelo:
-- 1. `dilesa.plantilla_proyecto_tareas` (catálogo). 35 tareas seed
--    importadas de Coda (`table-7XBvWbyLzx`, "Plantilla Trámites Estudios
--    y Documentos", 31 pasos) + 1 gate "Comité de Inversión" + 3
--    cotizaciones de obra. Las tareas son globales (empresa_id NULL).
-- 2. `dilesa.plantilla_proyecto_tareas_dependencias` (N:M
--    autoreferencia). 27 dependencias semilladas desde Coda.
-- 3. `dilesa.proyecto_tareas_dependencias` (N:M para instancias).
-- 4. `dilesa.proyecto_presupuesto_partidas` (presupuesto con
--    `estado` discriminator: preliminar/autorizada/planeada/
--    en_ejercicio/cerrada).
-- 5. ALTER `dilesa.proyecto_tareas` con columnas snapshot del catálogo
--    + fechas objetivo + resultado. Estado gana `bloqueada`.
--
-- Cero rompe-cambios: las columnas nuevas son nullables, los CHECK
-- aceptan el estado nuevo `bloqueada` sin mover los existentes, no
-- se borran columnas ni constraints.

BEGIN;

-- ════════════════════════════════════════════════════════════════════════════
-- 1) Catálogo de plantilla de tareas
-- ════════════════════════════════════════════════════════════════════════════
CREATE TABLE dilesa.plantilla_proyecto_tareas (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id      uuid REFERENCES core.empresas(id) ON DELETE RESTRICT,
  nombre          text NOT NULL,
  descripcion     text,
  -- Validada contra Coda: campo "Aplicación"
  aplicacion      text NOT NULL CHECK (aplicacion IN ('anteproyecto', 'desarrollo', 'ambas')),
  -- Taxonomía libre (no enum estricto — el catálogo crece sin migraciones)
  tipo            text NOT NULL,
  subtipo         text,
  -- Auto-cálculo de fechas
  duracion_dias_habiles integer NOT NULL CHECK (duracion_dias_habiles > 0),
  orden_default   integer NOT NULL DEFAULT 0,
  -- Quién ejecuta (externo o interno)
  entidad_responsable text NOT NULL,
  -- 3 valores, no bool
  obligatoriedad  text NOT NULL CHECK (obligatoriedad IN ('obligatoria', 'opcional', 'condicional')),
  -- Destinatario del entregable
  se_entrega_a    text,
  -- Validación de adjunto
  requiere_archivo boolean NOT NULL DEFAULT false,
  formato_archivo text,
  activa          boolean NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  deleted_at      timestamptz
);

CREATE INDEX dilesa_plantilla_proyecto_tareas_empresa_idx
  ON dilesa.plantilla_proyecto_tareas (empresa_id) WHERE deleted_at IS NULL;
CREATE INDEX dilesa_plantilla_proyecto_tareas_aplicacion_idx
  ON dilesa.plantilla_proyecto_tareas (aplicacion) WHERE deleted_at IS NULL AND activa;

CREATE TRIGGER dilesa_plantilla_proyecto_tareas_updated_at
  BEFORE UPDATE ON dilesa.plantilla_proyecto_tareas
  FOR EACH ROW EXECUTE FUNCTION core.fn_set_updated_at();

ALTER TABLE dilesa.plantilla_proyecto_tareas ENABLE ROW LEVEL SECURITY;

-- Catálogo: globales (empresa_id NULL) visibles a todos; específicas
-- por empresa siguen RLS canónica.
CREATE POLICY plantilla_proyecto_tareas_select ON dilesa.plantilla_proyecto_tareas
  FOR SELECT TO authenticated
  USING (
    deleted_at IS NULL
    AND (empresa_id IS NULL OR core.fn_has_empresa(empresa_id) OR core.fn_is_admin())
  );

CREATE POLICY plantilla_proyecto_tareas_write ON dilesa.plantilla_proyecto_tareas
  FOR ALL TO authenticated
  USING (empresa_id IS NULL OR core.fn_has_empresa(empresa_id) OR core.fn_is_admin())
  WITH CHECK (empresa_id IS NULL OR core.fn_has_empresa(empresa_id) OR core.fn_is_admin());

COMMENT ON TABLE dilesa.plantilla_proyecto_tareas IS
  'Catálogo canónico de tareas para proyectos DILESA (anteproyecto, desarrollo o ambas). 35 tareas seed importadas de Coda + gate + cotizaciones. Sprint 3 de dilesa-proyectos-anteproyectos.';

-- ════════════════════════════════════════════════════════════════════════════
-- 2) Dependencias del catálogo (N:M)
-- ════════════════════════════════════════════════════════════════════════════
CREATE TABLE dilesa.plantilla_proyecto_tareas_dependencias (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plantilla_tarea_id          uuid NOT NULL REFERENCES dilesa.plantilla_proyecto_tareas(id) ON DELETE CASCADE,
  depende_de_plantilla_tarea_id uuid NOT NULL REFERENCES dilesa.plantilla_proyecto_tareas(id) ON DELETE CASCADE,
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (plantilla_tarea_id, depende_de_plantilla_tarea_id),
  CHECK (plantilla_tarea_id <> depende_de_plantilla_tarea_id)
);

CREATE INDEX dilesa_plantilla_proyecto_tareas_dep_padre_idx
  ON dilesa.plantilla_proyecto_tareas_dependencias (plantilla_tarea_id);
CREATE INDEX dilesa_plantilla_proyecto_tareas_dep_hijo_idx
  ON dilesa.plantilla_proyecto_tareas_dependencias (depende_de_plantilla_tarea_id);

ALTER TABLE dilesa.plantilla_proyecto_tareas_dependencias ENABLE ROW LEVEL SECURITY;

CREATE POLICY plantilla_proyecto_tareas_dep_select ON dilesa.plantilla_proyecto_tareas_dependencias
  FOR SELECT TO authenticated USING (true);

CREATE POLICY plantilla_proyecto_tareas_dep_write ON dilesa.plantilla_proyecto_tareas_dependencias
  FOR ALL TO authenticated
  USING (core.fn_is_admin())
  WITH CHECK (core.fn_is_admin());

-- ════════════════════════════════════════════════════════════════════════════
-- 3) Dependencias de instancias (N:M sobre proyecto_tareas)
-- ════════════════════════════════════════════════════════════════════════════
CREATE TABLE dilesa.proyecto_tareas_dependencias (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tarea_id        uuid NOT NULL REFERENCES dilesa.proyecto_tareas(id) ON DELETE CASCADE,
  depende_de_tarea_id uuid NOT NULL REFERENCES dilesa.proyecto_tareas(id) ON DELETE CASCADE,
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tarea_id, depende_de_tarea_id),
  CHECK (tarea_id <> depende_de_tarea_id)
);

CREATE INDEX dilesa_proyecto_tareas_dep_padre_idx
  ON dilesa.proyecto_tareas_dependencias (tarea_id);
CREATE INDEX dilesa_proyecto_tareas_dep_hijo_idx
  ON dilesa.proyecto_tareas_dependencias (depende_de_tarea_id);

ALTER TABLE dilesa.proyecto_tareas_dependencias ENABLE ROW LEVEL SECURITY;

-- RLS vía JOIN al padre proyecto_tareas (que ya tiene su política).
CREATE POLICY proyecto_tareas_dep_select ON dilesa.proyecto_tareas_dependencias
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM dilesa.proyecto_tareas t
      WHERE t.id = proyecto_tareas_dependencias.tarea_id
        AND t.deleted_at IS NULL
        AND (core.fn_has_empresa(t.empresa_id) OR core.fn_is_admin())
    )
  );

CREATE POLICY proyecto_tareas_dep_write ON dilesa.proyecto_tareas_dependencias
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM dilesa.proyecto_tareas t
      WHERE t.id = proyecto_tareas_dependencias.tarea_id
        AND (core.fn_has_empresa(t.empresa_id) OR core.fn_is_admin())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM dilesa.proyecto_tareas t
      WHERE t.id = proyecto_tareas_dependencias.tarea_id
        AND (core.fn_has_empresa(t.empresa_id) OR core.fn_is_admin())
    )
  );

-- ════════════════════════════════════════════════════════════════════════════
-- 4) ALTER dilesa.proyecto_tareas — columnas snapshot del catálogo +
--    fechas objetivo + resultado + estado nuevo `bloqueada`.
-- ════════════════════════════════════════════════════════════════════════════
ALTER TABLE dilesa.proyecto_tareas
  ADD COLUMN plantilla_tarea_id uuid REFERENCES dilesa.plantilla_proyecto_tareas(id) ON DELETE SET NULL,
  ADD COLUMN tipo_snapshot text,
  ADD COLUMN subtipo_snapshot text,
  ADD COLUMN entidad_responsable_snapshot text,
  ADD COLUMN aplicacion_snapshot text,
  ADD COLUMN obligatoriedad_snapshot text,
  ADD COLUMN se_entrega_a_snapshot text,
  ADD COLUMN requiere_archivo_snapshot boolean,
  ADD COLUMN formato_archivo_snapshot text,
  ADD COLUMN duracion_dias_habiles_snapshot integer,
  ADD COLUMN fecha_objetivo_inicio date,
  ADD COLUMN fecha_objetivo_fin date,
  ADD COLUMN resultado_monto numeric(16, 2),
  ADD COLUMN resultado_documento_url text;

-- Estado: agregar 'bloqueada' al CHECK existente sin tocar los demás.
ALTER TABLE dilesa.proyecto_tareas DROP CONSTRAINT proyecto_tareas_estado_check;
ALTER TABLE dilesa.proyecto_tareas ADD CONSTRAINT proyecto_tareas_estado_check
  CHECK (estado IN ('pendiente', 'bloqueada', 'en_curso', 'completada', 'cancelada'));

CREATE INDEX dilesa_proyecto_tareas_plantilla_idx
  ON dilesa.proyecto_tareas (plantilla_tarea_id) WHERE deleted_at IS NULL;

COMMENT ON COLUMN dilesa.proyecto_tareas.plantilla_tarea_id IS
  'FK al catálogo. NULL para tareas ad-hoc.';
COMMENT ON COLUMN dilesa.proyecto_tareas.aplicacion_snapshot IS
  'Snapshot del campo aplicacion del catálogo al instanciar. Preserva historia si el catálogo cambia.';

-- ════════════════════════════════════════════════════════════════════════════
-- 5) Presupuesto de partidas (una sola tabla con estado discriminator)
-- ════════════════════════════════════════════════════════════════════════════
CREATE TABLE dilesa.proyecto_presupuesto_partidas (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id      uuid NOT NULL REFERENCES core.empresas(id) ON DELETE RESTRICT,
  proyecto_id     uuid NOT NULL REFERENCES dilesa.proyectos(id) ON DELETE CASCADE,
  -- Si la partida nace de una tarea de cotización
  tarea_origen_id uuid REFERENCES dilesa.proyecto_tareas(id) ON DELETE SET NULL,
  partida         text NOT NULL,
  descripcion     text,
  unidad          text,
  cantidad        numeric(14, 4),
  monto_estimado  numeric(16, 2),
  -- Snapshot al pasar de 'autorizada' a 'planeada' (promoción / aprobación)
  monto_aprobado  numeric(16, 2),
  -- Se va llenando con la ejecución real
  monto_ejercido  numeric(16, 2) NOT NULL DEFAULT 0,
  fuente          text CHECK (fuente IN ('cotizacion', 'referencia', 'proveedor', 'estimado_interno')),
  proveedor_persona_id uuid REFERENCES erp.personas(id) ON DELETE SET NULL,
  estado          text NOT NULL DEFAULT 'preliminar'
    CHECK (estado IN ('preliminar', 'autorizada', 'planeada', 'en_ejercicio', 'cerrada')),
  autorizado_at   timestamptz,
  autorizado_por  uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  notas           text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  deleted_at      timestamptz
);

CREATE INDEX dilesa_proyecto_presupuesto_partidas_proyecto_idx
  ON dilesa.proyecto_presupuesto_partidas (proyecto_id) WHERE deleted_at IS NULL;
CREATE INDEX dilesa_proyecto_presupuesto_partidas_estado_idx
  ON dilesa.proyecto_presupuesto_partidas (empresa_id, estado) WHERE deleted_at IS NULL;
CREATE INDEX dilesa_proyecto_presupuesto_partidas_tarea_idx
  ON dilesa.proyecto_presupuesto_partidas (tarea_origen_id) WHERE deleted_at IS NULL;

CREATE TRIGGER dilesa_proyecto_presupuesto_partidas_updated_at
  BEFORE UPDATE ON dilesa.proyecto_presupuesto_partidas
  FOR EACH ROW EXECUTE FUNCTION core.fn_set_updated_at();

ALTER TABLE dilesa.proyecto_presupuesto_partidas ENABLE ROW LEVEL SECURITY;

CREATE POLICY proyecto_presupuesto_partidas_select ON dilesa.proyecto_presupuesto_partidas
  FOR SELECT TO authenticated
  USING (deleted_at IS NULL AND (core.fn_has_empresa(empresa_id) OR core.fn_is_admin()));

CREATE POLICY proyecto_presupuesto_partidas_write ON dilesa.proyecto_presupuesto_partidas
  FOR ALL TO authenticated
  USING (core.fn_has_empresa(empresa_id) OR core.fn_is_admin())
  WITH CHECK (core.fn_has_empresa(empresa_id) OR core.fn_is_admin());

COMMENT ON TABLE dilesa.proyecto_presupuesto_partidas IS
  'Partidas de presupuesto por proyecto (anteproyecto preliminar → desarrollo aprobado → ejecución). Estado discriminator preserva la trayectoria inline. Sprint 3 de dilesa-proyectos-anteproyectos.';

-- ════════════════════════════════════════════════════════════════════════════
-- 6) Seed canónico — 35 tareas en plantilla_proyecto_tareas (global)
-- ════════════════════════════════════════════════════════════════════════════
INSERT INTO dilesa.plantilla_proyecto_tareas
  (nombre, aplicacion, tipo, subtipo, duracion_dias_habiles, orden_default, entidad_responsable, obligatoriedad, requiere_archivo, formato_archivo)
VALUES
  -- ANTEPROYECTO (15: 12 Coda + 1 gate + 3 cotizaciones)
  ('Escritura/Contrato Compraventa del Terreno',           'anteproyecto', 'Legal',         'Propiedad',    15,  1, 'Notaría / Registro Público',       'obligatoria', true,  'PDF'),
  ('Levantamiento Topográfico y Curvas de Nivel',          'anteproyecto', 'Estudio',       'Técnico',       5,  2, 'Topógrafo',                        'obligatoria', true,  'DWG / PDF'),
  ('Elaboración de Anteproyecto',                          'anteproyecto', 'Plano',         'Urbanismo',    10,  3, 'Interno',                          'obligatoria', true,  'DWG / PDF'),
  ('Estudio de Factibilidad Económica / Corrida Financiera','anteproyecto','Estudio',      'Financiero',    7,  4, 'Finanzas / Dirección / Consultor', 'obligatoria', true,  'PDF'),
  ('Mecánica de Suelos',                                   'anteproyecto', 'Estudio',       'Técnico',      10,  5, 'Laboratorio',                      'obligatoria', true,  'PDF'),
  ('Estudio Hidrológico',                                  'anteproyecto', 'Estudio',       'Técnico',      10,  6, 'UANL / Consultor',                 'opcional',    true,  'PDF'),
  ('Factibilidad de Uso de Suelo',                         'anteproyecto', 'Factibilidad',  'Urbanismo',    15,  7, 'Municipio',                        'obligatoria', true,  'PDF'),
  ('Factibilidad de Agua Potable y Drenaje',               'anteproyecto', 'Factibilidad',  'Servicios',    15,  8, 'SIMAS',                            'obligatoria', true,  'PDF'),
  ('Factibilidad de Energía Eléctrica',                    'anteproyecto', 'Factibilidad',  'Servicios',    15,  9, 'CFE',                              'obligatoria', true,  'PDF'),
  ('Factibilidad de Servicios Complementarios',            'anteproyecto', 'Factibilidad',  'Servicios',    10, 10, 'Proveedores',                      'opcional',    true,  'PDF'),
  ('Cambio de Uso de Suelo',                               'anteproyecto', 'Trámite',       'Urbanismo',    20, 11, 'Municipio',                        'condicional', true,  'PDF'),
  ('Aprobación Consejo de Desarrollo Urbano',              'anteproyecto', 'Trámite',       'Urbanismo',    20, 12, 'Municipio',                        'obligatoria', true,  'PDF'),
  ('Cotización de Urbanización',                           'anteproyecto', 'Cotización',    'Urbanismo',    15, 13, 'Contratistas Urbanización',        'obligatoria', true,  'PDF'),
  ('Cotización de Construcción de Vivienda',               'anteproyecto', 'Cotización',    'Construcción', 15, 14, 'Contratistas Vivienda',            'obligatoria', true,  'PDF'),
  ('Cotización de Comercialización',                       'anteproyecto', 'Cotización',    'Comercial',    10, 15, 'Marketing / Ventas',               'opcional',    true,  'PDF'),
  ('Aprobación de Comité de Inversión',                    'anteproyecto', 'Decisión',      'Financiero',    7, 16, 'Comité de Inversión / Dirección',  'obligatoria', true,  'PDF'),

  -- DESARROLLO (19, todas de Coda)
  ('Estudio de Impacto Ambiental',                         'desarrollo',   'Estudio',       'Ambiental',    20, 17, 'Tramitador / Consultor',           'obligatoria', true,  'PDF'),
  ('Manifestación de Impacto Ambiental (MIA)',             'desarrollo',   'Trámite',       'Ambiental',    30, 18, 'Autoridad Ambiental',              'obligatoria', true,  'PDF'),
  ('Licencia de Fraccionamiento',                          'desarrollo',   'Licencia',      'Urbanismo',    20, 19, 'Municipio',                        'obligatoria', true,  'PDF'),
  ('Plano Oficial Aprobado',                               'desarrollo',   'Plano',         'Urbanismo',    10, 20, 'Municipio',                        'obligatoria', true,  'DWG / PDF'),
  ('Proyecto de Rasantes y Plataformas',                   'desarrollo',   'Proyecto',      'Topografía',   15, 21, 'Topógrafo / Proyectos',            'obligatoria', true,  'DWG / PDF'),
  ('Proyecto Hidrosanitario Aprobado',                     'desarrollo',   'Proyecto',      'Servicios',    15, 22, 'SIMAS',                            'obligatoria', true,  'PDF / DWG'),
  ('Proyecto Eléctrico Aprobado',                          'desarrollo',   'Proyecto',      'Servicios',    15, 23, 'CFE',                              'obligatoria', true,  'PDF / DWG'),
  ('Certificación de Números Oficiales',                   'desarrollo',   'Certificación', 'Urbanismo',    10, 24, 'Municipio',                        'obligatoria', true,  'PDF'),
  ('Certificación de Alineamiento Residencial',            'desarrollo',   'Certificación', 'Urbanismo',    10, 25, 'Municipio',                        'obligatoria', true,  'PDF'),
  ('Declaración Unilateral de Voluntades / Escrituración', 'desarrollo',   'Legal',         'Urbanismo',    20, 26, 'Notaría',                          'obligatoria', true,  'PDF'),
  ('Registro ante Catastro',                               'desarrollo',   'Registro',      'Legal',        10, 27, 'Notaría / Municipio',              'obligatoria', true,  'PDF'),
  ('Registro Público de la Propiedad (RPP)',               'desarrollo',   'Registro',      'Legal',        15, 28, 'Notaría',                          'obligatoria', true,  'PDF'),
  ('Permiso de Movimiento de Tierras',                     'desarrollo',   'Permiso',       'Construcción', 10, 29, 'Municipio',                        'opcional',    true,  'PDF'),
  ('Permiso de Trazo y Nivelación',                        'desarrollo',   'Permiso',       'Construcción', 10, 30, 'Municipio',                        'opcional',    true,  'PDF'),
  ('Constancia de No Adeudo SIMAS',                        'desarrollo',   'Constancia',    'Servicios',     5, 31, 'SIMAS',                            'opcional',    true,  'PDF'),
  ('Constancia de No Adeudo CFE',                          'desarrollo',   'Constancia',    'Servicios',     5, 32, 'CFE',                              'opcional',    true,  'PDF'),
  ('Constancia de Protección Civil',                       'desarrollo',   'Certificación', 'Legal',        10, 33, 'Protección Civil',                 'opcional',    true,  'PDF'),
  ('Acta de Terminación de Obra de Urbanización',          'desarrollo',   'Acta',          'Construcción', 15, 34, 'Municipio',                        'obligatoria', true,  'PDF'),
  ('Entrega-Recepción de Fraccionamiento',                 'desarrollo',   'Acta',          'Urbanismo',    10, 35, 'Municipio',                        'obligatoria', true,  'PDF');

-- ════════════════════════════════════════════════════════════════════════════
-- 7) Seed dependencias — clonadas de Coda (27 + ajustes para los 4 nuevos)
-- ════════════════════════════════════════════════════════════════════════════
-- Las relaciones se resuelven por `nombre` (cada tarea seed tiene
-- nombre único en su orden). Usamos un CTE temporal con (orden, id).

WITH t AS (
  SELECT orden_default AS ord, id FROM dilesa.plantilla_proyecto_tareas
  WHERE empresa_id IS NULL AND deleted_at IS NULL
)
INSERT INTO dilesa.plantilla_proyecto_tareas_dependencias (plantilla_tarea_id, depende_de_plantilla_tarea_id)
SELECT a.id, b.id
FROM (VALUES
  -- ANTEPROYECTO
  ( 2,  1),   -- Topografía depende de Escritura
  ( 3,  2),   -- Anteproyecto depende de Topografía
  ( 4,  3),   -- Factibilidad Económica depende de Anteproyecto
  ( 5,  2),   -- Mecánica Suelos depende de Topografía
  ( 6,  5),   -- Hidrológico depende de Mecánica Suelos
  ( 7,  1),   -- Uso de Suelo depende de Escritura
  ( 8,  1),   -- Agua/Drenaje depende de Escritura
  ( 9,  1),   -- Energía depende de Escritura
  (10,  1),   -- Servicios complementarios depende de Escritura
  (11,  7),   -- Cambio Uso de Suelo depende de Factibilidad Uso de Suelo
  (12,  7),   -- Consejo Urb depende de Factibilidad Uso de Suelo
  -- Cotizaciones de obra dependen de Anteproyecto + alimentan Factibilidad Econ
  (13,  3),   -- Cotización Urb depende de Anteproyecto
  (14,  3),   -- Cotización Construcción depende de Anteproyecto
  (15,  3),   -- Cotización Comercialización depende de Anteproyecto
  ( 4, 13),   -- Factibilidad Econ depende también de Cotización Urb
  ( 4, 14),   -- Factibilidad Econ depende también de Cotización Construcción
  -- Comité depende de los obligatorios principales
  (16,  4),   -- Comité depende de Factibilidad Económica
  (16,  7),   -- Comité depende de Factibilidad Uso de Suelo
  (16,  8),   -- Comité depende de Factibilidad Agua
  (16,  9),   -- Comité depende de Factibilidad Energía
  (16, 12),   -- Comité depende de Consejo Urbano

  -- DESARROLLO (importadas de Coda)
  (17, 16),   -- EIA depende de Comité (gate)
  (18, 17),   -- MIA depende de EIA
  (19, 18),   -- Licencia Fraccionamiento depende de MIA
  (20, 19),   -- Plano Oficial depende de Licencia
  (21, 20),   -- Rasantes depende de Plano Oficial
  (22, 19),   -- Hidrosanitario depende de Licencia
  (23, 19),   -- Eléctrico depende de Licencia
  (24, 19),   -- # Oficiales depende de Licencia
  (25, 24),   -- Alineamiento depende de # Oficiales
  (26, 19),   -- DUV depende de Licencia
  (27, 26),   -- Catastro depende de DUV
  (28, 26),   -- RPP depende de DUV
  (29, 21),   -- Movimiento Tierras depende de Rasantes
  (30, 21),   -- Trazo y Nivelación depende de Rasantes
  (31, 22),   -- Constancia SIMAS depende de Hidrosanitario
  (32, 23),   -- Constancia CFE depende de Eléctrico
  (33, 19),   -- Protección Civil depende de Licencia
  (34, 22),   -- Acta Terminación depende de Hidrosanitario
  (34, 23),   -- Acta Terminación depende de Eléctrico
  (35, 34)    -- Entrega-Recepción depende de Acta Terminación
) AS d(ord_a, ord_b)
JOIN t a ON a.ord = d.ord_a
JOIN t b ON b.ord = d.ord_b;

NOTIFY pgrst, 'reload schema';

COMMIT;
