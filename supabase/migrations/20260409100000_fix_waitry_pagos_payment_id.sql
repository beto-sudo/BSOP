-- Fix: payment_id en rdb.waitry_pagos es NOT NULL pero Waitry no siempre lo envía.
-- Solución: hacer payment_id nullable y ajustar el UNIQUE constraint.
-- También asegurar que el trigger del inbound no falle silenciosamente por pagos sin ID.

-- 1. Hacer payment_id nullable
ALTER TABLE rdb.waitry_pagos
  ALTER COLUMN payment_id DROP NOT NULL;

-- 2. Reemplazar el unique constraint para manejar NULLs correctamente
--    (dos NULLs no colisionan en UNIQUE, lo cual es el comportamiento correcto)
ALTER TABLE rdb.waitry_pagos
  DROP CONSTRAINT IF EXISTS waitry_pagos_unique_payment;

CREATE UNIQUE INDEX IF NOT EXISTS waitry_pagos_unique_payment_idx
  ON rdb.waitry_pagos (order_id, payment_id)
  WHERE payment_id IS NOT NULL;

-- 3. Agregar índice para pagos sin payment_id (paid:true sin detalle)
CREATE INDEX IF NOT EXISTS waitry_pagos_no_payment_id_idx
  ON rdb.waitry_pagos (order_id)
  WHERE payment_id IS NULL;
