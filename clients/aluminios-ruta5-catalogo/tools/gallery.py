"""Hoja de control: todas las siluetas extraídas de una fuente, a la misma escala.

Uso: python tools/gallery.py alubon-3 [px_por_mm]
"""
import sys
from pathlib import Path

import cv2
import numpy as np

ROOT = Path(__file__).resolve().parent.parent
MASKS = ROOT / "build" / "masks"
PX2MM = 25.4 / 800


def main(src, px_mm=4.0):
    files = sorted((MASKS / src).glob("*.png"))
    tiles = []
    for f in files:
        m = cv2.imread(str(f), cv2.IMREAD_GRAYSCALE)
        s = px_mm * PX2MM
        m = cv2.resize(m, (max(1, int(m.shape[1] * s)), max(1, int(m.shape[0] * s))), interpolation=cv2.INTER_AREA)
        pad = 50
        tile = np.full((m.shape[0] + pad + 20, max(m.shape[1], 200) + 20), 255, np.uint8)
        tile[pad:pad + m.shape[0], 10:10 + m.shape[1]] = m
        cv2.putText(tile, f.stem, (10, 34), cv2.FONT_HERSHEY_SIMPLEX, 1.0, 0, 2)
        tiles.append(tile)
    width = 2400
    rows, row, rw = [], [], 0
    for t in tiles:
        if rw + t.shape[1] > width and row:
            rows.append(row)
            row, rw = [], 0
        row.append(t)
        rw += t.shape[1]
    if row:
        rows.append(row)
    out = []
    for r in rows:
        h = max(t.shape[0] for t in r)
        line = np.full((h, width), 255, np.uint8)
        x = 0
        for t in r:
            line[:t.shape[0], x:x + t.shape[1]] = t
            x += t.shape[1]
        out.append(line)
    sheet = np.vstack(out)
    dest = ROOT / "build" / f"gallery-{src}.png"
    cv2.imwrite(str(dest), sheet)
    print(dest, sheet.shape)


if __name__ == "__main__":
    main(sys.argv[1], float(sys.argv[2]) if len(sys.argv) > 2 else 4.0)
