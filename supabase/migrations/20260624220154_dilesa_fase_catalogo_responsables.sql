-- ╭─ 20260624220154_dilesa_fase_catalogo_responsables ─╮
-- Ajusta el "responsable" (etiqueta de display `rol`) de dos fases del catálogo
-- de ventas DILESA (decisión Beto 2026-06-24):
--   · Fase 8  Dictaminada       → Comité            (antes Gerencia de Ventas)
--   · Fase 10 Firmas Programadas → Gerencia de Ventas (antes Gerencia General)
-- `rol` es solo etiqueta de la pestaña Fases ("Resp.: …"); NO es el RBAC (eso
-- vive en los sub-slugs faseNN_*). Idempotente y scopeado a 'dilesa'.

BEGIN;

UPDATE dilesa.venta_fase_catalogo c
SET rol = m.rol
FROM (
  VALUES
    (8, 'Comité'),
    (10, 'Gerencia de Ventas')
) AS m(posicion, rol)
WHERE c.posicion = m.posicion
  AND c.empresa_id = (SELECT id FROM core.empresas WHERE slug = 'dilesa')
  AND c.rol IS DISTINCT FROM m.rol;

NOTIFY pgrst, 'reload schema';

COMMIT;
