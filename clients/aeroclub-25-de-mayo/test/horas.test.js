// Tests del historial de horas del piloto: totales desde el principio y planilla CSV para descargar.
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const os = require('os');
const fs = require('fs');
const path = require('path');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'a25-horas-'));
process.env.DATA_DIR = dir;
process.env.DB_PATH = path.join(dir, 'test.sqlite');
process.env.ADMIN_PASSWORD = 'admin-test-123';

const bcrypt = require('bcryptjs');
const { db } = require('../server/db');
const flota = require('../server/services/flota');
const vuelos = require('../server/services/vuelos');
const app = require('../server/index');

const server = app.listen(0);
const base = `http://127.0.0.1:${server.address().port}`;
after(() => server.close());

const admin = { id: 1, rol: 'admin' };
for (const avion of [1, 2]) {
  flota.nuevaTarifa(avion, { tipo: 'solo', precio_hora: 8000000, vigente_desde: '2020-01-01' }, admin);
  flota.nuevaTarifa(avion, { tipo: 'instruccion', precio_hora: 9500000, vigente_desde: '2020-01-01' }, admin);
}
const HASH = bcrypt.hashSync('clave-1234', 4);
const usuario = (nombre, apellido, instructor = 0) => Number(db.prepare(`INSERT INTO usuarios (nombre, apellido, email, rol, es_instructor, password_hash, debe_cambiar_password)
  VALUES (?, ?, ?, 'piloto', ?, ?, 0)`).run(nombre, apellido, `${nombre.toLowerCase()}@test.com`, instructor, HASH).lastInsertRowid);
const ana = usuario('Ana', 'Gómez');
const juan = usuario('Juan', 'Pérez');
const carlos = usuario('Carlos', 'Instructor', 1);

const vuelo = (piloto, avion, fecha, salida, llegada, extra = {}) =>
  vuelos.crear({ piloto_id: piloto, avion_id: avion, fecha, hora_salida: salida, hora_llegada: llegada, ...extra }, admin).vuelo;
vuelo(ana, 1, '2025-03-14', '10:00', '11:00', { con_instructor: true, instructor_id: carlos });            // 1,0 h
vuelo(ana, 2, '2026-06-02', '09:00', '10:30', { notas: '=SUMA(A1) aceite bajo' });                          // 1,5 h
vuelo(ana, 1, '2026-08-20', '15:00', '15:30', { con_instructor: true, instructor_id: carlos });             // 0,5 h
const anulado = vuelo(ana, 1, '2026-08-21', '15:00', '17:00');
vuelos.anular(anulado.id, 'Cargado dos veces', admin);
vuelo(juan, 1, '2026-08-22', '10:00', '12:00');                                                           // no es de Ana

async function entrar(email, password = 'clave-1234') {
  const r = await fetch(`${base}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-A25': '1' }, body: JSON.stringify({ email, password }) });
  assert.equal(r.status, 200, `login de ${email}`);
  const cookie = r.headers.get('set-cookie').split(';')[0];
  return (url) => fetch(`${base}${url}`, { headers: { 'X-A25': '1', cookie } });
}

test('el piloto ve sus horas desde el principio, sin anulados ni vuelos ajenos', async () => {
  const pedir = await entrar('ana@test.com');
  const h = await (await pedir('/api/mis-horas')).json();
  assert.equal(h.vuelos, 3);
  assert.equal(h.decimas, 30);
  assert.equal(h.decimas_instruccion, 15);
  assert.equal(h.desde, '2025-03-14');
  assert.deepEqual(h.por_avion.map(a => [a.matricula, a.vuelos, a.decimas]), [['LV-APH', 2, 15], ['LV-XUG', 1, 15]]);
});

test('el piloto descarga su planilla de horas en CSV', async () => {
  const pedir = await entrar('ana@test.com');
  const r = await pedir('/api/mis-horas?formato=csv');
  assert.equal(r.status, 200);
  assert.match(r.headers.get('content-type'), /text\/csv/);
  assert.match(r.headers.get('content-disposition'), /filename="horas-gomez-ana-\d{4}-\d{2}-\d{2}\.csv"/);
  const crudo = Buffer.from(await r.arrayBuffer());
  assert.deepEqual([...crudo.subarray(0, 3)], [0xEF, 0xBB, 0xBF]);   // BOM: Excel lo abre con acentos
  const filas = crudo.subarray(3).toString('utf8').split('\r\n');
  assert.equal(filas[0], 'Fecha;Salida;Llegada;Avión;Modelo;Instructor;Tipo;Horas;Novedades');
  assert.equal(filas[1], '14/03/2025;10:00;11:00;LV-APH;Cessna 152;Carlos Instructor;Con instructor;1,0;');
  assert.equal(filas[2], "02/06/2026;09:00;10:30;LV-XUG;Piper PA-11;;Solo;1,5;'=SUMA(A1) aceite bajo");   // fórmula neutralizada
  assert.equal(filas[3], '20/08/2026;15:00;15:30;LV-APH;Cessna 152;Carlos Instructor;Con instructor;0,5;');
  assert.equal(filas[4], '');
  assert.equal(filas[5], 'Total;3 vuelos;;;;;;3,0;');
  assert.equal(filas.length, 6);
});

test('el instructor descarga las horas que dio; un piloto común no puede pedir eso', async () => {
  const instructor = await entrar('carlos@test.com');
  const h = await (await instructor('/api/mis-horas?como=instructor')).json();
  assert.equal(h.vuelos, 2);
  assert.equal(h.decimas, 15);
  const filas = (await (await instructor('/api/mis-horas?formato=csv&como=instructor')).text()).split('\r\n');   // text() ya saca el BOM
  assert.equal(filas[0], 'Fecha;Salida;Llegada;Avión;Modelo;Alumno;Horas;Novedades');
  assert.equal(filas[1], '14/03/2025;10:00;11:00;LV-APH;Cessna 152;Ana Gómez;1,0;');
  assert.equal(filas.at(-1), 'Total;2 vuelos;;;;;1,5;');

  // Juan no es instructor: "como=instructor" se ignora y recibe sólo lo suyo.
  const pedirJuan = await entrar('juan@test.com');
  const hj = await (await pedirJuan('/api/mis-horas?como=instructor')).json();
  assert.equal(hj.vuelos, 1);
  assert.equal(hj.decimas, 20);
});

test('sin sesión no se descarga nada', async () => {
  assert.equal((await fetch(`${base}/api/mis-horas?formato=csv`)).status, 401);
});
