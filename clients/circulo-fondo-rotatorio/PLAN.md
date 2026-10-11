# PLAN — Fondo Rotatorio · Círculo de Oficiales de la Fuerza Aérea (Etapa 1)

Etapa 1: desde que la Sede Central asigna el fondo del mes hasta que la sede cierra, firma y **envía** la rendición.
Lo que hace la Central con la rendición recibida (cotejo, observaciones, aprobación) es la Etapa 2: el modelo lo
deja previsto, pero no se implementa.

## Stack

Se reutiliza la base del sistema anterior del monorepo (`clients/aeroclub-25-de-mayo`: centros de costo = aviones,
usuarios = socios), que ya corre en Coolify:

- **Node 22 · Express · SQLite (better-sqlite3)** — una sola base en un volumen; transacciones sincrónicas, que
  hacen trivial encadenar hashes sin carreras.
- **JWT en cookie httpOnly**, bcrypt, encabezado anti-CSRF propio.
- **pdfkit** (rendición, comprobante de retención) y **exceljs** (rendición en .xlsx).
- Frontend en **HTML + ES modules sin build** (mismo patrón de `lib.js`, router por hash y vistas por rol).
- Adjuntos: disco local del volumen por defecto; **S3/MinIO** con `ADJUNTOS_DRIVER=s3`. Todo detrás del flag
  `adjuntos`.

Por qué no Next.js + Postgres (el stack sugerido): ver `DECISIONES.md` D-01.

## Convenciones

- Plata en **centavos enteros** (`INTEGER`). Nunca float. Formato `$ 1.234.567,89`.
- Alícuotas en **cienmilésimos** (2,5 % → `2500`, sobre 100.000).
- Fechas de negocio `YYYY-MM-DD` en `America/Argentina/Buenos_Aires`; período `YYYY-MM`.
- **Nada se borra**: se anula con motivo. Las tablas de bitácora rechazan `UPDATE`/`DELETE` por trigger.

## Modelo de datos

```
sedes ─┬─< usuarios                    rubros (padre_id → rubros)  es_fijo · es_nd
       ├─< asignaciones (mensual|extra) ─── pedidos_fondos (extra, autoriza Presidente)
       ├─< movimientos  (libro encadenado: banco|efectivo por sede; banco de la Central)
       ├─< solicitudes ─< solicitudes_historial
       ├─< gastos ──┬── proveedores (CUIT único, base compartida)
       │            ├── solicitudes (vinculada, opcional)
       │            ├─< retenciones ── alicuotas (impuesto · régimen · vigencia)
       │            ├── certificados_retencion (numeración correlativa)
       │            └─< adjuntos
       ├─< intentos_duplicado
       └─< rendiciones ─< rendicion_versiones (snapshot + hash + firma + envío)
parametros (clave · valor · vigente_desde)      roles_permisos (matriz editable)
config (flags y datos del Círculo)              notificaciones          auditoria (append-only, encadenada)
```

### Entidades

| Tabla | Campos clave | Notas |
|---|---|---|
| `sedes` | nombre, codigo, `es_central`, activa, orden | Cada sede es un centro de costo. Hay exactamente una Central. |
| `usuarios` | nombre, email, `rol`, `sede_id`, activo, password_hash, token_version | Un usuario pertenece a una sede; la Central ve todo. |
| `roles_permisos` | rol, permiso | Matriz editable por el superadmin. |
| `rubros` | padre_id, nombre, `es_fijo`, `es_nd`, activo, orden | Rubro → subrubro. N/D es especial. |
| `parametros` | clave, valor, `vigente_desde`, creado_por | Topes y umbrales con vigencia. Sólo se agregan filas. |
| `alicuotas` | impuesto, regimen, jurisdiccion, alicuota, minimo, vigente_desde, activa | **A validar con el contador.** |
| `config` | clave, valor | Datos del Círculo (CUIT, razón social) y feature flags. |
| `movimientos` | sede_id, `cuenta` (banco/efectivo), periodo, tipo, importe ±, refs, anula_id, `hash_anterior`, `hash` | Libro único encadenado. El saldo es la suma. Inmutable. |
| `asignaciones` | sede_id, periodo, `tipo` (mensual/extra), importe, fecha, referencia, pedido_id | Una mensual por sede y período (se puede anular y rehacer). |
| `pedidos_fondos` | sede_id, importe, justificacion, saldo al pedir, `estado`, resuelto_por | `pendiente → autorizado / rechazado`. |
| `proveedores` | `cuit` (único), razon_social, razon_norm, condicion_iva, contacto | Base única del Círculo. |
| `solicitudes` | sede_id, descripcion, monto_estimado, proveedor_id, rubro_id, `estado`, `quien_paga`, gasto_id | `pendiente → en_revision / aprobada / rechazada → ejecutada`. |
| `gastos` | sede_id, periodo, fecha_pago, proveedor, comprobante (tipo, pv, número, CAE, vto, fecha), `bruto`, `retenciones`, `neto`, rubro, `tipo_gasto`, `medio`, `pagado_por`, solicitud_id, estado, `adjunto_estado` | Un gasto = un comprobante + su pago. CAE único entre los vigentes. |
| `retenciones` | gasto_id, impuesto, alicuota_id, jurisdiccion, base, alicuota, importe, tildado_por | Quién tildó qué queda registrado. |
| `certificados_retencion` | numero (correlativo), gasto_id, datos del agente y del sujeto, total | El PDF se arma de esta fila. |
| `intentos_duplicado` | sede_id, usuario_id, ip, clave (cae/numero), datos, gasto_existente_id | El rechazo deja rastro. |
| `rendiciones` | sede_id, periodo, `estado`, version_actual | `abierta → cerrada_firmada → enviada` (+ `en_cotejo`, `observada`, `aprobada` reservados para la Etapa 2). |
| `rendicion_versiones` | rendicion_id, version, `snapshot` (JSON), `hash`, firmado_por/en, enviado_por/en, reabierto_por/en, motivo | La foto inmutable de lo enviado. Una reapertura crea versión nueva. |
| `adjuntos` | entidad, entidad_id, nombre, mime, bytes, sha256, clave_storage | Opcionales. |
| `notificaciones` | usuario_id, texto, link, leida | Avisos dentro del sistema. |
| `auditoria` | usuario, sede, accion, entidad, antes, despues, motivo, ip, `hash_anterior`, `hash` | Append-only. Toda mutación pasa por acá. |

### Estados

```
Solicitud:  pendiente ──▶ en_revision ──▶ aprobada ──▶ ejecutada
                │              │      └──▶ rechazada
                ├──▶ aprobada ─┘
                └──▶ rechazada

Rendición:  abierta ──cerrar y firmar──▶ cerrada_firmada ──enviar──▶ enviada
               ▲                               │                        │
               └────── reabrir (Central, con motivo; nueva versión) ────┘
            [etapa 2: enviada → en_cotejo → observada / aprobada]

Pedido de fondos extra: pendiente ──▶ autorizado (suma al fondo) / rechazado
Gasto: registrado ──▶ anulado (contraasiento, motivo obligatorio)
```

### Libro de movimientos (saldos)

| Tipo | Cuenta afectada | Signo |
|---|---|---|
| `saldo_inicial`, `ingreso` | Central · banco | + |
| `asignacion` / `fondo_extra` | Central · banco − / sede · banco + | par de filas |
| `extraccion` | sede · banco − / sede · efectivo + | par de filas |
| `deposito` | sede · efectivo − / sede · banco + | par de filas |
| `gasto` (paga la sede) | sede · banco o efectivo | − bruto |
| `pago_central` (paga la Central con cargo a la sede) | Central · banco | − bruto |
| `anulacion` | la misma cuenta del movimiento anulado | contrario |

## Reglas críticas (con test)

1. Tipo de gasto: rubro fijo → **fijo** · ≤ tope del medio → **caja chica** · si no → exige **solicitud aprobada**.
2. CAE duplicado (o CUIT+tipo+PV+número) → rechazo + `intentos_duplicado` + aviso.
3. Cada gasto descuenta del libro (subcuenta del medio); el pago de la Central descuenta de la Central.
4. Retenciones: bruto − Σ(base × alícuota) = neto; certificado con número correlativo.
5. Período cerrado: el servicio y un trigger de la base rechazan cargar o editar gastos de ese mes.
6. Rendición: snapshot + SHA-256; verificación recalculando; reapertura auditada y versionada.
7. Auditoría encadenada: `verificarCadena()` detecta una alteración directa en la base.

## Matriz de permisos (por defecto; editable)

| Permiso | Superadmin | Central: Admin/Tesorero | Presidente | Jefe de sede | Administrativo | Carga |
|---|:-:|:-:|:-:|:-:|:-:|:-:|
| Ver todas las sedes | ✓ | ✓ | ✓ | | | |
| Sedes, usuarios, rubros, parámetros, alícuotas | ✓ | rubros | | | | |
| Editar matriz de permisos y flags | ✓ | | | | | |
| Ingresos a la cuenta de la Central | | ✓ | | | | |
| Asignar fondo mensual | | ✓ | | | | |
| Pedir fondos extra | | | | ✓ | | |
| Autorizar fondos extra | | | ✓ | | | |
| Extracción / depósito (banco ↔ efectivo) | | | | ✓ | ✓ | |
| Cargar gastos | | ✓ (pago directo) | | ✓ | ✓ | ✓ |
| Registrar retenciones (pagos sobre el umbral) | | ✓ | | ✓ | ✓ | |
| Anular / corregir gastos | | ✓ | | ✓ | ✓ | |
| Alta de proveedores | ✓ | ✓ | ✓ | | ✓ | |
| Crear solicitudes de gasto | | | | ✓ | | |
| Resolver solicitudes (panel diario) | | ✓ | | | | |
| Resolver solicitudes escaladas (en revisión) | | ✓ | ✓ | | | |
| Cerrar, firmar y enviar la rendición | | | | ✓ | | |
| Reabrir un período | | ✓ | | | | |
| Bandeja de rendiciones recibidas | ✓ | ✓ | ✓ | | | |
| Auditoría | ✓ | ✓ | ✓ | su sede | | |

## Pantallas

**Sede** (celular primero)
1. **Inicio** — saldo en banco y en efectivo, fondo del mes, gastado; botones grandes: *Cargar gasto*, *Pedir aprobación*, *Sacar efectivo*; avisos.
2. **Cargar gasto** — proveedor (busca por CUIT o nombre; alta en el momento), comprobante, monto y medio, rubro; el sistema dice en vivo si es fijo / caja chica / necesita solicitud; retenciones si supera el umbral; foto opcional.
3. **Gastos del mes** — lista, detalle, anular / corregir con motivo.
4. **Solicitudes** — mis solicitudes y su estado; nueva solicitud.
5. **Fondos** — movimientos del mes, extracción/depósito, pedido de fondos extra.
6. **Proveedores** — buscar y dar de alta.
7. **Rendición** — resumen del mes, *Cerrar y firmar*, *Enviar a la Central*, PDF y Excel, versiones.
8. **Avisos** y **Perfil**.

**Sede Central**
1. **Panel diario** — solicitudes de hoy y pendientes de todas las sedes (aprobar / rechazar / revisión en un clic, con quién paga), pedidos de fondos extra, saldo de la Central, alertas de N/D.
2. **Asignar fondos** — una fila por sede, monto sugerido = el del mes anterior.
3. **Pago directo** — el mismo formulario de gasto, eligiendo la sede a la que se imputa.
4. **Sedes** — saldo de cada sede.
5. **Rendiciones recibidas** — por sede y período; detalle, PDF, Excel e integridad del hash.
6. **Retenciones** — certificados emitidos.
7. **Auditoría** — registro, verificación de las cadenas, intentos de duplicado.
8. **Administración** (superadmin) — sedes, usuarios, rubros, parámetros, alícuotas, permisos y flags.

## Orden de construcción

1. Auth y roles, sedes, usuarios, rubros, parámetros (+ auditoría desde el inicio).
2. Saldo de la Central, asignación mensual, subcuentas de la sede, extracción.
3. Proveedores con CUIT.
4. Gastos con los 3 tipos, comprobantes con anti-duplicado y descuento de saldo.
5. Solicitudes, panel diario y pago directo de la Central.
6. Pedido de fondos extra.
7. Retenciones y comprobante de retención.
8. Cierre, firma, listado por rubro (PDF/Excel), envío y bandeja de recibidas.
9. Adjuntos.
