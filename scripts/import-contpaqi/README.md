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
├── dry-run.py                  # script principal (commiteado)
├── README.md                   # este archivo
├── snapshot/
│   ├── db_catalogos.json       # commiteado: puestos+departamentos por empresa, sin PII
│   ├── exclusion_baja.json     # commiteado: UUIDs accionistas/comité/consejo a excluir de bajas
│   ├── db_dilesa_empleados.json   # gitignored: contiene RFC/CURP/NSS
│   └── db_rdb_empleados.json      # gitignored: contiene RFC/CURP/NSS
└── output/
    └── dry-run-report.md       # gitignored: copia local del reporte
```

El reporte oficial vive en
[`docs/planning/import-contpaqi-dry-run-report.md`](../../docs/planning/import-contpaqi-dry-run-report.md).

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
