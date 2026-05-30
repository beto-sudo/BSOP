-- Iniciativa `dilesa-proyectos-checklist-inline` Sprint 4D.
--
-- RPC para cambiar la versión vigente de un plano atómicamente.
-- El índice unique parcial `proyecto_planos_vigente_uk` enforcea que
-- solo 1 row tenga `vigente=true` por proyecto. Cambiar requiere 2
-- statements (apagar el viejo, encender el nuevo) — si los hacemos
-- desde supabase-js en secuencia hay race condition entre clientes.
-- La RPC los corre en una transacción, sin race.

BEGIN;

CREATE OR REPLACE FUNCTION dilesa.fn_marcar_plano_vigente(
  p_plano_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, dilesa
AS $$
DECLARE
  v_proyecto_id uuid;
BEGIN
  -- Resolver el proyecto del plano. RLS protege el SELECT.
  SELECT proyecto_id INTO v_proyecto_id
  FROM dilesa.proyecto_planos
  WHERE id = p_plano_id AND deleted_at IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Plano % no encontrado o eliminado', p_plano_id
      USING ERRCODE = 'P0002';
  END IF;

  -- Apagar todos los vigentes del mismo proyecto (excepto el target).
  UPDATE dilesa.proyecto_planos
  SET vigente = false, updated_at = NOW()
  WHERE proyecto_id = v_proyecto_id
    AND vigente = true
    AND id <> p_plano_id
    AND deleted_at IS NULL;

  -- Encender el target.
  UPDATE dilesa.proyecto_planos
  SET vigente = true, updated_at = NOW()
  WHERE id = p_plano_id;
END;
$$;

COMMENT ON FUNCTION dilesa.fn_marcar_plano_vigente(uuid) IS
  'Sprint 4D. Cambia la versión vigente del plano de un anteproyecto atómicamente. Apaga el viejo + enciende el nuevo en una transacción para no chocar con el índice unique parcial proyecto_planos_vigente_uk.';

NOTIFY pgrst, 'reload schema';

COMMIT;
