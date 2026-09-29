// Tabla de servicios (hangaraje, combustible, nocturno, derecho de aeronave, etc.).
// El precio es por unidad y lo cambia tesorería; cada ticket guarda el precio del día.
const { db, auditar } = require('../db');
const { ErrorNegocio, fmtPesos, limpiarTexto, UNIDADES } = require('../util');

const CODIGO_DERECHO = 'derecho_aeronave';

function listar({ incluirInactivos = false } = {}) {
  return db.prepare(`SELECT * FROM servicios ${incluirInactivos ? '' : 'WHERE activo = 1'} ORDER BY activo DESC, orden, nombre`).all();
}

function getServicio(id) {
  const s = db.prepare('SELECT * FROM servicios WHERE id = ?').get(id);
  if (!s) throw new ErrorNegocio('Servicio inexistente', 404);
  return s;
}

// El derecho de aeronave se cobra solo en el cierre. Si está inactivo o sin precio, no se cobra.
function derechoAeronave() {
  const s = db.prepare('SELECT * FROM servicios WHERE codigo = ?').get(CODIGO_DERECHO);
  return s && s.activo && s.precio > 0 ? s : null;
}

// `precio` ya viene en centavos (la ruta lo parsea).
function guardar(input, actor, id = null) {
  const nombre = limpiarTexto(input.nombre, 60);
  if (!nombre) throw new ErrorNegocio('Indicá el nombre del servicio');
  const unidad = input.unidad;
  if (!Object.hasOwn(UNIDADES, unidad)) throw new ErrorNegocio('Elegí la unidad en que se cobra');
  const precio = input.precio;
  if (!Number.isInteger(precio) || precio < 0) throw new ErrorNegocio('Precio inválido');
  const activo = input.activo === false || input.activo === 0 ? 0 : 1;

  try {
    if (id == null) {
      const r = db.prepare('INSERT INTO servicios (nombre, unidad, precio, orden) VALUES (?, ?, ?, (SELECT COALESCE(MAX(orden),0)+1 FROM servicios))')
        .run(nombre, unidad, precio);
      auditar(actor.id, 'servicio.alta', `${nombre}: ${fmtPesos(precio)} por ${UNIDADES[unidad][0]}`);
      return Number(r.lastInsertRowid);
    }
    const antes = getServicio(id);
    db.prepare('UPDATE servicios SET nombre = ?, unidad = ?, precio = ?, activo = ? WHERE id = ?').run(nombre, unidad, precio, activo, id);
    const cambios = [];
    if (antes.nombre !== nombre) cambios.push(`nombre: ${antes.nombre} → ${nombre}`);
    if (antes.unidad !== unidad) cambios.push(`unidad: ${antes.unidad} → ${unidad}`);
    if (antes.precio !== precio) cambios.push(`precio: ${fmtPesos(antes.precio)} → ${fmtPesos(precio)}`);
    if (antes.activo !== activo) cambios.push(activo ? 'reactivado' : 'dado de baja');
    if (cambios.length) auditar(actor.id, 'servicio.edicion', `${nombre}: ${cambios.join('; ')}`);
    return id;
  } catch (e) {
    if (String(e.message).includes('UNIQUE')) throw new ErrorNegocio('Ya existe un servicio con ese nombre');
    throw e;
  }
}

module.exports = { listar, getServicio, derechoAeronave, guardar, CODIGO_DERECHO };
