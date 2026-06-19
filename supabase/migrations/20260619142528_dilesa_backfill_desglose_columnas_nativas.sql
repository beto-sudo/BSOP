-- ╭─ 20260619142528_dilesa_backfill_desglose_columnas_nativas ─╮
-- Backfill de las columnas escalares de desglose (ADR-045) en las ventas nativas
-- de BSOP creadas en el HUECO entre la migración que agregó las columnas
-- (20260617215833, 17-jun 22:15) y el deploy del código que las puebla al asignar
-- (app/dilesa/ventas/nueva/page.tsx). Esas ventas tienen el snapshot rico en
-- `desglose_precio` (componentes_detallados=true) pero `precio_base` y compañía
-- en NULL → la cuadratura del sobreprecio cae a modelo legacy (`tieneDesglose`
-- exige precio_base no-NULL). Esto las "activa" copiando los valores DESDE el
-- snapshot congelado (NO re-tarifa: regla Beto de no recalcular en vivo).
--
-- NO mueve dinero: son columnas de clasificación que alimentan la VISTA de
-- cuadratura. `precio_asignacion`/`valor_escrituracion`/pagos no se tocan.
-- Idempotente (el filtro `precio_base IS NULL` no re-matchea tras correr) y
-- seguro en Preview (0 filas si no hay datos; sin INSERT/FK). Alcance verificado
-- en prod: 6 ventas activas (3 Asignada, 3 Formalizada).
--
-- Timestamp generado con `npm run db:new` (anti-colisión multi-sesión:
-- estrictamente mayor que toda migración local + de PRs abiertos).

BEGIN;

UPDATE dilesa.ventas v SET
  precio_base             = (v.desglose_precio->>'valor_comercial')::numeric,
  incremento_credito      = COALESCE((v.desglose_precio->>'costo_credito_adicional')::numeric, 0),
  valor_excedente_terreno = COALESCE((v.desglose_precio->>'valor_excedente_terreno')::numeric, 0),
  valor_frente_verde      = COALESCE((v.desglose_precio->>'valor_frente_verde')::numeric, 0),
  valor_esquina           = COALESCE((v.desglose_precio->>'valor_esquina')::numeric, 0),
  valor_venta_futuro      = COALESCE((v.desglose_precio->>'valor_venta_futuro')::numeric, 0),
  -- promoción de gastos: el bono de la promo elegida (0 si no hay), igual que el
  -- flujo de alta. Se lee de dilesa.promociones via promocion_id (no del jsonb).
  promocion_gastos_monto  = COALESCE(
                              (SELECT p.monto FROM dilesa.promociones p WHERE p.id = v.promocion_id),
                              0)
WHERE v.desglose_precio->>'componentes_detallados' = 'true'
  AND v.precio_base IS NULL
  AND (v.desglose_precio->>'valor_comercial') IS NOT NULL;

COMMIT;
