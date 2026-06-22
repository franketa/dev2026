# Sinergia · Salud y Bienestar

Landing tipo *linktree* para el centro de salud **Sinergia**. Cada profesional aparece
como un botón que abre un chat de WhatsApp para reservar turno. Incluye un panel de
administración con login simple para gestionar los contactos.

## Stack

- **Backend**: Node.js + Express
- **Base de datos**: SQLite (`better-sqlite3`), archivo en `data/db.sqlite`
- **Auth**: login por contraseña única + JWT (`jsonwebtoken` + `bcrypt`)
- **Frontend**: HTML estático (`index.html`, `admin.html`) servido por Express, fuente Quicksand

## Páginas

| Ruta          | Descripción                                              |
|---------------|----------------------------------------------------------|
| `/`           | Landing pública con los profesionales (botones WhatsApp) |
| `/admin.html` | Panel de administración (requiere contraseña)            |

## Desarrollo

```bash
cd clients/sinergia
npm install
npm run dev      # servidor con recarga en http://localhost:3000
# npm start      # producción
```

La base se crea sola la primera vez y se siembra con los profesionales de
`data/contacts.json`.

## Login del panel

- **Contraseña por defecto**: `sinergia2026`
- Se puede cambiar desde el panel (sección *"Cambiar contraseña"*).
- Para fijar otra contraseña inicial en el deploy, definí la variable de entorno
  `ADMIN_PASSWORD` **antes del primer arranque** (cuando se crea la base).

## Variables de entorno

| Variable         | Default                          | Uso                                       |
|------------------|----------------------------------|-------------------------------------------|
| `PORT`           | `3000`                           | Puerto del servidor                       |
| `ADMIN_PASSWORD` | `sinergia2026`                   | Contraseña inicial del panel (primer boot)|
| `JWT_SECRET`     | `sinergia-dev-secret-...`        | Secreto para firmar los tokens            |

## Teléfonos / WhatsApp

En el panel se carga el número tal como se escribe (ej. `2345 512467`). El link de
WhatsApp se arma automáticamente para Argentina: se quitan los símbolos y se antepone
`549`. Si el número ya empieza con `54`, se usa tal cual. Para un número de otro país,
escribilo en formato internacional (con código de país) o usá el campo
*"Link personalizado"*.

## API

| Método | Ruta                          | Auth | Descripción                  |
|--------|-------------------------------|------|------------------------------|
| GET    | `/api/contacts`               | —    | Contactos visibles (landing) |
| GET    | `/api/contacts/all`           | ✓    | Todos (incluye ocultos)      |
| POST   | `/api/contacts`               | ✓    | Crear                        |
| PUT    | `/api/contacts/:id`           | ✓    | Editar                       |
| DELETE | `/api/contacts/:id`           | ✓    | Eliminar                     |
| PUT    | `/api/contacts/order/reorder` | ✓    | Reordenar (`{ order: [...] }`)|
| POST   | `/api/auth/login`             | —    | `{ password }` → `{ token }` |
| GET    | `/api/auth/verify`            | ✓    | Validar token                |
| POST   | `/api/auth/password`          | ✓    | Cambiar contraseña           |

## Deploy (Coolify)

Apuntar a este subdirectorio. El `Dockerfile` levanta el servidor en el puerto `3000`.
**Importante**: montar un volumen persistente en `/app/data` para no perder los
contactos ni la contraseña entre deploys.

## Notas

- El link de Instagram (ícono al pie de la landing) apunta al perfil real
  `@sinergia.25` (https://www.instagram.com/sinergia.25). Para cambiarlo,
  editar el `href` en `index.html`.
