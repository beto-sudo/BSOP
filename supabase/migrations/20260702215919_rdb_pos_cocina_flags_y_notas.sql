-- ╭─ 20260702215919_rdb_pos_cocina_flags_y_notas ─╮
-- rdb-pos-propio · S2.6 — (1) Todo se surte de cocina excepto servicios
-- (Beto 2026-07-02): va_a_cocina=true en todas las categorías RDB salvo las
-- 8 de servicio. (2) Nota general por cuenta: columna + RPC con auditoría.
-- Las notas por item ya existían (pos_items.notas); la UI las expone ahora.

BEGIN;

-- -----------------------------------------------------------------------------
-- 1) Flags de comandero: todo excepto servicios.
-- -----------------------------------------------------------------------------
UPDATE erp.categorias_producto c
SET va_a_cocina = true
FROM core.empresas e
WHERE e.id = c.empresa_id
  AND e.slug = 'rdb'
  AND c.nombre NOT IN (
    'Academias',
    'Clínica Especializada',
    'Propina',
    'Renta cancha Coach',
    'Renta cancha Pádel',
    'Renta cancha Pickleball',
    'Renta cancha Tenis',
    'Torneos'
  );

-- -----------------------------------------------------------------------------
-- 2) Nota general de la cuenta (ej. "para llevar", "cliente en barra").
-- -----------------------------------------------------------------------------
ALTER TABLE rdb.pos_cuentas ADD COLUMN IF NOT EXISTS notas text;

CREATE OR REPLACE FUNCTION rdb.fn_pos_nota_cuenta(
  p_cuenta_id uuid, p_pin text, p_nota text, p_client_action_id uuid
) RETURNS void LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'rdb', 'public'
AS $$
DECLARE
  v_c        rdb.pos_cuentas%ROWTYPE;
  v_empleado uuid;
BEGIN
  IF rdb.fn_pos_accion_ya_procesada(p_client_action_id) THEN RETURN; END IF;
  SELECT * INTO v_c FROM rdb.pos_cuentas WHERE id = p_cuenta_id FOR UPDATE;
  IF v_c.id IS NULL THEN RAISE EXCEPTION 'POS: cuenta inexistente'; END IF;
  IF v_c.estado NOT IN ('abierta', 'en_cobro') THEN
    RAISE EXCEPTION 'POS: la cuenta está % — la nota ya no se edita', v_c.estado;
  END IF;

  v_empleado := rdb.fn_pos_resolver_operador(v_c.empresa_id, p_pin);

  UPDATE rdb.pos_cuentas SET notas = NULLIF(TRIM(p_nota), '') WHERE id = p_cuenta_id;

  PERFORM rdb.fn_pos_log_evento(v_c.empresa_id, 'nota_cuenta', v_empleado,
    v_c.estacion_id, p_cuenta_id, NULL, NULL,
    jsonb_build_object('notas', v_c.notas),
    jsonb_build_object('notas', NULLIF(TRIM(p_nota), '')), NULL, NULL, p_client_action_id);
END;
$$;

REVOKE ALL ON FUNCTION rdb.fn_pos_nota_cuenta(uuid, text, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION rdb.fn_pos_nota_cuenta(uuid, text, text, uuid) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;
