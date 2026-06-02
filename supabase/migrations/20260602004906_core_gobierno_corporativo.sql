-- ============================================================================
-- gobierno-corporativo · Sprint 1 (schema DB-puro)
-- Iniciativa: gobierno-corporativo. Golden: DILESA.
--
-- BSOP como repositorio vivo del gobierno corporativo:
--   · cuadro accionario (core.empresa_socios — llena el tab placeholder),
--   · reglas de gobierno (config, mayorías por decisión, consejeros, mandatos),
--   · actas de asamblea (header + acuerdos + voto por socio + asistentes).
--
-- RBAC admin-only en la app (host de tabs <RequireAccess adminOnly>); RLS de
-- todas formas canónica: SELECT/INSERT a miembros de la empresa o admin,
-- UPDATE/DELETE solo admin (audit trail estricto — las actas no se editan a la
-- ligera). PDFs reutilizan erp.documentos (FK cross-schema ON DELETE SET NULL;
-- el app-layer hidrata con 2da query, sin embedding PostgREST).
--
-- Refinamientos vs. propuesta original, derivados de leer el Reglamento de
-- Gobierno DILESA (ago-2021):
--   · empresa_socios.familia        — familia controladora (Chavarría Cruz / …)
--   · gobierno_config.dividendo_*   — política de dividendos ($12M MXN/año)
--   · gobierno_config.consejo_*     — 12 sesiones/año, máx 8 miembros
--   · gobierno_consejeros.vitalicio — consejeros fundadores vitalicios
--   · gobierno_consejeros.organo    — consejo | comite_directivo | asamblea
--   · gobierno_mayorias.organo      — agrega 'comite_directivo'
-- ============================================================================
BEGIN;

-- 1) Cuadro accionario — el "quién". Llena el tab placeholder existente.
CREATE TABLE IF NOT EXISTS core.empresa_socios (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id       uuid NOT NULL REFERENCES core.empresas(id) ON DELETE CASCADE,
  nombre           text NOT NULL,                          -- "Nigropetense Inmobiliaria S.A.", "Inmobiliaria CHC", "Gesan Inmobiliaria del Bravo, SA de CV"
  familia          text,                                   -- familia controladora: "Santos de los Santos", "Chavarría Cruz", "Santos Diego"
  tipo             text NOT NULL DEFAULT 'entidad'
                     CHECK (tipo IN ('familia', 'persona', 'entidad')),
  socio_empresa_id uuid REFERENCES core.empresas(id) ON DELETE SET NULL,  -- si el socio ES empresa BSOP (Nigropetense)
  socio_persona_id uuid,                                   -- → erp.personas (FK suave cross-schema)
  porcentaje       numeric(7, 4) NOT NULL CHECK (porcentaje >= 0 AND porcentaje <= 100),
  orden            integer NOT NULL DEFAULT 1,
  activo           boolean NOT NULL DEFAULT true,
  notas            text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz
);
CREATE INDEX IF NOT EXISTS idx_empresa_socios_empresa ON core.empresa_socios (empresa_id) WHERE activo;

-- 2) Config de gobierno — 1 fila por empresa.
CREATE TABLE IF NOT EXISTS core.gobierno_config (
  empresa_id              uuid PRIMARY KEY REFERENCES core.empresas(id) ON DELETE CASCADE,
  reglamento_documento_id uuid,                            -- → erp.documentos (PDF del reglamento vigente)
  reglamento_fecha        date,                            -- ago-2021 en DILESA
  mandato_meses_default   integer,                         -- periodo de mandato estándar (DILESA: 36)
  consejo_max_miembros    integer,                         -- DILESA: 8
  consejo_sesiones_por_anio integer,                       -- DILESA: 12
  dividendo_anual_monto   numeric(14, 2),                  -- DILESA: 12,000,000
  dividendo_moneda        text NOT NULL DEFAULT 'MXN',
  tanto_aplica            boolean NOT NULL DEFAULT false,  -- derecho del tanto sí/no
  tanto_plazo_dias        integer,                         -- plazo para ejercerlo (si está definido)
  tanto_orden_prelacion   text,                            -- a quién se ofrece primero (orden de prelación)
  notas                   text,
  updated_at              timestamptz NOT NULL DEFAULT now(),
  updated_by              uuid REFERENCES core.usuarios(id)
);

-- 3) Mayorías por tipo de decisión.
CREATE TABLE IF NOT EXISTS core.gobierno_mayorias (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id    uuid NOT NULL REFERENCES core.empresas(id) ON DELETE CASCADE,
  tipo_decision text NOT NULL,                             -- "Elección de consejeros", "Cese de consejero", "Escisión"…
  organo        text NOT NULL CHECK (organo IN ('asamblea', 'consejo', 'comite_directivo')),
  quorum_pct    numeric(5, 2) CHECK (quorum_pct >= 0 AND quorum_pct <= 100),
  umbral_pct    numeric(5, 2) NOT NULL CHECK (umbral_pct > 0 AND umbral_pct <= 100),
  orden         integer NOT NULL DEFAULT 1,
  notas         text,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_gobierno_mayorias_empresa ON core.gobierno_mayorias (empresa_id);

-- 4) Consejeros (y miembros de órganos) — quién ostenta el voto + mandato.
CREATE TABLE IF NOT EXISTS core.gobierno_consejeros (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id     uuid NOT NULL REFERENCES core.empresas(id) ON DELETE CASCADE,
  organo         text NOT NULL DEFAULT 'consejo'
                   CHECK (organo IN ('consejo', 'comite_directivo', 'asamblea')),
  socio_id       uuid REFERENCES core.empresa_socios(id) ON DELETE SET NULL,  -- a qué socio/familia representa
  persona_id     uuid,                                     -- → erp.personas (FK suave cross-schema)
  nombre         text NOT NULL,                            -- snapshot legible del miembro
  cargo          text NOT NULL DEFAULT 'propietario'
                   CHECK (cargo IN ('presidente', 'secretario', 'propietario', 'suplente', 'independiente', 'miembro')),
  ostenta_voto   boolean NOT NULL DEFAULT true,            -- propietario que representa el voto de la sociedad
  vitalicio      boolean NOT NULL DEFAULT false,           -- consejero fundador vitalicio (Gerardo / Urbano)
  periodo_inicio date,
  periodo_fin    date,
  activo         boolean NOT NULL DEFAULT true,
  notas          text,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz
);
CREATE INDEX IF NOT EXISTS idx_gobierno_consejeros_empresa ON core.gobierno_consejeros (empresa_id) WHERE activo;

-- 5) Actas de asamblea — header.
CREATE TABLE IF NOT EXISTS core.gobierno_actas (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id            uuid NOT NULL REFERENCES core.empresas(id) ON DELETE CASCADE,
  folio                 text,                               -- nº de acta ("1", "32"…)
  tipo                  text NOT NULL CHECK (tipo IN ('ordinaria', 'extraordinaria')),
  fecha                 date NOT NULL,
  lugar                 text,
  asunto                text,                               -- concepto/tema principal del acta
  quorum_pct            numeric(5, 2),                      -- % representado presente
  orden_dia             jsonb,                              -- ["1. …", "2. …"]
  -- protocolización notarial
  protocolizada         boolean NOT NULL DEFAULT false,
  numero_escritura      text,
  notario               text,
  fecha_protocolizacion date,
  registro_publico      text,                               -- folio mercantil / inscripción
  documento_id          uuid,                               -- → erp.documentos (PDF del acta)
  estado                text NOT NULL DEFAULT 'borrador'
                          CHECK (estado IN ('borrador', 'firmada', 'protocolizada')),
  notas                 text,
  created_at            timestamptz NOT NULL DEFAULT now(),
  created_by            uuid REFERENCES core.usuarios(id),
  updated_at            timestamptz
);
CREATE INDEX IF NOT EXISTS idx_gobierno_actas_empresa_fecha ON core.gobierno_actas (empresa_id, fecha DESC);

-- 6) Acuerdos por acta.
CREATE TABLE IF NOT EXISTS core.gobierno_acta_acuerdos (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  acta_id    uuid NOT NULL REFERENCES core.gobierno_actas(id) ON DELETE CASCADE,
  empresa_id uuid NOT NULL REFERENCES core.empresas(id) ON DELETE CASCADE,
  orden      integer NOT NULL DEFAULT 1,
  punto      text NOT NULL,                                 -- texto del acuerdo
  resultado  text NOT NULL DEFAULT 'aprobado'
               CHECK (resultado IN ('aprobado', 'rechazado', 'aplazado')),
  notas      text
);
CREATE INDEX IF NOT EXISTS idx_gobierno_acta_acuerdos_acta ON core.gobierno_acta_acuerdos (acta_id);

-- 7) Voto por socio por acuerdo (auditable — D2).
CREATE TABLE IF NOT EXISTS core.gobierno_acta_votos (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  acuerdo_id       uuid NOT NULL REFERENCES core.gobierno_acta_acuerdos(id) ON DELETE CASCADE,
  empresa_id       uuid NOT NULL REFERENCES core.empresas(id) ON DELETE CASCADE,
  socio_id         uuid REFERENCES core.empresa_socios(id) ON DELETE SET NULL,
  sentido          text NOT NULL CHECK (sentido IN ('favor', 'contra', 'abstencion')),
  representado_por text,                                    -- consejero/apoderado que emitió el voto
  UNIQUE (acuerdo_id, socio_id)
);
CREATE INDEX IF NOT EXISTS idx_gobierno_acta_votos_acuerdo ON core.gobierno_acta_votos (acuerdo_id);

-- 8) Asistentes / representación (quórum + % representado).
CREATE TABLE IF NOT EXISTS core.gobierno_acta_asistentes (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  acta_id          uuid NOT NULL REFERENCES core.gobierno_actas(id) ON DELETE CASCADE,
  empresa_id       uuid NOT NULL REFERENCES core.empresas(id) ON DELETE CASCADE,
  socio_id         uuid REFERENCES core.empresa_socios(id) ON DELETE SET NULL,
  presente         boolean NOT NULL DEFAULT true,
  representado_por text,                                    -- apoderado, si no asistió en persona
  porcentaje       numeric(7, 4),                           -- snapshot del % al momento del acta
  UNIQUE (acta_id, socio_id)
);
CREATE INDEX IF NOT EXISTS idx_gobierno_acta_asistentes_acta ON core.gobierno_acta_asistentes (acta_id);

-- ─── RLS canónica para las 8 tablas (todas tienen columna empresa_id) ────────
-- SELECT/INSERT: miembros de la empresa o admin. UPDATE/DELETE: solo admin.
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'empresa_socios', 'gobierno_config', 'gobierno_mayorias', 'gobierno_consejeros',
    'gobierno_actas', 'gobierno_acta_acuerdos', 'gobierno_acta_votos', 'gobierno_acta_asistentes'
  ] LOOP
    EXECUTE format('ALTER TABLE core.%I ENABLE ROW LEVEL SECURITY', t);

    EXECUTE format('DROP POLICY IF EXISTS %I_select ON core.%I', t, t);
    EXECUTE format(
      'CREATE POLICY %I_select ON core.%I FOR SELECT TO authenticated '
      'USING (core.fn_has_empresa(empresa_id) OR core.fn_is_admin())', t, t);

    EXECUTE format('DROP POLICY IF EXISTS %I_insert ON core.%I', t, t);
    EXECUTE format(
      'CREATE POLICY %I_insert ON core.%I FOR INSERT TO authenticated '
      'WITH CHECK (core.fn_has_empresa(empresa_id) OR core.fn_is_admin())', t, t);

    EXECUTE format('DROP POLICY IF EXISTS %I_update ON core.%I', t, t);
    EXECUTE format(
      'CREATE POLICY %I_update ON core.%I FOR UPDATE TO authenticated '
      'USING (core.fn_is_admin()) WITH CHECK (core.fn_is_admin())', t, t);

    EXECUTE format('DROP POLICY IF EXISTS %I_delete ON core.%I', t, t);
    EXECUTE format(
      'CREATE POLICY %I_delete ON core.%I FOR DELETE TO authenticated '
      'USING (core.fn_is_admin())', t, t);
  END LOOP;
END $$;

-- ─── Reload PostgREST ─────────────────────────────────────────────────────
NOTIFY pgrst, 'reload schema';

COMMIT;
