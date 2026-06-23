-- Hotfix del overload de fn_calcular_precio_venta.
--
-- La migración 20260623155819 hizo `CREATE OR REPLACE FUNCTION` agregando un
-- parámetro (`p_sobreprecio_gastos_escrituracion`). En PostgreSQL agregar un
-- parámetro cambia la FIRMA, así que NO reemplaza la función: crea un OVERLOAD
-- nuevo. Quedaron dos `dilesa.fn_calcular_precio_venta` (5 y 6 params) y PostgREST
-- no podía resolver la llamada de 5 args de la pantalla de asignación → error
-- "Could not choose the best candidate function between ...".
--
-- Se dropea la firma vieja de 5 params; la de 6 (con el sexto parámetro
-- `DEFAULT 0`) cubre a todos los callers, incluidas las llamadas de 5 args.
-- Idempotente (`IF EXISTS`): en prod la firma vieja ya se quitó a mano al detectar
-- el error; esta migración lo deja registrado en el ledger y garantiza que el
-- Preview branch (que re-aplica 155819 y heredaría el overload) quede con una sola
-- función.

BEGIN;

DROP FUNCTION IF EXISTS dilesa.fn_calcular_precio_venta(uuid, uuid, numeric, numeric, numeric);

-- Recarga el cache de PostgREST (cambió el conjunto de funciones expuestas):
NOTIFY pgrst, 'reload schema';

COMMIT;
