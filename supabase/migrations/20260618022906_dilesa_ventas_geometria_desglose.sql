-- Desglose de geometría del lote en la cadena de precio de la cuadratura
-- (iniciativa dilesa-cuadratura-sobreprecio).
--
-- La cadena de precio que el cliente firma en la Solicitud de Asignación es:
--   precio_base (VALOR COMERCIAL ACTUAL)
--     + valor_excedente_terreno   (m² excedentes × precio por m²)
--     + valor_frente_verde        (% del precio)
--     + valor_esquina             (% del precio)
--     + valor_venta_futuro        (snapshot)
--     + incremento_credito        (+6% FOVISSSTE/IMSS, sobre base+geom+sobreprecio)
--     + productos_adicionales     (sobreprecio)
--     = valor_escrituracion
--
-- Hasta ahora la cuadratura solo tenía `precio_base`, `incremento_credito` y
-- `productos_adicionales`, así que la geometría del lote quedaba PLEGADA dentro
-- del precio base. Para las ventas con esquina/frente verde/excedente eso
-- inflaba la base (decisión Beto 2026-06-18: desglosar cada premio por separado,
-- tomando el valor EXACTO de la Solicitud de Asignación firmada — no recalcular,
-- para que BSOP quede idéntico al PDF). Estas 4 columnas guardan el premio
-- congelado de cada venta (NULL = sin desglose / sin premio).

ALTER TABLE dilesa.ventas
  ADD COLUMN IF NOT EXISTS valor_excedente_terreno numeric(14, 2),
  ADD COLUMN IF NOT EXISTS valor_frente_verde numeric(14, 2),
  ADD COLUMN IF NOT EXISTS valor_esquina numeric(14, 2),
  ADD COLUMN IF NOT EXISTS valor_venta_futuro numeric(14, 2);

COMMENT ON COLUMN dilesa.ventas.valor_excedente_terreno IS
  'Premio por m² excedentes de terreno, congelado de la Solicitud de Asignación. Componente de la cadena de precio (ver migración 20260618022906).';
COMMENT ON COLUMN dilesa.ventas.valor_frente_verde IS
  'Premio por frente verde (% del precio), congelado de la Solicitud de Asignación.';
COMMENT ON COLUMN dilesa.ventas.valor_esquina IS
  'Premio por esquina (% del precio según clasificación), congelado de la Solicitud de Asignación.';
COMMENT ON COLUMN dilesa.ventas.valor_venta_futuro IS
  'Valor de venta futuro (snapshot), congelado de la Solicitud de Asignación.';

NOTIFY pgrst, 'reload schema';
