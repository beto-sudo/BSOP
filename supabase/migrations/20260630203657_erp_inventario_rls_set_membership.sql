-- ╭─ 20260630203657_erp_inventario_rls_set_membership ─╮
-- Perf RLS: las políticas SELECT de las tablas erp que alimentan
-- `rdb.v_inventario_stock` (vista security_invoker) usaban
-- `core.fn_has_empresa(empresa_id)` — función con argumento de COLUMNA, que
-- Postgres evalúa POR FILA aunque sea STABLE. La vista agrega DOS veces
-- `erp.movimientos_inventario` (~40k filas y creciendo a diario con ventas
-- Waitry) → ~2× 1.5s en llamadas a la función (cada una hace 2 JOINs contra
-- core.usuarios) → ~3s con caché caliente y >8s en frío, pasando el
-- statement_timeout de 8s del rol `authenticated` → "canceling statement due
-- to statement timeout". El error real se traga en la UI y aparece como
-- "Error al cargar inventario" en el tab Stock de RDB.
--
-- Fix: set-membership. `empresa_id IN (SELECT core.fn_current_empresa_ids())`
-- evalúa el subquery UNA sola vez (InitPlan), no por fila. Medición directa
-- del mismo scan: 1,560ms → 14ms (~110×). Autorización IDÉNTICA:
-- fn_current_empresa_ids() corre el mismo join con los mismos filtros
-- (u.activo + ue.activo) que fn_has_empresa, y el override de admin
-- (fn_is_admin) se preserva. ALTER POLICY conserva rol, cmd (SELECT) y
-- permissive; solo reemplaza el predicado USING. Mismo fix que
-- 20260624180340_estimacion_tareas_rls_set_membership.
--
-- Alcance: las 4 tablas que toca la vista. La crítica es
-- movimientos_inventario (los dos scans de ~40k filas); las otras tres se
-- escanean por índice (pocas filas) pero comparten el anti-patrón, así que se
-- alinean por consistencia y para que no degraden al crecer.
--
-- Nota: el anti-patrón fn_has_empresa-por-fila vive en ~334 políticas (erp,
-- dilesa, core). Solo causa timeout cuando una query barre muchas filas. Un
-- barrido global es iniciativa aparte (RLS financiera de todo el DB).

BEGIN;

ALTER POLICY erp_movimientos_inventario_select ON erp.movimientos_inventario
  USING (
    empresa_id IN (SELECT core.fn_current_empresa_ids())
    OR core.fn_is_admin()
  );

ALTER POLICY erp_productos_select ON erp.productos
  USING (
    empresa_id IN (SELECT core.fn_current_empresa_ids())
    OR core.fn_is_admin()
  );

ALTER POLICY erp_inventario_select ON erp.inventario
  USING (
    empresa_id IN (SELECT core.fn_current_empresa_ids())
    OR core.fn_is_admin()
  );

ALTER POLICY erp_productos_precios_select ON erp.productos_precios
  USING (
    empresa_id IN (SELECT core.fn_current_empresa_ids())
    OR core.fn_is_admin()
  );

-- Higiene: la vista es de módulo logueado. Estaba expuesta a `anon`, pero sus
-- tablas base no, así que un request sin token recibía un 42501 confuso
-- ("permission denied for table productos") en vez de un resultado limpio.
REVOKE SELECT ON rdb.v_inventario_stock FROM anon;

COMMIT;
