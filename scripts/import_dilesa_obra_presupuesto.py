#!/usr/bin/env python3
"""
Traspaso de la hoja RESUMEN de los Excel de proyecto DILESA (LDLE, LDS) a
`dilesa.obra_presupuesto`. Iniciativa dilesa-contratos-obra · Sprint traspaso.

DRY_RUN por default: parsea, reporta y escribe el JSON intermedio
(/tmp/obra_presupuesto_traspaso.json) SIN tocar la DB. La carga real se hace
después, tras revisión de Beto, desde ese JSON.

  python3 scripts/import_dilesa_obra_presupuesto.py            # dry-run + reporte
"""
import json
import os
import unicodedata

EMPRESA_DILESA = "f5942ed4-7a6b-4c39-af18-67b9fbf7f479"
# Mapeo Excel -> proyecto. LDS es inequívoco; LDLE tiene candidatos (ver reporte).
ARCHIVOS = [
    {
        "path": os.path.expanduser("~/Downloads/Proyecto LDS.xlsx"),
        "proyecto_id": "a506b99f-1b6e-4024-a94a-59deaed48727",
        "proyecto_nombre": "Lomas del Sol",
        "prefijo": "LDS",
        "proyecto_confirmado": True,
    },
    {
        "path": os.path.expanduser("~/Downloads/Proyecto LDLE.xlsx"),
        "proyecto_id": "42c64197-2358-4607-a21c-97556ceb3110",  # "Lomas de los Encinos" — A CONFIRMAR
        "proyecto_nombre": "Lomas de los Encinos",
        "prefijo": "LDLE",
        "proyecto_confirmado": False,
    },
]


def norm(s):
    if s is None:
        return ""
    s = "".join(c for c in unicodedata.normalize("NFD", str(s)) if unicodedata.category(c) != "Mn")
    return s.strip().lower()


def num(v):
    if v is None or v == "":
        return None
    if isinstance(v, (int, float)):
        return round(float(v), 2)
    s = str(v).replace("$", "").replace(",", "").strip()
    if s in ("", "#DIV/0!", "-"):
        return None
    try:
        return round(float(s), 2)
    except ValueError:
        return None


def build_colmap(header_row):
    """nombre normalizado de columna -> índice, a partir de la fila de encabezado."""
    m = {}
    for j, v in enumerate(header_row):
        n = norm(v)
        if not n:
            continue
        if "etapa" in n and "etapa" == n:
            m["etapa"] = j
        elif n == "concepto":
            m["concepto"] = j
        elif "presupuesto previo" in n:
            m["previo"] = j
        elif "presupuesto actualizado" in n:
            m["actualizado"] = j
        elif n.startswith("gasto real"):
            m["gasto_real"] = j
        elif n == "proveedor":
            m["proveedor"] = j
        elif n.startswith("factura"):
            m["factura"] = j
        elif "fecha compromiso" in n:
            m["fecha"] = j
    return m


SKIP_CONCEPTOS = {"etapa", "presupuestado", "pres. actual.", "pagado", "ejercido"}


def parse_resumen(path):
    import openpyxl

    wb = openpyxl.load_workbook(path, data_only=True)
    ws = wb["RESUMEN"]
    rows = list(ws.iter_rows(values_only=True))
    wb.close()
    cm = build_colmap(rows[0])
    if "concepto" not in cm or "gasto_real" not in cm:
        raise SystemExit(f"No pude mapear columnas en {path}: {cm}")

    out = []
    buffer = []  # conceptos del segmento actual, etapa se asigna al cerrar con su TOTAL
    etapa_fwd = None  # etapa explícita en columna (LDS la trae; LDLE no)
    orden = 0

    def emit(etapa):
        nonlocal orden
        for r in buffer:
            orden += 1
            r["orden"] = orden
            r["etapa"] = r["etapa"] or etapa
            out.append(r)
        buffer.clear()

    for i, row in enumerate(rows[1:], start=2):
        def cell(key):
            j = cm.get(key)
            return row[j] if (j is not None and j < len(row)) else None

        et = cell("etapa")
        if et not in (None, ""):
            etapa_fwd = str(et).strip()
        concepto = cell("concepto")
        cn = norm(concepto)
        # Cortar en el bloque agregado de resumen por etapa
        if cn == "etapa" or any(norm(v) == "resumen por etapa" for v in row if v):
            break
        # Fila TOTAL: cierra el segmento → su etapa se deriva del texto "TOTAL <ETAPA>"
        if cn.startswith("total"):
            etapa = str(concepto).strip()[len("TOTAL "):].strip().title() or etapa_fwd
            emit(etapa)
            etapa_fwd = None
            continue
        if not cn or cn in SKIP_CONCEPTOS:
            continue
        gasto = num(cell("gasto_real"))
        previo = num(cell("previo"))
        actualizado = num(cell("actualizado"))
        proveedor = cell("proveedor")
        if gasto is None and previo is None and actualizado is None and not proveedor:
            continue
        buffer.append(
            {
                "etapa": etapa_fwd,  # si la columna la trae (LDS); si no, la pone el TOTAL
                "concepto": str(concepto).strip(),
                "orden": 0,
                "presupuesto_previo": previo,
                "presupuesto_actualizado": actualizado,
                "gasto_real_total": gasto,
                "gasto_real_subtotal": None,  # desglose IVA no especificado en el Excel
                "gasto_real_iva": None,
                "gasto_real_iva_tasa": None,
                "proveedor_texto": str(proveedor).strip() if proveedor else None,
                "factura_ref": (str(cell("factura")).strip() if cell("factura") else None),
                "source_ref": f"{os.path.basename(path)}/RESUMEN/r{i}",
            }
        )
    emit(etapa_fwd)  # cualquier remanente sin TOTAL final
    return out


def main():
    registros = []
    print("=" * 70)
    for a in ARCHIVOS:
        recs = parse_resumen(a["path"])
        suma_prev = sum(r["presupuesto_previo"] or 0 for r in recs)
        suma_act = sum(r["presupuesto_actualizado"] or 0 for r in recs)
        suma_real = sum(r["gasto_real_total"] or 0 for r in recs)
        provs = sorted({r["proveedor_texto"] for r in recs if r["proveedor_texto"]})
        etapas = sorted({r["etapa"] for r in recs if r["etapa"]})
        print(f"\n■ {a['prefijo']} → proyecto '{a['proyecto_nombre']}'"
              f"{'' if a['proyecto_confirmado'] else '  ⚠️ PROYECTO A CONFIRMAR'}")
        print(f"  conceptos: {len(recs)} | etapas: {etapas}")
        print(f"  presupuesto previo:      ${suma_prev:,.2f}")
        print(f"  presupuesto actualizado: ${suma_act:,.2f}")
        print(f"  gasto real (c/IVA):      ${suma_real:,.2f}  (sin desglose IVA — no especificado)")
        print(f"  proveedores únicos ({len(provs)}): {', '.join(provs[:12])}{' …' if len(provs) > 12 else ''}")
        for r in recs:
            r["empresa_id"] = EMPRESA_DILESA
            r["proyecto_id"] = a["proyecto_id"]
        registros.extend(recs)

    out_path = "/tmp/obra_presupuesto_traspaso.json"
    with open(out_path, "w") as f:
        json.dump(registros, f, ensure_ascii=False, indent=2)
    print(f"\n{'=' * 70}")
    print(f"TOTAL a cargar: {len(registros)} renglones de obra_presupuesto")
    print(f"JSON intermedio → {out_path}  (DRY-RUN: nada escrito en la DB)")


if __name__ == "__main__":
    main()
