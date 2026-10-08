// Tests de servicios, tickets de rampa, derecho de aeronave, pagos informados, copias y roles.
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const os = require('os');
const fs = require('fs');
const path = require('path');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'a25-serv-'));
process.env.DATA_DIR = dir;
process.env.DB_PATH = path.join(dir, 'test.sqlite');
process.env.ADMIN_PASSWORD = 'admin-test-123';

const bcrypt = require('bcryptjs');
const { db } = require('../server/db');
const util = require('../server/util');
const flota = require('../server/services/flota');
const vuelos = require('../server/services/vuelos');
const cierres = require('../server/services/cierres');
const ledger = require('../server/services/ledger');
const servicios = require('../server/services/servicios');
const tickets = require('../server/services/tickets');
const correcciones = require('../server/services/correcciones');
const pagosInformados = require('../server/services/pagosInformados');
const respaldos = require('../server/services/respaldos');
const { generarTicket } = require('../server/services/pdf');

// Horario del vuelo (obligatorio): sale a las 10 y vuelve justo a las horas pedidas, así la tabla del club da esas décimas.
const H = (horas) => {
  const m = 600 + Math.round(Number(horas.replace(',', '.')) * 60);
  return { horas, hora_salida: '10:00', hora_llegada: `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}` };
};
const admin = { id: 1, rol: 'admin' };
const HASH = bcrypt.hashSync('clave-1234', 4);

function usuario(nombre, rol = 'piloto') {
  const r = db.prepare(`INSERT INTO usuarios (nombre, apellido, email, rol, password_hash, debe_cambiar_password) VALUES (?, 'Test', ?, ?, ?, 0)`)
    .run(nombre, `${nombre.toLowerCase()}@test.com`, rol, HASH);
  return { id: Number(r.lastInsertRowid), rol, nombre };
}
const servicio = (nombre) => db.prepare('SELECT * FROM servicios WHERE nombre = ?').get(nombre);

const INICIO = util.sumarMeses(util.periodoActual(), -2);   // dos meses atrás: se pueden cerrar
const MES2 = util.sumarMeses(INICIO, 1);
let ana, beto, rampa, consulta;

test('tabla de servicios inicial, sin precio', () => {
  const lista = servicios.listar();
  assert.deepEqual(lista.map(s => s.nombre), ['Hangaraje mensual', 'Hangaraje diario', 'Combustible', 'Nocturno', 'Derecho de aeronave', 'Derecho de examen', 'Hora de simulador', 'Limpieza de avión']);
  assert.equal(servicio('Hangaraje diario').unidad, 'dia');
  assert.ok(lista.every(s => s.precio === 0));
  assert.equal(servicios.derechoAeronave(), null);          // sin precio no se cobra
});

test('preparación: tarifas, precios de servicios y usuarios', () => {
  db.prepare(`UPDATE config SET valor = ? WHERE clave = 'periodo_inicio'`).run(INICIO);
  flota.nuevaTarifa(1, { tipo: 'solo', precio_hora: 10000000, vigente_desde: '2020-01-01' }, admin);
  flota.nuevaTarifa(2, { tipo: 'solo', precio_hora: 8000000, vigente_desde: '2020-01-01' }, admin);
  const precios = { 'Hangaraje mensual': 5000000, 'Hangaraje diario': 400000, Combustible: 250000, 'Derecho de aeronave': 1500000, 'Derecho de examen': 3000000, 'Limpieza de avión': 2000000 };
  for (const [nombre, precio] of Object.entries(precios)) {
    const s = servicio(nombre);
    servicios.guardar({ nombre, unidad: s.unidad, precio }, admin, s.id);
  }
  assert.equal(servicios.derechoAeronave().precio, 1500000);
  ana = usuario('Ana');
  beto = usuario('Beto');
  rampa = usuario('Rampa', 'rampa');
  consulta = usuario('Consulta', 'consulta');
});

test('utilidades de cantidades', () => {
  assert.equal(util.parseCantidad('40,5'), 4050);
  assert.equal(util.parseCantidad('1'), 100);
  assert.equal(util.parseCantidad('0,25'), 25);
  assert.equal(util.parseCantidad('1,255'), null);
  assert.equal(util.parseCantidad('-1'), null);
  assert.equal(util.fmtCantidad(4050, 'litro'), '40,5 litros');
  assert.equal(util.fmtCantidad(100, 'mes'), '1 mes');
  assert.equal(util.fmtCantidad(300, 'noche'), '3 noches');
  assert.equal(servicio('Nocturno').unidad, 'noche');
  assert.equal(util.importeItem(250000, 4050), 10125000);   // 40,5 L × $2.500
});

let externo, aeronave;

test('rampa registra una aeronave de un externo y le arma un ticket (externos pagan en el acto)', () => {
  aeronave = tickets.guardarAeronave({ matricula: 'lv-zzz', modelo: 'Piper PA-18', externo: { nombre: 'Agroaérea del Sur SA', telefono: '2345 409999', dni: '30-12345678-9' } }, rampa);
  externo = aeronave.propietario_id;
  assert.equal(aeronave.matricula, 'LV-ZZZ');
  assert.equal(db.prepare('SELECT rol FROM usuarios WHERE id = ?').get(externo).rol, 'externo');
  assert.throws(() => tickets.guardarAeronave({ matricula: 'LV-ZZZ', propietario_id: ana.id }, rampa), /ya está registrada/);
  assert.throws(() => tickets.guardarAeronave({ matricula: 'LV-APH', propietario_id: ana.id }, rampa), /flota del club/);

  const hang = servicio('Hangaraje mensual');
  const comb = servicio('Combustible');
  const items = [{ servicio_id: hang.id, cantidad: '1', precio: '1' }, { servicio_id: comb.id, cantidad: '40,5' }];
  // Rampa no carga "otros conceptos" ni servicios sin precio, ni cambia precios.
  assert.throws(() => tickets.crear({ aeronave_id: aeronave.id, items: [{ concepto: 'Propina', precio: '1000' }], cobrado: true, medio: 'efectivo' }, rampa), /servicio de la lista/);
  assert.throws(() => tickets.crear({ aeronave_id: aeronave.id, items: [{ servicio_id: servicio('Nocturno').id }], cobrado: true, medio: 'efectivo' }, rampa), /no tiene precio/);
  assert.throws(() => tickets.crear({ items: [{ servicio_id: hang.id }] }, rampa), /matrícula/);
  // A un externo no se le fía, y el cheque ya no es un medio de pago.
  assert.throws(() => tickets.crear({ aeronave_id: aeronave.id, items }, rampa), /se cobran en el momento/);
  assert.throws(() => tickets.crear({ aeronave_id: aeronave.id, items, cobrado: true, medio: 'cheque' }, rampa), /cómo pagó/);

  const t = tickets.crear({ aeronave_id: aeronave.id, fecha: util.hoy(), items, cobrado: true, medio: 'transferencia' }, rampa);
  assert.equal(t.usuario_id, externo);                                  // va a la cuenta del dueño
  assert.equal(t.items[0].precio, 5000000);                             // rampa no cambia el precio
  assert.equal(t.total, 5000000 + 10125000);
  assert.equal(t.numero_txt, 'T-00001');
  // Lo que cobra rampa queda en pagos informados: no toca la cuenta hasta que tesorería lo confirma.
  assert.equal(t.pago_movimiento_id, null);
  assert.equal(t.cobrado_en_acto, 1);
  assert.equal(t.pago_informado_estado, 'pendiente');
  assert.equal(ledger.saldo(externo), 15125000);
  const informado = pagosInformados.get(t.pago_informado_id);
  assert.equal(informado.usuario_id, externo);
  assert.equal(informado.importe, t.total);
  assert.equal(informado.medio, 'transferencia');
  assert.equal(informado.cobrado_por_nombre, 'Rampa Test');
  assert.match(informado.nota, /rampa en el ticket T-00001/);
  pagosInformados.confirmar(informado.id, {}, admin);
  assert.equal(ledger.saldo(externo), 0);                               // confirmado: cargo y pago
  const confirmado = tickets.detalle(t.id);
  assert.ok(confirmado.pago_movimiento_id);
  assert.equal(confirmado.pago_medio, 'transferencia');
  assert.match(db.prepare('SELECT concepto FROM movimientos WHERE id = ?').get(confirmado.pago_movimiento_id).concepto, /ticket T-00001 por transferencia \(cobrado por rampa: Rampa Test\)/);
  const mov = db.prepare('SELECT * FROM movimientos WHERE id = ?').get(t.movimiento_id);
  assert.equal(mov.tipo, 'servicio');
  assert.match(mov.concepto, /T-00001 \(LV-ZZZ\): Hangaraje mensual, Combustible 40,5 litros/);

  const limpieza = tickets.crear({ aeronave_id: aeronave.id, items: [{ servicio_id: servicio('Limpieza de avión').id }], cobrado: true, medio: 'efectivo' }, rampa);
  assert.equal(ledger.saldo(externo), 2000000);
  pagosInformados.confirmar(limpieza.pago_informado_id, {}, admin);
  assert.equal(ledger.saldo(externo), 0);
});

test('si tesorería rechaza lo que cobró rampa, el cargo queda en la cuenta; si se anula el ticket, el cobro se descarta', () => {
  const items = [{ servicio_id: servicio('Limpieza de avión').id }];
  const t1 = tickets.crear({ aeronave_id: aeronave.id, items, cobrado: true, medio: 'efectivo' }, rampa);
  pagosInformados.rechazar(t1.pago_informado_id, 'No llegó la plata a la caja', admin);
  assert.equal(tickets.detalle(t1.id).cobrado_en_acto, 0);
  assert.equal(ledger.saldo(externo), 2000000);
  tickets.anular(t1.id, 'Prueba', admin);
  assert.equal(ledger.saldo(externo), 0);

  const t2 = tickets.crear({ aeronave_id: aeronave.id, items, cobrado: true, medio: 'efectivo' }, rampa);
  const a = tickets.anular(t2.id, 'Se cargó dos veces', admin);
  assert.equal(a.cobrado_en_acto, 0);
  const p = pagosInformados.get(t2.pago_informado_id);
  assert.equal(p.estado, 'rechazado');
  assert.match(p.motivo_rechazo, /Ticket anulado: Se cargó dos veces/);
  assert.equal(ledger.saldo(externo), 0);
  // Lo que cobra tesorería en el acto entra directo, sin revisión.
  const t3 = tickets.crear({ aeronave_id: aeronave.id, items, cobrado: true, medio: 'efectivo' }, admin);
  assert.ok(t3.pago_movimiento_id);
  assert.equal(t3.pago_informado_id, null);
  assert.equal(ledger.saldo(externo), 0);
  tickets.anular(t3.id, 'Prueba', admin);
});

test('tránsitos: matrícula y piloto al mando, sin asociarlo a un socio', () => {
  const { cuentaTransitos } = require('../server/db');
  const transitos = cuentaTransitos();
  const paso = tickets.guardarAeronave({ matricula: 'LV-PAS', modelo: 'Cessna 172' }, rampa);
  assert.equal(paso.propietario_id, transitos);                          // sin dueño: queda en tránsitos
  const items = [{ servicio_id: servicio('Hangaraje diario').id, cantidad: '2' }];
  assert.throws(() => tickets.crear({ aeronave_id: paso.id, items, cobrado: true, medio: 'efectivo' }, rampa), /piloto al mando/);
  const t = tickets.crear({ aeronave_id: paso.id, piloto: 'Juan Gómez', items, cobrado: true, medio: 'efectivo' }, rampa);
  assert.equal(t.piloto, 'Juan Gómez');
  assert.equal(t.total, 800000);                                          // 2 días × $4.000
  assert.match(db.prepare('SELECT concepto FROM movimientos WHERE id = ?').get(t.movimiento_id).concepto, /LV-PAS, piloto Juan Gómez\): Hangaraje diario 2 días/);
  assert.equal(ledger.saldo(transitos), 800000);                          // hasta que tesorería confirme el cobro
  pagosInformados.confirmar(t.pago_informado_id, {}, admin);
  assert.equal(ledger.saldo(transitos), 0);
  assert.equal(tickets.listar({ creado_por: rampa.id }).find(x => x.id === t.id).piloto, 'Juan Gómez');
});

test('a un socio se le puede dejar a cuenta, y tesorería elige un avión de la flota', () => {
  const carla = usuario('Carla');
  const propia = tickets.guardarAeronave({ matricula: 'LV-CAR', propietario_id: carla.id }, rampa);
  const t = tickets.crear({ aeronave_id: propia.id, items: [{ servicio_id: servicio('Hangaraje mensual').id }] }, rampa);
  assert.equal(t.pago_movimiento_id, null);
  assert.equal(ledger.saldo(carla.id), 5000000);
  // Un avión de la flota no tiene dueño: hay que elegir la cuenta.
  assert.throws(() => tickets.crear({ avion_id: 1, items: [{ servicio_id: servicio('Limpieza de avión').id }] }, admin), /a nombre de quién/);
  const f = tickets.crear({ avion_id: 1, usuario_id: carla.id, items: [{ servicio_id: servicio('Limpieza de avión').id }] }, admin);
  assert.equal(f.matricula, 'LV-APH');
  assert.equal(f.aeronave_id, null);
  // Se deja en cero para no alterar las cuentas de los tests siguientes.
  tickets.anular(t.id, 'prueba', admin);
  tickets.anular(f.id, 'prueba', admin);
});

test('tesorería agrega otros conceptos al ticket de un alumno', () => {
  const t = tickets.crear({
    usuario_id: ana.id, fecha: util.hoy(),
    items: [{ servicio_id: servicio('Derecho de examen').id }, { concepto: 'Libro de vuelo', precio: '12.000' }]
  }, admin);
  assert.equal(t.origen, 'tesoreria');
  assert.equal(t.total, 3000000 + 1200000);
  assert.equal(ledger.saldo(ana.id), 4200000);
});

test('un ticket se corrige anulándolo, no editando su movimiento', () => {
  const t = tickets.crear({ usuario_id: beto.id, items: [{ concepto: 'Error', precio: '100' }] }, admin);
  assert.throws(() => correcciones.editar(t.movimiento_id, { importe: '50', motivo: 'x' }, admin), /anulá el ticket/);
  assert.throws(() => correcciones.borrar(t.movimiento_id, 'x', admin), /anulá el ticket/);
  assert.throws(() => tickets.anular(t.id, '', admin), /por qué/);
  const anulado = tickets.anular(t.id, 'Cargado por error', admin);
  assert.equal(anulado.estado, 'anulado');
  assert.equal(ledger.saldo(beto.id), 0);
  assert.throws(() => tickets.anular(t.id, 'otra vez', admin), /ya está anulado/);
  // Tampoco se puede borrar la anulación (volvería el cargo con el ticket anulado).
  const contra = db.prepare('SELECT id FROM movimientos WHERE anula_id = ?').get(t.movimiento_id);
  assert.throws(() => correcciones.borrar(contra.id, 'x', admin), /anulá el ticket/);
  assert.equal(ledger.verificarCadena().ok, true);
});

test('al anular un ticket cobrado en el acto se anula también el pago', () => {
  const { cuentaTransitos } = require('../server/db');
  const items = [{ concepto: 'Prueba', precio: '1000' }];
  const pagoAnulado = (t) => !!db.prepare('SELECT 1 FROM movimientos WHERE anula_id = ?').get(t.pago_movimiento_id);

  // Por defecto el pago se anula: la cuenta queda en cero y deja de contar como cobrado.
  const dani = usuario('Dani');
  const t1 = tickets.crear({ usuario_id: dani.id, items, cobrado: true, medio: 'efectivo' }, admin);
  tickets.anular(t1.id, 'Se devolvió', admin);
  assert.ok(pagoAnulado(t1));
  assert.equal(ledger.saldo(dani.id), 0);

  // A un socio se le puede dejar como saldo a favor.
  const t2 = tickets.crear({ usuario_id: dani.id, items, cobrado: true, medio: 'efectivo' }, admin);
  tickets.anular(t2.id, 'Lo rehacemos a cuenta', admin, { mantenerPago: true });
  assert.equal(pagoAnulado(t2), false);
  assert.equal(ledger.saldo(dani.id), -100000);

  // A tránsitos (y externos) no: el pago se anula aunque se pida dejarlo.
  const t3 = tickets.crear({ usuario_id: cuentaTransitos(), piloto: 'Juan Gómez', avion_id: 1, items, cobrado: true, medio: 'efectivo' }, admin);
  tickets.anular(t3.id, 'Cargado dos veces', admin, { mantenerPago: true });
  assert.ok(pagoAnulado(t3));
  assert.equal(ledger.saldo(cuentaTransitos()), 0);
  assert.equal(ledger.verificarCadena().ok, true);
});

test('derecho de aeronave: una vez por mes por piloto que voló', () => {
  // Ana vuela los dos aviones en INICIO; Beto vuela en MES2. Tesorería carga porque son vuelos viejos.
  const volar = (p, avion, fecha) => vuelos.crear({ ...H('1'), piloto_id: p.id, avion_id: avion, fecha }, admin);
  volar(ana, 1, `${INICIO}-03`);
  volar(ana, 2, `${INICIO}-10`);
  volar(ana, 1, `${INICIO}-20`);

  const r = cierres.cerrar(INICIO, admin);
  const cupAna = r.cupones.find(c => c.usuario_id === ana.id);
  assert.equal(cupAna.total_vuelos, 10000000 * 2 + 8000000);
  // Servicios del mes: el derecho (15.000) + el ticket de tesorería (42.000), que es del mes actual pero
  // entró al libro antes del cierre: los cupones toman los movimientos por orden de carga.
  assert.equal(cupAna.total_servicios, 1500000 + 4200000);
  assert.equal(db.prepare(`SELECT COUNT(*) n FROM derechos_aeronave WHERE usuario_id = ?`).get(ana.id).n, 1);
  // El externo también recibe su cupón con los tickets de rampa, en cero porque pagó en el acto.
  const cupExt = r.cupones.find(c => c.usuario_id === externo);
  assert.equal(cupExt.total_servicios, 5000000 + 10125000 + 2000000);
  assert.equal(cupExt.total, 0);
  // La cuenta de tránsitos no recibe cupón (todo se cobró en el acto).
  assert.equal(r.cupones.find(c => c.usuario_id === require('../server/db').cuentaTransitos()), undefined);
  const totalServicios = r.cupones.reduce((s, c) => s + c.total_servicios, 0);
  assert.equal(r.cierre.total_servicios, totalServicios);

  // Un vuelo de INICIO cargado tarde entra en el cierre de MES2 y no vuelve a cobrar el derecho de INICIO a Ana…
  volar(ana, 1, `${INICIO}-28`);
  // …pero sí el de Beto, que voló en INICIO (tarde) y en MES2: dos meses distintos, dos derechos.
  volar(beto, 1, `${INICIO}-15`);
  volar(beto, 2, `${MES2}-05`);
  const r2 = cierres.cerrar(MES2, admin);
  assert.equal(r2.cupones.find(c => c.usuario_id === ana.id).total_servicios, 0);
  assert.equal(r2.cupones.find(c => c.usuario_id === beto.id).total_servicios, 1500000 * 2);
  const derechosBeto = db.prepare('SELECT periodo FROM derechos_aeronave WHERE usuario_id = ? ORDER BY periodo').all(beto.id).map(d => d.periodo);
  assert.deepEqual(derechosBeto, [INICIO, MES2]);
  assert.equal(ledger.verificarCadena().ok, true);
});

test('tesorería cobra un evento: descripción y si es el total o un anticipo', async () => {
  const eva = usuario('Eva');
  const evento = (it) => ({ usuario_id: eva.id, fecha: util.hoy(), items: [{ evento: 'anticipo', detalle: 'Alquiler del hangar para un cumpleaños', precio: '50.000', ...it }] });
  assert.throws(() => tickets.crear(evento({ detalle: ' ' }), admin), /Describí el evento/);
  assert.throws(() => tickets.crear(evento({ evento: 'seña' }), admin), /completo o es un anticipo/);
  assert.throws(() => tickets.crear(evento({ precio: '' }), admin), /importe del evento/);
  assert.throws(() => tickets.crear({ ...evento({}), avion_id: 1, cobrado: true, medio: 'efectivo' }, rampa), /servicio de la lista/);

  const t = tickets.crear({ ...evento({}), cobrado: true, medio: 'transferencia' }, admin);
  assert.equal(t.total, 5000000);
  assert.equal(t.items[0].concepto, 'Evento, anticipo');
  assert.equal(t.items[0].detalle, 'Alquiler del hangar para un cumpleaños');
  assert.equal(t.items[0].evento, 'anticipo');
  assert.equal(ledger.saldo(eva.id), 0);
  const cargo = db.prepare('SELECT concepto FROM movimientos WHERE id = ?').get(t.movimiento_id).concepto;
  assert.match(cargo, /Evento, anticipo: Alquiler del hangar para un cumpleaños/);
  const total = tickets.crear(evento({ evento: 'total', precio: '100.000' }), admin);
  assert.equal(total.items[0].concepto, 'Evento, pago total');
  assert.equal(ledger.saldo(eva.id), 10000000);

  const chunks = [];
  for await (const c of generarTicket(tickets.detalle(t.id), require('../server/db').getConfig())) chunks.push(c);
  assert.equal(Buffer.concat(chunks).subarray(0, 5).toString(), '%PDF-');
});

test('servicios valorizados del mes', () => {
  const r = tickets.resumenServicios(util.periodoActual());
  const porNombre = Object.fromEntries(r.map(x => [x.nombre, x]));
  assert.equal(porNombre.Combustible.cantidad, 4050);
  assert.equal(porNombre.Combustible.cantidad_txt, '40,5 litros');
  assert.equal(porNombre['Otros conceptos'].importe, 1200000);   // el ticket anulado no cuenta
  assert.equal(porNombre['Hangaraje mensual'].importe, 5000000);
  assert.equal(porNombre['Hangaraje diario'].cantidad_txt, '2 días');
  assert.equal(porNombre.Eventos.importe, 15000000);
  assert.equal(porNombre.Eventos.tickets, 2);
});

const PNG = 'data:image/png;base64,' + Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex').toString('base64');

test('pagos informados: el socio informa, tesorería confirma o rechaza', () => {
  const saldo = ledger.saldo(ana.id);
  assert.throws(() => pagosInformados.informar({ importe: '0', medio: 'transferencia' }, ana), /importe/);
  assert.throws(() => pagosInformados.informar({ importe: '1000', medio: 'bitcoin' }, ana), /cómo pagaste/);
  assert.throws(() => pagosInformados.informar({ importe: '1000', medio: 'transferencia', comprobante: 'data:text/html;base64,PGI+' }, ana), /foto o un PDF/);
  assert.throws(() => pagosInformados.informar({ importe: '1000', medio: 'transferencia', comprobante: 'data:image/png;base64,PGI+' }, ana), /no es válido/);

  const p = pagosInformados.informar({ importe: '50.000', medio: 'transferencia', nota: 'Desde la cuenta de mi papá', comprobante: PNG }, ana);
  assert.equal(p.estado, 'pendiente');
  assert.equal(ledger.saldo(ana.id), saldo);                    // informado no es pagado
  assert.equal(pagosInformados.comprobante(p.id).tipo, 'image/png');

  // Llegaron $45.000: tesorería corrige el importe al confirmar.
  const r = pagosInformados.confirmar(p.id, { importe: '45000' }, admin);
  assert.equal(r.pago.estado, 'confirmado');
  assert.equal(ledger.saldo(ana.id), saldo - 4500000);
  assert.match(db.prepare('SELECT concepto FROM movimientos WHERE id = ?').get(r.pago.movimiento_id).concepto, /informado por el socio/);
  assert.throws(() => pagosInformados.confirmar(p.id, {}, admin), /ya fue revisado/);

  const p2 = pagosInformados.informar({ importe: '1000', medio: 'efectivo' }, ana);
  assert.throws(() => pagosInformados.rechazar(p2.id, '', admin), /por qué/);
  assert.equal(pagosInformados.rechazar(p2.id, 'No llegó', admin).estado, 'rechazado');
  assert.equal(pagosInformados.pendientes().n, 0);
});

test('ticket en PDF', async () => {
  const t = tickets.detalle(1);
  const chunks = [];
  for await (const c of generarTicket(t, require('../server/db').getConfig())) chunks.push(c);
  const buf = Buffer.concat(chunks);
  assert.equal(buf.subarray(0, 5).toString(), '%PDF-');
  fs.writeFileSync(path.join(dir, 'ticket.pdf'), buf);
});

test('copia de seguridad mensual', async () => {
  const nombre = await respaldos.respaldoMensual({ forzar: true });
  assert.equal(nombre, `aeroclub-${util.periodoActual()}.sqlite`);
  assert.equal(respaldos.listar()[0].nombre, nombre);
  assert.equal(await respaldos.respaldoMensual(), null);        // una sola por mes
  assert.throws(() => respaldos.ruta('../aeroclub.sqlite'), /inexistente/);
});

// ── Permisos por rol, de punta a punta por HTTP ─────────────────────────────
let server;
after(() => server?.close());

test('roles: consulta sólo mira, rampa sólo tickets, el piloto no toca vuelos, el externo no entra', async () => {
  const app = require('../server/index');
  server = app.listen(0);
  const base = `http://127.0.0.1:${server.address().port}`;
  const piloto = usuario('Piloto');

  async function entrar(email) {
    const r = await fetch(`${base}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-A25': '1' }, body: JSON.stringify({ email, password: 'clave-1234' }) });
    assert.equal(r.status, 200, `login de ${email}`);
    const cookie = r.headers.get('set-cookie').split(';')[0];
    return (metodo, url, cuerpo) => fetch(`${base}${url}`, {
      method: metodo, headers: { 'Content-Type': 'application/json', 'X-A25': '1', cookie }, body: cuerpo ? JSON.stringify(cuerpo) : undefined
    });
  }

  const c = await entrar('consulta@test.com');
  const panel = await c('GET', '/api/admin/panel');
  assert.equal(panel.status, 200);
  // Actividad del mes: las anulaciones de tickets y de sus pagos en el acto, con el motivo.
  const pd = await panel.json();
  const tipos = new Set(pd.anulaciones.map(a => a.que));
  assert.ok(tipos.has('Ticket') && tipos.has('Pago'), [...tipos].join());
  assert.ok(pd.anulaciones.every(a => a.socio && a.fecha.startsWith(util.periodoActual())));
  assert.ok(pd.anulaciones.some(a => a.motivo));
  assert.ok(pd.tickets_mes.anulados >= 1);
  assert.equal(typeof pd.pagos_informados_mes.n, 'number');
  const hist = await (await c('GET', `/api/admin/pagos-informados?periodo=${util.periodoActual()}`)).json();
  assert.ok(hist.pagos.every(p => p.fecha.startsWith(util.periodoActual())));
  assert.equal((await (await c('GET', '/api/admin/pagos-informados?periodo=2001-01')).json()).pagos.length, 0);
  assert.equal((await c('GET', '/api/admin/cuentas')).status, 200);
  assert.equal((await c('POST', '/api/admin/pagos', { usuario_id: ana.id, importe: '1' })).status, 403);
  assert.equal((await c('PUT', '/api/admin/config', {})).status, 403);
  assert.equal((await c('GET', '/api/admin/respaldo')).status, 403);
  assert.equal((await c('POST', '/api/rampa/tickets', {})).status, 403);

  const r = await entrar('rampa@test.com');
  assert.equal((await r('GET', '/api/vuelos')).status, 403);
  assert.equal((await r('GET', '/api/cuenta')).status, 403);
  assert.equal((await r('GET', '/api/admin/panel')).status, 403);
  const datos = await (await r('GET', '/api/rampa/datos')).json();
  assert.ok(!datos.servicios.some(s => s.codigo === 'derecho_aeronave'));   // lo cobra el cierre, no rampa
  const nuevo = await r('POST', '/api/rampa/tickets', { aeronave_id: aeronave.id, items: [{ servicio_id: servicio('Hangaraje mensual').id }], cobrado: true, medio: 'efectivo' });
  assert.equal(nuevo.status, 201);
  const { ticket } = await nuevo.json();
  const pdf = await fetch(`${base}/t/${ticket.token}`);
  assert.equal(pdf.headers.get('content-type'), 'application/pdf');
  assert.equal((await fetch(`${base}/t/no-existe`)).status, 404);

  const p = await entrar('piloto@test.com');
  const v = await p('POST', '/api/vuelos', { ...H('1'), avion_id: 1, fecha: util.hoy() });
  assert.equal(v.status, 201);
  const { vuelo } = await v.json();
  assert.equal((await p('POST', `/api/vuelos/${vuelo.id}/anular`, { motivo: 'x' })).status, 403);
  assert.equal((await p('PUT', `/api/vuelos/${vuelo.id}`, { horas: '2' })).status, 403);
  assert.equal((await p('GET', '/api/admin/panel')).status, 403);
  const inf = await p('POST', '/api/pagos-informados', { importe: '1000', medio: 'transferencia', comprobante: PNG });
  assert.equal(inf.status, 201);
  const { pago } = await inf.json();
  assert.equal((await p('GET', `/api/pagos-informados/${pago.id}/comprobante`)).status, 200);
  assert.equal((await r('GET', `/api/pagos-informados/${pago.id}/comprobante`)).status, 403);

  // El piloto no cambia sus datos: se los pide a tesorería por mail. Rampa sí puede cargar su celular.
  assert.equal((await p('PUT', '/api/perfil', { telefono: '2345 401234' })).status, 403);
  assert.equal((await r('PUT', '/api/perfil', { telefono: '2345 401234' })).status, 200);
  assert.equal((await (await p('GET', '/api/perfil/contacto')).json()).email, 'tesoreria@aeroclub25demayo.com.ar');
  db.prepare(`UPDATE config SET valor = 'cuentas@club.com' WHERE clave = 'email_tesoreria'`).run();
  assert.equal((await (await p('GET', '/api/perfil/contacto')).json()).email, 'cuentas@club.com');

  // El externo no tiene usuario: aunque tuviera email, no puede entrar.
  db.prepare(`UPDATE usuarios SET email = 'externo@test.com' WHERE id = ?`).run(externo);
  const login = await fetch(`${base}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-A25': '1' }, body: JSON.stringify({ email: 'externo@test.com', password: 'x' }) });
  assert.equal(login.status, 401);
});
