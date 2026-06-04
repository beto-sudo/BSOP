-- ╭──────────────────────────────────────────────────────────────────╮
-- │  20260604190000_erp_conceptos_compra                               │
-- │                                                                    │
-- │  Catálogo jerárquico de conceptos de compra (obra). Sprint 0 de    │
-- │  la iniciativa `dilesa-compras`. Ver docs/adr/040.                 │
-- │                                                                    │
-- │    erp.conceptos_compra — 3 niveles vía padre_id self-FK:          │
-- │      etapa → capitulo → concepto. codigo jerárquico legible.       │
-- │                                                                    │
-- │  tipo_insumo (MO/material/maquinaria/…) NO vive aquí: un concepto  │
-- │  se compra en varios insumos a la vez. Es atributo de la partida   │
-- │  presupuestal y de la línea de compra (Sprint 1). ADR-040 §2.      │
-- │                                                                    │
-- │  Seed DILESA = normalización de los 93 conceptos de                │
-- │  dilesa.obra_presupuesto (taller con Beto 2026-06-04). Catálogo    │
-- │  solo de obra; el gasto suelto va sin concepto (ADR-040 §3).       │
-- ╰──────────────────────────────────────────────────────────────────╯

BEGIN;

-- ─── 1. Tabla ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS erp.conceptos_compra (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL REFERENCES core.empresas (id),
  padre_id uuid REFERENCES erp.conceptos_compra (id),
  nivel text NOT NULL CHECK (nivel IN ('etapa', 'capitulo', 'concepto')),
  codigo text NOT NULL,
  nombre text NOT NULL,
  orden integer NOT NULL DEFAULT 0,
  activo boolean NOT NULL DEFAULT true,
  notas text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  UNIQUE (empresa_id, codigo)
);

COMMENT ON TABLE erp.conceptos_compra IS
  'Catálogo jerárquico de conceptos de compra de obra (etapa→capitulo→concepto). tipo_insumo no vive aquí (es atributo de la partida/línea). ADR-040.';
COMMENT ON COLUMN erp.conceptos_compra.codigo IS
  'Código jerárquico legible con padding 2-díg (ej. 2, 2.03, 2.03.01). El padre se deriva quitando el último segmento.';
COMMENT ON COLUMN erp.conceptos_compra.nivel IS
  'etapa | capitulo | concepto. Solo nivel=concepto es ligable desde una partida/línea de compra.';

CREATE INDEX IF NOT EXISTS conceptos_compra_empresa_idx
  ON erp.conceptos_compra (empresa_id, codigo);
CREATE INDEX IF NOT EXISTS conceptos_compra_padre_idx
  ON erp.conceptos_compra (padre_id);

-- ─── 2. RLS (lectura para miembros; escritura admin-only) ─────────────

ALTER TABLE erp.conceptos_compra ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='erp' AND tablename='conceptos_compra' AND policyname='conceptos_compra_select') THEN
    CREATE POLICY conceptos_compra_select ON erp.conceptos_compra FOR SELECT TO authenticated
      USING (core.fn_has_empresa(empresa_id) OR core.fn_is_admin());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='erp' AND tablename='conceptos_compra' AND policyname='conceptos_compra_insert') THEN
    CREATE POLICY conceptos_compra_insert ON erp.conceptos_compra FOR INSERT TO authenticated
      WITH CHECK (core.fn_is_admin());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='erp' AND tablename='conceptos_compra' AND policyname='conceptos_compra_update') THEN
    CREATE POLICY conceptos_compra_update ON erp.conceptos_compra FOR UPDATE TO authenticated
      USING (core.fn_is_admin()) WITH CHECK (core.fn_is_admin());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='erp' AND tablename='conceptos_compra' AND policyname='conceptos_compra_delete') THEN
    CREATE POLICY conceptos_compra_delete ON erp.conceptos_compra FOR DELETE TO authenticated
      USING (core.fn_is_admin());
  END IF;
END $$;

GRANT SELECT, INSERT, UPDATE, DELETE ON erp.conceptos_compra TO authenticated;

-- ─── 3. Seed DILESA (idempotente, robusto a Preview por slug) ─────────
-- Normalización de los 93 conceptos crudos de dilesa.obra_presupuesto.
-- 3 etapas · 18 capítulos · 66 conceptos. orden = ROW_NUMBER por codigo
-- (el padding 2-díg hace que el orden lexicográfico sea el natural).

INSERT INTO erp.conceptos_compra (empresa_id, nivel, codigo, nombre, orden)
SELECT d.id, v.nivel, v.codigo, v.nombre, row_number() OVER (ORDER BY v.codigo)
FROM (SELECT id FROM core.empresas WHERE slug = 'dilesa') d
CROSS JOIN (VALUES
  -- ETAPA 1 · Anteproyecto
  ('etapa',    '1',       'Anteproyecto'),
  ('capitulo', '1.01',    'Topografía y estudios'),
  ('concepto', '1.01.01', 'Levantamiento topográfico y curvas de nivel'),
  ('concepto', '1.01.02', 'Mecánica de suelos'),
  ('concepto', '1.01.03', 'Estudio hidrológico'),
  ('capitulo', '1.02',    'Impacto ambiental'),
  ('concepto', '1.02.01', 'Estudio de impacto ambiental'),
  ('concepto', '1.02.02', 'Dictamen de impacto ambiental'),
  ('capitulo', '1.03',    'Factibilidades y licencias'),
  ('concepto', '1.03.01', 'Factibilidad y trámite de uso de suelo'),
  ('concepto', '1.03.02', 'Factibilidad de agua potable y drenaje'),
  ('concepto', '1.03.03', 'Factibilidad de energía eléctrica'),
  ('concepto', '1.03.04', 'Factibilidad de otros servicios (Telmex, gas, cable)'),
  ('concepto', '1.03.05', 'Licencia para fraccionamiento'),
  ('concepto', '1.03.06', 'Licencia de construcción de viviendas'),
  ('concepto', '1.03.07', 'Subdivisión de terreno'),
  ('capitulo', '1.04',    'Proyectos ejecutivos'),
  ('concepto', '1.04.01', 'Proyecto de drenaje sanitario'),
  ('concepto', '1.04.02', 'Proyecto de agua potable'),
  ('concepto', '1.04.03', 'Proyecto eléctrico'),
  ('concepto', '1.04.04', 'Proyecto de rasantes'),
  ('concepto', '1.04.05', 'Lotificación y relotificación de planos'),
  ('capitulo', '1.05',    'Certificaciones y registros'),
  ('concepto', '1.05.01', 'Certificación de planos'),
  ('concepto', '1.05.02', 'Certificación de números oficiales'),
  ('concepto', '1.05.03', 'Certificación de alineamiento residencial'),
  ('concepto', '1.05.04', 'Declaración unilateral de voluntades'),
  ('concepto', '1.05.05', 'Registro ante Catastro'),
  ('concepto', '1.05.06', 'Registro Público de la Propiedad'),
  ('concepto', '1.05.07', 'Aprobación de Consejo de Desarrollo Urbano'),
  ('concepto', '1.05.08', 'Aportación CFE Distribución'),
  -- ETAPA 2 · Urbanización
  ('etapa',    '2',       'Urbanización'),
  ('capitulo', '2.01',    'Terracerías y vialidades'),
  ('concepto', '2.01.01', 'Trazo y nivelación de vialidades'),
  ('concepto', '2.01.02', 'Trazo de polígono y curvas de nivel'),
  ('concepto', '2.01.03', 'Trazo de manzanas'),
  ('concepto', '2.01.04', 'Limpieza y despalme de vialidades'),
  ('concepto', '2.01.05', 'Movimiento de terracerías (cortes y renivelación)'),
  ('concepto', '2.01.06', 'Escarificado, homogenizado y compactado de vialidades'),
  ('concepto', '2.01.07', 'Suministro de material de banco sub-base (vialidades)'),
  ('concepto', '2.01.08', 'Construcción de terraplén, tendido y compactado (vialidades)'),
  ('concepto', '2.01.09', 'Terracerías y plataformas externas'),
  ('concepto', '2.01.10', 'Trabajos extra de maquinaria (renta)'),
  ('capitulo', '2.02',    'Drenaje sanitario'),
  ('concepto', '2.02.01', 'Red de drenaje sanitario'),
  ('capitulo', '2.03',    'Agua potable'),
  ('concepto', '2.03.01', 'Red de agua potable'),
  ('concepto', '2.03.02', 'Hidrantes (instalación, válvula y caja)'),
  ('concepto', '2.03.03', 'Derechos de interconexión de agua potable'),
  ('concepto', '2.03.04', 'Recepción de instalación por SIMAS'),
  ('capitulo', '2.04',    'Cordones y guarniciones'),
  ('concepto', '2.04.01', 'Cordón guarnición'),
  ('concepto', '2.04.02', 'Obra integral agua-drenaje-cordones (UID por etapas)'),
  ('capitulo', '2.05',    'Electrificación'),
  ('concepto', '2.05.01', 'Electrificación de media y baja tensión y alumbrado público'),
  ('concepto', '2.05.02', 'Electrificación de línea troncal'),
  ('concepto', '2.05.03', 'Electrodos (arreglo 2da y 3era etapa)'),
  ('capitulo', '2.06',    'Pavimentación'),
  ('concepto', '2.06.01', 'Pavimentación'),
  ('capitulo', '2.07',    'Obras de cabecera'),
  ('concepto', '2.07.01', 'Barda perimetral'),
  ('concepto', '2.07.02', 'Caseta de acceso'),
  ('concepto', '2.07.03', 'Control de acceso (portón y puerta peatonal)'),
  ('concepto', '2.07.04', 'Entrada de fraccionamiento (monolito y plaza)'),
  ('concepto', '2.07.05', 'Placita'),
  ('concepto', '2.07.06', 'Banquetas excedentes de áreas verdes y municipales'),
  ('concepto', '2.07.07', 'Fabricación e instalación de nomenclaturas'),
  ('capitulo', '2.08',    'Laboratorio'),
  ('concepto', '2.08.01', 'Pruebas de compactación de urbanización'),
  ('concepto', '2.08.02', 'Pruebas de compactación de plataformas de viviendas'),
  ('capitulo', '2.09',    'Recepciones y entregas'),
  ('concepto', '2.09.01', 'Recepción de dependencia municipal (habitabilidad)'),
  ('concepto', '2.09.02', 'Recepción municipal de alumbrado público'),
  ('concepto', '2.09.03', 'Escrituración de áreas municipales'),
  ('concepto', '2.09.04', 'Entrega al municipio'),
  ('capitulo', '2.10',    'Servicios opcionales'),
  ('concepto', '2.10.01', 'Telmex (ductos y acometidas)'),
  ('concepto', '2.10.02', 'Red de gas natural'),
  -- ETAPA 3 · Construcción (plataformas) — preparación de terreno para casas,
  -- NO la construcción de vivienda (esa va por contratos+estimaciones, ADR-033)
  ('etapa',    '3',       'Construcción (plataformas)'),
  ('capitulo', '3.01',    'Terracerías de plataformas'),
  ('concepto', '3.01.01', 'Trazo y nivelación de plataformas y lotes'),
  ('concepto', '3.01.02', 'Limpieza y despalme de plataformas'),
  ('concepto', '3.01.03', 'Movimiento de terracerías (cortes y renivelación)'),
  ('concepto', '3.01.04', 'Escarificado, homogenizado y compactado de plataformas'),
  ('concepto', '3.01.05', 'Suministro de material de banco sub-base (plataformas)'),
  ('concepto', '3.01.06', 'Construcción de terraplén, tendido y compactado'),
  ('concepto', '3.01.07', 'Trazo de lotes para desplante de viviendas'),
  ('concepto', '3.01.08', 'Trabajos de maquinaria (2da y 3era etapa)'),
  ('capitulo', '3.02',    'Casa muestra'),
  ('concepto', '3.02.01', 'Casa muestra'),
  ('capitulo', '3.03',    'Laboratorio'),
  ('concepto', '3.03.01', 'Pruebas de laboratorio de concretos (casas, banquetas, cordones)')
) AS v(nivel, codigo, nombre)
ON CONFLICT (empresa_id, codigo) DO NOTHING;

-- ─── 4. Resolver jerarquía: padre = código sin el último segmento ─────

UPDATE erp.conceptos_compra c
SET padre_id = p.id
FROM erp.conceptos_compra p
WHERE p.empresa_id = c.empresa_id
  AND c.codigo LIKE '%.%'
  AND p.codigo = regexp_replace(c.codigo, '\.[0-9]+$', '')
  AND c.padre_id IS NULL;

NOTIFY pgrst, 'reload schema';

COMMIT;
