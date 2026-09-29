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
  assert.deepEqual(lista.map(s => s.nombre), ['Hangaraje', 'Combustible', 'Nocturno', 'Derecho de aeronave', 'Derecho de examen', 'Hora de simulador', 'Limpieza de avión']);
  assert.ok(lista.every(s => s.precio === 0));
  assert.equal(servicios.derechoAeronave(), null);          // sin precio no se cobra
});

test('preparación: tarifas, precios de servicios y usuarios', () => {
  db.prepare(`UPDATE config SET valor = ? WHERE clave = 'periodo_inicio'`).run(INICIO);
  flota.nuevaTarifa(1, { tipo: 'solo', precio_hora: 10000000, vigente_desde: '2020-01-01' }, admin);
  flota.nuevaTarifa(2, { tipo: 'solo', precio_hora: 8000000, vigente_desde: '2020-01-01' }, admin);
  const precios = { Hangaraje: 5000000, Combustible: 250000, 'Derecho de aeronave': 1500000, 'Derecho de examen': 3000000, 'Limpieza de avión': 2000000 };
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

test('rampa registra una aeronave de un externo y le arma un ticket', () => {
  aeronave = tickets.guardarAeronave({ matricula: 'lv-zzz', modelo: 'Piper PA-18', externo: { nombre: 'Agroaérea del Sur SA', telefono: '2345 409999', dni: '30-12345678-9' } }, rampa);
  externo = aeronave.propietario_id;
  assert.equal(aeronave.matricula, 'LV-ZZZ');
  assert.equal(db.prepare('SELECT rol FROM usuarios WHERE id = ?').get(externo).rol, 'externo');
  assert.throws(() => tickets.guardarAeronave({ matricula: 'LV-ZZZ', propietario_id: ana.id }, rampa), /ya está registrada/);
  assert.throws(() => tickets.guardarAeronave({ matricula: 'LV-APH', propietario_id: ana.id }, rampa), /flota del club/);

  const hang = servicio('Hangaraje');
  const comb = servicio('Combustible');
  // Rampa no carga "otros conceptos" ni servicios sin precio, ni cambia precios.
  assert.throws(() => tickets.crear({ aeronave_id: aeronave.id, items: [{ concepto: 'Propina', precio: '1000' }] }, rampa), /servicio de la lista/);
  assert.throws(() => tickets.crear({ aeronave_id: aeronave.id, items: [{ servicio_id: servicio('Nocturno').id }] }, rampa), /no tiene precio/);
  assert.throws(() => tickets.crear({ items: [{ servicio_id: hang.id }] }, rampa), /aeronave/);

  const t = tickets.crear({
    aeronave_id: aeronave.id, fecha: util.hoy(),
    items: [{ servicio_id: hang.id, cantidad: '1', precio: '1' }, { servicio_id: comb.id, cantidad: '40,5' }]
  }, rampa);
  assert.equal(t.usuario_id, externo);                                  // va a la cuenta del dueño
  assert.equal(t.items[0].precio, 5000000);                             // rampa no cambia el precio
  assert.equal(t.total, 5000000 + 10125000);
  assert.equal(t.numero_txt, 'T-00001');
  assert.equal(ledger.saldo(externo), t.total);
  const mov = db.prepare('SELECT * FROM movimientos WHERE id = ?').get(t.movimiento_id);
  assert.equal(mov.tipo, 'servicio');
  assert.match(mov.concepto, /T-00001 \(LV-ZZZ\): Hangaraje, Combustible 40,5 litros/);

  // Cobrado en el acto: queda el pago y el saldo en cero.
  const t2 = tickets.crear({ aeronave_id: aeronave.id, items: [{ servicio_id: servicio('Limpieza de avión').id }], cobrado: true, medio: 'efectivo' }, rampa);
  assert.ok(t2.pago_movimiento_id);
  assert.equal(ledger.saldo(externo), t.total);
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

test('derecho de aeronave: una vez por mes por piloto que voló', () => {
  // Ana vuela los dos aviones en INICIO; Beto vuela en MES2. Tesorería carga porque son vuelos viejos.
  const volar = (p, avion, fecha) => vuelos.crear({ piloto_id: p.id, avion_id: avion, fecha, horas: '1' }, admin);
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
  // El externo también recibe su cupón con los tickets de rampa.
  const cupExt = r.cupones.find(c => c.usuario_id === externo);
  assert.equal(cupExt.total_servicios, 5000000 + 10125000 + 2000000);
  assert.equal(cupExt.total, 5000000 + 10125000);             // el ticket cobrado en el acto se compensa con su pago
  assert.equal(r.cierre.total_servicios, cupAna.total_servicios + cupExt.total_servicios);

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

test('servicios valorizados del mes', () => {
  const r = tickets.resumenServicios(util.periodoActual());
  const porNombre = Object.fromEntries(r.map(x => [x.nombre, x]));
  assert.equal(porNombre.Combustible.cantidad, 4050);
  assert.equal(porNombre.Combustible.cantidad_txt, '40,5 litros');
  assert.equal(porNombre['Otros conceptos'].importe, 1200000);   // el ticket anulado no cuenta
  assert.equal(porNombre.Hangaraje.importe, 5000000);
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
  assert.equal((await c('GET', '/api/admin/panel')).status, 200);
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
  const nuevo = await r('POST', '/api/rampa/tickets', { aeronave_id: aeronave.id, items: [{ servicio_id: servicio('Hangaraje').id }] });
  assert.equal(nuevo.status, 201);
  const { ticket } = await nuevo.json();
  const pdf = await fetch(`${base}/t/${ticket.token}`);
  assert.equal(pdf.headers.get('content-type'), 'application/pdf');
  assert.equal((await fetch(`${base}/t/no-existe`)).status, 404);

  const p = await entrar('piloto@test.com');
  const v = await p('POST', '/api/vuelos', { avion_id: 1, fecha: util.hoy(), horas: '1' });
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

  // El externo no tiene usuario: aunque tuviera email, no puede entrar.
  db.prepare(`UPDATE usuarios SET email = 'externo@test.com' WHERE id = ?`).run(externo);
  const login = await fetch(`${base}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-A25': '1' }, body: JSON.stringify({ email: 'externo@test.com', password: 'x' }) });
  assert.equal(login.status, 401);
});
