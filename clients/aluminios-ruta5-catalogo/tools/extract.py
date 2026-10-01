"""Extrae la silueta de cada perfil de los catálogos de las extrusoras.

Por cada página de detalle:
  1. redibuja solo los trazos del perfil (sin textos, encabezados ni grises),
  2. arma la máscara de material (relleno directo en Alpros; en Alubon el dibujo es
     de contorno, así que se rellenan las zonas cerradas finas = paredes),
  3. agrupa las piezas de cada perfil y le asigna el código de la etiqueta más cercana,
  4. guarda la máscara de cada perfil (PNG 1 bit, escala conocida) + una hoja de control.

Uso: python tools/extract.py [fuente ...]
"""
import json, re, sys
from pathlib import Path

import cv2
import fitz
import numpy as np

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "fuentes"
OUT = ROOT / "build" / "masks"
QA = ROOT / "build" / "qa"

DPI = 800
PT2PX = DPI / 72
PX2MM = 25.4 / DPI

# fuente -> (pdf, páginas de detalle (1-based), modo, patrón de código en la etiqueta)
SOURCES = {
    "alpros-he": ("alpros/01-HE-herrero.pdf", range(8, 22), "filled", r"CA\s*(\d{4})"),
    "alpros-md": ("alpros/02-MD-modena.pdf", range(5, 13), "filled", r"CA(?:/MD)?\s*(\d{4})"),
    "alpros-rt": ("alpros/03-RT-rotonda.pdf", range(4, 8), "filled", r"CA(?:/RT)?\s*(\d{4})"),
    "alpros-rv": ("alpros/10-RV-revestimientos.pdf", range(3, 4), "filled", r"CA(?:/RV)?\s*(\d{4})"),
    "alpros-mp": ("alpros/12-MP-mampara.pdf", range(3, 4), "filled", r"CA(?:/MP)?\s*(\d{4})"),
    "alubon-m": ("alubon/ALBM-modena.pdf", range(2, 10), "outline", r"ALBM-(\d+)"),
    "alubon-3": ("alubon/ALB3-a30.pdf", [*range(2, 13), 14], "outline", r"ALB3-(\d+)"),
    "alubon-4": ("alubon/ALB4-a40.pdf", range(2, 7), "solid", r"ALB4-(\d+)"),
    "alubon-4c": ("alubon/ALB4C.pdf", range(2, 12), "outline", r"ALB4C-(\d+)"),
    "alubon-b": ("alubon/ALBB-baranda.pdf", range(2, 4), "outline", r"ALBB-(\d+)"),
    "alubon-i": ("alubon/ALBI-frente-integral.pdf", range(1, 4), "outline", r"ALBI-(\d+)"),
    "group": ("group/aluminium-group-catalogo.pdf", [], "filled", r"ALG\s*(\d+)"),     # solo recortes
    "alcenor": ("alcenor/230-premarco-tlt-lr.jpg", [], "filled", r"x"),
    "aluar": ("aluar/A30new-catalogo-tecnico.pdf", [], "outline", r"x"),
}

# Recortes manuales para los casos que la detección automática no resuelve:
# fuente -> código -> (pdf, página, (x0, y0, x1, y1) en pt, modo[, {"ancho_mm"|"alto_mm": cota real | "escala": k}])
OVERRIDES = {
    # planos sueltos de la web (imagen): recorte en píxeles y escala por cota
    "aluar": {   # catálogo A30 New de Aluar (vector, 1:1)
        "6050": ("aluar/A30new-catalogo-tecnico.pdf", 10, (176, 405, 230, 491), "outline"),
    },
    "alcenor": {
        "230": ("alcenor/230-premarco-tlt-lr.jpg", 0, (40, 255, 805, 610), "filled",
                {"ancho_mm": 49.26, "afinar_peso": 0.28}),
    },
    # Aluminium Group: siluetas negras (imagen) en 1:1
    "group": {
        "046": ("group/aluminium-group-catalogo.pdf", 20, (291, 177, 524, 302), "filled", {"original": True}),
        "781": ("group/aluminium-group-catalogo.pdf", 25, (129, 418, 462, 454), "filled", {"original": True}),
        "3103": ("group/aluminium-group-catalogo.pdf", 34, (332, 291, 487, 361), "filled", {"original": True}),
        "3104": ("group/aluminium-group-catalogo.pdf", 34, (135, 493, 292, 563), "filled", {"original": True}),
        "476": ("group/aluminium-group-catalogo.pdf", 61, (135, 239, 249, 310), "filled", {"original": True}),
        "477": ("group/aluminium-group-catalogo.pdf", 61, (349, 251, 476, 302), "filled", {"original": True}),
        "468": ("group/aluminium-group-catalogo.pdf", 61, (166, 432, 234, 555), "filled", {"original": True}),
        "439": ("group/aluminium-group-catalogo.pdf", 61, (383, 458, 453, 549), "filled", {"original": True}),
    },
    # FI: dibujado al ~78 %; se lleva a las cotas del plano (60 mm de ancho las columnas, etc.)
    "alubon-i": {
        "816": ("alubon/ALBI-frente-integral.pdf", 2, (152, 160, 296, 466), "solid", {"ancho_mm": 60, "original": True, "nivel": 248}),
        "817": ("alubon/ALBI-frente-integral.pdf", 2, (152, 523, 299, 709), "solid", {"ancho_mm": 60, "original": True, "nivel": 248}),
        "818": ("alubon/ALBI-frente-integral.pdf", 3, (111, 217, 284, 283), "solid", {"ancho_mm": 60, "original": True, "nivel": 248}),
        "819": ("alubon/ALBI-frente-integral.pdf", 3, (116, 412, 281, 451), "solid", {"ancho_mm": 57.6, "original": True, "nivel": 248}),
        "997": ("alubon/ALBI-frente-integral.pdf", 3, (134, 552, 254, 656), "solid", {"ancho_mm": 40, "original": True, "nivel": 248}),
    },
    # A4C: ninguno está en 1:1. Se usa el dibujo chico (sin cotas) llevado a la cota total del plano grande.
    "alubon-4c": {
        "40667": ("alubon/ALB4C.pdf", 2, (100, 558, 307, 672), "outline", {"ancho_mm": 94.4}),
        "40692": ("alubon/ALB4C.pdf", 3, (184, 585, 290, 718), "outline", {"alto_mm": 52.0}),
        "40671": ("alubon/ALB4C.pdf", 4, (128, 545, 331, 642), "outline", {"ancho_mm": 90.9}),
        "40672": ("alubon/ALB4C.pdf", 5, (111, 549, 342, 638), "outline", {"ancho_mm": 136.3}),
        "40206": ("alubon/ALB4C.pdf", 6, (133, 534, 319, 598), "outline", {"ancho_mm": 30.8}),
        "40691": ("alubon/ALB4C.pdf", 7, (386, 220, 486, 398), "outline", {"alto_mm": 65.65}),
        "40676": ("alubon/ALB4C.pdf", 8, (115, 523, 330, 598), "outline", {"ancho_mm": 136.3}),
        "40693": ("alubon/ALB4C.pdf", 10, (374, 485, 501, 580), "outline", {"alto_mm": 52.02}),
        "40161": ("alubon/ALB4C.pdf", 11, (338, 481, 542, 538), "outline", {"ancho_mm": 90.9}),
    },
    "alubon-3": {
        "061": ("alubon/ALB3-a30.pdf", 8, (295, 200, 392, 395), "outline"),
        "062": ("alubon/ALB3-a30.pdf", 8, (62, 390, 158, 710), "outline"),
        "066": ("alubon/ALB3-a30.pdf", 8, (362, 512, 520, 566), "outline"),
        "067": ("alubon/ALB3-a30.pdf", 8, (358, 660, 534, 714), "outline"),
        "074": ("alubon/ALB3-a30.pdf", 9, (214, 202, 310, 525), "outline"),
        "134": ("alubon/ALB3-a30.pdf", 11, (80, 243, 274, 381), "outline"),
        "171": ("alubon/ALB3-a30.pdf", 12, (112, 196, 309, 336), "outline"),
        "965": ("alubon/ALB3-a30.pdf", 12, (130, 634, 211, 719), "outline"),
        "068": ("alubon/ALB3-a30.pdf", 14, (166, 229, 528, 392), "outline", {"ancho_mm": 105}),  # dibujado al 118 %
        "073": ("alubon/ALB3-a30.pdf", 14, (268, 515, 358, 707), "outline"),
        "036": ("alubon/ALB3-a30.pdf", 3, (76, 230, 255, 354), "outline"),
        "042": ("alubon/ALB3-a30.pdf", 4, (298, 514, 474, 678), "outline"),
        "082": ("alubon/ALB3-a30.pdf", 10, (223, 539, 421, 722), "outline"),
    },
    "alubon-m": {
        "200": ("alubon/ALBM-modena.pdf", 2, (80, 176, 328, 328), "outline"),
        "201": ("alubon/ALBM-modena.pdf", 2, (120, 398, 258, 512), "outline"),
        "203": ("alubon/ALBM-modena.pdf", 2, (100, 640, 258, 724), "outline"),
        "205": ("alubon/ALBM-modena.pdf", 2, (412, 624, 528, 678), "outline"),
        "206": ("alubon/ALBM-modena.pdf", 3, (110, 219, 139, 309), "outline"),
        "207": ("alubon/ALBM-modena.pdf", 3, (240, 230, 356, 332), "outline"),
        "213": ("alubon/ALBM-modena.pdf", 3, (232, 424, 364, 480), "outline"),
        "230": ("alubon/ALBM-modena.pdf", 5, (100, 274, 193, 332), "outline"),
        "232": ("alubon/ALBM-modena.pdf", 5, (421, 274, 494, 332), "outline"),
        "237": ("alubon/ALBM-modena.pdf", 5, (158, 455, 210, 513), "outline"),
        "246": ("alubon/ALBM-modena.pdf", 7, (360, 606, 428, 730), "hull", {"gap": 45}),  # contorno abierto, sin cámaras
    },
    "alpros-he": {   # Alpros no trae el dibujo; sale del catálogo viejo AR5 (vector, ampliado)
        # el catálogo viejo dibuja cada perfil a una escala distinta → se escala por peso (±5 %)
        "1178": ("cliente/catalogo-viejo-AR5.pdf", 6, (400, 420, 518, 512), "filled", {"escala_peso": 0.272}),
        "1179": ("cliente/catalogo-viejo-AR5.pdf", 6, (106, 595, 205, 681), "filled", {"escala_peso": 0.332}),
    },
    "alubon-4": {
        "062": ("alubon/ALB4-a40.pdf", 2, (98, 525, 190, 726), "solid"),
        "378": ("alubon/ALB4-a40.pdf", 2, (348, 634, 506, 716), "solid"),
        "059": ("alubon/ALB4-a40.pdf", 4, (238, 655, 290, 710), "solid"),
        "264": ("alubon/ALB4-a40.pdf", 4, (158, 163, 233, 302), "solid"),
        "346": ("alubon/ALB4-a40.pdf", 4, (108, 434, 426, 484), "solid"),
        "934": ("alubon/ALB4-a40.pdf", 4, (152, 566, 410, 618), "solid"),
        "262": ("alubon/ALB4-a40.pdf", 5, (106, 333, 392, 446), "solid"),
        "283": ("alubon/ALB4-a40.pdf", 5, (90, 508, 248, 642), "solid"),
        "284": ("alubon/ALB4-a40.pdf", 5, (308, 560, 450, 628), "solid"),
        "270": ("alubon/ALB4-a40.pdf", 6, (150, 210, 284, 455), "solid", {"solo_perfil": True}),
        "271": ("alubon/ALB4-a40.pdf", 6, (126, 515, 306, 660), "solid", {"solo_perfil": True}),
        "263": ("alubon/ALB4-a40.pdf", 5, (104, 172, 392, 300), "solid"),
    },
}

# zona útil de la página (pt): fuera quedan encabezado y pie
INK_LEVEL = {"filled": 128, "outline": 128, "solid": 215, "hull": 128}   # gris claro de relleno en "solid"
BAND = {"filled": (60, 772), "outline": (95, 800), "solid": (95, 800)}

WALL_MAX_MM = 8.0     # en contorno, zonas cerradas más gruesas que esto no son pared (bolsillos, recuadros)
MERGE_MM = 2.2        # piezas a menos de esto son el mismo perfil
MIN_SIDE_MM = 3.0     # descartar grupos más chicos (restos de texto)
GAP_PX = 1                # sin cierre por defecto; los recortes que lo necesitan pasan {"gap": px}
CROP_PAD = 6              # pt de margen alrededor de cada recorte manual
MAX_LABEL_MM = 45         # etiqueta a más de esto del perfil = asignación dudosa → recorte manual
SMALL_FILL_PT = 9.0       # pt (~3 mm): en contorno, rellenos más chicos son letras o flechas
MIN_OUTLINE_STROKE = 0.25 # pt: en contorno, trazos más finos son cotas o ejes


def is_dark(rgb):
    """Tinta de dibujo: negro o gris (Alubon dibuja algunos perfiles en gris). El azul es texto/marca."""
    if rgb is None or len(rgb) < 3:
        return rgb is not None and min(rgb) < 0.8
    r, g, b = rgb[:3]
    bluish = b - r > 0.25
    return not bluish and max(rgb) < 0.8


def is_white(rgb):
    return rgb is not None and min(rgb) > 0.95


def clean_page(page, mode="filled"):
    """Página nueva solo con el dibujo del perfil, pintado en el mismo orden que el original.

    El orden importa: hay páginas con imágenes viejas tapadas por rectángulos blancos y otras con
    fondos blancos debajo de la imagen del plano.
    """
    doc = fitz.open()
    np_ = doc.new_page(width=page.rect.width, height=page.rect.height)
    ops = []
    # imágenes: la secuencia de pintado sale del bboxlog; el xref se busca por el rectángulo
    rects = {}
    for img in page.get_images(full=True):
        for r in page.get_image_rects(img[0]):
            rects[(round(r.x0, 1), round(r.y0, 1), round(r.x1, 1), round(r.y1, 1))] = img[0]
    for seq, (kind, bb) in enumerate(page.get_bboxlog()):
        if kind != "fill-image":
            continue
        key = tuple(round(v, 1) for v in bb)
        xref = rects.get(key)
        r = fitz.Rect(bb)
        if xref and r.width * r.height >= 400 and r.intersects(page.rect):
            ops.append((seq, "img", xref, r))
    for d in page.get_drawings():
        ops.append((d["seqno"], "draw", d, None))
    ops.sort(key=lambda o: o[0])

    pixcache = {}
    for _, kind, obj, r in ops:
        if kind == "img":
            if obj not in pixcache:
                try:
                    pix = fitz.Pixmap(page.parent, obj)
                    if pix.alpha or pix.n > 3:
                        pix = fitz.Pixmap(fitz.csRGB, pix)
                    pixcache[obj] = pix
                except Exception:
                    pixcache[obj] = None
            if pixcache[obj] is not None:
                np_.insert_image(r, pixmap=pixcache[obj])
            continue
        d = obj
        fill, col = d.get("fill"), d.get("color")
        dark_fill, white_fill = is_dark(fill), is_white(fill)
        dark_stroke = d["type"] in ("s", "fs") and is_dark(col)
        # En los dibujos de contorno (Alubon) las cotas y ejes (~0,2 pt) cortarían las cámaras.
        if mode in ("outline", "solid") and d["type"] == "s" and (d.get("width") or 0) < MIN_OUTLINE_STROKE:
            continue
        if not (dark_fill or white_fill or dark_stroke):
            continue
        # letras dibujadas como vector y puntas de flecha: rellenos chicos
        rr = d["rect"]
        if mode in ("outline", "solid") and d["type"] == "f" and max(rr.width, rr.height) < SMALL_FILL_PT:
            continue
        sh = np_.new_shape()
        for it in d["items"]:
            if it[0] == "l":
                sh.draw_line(it[1], it[2])
            elif it[0] == "c":
                sh.draw_bezier(it[1], it[2], it[3], it[4])
            elif it[0] == "re":
                sh.draw_rect(it[1])
            elif it[0] == "qu":
                sh.draw_quad(it[1])
        sh.finish(
            fill=(0, 0, 0) if dark_fill else (1, 1, 1) if white_fill else None,
            color=(0, 0, 0) if dark_stroke else None,
            width=d.get("width") or 0,
            even_odd=bool(d.get("even_odd")),
            closePath=bool(d.get("closePath")),
        )
        sh.commit()
    return doc, np_


def material_mask(ink, mode, gap=None):
    if mode == "filled":
        return ink.copy()
    if mode == "hull":
        # perfiles sin cámaras cerradas: todo lo que queda dentro del contorno es material
        closed = cv2.morphologyEx(ink, cv2.MORPH_CLOSE,
                                  cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (gap or 31, gap or 31)))
        bg = cv2.copyMakeBorder((1 - closed).astype(np.uint8), 1, 1, 1, 1, cv2.BORDER_CONSTANT, value=1)
        n, lab = cv2.connectedComponents(bg, connectivity=4)
        outside = lab == lab[0, 0]
        return (~outside[1:-1, 1:-1]).astype(np.uint8)
    if mode == "solid":
        # silueta rellena (gris) con contorno: sacar líneas finas que queden (cotas en imágenes)
        r = max(1, int(round(0.3 / PX2MM)))
        k = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (2 * r + 1, 2 * r + 1))
        return cv2.morphologyEx(ink, cv2.MORPH_OPEN, k)
    # cerrar huecos mínimos del contorno (uniones mal cerradas en el dibujo original)
    g = gap or GAP_PX
    if g > 1:
        ink = cv2.morphologyEx(ink, cv2.MORPH_CLOSE, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (g, g)))
    # Dibujo de contorno: cada línea separa material de vacío. Desde afuera (vacío) se alterna
    # al cruzar una línea; además una zona es material solo si no es demasiado gruesa.
    bg = (1 - ink).astype(np.uint8)
    n, lab = cv2.connectedComponents(bg, connectivity=4)
    dist = cv2.distanceTransform(bg, cv2.DIST_L2, 5)
    maxd = np.zeros(n)
    np.maximum.at(maxd, lab.ravel(), dist.ravel())
    thin = (maxd * 2 * PX2MM) < WALL_MAX_MM
    # profundidad de anidamiento de cada zona: afuera = 0, pared = 1, cámara = 2, ...
    # margen de fondo: OpenCV toma el borde de la imagen como tinta
    padded = cv2.copyMakeBorder(bg, 1, 1, 1, 1, cv2.BORDER_CONSTANT, value=1)
    contours, hier = cv2.findContours(padded, cv2.RETR_TREE, cv2.CHAIN_APPROX_NONE)
    parity = {}
    if hier is not None:
        hier = hier[0]
        for i, c in enumerate(contours):
            d, j = 0, hier[i][3]
            while j != -1:
                d += 1
                j = hier[j][3]
            if d % 2:          # contorno de hueco (tinta), no de zona
                continue
            x, y = c[0][0]
            x, y = min(max(x - 1, 0), lab.shape[1] - 1), min(max(y - 1, 0), lab.shape[0] - 1)
            zone = lab[y, x]
            if zone > 0:
                parity[int(zone)] = (d // 2) % 2
    mat_lab = np.zeros(n + 1, bool)
    for i, par in parity.items():
        if par == 1 and thin[i]:
            mat_lab[i] = True
    mat = mat_lab[lab].astype(np.uint8)
    # sumar el trazo del contorno, solo donde toca material (así las cotas no entran)
    r2 = max(3, int(round(0.25 / PX2MM)))
    near = cv2.dilate(mat, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (2 * r2 + 1, 2 * r2 + 1)))
    return ((mat > 0) | ((ink > 0) & (near > 0))).astype(np.uint8)


def is_window_icon(m):
    """Íconos de ventana de Alubon: marco rectangular chico con el borde casi completo."""
    # mirar solo la pieza más grande (el marco), sin las flechas que lo acompañan
    n, lab, st, _ = cv2.connectedComponentsWithStats(m.astype(np.uint8), connectivity=8)
    if n < 2:
        return False
    i = 1 + int(np.argmax(st[1:, cv2.CC_STAT_AREA]))
    x, y, w, h = st[i, :4]
    m = lab[y:y + h, x:x + w] == i
    if max(h, w) * PX2MM > 26:
        return False
    b = max(2, int(round(1.0 / PX2MM)))
    edges = [m[:b, :].any(0), m[-b:, :].any(0), m[:, :b].any(1), m[:, -b:].any(1)]
    cover = min(e.mean() for e in edges)
    return cover > 0.9


def clusters(mat, filtrar=True):
    r = int(round(MERGE_MM / PX2MM / 2))
    grown = cv2.dilate(mat, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (2 * r + 1, 2 * r + 1)))
    n, lab, stats, _ = cv2.connectedComponentsWithStats(grown, connectivity=8)
    out = []
    for i in range(1, n):
        x, y, w, h, _ = stats[i]
        sub = (lab[y:y + h, x:x + w] == i) & (mat[y:y + h, x:x + w] > 0)
        ys, xs = np.nonzero(sub)
        if len(xs) == 0:
            continue
        x0, x1, y0, y1 = x + xs.min(), x + xs.max() + 1, y + ys.min(), y + ys.max() + 1
        w_mm, h_mm = (x1 - x0) * PX2MM, (y1 - y0) * PX2MM
        fill = sub.sum() / float((x1 - x0) * (y1 - y0))
        if not filtrar:
            if max(w_mm, h_mm) >= 1.0 and not is_window_icon(sub[ys.min():ys.max() + 1, xs.min():xs.max() + 1]):
                out.append({"bbox": [int(x0), int(y0), int(x1), int(y1)], "label": i, "lab": lab})
            continue
        if max(w_mm, h_mm) < 7:
            continue                       # letras sueltas, flechas de cota
        if min(w_mm, h_mm) < 4.5 and fill < 0.3:
            continue                       # renglones de texto dibujado (puntos dispersos)
        if is_window_icon(sub[ys.min():ys.max() + 1, xs.min():xs.max() + 1]):
            continue
        out.append({"bbox": [int(x0), int(y0), int(x1), int(y1)], "label": i, "lab": lab})
    return out


def labels(page, pattern):
    words = page.get_text("words")
    text = [(w[0], w[1], w[2], w[3], w[4]) for w in words]
    found = []
    # juntar palabras consecutivas de la misma línea para códigos tipo "CA 1001"
    for i, w in enumerate(text):
        cand = w[4]
        if i + 1 < len(text) and abs(text[i + 1][1] - w[1]) < 2:
            cand2 = cand + " " + text[i + 1][4]
        else:
            cand2 = cand
        for c in (cand, cand2):
            m = re.fullmatch(pattern, c)
            if m:
                found.append({"code": m.group(1), "x": (w[0] + w[2]) / 2, "y": (w[1] + w[3]) / 2})
                break
    uniq = {}
    for f in found:
        uniq.setdefault(f["code"], f)
    return list(uniq.values())


def assign(cls, labs):
    """Emparejamiento codicioso por distancia etiqueta → caja del perfil."""
    pairs = []
    for li, l in enumerate(labs):
        lx, ly = l["x"] * PT2PX, l["y"] * PT2PX
        for ci, c in enumerate(cls):
            x0, y0, x1, y1 = c["bbox"]
            dx = max(x0 - lx, 0, lx - x1)
            dy = max(y0 - ly, 0, ly - y1)
            pairs.append(((dx * dx + dy * dy) ** 0.5, li, ci))
    pairs.sort()
    used_l, used_c, res = set(), set(), {}
    for dist, li, ci in pairs:
        if li in used_l or ci in used_c or dist * PX2MM > MAX_LABEL_MM:
            continue
        used_l.add(li)
        used_c.add(ci)
        res[ci] = (labs[li]["code"], dist * PX2MM)
    return res


def crop_mask(pdf, pno, rect, mode, gap=None, original=False, nivel=None):
    """Recorte manual: procesa solo el rectángulo y se queda con el perfil (pieza más grande + cercanas)."""
    src = fitz.open(SRC / pdf)
    page = src[pno - 1]
    # "original": usar la página tal cual (degradés recortados por trazados que la capa limpia no respeta)
    doc, clean = (None, page) if original else clean_page(page, mode)
    # margen: que el recorte nunca corte el perfil (cotas e íconos se descartan igual)
    pm = clean.get_pixmap(dpi=DPI, clip=fitz.Rect(*rect) + (-CROP_PAD, -CROP_PAD, CROP_PAD, CROP_PAD),
                          colorspace=fitz.csGRAY)
    img = np.frombuffer(pm.samples, np.uint8).reshape(pm.height, pm.width)
    ink = (img < (nivel or INK_LEVEL[mode])).astype(np.uint8)
    mat = material_mask(ink, mode, gap)
    cls = clusters(mat, filtrar=False)
    if not cls:
        return None
    # todo el material de los grupos válidos del recuadro (hay perfiles en varias piezas)
    keep = np.zeros_like(mat, bool)
    for c in cls:
        keep |= (c["lab"] == c["label"]) & (mat > 0)
    ys, xs = np.nonzero(keep)
    return keep[ys.min():ys.max() + 1, xs.min():xs.max() + 1]


def image_mask(path, rect_px, mode, nivel=None):
    """Recorte de un archivo de imagen (planos sueltos de la web). La escala sale de "ancho_mm"/"alto_mm"."""
    img = cv2.imread(str(SRC / path), cv2.IMREAD_GRAYSCALE)
    x0, y0, x1, y1 = rect_px
    img = img[y0:y1, x0:x1]
    ink = (img < (nivel or 128)).astype(np.uint8)
    # sacar líneas de cota (finas) y quedarse con la silueta
    k = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5))
    ink = cv2.morphologyEx(ink, cv2.MORPH_OPEN, k)
    n, lab, st, _ = cv2.connectedComponentsWithStats(ink, connectivity=8)
    if n < 2:
        return None
    i = 1 + int(np.argmax(st[1:, cv2.CC_STAT_AREA]))
    x, y, w, h = st[i, :4]
    m = lab[y:y + h, x:x + w] == i
    return material_mask(m.astype(np.uint8), mode).astype(bool) if mode != "filled" else m


def run_overrides(name):
    rep = []
    for code, spec in OVERRIDES.get(name, {}).items():
        pdf, pno, rect, mode = spec[:4]
        opts = spec[4] if len(spec) > 4 else {}
        if pdf.lower().endswith((".jpg", ".jpeg", ".png")):
            m = image_mask(pdf, rect, mode, opts.get("nivel"))
        else:
            m = crop_mask(pdf, pno, rect, mode, opts.get("gap"), opts.get("original", False),
                          opts.get("nivel"))
        if m is not None and ("ancho_mm" in opts or "alto_mm" in opts or "escala" in opts):
            # el dibujo no está en 1:1: reescalar a la cota real (o por un factor conocido)
            if "escala" in opts:
                k = opts["escala"]
            elif "ancho_mm" in opts:
                k = opts["ancho_mm"] / (m.shape[1] * PX2MM)
            else:
                k = opts["alto_mm"] / (m.shape[0] * PX2MM)
            m8 = cv2.resize(m.astype(np.uint8) * 255, (max(1, round(m.shape[1] * k)), max(1, round(m.shape[0] * k))),
                            interpolation=cv2.INTER_AREA)
            m = m8 > 127
        if m is not None and opts.get("solo_perfil"):
            # quedarse con la pieza principal: fuera restos de accesorios, felpas y líneas punteadas
            n, lab, st, _ = cv2.connectedComponentsWithStats(m.astype(np.uint8), connectivity=8)
            if n > 1:
                i = 1 + int(np.argmax(st[1:, cv2.CC_STAT_AREA]))
                m = lab == i
                ys, xs = np.nonzero(m)
                m = m[ys.min():ys.max() + 1, xs.min():xs.max() + 1]
        if m is not None and "afinar_peso" in opts:
            # paredes dibujadas más gruesas que las reales (perfil de pared pareja): afinar al kg/m
            objetivo = opts["afinar_peso"] / 0.0027 / PX2MM ** 2
            k3 = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (3, 3))
            cur = m.astype(np.uint8)
            while cur.sum() > objetivo:
                nxt = cv2.erode(cur, k3)
                if nxt.sum() < objetivo * 0.95:
                    break
                cur = nxt
            m = cur > 0
        if m is not None and "escala_peso" in opts:
            # sin cota ni fuente en 1:1: escalar para que el área de la sección dé el kg/m real
            objetivo = opts["escala_peso"] / 0.0027
            k = (objetivo / (m.sum() * PX2MM ** 2)) ** 0.5
            m8 = cv2.resize(m.astype(np.uint8) * 255, (max(1, round(m.shape[1] * k)), max(1, round(m.shape[0] * k))),
                            interpolation=cv2.INTER_AREA)
            m = m8 > 127
        if m is None:
            rep.append({"src": name, "page": pno, "code": code, "missing": True, "override": True})
            continue
        cv2.imwrite(str(OUT / name / f"{code}.png"), 255 - m.astype(np.uint8) * 255)
        rep.append({"src": name, "page": pno, "code": code, "override": True,
                    "w_mm": round(m.shape[1] * PX2MM, 1), "h_mm": round(m.shape[0] * PX2MM, 1)})
    return rep


def run(name):
    pdf, pages, mode, pattern = SOURCES[name]
    src = fitz.open(SRC / pdf) if pages else None
    (OUT / name).mkdir(parents=True, exist_ok=True)
    for old in (OUT / name).glob("*.png"):      # nada de máscaras viejas de corridas anteriores
        old.unlink()
    QA.mkdir(parents=True, exist_ok=True)
    report = []
    for pno in pages:
        page = src[pno - 1]
        doc, clean = clean_page(page, mode)
        y0, y1 = BAND[mode]
        clip = fitz.Rect(0, y0, page.rect.width, y1)
        pm = clean.get_pixmap(dpi=DPI, clip=clip, colorspace=fitz.csGRAY)
        img = np.frombuffer(pm.samples, np.uint8).reshape(pm.height, pm.width)
        ink = (img < INK_LEVEL[mode]).astype(np.uint8)
        mat = material_mask(ink, mode)
        cls = clusters(mat)
        labs = labels(page, pattern)
        for l in labs:
            l["y"] -= y0
        match = assign(cls, labs)

        qa = cv2.cvtColor(255 - mat * 255, cv2.COLOR_GRAY2BGR)
        for ci, c in enumerate(cls):
            x0, yy0, x1, yy1 = c["bbox"]
            code, dist = match.get(ci, (None, None))
            color = (40, 160, 40) if code else (0, 0, 255)
            cv2.rectangle(qa, (x0, yy0), (x1, yy1), color, 6)
            cv2.putText(qa, code or "?", (x0, max(60, yy0 - 15)), cv2.FONT_HERSHEY_SIMPLEX, 2.4, color, 6)
            if code:
                pad = 8
                sub = c["lab"][max(0, yy0 - pad):yy1 + pad, max(0, x0 - pad):x1 + pad]
                m = (sub == c["label"]) & (mat[max(0, yy0 - pad):yy1 + pad, max(0, x0 - pad):x1 + pad] > 0)
                cv2.imwrite(str(OUT / name / f"{code}.png"), (255 - m.astype(np.uint8) * 255))
                report.append({"src": name, "page": pno, "code": code, "w_mm": round((x1 - x0) * PX2MM, 1),
                               "h_mm": round((yy1 - yy0) * PX2MM, 1), "label_dist_mm": round(dist, 1)})
        for l in labs:
            if l["code"] not in [m[0] for m in match.values()]:
                cv2.putText(qa, "sin perfil: " + l["code"], (int(l["x"] * PT2PX), int(l["y"] * PT2PX)),
                            cv2.FONT_HERSHEY_SIMPLEX, 2.4, (0, 0, 255), 6)
                report.append({"src": name, "page": pno, "code": l["code"], "missing": True})
        small = cv2.resize(qa, (qa.shape[1] // 6, qa.shape[0] // 6), interpolation=cv2.INTER_AREA)
        cv2.imwrite(str(QA / f"{name}-p{pno:02d}.png"), small)
    return report


if __name__ == "__main__":
    names = sys.argv[1:] or list(SOURCES)
    allrep = []
    for n in names:
        rep = run(n)
        over = run_overrides(n)
        fixed = {r["code"] for r in over if not r.get("missing")}
        rep = [r for r in rep if r["code"] not in fixed] + over
        allrep += rep
        ok = sum(1 for r in rep if not r.get("missing"))
        miss = [r["code"] for r in rep if r.get("missing")]
        print(f"{n:10} perfiles={ok:3} sin_perfil={miss}")
    (ROOT / "build").mkdir(exist_ok=True)
    prev = ROOT / "build" / "extract-report.json"
    old = json.loads(prev.read_text("utf-8")) if prev.exists() else []
    old = [r for r in old if r["src"] not in names]
    prev.write_text(json.dumps(old + allrep, ensure_ascii=False, indent=1), "utf-8")
