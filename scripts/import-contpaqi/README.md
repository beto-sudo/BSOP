# scripts/import-contpaqi

Sprint 3 de la iniciativa
[`import-empleados-contpaqi`](../../docs/planning/import-empleados-contpaqi.md).

Script Python self-contained que lee los Excel CONTPAQi de DILESA y RDB,
los matchea contra un snapshot de la DB de Supabase, y emite un reporte
markdown del plan de inserts/updates/bajas candidatas.

**No toca DB.** El apply va en Sprint 4 tras el OK de Beto al reporte.

## Uso

```bash
# Inputs por default: ~/Downloads/Empleados_{Dilesa,RDB}.xlsx
python3 scripts/import-contpaqi/dry-run.py \
  --out scripts/import-contpaqi/output/dry-run-report.md
```

Configurable vía env vars:

```bash
EMPLEADOS_DILESA_XLSX=/ruta/Empleados_Dilesa.xlsx \
EMPLEADOS_RDB_XLSX=/ruta/Empleados_RDB.xlsx \
OUT_REPORT=./reporte.md \
  python3 scripts/import-contpaqi/dry-run.py
```

Requiere `openpyxl` (`pip3 install openpyxl`).

## Estructura

```
scripts/import-contpaqi/
├── dry-run.py                       # Sprint 3 — emite reporte markdown
├── apply.py                         # Sprint 4 — emite migración SQL transaccional
├── README.md
├── snapshot/
│   ├── db_catalogos.json            # commiteado: puestos+departamentos por empresa
│   ├── exclusion_baja.json          # commiteado: UUIDs no marcados baja (accionistas/comité/consejo + sospechosos)
│   ├── conflict_resolution.json     # commiteado: resolución de los 6 RFC ambiguos
│   ├── bajas_seleccionadas.json     # commiteado: bajas candidatas que se aplican
│   ├── db_dilesa_empleados.json     # gitignored: PII (RFC/CURP/NSS)
│   └── db_rdb_empleados.json        # gitignored: PII (RFC/CURP/NSS)
├── sql/
│   └── apply-2026-04-30.sql         # SQL transaccional generado por apply.py
└── output/
    └── dry-run-report.md            # gitignored: copia local del reporte (oficial está en docs/planning/)
```

## Sprint 4 — apply (data migration manual, no schema)

```bash
# 1. Generar SQL
python3 scripts/import-contpaqi/apply.py
# → scripts/import-contpaqi/sql/apply-2026-04-30.sql

# 2. Aplicar UNA SOLA VEZ con psql contra prod
set -a && source .env.local && set +a
psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -e \
  -f scripts/import-contpaqi/sql/apply-2026-04-30.sql
```

**El SQL NO va a `supabase/migrations/`** porque:

1. Es operación de DATOS, no de schema. El schema delta vive en la
   migración separada `20260501000000_import_empleados_contpaqi_schema_delta.sql`.
2. Supabase Preview genera DBs vacías desde las migrations (sin
   `core.empresas` ni empleados existentes), por lo que la apply
   fallaría en preview con FK violations.
3. Re-aplicar duplicaría inserts. Convenio: se aplica una vez por
   snapshot, audit en `erp.empleados_import_log`.

## Cómo regenerar los snapshots de DB

Los snapshots `db_dilesa_empleados.json` y `db_rdb_empleados.json` no se
commitean (PII). Para regenerarlos, corré contra la DB:

```sql
-- DILESA
SELECT
  emp.id AS empleado_id, emp.persona_id, emp.numero_empleado,
  emp.fecha_ingreso, emp.fecha_baja, emp.motivo_baja, emp.activo,
  emp.departamento_id, emp.puesto_id,
  p.nombre AS persona_nombre, p.apellido_paterno, p.apellido_materno,
  p.rfc, p.curp, COALESCE(p.nss, emp.nss) AS nss, p.fecha_nacimiento
FROM erp.empleados emp
JOIN core.empresas e ON e.id = emp.empresa_id
JOIN erp.personas p ON p.id = emp.persona_id
WHERE e.slug = 'dilesa' AND emp.deleted_at IS NULL
ORDER BY emp.numero_empleado NULLS LAST;
```

(reemplazá `'dilesa'` por `'rdb'` para el otro snapshot)

`db_catalogos.json` y `exclusion_baja.json` sí están commiteados — no
contienen PII (solo IDs y nombres de catálogo).

## Reglas del match

1. **CURP exacto** (post normalización: trim + upper)
2. **RFC exacto** (post normalización: quitar guiones + trim + upper)
3. **Fuzzy**: apellido_paterno + apellido_materno + nombre + fecha_nacimiento
4. **`numero_empleado` dentro de la misma empresa**

Si match → UPDATE solo de campos cambiados.
Si no match → INSERT.

## Cluster RDB-en-DILESA

Empleados con `Departamento='Rincon del Bosque'` en Excel DILESA:

- **Activos (A/R) NO duplicados en RDB-DB**: doble fila — alta+baja DILESA
  con fecha pivote 2026-04-30, alta nueva RDB con fecha_ingreso 2026-05-01.
- **Bajas (B)**: solo histórico DILESA, no abrir RDB.

## Detección de bajas

Empleados activos en DB cuyo CURP/RFC NO está en el Excel CONTPAQi de su
empresa → candidato a baja, **excluyendo** los UUIDs en `exclusion_baja.json`
(accionistas / Comité Ejecutivo / Consejo de Administración).
