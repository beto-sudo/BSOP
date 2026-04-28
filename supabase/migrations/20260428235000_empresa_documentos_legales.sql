-- Sprint 1 — Iniciativa `empresa-documentos-legales`.
--
-- Crea la tabla intermedia `core.empresa_documentos` que liga documentos
-- legales del módulo Documentos (`erp.documentos`) a empresas con un rol
-- semántico ("acta constitutiva", "poder de representación general",
-- etc). Reemplaza el flujo actual donde la metadata de escrituras se
-- captura a mano como jsonb en `core.empresas.escritura_*` — esos jsonb
-- se mantienen como CACHÉ sincronizado vía trigger DB cuando cambia el
-- documento marcado como `es_default` para los roles consumidos por RH:
--
--   - `acta_constitutiva`           → core.empresas.escritura_constitutiva
--   - `poder_general_administracion`→ core.empresas.escritura_poder
--
-- El validador de RH (`lib/rh/datos-fiscales-empresa.ts`) sigue leyendo
-- del caché — no requiere refactor.
--
-- Decisiones cerradas por Beto al promover la iniciativa
-- (ver docs/planning/empresa-documentos-legales.md):
--   - A1: tabla intermedia con rol (no FKs directas en core.empresas).
--   - A2: jsonb en core.empresas como caché sincronizado por trigger.
--   - B1: roles iniciales fijos extensibles vía CHECK constraint.
--   - B2: múltiples vigentes por rol; uno marcado es_default = true.
--   - F1: solo admin escribe; cualquier miembro de la empresa lee.

BEGIN;

-- ─── Tabla ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS core.empresa_documentos (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id      UUID NOT NULL REFERENCES core.empresas(id) ON DELETE CASCADE,
  documento_id    UUID NOT NULL REFERENCES erp.documentos(id) ON DELETE CASCADE,
  rol             TEXT NOT NULL,
  es_default      BOOLEAN NOT NULL DEFAULT false,
  asignado_por    UUID REFERENCES core.usuarios(id),
  asignado_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  notas           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ
);

COMMENT ON TABLE core.empresa_documentos IS
  'Liga documentos legales (erp.documentos) a empresas con un rol semántico. '
  'Múltiples vigentes por rol; un default por (empresa_id, rol) usado por '
  'flujos automáticos como contratos LFT. Reemplaza la captura manual de '
  'jsonb en core.empresas.escritura_* — esos jsonb se mantienen como caché '
  'sincronizado vía trigger.';

COMMENT ON COLUMN core.empresa_documentos.rol IS
  'Categoría legal del uso del documento. Lista inicial: acta_constitutiva, '
  'acta_reforma, poder_general_administracion, poder_actos_dominio, '
  'poder_pleitos_cobranzas, poder_bancario, representante_legal_imss. '
  'Extensible vía ALTER de empresa_documentos_rol_check.';

COMMENT ON COLUMN core.empresa_documentos.es_default IS
  'Marca el documento estándar para este rol (uno por (empresa_id, rol)). '
  'Los flujos automáticos (alta empleado, contrato LFT, sync de caché) usan '
  'el default. UI permite cambiarlo sin desasignar los demás.';

-- ─── Constraints ──────────────────────────────────────────────────────

-- Un documento no puede estar asignado al mismo rol dos veces para la
-- misma empresa.
ALTER TABLE core.empresa_documentos
  ADD CONSTRAINT empresa_documentos_unique_assignment
    UNIQUE (empresa_id, documento_id, rol);

-- Lista cerrada de roles. Para agregar uno nuevo: ALTER del constraint.
ALTER TABLE core.empresa_documentos
  ADD CONSTRAINT empresa_documentos_rol_check CHECK (rol IN (
    'acta_constitutiva',
    'acta_reforma',
    'poder_general_administracion',
    'poder_actos_dominio',
    'poder_pleitos_cobranzas',
    'poder_bancario',
    'representante_legal_imss'
  ));

-- Solo un default por (empresa_id, rol). Partial index — permite múltiples
-- es_default=false para el mismo rol (los "vigentes pero no default").
CREATE UNIQUE INDEX IF NOT EXISTS empresa_documentos_one_default_per_rol
  ON core.empresa_documentos (empresa_id, rol)
  WHERE es_default = true;

-- Lookup índices de uso común.
CREATE INDEX IF NOT EXISTS empresa_documentos_empresa_id_idx
  ON core.empresa_documentos (empresa_id);

CREATE INDEX IF NOT EXISTS empresa_documentos_documento_id_idx
  ON core.empresa_documentos (documento_id);

CREATE INDEX IF NOT EXISTS empresa_documentos_rol_idx
  ON core.empresa_documentos (empresa_id, rol);

-- ─── RLS ──────────────────────────────────────────────────────────────

ALTER TABLE core.empresa_documentos ENABLE ROW LEVEL SECURITY;

-- SELECT: cualquier miembro activo de la empresa o admin.
CREATE POLICY core_empresa_documentos_select
  ON core.empresa_documentos
  FOR SELECT
  TO authenticated
  USING (core.fn_has_empresa(empresa_id) OR core.fn_is_admin());

-- INSERT/UPDATE/DELETE: solo admin (consistente con /settings/empresas v1).
-- Sub-iniciativa futura podrá abrir a comité ejecutivo.
CREATE POLICY core_empresa_documentos_insert
  ON core.empresa_documentos
  FOR INSERT
  TO authenticated
  WITH CHECK (core.fn_is_admin());

CREATE POLICY core_empresa_documentos_update
  ON core.empresa_documentos
  FOR UPDATE
  TO authenticated
  USING (core.fn_is_admin())
  WITH CHECK (core.fn_is_admin());

CREATE POLICY core_empresa_documentos_delete
  ON core.empresa_documentos
  FOR DELETE
  TO authenticated
  USING (core.fn_is_admin());

-- ─── Función de sincronización del caché jsonb ────────────────────────
--
-- Proyecta el `subtipo_meta` del documento marcado como `es_default` para
-- el rol dado, hacia el jsonb correspondiente en `core.empresas`. Si no
-- hay default vigente, setea el caché a NULL.
--
-- El mapeo es defensivo: la extracción IA puede usar varias convenciones
-- de naming en `subtipo_meta` (ver hint en migración 20260414000020:
-- {numero_escritura, fecha_escritura, volumen}). Para que el flujo
-- funcione hoy aunque la extracción no esté completamente estandarizada,
-- COALESCE busca en varias keys conocidas. Sprint 2 audita y normaliza.
--
-- SECURITY DEFINER + search_path pinned, igual que las funciones de
-- core.fn_* (helpers RLS).

CREATE OR REPLACE FUNCTION core.fn_empresa_documentos_sync_escrituras_cache(
  p_empresa_id uuid,
  p_rol text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_meta jsonb;
  v_cache jsonb;
  v_target_col text;
BEGIN
  -- Solo los dos roles consumidos por RH disparan sync. El resto queda
  -- como referencia pura sin proyección a caché.
  IF p_rol = 'acta_constitutiva' THEN
    v_target_col := 'escritura_constitutiva';
  ELSIF p_rol = 'poder_general_administracion' THEN
    v_target_col := 'escritura_poder';
  ELSE
    RETURN;
  END IF;

  -- Lee el subtipo_meta del documento default actual para este rol.
  -- Si no hay default (ningún row con es_default=true), v_meta queda NULL
  -- y el caché se limpia.
  SELECT d.subtipo_meta
    INTO v_meta
    FROM core.empresa_documentos ed
    JOIN erp.documentos d ON d.id = ed.documento_id
   WHERE ed.empresa_id = p_empresa_id
     AND ed.rol = p_rol
     AND ed.es_default = true
   LIMIT 1;

  IF v_meta IS NULL THEN
    -- Sin default → caché limpio. No usamos NULL del jsonb sino
    -- NULL de columna para consistencia con captura manual previa.
    EXECUTE format(
      'UPDATE core.empresas SET %I = NULL, updated_at = now() WHERE id = $1',
      v_target_col
    ) USING p_empresa_id;
    RETURN;
  END IF;

  -- Mapea defensivamente las distintas convenciones de naming que la
  -- extracción IA puede producir, hacia los 5 campos canónicos del
  -- jsonb consumido por lib/rh/datos-fiscales-empresa.ts.
  v_cache := jsonb_strip_nulls(jsonb_build_object(
    'numero',         COALESCE(v_meta->>'numero_escritura', v_meta->>'numero'),
    'fecha',          COALESCE(v_meta->>'fecha_escritura', v_meta->>'fecha'),
    'fecha_texto',    v_meta->>'fecha_texto',
    'notario',        COALESCE(v_meta->>'notario_nombre', v_meta->>'notario'),
    'notaria_numero', v_meta->>'notaria_numero',
    'distrito',       COALESCE(v_meta->>'distrito_notarial', v_meta->>'distrito')
  ));

  EXECUTE format(
    'UPDATE core.empresas SET %I = $1, updated_at = now() WHERE id = $2',
    v_target_col
  ) USING v_cache, p_empresa_id;
END;
$$;

COMMENT ON FUNCTION core.fn_empresa_documentos_sync_escrituras_cache(uuid, text) IS
  'Proyecta subtipo_meta del documento default de un rol al jsonb caché en '
  'core.empresas (escritura_constitutiva / escritura_poder). Solo aplica a '
  'roles consumidos por RH; el resto retorna sin tocar nada. Llamada por el '
  'trigger trg_empresa_documentos_sync_cache y disponible para invocación '
  'manual desde el endpoint admin de "resincronizar caché".';

GRANT EXECUTE ON FUNCTION core.fn_empresa_documentos_sync_escrituras_cache(uuid, text)
  TO authenticated, service_role;

-- ─── Triggers ─────────────────────────────────────────────────────────
--
-- AFTER INSERT/UPDATE/DELETE STATEMENT-level que llama a sync_cache para
-- cada (empresa_id, rol) tocado. Tres funciones porque Postgres exige
-- que el SQL del trigger solo referencie las transition tables que se
-- declararon en CREATE TRIGGER (INSERT no tiene OLD; DELETE no tiene NEW).

-- Función para INSERT (solo NEW TABLE).
CREATE OR REPLACE FUNCTION core.fn_empresa_documentos_trigger_sync_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_record record;
BEGIN
  FOR v_record IN
    SELECT DISTINCT empresa_id, rol FROM new_table
  LOOP
    PERFORM core.fn_empresa_documentos_sync_escrituras_cache(
      v_record.empresa_id, v_record.rol
    );
  END LOOP;
  RETURN NULL;
END;
$$;

-- Función para UPDATE (NEW TABLE + OLD TABLE).
CREATE OR REPLACE FUNCTION core.fn_empresa_documentos_trigger_sync_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_record record;
BEGIN
  FOR v_record IN
    SELECT DISTINCT empresa_id, rol FROM (
      SELECT empresa_id, rol FROM new_table
      UNION
      SELECT empresa_id, rol FROM old_table
    ) all_rows
  LOOP
    PERFORM core.fn_empresa_documentos_sync_escrituras_cache(
      v_record.empresa_id, v_record.rol
    );
  END LOOP;
  RETURN NULL;
END;
$$;

-- Función para DELETE (solo OLD TABLE).
CREATE OR REPLACE FUNCTION core.fn_empresa_documentos_trigger_sync_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_record record;
BEGIN
  FOR v_record IN
    SELECT DISTINCT empresa_id, rol FROM old_table
  LOOP
    PERFORM core.fn_empresa_documentos_sync_escrituras_cache(
      v_record.empresa_id, v_record.rol
    );
  END LOOP;
  RETURN NULL;
END;
$$;

CREATE TRIGGER trg_empresa_documentos_sync_after_insert
  AFTER INSERT ON core.empresa_documentos
  REFERENCING NEW TABLE AS new_table
  FOR EACH STATEMENT
  EXECUTE FUNCTION core.fn_empresa_documentos_trigger_sync_insert();

CREATE TRIGGER trg_empresa_documentos_sync_after_update
  AFTER UPDATE ON core.empresa_documentos
  REFERENCING NEW TABLE AS new_table OLD TABLE AS old_table
  FOR EACH STATEMENT
  EXECUTE FUNCTION core.fn_empresa_documentos_trigger_sync_update();

CREATE TRIGGER trg_empresa_documentos_sync_after_delete
  AFTER DELETE ON core.empresa_documentos
  REFERENCING OLD TABLE AS old_table
  FOR EACH STATEMENT
  EXECUTE FUNCTION core.fn_empresa_documentos_trigger_sync_delete();

GRANT EXECUTE ON FUNCTION core.fn_empresa_documentos_trigger_sync_insert()
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION core.fn_empresa_documentos_trigger_sync_update()
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION core.fn_empresa_documentos_trigger_sync_delete()
  TO authenticated, service_role;

-- ─── Reload PostgREST schema cache ────────────────────────────────────

NOTIFY pgrst, 'reload schema';

COMMIT;
