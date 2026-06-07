-- ╭──────────────────────────────────────────────────────────────────╮
-- │  20260607170000_modulo_dilesa_manual                              │
-- │                                                                    │
-- │  Libera el módulo `dilesa.manual` (Manual de usuario in-app —      │
-- │  iniciativa `manual-usuario`, piloto DILESA · Ventas).            │
-- │                                                                    │
-- │  Es una herramienta de consulta READ-ONLY: la ayuda es para       │
-- │  todos, así que se concede lectura a TODOS los roles de DILESA.   │
-- │  La escritura queda en false a propósito — el contenido se edita  │
-- │  por PR (markdown versionado en el repo), no desde la UI (D2).    │
-- │                                                                    │
-- │  La ayuda CONTEXTUAL por pantalla (botón "?") hereda el gate de   │
-- │  cada módulo donde aparece; este módulo gobierna solo la portada  │
-- │  `/dilesa/manual` y su entrada en el sidebar (sección Ayuda).     │
-- │                                                                    │
-- │  Sin la fila + backfill, `canAccessModulo('dilesa.manual')`       │
-- │  retorna false para no-admin y la portada quedaría oculta.        │
-- │                                                                    │
-- │  Ver docs/planning/manual-usuario.md y la regla "Liberación de    │
-- │  módulo nuevo" del CLAUDE.md del repo.                            │
-- ╰──────────────────────────────────────────────────────────────────╯

BEGIN;

-- ─── Módulo top-level ─────────────────────────────────────────────────
-- `seccion = 'ayuda'` (texto libre; agrupa en la UI de gestión de permisos).

INSERT INTO core.modulos (slug, nombre, descripcion, empresa_id, seccion)
SELECT
  'dilesa.manual',
  'Manual',
  'Manual de usuario: guía de uso de cada pantalla de DILESA',
  e.id,
  'ayuda'
FROM core.empresas e
WHERE e.slug = 'dilesa'
ON CONFLICT (empresa_id, slug) DO NOTHING;

-- ─── Backfill defensivo de permisos por rol ───────────────────────────
-- Una fila por rol de DILESA con lectura=true (la ayuda es para todos) y
-- escritura=false (el contenido se edita por PR, no desde la UI). Idempotente.

INSERT INTO core.permisos_rol (rol_id, modulo_id, acceso_lectura, acceso_escritura)
SELECT r.id, m.id, true, false
FROM core.roles r
JOIN core.empresas e ON e.id = r.empresa_id AND e.slug = 'dilesa'
JOIN core.modulos m ON m.empresa_id = e.id AND m.slug = 'dilesa.manual'
ON CONFLICT (rol_id, modulo_id) DO NOTHING;

NOTIFY pgrst, 'reload schema';

COMMIT;
