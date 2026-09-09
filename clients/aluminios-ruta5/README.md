# Aluminios Ruta 5

Sitio web + catálogo administrable para **Aluminios Ruta 5**, distribuidora de aluminio de Rubén Darío Meletto en el Parque Industrial de Chivilcoy. Perfiles (Modena, A30, Herrero), aberturas de todo tipo, wall panels, accesorios y herrajes.

> **Estado:** sitio, catálogo, ficha de producto, backend y panel admin funcionales. Los 20 productos y las fotos de secciones son **placeholders** a reemplazar con material real del cliente.

## Stack

- **Frontend público:** HTML + CSS + JS vanilla (`index.html`, `catalogo.html`, `producto.html`).
- **Panel admin:** `admin.html` (login con JWT).
- **Backend:** Node.js + Express + SQLite (`better-sqlite3`) + Multer + Sharp (optimiza fotos a WebP 1600px).
- **Deploy:** Dockerfile (Coolify).

## Desarrollo

```bash
cd clients/aluminios-ruta5
npm install
npm run dev      # http://localhost:3000
```

En el primer arranque crea `data/db.sqlite`, siembra los productos de `data/products.json` y el usuario admin.

## Rutas

| Ruta | Qué es |
|---|---|
| `/` | Home |
| `/catalogo` | Catálogo con búsqueda, categorías, líneas y orden (filtros en la URL: `?categoria=Perfiles&linea=Modena&q=marco`) |
| `/producto/<slug>` | Ficha de producto con galería, ficha técnica y CTA de WhatsApp con el producto prellenado |
| `/admin` | Panel de administración |

## Panel de administración

- Usuario inicial: `admin@aluminiosruta5.com` / `ruta52026` → **cambiar la contraseña desde el panel** ("Contraseña") al entregar.
- Alta / edición / borrado de productos, publicar u ocultar, destacar en la home, disponibilidad (en stock / a pedido / sin stock), orden, precio opcional (si no se muestra, el sitio dice "Precio a consultar"), ficha técnica (pares dato/valor), etiquetas, foto principal y galería de hasta 8 fotos.
- Las categorías y líneas son texto libre con sugerencias; cualquier categoría nueva aparece automáticamente en los filtros del catálogo.
- Los productos sin foto usan una ilustración de línea según la categoría (`assets/img/ph/`).

## API

| Método | Ruta | Auth | Descripción |
|---|---|---|---|
| GET | `/api/products` | — (`?all=1` con JWT trae los ocultos) | Lista + catálogos (categorías, líneas, terminaciones, unidades, stocks) |
| GET | `/api/products/:idOrSlug` | — | Producto + relacionados |
| POST | `/api/products` | JWT | Crear |
| PUT | `/api/products/:id` | JWT | Editar |
| DELETE | `/api/products/:id` | JWT | Eliminar (borra fotos) |
| POST / DELETE | `/api/products/:id/cover` | JWT | Foto principal (campo `cover`) |
| POST | `/api/products/:id/images` | JWT | Fotos de galería (campo `images`, máx. 8) |
| DELETE | `/api/products/:id/images/:filename` | JWT | Quitar una foto |
| POST | `/api/auth/login` | — | Login → token |
| POST | `/api/auth/change-password` | JWT | Cambiar contraseña |

## Deploy (Coolify)

1. App con Build Pack **Dockerfile**, base dir `/clients/aluminios-ruta5`, puerto 3000.
2. Variables: `JWT_SECRET` (obligatoria), opcional `ADMIN_EMAIL` / `ADMIN_PASSWORD` para el seed inicial. `NODE_ENV=production` ya viene en el Dockerfile (activa caché de estáticos).
3. Volúmenes persistentes: `/app/data` (SQLite) y `/app/uploads` (fotos). Sin esto se pierden los datos en cada deploy.

## Identidad

- Logo vectorizado desde el JPEG original: `assets/img/logo.svg` (color), `logo-white.svg` (para fondos oscuros), `logo.png` (2232 px, transparente).
- Colores: negro `#0B0B0D`, azul de marca `#0A7FBE`, neutros fríos "aluminio".
- Tipografía: Archivo (display, con eje de ancho) + Inter (texto), vía Google Fonts.

## Datos del negocio

- **Dirección:** Parque Industrial, Chivilcoy, Buenos Aires
- **WhatsApp / Tel.:** 2346 41-1139 (`+54 9 2346 41-1139`)
- **Email:** Aluminiosruta5@yahoo.com
- **Instagram:** [@aluminios.ruta5](https://www.instagram.com/aluminios.ruta5/)

## Pendientes para producción

- Reemplazar las fotos placeholder (Unsplash) de hero, nave, "por qué aluminio" por fotos reales; cargar fotos de productos desde el panel.
- Validar el catálogo: nombres, líneas, medidas, terminaciones y qué productos se destacan.
- Confirmar **horario de atención** (el sitio muestra Lun–Vie 8 a 17 h, Sáb 8 a 12 h como placeholder) y la dirección exacta dentro del parque industrial para el mapa.
- Confirmar el testimonio de "Silmar Aberturas" (tomado de un comentario público en Instagram).
- Setear `JWT_SECRET` en Coolify y cambiar la contraseña del admin.
