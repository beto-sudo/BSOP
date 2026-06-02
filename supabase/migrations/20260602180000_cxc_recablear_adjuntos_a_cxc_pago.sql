-- =============================================================================
-- CxC — Recableo de adjuntos (comprobantes/recibos) venta_pago -> cxc_pago
-- =============================================================================
-- Contexto (iniciativa `cxc`, camino al retiro de Coda "Depositos Clientes"):
--
-- La migración Coda -> dilesa.venta_pagos cargó las imágenes/PDF de cada
-- depósito en erp.adjuntos con entidad_tipo='venta_pago' (entidad_id =
-- dilesa.venta_pagos.id). El módulo CxC (erp.cxc_pagos) lee los comprobantes
-- como entidad_tipo='cxc_pago' (entidad_id = erp.cxc_pagos.id, ADR-022), por lo
-- que esos archivos quedaron INVISIBLES en la UI de CxC aunque ya viven en
-- Supabase Storage (bucket privado `adjuntos`).
--
-- Esta migración re-apunta los adjuntos al abono CxC correspondiente. El match
-- es 1:1 por coda_row_id (verificado sin duplicados en ninguno de los dos
-- lados: vp_coda_dups=0, cxc_coda_dups=0). NO se mueve ningún objeto físico de
-- Storage: erp.adjuntos.url guarda el path literal del objeto, que sigue siendo
-- válido tras el re-apuntado. Se preserva el venta_pago de origen en metadata
-- para trazabilidad/reversibilidad.
--
-- Alcance esperado: 1,450 adjuntos sobre 860 abonos ya migrados a cxc_pagos.
-- Los ~190 adjuntos de venta_pagos SIN abono en CxC (ventas desasignadas /
-- activas sin plan) quedan intactos como entidad_tipo='venta_pago' hasta
-- resolver ese frente aparte (los 119 abonos faltantes).
--
-- DML puro (no toca schema). Idempotente: re-ejecutar no reprocesa (no quedan
-- venta_pago que matcheen y comprobante_adjunto_id ya seteado se respeta).
-- =============================================================================

begin;

-- 1) Re-apuntar los adjuntos venta_pago -> cxc_pago (match 1:1 por coda_row_id),
--    preservando el venta_pago de origen en metadata para auditoría.
with map as (
  select a.id          as adjunto_id,
         a.entidad_id  as venta_pago_id,
         cp.id         as cxc_pago_id
  from erp.adjuntos a
  join dilesa.venta_pagos vp on vp.id = a.entidad_id and vp.deleted_at is null
  join erp.cxc_pagos cp on cp.coda_row_id = vp.coda_row_id and cp.deleted_at is null
  where a.entidad_tipo = 'venta_pago'
)
update erp.adjuntos a
set entidad_tipo = 'cxc_pago',
    entidad_id   = m.cxc_pago_id,
    metadata     = coalesce(a.metadata, '{}'::jsonb)
                   || jsonb_build_object(
                        'recableado_de_venta_pago', m.venta_pago_id::text,
                        'recableado_en', now()::text,
                        'recableado_por', 'migracion 20260602180000_cxc_recablear_adjuntos'
                      )
from map m
where a.id = m.adjunto_id;

-- 2) Setear cxc_pagos.comprobante_adjunto_id al adjunto principal del abono.
--    Preferencia: comprobante de depósito > comprobante (captura nueva) >
--    recibo de caja. Solo donde aún no hay comprobante asignado.
with pref as (
  select distinct on (a.entidad_id)
         a.entidad_id as cxc_pago_id,
         a.id         as adjunto_id
  from erp.adjuntos a
  where a.entidad_tipo = 'cxc_pago'
  order by a.entidad_id,
           case a.rol
             when 'comprobante_deposito' then 0
             when 'comprobante'          then 1
             when 'recibo_caja'          then 2
             else 3
           end,
           a.created_at
)
update erp.cxc_pagos cp
set comprobante_adjunto_id = pref.adjunto_id,
    updated_at             = now()
from pref
where cp.id = pref.cxc_pago_id
  and cp.comprobante_adjunto_id is null;

commit;

notify pgrst, 'reload schema';
