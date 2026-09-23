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
| Vendedor | Stock, clientes, leads, ventas. **Sin costos ni márgenes** |
| Administrativo | Caja, cobranzas, deudas, proveedores, reportes |
| Taller | Solo preparación de unidades |

## Documentos

El boleto de compraventa se genera en `/documentos/boleto/[id]` y se imprime desde el
navegador (Imprimir → Guardar como PDF). Sin librería de PDF: es una hoja con estilos de
impresión. La razón social y el CUIT salen de Configuración, se cargan una vez.

Incluye el importe en letras, que un boleto sin eso no sirve.

## Deploy

Coolify sobre `venturebyte`, build por Dockerfile desde este subdirectorio.
La base es un Postgres gestionado por Coolify; la app la encuentra por red interna
vía `DATABASE_URL`.
