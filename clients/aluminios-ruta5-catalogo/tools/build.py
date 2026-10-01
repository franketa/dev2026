"""Arma el catálogo AR5: vectoriza las siluetas y genera un HTML de hojas A4 (perfiles en escala 1:1),
que después Chrome imprime a PDF.

Uso: python tools/build.py            → build/catalogo.html + dist/catalogo-perfiles-ar5.pdf
"""
import html
import subprocess
import sys
from datetime import date
from pathlib import Path

import cv2
import numpy as np

sys.path.insert(0, str(Path(__file__).parent))
from lineas import DECO, LINEAS, WALL_PANEL  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
MASKS = ROOT / "build" / "masks"
PX2MM = 25.4 / 800
CHROME = r"C:\Program Files\Google\Chrome\Application\chrome.exe"

# ------------------------------------------------------------------ página (mm)
PAGE_W, PAGE_H = 210, 297
MARGIN_X = 15
CONTENT_W = PAGE_W - 2 * MARGIN_X
TOP = 30              # debajo del encabezado
BOTTOM = 20           # encima del pie
LINE_HEAD = 34        # alto extra del título de línea en su primera hoja
LABEL_H = 17          # código + nombre (hasta 3 renglones) + kg/m
CELL_MIN_W = 36
GAP_X, GAP_Y = 9, 10

LINEA_INFO = {   # solo lo que surge de los perfiles de cada línea
    "Clásica": "Ventanas y puertas corredizas, de abrir, postigones y cortinas de enrollar.",
    "RTO640": "Corredizas de vidrio simple y DVH, con premarco.",
    "MDNA": "Corredizas, puertas de rebatir, ventanas de abrir, desplazables y ventiluz.",
    "A3": "Corredizas de 2, 3 y 4 hojas, puertas de rebatir y ventanas de abrir y desplazables.",
    "A4": "Corredizas con DVH.",
    "A4C": "Corredizas de 2 y 3 hojas.",
    "Baranda": "Columnas, pasamanos, bases y portavidrios para barandas.",
    "FI": "Frente integral: columnas, tapas, presores y adaptador para DVH.",
    "Mampara": "Perfiles para mamparas de baño.",
    "Deco": "Tubos, ángulos y perfiles U.",
}


# ------------------------------------------------------------------ silueta → SVG
def vectorize(mask_rel):
    f = MASKS / f"{mask_rel}.png"
    if not f.exists():
        return None
    m = cv2.imread(str(f), cv2.IMREAD_GRAYSCALE) < 128
    m = m.astype(np.uint8)
    # sacar restos chicos (puntas de cota, letras) y suavizar el serrucho del raster
    n, lab, st, _ = cv2.connectedComponentsWithStats(m, connectivity=8)
    keep = np.zeros(n, bool)
    for i in range(1, n):
        if st[i, cv2.CC_STAT_AREA] * PX2MM ** 2 >= 0.6:
            keep[i] = True
    m = keep[lab].astype(np.uint8) * 255
    m = cv2.GaussianBlur(m, (5, 5), 0)
    m = (m > 127).astype(np.uint8)
    ys, xs = np.nonzero(m)
    if len(xs) == 0:
        return None
    m = m[ys.min():ys.max() + 1, xs.min():xs.max() + 1]
    contours, _ = cv2.findContours(m, cv2.RETR_CCOMP, cv2.CHAIN_APPROX_NONE)
    parts = []
    for c in contours:
        c = cv2.approxPolyDP(c, 0.7, True)
        if len(c) < 3:
            continue
        pts = " L".join(f"{p[0][0] * PX2MM:.2f} {p[0][1] * PX2MM:.2f}" for p in c)
        parts.append(f"M{pts}Z")
    return {"d": "".join(parts), "w": m.shape[1] * PX2MM, "h": m.shape[0] * PX2MM}


def svg_perfil(v):
    return (f'<svg class="perfil__svg" width="{v["w"]:.2f}mm" height="{v["h"]:.2f}mm" '
            f'viewBox="0 0 {v["w"]:.2f} {v["h"]:.2f}"><path d="{v["d"]}" fill-rule="evenodd"/></svg>')


# ------------------------------------------------------------------ armado de hojas
def paginate(perfiles, first_extra):
    """Filas en orden de catálogo, armadas según el lugar que queda en la hoja: si el próximo perfil
    no entra de alto, la fila (o la hoja) se cierra ahí, sin alterar el orden numérico.
    Un perfil con "hoja_nueva" arranca hoja (pedidos puntuales del cliente)."""
    pages, page, row = [], [], []
    avail = PAGE_H - TOP - BOTTOM - first_extra
    used, row_w = 0, 0

    def row_h(r):
        return max(p["v"]["h"] for p in r) + LABEL_H

    def close_row():
        nonlocal row, row_w, used
        if row:
            used += (GAP_Y if page else 0) + row_h(row)
            page.append(row)
        row, row_w = [], 0

    def close_page():
        nonlocal page, used, avail
        close_row()
        if page:
            pages.append(page)
        page, used = [], 0
        avail = PAGE_H - TOP - BOTTOM

    for p in perfiles:
        if p.get("hoja_nueva") and (page or row):          # pedido del cliente
            close_page()
        cw = max(p["v"]["w"], CELL_MIN_W)
        if row and row_w + GAP_X + cw > CONTENT_W:          # no entra de ancho
            close_row()
        rem = avail - used - (GAP_Y if page else 0)
        if row and max(p["v"]["h"], max(q["v"]["h"] for q in row)) + LABEL_H > rem:
            close_row()                                     # con este perfil la fila no entra de alto
            rem = avail - used - GAP_Y
        if not row and page and p["v"]["h"] + LABEL_H > rem:
            close_page()                                    # no entra en lo que queda de la hoja
        row.append(p)
        row_w += (GAP_X if len(row) > 1 else 0) + cw
    close_page()
    return pages


SIGLAS = {"dvh": "DVH", "fl": "FL", "pf": "PF", "u": "U", "c/banderola/pta.": "c/banderola/pta.",
          "p/dvh": "p/DVH", "rto": "RTO", "mm": "mm", "mm.": "mm"}


def nombre(txt):
    """Un solo criterio para todos los catálogos: oración, siglas en mayúscula."""
    words = txt.strip().split()
    out = []
    for i, w in enumerate(words):
        lw = w.lower()
        out.append(SIGLAS.get(lw, lw))
    s = " ".join(out)
    return s[:1].upper() + s[1:]


def fmt_kg(kg):
    return f"{kg:.3f}".replace(".", ",") + " kg/m" if kg else "—"


def code_html(codigo):
    return f'<span class="cod__pre">AR5-</span>{html.escape(codigo[4:])}'


def perfil_html(p):
    dib = ('<div class="perfil__falta">Plano<br>pendiente</div>' if p["v"].get("falta")
           else svg_perfil(p["v"]))
    return (f'<figure class="perfil" style="width:{max(p["v"]["w"], CELL_MIN_W):.2f}mm">'
            f'<div class="perfil__dib">{dib}</div>'
            f'<figcaption><strong class="cod">{code_html(p["codigo"])}</strong>'
            f'<span class="perfil__nom">{html.escape(nombre(p["nombre"]))}</span>'
            f'<span class="perfil__kg">{fmt_kg(p.get("kg"))}</span></figcaption></figure>')


def chrome(linea, n, content, first=False, extra_class=""):
    head = ""
    if first:
        head = (f'<header class="linea-head"><p class="linea-head__eyebrow">Línea</p>'
                f'<h2 class="linea-head__nombre">{html.escape(linea)}</h2>'
                f'<p class="linea-head__desc">{html.escape(LINEA_INFO.get(linea, ""))}</p></header>')
    return f'''<section class="page {extra_class}">
  <div class="page__top"><img src="../assets/logo.svg" class="page__logo" alt="Aluminios Ruta 5">
    <span class="page__linea">Línea <b>{html.escape(linea)}</b></span><span class="page__escala">Escala 1:1</span></div>
  <div class="page__body">{head}{content}</div>
  <footer class="page__foot"><span>Aluminios Ruta 5 · Parque Industrial Chivilcoy, galpón 111 · Tel. / WhatsApp 2346 41-1139 · aluminiosruta5.com.ar</span><b>{n}</b></footer>
</section>'''


# ------------------------------------------------------------------ Deco (tablas por familia)
def deco_diagram(forma):
    s = 'stroke="currentColor" stroke-width="0.35" fill="none"'
    if forma == "angulo":
        shape = '<path d="M6 4 H9.5 V32 H40 V35.5 H6 Z" class="dib"/>'
        dims = (f'<path d="M3 4 V35.5 M1.8 4 H4.2 M1.8 35.5 H4.2" {s}/><text x="1" y="21" class="lbl">B</text>'
                f'<path d="M6 39 H40 M6 37.8 V40.2 M40 37.8 V40.2" {s}/><text x="22" y="43.5" class="lbl">A</text>')
    elif forma == "u":
        shape = '<path d="M8 4 H11.5 V32 H34.5 V4 H38 V35.5 H8 Z" class="dib"/>'
        dims = (f'<path d="M4.5 4 V35.5 M3.3 4 H5.7 M3.3 35.5 H5.7" {s}/><text x="0.5" y="21" class="lbl">B</text>'
                f'<path d="M8 39 H38 M8 37.8 V40.2 M38 37.8 V40.2" {s}/><text x="21.5" y="43.5" class="lbl">A</text>')
    else:
        shape = '<path d="M8 6 H38 V34 H8 Z M11 9 V31 H35 V9 Z" class="dib" fill-rule="evenodd"/>'
        dims = (f'<path d="M4.5 6 V34 M3.3 6 H5.7 M3.3 34 H5.7" {s}/><text x="0.5" y="21" class="lbl">B</text>'
                f'<path d="M8 38 H38 M8 36.8 V39.2 M38 36.8 V39.2" {s}/><text x="21.5" y="42.5" class="lbl">A</text>')
    return f'<svg class="deco__dib" viewBox="0 0 46 46" width="30mm" height="30mm">{shape}{dims}</svg>'


def deco_pages(start):
    blocks = []
    for fam in DECO:
        rows = "".join(
            f'<tr><td class="cod">{code_html("AR5-" + c)}</td><td>{a}</td><td>{b}</td><td>{fmt_kg(kg)[:-5]}</td></tr>'
            for c, a, b, kg in fam["items"])
        blocks.append(f'''<div class="deco">
  {deco_diagram(fam["forma"])}
  <div class="deco__tabla"><h3>{html.escape(fam["familia"])}</h3>
  <table><thead><tr><th>Código</th><th>A (mm)</th><th>B (mm)</th><th>kg/m</th></tr></thead><tbody>{rows}</tbody></table></div>
</div>''')
    # wall panel: dibujo en 1:1 como el resto de los perfiles
    wp = {**WALL_PANEL, "v": vectorize(WALL_PANEL["mask"])}
    blocks.append(f'<div class="deco deco--perfil"><div class="deco__tabla"><h3>Wall panel</h3>'
                  f'<div class="fila fila--sola">{perfil_html(wp)}</div></div></div>')
    # dos hojas: 3 familias + (2 familias y wall panel)
    return [chrome("Deco", start, "".join(blocks[:3]), first=True),
            chrome("Deco", start + 1, "".join(blocks[3:]))]


# ------------------------------------------------------------------ documento
def build():
    lineas = []
    faltan = []
    for l in LINEAS:
        ps = []
        for p in l["perfiles"]:
            v = vectorize(p["mask"]) if p.get("mask") else None
            if v is None:
                faltan.append(p["codigo"])
                v = {"d": "", "w": 30, "h": 18, "falta": True}
            ps.append({**p, "v": v})
        lineas.append({"nombre": l["nombre"], "perfiles": ps})

    pages_html, indice, toc = [], [], []
    n = 3  # 1 tapa, 2 contenido
    for l in lineas:
        toc.append((l["nombre"], n, len(l["perfiles"])))
        for i, rows in enumerate(paginate(l["perfiles"], LINE_HEAD)):
            content = "".join(
                f'<div class="fila">{"".join(perfil_html(p) for p in r)}</div>' for r in rows)
            pages_html.append(chrome(l["nombre"], n, content, first=(i == 0)))
            for r in rows:
                for p in r:
                    indice.append((p["codigo"], p["nombre"], l["nombre"], n))
            n += 1
    toc.append(("Deco", n, sum(len(f["items"]) for f in DECO) + 1))
    pages_html += deco_pages(n)
    for fam in DECO:
        for c, a, b, kg in fam["items"]:
            indice.append(("AR5-" + c, f'{fam["familia"][:-1] if fam["familia"].endswith("s") else fam["familia"]} {a}×{b}',
                           "Deco", n if fam in DECO[:3] else n + 1))
    indice.append((WALL_PANEL["codigo"], WALL_PANEL["nombre"], "Deco", n + 1))
    n += 2

    # índice por código (4 columnas)
    rows = "".join(f'<tr><td class="cod">{code_html(c)}</td><td>{html.escape(lin)}</td><td class="pag">{pg}</td></tr>'
                   for c, _, lin, pg in indice)
    idx_pages = []
    per_page = 4 * 60
    items = indice
    for k in range(0, len(items), per_page):
        chunk = items[k:k + per_page]
        cols = [chunk[i:i + 60] for i in range(0, len(chunk), 60)]
        tables = "".join(
            '<table class="idx">' + "".join(
                f'<tr><td class="cod">{code_html(c)}</td><td>{html.escape(lin)}</td><td class="pag">{pg}</td></tr>'
                for c, _, lin, pg in col) + '</table>' for col in cols)
        head = '<header class="linea-head linea-head--idx"><h2 class="linea-head__nombre">Índice por código</h2></header>' if k == 0 else ""
        idx_pages.append(f'''<section class="page">
  <div class="page__top"><img src="../assets/logo.svg" class="page__logo" alt="Aluminios Ruta 5"><span class="page__linea">Índice</span></div>
  <div class="page__body">{head}<div class="idx-cols">{tables}</div></div>
  <footer class="page__foot"><span>Aluminios Ruta 5 · Parque Industrial Chivilcoy, galpón 111 · Tel. / WhatsApp 2346 41-1139 · aluminiosruta5.com.ar</span><b>{n}</b></footer>
</section>''')
        n += 1

    toc_html = "".join(
        f'<li><span class="toc__nom">{html.escape(nm)}</span><span class="toc__desc">{html.escape(LINEA_INFO.get(nm, ""))}</span>'
        f'<span class="toc__cant">{cant} perfiles</span><span class="toc__pag">{pg}</span></li>' for nm, pg, cant in toc)
    total = sum(c for _, _, c in toc)

    cover = f'''<section class="page cover">
  <img src="../assets/logo-white.svg" class="cover__logo" alt="Aluminios Ruta 5">
  <div class="cover__txt"><p class="cover__eyebrow">Catálogo técnico</p><h1>Perfiles de aluminio</h1>
  <p class="cover__lineas">Clásica · RTO640 · MDNA · A3 · A4 · A4C · Baranda · FI · Mampara · Deco</p></div>
  <div class="cover__foot"><span>Parque Industrial Chivilcoy, galpón 111</span><span>Tel. / WhatsApp 2346 41-1139</span><span>aluminiosruta5.com.ar</span><span>Edición {date.today().year}</span></div>
</section>'''
    contents = f'''<section class="page">
  <div class="page__top"><img src="../assets/logo.svg" class="page__logo" alt="Aluminios Ruta 5"><span class="page__linea">Contenido</span></div>
  <div class="page__body"><header class="linea-head"><p class="linea-head__eyebrow">{total} perfiles en 10 líneas</p><h2 class="linea-head__nombre">Contenido</h2>
  <p class="linea-head__desc">Todos los perfiles están dibujados en escala 1:1: se pueden medir directamente sobre la hoja impresa al 100 %. Los pesos por metro son teóricos y pueden variar según la tolerancia de extrusión.</p></header>
  <ol class="toc">{toc_html}<li><span class="toc__nom">Índice por código</span><span class="toc__desc">Todos los códigos AR5 en orden, con su línea y página.</span><span class="toc__cant"></span><span class="toc__pag">{n - len(idx_pages)}</span></li></ol></div>
  <footer class="page__foot"><span>Aluminios Ruta 5 · Parque Industrial Chivilcoy, galpón 111 · Tel. / WhatsApp 2346 41-1139 · aluminiosruta5.com.ar</span><b>2</b></footer>
</section>'''

    css = (ROOT / "tools" / "catalogo.css").read_text("utf-8")
    doc = f'''<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Catálogo de perfiles AR5</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Archivo:wdth,wght@62..125,400..800&family=Inter:wght@400;500;600&display=swap" rel="stylesheet">
<style>{css}</style></head><body>
{cover}{contents}{"".join(pages_html)}{"".join(idx_pages)}
</body></html>'''
    out = ROOT / "build" / "catalogo.html"
    out.write_text(doc, "utf-8")
    print("hojas:", n - 1, "| perfiles sin silueta:", faltan)
    return out


def pdf(html_path):
    dist = ROOT / "dist"
    dist.mkdir(exist_ok=True)
    out = dist / "catalogo-perfiles-ar5.pdf"
    subprocess.run([CHROME, "--headless=new", "--disable-gpu", "--no-pdf-header-footer",
                    "--virtual-time-budget=15000", f"--print-to-pdf={out}", html_path.as_uri()],
                   check=True, capture_output=True)
    print(out)


if __name__ == "__main__":
    h = build()
    if "--sin-pdf" not in sys.argv:
        pdf(h)
