# VENTURE. — UGC Studio

Sitio del estudio de UGC con IA (marca hermana de VentureByte) + **portal de entregas para clientes** + **panel admin con carga de material**.

- `index.html` — landing del estudio.
- `portal.html` — portal de clientes (gate por código de acceso).
- `admin.html` — panel del estudio: clientes, códigos y subida de material.
- Identidad: manual de marca "Venture UGC Studio branding" en Claude Design.
  Lima Señal `#CCFF00` · Tinta `#0A0A0A` · Carbón `#161616` · Papel `#F2F2ED` ·
  Archivo (display/texto) + Space Mono (datos).

## Stack

- **Frontend:** HTML + CSS + JS vanilla.
- **Backend:** Node.js + Express + SQLite (`better-sqlite3`) + Multer (subida de archivos) + JWT.
- **Deploy:** Dockerfile (Coolify) con volúmenes persistentes.

## Desarrollo

```bash
cd clients/venture-ugc-studio
npm install
npm run dev      # http://localhost:3000
```

En el primer arranque crea `data/db.sqlite`, siembra el admin y el cliente demo `TILIFE-DEMO`.

## Cómo se maneja el contenido (dos vías)

1. **Piezas de diseño** (posts, historias, portadas de reels con su caption, guion y fecha):
   viven en `assets/js/portal-data.js` como HTML sobre lienzo 1080 — van por git, no ocupan
   almacenamiento y el cliente las descarga en resolución real (html2canvas). El calendario
   ideal se genera solo con las fechas de las piezas.
2. **Material pesado** (videos de reels finales, exports en alta, packs): se sube desde
   `admin.html` → queda en el volumen `uploads/material/<CODIGO>/` del VPS y aparece
   automáticamente en el portal del cliente en la sección **"Material de la entrega"**
   (video con reproductor, imágenes con preview, todo con botón de descarga).

El **cliente** se crea desde el admin (código de acceso + nombre + entrega + estado + nota).
Si un código además existe en `portal-data.js`, el portal muestra piezas **y** material.
Sin API (preview estático), el portal cae a la data local.

## Panel admin

- URL: `/admin.html`
- Usuario inicial: `admin@ventureugc.studio` / `venture2026` → **cambiar desde el panel** ("Contraseña").
- Funciones: alta/edición/borrado de clientes, link directo al portal de cada uno
  ("Copiar link" → `portal.html#CODIGO`), subida de material con drag & drop y barra
  de progreso (máx. 800 MB por archivo), listado y borrado de archivos.

## API

| Método | Ruta | Auth | Descripción |
|---|---|---|---|
| GET | `/api/portal/:codigo` | — | Cliente + material (el código es la credencial) |
| POST | `/api/auth/login` | — | Login admin → token |
| POST | `/api/auth/change-password` | JWT | Cambiar contraseña |
| GET | `/api/clientes` | JWT | Lista con conteo y peso de material |
| POST | `/api/clientes` | JWT | Crear cliente |
| PUT | `/api/clientes/:codigo` | JWT | Editar cliente (incl. `activo`) |
| DELETE | `/api/clientes/:codigo` | JWT | Borrar cliente + su material |
| GET | `/api/clientes/:codigo/material` | JWT | Listar material |
| POST | `/api/clientes/:codigo/material` | JWT | Subir archivos (campo `archivos`, máx. 20) |
| DELETE | `/api/clientes/:codigo/material/:id` | JWT | Borrar un archivo |

## Deploy (Coolify)

1. App apuntando al subdirectorio `clients/venture-ugc-studio`, build por **Dockerfile**.
2. **Variables de entorno:** `JWT_SECRET` (obligatoria en producción); opcional
   `ADMIN_EMAIL` / `ADMIN_PASSWORD` para el seed inicial.
3. **Volúmenes persistentes:** `/app/data` (SQLite) y `/app/uploads` (material).
   Sin esto se pierden datos y archivos en cada deploy.

## Almacenamiento

El material va al disco del VPS (Hetzner) vía el volumen de Coolify — sin servicios
externos. Con videos de reels (~50–200 MB c/u) hay lugar para muchas entregas; si algún
día queda chico, el paso siguiente es mover `uploads/` a un object storage (R2/S3) sin
tocar el resto.

## Piezas demo

Código `TILIFE-DEMO` — 7 posts, 4 historias y 2 reels con guion, calendario agosto 2026.
