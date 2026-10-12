# Garrahan CRM

Sistema de gestión para Garrahan Automotores (Chivilcoy). Stock, ventas, leads, taller,
caja e inversores, con el margen real de cada unidad calculado solo.

Hecho a medida para un solo cliente. Reemplaza el intento anterior sobre Twenty, que no
podía dar acciones contextuales, generación de documentos ni pantallas por módulo.

## Stack

Next.js 16 (App Router, server components) · React 19 · Tailwind 4 · Postgres 16.
Sin ORM: SQL directo con `postgres`. Los cálculos pesados viven en una vista de la base,
no en la aplicación.

## Correr en local

```bash
npm install
export DATABASE_URL="postgres://usuario:clave@localhost:5432/garrahan_crm"
ADMIN_PASSWORD="una-clave" node scripts/setup-db.mjs   # crea esquema + datos de arranque
npm run dev
```

`setup-db.mjs` es idempotente: se puede correr de nuevo sin duplicar nada. La contraseña
inicial **no está en el código**, va por variable de entorno.

## Cómo está organizado

```
db/schema.sql        Esquema completo + vistas de cálculo
scripts/setup-db.mjs Instalación y datos de arranque
src/lib/             db, auth (5 roles), formatos es-AR, vocabulario del negocio
src/components/      ui.tsx (KPI, Chip, Tabla, Progreso…), sidebar, selects
src/app/(app)/       Las pantallas, todas detrás de sesión
src/app/documentos/  Boleto de compraventa (imprimible, fuera del layout)
```

## Las tres decisiones que ordenan todo

**1. El costo se carga desde el auto.** No desde la caja. El usuario piensa "este auto tuvo
un gasto", no "hubo un movimiento de caja que pertenece a un auto". La ficha del vehículo
tiene el botón «Agregar costo» y el margen se recalcula en el momento.

**2. Comprar un auto no es un gasto del mes.** Es cambiar plata por mercadería. En Reportes,
el ingreso del período es el **margen de lo vendido**, no el precio de venta, y la compra no
figura como egreso. En Caja sí sale la plata, porque son dos preguntas distintas:
*¿cuánta plata tengo?* y *¿estoy ganando?*.

**3. El vendedor no ve costos ni márgenes.** Los roles no son decorativos: `veCostos()` corta
las columnas y las pantallas sensibles. Felipe trabaja con stock, leads y ventas sin ver
cuánto se ganó en cada unidad.

## Cálculos en la base

`v_vehiculos` resuelve en SQL lo que antes hacía un cron: costo total, margen, margen %,
días en playón y el semáforo (verde / +30 / +60 / +90). Es una sola fuente de verdad y no
hay nada que sincronizar.

`v_saldos` hace lo mismo con la caja, incluyendo las transferencias internas recibidas.

## Roles

| Rol | Ve |
|---|---|
| Dueño / Gerente | Todo |
| Vendedor | Stock, clientes, sus leads y los sin asignar, ventas. **Sin costos ni márgenes** |
| Administrativo | Caja, cobranzas, deudas, proveedores, reportes |
| Taller | Solo preparación de unidades |
| Referente | Stock sin costos y solo sus leads |
| Reportes | Reportes y todos los datos para corregir. No administra usuarios ni configuración |

Cada pantalla pide su permiso con `requierePermiso()`: el menú esconde, pero el
servidor es el que corta.

## Documentos

Boleto, recibo y mandato llevan el logo (`public/logo.png`). Un cobro hecho mientras
la operación está en **Reserva** es seña: sale como *Recibo de seña* con la fecha
hasta la que vale la reserva (7 días por defecto, se extiende desde la venta).

El boleto de compraventa se genera en `/documentos/boleto/[id]` y se imprime desde el
navegador (Imprimir → Guardar como PDF). Sin librería de PDF: es una hoja con estilos de
impresión. La razón social y el CUIT salen de Configuración, se cargan una vez.

Incluye el importe en letras, que un boleto sin eso no sirve.

## La web

`garrahanautomotores.com.ar` lee el stock de acá (`/api/publico/vehiculos`, sin costos
ni datos del titular). Se publica lo que está **disponible** y tildado *Publicar en la
web*; al señarse o venderse sale solo. Las fotos se guardan en la base
(`vehiculo_fotos`) porque el contenedor no tiene volumen, y se sirven en `/api/fotos/:id`.

El cotizador de *Vendé tu auto* manda la consulta al servidor del sitio, que la pasa a
`/api/publico/leads` con la clave compartida `WEB_API_KEY`.

## Telegram

Avisos en el momento (lead nuevo y cotización de usado, seña, cobro, venta cerrada o
cancelada) y un resumen a las 9 (señas por vencer, cuotas vencidas, autos de +60 días,
postventa, leads sin contactar). El reloj está en `src/instrumentation.ts`; cada resumen
se manda una vez por día (`avisos_enviados`). El chat se elige en Configuración.

## Variables de entorno

| Variable | Para qué |
|---|---|
| `DATABASE_URL` | Postgres |
| `CRM_PUBLIC_URL` | URL pública del CRM (links de fotos y de los avisos) |
| `WEB_API_KEY` | Clave compartida con el sitio para cargar leads. La misma va en el sitio |
| `TELEGRAM_BOT_TOKEN` | Token del bot. Sin esto no hay avisos |
| `TELEGRAM_CHAT_ID` | Chat por defecto, si no se elige uno en Configuración |

## Deploy

El contenedor aplica `db/schema.sql` al arrancar (`setup-db.mjs --solo-esquema`), así
las columnas nuevas llegan solas con cada deploy.

Coolify sobre `venturebyte`, build por Dockerfile desde este subdirectorio.
La base es un Postgres gestionado por Coolify; la app la encuentra por red interna
vía `DATABASE_URL`.
