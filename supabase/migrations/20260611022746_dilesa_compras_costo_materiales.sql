-- ╭──────────────────────────────────────────────────────────────────╮
-- │  20260611022746_dilesa_compras_costo_materiales                   │
-- │                                                                    │
-- │  Captura del costo final de materiales por vivienda dentro del    │
-- │  hub Compras (post-cutoff del grid Coda "Construcción por Lote"). │
-- │  Mientras no exista el módulo de control de materiales en BSOP    │
-- │  (hoy se lleva en CONTPAQ), el equipo registra aquí el monto      │
-- │  final por vivienda terminada.                                    │
-- │                                                                    │
-- │  1. Sub-slug `dilesa.compras.costo_materiales` (tab nuevo,        │
-- │     ADR-030) + backfill defensivo de permisos clonando el padre   │
-- │     `dilesa.compras`.                                             │
-- │  2. RPC `dilesa.fn_construccion_capturar_costo_materiales`:       │
-- │     valida permiso de escritura efectivo (admin override OR       │
-- │     excepción-usuario OR rol — semántica de lib/permissions.ts),  │
-- │     exige vivienda terminada, actualiza costo, recalcula          │
-- │     `productos.costo_materiales_referencia` y deja audit_log.     │
-- ╰──────────────────────────────────────────────────────────────────╯

BEGIN;

-- ── 1. Sub-slug en core.modulos (hereda sección del padre) ──────────────
DO $$
DECLARE
  v_empresa_id uuid;
  v_seccion text;
BEGIN
  SELECT id INTO v_empresa_id FROM core.empresas WHERE slug = 'dilesa';
  -- Preview branch corre sin datos de prod: sin empresa no hay nada que
  -- insertar (el INSERT con empresa_id NULL tumbaría el branch).
  IF v_empresa_id IS NULL THEN
    RETURN;
  END IF;
  SELECT seccion INTO v_seccion FROM core.modulos
    WHERE empresa_id = v_empresa_id AND slug = 'dilesa.compras' LIMIT 1;

  INSERT INTO core.modulos (slug, nombre, descripcion, empresa_id, seccion)
  VALUES
    ('dilesa.compras.costo_materiales',
     'Compras · Costo materiales',
     'Captura del costo final de materiales por vivienda terminada (puente hasta el módulo de control de materiales; hoy el detalle vive en CONTPAQ).',
     v_empresa_id, v_seccion)
  ON CONFLICT (empresa_id, slug) DO NOTHING;
END $$;

-- ── 2. Backfill defensivo de permisos (clona el padre dilesa.compras) ───
INSERT INTO core.permisos_rol (rol_id, modulo_id, acceso_lectura, acceso_escritura)
SELECT pr.rol_id, m_new.id, pr.acceso_lectura, pr.acceso_escritura
FROM core.permisos_rol pr
JOIN core.modulos m_old
  ON m_old.id = pr.modulo_id
 AND m_old.slug = 'dilesa.compras'
CROSS JOIN core.modulos m_new
WHERE m_new.slug = 'dilesa.compras.costo_materiales'
  AND m_new.empresa_id = m_old.empresa_id
ON CONFLICT (rol_id, modulo_id) DO NOTHING;

-- ── 3. RPC de captura (gate server-side + audit + referencia) ───────────
CREATE OR REPLACE FUNCTION dilesa.fn_construccion_capturar_costo_materiales(
  p_construccion_id uuid,
  p_costo numeric
)
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = dilesa, core, public
AS $$
DECLARE
  v dilesa.construccion%ROWTYPE;
  v_modulo_id uuid;
  v_excepcion boolean;
  v_puede boolean;
BEGIN
  IF p_costo IS NULL OR p_costo <= 0 THEN
    RAISE EXCEPTION 'El costo de materiales debe ser un monto mayor a cero';
  END IF;

  SELECT * INTO v FROM dilesa.construccion
   WHERE id = p_construccion_id AND deleted_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'La construcción % no existe o está eliminada', p_construccion_id;
  END IF;

  -- El costo FINAL de materiales solo existe con la vivienda terminada;
  -- capturarlo antes contaminaría el promedio de referencia del prototipo.
  IF v.estado NOT IN ('terminada', 'dtu', 'seguro_calidad', 'extraida') THEN
    RAISE EXCEPTION 'La vivienda % aún no está terminada (estado: %)', v.codigo, v.estado;
  END IF;

  -- Gate: admin global OR escritura efectiva en dilesa.compras.costo_materiales.
  -- Semántica de lib/permissions.ts: la excepción por usuario, si existe,
  -- reemplaza al permiso del rol para ese módulo.
  v_puede := core.fn_is_admin();
  IF NOT v_puede THEN
    SELECT m.id INTO v_modulo_id FROM core.modulos m
     WHERE m.empresa_id = v.empresa_id
       AND m.slug = 'dilesa.compras.costo_materiales';

    SELECT COALESCE(pue.acceso_escritura, false) INTO v_excepcion
      FROM core.permisos_usuario_excepcion pue
     WHERE pue.usuario_id = auth.uid()
       AND pue.empresa_id = v.empresa_id
       AND pue.modulo_id = v_modulo_id;

    IF FOUND THEN
      v_puede := v_excepcion;
    ELSE
      v_puede := EXISTS (
        SELECT 1
        FROM core.usuarios_empresas ue
        JOIN core.permisos_rol pr ON pr.rol_id = ue.rol_id
        WHERE ue.usuario_id = auth.uid()
          AND ue.empresa_id = v.empresa_id
          AND ue.activo = true
          AND pr.modulo_id = v_modulo_id
          AND pr.acceso_escritura = true
      );
    END IF;
  END IF;

  IF NOT v_puede THEN
    RAISE EXCEPTION 'Sin permiso de escritura en Compras · Costo materiales';
  END IF;

  UPDATE dilesa.construccion
     SET costo_materiales = round(p_costo, 2), updated_at = now()
   WHERE id = p_construccion_id;

  -- Mantener fresco el promedio de referencia del prototipo (mismo WHERE
  -- canónico de la migración 20260530210000 / backfill Coda).
  UPDATE dilesa.productos p
     SET costo_materiales_referencia = (
       SELECT round(avg(c.costo_materiales), 2)
       FROM dilesa.construccion c
       WHERE c.producto_id = v.producto_id
         AND c.deleted_at IS NULL
         AND c.estado IN ('terminada', 'dtu', 'seguro_calidad', 'extraida')
         AND c.costo_materiales IS NOT NULL
         AND c.costo_materiales > 0
     )
   WHERE p.id = v.producto_id AND p.deleted_at IS NULL;

  INSERT INTO core.audit_log
    (empresa_id, usuario_id, accion, tabla, registro_id, datos_anteriores, datos_nuevos)
  VALUES
    (v.empresa_id, auth.uid(), 'construccion_costo_materiales_capturado',
     'dilesa.construccion', p_construccion_id,
     jsonb_build_object('costo_materiales', v.costo_materiales),
     jsonb_build_object('costo_materiales', round(p_costo, 2)));
END;
$$;

COMMENT ON FUNCTION dilesa.fn_construccion_capturar_costo_materiales(uuid, numeric) IS
  'Captura/corrige el costo final de materiales de una vivienda terminada '
  '(tab Costo materiales del hub Compras). Gate: admin OR escritura efectiva '
  'en dilesa.compras.costo_materiales. Recalcula costo_materiales_referencia '
  'del prototipo y deja core.audit_log con valor anterior y nuevo.';

GRANT EXECUTE ON FUNCTION dilesa.fn_construccion_capturar_costo_materiales(uuid, numeric)
  TO authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;
