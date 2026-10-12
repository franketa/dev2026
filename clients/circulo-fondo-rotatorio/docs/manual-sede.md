# Manual de uso · Sedes

*Borrador para la demo. Fondo rotatorio · Círculo de Oficiales de la Fuerza Aérea Argentina.*

El sistema reemplaza las planillas sueltas: cada peso que la Sede Central le adelanta a la sede queda registrado,
y cada gasto se descuenta del saldo con su comprobante. Funciona en el celular y en la computadora.

## Quién hace qué

| Rol | Puede |
|---|---|
| **Usuario de carga** | Cargar gastos de caja chica y fijos de hasta $ 320.000. No da de alta proveedores. |
| **Administrativo** | Todo lo anterior, más dar de alta proveedores, registrar pagos con retenciones, sacar efectivo y corregir o anular gastos. |
| **Jefe de sede** | Todo lo del administrativo, más pedir aprobación de gastos, pedir fondos extra y **cerrar, firmar y enviar la rendición**. |

## Entrar

Desde el navegador, con tu email y la contraseña que te dieron. La primera vez el sistema te pide cambiarla.
Si te la olvidás, pedile a la Sede Central que la blanquee. La sesión dura una jornada.

## La pantalla de inicio

Arriba está el **saldo de la sede**: el total y cuánto hay en el **banco** y en **efectivo**. Abajo, el fondo
del mes, lo gastado y los avisos (por ejemplo, si quedó sin cerrar la rendición del mes anterior). La campanita
muestra los avisos nuevos: solicitudes aprobadas o rechazadas, fondos que llegaron, comprobantes rechazados.

## Cargar un gasto (menos de un minuto)

Botón **Cargar** (el círculo azul de abajo, en el celular).

1. **¿A quién le pagaste?** Escribí el nombre o el CUIT y tocá el proveedor. Si no está, el administrativo o el jefe lo da
   de alta ahí mismo con el CUIT: el sistema controla que el número sea válido y que no exista ya.
2. **¿Cuánto y cómo?** El importe total del comprobante y si se pagó por **transferencia** o en **efectivo**.
3. **¿Qué se pagó?** El rubro. Apenas lo elegís, el sistema te dice qué tipo de gasto es:
   - **Gasto fijo** (luz, gas, agua, internet, telefonía): se paga sin solicitud, aunque sea mucha plata.
   - **Caja chica**: hasta **$ 320.000 por transferencia** o **$ 40.000 en efectivo**. Se paga directo.
   - **Necesita una solicitud aprobada**: si supera esos topes. Si ya la aprobó la Central, elegila en la lista;
     si no, no se puede guardar: primero hay que pedir aprobación.
4. **Comprobante**: tipo, punto de venta, número y **CAE** (los 14 números que están abajo en la factura).
   Si el comprobante no tiene CAE (un ticket, un recibo), dejalo vacío: se acepta y queda marcado "sin CAE".
5. **Retenciones** (sólo en pagos de más de $ 320.000): tildá los impuestos que corresponde retener. El sistema
   calcula el **neto a transferir** y arma el **comprobante de retención** en PDF para entregar al proveedor.
6. **Foto** (opcional): sacale una foto al comprobante. Se achica sola y sube después de guardar; si no hay señal,
   el gasto se guarda igual y la foto queda "pendiente" (se puede subir después desde el gasto).

Tocá **Guardar gasto**. El importe se descuenta del banco o del efectivo según cómo se pagó.

> **Rubro N/D – sin descripción**: existe para lo que de verdad no se sabe qué es, pero no puede ser la regla.
> Si los N/D pasan del 5 % de lo gastado, el sistema avisa a la sede y a la Central.

### Si el sistema rechaza el comprobante

"Este comprobante ya está cargado": alguien (de esta u otra sede) ya cargó ese CAE o ese número. No se registra
de nuevo y **queda constancia del intento** (quién, cuándo y qué comprobante chocó). Tocá "Ver el gasto cargado"
para revisarlo.

### Corregir o anular

Desde **Gastos**, entrá al gasto:
- **Corregir**: rubro, datos del comprobante o detalle. Pide un motivo y guarda lo que había antes.
- **Anular**: devuelve la plata a la cuenta con un contraasiento. El gasto no desaparece: queda tachado, con el
  motivo. Para cambiar el importe, el medio o quién pagó, se anula y se carga de nuevo.

Ninguna corrección es silenciosa: todo queda en el historial del gasto y en la auditoría.

## Sacar efectivo

El fondo llega siempre por transferencia. Para tener caja chica: **Inicio → Sacar efectivo** (o **Fondos**).
La plata pasa del banco al efectivo. Si sobra efectivo, **Depositar** la devuelve al banco.

## Pedir aprobación de un gasto (jefe de sede)

**Solicitudes → Nueva solicitud**: qué hay que pagar y por qué, el monto estimado, el proveedor si ya lo tenés y,
si querés, la foto del presupuesto. Ejemplo: *"Se rompió la bomba de la pileta, sale $ 400.000"*.

La Central la ve en su panel del día y la **aprueba**, la **rechaza** o la **pasa a revisión** (cuando lo consulta
con el Presidente). Te llega un aviso. Al aprobar define quién paga:
- **La sede**, con su fondo → aparece el botón **Cargar el pago** en la solicitud.
- **La Central, directo al proveedor** → no sale del fondo de la sede, pero el gasto figura en la rendición de la
  sede, en una sección aparte.

## Pedir fondos extra (jefe de sede)

**Inicio → Pedir fondos extra**: cuánto y para qué. El Presidente ve el pedido junto con el saldo que todavía le
queda a la sede, y lo autoriza o lo rechaza. Si lo autoriza, la plata se suma al fondo.

## Cerrar, firmar y enviar la rendición (jefe de sede)

A fin de mes, **Rendición**:

1. Revisá el resumen: fondo recibido (con los extras), total gastado, saldo en banco y en efectivo, cuántos gastos
   hay, cuántos sin CAE, cuántos N/D y cuántos con foto pendiente. Abajo está el listado por rubro tal como va a
   quedar.
2. **Cerrar y firmar**: tildá la confirmación y firmá. Queda tu usuario, la fecha y hora y una huella (hash) del
   contenido. **Desde ese momento el mes queda bloqueado**: nadie puede cargar ni corregir nada de ese mes.
3. **Enviar a la Sede Central**. La rendición aparece en la bandeja de la Central.
4. Bajá el **PDF para imprimir**, firmalo de puño y letra y mandalo con los papeles físicos, como siempre.
   También está en **Excel**.

¿Te olvidaste de algo después de cerrar? Sólo la Central puede **reabrir** el período (con motivo). Corregís,
volvés a cerrar y a enviar, y queda una versión nueva; la anterior se guarda.
