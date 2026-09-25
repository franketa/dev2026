# Aeroclub 25 de Mayo — horas de vuelo y cuenta de socios

Sistema multiusuario para reemplazar la planilla de Excel del aeroclub:

- Cada piloto o alumno **carga su vuelo al bajar del avión**: avión, fecha, tiempo de vuelo en horas con un decimal (0,1 = 6 minutos), si voló con instructor (y cuál) y novedades.
- A fin de mes el sistema **cierra el período solo**, factura los vuelos y genera un **cupón de pago en PDF** por socio: horas del mes + saldo anterior − pagos ± ajustes.
- Tesorería manda el cupón por **WhatsApp** con un toque (link privado al PDF) y **registra los pagos**.
- Todo lo que toca plata queda en un **libro inviolable**: no se puede borrar ni editar, y cualquier alteración por fuera del sistema se detecta.

Mobile-first, instalable como app en el celular (PWA).

## Stack

Node 22 · Express · SQLite (better-sqlite3) · JWT en cookie httpOnly · pdfkit · frontend en HTML + ES modules sin build.

## Correr en local

```bash
cd clients/aeroclub-25-de-mayo
npm install
npm run demo      # opcional: base con socios, vuelos y dos meses cerrados de ejemplo
npm run dev       # http://localhost:3000
npm test          # tests del núcleo contable
```

Usuarios de la demo: `tesoreria@aeroclub25demayo.com.ar` / `demo1234` (tesorería) y pilotos como `tomas.aguirre@demo.com` / `piloto1234`.
**No correr `npm run demo` en producción.**

## Deploy en Coolify

- Build pack: **Dockerfile** (en esta carpeta). Puerto **3000**.
- **Volumen persistente obligatorio** montado en `/app/data`: ahí viven la base (`aeroclub.sqlite`) y el secreto de sesiones. Sin volumen, cada deploy borra todo.
- Variables de entorno:

| Variable | Para qué |
|---|---|
| `ADMIN_EMAIL` | Email del primer administrador (sólo se usa si la base está vacía) |
| `ADMIN_PASSWORD` | Su contraseña temporal; al entrar se le pide cambiarla |
| `JWT_SECRET` | Opcional. Si no está, se genera uno y se guarda en el volumen |

- Healthcheck: `GET /salud`.
- Después del primer deploy, en **Configuración**: alias, CBU, titular y la dirección pública del sistema (se usa en los links de WhatsApp).
- En **Flota y tarifas**: las tarifas con y sin instructor de cada avión.

## Cómo está pensado

| Regla | Dónde |
|---|---|
| Plata en centavos enteros y horas en décimas enteras (1,4 h → 14), nunca decimales | `server/util.js` |
| Cada vuelo guarda el precio del día en que se voló; cambiar una tarifa no toca lo ya volado (salvo que tesorería lo pida para vuelos sin facturar) | `server/services/flota.js` |
| Si un piloto carga dos veces el mismo vuelo (avión, fecha y horas), el sistema le avisa | `server/services/vuelos.js` |
| El piloto corrige sus vuelos hasta el cierre; después el vuelo queda congelado (trigger en SQLite) | `server/db.js` |
| Libro de movimientos: sin UPDATE ni DELETE (triggers), encadenado con SHA-256, sello impreso en cada cupón | `server/services/ledger.js` |
| Cierre mensual en una sola transacción; la "simulación" corre el cierre real y lo revierte | `server/services/cierres.js` |
| Vuelos cargados tarde de un mes ya cerrado entran en el cierre siguiente con su fecha real | `cierres.correrCierre()` |
| Cierre automático el día y hora configurados (por defecto, día 1 a las 9), en orden y sin saltear meses | `cierres.cierreAutomatico()` |

Copia de seguridad: **Registro → Copia de seguridad** descarga la base completa. Conviene bajarla después de cada cierre.

## Roles

- **Piloto** (incluye alumnos): carga vuelos, ve sus vuelos, su cuenta y sus cupones. Si es **instructor**, también ve los vuelos que dio como instructor.
- **Administrador** (tesorería): todo lo anterior, más socios, flota, tarifas, pagos, ajustes, cierres, reportes, registro y configuración.

## Pendiente para una segunda etapa

- Tacómetro como campo opcional al final de la carga (las columnas `tac_inicial` y `tac_final` ya existen en `vuelos`, vacías).
- Link de pago de Mercado Pago en el cupón.
- Envío automático de cupones por WhatsApp (hoy es un toque por socio).
