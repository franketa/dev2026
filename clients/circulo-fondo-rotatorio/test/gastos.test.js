const test = require('node:test');
const assert = require('node:assert/strict');
const { db, central, vl, cba, actores: a, cuit, rubro, ANTERIOR } = require('./ayuda');
const fondos = require('../server/services/fondos');
const libro = require('../server/services/libro');
const proveedores = require('../server/services/proveedores');
const gastos = require('../server/services/gastos');
const solicitudes = require('../server/services/solicitudes');
const admin = require('../server/services/admin');
const rendiciones = require('../server/services/rendiciones');

const $ = (pesos) => pesos * 100;
const F = (dia) => `${ANTERIOR}-${String(dia).padStart(2, '0')}`;
const rechaza = (fn, codigo) => assert.throws(fn, (e) => { assert.equal(e.codigo, codigo, e.message); return true; });

let edenor; let telecom; let ferreteria;
let cae = 70000000000000;
const nuevoCae = () => String(++cae);

function gasto(actor, datos) {
  return gastos.registrar(actor, {
    fecha_pago: F(10), proveedor_id: ferreteria.id, tipo_comprobante: 'factura_b', punto_venta: 3, numero: Math.floor(Math.random() * 9e7) + 1,
    cae: nuevoCae(), rubro_id: rubro('Edilicio'), medio: 'transferencia', ...datos
  });
}

test('saldo inicial de la Central y asignación del fondo mensual', () => {
  fondos.ingresoCentral(a.tesorero, { importe: $(800000000), fecha: F(1), saldo_inicial: true });
  assert.equal(libro.saldo(central.id), $(800000000));
  fondos.asignar(a.tesorero, { periodo: ANTERIOR, fecha: F(1), items: [{ sede_id: vl, importe: $(170000000) }, { sede_id: cba, importe: $(20000000) }] });
  assert.equal(libro.saldo(central.id), $(800000000 - 170000000 - 20000000));
  assert.deepEqual(libro.saldos(vl), { banco: $(170000000), efectivo: 0, total: $(170000000) });
  assert.throws(() => fondos.asignar(a.tesorero, { periodo: ANTERIOR, fecha: F(1), items: [{ sede_id: vl, importe: $(1) }] }), /ya tiene asignado/);
  assert.throws(() => fondos.asignar(a.jefe, { periodo: ANTERIOR, items: [{ sede_id: cba, importe: $(1) }] }), /permiso/);
  assert.throws(() => fondos.asignar(a.tesorero, { periodo: ANTERIOR, items: [{ sede_id: central.id, importe: $(1) }] }), /Sede Central no rinde/);
});

test('extracción: mueve plata de banco a efectivo', () => {
  fondos.moverEfectivo(a.administrativo, 'extraccion', { importe: $(200000), fecha: F(2) });
  assert.deepEqual(libro.saldos(vl), { banco: $(170000000 - 200000), efectivo: $(200000), total: $(170000000) });
  assert.throws(() => fondos.moverEfectivo(a.carga, 'extraccion', { importe: $(1) }), /permiso/);
  assert.throws(() => fondos.moverEfectivo(a.administrativo, 'extraccion', { importe: $(999999999) }), /No alcanza/);
});

test('proveedores: CUIT obligatorio y válido, base única sin duplicados', () => {
  rechaza(() => proveedores.alta(a.administrativo, { cuit: '30-12345678-0', razon_social: 'Truchos SA' }), 'CUIT_INVALIDO');
  edenor = proveedores.alta(a.administrativo, { cuit: cuit(65511620), razon_social: 'Edenor SA' }).proveedor;
  telecom = proveedores.alta(a.tesorero, { cuit: cuit(63945373), razon_social: 'Telecom Argentina SA' }).proveedor;
  ferreteria = proveedores.alta(a.administrativo, { cuit: cuit(27123456, '20'), razon_social: 'Ferretería El Tornillo' }).proveedor;
  // Mismo CUIT desde otra sede: no se duplica, se reutiliza.
  const otra = proveedores.alta(a.tesorero, { cuit: edenor.cuit, razon_social: 'EDENOR S.A.' });
  assert.equal(otra.existente, true);
  assert.equal(otra.proveedor.id, edenor.id);
  // Nombre parecido con otro CUIT: avisa antes de crear.
  rechaza(() => proveedores.alta(a.administrativo, { cuit: cuit(11222333), razon_social: 'Telecom Argentina' }), 'SIMILARES');
  // El usuario de carga no da de alta proveedores.
  assert.throws(() => proveedores.alta(a.carga, { cuit: cuit(44555666), razon_social: 'Otro' }), /administrativo/);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM proveedores').get().n, 3);
});

test('caja chica por transferencia: hasta $ 320.000 sin solicitud', () => {
  const r = gasto(a.carga, { bruto: $(320000) });
  assert.equal(r.tipo_gasto, 'caja_chica');
  rechaza(() => gasto(a.carga, { bruto: $(320000) + 1 }), 'NECESITA_SOLICITUD');
});

test('caja chica en efectivo: hasta $ 40.000 sin solicitud', () => {
  const r = gasto(a.carga, { bruto: $(40000), medio: 'efectivo' });
  assert.equal(r.tipo_gasto, 'caja_chica');
  rechaza(() => gasto(a.carga, { bruto: $(40000) + 1, medio: 'efectivo' }), 'NECESITA_SOLICITUD');
});

test('gasto fijo: no necesita solicitud aunque supere los topes', () => {
  const r = gasto(a.administrativo, { proveedor_id: edenor.id, rubro_id: rubro('Luz'), bruto: $(900000) });
  assert.equal(r.tipo_gasto, 'fijo');
  // Sobre el umbral de retención, el usuario de carga no puede registrar el pago.
  assert.throws(() => gasto(a.carga, { proveedor_id: edenor.id, rubro_id: rubro('Luz'), bruto: $(500000) }), /retenciones/);
});

test('no se puede pagar sin una solicitud aprobada', () => {
  const id = solicitudes.crear(a.jefe, { descripcion: 'Se rompió la bomba de la pileta', monto_estimado: $(400000) });
  rechaza(() => gasto(a.administrativo, { bruto: $(400000), solicitud_id: id, rubro_id: rubro('Pileta') }), 'SOLICITUD_NO_APROBADA');
  // El jefe no resuelve; la Central sí.
  assert.throws(() => solicitudes.resolver(a.jefe, id, { estado: 'aprobada', quien_paga: 'sede' }), /Central/);
  solicitudes.resolver(a.tesorero, id, { estado: 'aprobada', quien_paga: 'sede', comentario: 'OK' });
  const r = gasto(a.administrativo, { bruto: $(410000), solicitud_id: id, rubro_id: rubro('Pileta') });
  assert.equal(r.tipo_gasto, 'con_solicitud');
  assert.match(r.advertencias[0], /supera el monto estimado/);
  assert.equal(db.prepare('SELECT estado, gasto_id FROM solicitudes WHERE id = ?').get(id).estado, 'ejecutada');
  // Una solicitud se ejecuta una sola vez.
  assert.throws(() => gasto(a.administrativo, { bruto: $(1000), solicitud_id: id }), /ya se pagó/);
});

test('solicitud escalada: en revisión la resuelve el Presidente', () => {
  const id = solicitudes.crear(a.jefe, { descripcion: 'Tractor nuevo para el golf', monto_estimado: $(30000000) });
  solicitudes.resolver(a.tesorero, id, { estado: 'en_revision', comentario: 'Consultar con el Presidente' });
  solicitudes.resolver(a.presidente, id, { estado: 'rechazada', comentario: 'Este año no' });
  const h = db.prepare('SELECT de, a FROM solicitudes_historial WHERE solicitud_id = ? ORDER BY id').all(id);
  assert.deepEqual(h.map(x => x.a), ['pendiente', 'en_revision', 'rechazada']);
  assert.throws(() => solicitudes.resolver(a.tesorero, id, { estado: 'aprobada', quien_paga: 'sede' }), /ya está rechazada/);
});

test('CAE duplicado: se rechaza, queda el intento y se avisa a la sede', () => {
  const caeRep = nuevoCae();
  const primero = gasto(a.carga, { bruto: $(15000), cae: caeRep });
  const intentosAntes = db.prepare('SELECT COUNT(*) n FROM intentos_duplicado').get().n;
  rechaza(() => gasto(a.carga, { bruto: $(15000), cae: caeRep }), 'DUPLICADO');
  const intento = db.prepare('SELECT * FROM intentos_duplicado ORDER BY id DESC LIMIT 1').get();
  assert.equal(db.prepare('SELECT COUNT(*) n FROM intentos_duplicado').get().n, intentosAntes + 1);
  assert.equal(intento.clave, 'cae');
  assert.equal(intento.usuario_id, a.carga.id);
  assert.equal(intento.gasto_existente_id, primero.id);
  assert.ok(db.prepare(`SELECT 1 FROM auditoria WHERE accion = 'gasto.duplicado_rechazado' AND entidad_id = ?`).get(intento.id));
  assert.ok(db.prepare(`SELECT 1 FROM notificaciones WHERE usuario_id = ? AND texto LIKE '%repetido%'`).get(a.jefe.id));
  // Desde otra sede también choca: el CAE es único en todo el sistema.
  rechaza(() => gastos.registrar(a.jefeCba, { fecha_pago: F(11), proveedor_id: ferreteria.id, tipo_comprobante: 'factura_b', punto_venta: 9, numero: 9, cae: caeRep, rubro_id: rubro('Edilicio'), medio: 'transferencia', bruto: $(15000) }), 'DUPLICADO');
  // Clave secundaria: mismo proveedor, tipo, punto de venta y número, sin CAE.
  gasto(a.carga, { bruto: $(1000), cae: null, punto_venta: 77, numero: 1234 });
  rechaza(() => gasto(a.carga, { bruto: $(1000), cae: null, punto_venta: 77, numero: 1234 }), 'DUPLICADO');
  // Anulado, el CAE queda libre para cargarlo bien.
  gastos.anular(a.administrativo, primero.id, 'Se cargó con el rubro equivocado');
  assert.equal(gasto(a.carga, { bruto: $(15000), cae: caeRep }).tipo_gasto, 'caja_chica');
});

test('comprobante sin CAE se acepta y queda marcado', () => {
  const r = gasto(a.carga, { tipo_comprobante: 'recibo', punto_venta: null, numero: null, cae: '', bruto: $(5000), medio: 'efectivo' });
  const d = gastos.detalle(a.carga, r.id).gasto;
  assert.equal(d.sin_cae, true);
});

test('descuentos de saldo: banco, efectivo y anulación', () => {
  const antes = libro.saldos(vl);
  const t = gasto(a.carga, { bruto: $(100000) });
  const e = gasto(a.carga, { bruto: $(30000), medio: 'efectivo' });
  const despues = libro.saldos(vl);
  assert.equal(despues.banco, antes.banco - $(100000));
  assert.equal(despues.efectivo, antes.efectivo - $(30000));
  gastos.anular(a.jefe, t.id, 'Pago duplicado por error');
  assert.equal(libro.saldos(vl).banco, antes.banco);
  assert.throws(() => gastos.anular(a.jefe, e.id, ''), /motivo/);
  // No se paga más efectivo del que hay registrado.
  const efectivo = libro.saldo(vl, 'efectivo');
  rechaza(() => gasto(a.carga, { bruto: efectivo + 100, medio: 'efectivo' }), efectivo + 100 > $(40000) ? 'NECESITA_SOLICITUD' : 'SALDO_INSUFICIENTE');
});

test('pago directo de la Central con cargo a la sede', () => {
  const id = solicitudes.crear(a.jefe, { descripcion: 'Colchones para el hotel', monto_estimado: $(2500000), rubro_id: rubro('Blanquería') });
  solicitudes.resolver(a.tesorero, id, { estado: 'aprobada', quien_paga: 'central' });
  // La sede no puede pagarla con su fondo.
  assert.throws(() => gasto(a.administrativo, { bruto: $(2500000), solicitud_id: id }), /la paga la Sede Central/);
  const saldoSede = libro.saldos(vl);
  const saldoCentral = libro.saldo(central.id);
  const r = gastos.registrar(a.tesorero, {
    pagado_por: 'central', sede_id: vl, solicitud_id: id, fecha_pago: F(15), proveedor_id: ferreteria.id, tipo_comprobante: 'factura_a',
    punto_venta: 5, numero: 555, cae: nuevoCae(), rubro_id: rubro('Blanquería'), bruto: $(2500000)
  });
  assert.deepEqual(libro.saldos(vl), saldoSede, 'no consume el fondo de la sede');
  assert.equal(libro.saldo(central.id), saldoCentral - $(2500000), 'sale del saldo de la Central');
  const g = gastos.detalle(a.jefe, r.id).gasto;
  assert.equal(g.sede_id, vl);
  assert.equal(g.pagado_por, 'central');
  assert.equal(g.solicitud_id, id);
  const c = rendiciones.armarContenido(vl, ANTERIOR);
  assert.equal(c.resumen.pagado_central, $(2500000));
  assert.ok(c.pagado_por_central[0].subrubros[0].gastos.some(x => x.id === r.id));
  // Una sede no registra pagos de la Central.
  assert.throws(() => gastos.registrar(a.jefe, { pagado_por: 'central', sede_id: vl }), /Sede Central/);
});

test('retenciones: bruto − retenciones = neto y comprobante correlativo', () => {
  const gan = admin.guardarAlicuota(a.superadmin, null, { impuesto: 'ganancias', regimen: 'Prueba ganancias', alicuota: 2000, vigente_desde: '2026-01-01' });
  const iibb = admin.guardarAlicuota(a.superadmin, null, { impuesto: 'iibb', regimen: 'Prueba IIBB', jurisdiccion: 'Buenos Aires', alicuota: 3000, vigente_desde: '2026-01-01' });
  const r = gastos.registrar(a.administrativo, {
    fecha_pago: F(20), proveedor_id: telecom.id, tipo_comprobante: 'factura_a', punto_venta: 1, numero: 4321, cae: nuevoCae(),
    rubro_id: rubro('Internet'), medio: 'transferencia', bruto: $(1000000),
    retenciones: [{ impuesto: 'ganancias', alicuota_id: gan }, { impuesto: 'iibb', alicuota_id: iibb, base: $(800000) }]
  });
  const d = gastos.detalle(a.administrativo, r.id);
  assert.equal(d.gasto.retenciones, $(20000) + $(24000));
  assert.equal(d.gasto.neto, $(1000000) - $(44000));
  assert.equal(d.retenciones.find(x => x.impuesto === 'iibb').jurisdiccion, 'Buenos Aires');
  assert.ok(d.retenciones.every(x => x.tildado_por === a.administrativo.id), 'queda quién tildó');
  const c1 = db.prepare('SELECT numero FROM certificados_retencion WHERE gasto_id = ?').get(r.id).numero;
  const r2 = gastos.registrar(a.administrativo, {
    fecha_pago: F(21), proveedor_id: telecom.id, tipo_comprobante: 'factura_a', punto_venta: 1, numero: 4322, cae: nuevoCae(),
    rubro_id: rubro('Internet'), medio: 'transferencia', bruto: $(400000), retenciones: [{ impuesto: 'ganancias', alicuota_id: gan }]
  });
  assert.equal(db.prepare('SELECT numero FROM certificados_retencion WHERE gasto_id = ?').get(r2.id).numero, c1 + 1);
  // Debajo del umbral no van retenciones.
  assert.throws(() => gasto(a.administrativo, { bruto: $(100000), retenciones: [{ impuesto: 'ganancias', alicuota_id: gan }] }), /más de/);
  // El saldo baja por el bruto (lo retenido queda comprometido para ARCA).
});

test('alcance: una sede no ve los gastos de otra', () => {
  const id = db.prepare('SELECT id FROM gastos WHERE sede_id = ? LIMIT 1').get(vl).id;
  assert.throws(() => gastos.detalle(a.jefeCba, id), /otra sede/);
  assert.ok(gastos.listar(a.jefeCba, { sede_id: vl }).every(g => g.sede_id === cba));
  assert.ok(gastos.detalle(a.presidente, id));
});

test('fondos extra: los autoriza el Presidente y salen de la Central', () => {
  const id = fondos.pedirExtra(a.jefe, { importe: $(2000000), justificacion: 'Temporada alta en el hotel' });
  const p = fondos.listarPedidos({ estado: 'pendiente' })[0];
  assert.equal(p.saldo_banco, libro.saldo(vl, 'banco'), 'muestra cuánto le queda al pedir');
  assert.throws(() => fondos.resolverExtra(a.tesorero, id, { autorizar: true }), /Presidente/);
  const sedeAntes = libro.saldo(vl, 'banco');
  const centralAntes = libro.saldo(central.id);
  fondos.resolverExtra(a.presidente, id, { autorizar: true, comentario: 'Autorizado' });
  assert.equal(libro.saldo(vl, 'banco'), sedeAntes + $(2000000));
  assert.equal(libro.saldo(central.id), centralAntes - $(2000000));
  assert.throws(() => fondos.resolverExtra(a.presidente, id, { autorizar: false, comentario: 'x' }), /ya fue resuelto/);
});

test('corrección de un gasto: con motivo y con el antes y el después', () => {
  const r = gasto(a.carga, { bruto: $(20000), rubro_id: rubro('N/D – sin descripción') });
  assert.throws(() => gastos.corregir(a.administrativo, r.id, { rubro_id: rubro('Limpieza') }), /motivo/);
  gastos.corregir(a.administrativo, r.id, { rubro_id: rubro('Limpieza'), motivo: 'Era limpieza' });
  const aud = db.prepare(`SELECT * FROM auditoria WHERE accion = 'gasto.correccion' AND entidad_id = ?`).get(r.id);
  assert.equal(JSON.parse(aud.antes).rubro_id, rubro('N/D – sin descripción'));
  assert.equal(JSON.parse(aud.despues).rubro_id, rubro('Limpieza'));
  assert.equal(aud.motivo, 'Era limpieza');
  // Pasar un gasto fijo grande a un rubro no fijo lo dejaría sin solicitud: no se permite.
  const fijo = gasto(a.administrativo, { proveedor_id: edenor.id, rubro_id: rubro('Gas'), bruto: $(600000) });
  assert.throws(() => gastos.corregir(a.administrativo, fijo.id, { rubro_id: rubro('Edilicio'), motivo: 'x' }), /solicitud/);
});

test('nada se borra físicamente', () => {
  assert.throws(() => db.prepare('DELETE FROM gastos').run(), /no se borran/);
  assert.throws(() => db.prepare('DELETE FROM movimientos').run(), /inmutable/);
  assert.throws(() => db.prepare('UPDATE movimientos SET importe = 1').run(), /inmutable/);
  assert.throws(() => db.prepare('DELETE FROM auditoria').run(), /inmutable/);
});
