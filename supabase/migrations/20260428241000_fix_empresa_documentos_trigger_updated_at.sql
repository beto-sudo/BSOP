-- Fix urgente — `core.empresas` no tiene columna `updated_at`. La función
-- de sync del trigger creada en migración 20260428235000 incluía
-- `, updated_at = now()` en el UPDATE — eso producía el error:
--
--   "column \"updated_at\" of relation \"empresas\" does not exist"
--
-- al asignar cualquier documento default (los triggers AFTER
-- INSERT/UPDATE/DELETE invocan la función de sync, que falla y
-- propaga el error al INSERT del row de empresa_documentos).
--
-- Reemplazamos la función con CREATE OR REPLACE quitando la cláusula
-- problemática. Los triggers no cambian (siguen apuntando a esta función).

BEGIN;

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
  IF p_rol = 'acta_constitutiva' THEN
    v_target_col := 'escritura_constitutiva';
  ELSIF p_rol = 'poder_general_administracion' THEN
    v_target_col := 'escritura_poder';
  ELSE
    RETURN;
  END IF;

  SELECT d.subtipo_meta
    INTO v_meta
    FROM core.empresa_documentos ed
    JOIN erp.documentos d ON d.id = ed.documento_id
   WHERE ed.empresa_id = p_empresa_id
     AND ed.rol = p_rol
     AND ed.es_default = true
   LIMIT 1;

  IF v_meta IS NULL THEN
    -- Sin default → caché limpio. Sin updated_at (la columna no existe
    -- en core.empresas).
    EXECUTE format(
      'UPDATE core.empresas SET %I = NULL WHERE id = $1',
      v_target_col
    ) USING p_empresa_id;
    RETURN;
  END IF;

  v_cache := jsonb_strip_nulls(jsonb_build_object(
    'numero',         COALESCE(v_meta->>'numero_escritura', v_meta->>'numero'),
    'fecha',          COALESCE(v_meta->>'fecha_escritura', v_meta->>'fecha'),
    'fecha_texto',    v_meta->>'fecha_texto',
    'notario',        COALESCE(v_meta->>'notario_nombre', v_meta->>'notario'),
    'notaria_numero', v_meta->>'notaria_numero',
    'distrito',       COALESCE(v_meta->>'distrito_notarial', v_meta->>'distrito')
  ));

  EXECUTE format(
    'UPDATE core.empresas SET %I = $1 WHERE id = $2',
    v_target_col
  ) USING v_cache, p_empresa_id;
END;
$$;

NOTIFY pgrst, 'reload schema';

COMMIT;
