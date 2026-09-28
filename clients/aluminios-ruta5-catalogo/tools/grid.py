"""Renderiza una página con grilla en puntos PDF, para marcar recortes manuales.

Uso: python tools/grid.py alubon/ALB4-a40.pdf 2 [3 ...]
"""
import sys
from pathlib import Path

import fitz

ROOT = Path(__file__).resolve().parent.parent


def main(pdf, pages):
    doc = fitz.open(ROOT / "fuentes" / pdf)
    for pno in pages:
        page = doc[pno - 1]
        sh = page.new_shape()
        w, h = page.rect.width, page.rect.height
        for x in range(0, int(w) + 1, 20):
            sh.draw_line((x, 0), (x, h))
        for y in range(0, int(h) + 1, 20):
            sh.draw_line((0, y), (w, y))
        sh.finish(color=(1, 0, 0), width=0.2 if True else 0, stroke_opacity=0.35)
        sh.commit()
        for x in range(0, int(w) + 1, 40):
            page.insert_text((x + 1, 8), str(x), fontsize=5, color=(1, 0, 0))
        for y in range(0, int(h) + 1, 40):
            page.insert_text((1, y - 1), str(y), fontsize=5, color=(1, 0, 0))
        out = ROOT / "build" / f"grid-{Path(pdf).stem}-p{pno:02d}.png"
        page.get_pixmap(dpi=110).save(out)
        print(out)


if __name__ == "__main__":
    main(sys.argv[1], [int(p) for p in sys.argv[2:]])
