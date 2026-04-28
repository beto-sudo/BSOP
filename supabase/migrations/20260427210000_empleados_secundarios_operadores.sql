-- Sprint 4 — Empleados multi-puesto
-- Carga los puestos secundarios (Comité Ejecutivo + Consejo de Administración)
-- para los 3 operadores (Beto Santos, Alejandra Chavarría Cruz, Michelle Santos
-- Diego) en RDB y DILESA. Cierre del modelo multi-puesto:
--
-- - RDB: ya tienen Accionista como principal (cargado en Sprint 1 backfill).
--   Sólo falta agregar Comité + Consejo como secundarios.
-- - DILESA: no tenían puesto_id cargado. Primero seteamos Accionista como
--   puesto_id legacy (el trigger del Sprint 2 crea la fila principal en
--   empleados_puestos automáticamente). Luego agregamos los secundarios.
--
-- Idempotente: el UPDATE filtra por puesto_id IS NULL y el INSERT usa
-- ON CONFLICT DO NOTHING (con el partial unique index del Sprint 1).

-- 1) DILESA: Accionista como puesto_id principal (sólo si no tienen ya uno)
UPDATE erp.empleados e
SET puesto_id = (
  SELECT id FROM erp.puestos
  WHERE empresa_id = e.empresa_id
    AND nombre = 'Accionista'
  LIMIT 1
)
WHERE e.empresa_id = (SELECT id FROM core.empresas WHERE slug = 'dilesa')
  AND e.persona_id IN (
    '353fd083-cfe7-4f06-85af-c65d48ec3415',  -- Adalberto Santos de los Santos
    'b4758aad-6f1a-41cc-864e-d8ae8809fec7',  -- Alejandra Chavarría Cruz
    'dfe4f7f8-d0f4-43c1-bb49-f61e3400c7ba'   -- Michelle Santos Diego
  )
  AND e.deleted_at IS NULL
  AND e.activo = true
  AND e.puesto_id IS NULL;

-- 2) Comité Ejecutivo + Consejo de Administración como secundarios para los 3
-- operadores en RDB y DILESA. El producto cartesiano genera 12 filas
-- (3 personas × 2 empresas × 2 puestos secundarios).
WITH empleados_target AS (
  SELECT e.id AS empleado_id, e.empresa_id
  FROM erp.empleados e
  JOIN core.empresas emp ON emp.id = e.empresa_id
  WHERE emp.slug IN ('rdb', 'dilesa')
    AND e.persona_id IN (
      '353fd083-cfe7-4f06-85af-c65d48ec3415',  -- Beto
      'b4758aad-6f1a-41cc-864e-d8ae8809fec7',  -- Alejandra
      'dfe4f7f8-d0f4-43c1-bb49-f61e3400c7ba'   -- Michelle
    )
    AND e.deleted_at IS NULL
    AND e.activo = true
),
puestos_secundarios AS (
  SELECT id AS puesto_id, empresa_id
  FROM erp.puestos
  WHERE nombre IN ('Comité Ejecutivo', 'Consejo de Administracion')
    AND activo = true
)
INSERT INTO erp.empleados_puestos (empresa_id, empleado_id, puesto_id, principal)
SELECT et.empresa_id, et.empleado_id, ps.puesto_id, false
FROM empleados_target et
JOIN puestos_secundarios ps ON ps.empresa_id = et.empresa_id
ON CONFLICT DO NOTHING;
