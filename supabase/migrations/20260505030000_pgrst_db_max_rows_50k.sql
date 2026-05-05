-- Sube el cap de rows que PostgREST devuelve por query (default Supabase
-- ~1000 rows). Con 5K+ pedidos Waitry pagados en 120d, el cap de 1000
-- truncaba los resultados y dejaba fuera los más recientes — fix #420
-- (descending) era paliativo, este es el fix de raíz.
--
-- 50K es un valor conservador: cubre todas las queries actuales del repo
-- con margen amplio sin abrir la puerta a queries malformados que
-- pidieran millones de rows. Los queries del cliente siguen filtrando
-- por ventana temporal y demás predicados, así que en la práctica nunca
-- se devuelven cantidades grandes.

BEGIN;

ALTER ROLE authenticator SET pgrst.db_max_rows = '50000';

NOTIFY pgrst, 'reload config';

COMMIT;
