# Presto Chivilcoy — Pedidos Online

App de pedidos online para **Presto Chivilcoy**: empanadas, pizzas y tartas artesanales. Los clientes arman su pedido, eligen cuándo retirarlo en el local, y lo envían por WhatsApp.

## Stack

- **Next.js 16** (App Router)
- **Tailwind CSS 4**
- **Supabase** (PostgreSQL + Auth)
- **lucide-react** (iconos)

## Configuración

### 1. Crear proyecto en Supabase

1. Ir a [supabase.com](https://supabase.com) y crear un proyecto nuevo
2. En el SQL Editor, ejecutar el contenido de `supabase/schema.sql`
3. Luego ejecutar `supabase/seed.sql` para cargar datos de ejemplo
4. En Authentication > Users, crear un usuario admin con email y contraseña

### 2. Variables de entorno

Copiar `.env.example` a `.env.local` y completar:

```
NEXT_PUBLIC_SUPABASE_URL=https://tu-proyecto.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=tu-anon-key
```

Estos valores se encuentran en Supabase > Settings > API.

### 3. Desarrollo local

```bash
npm install
npm run dev
```

La app estará en `http://localhost:3000`.

### 4. Deploy en Vercel

1. Conectar el repositorio a Vercel
2. Configurar las variables de entorno (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`)
3. Deploy automático

## Estructura

```
/app
  /page.tsx              → Menú público (cliente)
  /checkout/page.tsx     → Checkout del pedido
  /confirmation/[id]     → Confirmación + WhatsApp
  /admin/login           → Login del admin
  /admin/orders          → Gestión de pedidos
  /admin/products        → Gestión de productos y categorías
  /admin/settings        → Configuración del negocio
  /api/orders            → API para crear pedidos
  /api/settings          → API para obtener settings
/components              → Componentes React
/lib                     → Supabase client, utils, types, constants
/hooks                   → useCart, useBusinessStatus
/supabase                → schema.sql, seed.sql
```

## Personalización

Los colores se definen como variables CSS en `app/globals.css`:

```css
:root {
  --color-primary: #D4451A;
  --color-header: #1C1917;
  --color-bg: #FAF8F5;
  /* ... */
}
```

Cambiá estos valores para adaptar la identidad visual.

El logo se carga desde `/public/logo.png`.
