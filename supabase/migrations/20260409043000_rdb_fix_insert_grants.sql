GRANT INSERT, UPDATE ON rdb.waitry_pedidos TO service_role;
GRANT INSERT, UPDATE ON rdb.waitry_productos TO service_role;
GRANT INSERT, UPDATE ON rdb.waitry_pagos TO service_role;
GRANT INSERT, UPDATE ON rdb.waitry_inbound TO service_role;

DROP POLICY IF EXISTS "service_role_all_waitry_pedidos" ON rdb.waitry_pedidos;
CREATE POLICY "service_role_all_waitry_pedidos" ON rdb.waitry_pedidos TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "service_role_all_waitry_productos" ON rdb.waitry_productos;
CREATE POLICY "service_role_all_waitry_productos" ON rdb.waitry_productos TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "service_role_all_waitry_inbound" ON rdb.waitry_inbound;
CREATE POLICY "service_role_all_waitry_inbound" ON rdb.waitry_inbound TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "service_role_all_waitry_pagos" ON rdb.waitry_pagos;
CREATE POLICY "service_role_all_waitry_pagos" ON rdb.waitry_pagos TO service_role USING (true) WITH CHECK (true);
