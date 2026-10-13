// Novedades de la flota: lo que anotan los pilotos al cargar el vuelo (aceite, cubiertas, radio).
// Mantenimiento las revisa y las marca como verificadas: ahí salen de los paneles, pero quedan en
// el historial con quién, cuándo y el comentario.
const { db, auditar, getConfig } = require('../db');
const mail = require('./mail');
const { ErrorNegocio, limpiarTexto, esPeriodo, fmtFechaCorta } = require('../util');

const SELECT = `
  SELECT v.id, v.fecha, v.hora_salida, v.hora_llegada, v.notas, v.avion_id, v.creado_en,
         nr.revisada_en novedad_revisada_en, nr.comentario novedad_comentario,
         a.matricula, a.modelo, a.orden,
         p.nombre || ' ' || p.apellido piloto,
         r.nombre || ' ' || r.apellido revisada_por_nombre
  FROM vuelos v
  JOIN aviones a ON a.id = v.avion_id
  JOIN usuarios p ON p.id = v.piloto_id
  LEFT JOIN novedades_revisadas nr ON nr.vuelo_id = v.id
  LEFT JOIN usuarios r ON r.id = nr.revisada_por
  WHERE v.estado <> 'anulado' AND v.notas IS NOT NULL AND trim(v.notas) <> ''`;

// estado: 'pendiente' (sin verificar) o 'verificada'. Las verificadas se pueden filtrar por mes.
function listar({ estado = 'pendiente', avionId = null, periodo = null, limite = 200 } = {}) {
  const where = [estado === 'verificada' ? 'nr.vuelo_id IS NOT NULL' : 'nr.vuelo_id IS NULL'];
  const params = {};
  if (avionId) { where.push('v.avion_id = @avion'); params.avion = Number(avionId); }
  if (periodo && esPeriodo(periodo)) { where.push(`substr(${estado === 'verificada' ? "datetime(nr.revisada_en, '-3 hours')" : 'v.fecha'}, 1, 7) = @periodo`); params.periodo = periodo; }
  const orden = estado === 'verificada' ? 'nr.revisada_en DESC, v.id DESC' : 'v.fecha DESC, v.id DESC';
  return db.prepare(`${SELECT} AND ${where.join(' AND ')} ORDER BY ${orden} LIMIT ${Math.min(Number(limite) || 200, 500)}`).all(params);
}

const revisar = db.transaction((vueloId, comentario, actor) => {
  const v = db.prepare(`${SELECT} AND v.id = ?`).get(vueloId);
  if (!v) throw new ErrorNegocio('Novedad inexistente', 404);
  if (v.novedad_revisada_en) throw new ErrorNegocio(v.revisada_por_nombre ? `Ya la verificó ${v.revisada_por_nombre}` : 'Esa novedad ya está revisada', 409);
  comentario = limpiarTexto(comentario, 300);
  db.prepare('INSERT INTO novedades_revisadas (vuelo_id, revisada_por, comentario) VALUES (?, ?, ?)').run(vueloId, actor.id, comentario);
  auditar(actor.id, 'novedad.verificada', `${v.matricula} del ${v.fecha} (${v.piloto}): "${v.notas.slice(0, 120)}"${comentario ? `. Comentario: ${comentario}` : ''}`);
  return db.prepare(`${SELECT} AND v.id = ?`).get(vueloId);
});

// Los responsables de mantenimiento: por rol o pilotos con el tilde, activos y con email.
function responsables() {
  return db.prepare(`SELECT id, nombre, apellido, email FROM usuarios
    WHERE activo = 1 AND email IS NOT NULL AND (rol = 'mantenimiento' OR es_mantenimiento = 1) ORDER BY id`).all();
}

// Cada novedad nueva le llega por mail a mantenimiento. No frena la carga del vuelo: si un mail
// falla, queda en el log y la novedad igual aparece en el sistema. Al que la escribió no se le manda.
async function avisarMantenimiento(vueloId, autorId = null) {
  if (!mail.configurado()) return 0;
  const v = db.prepare(`${SELECT} AND v.id = ?`).get(vueloId);
  if (!v || v.novedad_revisada_en) return 0;
  const para = responsables().filter(u => u.id !== autorId);
  if (!para.length) return 0;
  const link = `${(getConfig().url_publica || 'https://aeroclub25demayo.com.ar').replace(/\/$/, '')}/app#/mantenimiento`;
  const horario = v.hora_salida ? ` (${v.hora_salida} a ${v.hora_llegada})` : '';
  let enviados = 0;
  for (const u of para) {
    try {
      await mail.enviar({
        para: u.email,
        asunto: `Novedad en ${v.matricula}: ${v.notas.replace(/\s+/g, ' ').slice(0, 60)}`,
        html: mail.plantilla({
          titulo: `Novedad en ${v.matricula}`,
          parrafos: [
            `Hola ${mail.escapar(u.nombre)}: <b>${mail.escapar(v.piloto)}</b> anotó una novedad al cargar su vuelo del ${fmtFechaCorta(v.fecha)}${horario} en <b>${mail.escapar(v.matricula)}</b> (${mail.escapar(v.modelo)}):`,
            `<span style="display:block;padding:12px 14px;background:#fbf0dc;border-radius:8px;white-space:pre-line">${mail.escapar(v.notas)}</span>`,
            'Cuando la revises, marcala como verificada en el sistema.'
          ],
          boton: { texto: 'Ver novedades', url: link },
          pie: 'Te llega porque sos responsable de mantenimiento en el sistema del aeroclub.'
        }),
        texto: `Hola ${u.nombre}: ${v.piloto} anotó una novedad al cargar su vuelo del ${fmtFechaCorta(v.fecha)}${horario} en ${v.matricula} (${v.modelo}):\n\n${v.notas}\n\nCuando la revises, marcala como verificada: ${link}`
      });
      enviados++;
    } catch (e) {
      console.error(`[novedades] no se pudo avisar a ${u.email}:`, e.message);
    }
  }
  if (enviados) auditar(null, 'novedad.aviso', `${v.matricula} del ${v.fecha}: aviso por mail a ${enviados} de mantenimiento`);
  return enviados;
}

module.exports = { listar, revisar, avisarMantenimiento, responsables };
