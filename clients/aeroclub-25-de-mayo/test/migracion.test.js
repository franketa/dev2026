// Migración v1.005: una base de la versión anterior (pagos_informados sin 'anulado' ni origen, usuarios
// sin los tildes nuevos) se actualiza sola al arrancar, y los pagos que cargó tesorería pasan al historial.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const os = require('os');
const fs = require('fs');
const path = require('path');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'a25-mig-'));
process.env.DATA_DIR = dir;
process.env.DB_PATH = path.join(dir, 'test.sqlite');
process.env.ADMIN_PASSWORD = 'admin-test-123';

const DDL_VIEJA = `
CREATE TABLE pagos_informados (
  id INTEGER PRIMARY KEY,
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id),
  importe INTEGER NOT NULL CHECK (importe > 0),
  fecha TEXT NOT NULL,
  medio TEXT NOT NULL,
  nota TEXT,
  comprobante_id INTEGER REFERENCES comprobantes(id),
  estado TEXT NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente','confirmado','rechazado')),
  movimiento_id INTEGER REFERENCES movimientos(id) ON DELETE SET NULL,
  revisado_por INTEGER REFERENCES usuarios(id),
  revisado_en TEXT,
  motivo_rechazo TEXT,
  ticket_id INTEGER REFERENCES tickets(id),
  informado_por INTEGER REFERENCES usuarios(id),
  creado_en TEXT NOT NULL DEFAULT (datetime('now'))
);`;

function cargarDb() {
  for (const k of Object.keys(require.cache)) if (k.includes(`${path.sep}server${path.sep}`)) delete require.cache[k];
  return require('../server/db');
}

test('una base de la versión anterior se migra y conserva los pagos', () => {
  // 1. Base con datos, llevada a la forma de la versión anterior.
  let { db } = cargarDb();
  let ledger = require('../server/services/ledger');
  const socio = Number(db.prepare(`INSERT INTO usuarios (nombre, apellido, email, rol, password_hash, debe_cambiar_password) VALUES ('Ana', 'Vieja', 'ana@test.com', 'piloto', 'x', 0)`).run().lastInsertRowid);
  ledger.registrar({ usuario_id: socio, tipo: 'ajuste', concepto: 'Deuda', importe: 10000000, creado_por: 1 });
  const informado = ledger.registrar({ usuario_id: socio, tipo: 'pago', concepto: 'Pago por transferencia (informado por el socio)', importe: -2000000, medio: 'transferencia', creado_por: 1 });
  const deTesoreria = ledger.registrar({ usuario_id: socio, tipo: 'pago', concepto: 'Pago por efectivo', importe: -3000000, medio: 'efectivo', creado_por: 1 });
  const anulado = ledger.registrar({ usuario_id: socio, tipo: 'pago', concepto: 'Pago por transferencia', importe: -1000000, medio: 'transferencia', creado_por: 1 });
  ledger.anular(anulado.id, 'era de otro socio', 1);
  const ticket = Number(db.prepare(`INSERT INTO tickets (numero, usuario_id, fecha, origen, total, token) VALUES (1, ?, date('now'), 'rampa', 500000, 'tok')`).run(socio).lastInsertRowid);

  db.pragma('foreign_keys = OFF');
  db.exec('DROP TABLE pagos_informados');
  db.exec(DDL_VIEJA);
  db.pragma('foreign_keys = ON');
  db.prepare(`INSERT INTO pagos_informados (usuario_id, importe, fecha, medio, estado, movimiento_id, informado_por) VALUES (?, 2000000, date('now'), 'transferencia', 'confirmado', ?, ?)`).run(socio, informado.id, socio);
  db.prepare(`INSERT INTO pagos_informados (usuario_id, importe, fecha, medio, ticket_id, informado_por) VALUES (?, 500000, date('now'), 'efectivo', ?, 1)`).run(socio, ticket);
  db.exec('ALTER TABLE usuarios DROP COLUMN es_instructor_sim');
  db.exec('ALTER TABLE usuarios DROP COLUMN es_mantenimiento');
  db.prepare(`DELETE FROM config WHERE clave = 'pagos_historial_desde'`).run();
  db.close();

  // 2. Arranca la versión nueva sobre esa base.
  ({ db } = cargarDb());
  ledger = require('../server/services/ledger');
  const pagos = db.prepare('SELECT * FROM pagos_informados ORDER BY id').all();
  const de = (movId) => pagos.find(p => p.movimiento_id === movId);

  assert.equal(de(informado.id).origen, 'socio');                       // el informado por el socio sigue igual
  assert.equal(de(informado.id).estado, 'confirmado');
  assert.equal(pagos.find(p => p.ticket_id === ticket).origen, 'rampa'); // el cobro de rampa queda marcado
  assert.equal(de(deTesoreria.id).origen, 'tesoreria');                 // el que cargó tesorería pasa al historial
  assert.equal(de(deTesoreria.id).estado, 'confirmado');
  assert.equal(de(deTesoreria.id).importe, 3000000);
  assert.equal(de(anulado.id).estado, 'anulado');                       // el anulado entra como anulado
  assert.equal(de(anulado.id).motivo_anulacion, 'era de otro socio');
  assert.equal(pagos.length, 4);

  const cols = db.prepare('PRAGMA table_info(usuarios)').all().map(c => c.name);
  assert.ok(cols.includes('es_instructor_sim') && cols.includes('es_mantenimiento'));
  assert.equal(db.pragma('foreign_key_check').length, 0);
  assert.equal(ledger.verificarCadena().ok, true);
  assert.equal(ledger.saldo(socio), 5000000);              // 100.000 − 20.000 − 30.000 (el anulado no cuenta)

  // 3. Volver a arrancar no duplica nada.
  db.close();
  ({ db } = cargarDb());
  assert.equal(db.prepare('SELECT COUNT(*) n FROM pagos_informados').get().n, 4);
});
