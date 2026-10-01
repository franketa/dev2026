"""Wall panel: sale de una foto del plano de un proveedor (fuentes/wallpanel/foto-098.png).

La foto está girada y sesgada. Se endereza (las tres caras superiores tienen que quedar a la misma
altura y las paredes verticales a 90°), se lleva a las cotas del plano (169,2 × 23,5 mm) y se
reconstruye como polígono de tramos rectos. Control: el área da el peso que pasó Nacho (1,30 kg/m).

Uso: python tools/wallpanel.py   → build/masks/wallpanel/wp.png
"""
from pathlib import Path

import cv2
import numpy as np

ROOT = Path(__file__).resolve().parent.parent
PX2MM = 25.4 / 800
ANCHO, ALTO, KG = 169.2, 23.5, 1.30


def perfil_de_la_foto():
    im = cv2.imread(str(ROOT / "fuentes" / "wallpanel" / "foto-098.png"), cv2.IMREAD_GRAYSCALE)
    crop = im[200:480, 120:1500].astype(np.float32)
    bg = cv2.GaussianBlur(crop, (0, 0), 25)                       # iluminación pareja
    norm = np.clip(crop / bg * 255, 0, 255).astype(np.uint8)
    ink = (norm < 150).astype(np.uint8)
    n, lab, st, _ = cv2.connectedComponentsWithStats(ink, 8)
    return (lab == 1 + np.argmax(st[1:, 4])).astype(np.uint8)


def inclinacion(prof):
    """Ángulo que deja horizontales las caras superiores de los tres dientes."""
    def top(xa, xb):
        return np.median([np.nonzero(prof[:, c])[0].min() for c in range(xa, xb) if prof[:, c].any()])
    xs = [140, 520, 900]
    ys = [top(100, 200), top(470, 580), top(850, 960)]
    return float(np.degrees(np.arctan(np.polyfit(xs, ys, 1)[0])))


def sesgo(m):
    """Desvío horizontal por fila de las paredes verticales (0 = paredes a 90°)."""
    v = cv2.morphologyEx(m, cv2.MORPH_OPEN, cv2.getStructuringElement(cv2.MORPH_RECT, (1, int(m.shape[0] * 0.35))))
    n, lab, st, _ = cv2.connectedComponentsWithStats(v, 8)
    out = []
    for i in range(1, n):
        x, y, w, h, a = st[i]
        if h < m.shape[0] * 0.4:
            continue
        t = np.nonzero(lab[y + 3] == i)[0].mean()
        b = np.nonzero(lab[y + h - 4] == i)[0].mean()
        out.append((b - t) / (h - 7))
    return float(np.median(out)) if out else 0.0


def cortar(m):
    ys, xs = np.nonzero(m)
    return m[ys.min():ys.max() + 1, xs.min():xs.max() + 1]


def main():
    prof = perfil_de_la_foto()
    h, w = prof.shape
    up = 4
    big = cv2.resize(prof * 255, (w * up, h * up), interpolation=cv2.INTER_CUBIC)
    M = cv2.getRotationMatrix2D((w * up / 2, h * up / 2), inclinacion(prof), 1.0)
    rot = cortar((cv2.warpAffine(big, M, (w * up, h * up), flags=cv2.INTER_CUBIC) > 127).astype(np.uint8))

    def desesgar(m, sh):
        H, W = m.shape
        pad = int(abs(sh) * H) + 10
        r = cv2.warpAffine(m * 255, np.float32([[1, -sh, sh * H + pad], [0, 1, 0]]), (W + 2 * pad, H)) > 127
        return cortar(r).astype(np.uint8)

    s = sesgo(rot)
    rot = min((desesgar(rot, s), desesgar(rot, -s)), key=lambda r: abs(sesgo(r)))
    mm = cv2.resize(rot * 255, (round(ANCHO / PX2MM), round(ALTO / PX2MM)), interpolation=cv2.INTER_AREA) > 127

    # polígono de tramos rectos: lo casi horizontal / vertical se lleva a 0° / 90°
    c, _ = cv2.findContours(mm.astype(np.uint8), cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
    poly = cv2.approxPolyDP(max(c, key=cv2.contourArea), 0.22 / PX2MM, True)[:, 0, :].astype(float)
    for _ in range(4):
        for k in range(len(poly)):
            a, b = poly[k], poly[(k + 1) % len(poly)]
            ang = abs(np.degrees(np.arctan2(*(b - a)[::-1]))) % 180
            if ang < 15 or ang > 165:
                poly[k][1] = poly[(k + 1) % len(poly)][1] = (a[1] + b[1]) / 2
            elif 75 < ang < 105:
                poly[k][0] = poly[(k + 1) % len(poly)][0] = (a[0] + b[0]) / 2
    out = np.zeros_like(mm, np.uint8)
    cv2.fillPoly(out, [np.round(poly).astype(np.int32)], 1)
    dest = ROOT / "build" / "masks" / "wallpanel"
    dest.mkdir(parents=True, exist_ok=True)
    cv2.imwrite(str(dest / "wp.png"), 255 - out * 255)
    area = out.sum() * PX2MM ** 2
    print(f"wall panel {out.shape[1] * PX2MM:.1f} × {out.shape[0] * PX2MM:.1f} mm, "
          f"factor peso {(KG / 0.0027 / area) ** 0.5:.2f}")


if __name__ == "__main__":
    main()
