// Escenario de prueba: base nueva en una carpeta temporal, la Central con saldo, una sede (Vicente López)
// con sus tres roles, otra sede (Córdoba) y la Central con administrador y Presidente.

const fs = require('fs');
const os = require('os');
const path = require('path');

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'fondo-test-'));
delete process.env.ADMIN_EMAIL;

const bcrypt = require('bcryptjs');
const { db, sedeCentral } = require('../server/db');
const { digitoCuit, periodoActual, sumarMeses } = require('../server/util');

const HASH = bcrypt.hashSync('prueba1234', 4);

function cuit(ocho, prefijo = '30') {
  for (let base = Number(ocho); ; base++) {
    const diez = `${prefijo}${String(base).padStart(8, '0')}`;
    const dv = digitoCuit(diez);
    if (dv !== null) return `${diez}${dv}`;
  }
}

function sede(nombre, codigo) {
  return Number(db.prepare('INSERT INTO sedes (nombre, codigo) VALUES (?, ?)').run(nombre, codigo).lastInsertRowid);
}
function usuario(nombre, rol, sedeId) {
  const id = Number(db.prepare(`INSERT INTO usuarios (nombre, apellido, email, rol, sede_id, password_hash, debe_cambiar_password) VALUES (?, 'Prueba', ?, ?, ?, ?, 0)`)
    .run(nombre, `${nombre.toLowerCase()}@prueba.com`, rol, sedeId, HASH).lastInsertRowid);
  return { id, rol, sede_id: sedeId, ip: '127.0.0.1', nombre };
}

const central = sedeCentral();
const vl = sede('Vicente López', 'VL');
const cba = sede('Córdoba', 'CBA');

const actores = {
  superadmin: usuario('Soporte', 'superadmin', null),
  tesorero: usuario('Tesorero', 'central_admin', central.id),
  presidente: usuario('Presidente', 'presidente', central.id),
  jefe: usuario('Jefe', 'jefe_sede', vl),
  administrativo: usuario('Administrativo', 'administrativo', vl),
  carga: usuario('Carga', 'carga', vl),
  jefeCba: usuario('JefeCba', 'jefe_sede', cba)
};

const rubro = (nombre) => db.prepare('SELECT id FROM rubros WHERE nombre = ?').get(nombre).id;

const PERIODO = periodoActual();
const ANTERIOR = sumarMeses(PERIODO, -1);

module.exports = { db, central, vl, cba, actores, cuit, rubro, PERIODO, ANTERIOR };
