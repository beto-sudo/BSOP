-- ╭─ 20260611181150_backfill_kyc_personas_desde_ventas ─╮
-- Backfill KYC: erp.personas ← dilesa.ventas (ventas importadas de Coda).
--
-- El import de Coda (import_dilesa_ventas.ts) guardó los campos KYC del
-- FICU per-venta en dilesa.ventas (ocupacion, forma_pago, uso_efectivo,
-- conocimiento_dueno_beneficiario, es_pep); el modelo actual (Sprint 7c-2)
-- los lee de erp.personas, donde quedaron NULL para esas ~835 ventas y el
-- FICU/promesa salían con los campos en blanco.
--
-- Política:
--   * Solo rellena NULLs en la persona — nunca pisa un valor capturado.
--   * Si la persona tiene varias ventas activas, gana el valor más
--     reciente por campo (hoy no hay conflictos: 0 personas con valores
--     distintos entre ventas).
--   * es_pep es OR de todas las ventas activas: 45 ventas Coda traen
--     PEP=true y la persona quedó en false por DEFAULT de columna;
--     elevar false→true es lo conservador (LFPIORPI), nunca degradar.
--
-- Idempotente. En Supabase Preview (sin datos de prod) actualiza 0 filas.
--
-- Timestamp generado con `npm run db:new` (anti-colisión multi-sesión:
-- estrictamente mayor que toda migración local + de PRs abiertos).

BEGIN;

UPDATE erp.personas p
SET
  ocupacion = COALESCE(p.ocupacion, vk.ocupacion),
  forma_pago_kyc = COALESCE(p.forma_pago_kyc, vk.forma_pago),
  uso_efectivo_kyc = COALESCE(p.uso_efectivo_kyc, vk.uso_efectivo),
  conocimiento_dueno_beneficiario = COALESCE(
    p.conocimiento_dueno_beneficiario,
    vk.conocimiento_dueno_beneficiario
  ),
  es_pep = (COALESCE(p.es_pep, false) OR vk.alguna_pep),
  updated_at = now()
FROM (
  SELECT
    v.persona_id,
    (ARRAY_AGG(v.ocupacion ORDER BY v.created_at DESC)
       FILTER (WHERE v.ocupacion IS NOT NULL))[1] AS ocupacion,
    (ARRAY_AGG(v.forma_pago ORDER BY v.created_at DESC)
       FILTER (WHERE v.forma_pago IS NOT NULL))[1] AS forma_pago,
    (ARRAY_AGG(v.uso_efectivo ORDER BY v.created_at DESC)
       FILTER (WHERE v.uso_efectivo IS NOT NULL))[1] AS uso_efectivo,
    (ARRAY_AGG(v.conocimiento_dueno_beneficiario ORDER BY v.created_at DESC)
       FILTER (WHERE v.conocimiento_dueno_beneficiario IS NOT NULL))[1]
      AS conocimiento_dueno_beneficiario,
    BOOL_OR(COALESCE(v.es_pep, false)) AS alguna_pep
  FROM dilesa.ventas v
  WHERE v.deleted_at IS NULL
  GROUP BY v.persona_id
) vk
WHERE vk.persona_id = p.id
  AND (
    (p.ocupacion IS NULL AND vk.ocupacion IS NOT NULL)
    OR (p.forma_pago_kyc IS NULL AND vk.forma_pago IS NOT NULL)
    OR (p.uso_efectivo_kyc IS NULL AND vk.uso_efectivo IS NOT NULL)
    OR (
      p.conocimiento_dueno_beneficiario IS NULL
      AND vk.conocimiento_dueno_beneficiario IS NOT NULL
    )
    OR (vk.alguna_pep AND NOT COALESCE(p.es_pep, false))
  );

COMMIT;
