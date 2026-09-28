"""Control de escala por peso: el área de la silueta debe coincidir con kg/m ÷ densidad del aluminio.

factor = √(área esperada / área medida). 1.00 = escala real; 0.8 = el dibujo está 25 % grande, etc.
Uso: python tools/check_scale.py
"""
import json
import sys
from pathlib import Path

import cv2
import numpy as np

sys.path.insert(0, str(Path(__file__).parent))
from lineas import LINEAS  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
MASKS = ROOT / "build" / "masks"
PX2MM = 25.4 / 800
DENSIDAD = 2.70  # g/cm³ → kg/m = mm² × 0,0027


def main():
    rows = []
    for linea in LINEAS:
        for p in linea["perfiles"]:
            if not p.get("mask") or not p.get("kg"):
                continue
            f = MASKS / f"{p['mask']}.png"
            if not f.exists():
                rows.append((linea["nombre"], p["codigo"], None, None, "sin máscara"))
                continue
            m = cv2.imread(str(f), cv2.IMREAD_GRAYSCALE) < 128
            area = m.sum() * PX2MM ** 2
            esperada = p["kg"] / (DENSIDAD / 1000)
            factor = (esperada / area) ** 0.5 if area else 0
            rows.append((linea["nombre"], p["codigo"], round(area), round(esperada), round(factor, 2)))
    for r in rows:
        flag = "" if isinstance(r[4], float) and 0.88 <= r[4] <= 1.12 else "  <-- revisar"
        print(f"{r[0]:9} {r[1]:14} área={r[2]} esperada={r[3]} factor={r[4]}{flag}")
    (ROOT / "build" / "scale-check.json").write_text(json.dumps(rows, ensure_ascii=False), "utf-8")


if __name__ == "__main__":
    main()
