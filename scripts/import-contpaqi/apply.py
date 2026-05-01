#!/usr/bin/env python3
"""Genera la migración SQL transaccional del import CONTPAQi (Sprint 4).

Iniciativa: import-empleados-contpaqi.

Reusa parse_excel/build_match_index/build_plan de dry-run.py vía importlib.
Aplica overrides:
  - conflict_resolution.json: para los códigos en conflicto (RFC ambiguous),
    mueve el record a UPDATE en el `update_db_id` específico, marca
    soft-deletes en `soft_delete_db_ids`.
  - bajas_seleccionadas.json: filtra BAJAS_CANDIDATAS al subconjunto
    aprobado por Beto (los demás no se tocan, quedan flagged).
  - exclusion_baja.json: incluye los 6 nuevos IDs de Sospechosos
    (apellidos Santos/Chavarría) que Beto pidió no marcar baja.

Emite SQL transaccional: BEGIN; ... COMMIT; con:
  - UPDATEs en `erp.personas` y `erp.empleados` (incluyendo overrides
    de conflict_resolution).
  - Soft-deletes (deleted_at = now()) en duplicados.
  - INSERTs en `erp.personas` + `erp.empleados` + `erp.empleados_compensacion`
    + `erp.empleados_pago` (cuando hay banco/cuenta).
  - UPDATEs adicionales para bajas seleccionadas.
  - INSERTs en `erp.empleados_import_log` (audit trail).
  - NOTIFY pgrst al final.

Uso:
  python3 scripts/import-contpaqi/apply.py \
    --out supabase/migrations/20260501020000_import_empleados_contpaqi_apply.sql
"""

from __future__ import annotations
import argparse
import importlib.util
import json
import os
import re
import sys
from datetime import date, datetime
from pathlib import Path
from typing import Optional

# Cargar dry-run.py como módulo (tiene guión, requiere importlib)
_HERE = Path(__file__).parent
_dr_spec = importlib.util.spec_from_file_location("dry_run", _HERE / "dry-run.py")
dry_run = importlib.util.module_from_spec(_dr_spec)
sys.modules["dry_run"] = dry_run
_dr_spec.loader.exec_module(dry_run)


# ---------------------------------------------------------------------------
# SQL helpers
# ---------------------------------------------------------------------------

def sql_quote(v) -> str:
    """Quote para literales SQL — strings con escape de comillas, NULL para None."""
    if v is None or v == "":
        return "NULL"
    if isinstance(v, bool):
        return "true" if v else "false"
    if isinstance(v, (int, float)):
        return str(v)
    if isinstance(v, date):
        return f"'{v.isoformat()}'"
    s = str(v).replace("'", "''")
    return f"'{s}'"


def empresa_id_subq(slug: str) -> str:
    return f"(SELECT id FROM core.empresas WHERE slug = '{slug}')"


def depto_id_subq(slug: str, nombre: Optional[str]) -> str:
    if not nombre:
        return "NULL"
    n = nombre.replace("'", "''")
    return f"(SELECT id FROM erp.departamentos WHERE empresa_id = {empresa_id_subq(slug)} AND nombre = '{n}' LIMIT 1)"


def puesto_id_subq(slug: str, nombre: Optional[str]) -> str:
    if not nombre:
        return "NULL"
    n = nombre.replace("'", "''")
    return f"(SELECT id FROM erp.puestos WHERE empresa_id = {empresa_id_subq(slug)} AND nombre = '{n}' LIMIT 1)"


def excel_to_personas_fields(ex: dict) -> dict:
    """Mapea campos Excel a columnas de erp.personas."""
    return {
        "nombre": ex.get("nombre"),
        "apellido_paterno": ex.get("apellido_paterno"),
        "apellido_materno": ex.get("apellido_materno"),
        "rfc": ex.get("rfc"),
        "curp": ex.get("curp"),
        "nss": ex.get("nss"),
        "fecha_nacimiento": ex.get("fecha_nacimiento"),
        "sexo": ex.get("sexo"),
        "estado_civil": ex.get("estado_civil"),
        "lugar_nacimiento": ex.get("lugar_nacimiento"),
        "domicilio": ex.get("direccion"),
        "telefono": ex.get("telefono"),
        "email": ex.get("email"),
        "tipo": "empleado",
        "tipo_persona": "fisica",
    }


# Mapeos para CHECK constraints de erp.empleados_compensacion
FRECUENCIA_PAGO_MAP = {
    "Semanal": "semanal",
    "Quincenal": "quincenal",
    "Catorcenal": "quincenal",  # CONTPAQi tiene catorcenal pero compensacion no — uso quincenal
    "Mensual": "mensual",
    "Decenal": "semanal",
}

# Código SAT (col 5 Excel) → categoría aceptada por erp.empleados_compensacion.tipo_contrato.
# CONTPAQi 100% '01' (Sueldos y Salarios) → 'indefinido'.
TIPO_CONTRATO_COMPENSACION_MAP = {
    "01": "indefinido",
    "02": "temporal",
    "03": "por_obra",
    "04": "honorarios",
}


def comp_frecuencia(periodo_excel):
    if not periodo_excel:
        return None
    return FRECUENCIA_PAGO_MAP.get(periodo_excel.strip(), "semanal")


def comp_tipo_contrato(tipo_sat):
    if not tipo_sat:
        return None
    return TIPO_CONTRATO_COMPENSACION_MAP.get(str(tipo_sat).strip(), "indefinido")


def excel_to_empleados_fields(ex: dict, empresa_slug: str) -> dict:
    """Mapea campos Excel a columnas de erp.empleados (sin empresa_id/persona_id/depto_id/puesto_id que requieren subqueries)."""
    return {
        "numero_empleado": ex.get("codigo"),
        "fecha_ingreso": ex.get("fecha_alta"),
        "fecha_baja": ex.get("fecha_baja"),
        "motivo_baja": ex.get("causa_baja") if ex.get("estatus") == "B" else None,
        "activo": ex.get("activo"),
        "nss": ex.get("nss"),
        "fecha_nacimiento": ex.get("fecha_nacimiento"),
        "tipo_contrato": ex.get("tipo_contrato_sat"),
        "horario": ex.get("turno"),
        "umf": ex.get("umf"),
        "zona_salario": ex.get("zona_salario"),
        "regimen_imss": ex.get("regimen_imss"),
        "tipo_prestacion": ex.get("tipo_prestacion"),
        "sindicalizado": ex.get("sindicalizado"),
        "metodo_pago_sat": ex.get("metodo_pago_sat"),
    }


# ---------------------------------------------------------------------------
# SQL renderers
# ---------------------------------------------------------------------------

def render_insert_block(ex: dict, empresa_slug: str, snapshot_origen: str, snapshot_fecha: date) -> list[str]:
    """Genera SQL para insertar persona+empleado+compensacion+pago+audit log."""
    sql = []
    persona = excel_to_personas_fields(ex)
    empleado = excel_to_empleados_fields(ex, empresa_slug)

    # Persona insert con DO clause
    p_cols = ", ".join(persona.keys()) + ", empresa_id"
    p_vals = ", ".join(sql_quote(v) for v in persona.values()) + f", {empresa_id_subq(empresa_slug)}"

    # Empleado insert (referencia persona via CTE)
    e_cols = ", ".join(empleado.keys()) + ", empresa_id, persona_id, departamento_id, puesto_id"
    e_vals = ", ".join(sql_quote(v) for v in empleado.values())
    e_vals += f", {empresa_id_subq(empresa_slug)}, np.id, {depto_id_subq(empresa_slug, ex.get('departamento_norm'))}, {puesto_id_subq(empresa_slug, ex.get('puesto_norm'))}"

    sql.append(f"-- INSERT empleado código {ex['codigo']}: {ex.get('apellido_paterno','')} {ex.get('apellido_materno','')} {ex.get('nombre','')}")
    sql.append(f"WITH np AS (")
    sql.append(f"  INSERT INTO erp.personas ({p_cols})")
    sql.append(f"  VALUES ({p_vals})")
    sql.append(f"  RETURNING id")
    sql.append(f"), ne AS (")
    sql.append(f"  INSERT INTO erp.empleados ({e_cols})")
    sql.append(f"  SELECT {e_vals} FROM np")
    sql.append(f"  RETURNING id, persona_id")
    sql.append(f")")

    # Compensación + pago + log dependen del id del empleado
    inserts = []

    # empleados_compensacion (vigente=true)
    if ex.get("salario_diario") or ex.get("sbc_parte_fija"):
        comp_cols = "empresa_id, empleado_id, sueldo_diario, sdi, tipo_contrato, frecuencia_pago, fecha_inicio, vigente"
        fecha_inicio = ex.get("fecha_alta") or snapshot_fecha
        comp_vals = (
            f"{empresa_id_subq(empresa_slug)}, ne.id, "
            f"{sql_quote(ex.get('salario_diario'))}, {sql_quote(ex.get('sbc_parte_fija'))}, "
            f"{sql_quote(comp_tipo_contrato(ex.get('tipo_contrato_sat')))}, {sql_quote(comp_frecuencia(ex.get('tipo_periodo')))}, "
            f"{sql_quote(fecha_inicio)}, true"
        )
        inserts.append(("empleados_compensacion", comp_cols, comp_vals))

    # empleados_pago (vigente=true) — solo si hay banco+cuenta
    if (ex.get("banco_codigo") or ex.get("clabe")) and (ex.get("numero_cuenta") or ex.get("clabe")):
        pago_cols = "empresa_id, empleado_id, banco_codigo, numero_cuenta, sucursal, clabe, vigente, fecha_inicio"
        clabe = ex.get("clabe")
        if clabe and not re.match(r"^[0-9]{18}$", clabe):
            clabe = None  # CHECK constraint exige 18 dígitos
        fecha_inicio = ex.get("fecha_alta") or snapshot_fecha
        pago_vals = (
            f"{empresa_id_subq(empresa_slug)}, ne.id, "
            f"{sql_quote(ex.get('banco_codigo'))}, {sql_quote(ex.get('numero_cuenta'))}, "
            f"{sql_quote(ex.get('sucursal_banco'))}, {sql_quote(clabe)}, true, "
            f"{sql_quote(fecha_inicio)}"
        )
        inserts.append(("empleados_pago", pago_cols, pago_vals))

    # Audit log
    diff_jsonb = json.dumps({k: (v.isoformat() if isinstance(v, date) else v) for k, v in {**persona, **empleado}.items() if v is not None}, ensure_ascii=False).replace("'", "''")
    log_cols = "empresa_id, empleado_id, persona_id, snapshot_fecha, origen, accion, match_metodo, diff"
    log_vals = (
        f"{empresa_id_subq(empresa_slug)}, ne.id, ne.persona_id, "
        f"{sql_quote(snapshot_fecha)}, {sql_quote(snapshot_origen)}, "
        f"'insert', NULL, '{diff_jsonb}'::jsonb"
    )
    inserts.append(("empleados_import_log", log_cols, log_vals))

    # Render como cadena de INSERT ... SELECT ... FROM ne
    if not inserts:
        sql.append(f"INSERT INTO erp.empleados_import_log ({log_cols}) SELECT {log_vals} FROM ne;")
    else:
        for i, (table, cols, vals) in enumerate(inserts):
            if i == 0:
                sql.append(f"INSERT INTO erp.{table} ({cols}) SELECT {vals} FROM ne;")
            else:
                # Para inserts adicionales, repetimos lookup por persona_id
                # Reemplazamos `ne.id` por subquery a empleados via persona's RFC/CURP
                # Más simple: hacer todo dentro de un CTE chain
                sql.append(f"INSERT INTO erp.{table} ({cols.replace('ne.id', 'e.id')}) SELECT {vals.replace('ne.id', 'e.id').replace('ne.persona_id', 'e.persona_id')} FROM erp.empleados e WHERE e.empresa_id = {empresa_id_subq(empresa_slug)} AND e.numero_empleado = {sql_quote(ex['codigo'])} ORDER BY e.created_at DESC LIMIT 1;")

    sql.append("")
    return sql


def render_update_block(ex: dict, db_empleado_id: str, db_persona_id: Optional[str], empresa_slug: str,
                        match_metodo: Optional[str], close_cycle_baja: Optional[date],
                        snapshot_origen: str, snapshot_fecha: date) -> list[str]:
    """Genera SQL para actualizar persona+empleado existentes."""
    sql = []
    persona = excel_to_personas_fields(ex)
    empleado = excel_to_empleados_fields(ex, empresa_slug)

    if close_cycle_baja:
        # Override: cerrar el ciclo viejo con f_baja específica (caso 131 reingreso)
        empleado["fecha_baja"] = close_cycle_baja
        empleado["activo"] = False
        if not empleado["motivo_baja"]:
            empleado["motivo_baja"] = ex.get("causa_baja") or "Reingreso (ciclo anterior)"

    # UPDATE personas (solo donde Excel tiene valor — no sobreescribir con NULL).
    # Se EXCLUYEN tipo/tipo_persona para no pisar valores especiales (ej. 'accionista').
    p_sets = [f"{k} = COALESCE({sql_quote(v)}, p.{k})" for k, v in persona.items()
              if v is not None and k not in ("tipo", "tipo_persona")]
    if p_sets:
        sql.append(f"-- UPDATE persona del empleado {db_empleado_id} (código Excel {ex['codigo']})")
        sql.append(f"UPDATE erp.personas p SET {', '.join(p_sets)}")
        sql.append(f"FROM erp.empleados e WHERE p.id = e.persona_id AND e.id = {sql_quote(db_empleado_id)};")
        sql.append("")

    # UPDATE empleados (campos del Excel — sí sobreescribimos numero_empleado/depto/puesto/etc)
    e_sets = []
    for k, v in empleado.items():
        if v is None and k not in ("activo", "fecha_baja", "motivo_baja"):
            continue
        if k == "activo":
            e_sets.append(f"activo = {sql_quote(v)}")
        else:
            e_sets.append(f"{k} = {sql_quote(v)}")
    e_sets.append(f"departamento_id = COALESCE({depto_id_subq(empresa_slug, ex.get('departamento_norm'))}, departamento_id)")
    e_sets.append(f"puesto_id = COALESCE({puesto_id_subq(empresa_slug, ex.get('puesto_norm'))}, puesto_id)")
    sql.append(f"UPDATE erp.empleados SET {', '.join(e_sets)} WHERE id = {sql_quote(db_empleado_id)};")
    sql.append("")

    # Compensación: upsert vigente=true (si Excel trae salario)
    if ex.get("salario_diario") or ex.get("sbc_parte_fija"):
        sql.append(f"-- Compensación vigente para empleado {db_empleado_id}")
        sql.append(f"UPDATE erp.empleados_compensacion SET vigente = false, fecha_fin = {sql_quote(snapshot_fecha)}")
        sql.append(f"WHERE empleado_id = {sql_quote(db_empleado_id)} AND vigente = true;")
        comp_cols = "empresa_id, empleado_id, sueldo_diario, sdi, tipo_contrato, frecuencia_pago, fecha_inicio, vigente"
        fecha_inicio = ex.get("fecha_alta") or snapshot_fecha
        comp_vals = (
            f"{empresa_id_subq(empresa_slug)}, {sql_quote(db_empleado_id)}, "
            f"{sql_quote(ex.get('salario_diario'))}, {sql_quote(ex.get('sbc_parte_fija'))}, "
            f"{sql_quote(comp_tipo_contrato(ex.get('tipo_contrato_sat')))}, {sql_quote(comp_frecuencia(ex.get('tipo_periodo')))}, "
            f"{sql_quote(fecha_inicio)}, true"
        )
        sql.append(f"INSERT INTO erp.empleados_compensacion ({comp_cols}) VALUES ({comp_vals});")
        sql.append("")

    # Pago: upsert vigente=true (si Excel trae banco+cuenta)
    if (ex.get("banco_codigo") or ex.get("clabe")) and (ex.get("numero_cuenta") or ex.get("clabe")):
        clabe = ex.get("clabe")
        if clabe and not re.match(r"^[0-9]{18}$", clabe):
            clabe = None
        sql.append(f"-- Pago vigente para empleado {db_empleado_id}")
        sql.append(f"UPDATE erp.empleados_pago SET vigente = false, fecha_fin = {sql_quote(snapshot_fecha)}")
        sql.append(f"WHERE empleado_id = {sql_quote(db_empleado_id)} AND vigente = true;")
        pago_cols = "empresa_id, empleado_id, banco_codigo, numero_cuenta, sucursal, clabe, vigente, fecha_inicio"
        fecha_inicio = ex.get("fecha_alta") or snapshot_fecha
        pago_vals = (
            f"{empresa_id_subq(empresa_slug)}, {sql_quote(db_empleado_id)}, "
            f"{sql_quote(ex.get('banco_codigo'))}, {sql_quote(ex.get('numero_cuenta'))}, "
            f"{sql_quote(ex.get('sucursal_banco'))}, {sql_quote(clabe)}, true, "
            f"{sql_quote(fecha_inicio)}"
        )
        sql.append(f"INSERT INTO erp.empleados_pago ({pago_cols}) VALUES ({pago_vals});")
        sql.append("")

    # Audit log
    diff_jsonb = json.dumps({"match_metodo": match_metodo, "codigo": ex["codigo"]}, ensure_ascii=False).replace("'", "''")
    sql.append(f"INSERT INTO erp.empleados_import_log (empresa_id, empleado_id, persona_id, snapshot_fecha, origen, accion, match_metodo, diff)")
    sql.append(f"VALUES ({empresa_id_subq(empresa_slug)}, {sql_quote(db_empleado_id)}, (SELECT persona_id FROM erp.empleados WHERE id = {sql_quote(db_empleado_id)}), {sql_quote(snapshot_fecha)}, {sql_quote(snapshot_origen)}, 'update', {sql_quote(match_metodo)}, '{diff_jsonb}'::jsonb);")
    sql.append("")

    return sql


def render_soft_delete(empleado_id: str, empresa_slug: str, motivo: str, snapshot_origen: str, snapshot_fecha: date) -> list[str]:
    sql = []
    sql.append(f"-- SOFT-DELETE empleado {empleado_id}: {motivo}")
    sql.append(f"UPDATE erp.empleados SET deleted_at = now() WHERE id = {sql_quote(empleado_id)};")
    sql.append(f"INSERT INTO erp.empleados_import_log (empresa_id, empleado_id, persona_id, snapshot_fecha, origen, accion, diff)")
    sql.append(f"VALUES ({empresa_id_subq(empresa_slug)}, {sql_quote(empleado_id)}, (SELECT persona_id FROM erp.empleados WHERE id = {sql_quote(empleado_id)}), {sql_quote(snapshot_fecha)}, {sql_quote(snapshot_origen)}, 'skip', '{{\"motivo\":\"{motivo}\"}}'::jsonb);")
    sql.append("")
    return sql


def render_baja_seleccionada(empleado_id: str, nombre: str, empresa_slug: str, snapshot_origen: str, snapshot_fecha: date) -> list[str]:
    sql = []
    motivo = f"No presente en snapshot CONTPAQi {snapshot_fecha.isoformat()}"
    sql.append(f"-- BAJA seleccionada empleado {empleado_id}: {nombre}")
    sql.append(f"UPDATE erp.empleados SET activo = false, fecha_baja = {sql_quote(snapshot_fecha)}, motivo_baja = {sql_quote(motivo)} WHERE id = {sql_quote(empleado_id)};")
    sql.append(f"INSERT INTO erp.empleados_import_log (empresa_id, empleado_id, persona_id, snapshot_fecha, origen, accion, diff)")
    sql.append(f"VALUES ({empresa_id_subq(empresa_slug)}, {sql_quote(empleado_id)}, (SELECT persona_id FROM erp.empleados WHERE id = {sql_quote(empleado_id)}), {sql_quote(snapshot_fecha)}, {sql_quote(snapshot_origen)}, 'baja', '{{\"motivo\":\"{motivo}\"}}'::jsonb);")
    sql.append("")
    return sql


# ---------------------------------------------------------------------------
# Apply overrides
# ---------------------------------------------------------------------------

def apply_overrides(plan: dict, conflict_resolution: dict, excel_dilesa: list[dict], excel_rdb: list[dict]):
    """Mueve los conflicts a updates con el match_db_id especificado, marca soft-deletes."""
    soft_deletes = []  # (empleado_id, empresa_slug, motivo)
    close_cycle_overrides = {}  # (empresa, codigo) → (empleado_id, fecha_baja)

    for empresa, slug in [("DILESA", "dilesa"), ("RDB", "rdb")]:
        cr_emp = conflict_resolution.get(empresa, {})
        excel_rows = {ex["codigo"]: ex for ex in (excel_dilesa if empresa == "DILESA" else excel_rdb)}
        new_conflicts = []
        for record in plan[empresa]["conflict"]:
            codigo = record["codigo"]
            res = cr_emp.get(codigo)
            if not res:
                # No hay resolución → queda como conflict (no aplicar)
                new_conflicts.append(record)
                continue
            update_id = res["update_db_id"]
            soft_ids = res.get("soft_delete_db_ids", [])
            close_cycle = res.get("close_cycle", False)

            ex = excel_rows.get(codigo)
            if not ex:
                continue

            new_record = {
                **record,
                "match_metodo": "conflict_resolution",
                "match_db_id": update_id,
                "diff": {"resolved_via": "conflict_resolution", "notas": res.get("notas", "")},
                "_close_cycle_fecha_baja": ex["fecha_baja"] if close_cycle else None,
            }
            plan[empresa]["update"].append(new_record)

            for sid in soft_ids:
                soft_deletes.append((sid, slug, f"Duplicado de empleado {update_id} (conflict_resolution código {codigo})"))

            if close_cycle:
                close_cycle_overrides[(empresa, codigo)] = ex["fecha_baja"]

        plan[empresa]["conflict"] = new_conflicts

    return soft_deletes, close_cycle_overrides


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--xlsx-dilesa", default=os.environ.get("EMPLEADOS_DILESA_XLSX", str(Path.home() / "Downloads/Empleados_Dilesa.xlsx")))
    parser.add_argument("--xlsx-rdb", default=os.environ.get("EMPLEADOS_RDB_XLSX", str(Path.home() / "Downloads/Empleados_RDB.xlsx")))
    parser.add_argument("--snapshot-dir", default=str(_HERE / "snapshot"))
    parser.add_argument("--out", default=str(_HERE / "sql" / f"apply-2026-04-30.sql"), help="Path al archivo SQL de salida")
    args = parser.parse_args()

    snap_dir = Path(args.snapshot_dir)
    db_dilesa = json.load(open(snap_dir / "db_dilesa_empleados.json"))
    db_rdb = json.load(open(snap_dir / "db_rdb_empleados.json"))
    exclusion = json.load(open(snap_dir / "exclusion_baja.json"))
    conflict_resolution = json.load(open(snap_dir / "conflict_resolution.json"))
    bajas_seleccionadas = json.load(open(snap_dir / "bajas_seleccionadas.json"))

    for row in db_dilesa + db_rdb:
        for k in ("fecha_ingreso", "fecha_baja", "fecha_nacimiento"):
            v = row.get(k)
            if isinstance(v, str) and v:
                try:
                    row[k] = datetime.fromisoformat(v).date()
                except ValueError:
                    pass

    excel_dilesa = dry_run.parse_excel(Path(args.xlsx_dilesa).expanduser(), "DILESA")
    excel_rdb = dry_run.parse_excel(Path(args.xlsx_rdb).expanduser(), "RDB")

    plan = dry_run.build_plan(excel_dilesa, excel_rdb, db_dilesa, db_rdb, exclusion)
    soft_deletes, close_cycle = apply_overrides(plan, conflict_resolution, excel_dilesa, excel_rdb)

    # Filter bajas: solo aplicar las seleccionadas
    selected_baja_ids = {b["empleado_id"] for emp in ("DILESA", "RDB") for b in bajas_seleccionadas.get(emp, [])}
    plan["BAJAS_CANDIDATAS"] = [b for b in plan["BAJAS_CANDIDATAS"] if b["empleado_id"] in selected_baja_ids]

    excel_by_codigo = {("DILESA", ex["codigo"]): ex for ex in excel_dilesa}
    excel_by_codigo.update({("RDB", ex["codigo"]): ex for ex in excel_rdb})

    SNAPSHOT_FECHA = dry_run.SNAPSHOT_FECHA
    SNAPSHOT_ORIGEN = dry_run.SNAPSHOT_ORIGEN

    sql = []
    sql.append("-- Sprint 4 — Apply del import CONTPAQi (DILESA + RDB)")
    sql.append("--")
    sql.append("-- Iniciativa: import-empleados-contpaqi.")
    sql.append(f"-- Snapshot: {SNAPSHOT_ORIGEN}")
    sql.append("--")
    sql.append("-- Contiene en una transacción:")
    sql.append(f"--   1. UPDATEs de empleados ya existentes en DB (incluye 6 conflicts resueltos)")
    sql.append(f"--   2. Soft-deletes de duplicados detectados en conflicts")
    sql.append(f"--   3. INSERTs nuevos de empleados no presentes en DB")
    sql.append(f"--   4. UPDATEs de bajas seleccionadas (4 bajas candidatas aprobadas)")
    sql.append(f"--   5. Audit log en erp.empleados_import_log por cada acción")
    sql.append("--")
    sql.append("-- Conteos:")
    for emp in ("DILESA", "RDB"):
        sql.append(f"--   {emp}: {len(plan[emp]['insert'])} INSERT, {len(plan[emp]['update'])} UPDATE, {len(plan[emp]['conflict'])} conflict (no aplicados)")
    sql.append(f"--   Soft-deletes: {len(soft_deletes)}")
    sql.append(f"--   Bajas seleccionadas: {len(plan['BAJAS_CANDIDATAS'])}")
    sql.append("--")
    sql.append("BEGIN;")
    sql.append("")

    # 1. UPDATEs (incluyendo conflicts ya resueltos)
    for empresa, slug in [("DILESA", "dilesa"), ("RDB", "rdb")]:
        for record in plan[empresa]["update"]:
            ex = excel_by_codigo.get((empresa, record["codigo"]))
            if not ex:
                continue
            close_cycle_fecha = record.get("_close_cycle_fecha_baja")
            sql.extend(render_update_block(
                ex, record["match_db_id"], None, slug,
                record.get("match_metodo"), close_cycle_fecha,
                SNAPSHOT_ORIGEN, SNAPSHOT_FECHA
            ))

    # 2. Soft-deletes
    for emp_id, slug, motivo in soft_deletes:
        sql.extend(render_soft_delete(emp_id, slug, motivo, SNAPSHOT_ORIGEN, SNAPSHOT_FECHA))

    # 3. INSERTs
    for empresa, slug in [("DILESA", "dilesa"), ("RDB", "rdb")]:
        for record in plan[empresa]["insert"]:
            ex = excel_by_codigo.get((empresa, record["codigo"]))
            if not ex:
                continue
            sql.extend(render_insert_block(ex, slug, SNAPSHOT_ORIGEN, SNAPSHOT_FECHA))

    # 4. Bajas seleccionadas
    for b in plan["BAJAS_CANDIDATAS"]:
        slug = b["empresa"].lower()
        sql.extend(render_baja_seleccionada(b["empleado_id"], b["nombre_completo"], slug, SNAPSHOT_ORIGEN, SNAPSHOT_FECHA))

    sql.append("NOTIFY pgrst, 'reload schema';")
    sql.append("")
    sql.append("COMMIT;")

    Path(args.out).write_text("\n".join(sql) + "\n")
    print(f"SQL escrito: {args.out}")
    print(f"Líneas: {len(sql)}")


if __name__ == "__main__":
    main()
