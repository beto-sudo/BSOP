-- ╭──────────────────────────────────────────────────────────────────╮
-- │  20260430160000_erp_finiquitos                                    │
-- │                                                                    │
-- │  Crea `erp.finiquitos` — registro persistente de los convenios     │
-- │  de terminación laboral generados desde                            │
-- │  `<EmpleadoFiniquitoModule>`. Cada fila es el snapshot completo    │
-- │  del cálculo al momento de imprimir, con datos del empleado,       │
-- │  patrón, conceptos, totales y forma de pago.                       │
-- │                                                                    │
-- │  Iniciativa: `finiquito-mejoras` (Sprint 2). Ver                   │
-- │  `docs/planning/finiquito-mejoras.md`.                             │
-- │                                                                    │
-- │  Política de inmutabilidad: una vez insertado, el registro NO se   │
-- │  edita ni borra (audit trail). Si hay error en un finiquito ya     │
-- │  generado, se inserta uno nuevo y se referencia desde el           │
-- │  histórico — `UPDATE`/`DELETE` quedan restringidos a admin para    │
-- │  emergencias operativas.                                           │
-- ╰──────────────────────────────────────────────────────────────────╯

BEGIN;

-- ─── Tabla ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS erp.finiquitos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  empleado_id uuid NOT NULL REFERENCES erp.empleados (id),
  -- empresa_id se denormaliza para que las policies RLS no tengan que
  -- hacer JOIN con erp.empleados en cada SELECT.
  empresa_id uuid NOT NULL REFERENCES core.empresas (id),

  -- ── Convenio ────────────────────────────────────────────────────────
  fecha_baja date NOT NULL,
  fecha_convenio date NOT NULL,
  causa text NOT NULL CHECK (
    causa IN (
      'renuncia',
      'mutuo_consentimiento',
      'termino_contrato',
      'despido_justificado',
      'despido_injustificado',
      'muerte',
      'incapacidad'
    )
  ),
  motivo_detalle text,

  -- ── Antigüedad (snapshot) ───────────────────────────────────────────
  fecha_ingreso date NOT NULL,
  antiguedad_anios integer NOT NULL,
  antiguedad_meses integer NOT NULL,
  antiguedad_dias integer NOT NULL,

  -- ── Sueldos al momento del cálculo ─────────────────────────────────
  sueldo_diario numeric(12, 2) NOT NULL,
  sdi numeric(12, 2),
  salario_minimo_diario numeric(12, 2) NOT NULL,
  zona_salario_minimo text NOT NULL CHECK (
    zona_salario_minimo IN ('frontera', 'general')
  ),

  -- ── Totales ────────────────────────────────────────────────────────
  total_finiquito numeric(14, 2) NOT NULL,
  total_indemnizacion numeric(14, 2) NOT NULL DEFAULT 0,
  total_general numeric(14, 2) NOT NULL,

  -- ── Snapshots inmutables (jsonb) ───────────────────────────────────
  -- conceptos: array de FiniquitoConcepto[] (concepto/dias/tasa/monto/nota)
  conceptos jsonb NOT NULL,
  -- notas_calculo: array de strings que el cálculo emite (ej. "Prima
  -- de antigüedad NO aplica: …").
  notas_calculo jsonb NOT NULL DEFAULT '[]'::jsonb,
  -- empleado_snapshot: { nombre, apellido_paterno, apellido_materno,
  -- rfc, nss, puesto, departamento, numero_empleado }.
  empleado_snapshot jsonb NOT NULL,
  -- patron_snapshot: { razonSocial, rfc, domicilio, municipio, estado,
  -- representanteLegal, registroPatronalImss, ... } — congelado al
  -- momento de generación para que cambios futuros en core.empresas
  -- no alteren el documento histórico.
  patron_snapshot jsonb NOT NULL,

  -- ── Forma de pago ──────────────────────────────────────────────────
  forma_pago text NOT NULL CHECK (
    forma_pago IN ('efectivo', 'cheque', 'transferencia')
  ),
  referencia_pago text,

  -- ── Audit ──────────────────────────────────────────────────────────
  creado_por uuid REFERENCES auth.users (id),
  creado_en timestamptz NOT NULL DEFAULT now()
);

-- ─── Comentarios ──────────────────────────────────────────────────────

COMMENT ON TABLE erp.finiquitos IS
  'Snapshot inmutable de cada convenio de terminación laboral generado en BSOP. Una fila por finiquito firmado/impreso. UPDATE/DELETE solo admin.';
COMMENT ON COLUMN erp.finiquitos.empresa_id IS
  'Denormalizado de erp.empleados para evitar JOIN en RLS.';
COMMENT ON COLUMN erp.finiquitos.fecha_baja IS
  'Fecha efectiva de terminación de la relación laboral.';
COMMENT ON COLUMN erp.finiquitos.fecha_convenio IS
  'Fecha en que se firma/imprime el convenio (puede diferir de fecha_baja).';
COMMENT ON COLUMN erp.finiquitos.zona_salario_minimo IS
  'Zona CONASAMI usada para tope de prima de antigüedad: frontera (ZLFN) o general.';
COMMENT ON COLUMN erp.finiquitos.conceptos IS
  'Array snapshot de FiniquitoConcepto[]: [{concepto, dias?, tasa?, monto, nota?}, …].';
COMMENT ON COLUMN erp.finiquitos.empleado_snapshot IS
  'Snapshot inmutable del empleado al momento de generación.';
COMMENT ON COLUMN erp.finiquitos.patron_snapshot IS
  'Snapshot inmutable de la empresa/patrón. Cambios futuros en core.empresas no afectan finiquitos históricos.';
COMMENT ON COLUMN erp.finiquitos.referencia_pago IS
  'Número de cheque, referencia de transferencia u otro identificador del pago. NULL si forma_pago=efectivo.';

-- ─── Índices ──────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS finiquitos_empleado_id_idx
  ON erp.finiquitos (empleado_id);

CREATE INDEX IF NOT EXISTS finiquitos_empresa_id_idx
  ON erp.finiquitos (empresa_id);

CREATE INDEX IF NOT EXISTS finiquitos_creado_en_idx
  ON erp.finiquitos (creado_en DESC);

-- ─── RLS ──────────────────────────────────────────────────────────────

ALTER TABLE erp.finiquitos ENABLE ROW LEVEL SECURITY;

-- SELECT: cualquier miembro activo de la empresa o admin global.
DROP POLICY IF EXISTS erp_finiquitos_select ON erp.finiquitos;
CREATE POLICY erp_finiquitos_select
  ON erp.finiquitos
  FOR SELECT
  TO authenticated
  USING (core.fn_has_empresa(empresa_id) OR core.fn_is_admin());

-- INSERT: cualquier miembro de la empresa puede crear finiquitos.
-- (la UI ya gatea el acceso por permisos al módulo RH).
DROP POLICY IF EXISTS erp_finiquitos_insert ON erp.finiquitos;
CREATE POLICY erp_finiquitos_insert
  ON erp.finiquitos
  FOR INSERT
  TO authenticated
  WITH CHECK (core.fn_has_empresa(empresa_id) OR core.fn_is_admin());

-- UPDATE: solo admin (audit trail estricto: los finiquitos ya generados
-- no se editan, se generan nuevos si hay error).
DROP POLICY IF EXISTS erp_finiquitos_update ON erp.finiquitos;
CREATE POLICY erp_finiquitos_update
  ON erp.finiquitos
  FOR UPDATE
  TO authenticated
  USING (core.fn_is_admin())
  WITH CHECK (core.fn_is_admin());

-- DELETE: solo admin (mismo razonamiento).
DROP POLICY IF EXISTS erp_finiquitos_delete ON erp.finiquitos;
CREATE POLICY erp_finiquitos_delete
  ON erp.finiquitos
  FOR DELETE
  TO authenticated
  USING (core.fn_is_admin());

-- ─── Reload PostgREST ────────────────────────────────────────────────

NOTIFY pgrst, 'reload schema';

COMMIT;
