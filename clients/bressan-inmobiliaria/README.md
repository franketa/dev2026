# Vairo Propiedades

Sitio web de Vairo Propiedades — inmobiliaria de Lobos, Bs. As. Listado de propiedades urbanas y rurales (casas, quintas, campos, departamentos, terrenos), búsqueda con filtros, panel de administración para alta/edición/baja de propiedades y subida de imágenes.

## Stack

- **Frontend:** HTML + CSS (BEM) + JS vanilla. Sin frameworks.
- **Backend:** Node.js + Express + SQLite (better-sqlite3) + JWT + Multer.
- **Deploy:** Dockerfile, pensado para Coolify.

## Estructura

```
vairo-propiedades/
├── index.html              Landing pública
├── property.html           Detalle de propiedad
├── admin.html              Panel de admin (login + CRUD propiedades)
├── package.json
├── Dockerfile
├── .dockerignore / .gitignore
├── assets/
│   ├── css/styles.css      Estilos (paleta terracota, mobile-first)
│   ├── js/
│   │   ├── api.js          Cliente HTTP (fetch + JWT)
│   │   ├── app.js          Lógica de la landing
│   │   └── properties-data.js  Carga inicial con fallback
│   └── images/
│       ├── logos/          Logos de marca (vairo-logo.png)
│       ├── hero/           Imagen de fondo del hero
│       └── properties/     (no usada — las imágenes van en /uploads)
├── data/
│   ├── properties.json     Seed inicial
│   └── db.sqlite           SQLite (creada automáticamente)
├── server/
│   ├── index.js            Express bootstrap
│   ├── db.js               Schema + seed + helpers
│   ├── middleware/auth.js  JWT middleware
│   └── routes/
│       ├── properties.js   CRUD propiedades + upload imágenes
│       └── auth.js         Login + verify
└── uploads/properties/     Imágenes subidas por el admin (creadas en runtime)
```

## Comandos

```bash
npm install
npm start           # Producción (node server/index.js)
npm run dev         # Desarrollo con --watch
```

Por defecto corre en el puerto **3000**. Override con `PORT=xxxx npm start`.

## Credenciales admin

Al primer arranque (BD vacía) se crea el admin por defecto:

- **Usuario:** `vairo`
- **Password:** `vairo`

⚠️ Cambiar antes del deploy a producción. Para cambiar la contraseña, usar bcrypt y un `UPDATE admin_users` en la BD, o borrar el registro y reiniciar el servidor con la variable de entorno deseada (no hay endpoint de reset por seguridad).

## Variables de entorno

| Variable | Default | Para qué sirve |
|---|---|---|
| `PORT` | `3000` | Puerto HTTP del servidor |
| `JWT_SECRET` | `vairo-dev-secret-change-in-production` | Secreto para firmar tokens. **Obligatorio cambiar en producción.** |

## Datos persistentes (¡importante para deploy!)

Estos directorios deben sobrevivir entre redeploys. En Coolify hay que montar volúmenes:

- `/app/data` → contiene `db.sqlite` con todas las propiedades y usuarios admin
- `/app/uploads` → contiene las imágenes que sube el admin (`uploads/properties/<id>/*.jpg`)

**Si no se montan estos volúmenes, cada redeploy borra TODO el contenido cargado por el cliente.**

## Marca

- Tipografías: Inter (sans, UI) + Fraunces (serif, headings) + JetBrains Mono (detalles editoriales)
- Paleta:
  - Terracota: `#D9622E` (color principal del logo)
  - Terracota profundo: `#B84F22` (hover / acentos densos)
  - Crema/sand: `#E8DDC9` (color del monograma)
  - Tinta cálida: `#1A1410` (texto y backgrounds densos)
  - Oro: `#C39A3D` (acento estados “reservado”)

## Endpoints API

```
GET    /api/properties              Lista todas (público)
GET    /api/properties/:id          Detalle (público)
POST   /api/properties              Crear (auth)
PUT    /api/properties/:id          Editar (auth)
DELETE /api/properties/:id          Borrar (auth)
POST   /api/properties/:id/images   Subir imágenes (auth, multipart)
DELETE /api/properties/:id/images/:filename  Borrar imagen (auth)

POST   /api/auth/login              { email, password } → { token, email }
GET    /api/auth/verify             Verifica token vigente
```
