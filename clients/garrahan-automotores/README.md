# Garrahan — Negocio de Automotores

Sitio web para **Garrahan — Negocio de Automotores**, concesionaria multimarca de vehículos 0km y usados en Chivilcoy, Buenos Aires. Incluye **panel de administración** para cargar, editar y eliminar vehículos con fotos.

> **Estado:** Sitio + backend + panel admin funcionales. Falta reemplazar fotos de muestra por fotos reales.

## Stack

- **Frontend público:** HTML + CSS + JS vanilla (`index.html`, `vehiculo.html`)
- **Panel admin:** `admin.html` (login con JWT)
- **Backend:** Node.js + Express + SQLite (`better-sqlite3`) + Multer para subida de imágenes
- **Deploy:** Dockerfile (Coolify) — ver "Deploy" abajo

## Desarrollo

```bash
cd clients/garrahan-automotores
npm install
npm run dev      # servidor con reload en http://localhost:3000
```

El servidor sirve el sitio estático, la API y las imágenes subidas. En el primer arranque crea `data/db.sqlite`, siembra el stock de muestra (`data/vehicles.json`) y el usuario admin.

## Panel de administración

- URL: `/admin.html`
- Usuario inicial: `admin@garrahan.com` / `garrahan2026` → **cambiar la contraseña desde el propio panel** ("Cambiar contraseña") al entregar.
- Funciones: alta/edición/borrado de vehículos, búsqueda y filtros, **foto de portada** (se ve en la home) + **galería de hasta 10 fotos** (se ven en la ficha), equipamiento por chips, destacados, estados (disponible/reservado/vendido).
- **Precio con descuento** (opcional): si se completa, el sitio muestra el precio de lista tachado y el precio con descuento en rojo (tarjetas, ficha y listado del admin). El simulador de cuota usa el precio con descuento como base.

## API

| Método | Ruta | Auth | Descripción |
|---|---|---|---|
| GET | `/api/vehicles` | — | Lista de vehículos + catálogos |
| GET | `/api/vehicles/:id` | — | Detalle de un vehículo |
| POST | `/api/vehicles` | JWT | Crear vehículo |
| PUT | `/api/vehicles/:id` | JWT | Editar vehículo |
| DELETE | `/api/vehicles/:id` | JWT | Eliminar vehículo (borra sus fotos) |
| POST | `/api/vehicles/:id/cover` | JWT | Subir/reemplazar portada (campo `cover`) |
| DELETE | `/api/vehicles/:id/cover` | JWT | Quitar portada |
| POST | `/api/vehicles/:id/images` | JWT | Subir fotos de galería (campo `images`, máx. 10 en total) |
| DELETE | `/api/vehicles/:id/images/:filename` | JWT | Quitar una foto de galería |
| POST | `/api/auth/login` | — | Login → token |
| POST | `/api/auth/change-password` | JWT | Cambiar contraseña |

## Deploy (Coolify)

1. Apuntar la app al subdirectorio `clients/garrahan-automotores` (build por Dockerfile).
2. **Variables de entorno:** `JWT_SECRET` (obligatoria en producción), opcional `ADMIN_EMAIL` / `ADMIN_PASSWORD` para el seed inicial.
3. **Volúmenes persistentes:** montar `/app/data` (base SQLite) y `/app/uploads` (fotos). Sin esto, se pierden los datos en cada deploy.

## Secciones del sitio público

- **Hero** dark con identidad de marca.
- **Vehículos** — grilla desde la API con filtros (condición / marca / tipo, dinámicos según stock). Vendidos no se muestran.
- **Ficha individual** (`vehiculo.html?id=N`) — galería con miniaturas y lightbox, precio, ficha técnica, equipamiento, simulador de cuota, vehículos relacionados y CTA de WhatsApp por unidad.
- **Financiación** — calculadora de cuota orientativa.
- **Galería / Equipo / Contacto** — igual que la landing original.

## Datos del negocio

- **Dirección:** Avenida Urquiza 126, Chivilcoy, Buenos Aires (CP 6620)
- **WhatsApp:** Felipe 2345 42-8151 · Miguel 2345 65-3379
- **Email:** Mgarrahanautomotores@hotmail.com
- **Instagram:** [@garrahanautomotores](https://instagram.com/garrahanautomotores)

## Pendientes para producción

- Reemplazar las fotos de muestra (Unsplash) cargando **fotos reales por vehículo desde el panel**.
- Reemplazar imágenes de la galería del local por fotos reales.
- Cambiar la contraseña del admin y setear `JWT_SECRET` en Coolify.
- El formulario de contacto usa **FormSubmit** — requiere activación única por email.
- Validar la **tasa de financiación** real (5,5% mensual orientativa).
- Confirmar código de área de los celulares y el pin del mapa.
