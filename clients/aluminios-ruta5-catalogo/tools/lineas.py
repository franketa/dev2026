"""Composición del catálogo AR5: líneas, orden, códigos, nombres y pesos.

Reglas (ver ANALISIS.md): todo código lleva "AR5-"; A4 lleva 14 adelante; un perfil = un código en
todas las líneas; los catálogos "completos" van completos y ordenados por número.
Cada perfil apunta a su silueta en build/masks/<fuente>/<código>.png.
"""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
_alpros = json.loads((ROOT / "build" / "alpros-index.json").read_text("utf-8"))


def alpros(archivo, codigo, nuevo=None, nombre=None):
    desc, kg = _alpros[archivo][codigo]
    src = {"01-HE-herrero": "alpros-he", "02-MD-modena": "alpros-md", "03-RT-rotonda": "alpros-rt",
           "10-RV-revestimientos": "alpros-rv", "12-MP-mampara": "alpros-mp"}[archivo]
    return {"codigo": f"AR5-{nuevo or codigo}", "nombre": nombre or desc, "kg": kg, "mask": f"{src}/{codigo}",
            "orden": nuevo or codigo}


def alubon(src, codigo, nombre, kg, nuevo=None):
    return {"codigo": f"AR5-{nuevo or codigo}", "nombre": nombre, "kg": kg, "mask": f"{src}/{codigo}",
            "orden": nuevo or codigo}


def otro(codigo, nombre, kg, mask, orden=None):
    return {"codigo": f"AR5-{codigo}", "nombre": nombre, "kg": kg, "mask": mask, "orden": orden or codigo}


def por_numero(perfiles):
    return sorted(perfiles, key=lambda p: int("".join(ch for ch in p["orden"] if ch.isdigit()) or 0))


# ---------------------------------------------------------------- Clásica (Herrero)
HE = "1001-1002-1003-1004-1005-1006-1009-1010-1011-1012-1014-1015-1017-1022-1024-1034-1041-1042-1043-1044-1045-" \
     "1053-1054-1055-1058-1059-1065-1066-1116-1117-1121-1125-1165-1178-1179-1190-1225-1511-1513-1514-1515-1517"
clasica = [alpros("01-HE-herrero", c) for c in HE.split("-")]
clasica.append(alpros("10-RV-revestimientos", "1032"))
clasica.append(otro("1029", "Revestimiento tubular", 0.894, "group/781"))            # ALG781 → 1029
clasica = por_numero(clasica)
clasica.append(otro("PARTE A", "Escuadra de armado", 0.690, "group/046", orden="99999"))  # ALG046, último

# ---------------------------------------------------------------- RTO640 (Rotonda)
RT = "1112 1113 1114 1115 1161 1162 1310 1311 1317 1325 1326 1800 1801 1913"
rto = por_numero([alpros("03-RT-rotonda", c) for c in RT.split()])
rto.append(otro("P640", "Premarco rotonda", 0.28, "alcenor/230"))

# ---------------------------------------------------------------- MDNA (Modena)
ALBM = [
    ("200", "Umbral y dintel marco ventana y puerta corrediza", 1.266),
    ("201", "Jamba marco ventana y puerta corrediza", 0.664),
    ("203", "Parante lateral hoja vidrio simple ventana y puerta corrediza", 0.651),
    ("204", "Zócalo y cabezal hoja vidrio simple ventana y puerta corrediza", 0.721),
    ("205", "Premarco", 0.330),
    ("206", "Tapa premarco", 0.186),
    ("207", "Parante central hoja vidrio simple ventana y puerta corrediza", 0.613),
    ("209", "Zócalo alto hoja vidrio simple puerta corrediza", 1.266),
    ("212", "Contravidrio de 36 mm", 0.316),
    ("213", "Perfil de acople simple", 0.257),
    ("214", "Jamba y cabezal hoja puerta de rebatir", 1.088),
    ("215", "Hoja ventana de abrir c/banderola", 0.864),
    ("216", "Marco vent. abrir c/banderola/pta. rebatir/ventiluz/pf recto", 0.740),
    ("217", "Contravidrio de 29 mm", 0.294),
    ("218", "Travesaño hoja puerta de rebatir", 1.150),
    ("219", "Zócalo hoja puerta de rebatir", 1.647),
    ("220", "Contravidrio exterior puerta de rebatir", 0.176),
    ("221", "Travesaño angosto paño fijo", 0.767),
    ("224", "Encuentro central ventana de abrir 2 hojas c/pta. de rebatir", 0.794),
    ("225", "Contravidrio de 22 mm", 0.257),
    ("226", "Contravidrio de 15 mm", 0.211),
    ("228", "Tope mosquitero ventana y puerta corrediza", 0.186),
    ("230", "Contravidrio curvo 29 mm", 0.213),
    ("231", "Contravidrio curvo 15 mm", 0.159),
    ("232", "Contravidrio curvo 22 mm", 0.181),
    ("235", "Hoja curva ventana de abrir c/banderola", 0.902),
    ("236", "Hoja curva ventiluz", 0.907),
    ("237", "Contravidrio curvo exterior puerta de rebatir", 0.176),
    ("240", "Umbral y dintel marco 3 guías ventana y puerta corrediza", 1.841),
    ("241", "Jamba marco de 3 guías ventana y puerta corrediza", 0.972),
    ("243", "Guía de cortina común", 0.548),
    ("245", "Tapa cinta", 0.629),
    ("246", "Encuentro central 4 hojas ventana y puerta corrediza", 0.292),
    ("248", "Parante lateral hoja DVH ventana y puerta corrediza", 0.621),
    ("249", "Zócalo y cabezal hoja DVH ventana y puerta corrediza", 0.689),
    ("250", "Parante central hoja DVH ventana y puerta corrediza", 0.583),
    ("252", "Zócalo alto hoja DVH puerta corrediza", 1.237),
    ("254", "Bisagra tapa cinta", 0.302),
    ("255", "Bastidor mosquitero", 0.424),
    ("257", "Contravidrio curvo 36 mm", 0.240),
    ("259", "Marco ventana desplazable", 0.726),
    ("260", "Hoja ventana desplazable curva", 1.100),
    ("262", "Perfil de acople a 90°", 0.680),
]
mdna = [alubon("alubon-m", c, n, k) for c, n, k in ALBM]
# de Alpros MD, renumerados (el 1264 → 262 no va: alcanza con el de Alubon)
for viejo, nuevo in [("1083", "233"), ("1229", "229"), ("1257", "202"), ("1265", "265")]:
    mdna.append(alpros("02-MD-modena", viejo, nuevo))
mdna = por_numero(mdna)
for viejo, nuevo in [("1254", "906"), ("1256", "907"), ("1253", "908"), ("1255", "909")]:     # al final
    mdna.append(alpros("02-MD-modena", viejo, nuevo))
mdna.append(otro("3103", "Contravidrio 12 mm", 0.447, "group/3103"))
mdna.append(otro("3104", "Contravidrio DVH 22 mm", 0.409, "group/3104"))

# ---------------------------------------------------------------- A3 (A30)
ALB3 = [
    ("036", "Jamba de marco", 0.891), ("037", "Umbral y dintel de marco", 1.744),
    ("038", "Mosquitero reforzado", 0.594), ("039", "Tope mosquitero", 0.329),
    ("040", "Marco puerta de rebatir", 1.180), ("041", "Hoja puerta de rebatir", 1.388),
    ("042", "Travesaño puerta de rebatir", 1.399), ("043", "Zócalo puerta de rebatir", 2.319),
    ("044", "Encuentro central puerta de rebatir", 1.037), ("045", "Contravidrio recto p/vidrio simple", 0.351),
    ("046", "Contravidrio recto p/DVH", 0.259), ("047", "Contravidrio curvo p/vidrio simple", 0.254),
    ("048", "Contravidrio curvo p/DVH", 0.197), ("049", "Contravidrio recto lado ext. puerta de rebatir", 0.232),
    ("052", "Hoja curva ventana de abrir", 1.139), ("053", "Encuentro central ventana de abrir", 1.094),
    ("054", "Hoja recta ventana de abrir", 1.148), ("055", "Marco paño fijo y ventana de abrir", 1.037),
    ("056", "Hoja curva ventana desplazable", 1.337), ("057", "Marco ventana desplazable", 0.837),
    ("059", "Marco recto paño fijo y ventana de abrir", 1.053), ("060", "Travesaño paño fijo", 1.091),
    ("061", "Zócalo y cabezal ventana corrediza", 0.942), ("062", "Zócalo alto puerta corrediza", 1.477),
    ("066", "Premarco", 0.545), ("067", "Perfil de acople", 0.329),
    ("068", "Acople reforzado paño fijo", 1.758), ("073", "Zócalo y cabezal corrediza p/DVH", 0.861),
    ("074", "Zócalo alto corrediza p/DVH", 1.412), ("080", "Jamba de marco corrediza de 3 hojas", 1.701),
    ("081", "Umbral y dintel corrediza de 3 hojas", 2.908), ("082", "Parante central tercer hoja p/DVH", 1.463),
    ("083", "Parante central tercera hoja", 1.528), ("134", "Parante lateral vidrio simple", 1.208),
    ("135", "Parante central vidrio simple", 1.189), ("171", "Parante lateral DVH", 1.144),
    ("172", "Parante central DVH", 1.124), ("965", "Encuentro central corrediza de 4 hojas", 0.288),
]
a3 = [alubon("alubon-3", c, n, k) for c, n, k in ALB3]
a3.append(otro("050", "Contravidrio curvo lado ext. puerta de rebatir", 0.192, "aluar/6050", orden="050"))
a3 = por_numero(a3)

# ---------------------------------------------------------------- A4 (A40): 14 adelante
ALB4 = [
    ("059", "Corrediza guía con radio 3 mm", 0.152), ("062", "Perfil de mosquitero", 0.888),
    ("243", "Tapajuntas recto", 0.254), ("257", "Parante central reforzado", 2.093),
    ("258", "Parante central DVH", 1.273), ("259", "Parante lateral DVH", 1.034),
    ("260", "Zócalo alto corrediza DVH", 1.537), ("261", "Zócalo cabezal corrediza DVH", 0.955),
    ("262", "Jamba de marco", 1.351), ("263", "Umbral/dintel de marco", 1.857),
    ("264", "Guía corrediza mosquitero", 0.350), ("270", "Corrediza hoja DVH 36 mm", 1.301),
    ("271", "Corrediza hoja encuentro", 0.543), ("283", "Acople umbral/dintel", 0.924),
    ("284", "Acople jamba de marco", 0.639), ("346", "Acople 180°", 0.708),
    ("378", "Adaptador vidrio simple para hoja a 90°", 0.263), ("934", "Premarco", 0.900),
]
a4 = [alubon("alubon-4", c, n, k, nuevo="14" + c) for c, n, k in ALB4]
# Nacho: el 14270 y el 14271 al final de la línea, solos en la última hoja
a4 = [p for p in a4 if p["orden"] not in ("14270", "14271")] +      [{**p, "hoja_nueva": p["orden"] == "14270"} for p in a4 if p["orden"] in ("14270", "14271")]

# ---------------------------------------------------------------- A4C (compartidos llevan el código de su línea)
ALB4C = [
    ("40667", "Umbral y dintel de marco", 1.400), ("40692", "Parante central DVH", 0.740),
    ("40671", "Jamba de marco", 0.985), ("40672", "Umbral y dintel corredizo de 3 hojas", 2.150),
    ("40206", "Contravidrio recto", 0.170), ("40691", "Parante lateral corredizo DVH", 0.850),
    ("40676", "Jamba de marco corrediza de 3 hojas", 1.400), ("40693", "Parante central reforzado", 1.200),
    ("40161", "Acople 180°", 0.430),
]
a4c = [alubon("alubon-4c", c, n, k) for c, n, k in ALB4C]
a4c.append(alubon("alubon-4", "062", "Perfil de mosquitero", 0.888, nuevo="14062"))
a4c.append(alubon("alubon-4", "264", "Guía corrediza mosquitero", 0.350, nuevo="14264"))
a4c.append(alubon("alubon-3", "073", "Zócalo y cabezal corrediza p/DVH", 0.861))
a4c = por_numero(a4c)
a4c.append(alubon("alubon-3", "074", "Zócalo alto corrediza p/DVH", 1.412))   # agregado por Nacho, al final

# ---------------------------------------------------------------- Baranda: una hoja por baranda (Group, después Alubon)
baranda = [
    otro("439", "Pasamanos baranda", 1.005, "group/439"), otro("468", "Portavidrio baranda", 0.530, "group/468"),
    otro("476", "Parante angosto baranda", 0.597, "group/476"), otro("477", "Base baranda", 0.572, "group/477"),
    {**alubon("alubon-b", "502", "Columna", 0.834), "hoja_nueva": True},
    alubon("alubon-b", "503", "Tapa inferior pasamanos", 0.267),
    alubon("alubon-b", "513", "Pasamanos recto", 1.364), alubon("alubon-b", "514", "Guía inferior", 0.435),
]

# ---------------------------------------------------------------- FI (Frente Integral)
fi = [
    alubon("alubon-i", "816", "Columna 120 mm para frente integral", 2.052),
    alubon("alubon-i", "817", "Columna 60 mm para frente integral", 1.150),
    alubon("alubon-i", "818", "Tapa columna para frente integral", 0.356),
    alubon("alubon-i", "819", "Presor para frente integral", 0.410),
    alubon("alubon-i", "997", "Adaptador para DVH en frente integral", 0.502),
]

# ---------------------------------------------------------------- Mampara
mampara = [alpros("12-MP-mampara", c) for c in "1025 1026 1027 1028 1137 1138".split()]

# ---------------------------------------------------------------- Deco: tablas por familia (A, B, kg/m)
DECO = [
    {"familia": "Ángulos alas iguales", "forma": "angulo", "items": [
        ("A25X25", 25, 25, 0.153), ("A38X38", 38, 38, 0.230)]},
    {"familia": "Ángulos alas desiguales", "forma": "angulo", "items": [
        ("A40X20", 40, 20, 0.180), ("A50X25", 50, 25, 0.221), ("A100X20", 100, 20, 0.420)]},
    {"familia": "Perfiles U", "forma": "u", "items": [
        ("U14X25", 14, 25, 0.192), ("U40X15", 40, 15, 0.450)]},                       # U blindex (Group)
    {"familia": "Tubos cuadrados", "forma": "tubo", "items": [
        ("T25X25", 25, 25, 0.420), ("T38X38", 38, 38, 0.453), ("T50X50", 50, 50, 0.600),
        ("T60X60", 60, 60, 0.680), ("T80X80", 80, 80, 1.300)]},                        # 25×25 Group; 80×80 = ALG085
    {"familia": "Tubos rectangulares", "forma": "tubo", "items": [
        ("T40X20", 40, 20, 0.375), ("T50X25", 50, 25, 0.440), ("T60X25", 60, 25, 0.660),
        ("T75X25", 75, 25, 0.693), ("T100X50", 100, 50, 1.600), ("T110X25", 110, 25, 1.160)]},
]

# Wall panel (Deco): plano de un proveedor, reconstruido en tools/wallpanel.py. Código a confirmar.
WALL_PANEL = {"codigo": "AR5-WP", "nombre": "Wall panel", "kg": 1.30, "mask": "wallpanel/wp", "orden": "WP"}

LINEAS = [
    {"nombre": "Clásica", "perfiles": clasica},
    {"nombre": "RTO640", "perfiles": rto},
    {"nombre": "MDNA", "perfiles": mdna},
    {"nombre": "A3", "perfiles": a3},
    {"nombre": "A4", "perfiles": a4},
    {"nombre": "A4C", "perfiles": a4c},
    {"nombre": "Baranda", "perfiles": baranda},
    {"nombre": "FI", "perfiles": fi},
    {"nombre": "Mampara", "perfiles": mampara},
]

if __name__ == "__main__":
    total = 0
    for l in LINEAS:
        total += len(l["perfiles"])
        print(f"{l['nombre']:8} {len(l['perfiles']):3}  " + " ".join(p["codigo"][4:] for p in l["perfiles"]))
    deco = sum(len(f["items"]) for f in DECO)
    print(f"Deco     {deco:3}  (tablas)")
    print("total", total + deco)
