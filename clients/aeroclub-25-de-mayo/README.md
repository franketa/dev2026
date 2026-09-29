# Aeroclub 25 de Mayo — horas de vuelo y cuenta de socios

Sistema multiusuario para reemplazar la planilla de Excel del aeroclub:

- Cada piloto o alumno **carga su vuelo al bajar del avión**: avión, fecha, tiempo de vuelo en horas con un decimal (0,1 = 6 minutos), si voló con instructor (y cuál) y novedades. Antes de guardar confirma los datos: **una vez aceptado, el vuelo no se puede modificar** (sólo tesorería lo corrige).
- **Rampa** registra aeronaves (del club de socios o de afuera) y arma **tickets de servicios** (hangaraje, combustible, nocturno, limpieza…) a la cuenta del propietario, o cobrados en el momento.
- A fin de mes el sistema **cierra el período solo**, factura los vuelos, cobra el **derecho de aeronave** (una vez por mes a cada piloto que voló) y genera un **cupón de pago en PDF** por socio o externo: horas del mes + servicios + saldo anterior − pagos ± ajustes.
- Tesorería manda el cupón por **WhatsApp** con un toque (link privado al PDF) y **registra los pagos**. El socio también puede **informar un pago** desde la app (con foto del comprobante) y tesorería lo confirma.
- Todo lo que toca plata queda en un **libro de movimientos** encadenado: tesorería puede corregirlo (cada cambio queda auditado) y cualquier alteración por fuera del sistema se detecta.

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
| Libro de movimientos encadenado con SHA-256 y sello impreso en cada cupón. Tesorería puede anular, editar o borrar movimientos: se rehace la cadena, se recalculan los cupones y queda en la auditoría | `server/services/ledger.js`, `correcciones.js` |
| Cierre mensual en una sola transacción; la "simulación" corre el cierre real y lo revierte | `server/services/cierres.js` |
| Vuelos cargados tarde de un mes ya cerrado entran en el cierre siguiente con su fecha real | `cierres.correrCierre()` |
| El período es el mes calendario; el cierre automático corre el día 5 del mes siguiente a las 9 (configurable), así los vuelos cargados tarde entran en su mes. En orden y sin saltear meses | `cierres.cierreAutomatico()` |
| Tickets de servicios: un movimiento `servicio` por ticket, con el precio del día congelado en sus ítems. No se editan: se anulan (contraasiento) y se hace otro | `server/services/tickets.js` |
| Derecho de aeronave: se cobra en el cierre, una sola vez por piloto y por mes volado (`derechos_aeronave`). Con precio en cero no se cobra | `tickets.cobrarDerechos()` |
| Pagos informados: no tocan el saldo hasta que tesorería los confirma. El comprobante se guarda dentro de la base | `server/services/pagosInformados.js` |
| Bases de versiones anteriores se migran solas al arrancar (se reconstruyen `usuarios` y `movimientos` para los CHECK nuevos) | `db.migrar()` |

Copias de seguridad: el sistema guarda **una copia completa por mes** en el volumen (`/app/data/respaldos`, quedan las últimas 12), después del cierre. Se bajan desde **Registro**, que también permite descargar una copia en el momento. Conviene guardarlas además fuera del servidor.

## Roles

- **Piloto** (incluye alumnos): carga vuelos, ve su historial, descarga sus cupones, informa pagos y consulta su estado de cuenta. No puede corregir ni anular vuelos. Si es **instructor**, también ve los vuelos que dio como instructor.
- **Administrador** (tesorería): todo lo anterior, más socios, flota, tarifas y servicios, pagos, ajustes, tickets con otros conceptos, cierres, reportes, registro y configuración.
- **Consulta**: ve todo el módulo de administración sin poder cambiar nada (el servidor rechaza cualquier escritura).
- **Rampa**: registra aeronaves y propietarios y carga tickets de servicios. No ve cuentas ni vuelos.
- **Externo**: dueño de una aeronave de afuera. Tiene cuenta corriente y cupón, pero no usuario para entrar.

Demo: además de los usuarios de arriba, `rampa@demo.com` y `comision@demo.com` (consulta), con `piloto1234`.

## Pendiente para una segunda etapa

- Tacómetro como campo opcional al final de la carga (las columnas `tac_inicial` y `tac_final` ya existen en `vuelos`, vacías).
- Link de pago de Mercado Pago en el cupón.
- Envío automático de cupones por WhatsApp (hoy es un toque por socio).
