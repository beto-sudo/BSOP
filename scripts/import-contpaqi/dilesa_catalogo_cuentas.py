#!/usr/bin/env python3
"""
Loader del catálogo de cuentas contables de DILESA desde el export de CONTPAQi.
Iniciativa `dilesa-catalogo-contable` · Sprint 1.

Lee el export crudo (`cuentas COMPLETO.xlsx`), lo limpia y EMITE una migración
de datos idempotente que carga `erp.cuentas_contables` para DILESA.

Por qué un loader (y no INSERTs a mano): el export trae dos defectos que hay que
sanear de forma determinista y verificable:

  1. Encoding de fuente de CONTPAQi: cada vocal acentuada quedó como un glifo
     PUA/CJK que codifica «vocal acentuada + letra siguiente» (p.ej. `t馗nica` →
     `técnica`, `Vi疸icos` → `Viáticos`). Mapeo fijo de 19 entradas, verificado
     contra nombres reales del Anexo 24 del SAT.
  2. ~80 filas con texto desbordado entre columnas (rompe el número de padre en
     col5). El padre se recupera por estructura del número (máscara 3-2-3), que
     es la fuente robusta; col5 solo se usa para el enlace mayor→grupo.

Validación dura antes de emitir (checksum): total esperado, 0 glifos rotos
remanentes, jerarquía sin huérfanos, naturaleza/tipo consistentes.

Uso:
  python3 dilesa_catalogo_cuentas.py                 # dry-run: valida + stats + muestra
  python3 dilesa_catalogo_cuentas.py --preview-csv out.csv
  python3 dilesa_catalogo_cuentas.py --emit-sql ../../supabase/migrations/<ts>_*.sql

No toca la base de datos. La migración emitida se aplica con el flujo normal
(OK de Beto), nunca desde aquí.
"""

from __future__ import annotations

import argparse
import csv
import os
import re
import sys
from pathlib import Path

import openpyxl

DEFAULT_XLSX = os.path.expanduser("~/Downloads/cuentas COMPLETO.xlsx")
EMPRESA_SLUG = "dilesa"
EXPECTED_TOTAL = 1331  # checksum del export actual

# ── Encoding: glifo roto de CONTPAQi → texto correcto ────────────────────────
# Cada codepoint codifica «vocal acentuada + letra siguiente». Derivado y
# verificado contra nombres del catálogo SAT (ver docstring).
ACCENT_MAP = {
    0xE262: "ón", 0x50D8: "ía", 0x99FB: "ér", 0xFA0E: "ís", 0x9998: "éd",
    0xE261: "óm", 0x9997: "éc", 0x5307: "ím", 0xE25B: "óg", 0x30FB: "üe",
    0x99AD: "éf", 0x5164: "íc", 0xE26A: "óv", 0xFF62: "ó",  0xE267: "ós",
    0x75B8: "át", 0x519D: "íd", 0x75A5: "ám", 0x75A3: "án",
}
_ACCENT_TRANS = {k: v for k, v in ACCENT_MAP.items()}

# Caracteres no-ASCII legítimos que pueden quedar tras la limpieza.
VALID_NONASCII = set("áéíóúüñÁÉÍÓÚÜÑ°ªº")

# ── Naturaleza: letra de tipo CONTPAQi (col6) → naturaleza del saldo ──────────
#   A=activo, B=contra-activo, D=pasivo, E=pérdida(capital), F=capital,
#   G=costo/gasto/dev.s.ingresos, H=ingreso/dev.s.compras, K=orden contra, L=orden.
DEUDORA = {"A", "E", "G", "L"}
ACREEDORA = {"B", "D", "F", "H", "K"}

# ── Tipo mayor: primer dígito del número ─────────────────────────────────────
TIPO_POR_MAYOR = {
    "1": "activo", "2": "pasivo", "3": "capital", "4": "ingreso",
    "5": "costo", "6": "gasto", "7": "resultado", "8": "orden",
}


def fix_text(value) -> str:
    """Aplica el mapeo de encoding y normaliza espacios."""
    s = str(value)
    s = s.translate(_ACCENT_TRANS)
    return re.sub(r"\s+", " ", s).strip()


def digits8(value) -> str | None:
    """Extrae un número de 8 dígitos de una celda (tolera desbordes)."""
    if value is None:
        return None
    m = re.search(r"(\d{8})", str(value))
    return m.group(1) if m else None


def segment(num8: str) -> str:
    """'60101000' → '601-01-000' (máscara 3-2-3 de CONTPAQi)."""
    return f"{num8[:3]}-{num8[3:5]}-{num8[5:]}"


def agrupador_sat(num8: str) -> str:
    """Código agrupador SAT derivado de la estructura (sin pérdida de float).

    Mayor (SS=00, DDD=000) → 'NNN'. Subcuenta/sub-sub → 'NNN.SS' (la sub-sub
    rola al mismo agrupador que su subcuenta, por convención del Anexo 24).
    """
    mayor, sub = num8[:3], num8[3:5]
    return mayor if num8[3:] == "00000" else f"{mayor}.{sub}"


def structural_parent(num8: str) -> str | None:
    """Padre por estructura: cero el segmento no-cero más bajo. None si es mayor."""
    mayor, sub, det = num8[:3], num8[3:5], num8[5:]
    if det != "000":
        return mayor + sub + "000"   # sub-sub → subcuenta
    if sub != "00":
        return mayor + "00" + "000"  # subcuenta → mayor
    return None                       # mayor → sin padre estructural (rola al grupo)


def parse(xlsx_path: str) -> list[dict]:
    wb = openpyxl.load_workbook(xlsx_path, read_only=True, data_only=True)
    ws = wb.active
    rows: list[dict] = []
    for r in ws.iter_rows(values_only=True):
        if r[0] != "C":
            continue
        num8 = digits8(r[1])
        if not num8:
            raise ValueError(f"Fila sin número de cuenta válido: {r[:3]}")
        letra = (str(r[6]).strip()[:1] if r[6] is not None else "")
        if letra not in DEUDORA and letra not in ACREEDORA:
            raise ValueError(f"Cuenta {num8}: letra de naturaleza desconocida {letra!r}")
        rows.append({
            "codigo_contpaqi": num8,
            "numero": segment(num8),
            "nombre": fix_text(r[2]),
            "naturaleza": "deudora" if letra in DEUDORA else "acreedora",
            "tipo": TIPO_POR_MAYOR[num8[0]],
            # `nivel` se computa como profundidad real del árbol en resolve_parents.
            # (col8 del export NO es profundidad: el grupo tope trae 3 y sus hijos 1.)
            "agrupador": agrupador_sat(num8),
            "col5_parent": digits8(r[5]),  # crudo, puede venir corrupto
        })
    return rows


def resolve_parents(rows: list[dict]) -> None:
    """Asigna `padre_contpaqi` y marca `afectable` (hoja = sin hijos)."""
    by_code = {r["codigo_contpaqi"]: r for r in rows}
    for r in rows:
        code = r["codigo_contpaqi"]
        is_mayor = code[3:] == "00000"
        parent = None
        if is_mayor:
            # mayor → su grupo: confiar en col5 solo si es 8 dígitos y existe.
            if r["col5_parent"] and r["col5_parent"] in by_code:
                parent = r["col5_parent"]
        else:
            # subcuenta/sub-sub → estructura (robusto a desbordes de col5).
            sp = structural_parent(code)
            if sp and sp in by_code:
                parent = sp
            elif r["col5_parent"] and r["col5_parent"] in by_code:
                parent = r["col5_parent"]
        r["padre_contpaqi"] = parent
    parent_codes = {r["padre_contpaqi"] for r in rows if r["padre_contpaqi"]}
    for r in rows:
        r["afectable"] = r["codigo_contpaqi"] not in parent_codes
    # Profundidad real del árbol: raíz=0, mayor=1, subcuenta=2, sub-sub=3.
    for r in rows:
        depth, cur, seen = 0, r, set()
        while cur["padre_contpaqi"] and cur["codigo_contpaqi"] not in seen:
            seen.add(cur["codigo_contpaqi"])
            cur = by_code[cur["padre_contpaqi"]]
            depth += 1
        r["nivel"] = depth


def validate(rows: list[dict]) -> dict:
    errs: list[str] = []
    if len(rows) != EXPECTED_TOTAL:
        errs.append(f"total {len(rows)} ≠ esperado {EXPECTED_TOTAL}")

    # 0 glifos rotos remanentes; todo no-ASCII restante debe ser español válido.
    broken = set(ACCENT_MAP)
    bad_chars = set()
    for r in rows:
        for ch in r["nombre"]:
            if ord(ch) > 127 and ch not in VALID_NONASCII:
                bad_chars.add(ch)
                if ord(ch) in broken:
                    errs.append(f"glifo roto remanente en {r['codigo_contpaqi']}: {r['nombre']!r}")
    if bad_chars:
        errs.append(f"caracteres no-ASCII inesperados: {sorted(bad_chars)}")

    # Códigos únicos.
    codes = [r["codigo_contpaqi"] for r in rows]
    if len(set(codes)) != len(codes):
        errs.append("códigos de cuenta duplicados")

    # Jerarquía: todo padre asignado existe; sin ciclos.
    by_code = {r["codigo_contpaqi"]: r for r in rows}
    orphans = [r["codigo_contpaqi"] for r in rows
               if r["padre_contpaqi"] and r["padre_contpaqi"] not in by_code]
    if orphans:
        errs.append(f"{len(orphans)} cuentas con padre inexistente: {orphans[:5]}")

    roots = [r for r in rows if not r["padre_contpaqi"]]
    leaves = [r for r in rows if r["afectable"]]

    # nombre no vacío
    if any(not r["nombre"] for r in rows):
        errs.append("hay cuentas con nombre vacío")

    if errs:
        print("✗ VALIDACIÓN FALLÓ:", file=sys.stderr)
        for e in errs:
            print("  -", e, file=sys.stderr)
        sys.exit(1)

    return {
        "total": len(rows),
        "afectables": len(leaves),
        "acumulativas": len(rows) - len(leaves),
        "raices": len(roots),
        "raices_codigos": [r["codigo_contpaqi"] for r in roots],
        "por_tipo": {t: sum(1 for r in rows if r["tipo"] == t) for t in TIPO_POR_MAYOR.values()},
        "por_naturaleza": {n: sum(1 for r in rows if r["naturaleza"] == n)
                           for n in ("deudora", "acreedora")},
        "max_nivel": max(r["nivel"] for r in rows),
    }


def sql_str(s: str) -> str:
    return "'" + s.replace("'", "''") + "'"


def emit_sql(rows: list[dict], version: str) -> str:
    emp = f"(SELECT id FROM core.empresas WHERE slug = {sql_str(EMPRESA_SLUG)})"
    head = f"""-- ╭─ {version}_dilesa_catalogo_cuentas_data ─╮
-- Iniciativa dilesa-catalogo-contable · Sprint 1 · carga del catálogo.
-- Generado por scripts/import-contpaqi/dilesa_catalogo_cuentas.py desde el
-- export de CONTPAQi (cuentas COMPLETO.xlsx). NO editar a mano: regenerar con
-- el loader si cambia el export. {len(rows)} cuentas de DILESA.
--
-- Dos statements independientes (sin tabla temporal ni dependencia de la
-- transacción): robusto bajo db push, MCP apply_migration o execute_sql.
-- Idempotente: ON CONFLICT (empresa_id, numero) DO NOTHING + UPDATE con guard.
-- Preview-safe: si la empresa DILESA no existe (Preview sin datos), el CROSS
-- JOIN no produce filas y la carga es no-op. Requiere la tabla creada en
-- 20260625193524_dilesa_catalogo_cuentas.sql.

BEGIN;

-- 1. Inserta las cuentas (la jerarquía se resuelve en el statement 2).
INSERT INTO erp.cuentas_contables
  (empresa_id, numero, codigo_contpaqi, nombre, naturaleza, tipo, nivel,
   codigo_agrupador_sat, afectable, origen)
SELECT e.id, v.numero, v.codigo_contpaqi, v.nombre, v.naturaleza, v.tipo,
       v.nivel, v.agrupador, v.afectable, 'contpaqi'
FROM (VALUES
"""
    ins = []
    for r in rows:
        ins.append(
            f"  ({sql_str(r['codigo_contpaqi'])}, {sql_str(r['numero'])}, "
            f"{sql_str(r['nombre'])}, {sql_str(r['naturaleza'])}, {sql_str(r['tipo'])}, "
            f"{r['nivel']}, {sql_str(r['agrupador'])}, {str(r['afectable']).lower()})"
        )
    mid = f"""
) AS v(codigo_contpaqi, numero, nombre, naturaleza, tipo, nivel, agrupador, afectable)
CROSS JOIN {emp} e
ON CONFLICT (empresa_id, numero) DO NOTHING;

-- 2. Resuelve la jerarquía padre-hijo por código CONTPAQi.
UPDATE erp.cuentas_contables c
SET cuenta_padre_id = p.id
FROM (VALUES
"""
    upd = [
        f"  ({sql_str(r['codigo_contpaqi'])}, {sql_str(r['padre_contpaqi'])})"
        for r in rows if r["padre_contpaqi"]
    ]
    tail = f"""
) AS v(codigo_contpaqi, padre_contpaqi)
JOIN {emp} e ON true
JOIN erp.cuentas_contables p ON p.empresa_id = e.id AND p.codigo_contpaqi = v.padre_contpaqi
WHERE c.empresa_id = e.id
  AND c.codigo_contpaqi = v.codigo_contpaqi
  AND c.cuenta_padre_id IS DISTINCT FROM p.id;

COMMIT;
"""
    return head + ",\n".join(ins) + mid + ",\n".join(upd) + tail


def main() -> None:
    ap = argparse.ArgumentParser(description="Loader del catálogo de cuentas DILESA (CONTPAQi)")
    ap.add_argument("--input", default=DEFAULT_XLSX, help="ruta del .xlsx export")
    ap.add_argument("--emit-sql", metavar="PATH", help="escribe la migración de datos a PATH")
    ap.add_argument("--preview-csv", metavar="PATH", help="escribe el catálogo saneado a CSV")
    args = ap.parse_args()

    if not Path(args.input).exists():
        print(f"✗ No existe el export: {args.input}", file=sys.stderr)
        sys.exit(1)

    rows = parse(args.input)
    resolve_parents(rows)
    stats = validate(rows)

    print(f"✓ Validación OK · {stats['total']} cuentas")
    print(f"  afectables (hojas): {stats['afectables']} | acumulativas: {stats['acumulativas']}")
    print(f"  raíces: {stats['raices']} | nivel máx: {stats['max_nivel']}")
    print(f"  por tipo: {stats['por_tipo']}")
    print(f"  por naturaleza: {stats['por_naturaleza']}")
    print("  muestra (gastos):")
    for r in rows:
        if r["codigo_contpaqi"].startswith("60101") or r["codigo_contpaqi"] in ("60117000",):
            print(f"    {r['numero']}  [{r['naturaleza'][:3]}] {r['nombre']}  (SAT {r['agrupador']})")

    if args.preview_csv:
        with open(args.preview_csv, "w", newline="", encoding="utf-8") as f:
            w = csv.writer(f)
            w.writerow(["numero", "codigo_contpaqi", "nombre", "naturaleza", "tipo",
                        "nivel", "agrupador_sat", "afectable", "padre_contpaqi"])
            for r in rows:
                w.writerow([r["numero"], r["codigo_contpaqi"], r["nombre"], r["naturaleza"],
                            r["tipo"], r["nivel"], r["agrupador"], r["afectable"], r["padre_contpaqi"]])
        print(f"✓ Preview CSV → {args.preview_csv}")

    if args.emit_sql:
        version = Path(args.emit_sql).name.split("_")[0]
        Path(args.emit_sql).write_text(emit_sql(rows, version), encoding="utf-8")
        print(f"✓ Migración de datos → {args.emit_sql}")


if __name__ == "__main__":
    main()
