-- EDITED 2026-04-23 (drift-1.5): rdb.waitry_pagos is ambient (created via
-- dashboard pre-migration tracking). Skip on a fresh DB where it's absent.
-- Fix: payment_id en rdb.waitry_pagos es NOT NULL pero Waitry no siempre lo envía.
-- Solución: hacer payment_id nullable y ajustar el UNIQUE constraint.
-- También asegurar que el trigger del inbound no falle silenciosamente por pagos sin ID.

do $$
begin
  if to_regclass('rdb.waitry_pagos') is null then
    return;
  end if;

  -- 1. Hacer payment_id nullable
  alter table rdb.waitry_pagos
    alter column payment_id drop not null;

  -- 2. Reemplazar el unique constraint para manejar NULLs correctamente
  --    (dos NULLs no colisionan en UNIQUE, lo cual es el comportamiento correcto)
  alter table rdb.waitry_pagos
    drop constraint if exists waitry_pagos_unique_payment;

  create unique index if not exists waitry_pagos_unique_payment_idx
    on rdb.waitry_pagos (order_id, payment_id)
    where payment_id is not null;

  -- 3. Agregar índice para pagos sin payment_id (paid:true sin detalle)
  create index if not exists waitry_pagos_no_payment_id_idx
    on rdb.waitry_pagos (order_id)
    where payment_id is null;
end $$;
