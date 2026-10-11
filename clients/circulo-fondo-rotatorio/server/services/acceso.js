// Permisos y alcance. Cada servicio controla lo suyo con exigir() y exigirSede(): aunque alguien arme
// una llamada a mano, el servidor no hace nada que su rol no tenga habilitado.

const { db } = require('../db');
const { ErrorNegocio } = require('../util');

let cache = null;
function matriz() {
  if (!cache) {
    cache = {};
    for (const { rol, permiso } of db.prepare('SELECT rol, permiso FROM roles_permisos').all()) (cache[rol] ||= new Set()).add(permiso);
  }
  return cache;
}
function invalidar() { cache = null; }

function puede(actor, permiso) { return !!actor && !!matriz()[actor.rol]?.has(permiso); }
function permisosDe(rol) { return [...(matriz()[rol] || [])].sort(); }

function exigir(actor, permiso, mensaje) {
  if (!puede(actor, permiso)) throw new ErrorNegocio(mensaje || 'Tu usuario no tiene permiso para hacer esto', 403);
}

// Los usuarios de una sede sólo ven y operan su sede; la Central (y el superadmin) ven todas.
function veTodas(actor) { return puede(actor, 'sedes.ver_todas'); }
function exigirSede(actor, sedeId) {
  if (veTodas(actor)) return;
  if (Number(sedeId) !== actor.sede_id) throw new ErrorNegocio('Esa información es de otra sede', 403);
}
// Sede sobre la que se pide algo: la del usuario, o la elegida si ve todas.
function sedeDe(actor, pedida) {
  if (!veTodas(actor)) return actor.sede_id;
  if (pedida == null || pedida === '') throw new ErrorNegocio('Elegí una sede');
  return Number(pedida);
}

const qSede = db.prepare('SELECT * FROM sedes WHERE id = ?');
function sedeOperativa(id) {
  const s = qSede.get(Number(id));
  if (!s) throw new ErrorNegocio('Sede inexistente', 404);
  if (s.es_central) throw new ErrorNegocio('La Sede Central no rinde fondo rotatorio: elegí una sede');
  if (!s.activa) throw new ErrorNegocio(`${s.nombre} está dada de baja`);
  return s;
}

module.exports = { puede, permisosDe, exigir, exigirSede, veTodas, sedeDe, sedeOperativa, invalidar };
