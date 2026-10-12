// Tests del historial de pagos: lo que carga tesorería y lo que se anula o se borra queda a la vista.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const os = require('os');
const fs = require('fs');
const path = require('path');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'a25-pagos-'));
process.env.DATA_DIR = dir;
process.env.DB_PATH = path.join(dir, 'test.sqlite');
process.env.ADMIN_PASSWORD = 'admin-test-123';

const bcrypt = require('bcryptjs');
const { db } = require('../server/db');
const ledger = require('../server/services/ledger');
const correcciones = require('../server/services/correcciones');
const pagosInformados = require('../server/services/pagosInformados');

const admin = { id: 1, rol: 'admin' };
const r = db.prepare(`INSERT INTO usuarios (nombre, apellido, email, rol, password_hash, debe_cambiar_password) VALUES ('Guille', 'Test', 'guille@test.com', 'piloto', ?, 0)`)
  .run(bcrypt.hashSync('x', 4));
const socio = Number(r.lastInsertRowid);

// Lo mismo que hace la ruta de tesorería al registrar un pago.
function pagoDeTesoreria(importe, nota = null) {
  const m = ledger.registrar({ usuario_id: socio, tipo: 'pago', concepto: 'Pago por transferencia', importe: -importe, medio: 'transferencia', creado_por: admin.id });
  return { mov: m, pago: pagosInformados.get(pagosInformados.desdeTesoreria({ movimiento: m, nota, actor: admin })) };
}

test('un pago cargado por tesorería entra confirmado al historial del socio', () => {
  ledger.registrar({ usuario_id: socio, tipo: 'ajuste', concepto: 'Deuda', importe: 50000000, creado_por: admin.id });
  const { pago } = pagoDeTesoreria(20000000, 'en el asado');
  assert.equal(pago.estado, 'confirmado');
  assert.equal(pago.origen, 'tesoreria');
  assert.equal(pago.importe, 20000000);
  assert.equal(pagosInformados.listar({ usuarioId: socio }).length, 1);
  assert.equal(ledger.saldo(socio), 30000000);
});

test('al borrar el pago de la cuenta, el historial lo muestra anulado con el motivo', () => {
  const { mov, pago } = pagoDeTesoreria(10000000);
  correcciones.borrar(mov.id, 'lo cargué dos veces', admin);
  const p = pagosInformados.get(pago.id);
  assert.equal(p.estado, 'anulado');
  assert.match(p.motivo_anulacion, /lo cargué dos veces/);
  assert.equal(p.anulado_por, admin.id);
  assert.equal(ledger.saldo(socio), 30000000);           // se fue de la cuenta
  assert.equal(pagosInformados.resumenMes(p.fecha.slice(0, 7)).anulados, 1);
});

test('anular el pago lo marca anulado; borrar la anulación lo vuelve a contar', () => {
  const { mov, pago } = pagoDeTesoreria(5000000);
  const anulacion = ledger.anular(mov.id, 'era de otro socio', admin.id);
  pagosInformados.alAnularMovimiento(mov.id, 'era de otro socio', admin);
  assert.equal(pagosInformados.get(pago.id).estado, 'anulado');
  correcciones.borrar(anulacion.id, 'me equivoqué al anular', admin);
  assert.equal(pagosInformados.get(pago.id).estado, 'confirmado');
  assert.equal(ledger.saldo(socio), 25000000);
});

test('corregir el importe del pago en la cuenta actualiza el historial', () => {
  const { mov, pago } = pagoDeTesoreria(1000000);
  correcciones.editar(mov.id, { importe: '15000', motivo: 'era 15 mil' }, admin);
  assert.equal(pagosInformados.get(pago.id).importe, 1500000);
});

test('los pagos cubren primero los cargos más viejos (para saber si un ticket a la cuenta está pagado)', () => {
  const tickets = require('../server/services/tickets');
  const r2 = db.prepare(`INSERT INTO usuarios (nombre, apellido, email, rol, password_hash, debe_cambiar_password) VALUES ('Beto', 'Test', 'beto@test.com', 'piloto', 'x', 0)`).run();
  const beto = Number(r2.lastInsertRowid);
  const c1 = ledger.registrar({ usuario_id: beto, tipo: 'servicio', concepto: 'Hangaraje', importe: 3000000, fecha: '2026-01-05' });
  const c2 = ledger.registrar({ usuario_id: beto, tipo: 'servicio', concepto: 'Combustible', importe: 2000000, fecha: '2026-01-10' });
  ledger.registrar({ usuario_id: beto, tipo: 'pago', concepto: 'Pago', importe: -4000000, fecha: '2026-01-20', medio: 'efectivo' });
  const impago = tickets.impagoPorCargo(beto);
  assert.equal(impago.get(c1.id), 0);            // pagado
  assert.equal(impago.get(c2.id), 1000000);      // faltan 10.000
});
