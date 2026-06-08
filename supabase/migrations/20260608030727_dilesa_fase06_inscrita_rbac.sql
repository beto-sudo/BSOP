-- ╭─ 20260608030727_dilesa_fase06_inscrita_rbac ─╮
-- Sub-slug RBAC para Fase 6 (Inscrita) — captura de las Constancias de
-- Crédito (titular + co-titular) que el banco entrega al cliente al
-- aprobar el crédito hipotecario. Beto: las constancias van en la fase
-- de "Inscrita"; la "Carta de instrucción notarial" sigue en Fase 8
-- (Dictaminada) — los roles del adjunto se reasignan en page.tsx, no
-- requiere migración de datos.
--
-- Captura:
--   - Constancia Crédito Titular (PDF) — obligatorio si tipo_credito
--     != 'Recursos propios' Y monto_credito_titular > 0
--   - Constancia Crédito Co-Titular (PDF) — obligatorio si
--     monto_credito_cotitular > 0
--   - Edición de monto_credito_titular + monto_credito_cotitular (el
--     banco aprueba un monto que puede diferir del solicitado en Fase 1)
--
-- RBAC: Gerencia Ventas + Dirección capturan; demás roles ven en lectura.

BEGIN;

-- ── 1. Sub-slug en core.modulos ──────────────────────────────────────────
DO $$
DECLARE
  v_empresa_id uuid;
  v_seccion text;
BEGIN
  SELECT id INTO v_empresa_id FROM core.empresas WHERE slug = 'dilesa';
  SELECT seccion INTO v_seccion FROM core.modulos
    WHERE empresa_id = v_empresa_id AND slug = 'dilesa.ventas' LIMIT 1;

  INSERT INTO core.modulos (slug, nombre, descripcion, empresa_id, seccion)
  VALUES
    ('dilesa.ventas.fase06_inscrita',
     'Ventas — Fase 6 (Inscrita)',
     'Captura de la inscripción del crédito: Constancia(s) del banco + montos aprobados.',
     v_empresa_id, v_seccion)
  ON CONFLICT (empresa_id, slug) DO NOTHING;
END $$;

-- ── 2. Backfill defensivo de permisos ────────────────────────────────────
-- Lectura: todos los roles que ya tienen lectura sobre dilesa.ventas.
-- Escritura: Gerencia Ventas + Dirección (decisión Beto).

INSERT INTO core.permisos_rol (rol_id, modulo_id, acceso_lectura, acceso_escritura)
SELECT
  pr.rol_id,
  m_new.id,
  true AS acceso_lectura,
  (r.nombre IN ('Gerencia Ventas', 'Dirección')) AS acceso_escritura
FROM core.permisos_rol pr
JOIN core.modulos m_old
  ON m_old.id = pr.modulo_id
 AND m_old.slug = 'dilesa.ventas'
JOIN core.roles r
  ON r.id = pr.rol_id
CROSS JOIN core.modulos m_new
WHERE m_new.slug = 'dilesa.ventas.fase06_inscrita'
  AND m_new.empresa_id = (SELECT id FROM core.empresas WHERE slug = 'dilesa')
  AND m_old.empresa_id = (SELECT id FROM core.empresas WHERE slug = 'dilesa')
  AND pr.acceso_lectura = true
ON CONFLICT (rol_id, modulo_id) DO NOTHING;

NOTIFY pgrst, 'reload schema';

COMMIT;
