#!/usr/bin/env python3
"""
Convierte de ALL CAPS a Title Case los nombres de proveedores DILESA
que vinieron del padrón CONTPAQi (los 190 cargados el 2026-05-06).

Reglas:
- Lowercase la cadena, luego capitaliza selectivamente.
- Preposiciones/artículos no-iniciales en minúsculas
  (de, del, la, las, los, el, y, e, en, a, al, o, u).
- Tokens single-letter en MAYÚSCULAS (iniciales J, A, H, E, B...).
- Tokens con puntos internos en MAYÚSCULAS (S.A., S.A.B., R.L.).
- Tokens 2-4 chars all-caps en MAYÚSCULAS (acrónimos: BBVA, DHL, OXXO,
  IMSS, BAME, BLYM, ULA, etc.).
- Tokens 5+ chars en title case (Aikin, Mexico, Coahuila).

Lee la lista (persona_id + nombre) por stdin como JSON array. Emite
SQL UPDATE transaccional por stdout.

Uso (vía MCP, no usa psycopg2):

    cat snapshot.json | python3 scripts/import-contpaqi/dilesa-proveedores-titlecase.py \\
      > scripts/import-contpaqi/sql/apply-dilesa-proveedores-titlecase-2026-05-06.sql
"""

from __future__ import annotations

import json
import re
import sys

PREPOSICIONES = {
    "de", "del", "la", "las", "los", "el", "y", "e", "en", "a", "al", "o", "u"
}

# Whitelist de acrónimos que aparecen en el padrón DILESA y deben
# preservarse en MAYÚSCULAS aunque tengan 2-5 chars. Lista construida
# revisando manualmente los 190 nombres del Excel CONTPAQi.
ACRONIMOS_CONOCIDOS = {
    "BBVA", "CFE", "DHL", "OXXO", "IMSS", "BAME", "BLYM", "TPN",
    "ULA", "NMD", "CLS", "BMM", "ICI", "JG", "BI", "EME", "BN",
    "CIA", "SA", "SAB", "RL", "SC", "SAS", "DIPSA", "ARSA",
    "MCT", "IB",
    # Tokens single-letter aparecen como siglas en cadenas como "H E B"
    # (Supermercados Internacionales H E B). Ya cubiertos por la regla
    # de "single letter" — listados aquí solo como documentación.
}


def title_case_es(s: str) -> str:
    word_tokens = s.split()
    cores: list[str] = []
    leadings: list[str] = []
    trailings: list[str] = []
    for tok in word_tokens:
        m = re.match(r"^(\W*)(.*?)(\W*)$", tok, flags=re.UNICODE)
        if m:
            leadings.append(m.group(1))
            cores.append(m.group(2))
            trailings.append(m.group(3))
        else:
            leadings.append("")
            cores.append(tok)
            trailings.append("")

    in_initials_run = [False] * len(cores)
    for i, c in enumerate(cores):
        if not (len(c) == 1 and c.isalpha()):
            continue
        prev_is_single = i > 0 and len(cores[i - 1]) == 1 and cores[i - 1].isalpha()
        next_is_single = (
            i + 1 < len(cores) and len(cores[i + 1]) == 1 and cores[i + 1].isalpha()
        )
        if prev_is_single or next_is_single:
            in_initials_run[i] = True

    out_words = []
    for i, core in enumerate(cores):
        if core == "":
            out_words.append(leadings[i] + trailings[i])
        else:
            transformed = transform_token(core, i, in_initials_run[i])
            out_words.append(leadings[i] + transformed + trailings[i])
    return " ".join(out_words)


def transform_token(token: str, position: int, in_initials_run: bool = False) -> str:
    lower = token.lower()
    # 1. Single-letter dentro de un run de iniciales (H E B, J A) →
    #    MAYÚSCULAS. Tiene prioridad sobre preposiciones para evitar
    #    convertir la "E" central de "H E B" en "e".
    if len(token) == 1 and token.isalpha() and in_initials_run:
        return token.upper()
    # 2. Preposiciones/conjunciones (de, la, los, y, e, o, u, etc.) en
    #    posición no-inicial y NO dentro de un run de iniciales.
    if position > 0 and lower in PREPOSICIONES:
        return lower
    # 3. Tokens con puntos internos (S.A., S.A.B., R.L., S.A. de C.V.).
    if "." in token and len(token) <= 8:
        return token.upper()
    # 4. Single-letter restante (inicial al inicio de la cadena, ej. "U" en
    #    "U LAB", o iniciales de persona aisladas).
    if len(token) == 1 and token.isalpha():
        return token.upper()
    # 5. Acrónimos conocidos del padrón (whitelist explícita).
    if token.upper() in ACRONIMOS_CONOCIDOS:
        return token.upper()
    # 6. Default: title-case (primera letra mayúscula, resto minúscula).
    return token.capitalize()


def sql_quote(s: str) -> str:
    return "'" + s.replace("'", "''") + "'"


def main() -> int:
    rows = json.load(sys.stdin)
    out = sys.stdout
    out.write(
        "-- Generado por scripts/import-contpaqi/dilesa-proveedores-titlecase.py\n"
        "-- Fecha: 2026-05-06\n"
        "-- Convierte ALL CAPS → Title Case para los 190 nombres del padrón\n"
        "-- CONTPAQi DILESA cargados el 2026-05-06.\n"
        "--\n"
        "-- Reglas: preposiciones (de/la/los/y/...) en minúsculas;\n"
        "-- single-letters y tokens con puntos en MAYÚSCULAS;\n"
        "-- tokens 2-4 chars all-caps preservados como acrónimos\n"
        "-- (BBVA, DHL, OXXO, IMSS, BAME, etc.); 5+ chars normalizados.\n\n"
        "BEGIN;\n\n"
    )
    cambios = 0
    sin_cambio = 0
    for row in rows:
        pid = row["persona_id"]
        original = row["nombre"]
        nuevo = title_case_es(original)
        if nuevo == original:
            sin_cambio += 1
            continue
        cambios += 1
        out.write(
            f"UPDATE erp.personas SET nombre = {sql_quote(nuevo)} "
            f"WHERE id = '{pid}';\n"
        )
    out.write(f"\nCOMMIT;\n")
    print(
        f"-- Procesadas {len(rows)} filas; {cambios} cambios, {sin_cambio} sin cambio",
        file=sys.stderr,
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
