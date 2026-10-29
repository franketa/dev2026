# Pasa las capturas de .capturas/ a img/ en JPG liviano, recorta la barra de abajo y la lista de
# novedades, y convierte el cupón PDF en imagen.   python herramientas/procesar.py
import glob, os
import fitz
from PIL import Image

RAIZ = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
SRC, DST = os.path.join(RAIZ, '.capturas'), os.path.join(RAIZ, 'img')
for f in glob.glob(os.path.join(DST, '*.jpg')):
    os.remove(f)
fitz.open(os.path.join(SRC, 'cupon.pdf'))[0].get_pixmap(dpi=150).save(os.path.join(SRC, '14-cupon.png'))
for f in sorted(glob.glob(os.path.join(SRC, '*.png'))):
    n = os.path.basename(f)[:-4]
    if n.startswith('zz'):
        continue
    im = Image.open(f).convert('RGB')
    if n == '03h-novedades':
        im = im.crop((0, 0, im.width, min(im.height, 600)))
    im.save(os.path.join(DST, f'{n}.jpg'), quality=86, optimize=True, progressive=True)
# La barra de abajo, sacada de una pantalla con fondo liso
im = Image.open(os.path.join(SRC, '07-vuelo-guardado.png')).convert('RGB')
im.crop((0, im.height - 140, im.width, im.height)).save(os.path.join(DST, '03g-nav.jpg'), quality=88)
print(len(glob.glob(os.path.join(DST, '*.jpg'))), 'imágenes en img/')
