// Tests de verificación de email y pedido de cambio de datos (Resend simulado, no sale ningún mail).
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const os = require('os');
const fs = require('fs');
const path = require('path');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'a25-mail-'));
process.env.DATA_DIR = dir;
process.env.DB_PATH = path.join(dir, 'test.sqlite');
process.env.ADMIN_PASSWORD = 'admin-test-123';
process.env.RESEND_API_KEY = 're_test';

// Las llamadas a Resend se guardan en `enviados`; el resto (el servidor de prueba) pasa de largo.
const enviados = [];
const fetchReal = global.fetch;
global.fetch = async (url, opciones) => {
  if (String(url).startsWith('https://api.resend.com/')) {
    enviados.push(JSON.parse(opciones.body));
    return new Response(JSON.stringify({ id: `mail-${enviados.length}` }), { status: 200 });
  }
  return fetchReal(url, opciones);
};

const bcrypt = require('bcryptjs');
const { db } = require('../server/db');
const app = require('../server/index');

const server = app.listen(0);
const base = `http://127.0.0.1:${server.address().port}`;
after(() => server.close());

db.prepare(`UPDATE usuarios SET debe_cambiar_password = 0 WHERE rol = 'admin'`).run();
const piloto = Number(db.prepare(`INSERT INTO usuarios (nombre, apellido, email, telefono, rol, password_hash, debe_cambiar_password)
  VALUES ('Lucía', 'Pérez', 'lucia@test.com', '2345 401234', 'piloto', ?, 0)`).run(bcrypt.hashSync('clave-1234', 4)).lastInsertRowid);

async function entrar(email, password) {
  const r = await fetch(`${base}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-A25': '1' }, body: JSON.stringify({ email, password }) });
  assert.equal(r.status, 200, `login de ${email}`);
  const cookie = r.headers.get('set-cookie').split(';')[0];
  return (metodo, url, cuerpo) => fetch(`${base}${url}`, {
    method: metodo, headers: { 'Content-Type': 'application/json', 'X-A25': '1', cookie }, body: cuerpo ? JSON.stringify(cuerpo) : undefined
  });
}
const linkDe = (m) => m.text.match(/https?:\/\/\S+\/verificar-email\/\S+/)[0];

test('el piloto verifica su email con el link del mail', async () => {
  const p = await entrar('lucia@test.com', 'clave-1234');
  assert.equal((await (await p('GET', '/api/auth/me')).json()).usuario.email_verificado, false);

  const r = await p('POST', '/api/auth/verificar-email', {});
  assert.equal(r.status, 200);
  assert.equal(enviados.length, 1);
  assert.deepEqual(enviados[0].to, ['lucia@test.com']);
  assert.match(enviados[0].html, /Confirmar mi email/);
  assert.equal((await p('POST', '/api/auth/verificar-email', {})).status, 429);   // no se reenvía enseguida

  const link = linkDe(enviados[0]);
  const confirmado = await fetch(link.replace(/^https?:\/\/[^/]+/, base));
  assert.equal(confirmado.status, 200);
  assert.match(await confirmado.text(), /Email confirmado/);
  assert.equal((await (await p('GET', '/api/auth/me')).json()).usuario.email_verificado, true);
  assert.equal((await fetch(link.replace(/^https?:\/\/[^/]+/, base))).status, 410);   // un solo uso
  assert.equal((await p('POST', '/api/auth/verificar-email', {})).status, 400);       // ya está verificado
});

test('un link vencido o inventado no verifica', async () => {
  assert.equal((await fetch(`${base}/verificar-email/no-existe`)).status, 410);
});

test('si tesorería le cambia el email, vuelve a quedar sin verificar; tesorería puede mandarle el link', async () => {
  const a = await entrar('tesoreria@aeroclub25demayo.com.ar', 'admin-test-123');
  const r = await a('PUT', `/api/admin/usuarios/${piloto}`, { nombre: 'Lucía', apellido: 'Pérez', email: 'lucia.nueva@test.com', telefono: '2345 401234' });
  assert.equal(r.status, 200);
  assert.equal(db.prepare('SELECT email_verificado_en FROM usuarios WHERE id = ?').get(piloto).email_verificado_en, null);

  db.prepare(`UPDATE usuarios SET verif_enviado_en = NULL WHERE id = ?`).run(piloto);
  const v = await a('POST', `/api/admin/usuarios/${piloto}/verificar-email`);
  assert.equal(v.status, 200);
  assert.deepEqual(enviados.at(-1).to, ['lucia.nueva@test.com']);
  const lista = await (await a('GET', '/api/admin/usuarios')).json();
  assert.equal(lista.usuarios.find(u => u.id === piloto).email_verificado_en, null);
});

test('el pedido de cambio de datos le llega por mail a tesorería', async () => {
  db.prepare(`UPDATE config SET valor = 'cuentas@club.com' WHERE clave = 'email_tesoreria'`).run();
  const p = await entrar('lucia.nueva@test.com', 'clave-1234');
  const c = await (await p('GET', '/api/perfil/contacto')).json();
  assert.deepEqual(c, { email: 'cuentas@club.com', envio_directo: true });
  assert.equal((await p('POST', '/api/perfil/pedido-cambio', { texto: ' ' })).status, 400);
  const r = await p('POST', '/api/perfil/pedido-cambio', { texto: 'Mi celular nuevo es 2345 409999' });
  assert.equal(r.status, 200);
  const m = enviados.at(-1);
  assert.deepEqual(m.to, ['cuentas@club.com']);
  assert.equal(m.reply_to, 'lucia.nueva@test.com');
  assert.match(m.subject, /Lucía Pérez/);
  assert.match(m.text, /2345 409999/);
});

test('si Resend falla, se avisa sin romper nada', async () => {
  const antes = global.fetch;
  global.fetch = async (url, o) => (String(url).startsWith('https://api.resend.com/') ? new Response('{}', { status: 500 }) : fetchReal(url, o));
  try {
    const p = await entrar('lucia.nueva@test.com', 'clave-1234');
    const r = await p('POST', '/api/perfil/pedido-cambio', { texto: 'Algo' });
    assert.equal(r.status, 502);
    assert.match((await r.json()).error, /No se pudo mandar el mail/);
  } finally { global.fetch = antes; }
});
