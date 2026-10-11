// Avisos dentro del sistema (campana). Se mandan a los usuarios activos que tienen un permiso,
// de una sede o de toda la Central.

const { db, sedeCentral } = require('../db');
const { permisosDe } = require('./acceso');
const { ROLES } = require('../permisos');

const qIns = db.prepare('INSERT INTO notificaciones (usuario_id, texto, link, tipo) VALUES (?, ?, ?, ?)');

function rolesCon(permiso) { return Object.keys(ROLES).filter(r => permisosDe(r).includes(permiso)); }

// destino: { sedeId } usuarios de esa sede · { central: true } usuarios de la Central · { usuarioId }.
// permiso: si viene, sólo a quienes lo tienen.
function notificar(destino, { texto, link = null, tipo = 'info', permiso = null, excepto = null }) {
  let usuarios;
  if (destino.usuarioId) {
    usuarios = [{ id: destino.usuarioId }];
  } else {
    const sedeId = destino.central ? sedeCentral().id : destino.sedeId;
    const roles = permiso ? rolesCon(permiso) : Object.keys(ROLES);
    if (!roles.length) return 0;
    usuarios = db.prepare(`SELECT id FROM usuarios WHERE activo = 1 AND sede_id = ? AND rol IN (${roles.map(() => '?').join(',')})`).all(sedeId, ...roles);
  }
  let n = 0;
  for (const u of usuarios) if (u.id !== excepto) { qIns.run(u.id, texto, link, tipo); n++; }
  return n;
}

function listar(usuarioId, limite = 40) {
  return db.prepare('SELECT * FROM notificaciones WHERE usuario_id = ? ORDER BY id DESC LIMIT ?').all(usuarioId, limite);
}
function sinLeer(usuarioId) { return db.prepare('SELECT COUNT(*) n FROM notificaciones WHERE usuario_id = ? AND leida = 0').get(usuarioId).n; }
function marcarLeidas(usuarioId) { db.prepare('UPDATE notificaciones SET leida = 1 WHERE usuario_id = ? AND leida = 0').run(usuarioId); }

module.exports = { notificar, listar, sinLeer, marcarLeidas };
