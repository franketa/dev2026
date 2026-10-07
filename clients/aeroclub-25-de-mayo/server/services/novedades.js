// Novedades de la flota: lo que anotan los pilotos al cargar el vuelo (aceite, cubiertas, radio).
// Mantenimiento las revisa y las marca como verificadas: ahí salen de los paneles, pero quedan en
// el historial con quién, cuándo y el comentario.
const { db, auditar } = require('../db');
const { ErrorNegocio, limpiarTexto, esPeriodo } = require('../util');

const SELECT = `
  SELECT v.id, v.fecha, v.hora_salida, v.hora_llegada, v.notas, v.avion_id, v.creado_en,
         v.novedad_revisada_en, v.novedad_comentario,
         a.matricula, a.modelo, a.orden,
         p.nombre || ' ' || p.apellido piloto,
         r.nombre || ' ' || r.apellido revisada_por_nombre
  FROM vuelos v
  JOIN aviones a ON a.id = v.avion_id
  JOIN usuarios p ON p.id = v.piloto_id
  LEFT JOIN usuarios r ON r.id = v.novedad_revisada_por
  WHERE v.estado <> 'anulado' AND v.notas IS NOT NULL AND trim(v.notas) <> ''`;

// estado: 'pendiente' (sin verificar) o 'verificada'. Las verificadas se pueden filtrar por mes.
function listar({ estado = 'pendiente', avionId = null, periodo = null, limite = 200 } = {}) {
  const where = [estado === 'verificada' ? 'v.novedad_revisada_en IS NOT NULL' : 'v.novedad_revisada_en IS NULL'];
  const params = {};
  if (avionId) { where.push('v.avion_id = @avion'); params.avion = Number(avionId); }
  if (periodo && esPeriodo(periodo)) { where.push(`substr(${estado === 'verificada' ? "datetime(v.novedad_revisada_en, '-3 hours')" : 'v.fecha'}, 1, 7) = @periodo`); params.periodo = periodo; }
  const orden = estado === 'verificada' ? 'v.novedad_revisada_en DESC' : 'v.fecha DESC, v.id DESC';
  return db.prepare(`${SELECT} AND ${where.join(' AND ')} ORDER BY ${orden} LIMIT ${Math.min(Number(limite) || 200, 500)}`).all(params);
}

const revisar = db.transaction((vueloId, comentario, actor) => {
  const v = db.prepare(`${SELECT} AND v.id = ?`).get(vueloId);
  if (!v) throw new ErrorNegocio('Novedad inexistente', 404);
  if (v.novedad_revisada_en) throw new ErrorNegocio(`Ya la verificó ${v.revisada_por_nombre}`, 409);
  comentario = limpiarTexto(comentario, 300);
  db.prepare(`UPDATE vuelos SET novedad_revisada_en = datetime('now'), novedad_revisada_por = ?, novedad_comentario = ? WHERE id = ?`)
    .run(actor.id, comentario, vueloId);
  auditar(actor.id, 'novedad.verificada', `${v.matricula} del ${v.fecha} (${v.piloto}): "${v.notas.slice(0, 120)}"${comentario ? `. Comentario: ${comentario}` : ''}`);
  return db.prepare(`${SELECT} AND v.id = ?`).get(vueloId);
});

module.exports = { listar, revisar };
