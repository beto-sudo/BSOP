-- ════════════════════════════════════════════════════════════════════════════
-- Iniciativa dilesa-portafolio-activos · Sprint 7c-2 — KYC para FICU
-- ════════════════════════════════════════════════════════════════════════════
--
-- Expande `erp.personas` con las columnas que el FICU (Formato de
-- Identificación de Clientes — Art. 18 LFPIORPI) requiere para clientes
-- DILESA y que la Fase 1 (Solicitud de Asignación) debe capturar.
--
-- Gap analysis: el form de Coda captura 14 campos que hoy no están en
-- BSOP. Confirmados con Beto en chat:
--   - 1) EBR es **automático** (ya implementado en `lib/dilesa/ficu/riesgo.ts`)
--   - 2) Domicilio va **en la misma tabla** (no satélite separada)
--   - 3) **Toda la captura en Fase 1** (no split entre fases)
--
-- Columnas ya existentes en `erp.personas` (verificadas vía MCP):
--   nss, fecha_nacimiento, nacionalidad, estado_civil, tipo_persona (fisica/moral),
--   domicilio (text blob, se preserva como fallback).
--
-- Esta migración agrega las 13 que faltan, todas NULLABLE para no romper
-- las 1,767 filas existentes (1,300 clientes + 234 empleados + 233
-- contratistas + 47 proveedores etc.). El form Fase 1 las pedirá required
-- pero la columna en DB acepta NULL.
--
-- Scope: cross-empresa por naturaleza de erp.personas. Los campos KYC son
-- universales para cualquier empresa que requiera FICU (hoy DILESA, mañana
-- podría ser otra).
--
-- Aditiva pura — solo ALTER ADD COLUMN IF NOT EXISTS + COMMENTs. Cero
-- riesgo. Idempotente.
-- ════════════════════════════════════════════════════════════════════════════

-- ── 1. Identificación oficial ───────────────────────────────────────────────

ALTER TABLE erp.personas
  ADD COLUMN IF NOT EXISTS numero_credencial_ine text;

COMMENT ON COLUMN erp.personas.numero_credencial_ine IS
  'Número de la credencial INE/IFE del cliente. Aparece en el reverso. '
  'Captura libre — la verificación contra padrón electoral está fuera de '
  'alcance v1.';

-- ── 2. Domicilio estructurado ───────────────────────────────────────────────
-- El blob `domicilio` (text) se preserva como fallback para registros
-- históricos. Los campos nuevos son la fuente canónica para clientes nuevos
-- y los renders del FICU. Si en el futuro se migra erp.personas a satélite
-- `personas_direcciones` se hace en otro sprint.

ALTER TABLE erp.personas
  ADD COLUMN IF NOT EXISTS domicilio_calle text,
  ADD COLUMN IF NOT EXISTS domicilio_numero_exterior text,
  ADD COLUMN IF NOT EXISTS domicilio_numero_interior text,
  ADD COLUMN IF NOT EXISTS domicilio_colonia text,
  ADD COLUMN IF NOT EXISTS domicilio_codigo_postal text,
  ADD COLUMN IF NOT EXISTS domicilio_ciudad text,
  ADD COLUMN IF NOT EXISTS domicilio_estado text;

COMMENT ON COLUMN erp.personas.domicilio_calle IS 'Calle del domicilio fiscal/habitual.';
COMMENT ON COLUMN erp.personas.domicilio_numero_exterior IS 'Número exterior.';
COMMENT ON COLUMN erp.personas.domicilio_numero_interior IS 'Número interior (opcional).';
COMMENT ON COLUMN erp.personas.domicilio_colonia IS 'Colonia o fraccionamiento.';
COMMENT ON COLUMN erp.personas.domicilio_codigo_postal IS 'Código postal (5 dígitos en MX).';
COMMENT ON COLUMN erp.personas.domicilio_ciudad IS 'Ciudad o municipio.';
COMMENT ON COLUMN erp.personas.domicilio_estado IS 'Entidad federativa (texto libre, ej. "Coahuila").';

-- ── 3. PEP (Persona Expuesta Políticamente) ────────────────────────────────

ALTER TABLE erp.personas
  ADD COLUMN IF NOT EXISTS es_pep boolean DEFAULT false;

COMMENT ON COLUMN erp.personas.es_pep IS
  'Persona Expuesta Políticamente (LFPIORPI Art. 3 frac. III). '
  'true = cliente declara ser PEP o familiar/asociado directo. '
  'Default false. Alimenta nivelPEP() del EBR.';

-- ── 4. Forma de pago + Uso de efectivo (criterios EBR principales) ─────────

ALTER TABLE erp.personas
  ADD COLUMN IF NOT EXISTS forma_pago_kyc text,
  ADD COLUMN IF NOT EXISTS uso_efectivo_kyc text;

COMMENT ON COLUMN erp.personas.forma_pago_kyc IS
  'Forma de pago declarada para la operación (FICU). Valores canónicos '
  'definidos en lib/dilesa/ficu/catalogos.ts. Alimenta nivelFormaPago() '
  'del EBR — Crédito hipotecario/Infonavit/Fovissste → Bajo, recursos '
  'propios → Medio, efectivo significativo → Alto.';

COMMENT ON COLUMN erp.personas.uso_efectivo_kyc IS
  'Si la operación involucra uso de efectivo (LFPIORPI). Valores canónicos '
  'en lib/dilesa/ficu/catalogos.ts. Alimenta nivelUsoEfectivo() del EBR.';

-- ── 5. Dueño beneficiario + Ocupación ──────────────────────────────────────

ALTER TABLE erp.personas
  ADD COLUMN IF NOT EXISTS conocimiento_dueno_beneficiario text DEFAULT 'No',
  ADD COLUMN IF NOT EXISTS ocupacion text;

COMMENT ON COLUMN erp.personas.conocimiento_dueno_beneficiario IS
  'Declaración del cliente sobre si hay un dueño beneficiario distinto '
  '(LFPIORPI). En residencial casi siempre "No" (el comprador ES el '
  'beneficiario). Si "Sí", requiere captura adicional fuera de v1.';

COMMENT ON COLUMN erp.personas.ocupacion IS
  'Actividad/ocupación/profesión del cliente. Catálogo SAT/UIF en '
  'lib/dilesa/ficu/catalogos.ts.';

NOTIFY pgrst, 'reload schema';
