-- ╭─ 20260625174022_rdb_propinas_no_inventariable ─╮
-- Corrige 2 propinas de RDB marcadas como inventariables (inventario físico)
-- cuando son servicios: pone inventariable=false. Solo datos.
--
-- CONTEXTO:
--   En el catálogo de RDB el badge "Inventario" (Producto físico / Servicio)
--   se deriva de erp.productos.inventariable (ver app/rdb/productos/page.tsx).
--   "Propina $10" (1301141) y "Propina $100" (1301144) tenían tipo='servicio'
--   pero inventariable=true, así que aparecían como "Producto físico" — las
--   otras propinas ya estaban en false.
--
-- ALCANCE (solo datos; ningún cambio de schema):
--   UPDATE inventariable=false para esas 2 propinas (RDB).
--
-- ROBUSTEZ:
--   Condicionado a la empresa RDB (no-op en branches sin datos de producción).
--   Acotado por codigo; idempotente (re-correr no cambia nada).
--
-- Timestamp generado con `npm run db:new` (anti-colisión multi-sesión:
-- estrictamente mayor que toda migración local + de PRs abiertos).

BEGIN;

UPDATE erp.productos p
SET inventariable = false
FROM core.empresas e
WHERE e.id = 'e52ac307-9373-4115-b65e-1178f0c4e1aa'::uuid
  AND p.empresa_id = e.id
  AND p.codigo IN ('1301141', '1301144')
  AND p.inventariable IS DISTINCT FROM false;

-- Recarga el cache de PostgREST (cambio en columna leída por embeds):
NOTIFY pgrst, 'reload schema';

COMMIT;
