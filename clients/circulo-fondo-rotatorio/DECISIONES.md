# DECISIONES y puntos abiertos

Cada supuesto que tomamos para no frenar el desarrollo. Lo marcado **[A CONFIRMAR]** hay que validarlo con el
Círculo antes de salir a producción. Todo lo que es dato fiscal o de negocio quedó **parametrizable**: se cambia
desde *Administración*, sin tocar código.

## Técnicas

**D-01 · Stack: Express + SQLite en lugar de Next.js + Postgres.**
El prompt sugería Next.js 15 + PostgreSQL + Drizzle, "ajustable", y pedía reutilizar el sistema anterior si
existía. Existe (`clients/aeroclub-25-de-mayo`) y ya resuelve auth con roles, layout mobile-first, libro encadenado
con SHA-256, PDFs con pdfkit, respaldos y deploy en Coolify con un volumen. Reutilizarlo nos ahorra semanas y no
agrega dependencias de infraestructura (no hace falta un Postgres aparte). La escala lo permite: 8 sedes y unos
miles de comprobantes por mes son nada para SQLite. Si más adelante hace falta Postgres (p. ej. reportes pesados en
la Etapa 2), el acceso a datos está concentrado en `server/services/*` y la migración es acotada.

**D-02 · Plata en centavos enteros** (`INTEGER`, hasta 9×10¹⁶ centavos). Alícuotas en cienmilésimos
(2,5 % = 2500). Redondeo: half-up al centavo en cada retención.

**D-03 · Firma electrónica simple** = usuario + fecha/hora + SHA-256 del contenido canónico de la rendición
(JSON con claves ordenadas). No es firma digital con certificado.

**D-04 · Avisos dentro del sistema** (campana con contador). No mandamos mails en esta etapa; el modelo de
`notificaciones` permite sumar mail o WhatsApp después sin cambiar el resto.

**D-05 · Backups**: copia diaria completa de la base (`db.backup()`, consistente en caliente) en el volumen,
`/app/data/respaldos`, se conservan 30. Se bajan desde *Auditoría*. Conviene sacarlas además fuera del server.

**D-06 · Adjuntos**: el gasto se guarda primero y la foto sube después en segundo plano, con reintentos. Si no
sube, el gasto queda con "adjunto pendiente" y se puede reintentar desde el detalle. Driver `local` (volumen) por
defecto; `s3` para MinIO. Todo apagable con el flag `adjuntos`.

## De negocio (supuestos)

**N-01 · Pago directo de la Central [A CONFIRMAR].** No consume el fondo de la sede, pero **sí** es gasto de la
sede: se imputa a su rubro, aparece en su rendición en una sección aparte ("pagado por la Central con cargo a la
sede") y sale del saldo de la Central.

**N-02 · El pago directo de la Central sigue las mismas reglas que el de la sede.** Fijo, caja chica (≤ tope)
o con una solicitud aprobada con "paga la Central"; en ese caso queda vinculado a la solicitud y ésta pasa a
`ejecutada`. Así el circuito es uno solo y todo pago grande tiene detrás un pedido de la sede **[A CONFIRMAR]**
si la Central necesita pagar algo grande para una sede sin que la sede lo pida (se resolvería con una
"solicitud de oficio" creada por la Central).

**N-03 · Saldo sobrante a fin de mes [A CONFIRMAR].** Se arrastra: el saldo es continuo y la rendición muestra
saldo inicial (arrastre), fondo recibido, gastos y saldo final. Si el Círculo decide que la sede devuelve el
sobrante, se agrega un movimiento "reintegro a la Central".

**N-04 · El período de un gasto es el mes de la fecha de pago**, no el de la factura. Un comprobante de
septiembre pagado en octubre va a la rendición de octubre.

**N-05 · Los topes se comparan contra el importe bruto del comprobante** (antes de retenciones), según el medio
de pago. El tope vigente es el de la fecha de pago.

**N-06 · Gasto mayor que el monto estimado de la solicitud:** se advierte, no se bloquea. Una solicitud se
ejecuta con un solo gasto.

**N-07 · Retenciones y saldo.** Al pagar, se descuenta el **bruto** de la subcuenta: el neto va al proveedor y lo
retenido queda comprometido para depositarlo en ARCA. **[A CONFIRMAR]** quién deposita las retenciones (¿la
Central como agente?). Si lo deposita la Central, en la Etapa 2 se agrega el movimiento de transferencia del
retenido a la Central.

**N-08 · Usuario de carga y retenciones.** Un pago que supera el umbral de retención sólo lo puede registrar
quien tiene el permiso "Registrar retenciones" (Administrativo, Jefe, Central). El usuario de carga recibe un
mensaje claro. La matriz se puede cambiar.

**N-09 · Un certificado de retención por pago**, con todas las retenciones que se tildaron, y numeración
correlativa única del Círculo. **[A CONFIRMAR]** si necesitan numeración separada por impuesto.

**N-10 · Cierre de la rendición**: se puede cerrar desde el último día del mes (no antes). El superadmin puede
habilitar el cierre anticipado con el flag `cierre_anticipado` (útil para la demo).

**N-11 · Alta de proveedores**: según el relevamiento, sólo el Administrativo de sede y los roles de la Central.
El Jefe de sede no está incluido por defecto **[A CONFIRMAR]**; se habilita desde la matriz de permisos.

**N-12 · Asignar más de lo que tiene la Central**: se bloquea. La Central registra "ingresos" a su cuenta
(fondos que le llegan) desde *Asignar fondos*.

**N-13 · Corrección de gastos**: los datos descriptivos (rubro, descripción, datos del comprobante) se corrigen
con motivo y queda el antes/después. Lo que mueve plata (importe, medio, quién pagó) no se edita: se anula y se
vuelve a cargar.

**N-14 · CAE de un gasto anulado**: queda libre para volver a cargarlo bien (es la forma de corregir un error de
carga). El duplicado se controla contra los gastos vigentes.

## Puntos abiertos (parametrizables; no bloquean)

| Punto | Dónde se cambia | Valor de la demo |
|---|---|---|
| Alícuotas, mínimos y regímenes de cada retención | Administración → Alícuotas | **Valores de ejemplo, marcados "DEMO"**. No usar. |
| Topes de caja chica y umbral de retención | Administración → Parámetros (con vigencia) | $ 320.000 transferencia · $ 40.000 efectivo · $ 320.000 retención |
| Lista definitiva de rubros (desde Vicente López) | Administración → Rubros | Seed del relevamiento |
| CUIT del Círculo (receptor) | Administración → Datos del Círculo | Vacío: no se advierte hasta cargarlo |
| ¿El pago directo de la Central consume el fondo de la sede? | N-01 | No |
| Saldo sobrante a fin de mes | N-03 | Se arrastra |
| Nombres definitivos de las sedes | Administración → Sedes | Seed: 7 sedes + Central |
| Roles definitivos | Administración → Permisos | Los 6 del relevamiento |
| Umbral de alerta de N/D | Administración → Parámetros | 5 % del gastado |
| Quién deposita las retenciones en ARCA | N-07 | — |
