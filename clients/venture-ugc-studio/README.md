# VENTURE. — UGC Studio

Sitio del estudio de UGC con IA (marca hermana de VentureByte) + **portal de entregas para clientes**.

- `index.html` — landing del estudio.
- `portal.html` — portal de clientes (gate por código de acceso).
- Identidad: manual de marca "Venture UGC Studio branding" en Claude Design.
  Lima Señal `#CCFF00` · Tinta `#0A0A0A` · Carbón `#161616` · Papel `#F2F2ED` ·
  Archivo (display/texto) + Space Mono (datos).

## Cómo entregar contenido a un cliente

Todo vive en `assets/js/portal-data.js`. Cada cliente es una clave de `PORTAL_CLIENTES`:

```js
"MIMARCA-2026": {
  nombre: "Mi Marca",
  rubro: "Rubro del cliente",
  tema: "tema-tilife",            // clase CSS con los estilos de las piezas
  entrega: "Septiembre 2026",
  estado: "Lista para publicar",
  nota: "Texto libre que ve el cliente arriba de las piezas.",
  piezas: [ /* ver abajo */ ]
}
```

El cliente entra a `portal.html` e ingresa su código (o le pasás el link directo
`portal.html#MIMARCA-2026` — el código va en el hash para sobrevivir redirects).

### Piezas

Cada pieza es un objeto:

| Campo | Qué es |
|---|---|
| `id` | único, se usa para anclas del calendario |
| `tipo` | `"post"`, `"historia"` o `"reel"` |
| `w`, `h` | resolución real (1080×1080, 1080×1350, 1080×1920) |
| `titulo` | nombre visible de la pieza |
| `fecha`, `hora` | `"2026-09-03"`, `"19:00"` — arma el calendario ideal solo |
| `caption` | copy + hashtags (botón "Copiar texto") |
| `html` | el arte, en HTML/CSS absoluto sobre un lienzo de `w`×`h` px |
| `guion` | solo reels: array de `["BEAT · 0-3s", "descripción"]` |
| `duracion` | solo reels: `"28 s"` |

El arte se renderiza en vivo (escalado) y el botón **Descargar PNG** lo exporta
con html2canvas a la resolución real. Los estilos de las piezas de TILIFE están
en `assets/css/portal.css` (prefijo `.tl-`); para otro cliente se agrega otro
bloque de clases con su prefijo y su `tema-*`.

**El calendario se genera solo** a partir de `fecha`/`hora` de las piezas
(mes = mes de la primera pieza). Los chips del calendario llevan a cada pieza.

### Demo

Código `TILIFE-DEMO` — entrega de ejemplo con 7 posts, 4 historias y 2 reels.

## Deploy

Sitio estático, sin build. En Coolify apuntar al subdirectorio
`clients/venture-ugc-studio`. Preview local: `npx serve .`
