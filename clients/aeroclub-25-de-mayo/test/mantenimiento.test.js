// Tests del usuario de mantenimiento: revisa las novedades de la flota y las marca como verificadas.
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const os = require('os');
const fs = require('fs');
const path = require('path');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'a25-mant-'));
process.env.DATA_DIR = dir;
process.env.DB_PATH = path.join(dir, 'test.sqlite');
process.env.ADMIN_PASSWORD = 'admin-test-123';

const bcrypt = require('bcryptjs');
const { db } = require('../server/db');
const flota = require('../server/services/flota');
const util = require('../server/util');
const app = require('../server/index');

const server = app.listen(0);
const base = `http://127.0.0.1:${server.address().port}`;
after(() => server.close());

const admin = { id: 1, rol: 'admin' };
db.prepare(`UPDATE usuarios SET debe_cambiar_password = 0 WHERE id = 1`).run();
flota.nuevaTarifa(1, { tipo: 'solo', precio_hora: 10000000, vigente_desde: '2020-01-01' }, admin);
const HASH = bcrypt.hashSync('clave-1234', 4);
const usuario = (nombre, rol) => Number(db.prepare(`INSERT INTO usuarios (nombre, apellido, email, rol, password_hash, debe_cambiar_password)
  VALUES (?, 'Test', ?, ?, ?, 0)`).run(nombre, `${nombre.toLowerCase()}@test.com`, rol, HASH).lastInsertRowid);
usuario('Pedro', 'piloto');
usuario('Consulta', 'consulta');

async function entrar(email, password = 'clave-1234') {
  const r = await fetch(`${base}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-A25': '1' }, body: JSON.stringify({ email, password }) });
  assert.equal(r.status, 200, `login de ${email}`);
  const cookie = r.headers.get('set-cookie').split(';')[0];
  return (metodo, url, cuerpo) => fetch(`${base}${url}`, {
    method: metodo, headers: { 'Content-Type': 'application/json', 'X-A25': '1', cookie }, body: cuerpo ? JSON.stringify(cuerpo) : undefined
  });
}
const json = async (r) => { const d = await r.json(); return d; };

let a, m, p, c, vueloId;

test('tesorería da de alta un usuario de mantenimiento', async () => {
  a = await entrar('tesoreria@aeroclub25demayo.com.ar', 'admin-test-123');
  const r = await a('POST', '/api/admin/usuarios', { nombre: 'Marcos', apellido: 'Taller', email: 'taller@test.com', rol: 'mantenimiento', es_instructor: true });
  assert.equal(r.status, 201);
  const { id, password_temporal } = await r.json();
  const u = db.prepare('SELECT rol, es_instructor FROM usuarios WHERE id = ?').get(id);
  assert.deepEqual({ ...u }, { rol: 'mantenimiento', es_instructor: 0 });
  // Primer ingreso: cambia la contraseña temporal.
  const t = await entrar('taller@test.com', password_temporal);
  assert.equal((await t('POST', '/api/auth/password', { actual: password_temporal, nueva: 'clave-1234' })).status, 200);
  m = await entrar('taller@test.com');
});

test('mantenimiento no tiene cuenta ni carga vuelos', async () => {
  for (const url of ['/api/inicio', '/api/cuenta', '/api/vuelos', '/api/admin/panel', '/api/rampa/datos']) {
    assert.equal((await m('GET', url)).status, 403, url);
  }
  assert.equal((await m('POST', '/api/vuelos', { avion_id: 1, fecha: util.hoy(), horas: '1' })).status, 403);
  assert.equal((await m('GET', '/api/auth/me')).status, 200);
});

test('la novedad del piloto aparece en los paneles hasta que mantenimiento la verifica', async () => {
  p = await entrar('pedro@test.com');
  c = await entrar('consulta@test.com');
  const r = await p('POST', '/api/vuelos', { avion_id: 1, fecha: util.hoy(), horas: '1', hora_salida: '10:00', hora_llegada: '11:00', notas: 'Cubierta izquierda baja' });
  assert.equal(r.status, 201);
  vueloId = (await r.json()).vuelo.id;
  await p('POST', '/api/vuelos', { avion_id: 1, fecha: util.hoy(), horas: '0,5', hora_salida: '12:00', hora_llegada: '12:30' });   // sin novedad

  const pend = await json(await m('GET', '/api/mantenimiento/novedades'));
  assert.equal(pend.novedades.length, 1);
  assert.equal(pend.novedades[0].notas, 'Cubierta izquierda baja');
  assert.equal(pend.novedades[0].piloto, 'Pedro Test');
  assert.ok(pend.aviones.length >= 1);
  assert.equal((await json(await p('GET', '/api/inicio'))).novedades.length, 1);
  assert.equal((await json(await a('GET', '/api/admin/panel'))).novedades.length, 1);

  // El piloto y consulta no la pueden verificar (consulta sí la ve).
  assert.equal((await p('GET', '/api/mantenimiento/novedades')).status, 403);
  assert.equal((await c('GET', '/api/mantenimiento/novedades')).status, 200);
  assert.equal((await c('POST', `/api/mantenimiento/novedades/${vueloId}/verificar`, {})).status, 403);

  const v = await m('POST', `/api/mantenimiento/novedades/${vueloId}/verificar`, { comentario: 'Se infló a 30 psi' });
  assert.equal(v.status, 200);
  const { novedad } = await v.json();
  assert.equal(novedad.revisada_por_nombre, 'Marcos Taller');
  assert.equal(novedad.novedad_comentario, 'Se infló a 30 psi');
  assert.equal((await m('POST', `/api/mantenimiento/novedades/${vueloId}/verificar`, {})).status, 409);

  // Sale de los paneles y queda en el historial de verificadas.
  assert.equal((await json(await p('GET', '/api/inicio'))).novedades.length, 0);
  assert.equal((await json(await a('GET', '/api/admin/panel'))).novedades.length, 0);
  assert.equal((await json(await m('GET', '/api/mantenimiento/novedades'))).novedades.length, 0);
  const hist = await json(await m('GET', `/api/mantenimiento/novedades?estado=verificada&periodo=${util.periodoActual()}`));
  assert.equal(hist.novedades.length, 1);
  assert.ok(db.prepare(`SELECT 1 FROM auditoria WHERE accion = 'novedad.verificada'`).get());
});

test('se puede verificar la novedad de un vuelo que ya entró en el cierre', async () => {
  const r = await p('POST', '/api/vuelos', { avion_id: 1, fecha: util.hoy(), horas: '0,8', hora_salida: '16:00', hora_llegada: '16:48', notas: 'Ruido en la radio' });
  const id = (await r.json()).vuelo.id;
  db.prepare(`UPDATE vuelos SET estado = 'cerrado' WHERE id = ?`).run(id);   // como lo deja el cierre del mes
  const v = await m('POST', `/api/mantenimiento/novedades/${id}/verificar`, {});
  assert.equal(v.status, 200);
  assert.equal(db.prepare('SELECT estado FROM vuelos WHERE id = ?').get(id).estado, 'cerrado');
});

test('una novedad de un vuelo anulado no aparece', async () => {
  const r = await p('POST', '/api/vuelos', { avion_id: 1, fecha: util.hoy(), horas: '0,7', hora_salida: '15:00', hora_llegada: '15:42', notas: 'Se cargó dos veces' });
  const id = (await r.json()).vuelo.id;
  assert.equal((await json(await m('GET', '/api/mantenimiento/novedades'))).novedades.length, 1);
  assert.equal((await a('POST', `/api/vuelos/${id}/anular`, { motivo: 'Duplicado' })).status, 200);
  assert.equal((await json(await m('GET', '/api/mantenimiento/novedades'))).novedades.length, 0);
});
