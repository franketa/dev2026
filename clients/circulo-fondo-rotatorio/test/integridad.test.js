const test = require('node:test');
const assert = require('node:assert/strict');
const { db, vl, actores: a, ANTERIOR } = require('./ayuda');
const fondos = require('../server/services/fondos');
const auditoria = require('../server/services/auditoria');
const libro = require('../server/services/libro');
const admin = require('../server/services/admin');

const $ = (pesos) => pesos * 100;

test('la cadena de auditoría y el libro se verifican enteros', () => {
  fondos.ingresoCentral(a.tesorero, { importe: $(1000000), fecha: `${ANTERIOR}-01`, saldo_inicial: true });
  fondos.asignar(a.tesorero, { periodo: ANTERIOR, fecha: `${ANTERIOR}-01`, items: [{ sede_id: vl, importe: $(300000) }] });
  fondos.moverEfectivo(a.jefe, 'extraccion', { importe: $(1000), fecha: `${ANTERIOR}-02` });
  admin.agregarParametro(a.superadmin, { clave: 'tope_efectivo', valor: $(50000), vigente_desde: '2027-01-01', nota: 'Ajuste por inflación' });
  const aud = auditoria.verificarCadena();
  const lib = libro.verificarCadena();
  assert.equal(aud.ok, true);
  assert.ok(aud.registros >= 4);
  assert.equal(lib.ok, true);
  assert.equal(lib.registros, 5);
});

test('toda mutación deja quién, cuándo, IP, antes/después', () => {
  const r = db.prepare(`SELECT * FROM auditoria WHERE accion = 'parametro.alta'`).get();
  assert.equal(r.usuario_id, a.superadmin.id);
  assert.equal(r.ip, '127.0.0.1');
  assert.ok(r.creado_en);
  assert.equal(JSON.parse(r.despues).valor, $(50000));
});

test('parámetros con vigencia: el tope cambia desde la fecha indicada', () => {
  const { parametro } = require('../server/db');
  assert.equal(parametro('tope_efectivo', '2026-12-31'), $(40000));
  assert.equal(parametro('tope_efectivo', '2027-01-01'), $(50000));
});

test('alterar un registro de auditoría directo en la base se detecta', () => {
  db.exec('DROP TRIGGER auditoria_no_update');
  const r = db.prepare('SELECT id FROM auditoria ORDER BY id LIMIT 1 OFFSET 1').get();
  db.prepare(`UPDATE auditoria SET motivo = 'dibujado' WHERE id = ?`).run(r.id);
  const v = auditoria.verificarCadena();
  assert.equal(v.ok, false);
  assert.equal(v.id, r.id);
  assert.match(v.error, /alterado/);
});

test('borrar un registro de auditoría directo en la base se detecta', () => {
  db.exec('DROP TRIGGER auditoria_no_delete');
  db.prepare(`UPDATE auditoria SET motivo = NULL WHERE motivo = 'dibujado'`).run();
  assert.equal(auditoria.verificarCadena().ok, true, 'restaurado');
  const r = db.prepare('SELECT id FROM auditoria ORDER BY id LIMIT 1 OFFSET 2').get();
  db.prepare('DELETE FROM auditoria WHERE id = ?').run(r.id);
  const v = auditoria.verificarCadena();
  assert.equal(v.ok, false);
  assert.match(v.error, /no continúa la cadena/);
});

test('alterar un movimiento del libro se detecta', () => {
  db.exec('DROP TRIGGER movimientos_no_update');
  const m = db.prepare(`SELECT id FROM movimientos WHERE tipo = 'extraccion' LIMIT 1`).get();
  db.prepare('UPDATE movimientos SET importe = importe * 10 WHERE id = ?').run(m.id);
  const v = libro.verificarCadena();
  assert.equal(v.ok, false);
  assert.equal(v.id, m.id);
});
