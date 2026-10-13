// Tests de la cuota social (en el cierre, a cada socio activo no exento) y del vencimiento del CMA.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const os = require('os');
const fs = require('fs');
const path = require('path');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'a25-cuota-'));
process.env.DATA_DIR = dir;
process.env.DB_PATH = path.join(dir, 'test.sqlite');
process.env.ADMIN_PASSWORD = 'admin-test-123';

const { db } = require('../server/db');
const util = require('../server/util');
const cierres = require('../server/services/cierres');
const ledger = require('../server/services/ledger');
const servicios = require('../server/services/servicios');

const admin = { id: 1, rol: 'admin' };
const INICIO = util.sumarMeses(util.periodoActual(), -2);
const MES2 = util.sumarMeses(INICIO, 1);
const usuario = (nombre, rol = 'piloto', extra = '') => Number(db.prepare(`INSERT INTO usuarios (nombre, apellido, email, rol, password_hash, debe_cambiar_password${extra ? ', exento_cuota' : ''})
  VALUES (?, 'Test', ?, ?, ?, 0${extra ? ', 1' : ''})`).run(nombre, rol === 'externo' ? null : `${nombre.toLowerCase()}@test.com`, rol, rol === 'externo' ? null : 'x').lastInsertRowid);

let ana, beto, honorario, rampa, externo;

test('la cuota social existe, arranca sin precio y la tesorería genérica está exenta', () => {
  const c = db.prepare(`SELECT * FROM servicios WHERE codigo = 'cuota_social'`).get();
  assert.equal(c.nombre, 'Cuota social');
  assert.equal(c.precio, 0);
  assert.equal(servicios.cuotaSocial(), null);                // sin precio no se cobra
  assert.equal(db.prepare('SELECT exento_cuota FROM usuarios WHERE id = 1').get().exento_cuota, 1);
});

test('en el cierre se cobra una cuota a cada socio activo no exento', () => {
  db.prepare(`UPDATE config SET valor = ? WHERE clave = 'periodo_inicio'`).run(INICIO);
  db.prepare(`UPDATE servicios SET precio = 2500000 WHERE codigo = 'cuota_social'`).run();
  ana = usuario('Ana');
  beto = usuario('Beto');
  honorario = usuario('Honorario', 'piloto', 'exento');
  rampa = usuario('Rampa', 'rampa');
  externo = usuario('Externo', 'externo');

  cierres.cerrar(INICIO, admin);
  const cuotas = db.prepare('SELECT usuario_id FROM cuotas_sociales WHERE periodo = ? ORDER BY usuario_id').all(INICIO).map(c => c.usuario_id);
  assert.deepEqual(cuotas, [ana, beto]);                     // ni exentos, ni rampa, ni externos, ni la tesorería genérica
  assert.equal(ledger.saldo(ana), 2500000);
  assert.equal(ledger.saldo(honorario), 0);
  const t = db.prepare(`SELECT t.*, i.concepto FROM tickets t JOIN ticket_items i ON i.ticket_id = t.id WHERE t.usuario_id = ?`).get(ana);
  assert.equal(t.origen, 'cierre');
  assert.equal(t.fecha, util.ultimoDia(INICIO));
  assert.match(t.concepto, /^Cuota social de /);
  // Va en el cupón como servicio.
  const cupon = db.prepare('SELECT * FROM cupones WHERE usuario_id = ?').get(ana);
  assert.equal(cupon.total_servicios, 2500000);
});

test('el que está dado de baja al cierre no paga; nadie paga dos veces el mismo mes', () => {
  db.prepare('UPDATE usuarios SET activo = 0 WHERE id = ?').run(beto);
  cierres.cerrar(MES2, admin);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM cuotas_sociales WHERE periodo = ?').get(MES2).n, 1);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM cuotas_sociales WHERE usuario_id = ?').get(ana).n, 2);
  assert.equal(ledger.saldo(beto), 2500000);
});
