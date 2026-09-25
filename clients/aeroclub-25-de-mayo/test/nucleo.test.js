// Tests del núcleo contable. Corren contra una base temporal: `npm test`.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const os = require('os');
const fs = require('fs');
const path = require('path');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'a25-test-'));
process.env.DATA_DIR = dir;
process.env.DB_PATH = path.join(dir, 'test.sqlite');
process.env.ADMIN_PASSWORD = 'admin-test-123';

const { db } = require('../server/db');
const util = require('../server/util');
const flota = require('../server/services/flota');
const vuelos = require('../server/services/vuelos');
const cierres = require('../server/services/cierres');
const ledger = require('../server/services/ledger');
const { generarCupon } = require('../server/services/pdf');

const admin = { id: 1, rol: 'admin' };

function socio(nombre, apellido, extra = {}) {
  const r = db.prepare(`INSERT INTO usuarios (nombre, apellido, email, password_hash, es_instructor, debe_cambiar_password)
                        VALUES (?, ?, ?, 'x', ?, 0)`).run(nombre, apellido, `${nombre}@test.com`.toLowerCase(), extra.instructor ? 1 : 0);
  return { id: Number(r.lastInsertRowid), rol: 'piloto', nombre };
}

test('utilidades: horas, pesos, teléfonos, importes y fechas', () => {
  assert.equal(util.parseHoras('1,4'), 14);
  assert.equal(util.parseHoras('1.4'), 14);
  assert.equal(util.parseHoras(',5'), 5);
  assert.equal(util.parseHoras('0,1'), 1);
  assert.equal(util.parseHoras('2'), 20);
  assert.equal(util.parseHoras(1.4), 14);
  assert.equal(util.parseHoras('1,45'), null);
  assert.equal(util.parseHoras('abc'), null);
  assert.equal(util.parsePesos('80.000'), 8000000);
  assert.equal(util.parsePesos('80000,50'), 8000050);
  assert.equal(util.parsePesos('$ 1.234.567'), 123456700);
  assert.equal(util.telefonoWhatsApp('2345 15 401234'), '5492345401234');
  assert.equal(util.telefonoWhatsApp('011 15 4455 6677'), '5491144556677');
  assert.equal(util.telefonoWhatsApp('+54 9 2345 401234'), '5492345401234');
  assert.equal(util.telefonoWhatsApp('1234'), null);
  assert.equal(util.importeVuelo(8000000, 12), 9600000);   // 1,2 h × $80.000 = $96.000
  assert.equal(util.sumarMeses('2026-12', 1), '2027-01');
  assert.equal(util.ultimoDia('2028-02'), '2028-02-29');
  assert.equal(util.fechaDeSqlite('2026-09-25 00:28:16'), '2026-09-24');   // 21:28 en Argentina
});

let ana, juan, inst;

test('preparación: tarifas y socios', () => {
  // Simulamos que el sistema arrancó en julio para poder cerrar meses pasados.
  db.prepare(`UPDATE config SET valor = '2026-07' WHERE clave = 'periodo_inicio'`).run();
  flota.nuevaTarifa(1, { tipo: 'solo', precio_hora: 8000000, vigente_desde: '2026-01-01' }, admin);
  flota.nuevaTarifa(1, { tipo: 'instruccion', precio_hora: 9500000, vigente_desde: '2026-01-01' }, admin);
  ana = socio('Ana', 'Gómez');
  juan = socio('Juan', 'Pérez');
  inst = socio('Carlos', 'Instructor', { instructor: true });
  assert.deepEqual(flota.tarifasVigentes(1), { solo: 8000000, instruccion: 9500000 });
});

// Los vuelos de julio tienen más de 60 días: los carga tesorería en nombre del piloto.
const porTesoreria = (input, piloto) => vuelos.crear({ ...input, piloto_id: piloto.id }, admin);

test('carga de vuelos: horas, validaciones e instructor', () => {
  const v1 = porTesoreria({ avion_id: 1, fecha: '2026-07-10', horas: '1,2', con_instructor: true, instructor_id: inst.id }, ana);
  assert.equal(v1.vuelo.decimas, 12);
  assert.equal(v1.vuelo.importe, 11400000);
  assert.equal(v1.vuelo.cargado_por, admin.id);
  assert.equal(v1.vuelo.tac_inicial, null);
  assert.deepEqual(v1.avisos, []);

  assert.throws(() => porTesoreria({ avion_id: 1, fecha: '2026-07-11', horas: '0' }, juan), /Tiempo de vuelo/);
  assert.throws(() => porTesoreria({ avion_id: 1, fecha: '2026-07-11', horas: '1,25' }, juan), /Tiempo de vuelo/);
  assert.throws(() => porTesoreria({ avion_id: 1, fecha: '2026-07-11', horas: '1', con_instructor: true }, juan), /instructor/);
  assert.throws(() => porTesoreria({ avion_id: 1, fecha: '2026-07-11', horas: '1', con_instructor: true, instructor_id: juan.id }, juan), /instructor/);
  assert.throws(() => vuelos.crear({ avion_id: 1, fecha: '2099-01-01', horas: '1' }, juan), /futura/);
  assert.throws(() => vuelos.crear({ avion_id: 1, fecha: '2026-07-11', horas: '1' }, juan), /últimos 60 días/);
  assert.throws(() => vuelos.crear({ avion_id: 1, fecha: util.hoy(), horas: '12' }, juan), /error de tipeo/);

  // Un piloto no puede cargarle vuelos a otro: el piloto_id se ignora.
  const ajeno = vuelos.crear({ avion_id: 1, piloto_id: ana.id, fecha: util.hoy(), horas: '0,5' }, juan);
  assert.equal(ajeno.vuelo.piloto_id, juan.id);
  // Cargar lo mismo dos veces avisa (no bloquea).
  const doble = vuelos.crear({ avion_id: 1, fecha: util.hoy(), horas: '0,5' }, juan);
  assert.match(doble.avisos.join(' '), /otro vuelo igual/);
  assert.throws(() => vuelos.anular(doble.vuelo.id, '', juan), /por qué/);
  vuelos.anular(doble.vuelo.id, 'Duplicado', juan);
  vuelos.anular(ajeno.vuelo.id, 'Prueba', juan);
  assert.throws(() => vuelos.anular(ajeno.vuelo.id, 'Otra', juan), /anulado/);

  vuelos.crear({ avion_id: 1, fecha: '2026-07-12', horas: '1' }, admin);

  // Un piloto no puede tocar vuelos ajenos.
  assert.throws(() => vuelos.editar(v1.vuelo.id, { notas: 'x' }, juan), /tus propios vuelos/);
  // Pero sí corregir el suyo mientras el mes está abierto, y queda en el historial.
  const corregido = vuelos.editar(v1.vuelo.id, { horas: '1,3', notas: 'Presión de aceite baja' }, ana);
  assert.equal(corregido.vuelo.importe, 12350000);
  assert.equal(vuelos.historial(v1.vuelo.id).length, 2);
  vuelos.editar(v1.vuelo.id, { horas: '1,2' }, ana);

  porTesoreria({ avion_id: 1, fecha: '2026-07-20', horas: '1' }, juan);
});

test('pagos y ajustes quedan en el libro', () => {
  ledger.registrar({ usuario_id: ana.id, tipo: 'pago', concepto: 'Pago por transferencia', importe: -5000000, creado_por: admin.id });
  assert.equal(ledger.saldo(ana.id), -5000000);
});

test('la simulación del cierre no deja rastros', () => {
  const movsAntes = db.prepare('SELECT COUNT(*) n FROM movimientos').get().n;
  const sim = cierres.simular('2026-07', admin);
  assert.equal(sim.cierre.cantidad_vuelos, 3);
  assert.equal(sim.cupones.length, 3);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM cierres').get().n, 0);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM movimientos').get().n, movsAntes);
  assert.equal(db.prepare(`SELECT COUNT(*) n FROM vuelos WHERE estado = 'abierto' AND fecha < '2026-08-01'`).get().n, 3);
});

test('no se puede cerrar agosto antes que julio, ni el mes en curso', () => {
  assert.throws(() => cierres.cerrar('2026-08', admin), /Primero hay que cerrar/);
  assert.throws(() => cierres.cerrar(util.periodoActual(), admin), /todavía no terminó/);
});

test('cierre de julio: cupones correctos y vuelos congelados', () => {
  const r = cierres.cerrar('2026-07', admin);
  const cupAna = r.cupones.find(c => c.usuario_id === ana.id);
  assert.equal(cupAna.saldo_anterior, 0);
  assert.equal(cupAna.total_vuelos, 11400000);
  assert.equal(cupAna.total_pagos, -5000000);
  assert.equal(cupAna.total, 6400000);
  assert.equal(cupAna.decimas, 12);
  assert.equal(cupAna.estado, 'pendiente');
  // Cerrado tarde (en septiembre): el vencimiento se corre para dar al menos 7 días.
  assert.equal(cupAna.vencimiento, util.sumarDias(util.hoy(), 7));

  const v = db.prepare('SELECT * FROM vuelos WHERE piloto_id = ?').get(ana.id);
  assert.equal(v.estado, 'cerrado');
  assert.throws(() => vuelos.editar(v.id, { notas: 'cambio' }, ana), /cierre del mes/);
  assert.throws(() => db.prepare(`UPDATE vuelos SET importe = 1 WHERE id = ?`).run(v.id), /cerrado/);
  assert.throws(() => db.prepare(`DELETE FROM vuelos WHERE id = ?`).run(v.id), /no se borran/);
  assert.throws(() => cierres.cerrar('2026-07', admin), /ya está cerrado/);
});

test('agosto: saldo anterior, pago parcial y vuelo cargado tarde de julio', () => {
  // Juan se olvidó un vuelo de julio y lo carga en agosto: entra en el cierre de agosto.
  const tarde = porTesoreria({ avion_id: 1, fecha: '2026-07-30', horas: '0,5' }, juan);
  assert.match(tarde.avisos.join(' '), /ya se cerró/);
  porTesoreria({ avion_id: 1, fecha: '2026-08-05', horas: '1', con_instructor: true, instructor_id: inst.id }, ana);
  ledger.registrar({ usuario_id: ana.id, tipo: 'pago', concepto: 'Pago parcial', importe: -4000000, creado_por: admin.id });

  const cupJulio = db.prepare('SELECT * FROM cupones WHERE usuario_id = ? ORDER BY id DESC').get(ana.id);
  assert.equal(cierres.estadoCupon(cupJulio).estado, 'parcial');

  const r = cierres.cerrar('2026-08', admin);
  const cupAna = r.cupones.find(c => c.usuario_id === ana.id);
  assert.equal(cupAna.saldo_anterior, 6400000);
  assert.equal(cupAna.total_pagos, -4000000);
  assert.equal(cupAna.total_vuelos, 9500000);
  assert.equal(cupAna.total, 6400000 - 4000000 + 9500000);
  assert.equal(cierres.estadoCupon(cupJulio).estado, 'incluido');

  const cupJuan = r.cupones.find(c => c.usuario_id === juan.id);
  assert.equal(cupJuan.total_vuelos, 4000000);            // 0,5 h × $80.000 del vuelo tardío
  assert.equal(cupJuan.saldo_anterior, 8000000);          // el vuelo de julio

  // Pagando todo, el cupón pasa a pagado.
  ledger.registrar({ usuario_id: ana.id, tipo: 'pago', concepto: 'Pago total', importe: -cupAna.total, creado_por: admin.id });
  assert.equal(cierres.estadoCupon(cupAna).estado, 'pagado');
});

test('anulación de movimientos: contraasiento, una sola vez', () => {
  const pago = ledger.registrar({ usuario_id: juan.id, tipo: 'pago', concepto: 'Pago mal cargado', importe: -100000, creado_por: admin.id });
  const saldo = ledger.saldo(juan.id);
  const a = ledger.anular(pago.id, 'Era de otro socio', admin.id);
  assert.equal(a.importe, 100000);
  assert.equal(ledger.saldo(juan.id), saldo + 100000);
  assert.throws(() => ledger.anular(pago.id, 'otra vez', admin.id), /ya fue anulado/);
  assert.throws(() => ledger.anular(a.id, 'x', admin.id), /no se puede anular/);
});

test('retarifa opcional de vuelos abiertos', () => {
  const v = vuelos.crear({ avion_id: 1, fecha: util.hoy(), horas: '1' }, juan);
  assert.equal(v.vuelo.importe, 8000000);
  const r = flota.nuevaTarifa(1, { tipo: 'solo', precio_hora: 9000000, vigente_desde: util.hoy(), aplicar_abiertos: true }, admin);
  assert.equal(r.repreciados, 1);
  assert.equal(vuelos.getVuelo(v.vuelo.id).importe, 9000000);
});

test('cupón en PDF', async () => {
  const cup = db.prepare('SELECT id FROM cupones ORDER BY id DESC LIMIT 1').get();
  const doc = generarCupon(cierres.datosCupon(cup.id));
  const chunks = [];
  for await (const c of doc) chunks.push(c);
  const buf = Buffer.concat(chunks);
  assert.equal(buf.subarray(0, 5).toString(), '%PDF-');
  assert.ok(buf.length > 20000);
  fs.writeFileSync(path.join(dir, 'cupon.pdf'), buf);
});

test('tesorería corrige movimientos: edita, borra y los cupones se recalculan', () => {
  const correcciones = require('../server/services/correcciones');
  const cup = () => db.prepare('SELECT * FROM cupones WHERE usuario_id = ? ORDER BY id').all(ana.id);
  const pagoJulio = db.prepare(`SELECT * FROM movimientos WHERE usuario_id = ? AND tipo = 'pago' ORDER BY id LIMIT 1`).get(ana.id);
  assert.equal(cup()[0].total, 6400000);

  // El pago de julio era de $60.000, no de $50.000.
  assert.throws(() => correcciones.editar(pagoJulio.id, { importe: '60000' }, admin), /por qué/);
  correcciones.editar(pagoJulio.id, { importe: '60000', motivo: 'Mal tipeado' }, admin);
  assert.equal(db.prepare('SELECT importe FROM movimientos WHERE id = ?').get(pagoJulio.id).importe, -6000000);
  assert.equal(cup()[0].total, 5400000);
  assert.equal(cup()[1].saldo_anterior, 5400000);          // el cambio se arrastra al cupón siguiente
  assert.equal(ledger.verificarCadena().ok, true);          // la cadena se rehízo

  // Borrar un pago devuelve la deuda.
  const saldoAntes = ledger.saldo(ana.id);
  const pagoAgosto = db.prepare(`SELECT * FROM movimientos WHERE usuario_id = ? AND concepto = 'Pago parcial'`).get(ana.id);
  correcciones.borrar(pagoAgosto.id, 'Pago duplicado', admin);
  assert.equal(ledger.saldo(ana.id), saldoAntes + 4000000);
  assert.equal(cup()[1].total_pagos, 0);
  assert.equal(ledger.verificarCadena().ok, true);
  const audit = db.prepare(`SELECT accion FROM auditoria WHERE accion LIKE 'movimiento.%' ORDER BY id`).all().map(a => a.accion);
  assert.deepEqual(audit, ['movimiento.edicion', 'movimiento.borrado']);
});

test('la cadena de hashes detecta una manipulación por fuera del sistema', () => {
  assert.equal(ledger.verificarCadena().ok, true);
  // Alguien con acceso al archivo cambia un importe sin pasar por el sistema…
  db.prepare('UPDATE movimientos SET importe = importe - 100 WHERE id = 2').run();
  const r = ledger.verificarCadena();
  assert.equal(r.ok, false);
  assert.equal(r.movimiento_id, 2);
});
