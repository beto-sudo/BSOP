-- ╭─ 20260626195425_normaliza_adjuntos_expediente_digital_entidad_tipo ─╮
-- Normaliza erp.adjuntos.entidad_tipo de 'ventas' (plural) → 'venta' (singular).
--
-- La pantalla de Solicitud (app/dilesa/ventas/nueva/page.tsx) insertaba el
-- `expediente_digital` con entidad_tipo='ventas', mientras TODO el resto del sistema
-- (marcarFase, subirDocFase, endpoint /docs, fase 8) usa 'venta'. La fase 2 (Asignada)
-- leía con 'ventas' y por eso veía esos adjuntos; al migrarla al patrón colaborativo
-- (que lee 'venta'), esos 19 documentos "desaparecían". El código ya se corrigió
-- (inserta 'venta'); esto normaliza los 19 existentes para que las ventas aún sin
-- asignar (fase 1) conserven la visibilidad del expediente.
--
-- Único valor afectado: 'ventas' (19 filas, rol expediente_digital, al 2026-06-26).
-- No-destructivo (solo reetiqueta), idempotente, Preview-safe (no depende de datos de prod).

BEGIN;

UPDATE erp.adjuntos
SET entidad_tipo = 'venta'
WHERE entidad_tipo = 'ventas';

COMMIT;
