"""Lee las tablas "Índice de perfiles" de los catálogos Alpros → {código: (descripción, kg/m)}."""
import json
import re
from pathlib import Path

import fitz

ROOT = Path(__file__).resolve().parent.parent
FILES = ["01-HE-herrero", "02-MD-modena", "03-RT-rotonda", "10-RV-revestimientos", "12-MP-mampara"]


def clean(desc):
    desc = re.sub(r"\(\s*N[º°]?.*?\)", "", desc)          # "( N° 3 RT )"
    desc = re.sub(r"\(N\)|\*", "", desc)                   # marca de matriz nueva
    desc = re.sub(r"\s+", " ", desc).strip(" .")
    return desc[:1].upper() + desc[1:] if desc else desc


def parse(pdf):
    doc = fitz.open(pdf)
    out = {}
    for page in doc:
        if "Índice" not in page.get_text():
            continue
        words = page.get_text("words")
        rows = {}
        for w in words:
            rows.setdefault(round(w[1] / 3), []).append(w)
        for key in sorted(rows):
            ws = sorted(rows[key], key=lambda w: w[0])
            text = " ".join(w[4] for w in ws)
            m = re.match(r"CA(?:/[A-Z]{2})?\s*(\d{4})\s+(\d,\d{3})\s+(\S+)\s+(\S+)\s+(.*?)(?:\s+(\d{2}))?$", text)
            if not m:
                continue
            code, kg, desc = m.group(1), m.group(2), m.group(5)
            out[code] = (clean(desc), float(kg.replace(",", ".")))
    # respaldo: etiquetas de las páginas de detalle ("CA 1003 Jamba de hoja corrediza He 0.377 Kg/m")
    for page in doc:
        for b in page.get_text("blocks"):
            txt = re.sub(r"\s+", " ", b[4]).strip()
            m = re.match(r"CA(?:/[A-Z]{2})?\s*(\d{4})\s+(.*?)\s+(\d[.,]\d{3})\s*Kg/m", txt)
            if m and m.group(1) not in out:
                desc = re.sub(r"\s+(He|Md|MD|RT|Rt|RV|MP|Mp)$", "", m.group(2).strip())
                out[m.group(1)] = (clean(desc), float(m.group(3).replace(",", ".")))
    return out


if __name__ == "__main__":
    data = {}
    for f in FILES:
        rows = parse(ROOT / "fuentes" / "alpros" / f"{f}.pdf")
        data[f] = rows
        print(f, len(rows))
    (ROOT / "build").mkdir(exist_ok=True)
    (ROOT / "build" / "alpros-index.json").write_text(json.dumps(data, ensure_ascii=False, indent=1), "utf-8")
