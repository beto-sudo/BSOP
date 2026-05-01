#!/usr/bin/env python3
"""Dry-run del import de empleados CONTPAQi (DILESA + RDB) a Supabase.

Iniciativa: import-empleados-contpaqi (Sprint 3).

Lee:
  - Excel CONTPAQi: $EMPLEADOS_DILESA_XLSX, $EMPLEADOS_RDB_XLSX
    (defaults: ~/Downloads/Empleados_Dilesa.xlsx, ~/Downloads/Empleados_RDB.xlsx).
  - Snapshot DB: scripts/import-contpaqi/snapshot/*.json
    (db_catalogos.json, db_dilesa_empleados.json, db_rdb_empleados.json,
     exclusion_baja.json — generados via Supabase MCP, no contienen secrets).

Emite:
  - Reporte markdown a stdout (o a $OUT_REPORT si está seteado).

NO toca DB. Beto revisa el reporte y, si OK, Sprint 4 aplicará los cambios.

Reglas de match (orden de prioridad):
  1. CURP exacto (post-normalización: trim + upper).
  2. RFC exacto (post-normalización: quitar guiones + trim + upper).
  3. Fuzzy: apellido_paterno + apellido_materno + nombre + fecha_nacimiento exacta.
  4. numero_empleado dentro de la misma empresa.

Si match → UPDATE (sólo campos que cambian).
Si no match → INSERT.
Cluster RDB-en-DILESA (Departamento='Rincon del Bosque' en Excel DILESA):
  - Activos (A/R) NO duplicados en RDB-DB: ruta dual (alta+baja DILESA con
    fecha pivote 30-abr-2026; alta nueva RDB con fecha_ingreso 1-may-2026).
  - Bajas (B): solo histórico DILESA.

Detección de bajas: empleados activos en DB cuyo CURP/RFC NO está en el Excel
de su empresa → candidato a baja, EXCLUYENDO los IDs en exclusion_baja.json
(accionistas/comité/consejo, regla explícita de Beto).
"""

from __future__ import annotations
import argparse
import json
import os
import re
import sys
import unicodedata
from collections import defaultdict
from datetime import date, datetime
from pathlib import Path
from typing import Optional

try:
    import openpyxl
except ImportError:
    print("ERROR: requiere openpyxl. Instalá con: pip3 install openpyxl", file=sys.stderr)
    sys.exit(1)

# ---------------------------------------------------------------------------
# Constantes y helpers
# ---------------------------------------------------------------------------

# Sentinel de "fecha vacía" en CONTPAQi (epoch SQL Server)
SENTINEL_FECHA_NULA = "30/12/1899"

# Fecha pivote para los 22 RDB-en-DILESA activos (alta+baja DILESA, alta RDB)
FECHA_PIVOTE_DILESA_BAJA = date(2026, 4, 30)
FECHA_PIVOTE_RDB_ALTA = date(2026, 5, 1)
SNAPSHOT_FECHA = date(2026, 4, 30)
SNAPSHOT_ORIGEN = f"contpaqi_export_{SNAPSHOT_FECHA.isoformat()}"

# Departamentos del Excel DILESA cuyos empleados pertenecen al deportivo (RDB)
DEPTO_EXCEL_RDB_EN_DILESA = "Rincon del Bosque"

# Nombre del depto Deportivo (existe en DILESA y RDB) que reemplaza el del Excel
DEPTO_DEPORTIVO_CANONICO = "Deportivo"

# Mapeo Excel → forma canónica DB (correcciones ortográficas detectadas)
DEPT_NORM_FIX = {
    "Administracion": "Administración",
    "Construccion": "Construcción",
    "Mercadoctenia": "Mercadotecnia",
    DEPTO_EXCEL_RDB_EN_DILESA: DEPTO_DEPORTIVO_CANONICO,
}
PUESTO_NORM_FIX = {
    "Tecnico Especializado en Mantenimiento": "Técnico Especialista en Mantenimiento",
    "Lider de Mercadoctenia y Comunicacion": "Líder de Mercadotecnia y Comunicación Organizacional",
    "Gestor de Tramites": "Gestor de Trámites",
    "Supervisor de Urbanizacion": "Supervisor de Urbanización",
    "Gerente de Construccion": "Gerente de Construcción",
}


def fold(s: Optional[str]) -> str:
    """Match key: minúsculas + sin tildes + trim."""
    if not s:
        return ""
    s = unicodedata.normalize("NFD", s)
    s = "".join(c for c in s if unicodedata.category(c) != "Mn")
    return s.lower().strip()


def title_case_es(s: Optional[str]) -> Optional[str]:
    """Title Case en español respetando conectores cortos en minúscula."""
    if not s or s.strip() in ("", "(Ninguno)"):
        return None
    minor = {"de", "del", "la", "las", "el", "los", "y", "en", "para", "por", "a", "al"}
    parts = s.strip().split()
    out = []
    for i, p in enumerate(parts):
        pl = p.lower()
        if i > 0 and pl in minor:
            out.append(pl)
        else:
            out.append(p[0].upper() + p[1:].lower())
    return " ".join(out)


def normalize_dept(raw: Optional[str]) -> Optional[str]:
    s = title_case_es(raw)
    return DEPT_NORM_FIX.get(s, s) if s else None


def normalize_puesto(raw: Optional[str]) -> Optional[str]:
    s = title_case_es(raw)
    return PUESTO_NORM_FIX.get(s, s) if s else None


def parse_fecha(raw: Optional[str]) -> Optional[date]:
    """Parser dedicado dd/mm/yyyy. Sentinel '30/12/1899' → None."""
    if not raw or not raw.strip() or raw.strip() == SENTINEL_FECHA_NULA:
        return None
    try:
        return datetime.strptime(raw.strip(), "%d/%m/%Y").date()
    except ValueError:
        return None


def normalize_rfc(raw: Optional[str]) -> Optional[str]:
    if not raw:
        return None
    return re.sub(r"[\s\-]", "", raw.strip().upper()) or None


def normalize_curp(raw: Optional[str]) -> Optional[str]:
    if not raw:
        return None
    return raw.strip().upper() or None


def normalize_text(raw: Optional[str]) -> Optional[str]:
    if not raw:
        return None
    s = raw.strip()
    return s or None


def normalize_email(raw: Optional[str]) -> Optional[str]:
    """Limpia placeholders típicos de CONTPAQi."""
    if not raw:
        return None
    s = raw.strip().lower()
    if s in ("", ".", "-", "n/a"):
        return None
    if "@" not in s:
        return None
    return s


def normalize_telefono(raw: Optional[str]) -> Optional[str]:
    if not raw:
        return None
    s = re.sub(r"[^0-9]", "", raw.strip())
    return s if len(s) >= 10 else None


def map_estatus_a_activo(estatus: Optional[str]) -> bool:
    """A=Alta, B=Baja, R=Reingreso. Activo = A o R."""
    if not estatus:
        return False
    return estatus.strip().upper() in ("A", "R")


# ---------------------------------------------------------------------------
# Excel parser
# ---------------------------------------------------------------------------

# Mapeo columna 1-based → nombre lógico (los headers vienen del análisis previo).
EXCEL_COLS = {
    "codigo": 1,
    "fecha_alta": 2,
    "fecha_baja": 3,
    "fecha_reingreso": 4,
    "tipo_contrato_sat": 5,
    "apellido_paterno": 6,
    "apellido_materno": 7,
    "nombre": 8,
    "tipo_periodo": 9,
    "salario_diario": 10,
    "sbc_parte_fija": 11,
    "estatus": 13,
    "departamento": 14,
    "sindicalizado": 15,
    "metodo_pago_sat": 17,
    "turno": 18,
    "zona_salario": 19,
    "nss": 25,
    "rfc": 26,
    "curp": 27,
    "sexo": 28,
    "ciudad_nacimiento": 29,
    "fecha_nacimiento": 30,
    "umf": 31,
    "direccion": 34,
    "puesto": 35,
    "poblacion": 36,
    "entidad_fed_domicilio": 37,
    "cp": 38,
    "estado_civil": 39,
    "telefono": 40,
    "banco_codigo": 55,
    "numero_cuenta": 56,
    "sucursal_banco": 57,
    "causa_baja": 58,
    "rpi_imss": 66,
    "email": 68,
    "regimen_imss": 69,
    "clabe": 70,
    "entidad_fed_nacimiento": 71,
    "tipo_prestacion": 72,
}


def parse_excel(path: Path, empresa_label: str) -> list[dict]:
    """Lee el Excel CONTPAQi y devuelve lista de dicts normalizados."""
    wb = openpyxl.load_workbook(path, data_only=True)
    ws = wb.active
    rows = []
    for r in ws.iter_rows(min_row=2, values_only=True):
        if not r[EXCEL_COLS["codigo"] - 1]:
            continue
        get = lambda k: r[EXCEL_COLS[k] - 1]
        estatus = (get("estatus") or "").strip().upper()
        ciudad_nac = normalize_text(get("ciudad_nacimiento"))
        ent_nac = normalize_text(get("entidad_fed_nacimiento"))
        lugar_nac = ", ".join(filter(None, [ciudad_nac, ent_nac])) or None

        rec = {
            "empresa_excel": empresa_label,
            "codigo": str(get("codigo")).strip(),
            "fecha_alta": parse_fecha(get("fecha_alta")),
            "fecha_baja": parse_fecha(get("fecha_baja")),
            "fecha_reingreso": parse_fecha(get("fecha_reingreso")),
            "tipo_contrato_sat": normalize_text(get("tipo_contrato_sat")),
            "apellido_paterno": normalize_text(get("apellido_paterno")),
            "apellido_materno": normalize_text(get("apellido_materno")),
            "nombre": normalize_text(get("nombre")),
            "tipo_periodo": normalize_text(get("tipo_periodo")),
            "salario_diario": float(get("salario_diario") or 0) or None,
            "sbc_parte_fija": float(get("sbc_parte_fija") or 0) or None,
            "estatus": estatus,
            "activo": map_estatus_a_activo(estatus),
            "departamento_raw": normalize_text(get("departamento")),
            "departamento_norm": normalize_dept(get("departamento")),
            "sindicalizado": normalize_text(get("sindicalizado")),
            "metodo_pago_sat": normalize_text(get("metodo_pago_sat")),
            "turno": normalize_text(get("turno")),
            "zona_salario": normalize_text(get("zona_salario")),
            "nss": normalize_text(get("nss")),
            "rfc": normalize_rfc(get("rfc")),
            "curp": normalize_curp(get("curp")),
            "sexo": normalize_text(get("sexo")),
            "lugar_nacimiento": lugar_nac,
            "fecha_nacimiento": parse_fecha(get("fecha_nacimiento")),
            "umf": normalize_text(get("umf")),
            "direccion": normalize_text(get("direccion")),
            "puesto_raw": normalize_text(get("puesto")),
            "puesto_norm": normalize_puesto(get("puesto")),
            "poblacion": normalize_text(get("poblacion")),
            "ent_fed_domicilio": normalize_text(get("entidad_fed_domicilio")),
            "cp": normalize_text(get("cp")),
            "estado_civil": normalize_text(get("estado_civil")),
            "telefono": normalize_telefono(get("telefono")),
            "banco_codigo": normalize_text(get("banco_codigo")),
            "numero_cuenta": normalize_text(get("numero_cuenta")),
            "sucursal_banco": normalize_text(get("sucursal_banco")),
            "causa_baja": normalize_text(get("causa_baja")),
            "rpi_imss": normalize_text(get("rpi_imss")),
            "email": normalize_email(get("email")),
            "regimen_imss": normalize_text(get("regimen_imss")),
            "clabe": normalize_text(get("clabe")),
            "tipo_prestacion": normalize_text(get("tipo_prestacion")),
        }
        rows.append(rec)
    return rows


# ---------------------------------------------------------------------------
# Match contra DB
# ---------------------------------------------------------------------------

def build_match_index(db_rows: list[dict]) -> dict:
    """Índices por CURP, RFC, fuzzy y numero_empleado."""
    idx = {
        "by_curp": defaultdict(list),
        "by_rfc": defaultdict(list),
        "by_fuzzy": defaultdict(list),
        "by_numero": defaultdict(list),
    }
    for row in db_rows:
        if row.get("curp"):
            idx["by_curp"][normalize_curp(row["curp"])].append(row)
        if row.get("rfc"):
            idx["by_rfc"][normalize_rfc(row["rfc"])].append(row)
        if row.get("apellido_paterno") or row.get("nombre"):
            key = "|".join(
                fold(s) for s in (
                    row.get("apellido_paterno"),
                    row.get("apellido_materno"),
                    row.get("persona_nombre"),
                    str(row.get("fecha_nacimiento") or ""),
                )
            )
            idx["by_fuzzy"][key].append(row)
        if row.get("numero_empleado"):
            idx["by_numero"][str(row["numero_empleado"]).strip()].append(row)
    return idx


def match_excel_row(excel_row: dict, idx: dict) -> tuple[Optional[dict], Optional[str]]:
    """Devuelve (db_row matched, metodo) o (None, None)."""
    if excel_row.get("curp"):
        candidates = idx["by_curp"].get(excel_row["curp"], [])
        if len(candidates) == 1:
            return candidates[0], "curp"
        if len(candidates) > 1:
            return None, "ambiguous_curp"
    if excel_row.get("rfc"):
        candidates = idx["by_rfc"].get(excel_row["rfc"], [])
        if len(candidates) == 1:
            return candidates[0], "rfc"
        if len(candidates) > 1:
            return None, "ambiguous_rfc"
    fuzzy_key = "|".join(
        fold(s) for s in (
            excel_row.get("apellido_paterno"),
            excel_row.get("apellido_materno"),
            excel_row.get("nombre"),
            str(excel_row.get("fecha_nacimiento") or ""),
        )
    )
    candidates = idx["by_fuzzy"].get(fuzzy_key, [])
    if len(candidates) == 1:
        return candidates[0], "fuzzy_nombre_fecha"
    if len(candidates) > 1:
        return None, "ambiguous_fuzzy"
    if excel_row.get("codigo"):
        candidates = idx["by_numero"].get(excel_row["codigo"], [])
        if len(candidates) == 1:
            return candidates[0], "numero_empleado"
        if len(candidates) > 1:
            return None, "ambiguous_numero"
    return None, None


# ---------------------------------------------------------------------------
# Diff: campos que cambian al hacer UPDATE
# ---------------------------------------------------------------------------

def compute_diff(excel_row: dict, db_row: dict) -> dict:
    """Diff de campos clave Excel → DB. Solo retorna campos donde Excel difiere."""
    diff = {}
    pairs = [
        ("rfc", "rfc"),
        ("curp", "curp"),
        ("nss", "nss"),
        ("fecha_nacimiento", "fecha_nacimiento"),
        ("apellido_paterno", "apellido_paterno"),
        ("apellido_materno", "apellido_materno"),
        ("nombre", "persona_nombre"),
        ("fecha_alta", "fecha_ingreso"),
        ("fecha_baja", "fecha_baja"),
        ("activo", "activo"),
        ("causa_baja", "motivo_baja"),
        ("codigo", "numero_empleado"),
    ]
    for excel_k, db_k in pairs:
        e_val = excel_row.get(excel_k)
        d_val = db_row.get(db_k)
        if isinstance(e_val, date):
            e_val = e_val.isoformat()
        if isinstance(d_val, date):
            d_val = d_val.isoformat()
        if e_val and e_val != d_val:
            diff[excel_k] = {"antes": d_val, "despues": e_val}
    return diff


# ---------------------------------------------------------------------------
# Plan generation
# ---------------------------------------------------------------------------

def build_plan(excel_dilesa: list[dict], excel_rdb: list[dict],
               db_dilesa: list[dict], db_rdb: list[dict],
               exclusion_baja: dict) -> dict:
    """Genera el plan de inserts/updates/bajas para el dry-run."""
    idx_dilesa = build_match_index(db_dilesa)
    idx_rdb = build_match_index(db_rdb)

    plan = {
        "DILESA": {"insert": [], "update": [], "skip": [], "conflict": []},
        "RDB": {"insert": [], "update": [], "skip": [], "conflict": []},
        "DUAL_ROUTE": [],   # los 22 RDB-en-DILESA con doble fila
        "BAJAS_CANDIDATAS": [],
    }

    # --- DILESA ---
    excel_dilesa_curp_set = set()
    excel_dilesa_rfc_set = set()
    for ex in excel_dilesa:
        if ex.get("curp"):
            excel_dilesa_curp_set.add(ex["curp"])
        if ex.get("rfc"):
            excel_dilesa_rfc_set.add(ex["rfc"])

        is_rdb_en_dilesa = ex["departamento_norm"] == DEPTO_DEPORTIVO_CANONICO and \
                           ex["departamento_raw"] == DEPTO_EXCEL_RDB_EN_DILESA

        match, metodo = match_excel_row(ex, idx_dilesa)

        record = {
            "codigo": ex["codigo"],
            "nombre_completo": " ".join(filter(None, [ex.get("apellido_paterno"), ex.get("apellido_materno"), ex.get("nombre")])),
            "rfc": ex["rfc"],
            "curp": ex["curp"],
            "estatus": ex["estatus"],
            "depto": ex["departamento_norm"],
            "puesto": ex["puesto_norm"],
            "match_metodo": metodo,
            "match_db_id": match.get("empleado_id") if match else None,
        }

        if metodo and metodo.startswith("ambiguous"):
            plan["DILESA"]["conflict"].append({**record, "razon": metodo})
            continue

        if match:
            diff = compute_diff(ex, match)
            if diff:
                plan["DILESA"]["update"].append({**record, "diff": diff})
            else:
                plan["DILESA"]["skip"].append({**record, "razon": "sin cambios"})
        else:
            plan["DILESA"]["insert"].append(record)

        # Cluster RDB-en-DILESA: para activos, agregar también plan RDB
        if is_rdb_en_dilesa and ex["activo"]:
            # ¿ya existe en RDB-DB?
            match_rdb, metodo_rdb = match_excel_row(ex, idx_rdb)
            if match_rdb:
                # Ya migrado en RDB previamente — solo actualizar DILESA, no abrir RDB nuevo
                plan["DUAL_ROUTE"].append({
                    **record,
                    "nota": f"Ya existe en RDB (match {metodo_rdb}). No se duplica.",
                    "rdb_existente": match_rdb["empleado_id"],
                })
            else:
                plan["DUAL_ROUTE"].append({
                    **record,
                    "nota": f"DILESA: alta+baja con fecha pivote {FECHA_PIVOTE_DILESA_BAJA}. RDB: alta nueva con fecha_ingreso {FECHA_PIVOTE_RDB_ALTA}.",
                    "rdb_existente": None,
                })

    # --- RDB ---
    excel_rdb_curp_set = set()
    excel_rdb_rfc_set = set()
    for ex in excel_rdb:
        if ex.get("curp"):
            excel_rdb_curp_set.add(ex["curp"])
        if ex.get("rfc"):
            excel_rdb_rfc_set.add(ex["rfc"])
        match, metodo = match_excel_row(ex, idx_rdb)
        record = {
            "codigo": ex["codigo"],
            "nombre_completo": " ".join(filter(None, [ex.get("apellido_paterno"), ex.get("apellido_materno"), ex.get("nombre")])),
            "rfc": ex["rfc"],
            "curp": ex["curp"],
            "estatus": ex["estatus"],
            "depto": ex["departamento_norm"],
            "puesto": ex["puesto_norm"],
            "match_metodo": metodo,
            "match_db_id": match.get("empleado_id") if match else None,
        }
        if metodo and metodo.startswith("ambiguous"):
            plan["RDB"]["conflict"].append({**record, "razon": metodo})
            continue
        if match:
            diff = compute_diff(ex, match)
            if diff:
                plan["RDB"]["update"].append({**record, "diff": diff})
            else:
                plan["RDB"]["skip"].append({**record, "razon": "sin cambios"})
        else:
            plan["RDB"]["insert"].append(record)

    # --- BAJAS CANDIDATAS ---
    # DB activos cuyo CURP/RFC no está en el Excel de su empresa, EXCLUYENDO accionistas/comité/consejo.
    for db_row in db_dilesa:
        if not db_row.get("activo"):
            continue
        if db_row["empleado_id"] in exclusion_baja.get("DILESA", []):
            continue
        curp = normalize_curp(db_row.get("curp"))
        rfc = normalize_rfc(db_row.get("rfc"))
        in_excel = (curp and curp in excel_dilesa_curp_set) or (rfc and rfc in excel_dilesa_rfc_set)
        if not in_excel:
            plan["BAJAS_CANDIDATAS"].append({
                "empresa": "DILESA",
                "empleado_id": db_row["empleado_id"],
                "nombre_completo": " ".join(filter(None, [db_row.get("apellido_paterno"), db_row.get("apellido_materno"), db_row.get("persona_nombre")])),
                "rfc": db_row.get("rfc"),
                "curp": db_row.get("curp"),
                "fecha_ingreso": str(db_row.get("fecha_ingreso") or ""),
            })
    for db_row in db_rdb:
        if not db_row.get("activo"):
            continue
        if db_row["empleado_id"] in exclusion_baja.get("RDB", []):
            continue
        curp = normalize_curp(db_row.get("curp"))
        rfc = normalize_rfc(db_row.get("rfc"))
        in_excel = (curp and curp in excel_rdb_curp_set) or (rfc and rfc in excel_rdb_rfc_set)
        if not in_excel:
            plan["BAJAS_CANDIDATAS"].append({
                "empresa": "RDB",
                "empleado_id": db_row["empleado_id"],
                "nombre_completo": " ".join(filter(None, [db_row.get("apellido_paterno"), db_row.get("apellido_materno"), db_row.get("persona_nombre")])),
                "rfc": db_row.get("rfc"),
                "curp": db_row.get("curp"),
                "fecha_ingreso": str(db_row.get("fecha_ingreso") or ""),
            })

    return plan


# ---------------------------------------------------------------------------
# Reporte
# ---------------------------------------------------------------------------

def render_report(plan: dict, excel_dilesa: list[dict], excel_rdb: list[dict]) -> str:
    out = []
    out.append("# Reporte dry-run — Import empleados CONTPAQi (DILESA + RDB)")
    out.append("")
    out.append(f"**Snapshot:** {SNAPSHOT_FECHA.isoformat()} (`{SNAPSHOT_ORIGEN}`)")
    out.append(f"**Excel DILESA:** {len(excel_dilesa)} filas ({sum(1 for e in excel_dilesa if e['activo'])} activas / {sum(1 for e in excel_dilesa if not e['activo'])} bajas)")
    out.append(f"**Excel RDB:** {len(excel_rdb)} filas ({sum(1 for e in excel_rdb if e['activo'])} activas / {sum(1 for e in excel_rdb if not e['activo'])} bajas)")
    out.append("")
    out.append("## Resumen ejecutivo")
    out.append("")
    out.append("| Empresa | Insert | Update | Skip (sin cambios) | Conflicto |")
    out.append("| ------- | ------ | ------ | ------------------ | --------- |")
    for emp in ("DILESA", "RDB"):
        p = plan[emp]
        out.append(f"| {emp} | {len(p['insert'])} | {len(p['update'])} | {len(p['skip'])} | {len(p['conflict'])} |")
    out.append(f"| **DUAL_ROUTE** (RDB-en-DILESA cluster) | {len(plan['DUAL_ROUTE'])} | — | — | — |")
    out.append(f"| **Bajas candidatas** | — | — | — | {len(plan['BAJAS_CANDIDATAS'])} |")
    out.append("")

    def render_section(title, rows, fields):
        if not rows:
            return [f"### {title} (0)", "", "_Ninguno._", ""]
        lines = [f"### {title} ({len(rows)})", ""]
        lines.append("| " + " | ".join(fields) + " |")
        lines.append("| " + " | ".join("---" for _ in fields) + " |")
        for r in rows:
            cells = []
            for f in fields:
                v = r.get(f, "")
                if isinstance(v, dict):
                    v = json.dumps(v, ensure_ascii=False)
                v = str(v).replace("|", "\\|").replace("\n", " ")
                cells.append(v if v else "—")
            lines.append("| " + " | ".join(cells) + " |")
        lines.append("")
        return lines

    for emp in ("DILESA", "RDB"):
        out.append(f"## {emp}")
        out.append("")
        out.extend(render_section(
            f"{emp} — INSERT",
            plan[emp]["insert"],
            ["codigo", "nombre_completo", "estatus", "rfc", "curp", "depto", "puesto"],
        ))
        out.extend(render_section(
            f"{emp} — UPDATE",
            plan[emp]["update"],
            ["codigo", "nombre_completo", "estatus", "match_metodo", "diff"],
        ))
        out.extend(render_section(
            f"{emp} — CONFLICT",
            plan[emp]["conflict"],
            ["codigo", "nombre_completo", "rfc", "curp", "razon"],
        ))
        # Skip lo resumimos solo en conteo (es ruido)

    out.append("## DUAL_ROUTE — RDB-en-DILESA cluster (22 esperados)")
    out.append("")
    out.extend(render_section(
        "Empleados con `Departamento='Rincon del Bosque'` en Excel DILESA",
        plan["DUAL_ROUTE"],
        ["codigo", "nombre_completo", "estatus", "rdb_existente", "nota"],
    ))

    out.append("## BAJAS CANDIDATAS")
    out.append("")
    out.append(f"Empleados activos en DB cuyo CURP/RFC NO está en el Excel CONTPAQi de su empresa, **excluidos** los puestos no-operativos (Accionista/Comité Ejecutivo/Consejo de Administración).")
    out.append("")
    out.extend(render_section(
        "Bajas candidatas",
        plan["BAJAS_CANDIDATAS"],
        ["empresa", "nombre_completo", "rfc", "curp", "fecha_ingreso", "empleado_id"],
    ))

    out.append("---")
    out.append("")
    out.append("Generado por `scripts/import-contpaqi/dry-run.py`. NO se aplicó ningún cambio a DB.")
    out.append("")
    return "\n".join(out)


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--xlsx-dilesa", default=os.environ.get("EMPLEADOS_DILESA_XLSX", str(Path.home() / "Downloads/Empleados_Dilesa.xlsx")))
    parser.add_argument("--xlsx-rdb", default=os.environ.get("EMPLEADOS_RDB_XLSX", str(Path.home() / "Downloads/Empleados_RDB.xlsx")))
    parser.add_argument("--snapshot-dir", default=str(Path(__file__).parent / "snapshot"))
    parser.add_argument("--out", default=os.environ.get("OUT_REPORT", "-"), help="Path al reporte md (default stdout)")
    args = parser.parse_args()

    xlsx_dilesa = Path(args.xlsx_dilesa).expanduser()
    xlsx_rdb = Path(args.xlsx_rdb).expanduser()
    snap_dir = Path(args.snapshot_dir)

    for p in (xlsx_dilesa, xlsx_rdb):
        if not p.exists():
            print(f"ERROR: no existe {p}", file=sys.stderr)
            sys.exit(2)

    db_dilesa = json.load(open(snap_dir / "db_dilesa_empleados.json"))
    db_rdb = json.load(open(snap_dir / "db_rdb_empleados.json"))
    exclusion = json.load(open(snap_dir / "exclusion_baja.json"))

    # Convertir fechas de string a date para comparar
    for row in db_dilesa + db_rdb:
        for k in ("fecha_ingreso", "fecha_baja", "fecha_nacimiento"):
            v = row.get(k)
            if isinstance(v, str) and v:
                try:
                    row[k] = datetime.fromisoformat(v).date()
                except ValueError:
                    pass

    excel_dilesa = parse_excel(xlsx_dilesa, "DILESA")
    excel_rdb = parse_excel(xlsx_rdb, "RDB")

    plan = build_plan(excel_dilesa, excel_rdb, db_dilesa, db_rdb, exclusion)
    report = render_report(plan, excel_dilesa, excel_rdb)

    if args.out == "-":
        print(report)
    else:
        Path(args.out).write_text(report)
        print(f"Reporte guardado: {args.out}", file=sys.stderr)


if __name__ == "__main__":
    main()
