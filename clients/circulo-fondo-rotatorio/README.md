# Fondo rotatorio · Círculo de Oficiales de la Fuerza Aérea Argentina

Sistema paralelo al presupuestario oficial para controlar el **fondo rotatorio** que la Sede Central adelanta todos
los meses a cada sede, discriminado por sede y por rubro.

**Etapa 1** (esta): desde que la Central asigna el fondo del mes hasta que la sede cierra, firma y **envía** la
rendición. Lo que hace la Central con la rendición recibida (cotejo, observaciones, aprobación) es la Etapa 2.

- La Central asigna el fondo a cada sede (sale de su cuenta) y autoriza fondos extra (Presidente).
- La sede carga cada gasto desde el celular: proveedor (base única con CUIT), comprobante (CAE), rubro, monto y
  medio. El sistema dice en vivo si es **fijo**, **caja chica** o si **necesita una solicitud aprobada**.
- Comprobante repetido (CAE o número) → se rechaza, se avisa y queda registrado el intento.
- Pagos sobre el umbral: retenciones tildadas a mano, neto a transferir y comprobante de retención en PDF.
- La Central aprueba solicitudes desde su **panel diario** y puede pagar directo con cargo a la sede.
- Fin de mes: el jefe cierra y firma (hash SHA-256), el sistema arma el listado por rubro (PDF y Excel) y la sede
  lo envía. El mes queda bloqueado; sólo la Central lo reabre, con motivo, y se guarda cada versión.
- Nada se borra: todo se anula con motivo. Auditoría append-only encadenada con hash.

Ver `PLAN.md` (modelo, permisos, pantallas), `DECISIONES.md` (supuestos y puntos abiertos) y `docs/` (manual).

## Stack

Node 22 · Express · SQLite (better-sqlite3) · JWT en cookie httpOnly · pdfkit · exceljs · frontend en HTML +
ES modules sin build. Es la misma base del sistema del aeroclub (ver `DECISIONES.md` D-01).

## Correr en local

```bash
cd clients/circulo-fondo-rotatorio
npm install
npm run demo      # base de demostración (BORRA la base local)
npm run dev       # http://localhost:3000
npm test          # reglas críticas
```

Usuarios de la demo (contraseña `demo1234` en todos):

| Rol | Usuario |
|---|---|
| Superadmin (VentureByte) | `soporte@venturebyte.com.ar` |
| Central · Administrador / Tesorero | `tesoreria@demo.com` |
| Central · Presidente | `presidente@demo.com` |
| Vicente López · Jefe / Administrativo / Carga | `jefe.vl@demo.com` · `admin.vl@demo.com` · `carga.vl@demo.com` |
| Otras sedes | `jefe.<sede>@demo.com`, `admin.<sede>@demo.com` (`cba`, `asc`, `cos`, `bag`, `norte`, `sur`); `carga.cba`, `carga.asc` |

Qué trae la demo: el mes anterior completo (Vicente López abierta para cerrarla en vivo; Córdoba, Ascochinga y
Cosquín enviadas —Cosquín con una reapertura y versión 2—; Bahía Agradable firmada sin enviar) y el mes en curso
con solicitudes en cada estado, un pedido de fondos extra pendiente, un intento de duplicado y fotos pendientes.
**No correr `npm run demo` en producción** (se niega si `NODE_ENV=production`).

Con Docker: `docker compose up --build` (app) o `docker compose --profile minio up --build` (app + MinIO).

## Deploy en Coolify

- Recurso nuevo apuntando a este repo, **base directory** `clients/circulo-fondo-rotatorio`, branch `master`.
- Build pack: **Dockerfile**. Puerto **3000**. **Healthcheck de Coolify desactivado**: la imagen `node:22-slim` no trae
  curl ni wget y Coolify da el contenedor por muerto. El Dockerfile ya tiene su propio `HEALTHCHECK` contra `/salud`.
- **Volumen persistente obligatorio** en `/app/data`: base (`fondo.sqlite`), secreto de sesiones, adjuntos y
  copias de seguridad diarias (`/app/data/respaldos`, quedan 30). Sin volumen, cada deploy borra todo.

| Variable | Para qué |
|---|---|
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | Primer superadmin (sólo si la base está vacía). Entra con esa clave y la cambia. |
| `JWT_SECRET` | Opcional. Si no está, se genera y se guarda en el volumen. |
| `ADJUNTOS_DRIVER` | `local` (por defecto, en el volumen) o `s3` (MinIO). |
| `S3_ENDPOINT`, `S3_BUCKET`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`, `S3_REGION` | Sólo con `ADJUNTOS_DRIVER=s3`. El bucket se crea solo. |

Después del primer deploy, como superadmin:
1. **Administración → Sedes**: las sedes (la Central ya existe).
2. **Usuarios**: los de la Central y los de cada sede (cada uno recibe una contraseña temporal).
3. **Parámetros**: CUIT y domicilio del Círculo, topes vigentes y **alícuotas que pase el contador**.
4. **Asignar fondos → Ingreso a la Central**: el saldo inicial al 31/12.

En producción: `https://faa.venturebyte.com.ar` (app `circulo-fondo-rotatorio`, volumen `circulo-fondo-data`).
Flujo de deploy desde esta PC: merge a `master`, `git push`, y `ssh venturebyte "coolify deploy circulo-fondo"`.

## Cómo está pensado

| Regla | Dónde |
|---|---|
| Plata en centavos enteros; alícuotas en cienmilésimos | `server/util.js` |
| Permisos por rol en una matriz editable; cada servicio los controla (no sólo la UI) | `server/permisos.js`, `services/acceso.js` |
| Libro único de movimientos (Central · banco; sede · banco y efectivo), encadenado con SHA-256 e inmutable | `services/libro.js` |
| Fijo / caja chica / con solicitud según rubro, medio, tope vigente a la fecha de pago y solicitud aprobada | `services/gastos.js` → `clasificar()` |
| Anti-duplicado: índice único parcial sobre CAE (y CUIT+tipo+PV+número) entre los gastos vigentes; el intento rechazado queda en `intentos_duplicado` | `services/gastos.js`, `db.js` |
| Retenciones: base × alícuota de la tabla (a validar con el contador), certificado con número correlativo | `services/gastos.js`, `services/pdf.js` |
| Período cerrado: el servicio y un trigger de SQLite rechazan cargar o tocar gastos de ese mes | `db.js`, `services/rendiciones.js` |
| Rendición: contenido canónico + SHA-256; versión firmada inmutable (trigger); verificación foto/datos | `services/rendiciones.js` |
| Auditoría append-only encadenada; triggers impiden UPDATE/DELETE; `verificarCadena()` detecta alteraciones | `services/auditoria.js` |
| Nada se borra: trigger `no_delete` en todas las tablas de negocio | `db.js` |
| Adjuntos opcionales: se achican en el navegador (1600 px, JPEG 0,7) y suben en segundo plano con reintentos | `public/assets/js/lib.js`, `services/adjuntos.js` |

## Etapa 2 (no implementado, el modelo lo deja listo)

Cotejo de la Central comprobante por comprobante, observaciones y re-rendición (estados `en_cotejo`, `observada`,
`aprobada` ya en el enum), conciliación de caja, reportes parametrizables y consolidados, Excel para el sistema
presupuestario, recaudación por sede, lectura del QR de ARCA y constatación de CAE por web service.
