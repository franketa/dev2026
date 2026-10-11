# Manual de uso · Sede Central

*Borrador para la demo. Fondo rotatorio · Círculo de Oficiales de la Fuerza Aérea Argentina.*

## Roles de la Central

| Rol | Puede |
|---|---|
| **Administrador / Tesorero** | Registrar ingresos a la cuenta de la Central, asignar el fondo mensual, resolver solicitudes desde el panel diario, pagar directo con cargo a una sede (con retenciones), reabrir períodos y ver las rendiciones recibidas. |
| **Presidente** | Autorizar o rechazar los pedidos de fondos extra, resolver las solicitudes que se le escalan ("en revisión") y ver todo. |
| **Superadmin (VentureByte)** | Alta de sedes, usuarios, rubros, parámetros, alícuotas y permisos. No mueve plata. |

La Central ve todas las sedes. Cada sede sólo ve lo suyo.

## Panel diario

Es la pantalla de todos los días. Arriba: saldo de la Central, solicitudes por resolver, pedidos de fondos extra y
cuántas sedes ya enviaron la rendición del mes anterior.

- **Por resolver**: las solicitudes pendientes y en revisión de todas las sedes. **Resolver** → elegís
  *Aprobar* / *A revisión* / *Rechazar*, quién paga (si se aprueba) y un comentario para la sede. Dos clics.
  - *A revisión* es para lo que hay que consultar con el Presidente: le llega un aviso y lo resuelve él.
  - Rechazar pide comentario: la sede lo recibe como aviso.
- **Pedidos de fondos extra**: "*Ascochinga pide $ 2.000.000 y todavía le quedan $ 118.549.400*". Los autoriza
  o rechaza el Presidente. Autorizado, el monto pasa del saldo de la Central al fondo de la sede.
- **Para pagar desde la Central**: solicitudes aprobadas con "paga la Central". **Pagar** abre el pago directo.
- **Sedes**: saldo de cada una, alerta de N/D y estado de la rendición del mes anterior.

## Asignar el fondo del mes

**Asignar fondos**: una fila por sede, con el monto del mes anterior ya sugerido. Ajustá, cargá el número de
transferencia si querés y tocá **Asignar**. Cada asignación sale del saldo de la Central y abre el saldo de la
sede para ese mes. Si la Central no tiene saldo suficiente, el sistema no deja asignar: primero registrá el
**Ingreso a la Central** (por ejemplo, la transferencia de la Fuerza). Al arrancar, el primer ingreso es el
**saldo inicial al 31/12**.

Una asignación mal cargada se **anula** con motivo (sólo si la sede todavía no usó esa plata) y se vuelve a cargar.

## Pago directo con cargo a una sede

**Pago directo**: el mismo formulario que usan las sedes, eligiendo a qué sede se imputa. La plata sale de la
cuenta de la Central; el gasto figura en la rendición de la sede en la sección *Pagado por la Central con cargo a
la sede*. Sigue las mismas reglas: fijo, caja chica, o con la solicitud aprobada con "paga la Central".
Si supera el umbral, se tildan las retenciones y sale el comprobante de retención.

## Rendiciones recibidas

**Rendiciones recibidas**: arriba, qué sedes ya enviaron el mes anterior; abajo, la bandeja por sede y mes.
Al entrar a una:
- **Firma e integridad**: quién firmó y envió, el hash, y dos controles: que la foto guardada esté intacta y que
  los datos de la base todavía coincidan con lo firmado. Si alguien tocara un dato por fuera del sistema, aparece
  **NO COINCIDE**.
- Resumen, listado por rubro y detalle de cada gasto. **PDF** y **Excel**.
- **Reabrir**: si hay que corregir algo. Pide motivo, le avisa a la sede, y la versión enviada se guarda.

El cotejo comprobante por comprobante y la aprobación de la rendición llegan en la etapa siguiente.

## Auditoría

- **Registro**: todo lo que se hizo, por quién, cuándo, desde qué IP, con el antes y el después y el motivo.
- **Comprobantes repetidos**: cada intento rechazado de cargar un CAE o un número que ya existía.
- **Integridad y respaldos**: verificación de las cadenas de hash (auditoría y libro de movimientos) y las copias
  de seguridad diarias para bajar.

## Administración (superadmin)

- **Sedes y usuarios**: cada usuario pertenece a una sede. Al crearlo se muestra una contraseña temporal.
- **Rubros**: rubro → subrubro; marcar "gasto fijo" en los servicios. El rubro N/D siempre existe.
- **Parámetros**: topes de caja chica, umbral de retención y alerta de N/D, **con fecha de vigencia** (la inflación
  los mueve; lo cargado antes sigue con el valor de su fecha). Datos del Círculo (CUIT, domicilio).
- **Alícuotas**: por impuesto y régimen, con vigencia. **Las tiene que pasar el contador**: las de la demo son
  ficticias y dicen "DEMO".
- **Permisos**: la matriz de qué puede hacer cada rol, y las funciones opcionales (fotos; cierre anticipado).
