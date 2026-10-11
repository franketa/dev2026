// Solicitudes de gasto: lo que no es fijo y supera los topes de caja chica necesita la aprobación de la
// Sede Central antes de pagarse. La Central las resuelve desde su panel diario.
//
//   pendiente ──▶ en_revision (se consulta con el Presidente) ──▶ aprobada / rechazada
//   pendiente ──▶ aprobada / rechazada
//   aprobada ──▶ ejecutada (cuando se registra el pago; ver gastos.js)

const { db } = require('../db');
const acceso = require('./acceso');
const proveedores = require('./proveedores');
const admin = require('./admin');
const { auditar } = require('./auditoria');
const { notificar } = require('./notificaciones');
const { ErrorNegocio, centavos, limpiarTexto, periodoActual, fmtPesos } = require('../util');

const ESTADOS = { pendiente: 'Pendiente', en_revision: 'En revisión', aprobada: 'Aprobada', rechazada: 'Rechazada', ejecutada: 'Ejecutada' };

const SELECT = `SELECT so.*, s.nombre AS sede_nombre, p.razon_social AS proveedor, p.cuit AS proveedor_cuit,
    r.nombre AS rubro_nombre, rp.nombre AS rubro_padre,
    u.nombre || ' ' || u.apellido AS creado_por_nombre, x.nombre || ' ' || x.apellido AS resuelto_por_nombre,
    (SELECT COUNT(*) FROM adjuntos a WHERE a.entidad = 'solicitud' AND a.entidad_id = so.id AND a.activo = 1) AS adjuntos
  FROM solicitudes so JOIN sedes s ON s.id = so.sede_id LEFT JOIN proveedores p ON p.id = so.proveedor_id
  LEFT JOIN rubros r ON r.id = so.rubro_id LEFT JOIN rubros rp ON rp.id = r.padre_id
  JOIN usuarios u ON u.id = so.creado_por LEFT JOIN usuarios x ON x.id = so.resuelto_por`;

const presentar = (s) => s && { ...s, rubro_completo: s.rubro_padre ? `${s.rubro_padre} › ${s.rubro_nombre}` : s.rubro_nombre };

const crear = db.transaction((actor, datos) => {
  acceso.exigir(actor, 'solicitudes.crear', 'Las solicitudes de gasto las crea el jefe de sede');
  const sede = acceso.sedeOperativa(actor.sede_id);
  const descripcion = limpiarTexto(datos.descripcion, 1000);
  const monto = centavos(datos.monto_estimado);
  if (!descripcion || descripcion.length < 5) throw new ErrorNegocio('Contá qué hay que pagar y por qué');
  if (!monto) throw new ErrorNegocio('Indicá el monto estimado');
  const proveedor = datos.proveedor_id ? proveedores.porId(datos.proveedor_id) : null;
  if (datos.proveedor_id && !proveedor) throw new ErrorNegocio('Proveedor inexistente');
  const rubro = datos.rubro_id ? admin.rubroImputable(datos.rubro_id) : null;
  const medio = datos.medio_previsto && ['transferencia', 'efectivo'].includes(datos.medio_previsto) ? datos.medio_previsto : null;
  const fila = { sede_id: sede.id, periodo: periodoActual(), descripcion, monto_estimado: monto, proveedor_id: proveedor?.id ?? null, rubro_id: rubro?.id ?? null, medio_previsto: medio, creado_por: actor.id };
  const id = Number(db.prepare(`INSERT INTO solicitudes (sede_id, periodo, descripcion, monto_estimado, proveedor_id, rubro_id, medio_previsto, creado_por)
    VALUES (@sede_id, @periodo, @descripcion, @monto_estimado, @proveedor_id, @rubro_id, @medio_previsto, @creado_por)`).run(fila).lastInsertRowid);
  db.prepare(`INSERT INTO solicitudes_historial (solicitud_id, de, a, usuario_id) VALUES (?, NULL, 'pendiente', ?)`).run(id, actor.id);
  auditar(actor, { accion: 'solicitud.alta', sedeId: sede.id, entidad: 'solicitud', entidadId: id, despues: fila });
  notificar({ central: true }, {
    permiso: 'solicitudes.resolver', tipo: 'alerta', link: '#/central/panel',
    texto: `Nueva solicitud de ${sede.nombre}: ${descripcion.slice(0, 80)} (${fmtPesos(monto)}).`
  });
  return id;
});

const TRANSICIONES = {
  pendiente: { a: ['en_revision', 'aprobada', 'rechazada'], permiso: 'solicitudes.resolver' },
  en_revision: { a: ['aprobada', 'rechazada'], permiso: 'solicitudes.resolver_escaladas' }
};

const resolver = db.transaction((actor, id, { estado, comentario, quien_paga }) => {
  const s = db.prepare(`${SELECT} WHERE so.id = ?`).get(Number(id));
  if (!s) throw new ErrorNegocio('Solicitud inexistente', 404);
  const t = TRANSICIONES[s.estado];
  if (!t) throw new ErrorNegocio(`La solicitud ya está ${ESTADOS[s.estado].toLowerCase()}`, 409);
  acceso.exigir(actor, t.permiso, s.estado === 'en_revision' ? 'Esta solicitud está en revisión: la resuelve el Presidente o la administración de la Central' : 'Las solicitudes las resuelve la administración de la Sede Central');
  if (!t.a.includes(estado)) throw new ErrorNegocio('Ese cambio de estado no corresponde');
  comentario = limpiarTexto(comentario, 500);
  if (estado === 'rechazada' && !comentario) throw new ErrorNegocio('Contale a la sede por qué se rechaza');
  if (estado === 'aprobada' && !['sede', 'central'].includes(quien_paga)) throw new ErrorNegocio('Indicá quién paga: la sede con su fondo o la Central directo al proveedor');
  const paga = estado === 'aprobada' ? quien_paga : null;
  db.prepare(`UPDATE solicitudes SET estado = ?, quien_paga = ?, comentario = ?, resuelto_por = ?, resuelto_en = datetime('now'), actualizado_en = datetime('now') WHERE id = ?`)
    .run(estado, paga, comentario, actor.id, s.id);
  db.prepare(`INSERT INTO solicitudes_historial (solicitud_id, de, a, quien_paga, comentario, usuario_id) VALUES (?, ?, ?, ?, ?, ?)`)
    .run(s.id, s.estado, estado, paga, comentario, actor.id);
  auditar(actor, { accion: 'solicitud.estado', sedeId: s.sede_id, entidad: 'solicitud', entidadId: s.id, antes: { estado: s.estado }, despues: { estado, quien_paga: paga }, motivo: comentario });

  const resumen = `"${s.descripcion.slice(0, 60)}" (${fmtPesos(s.monto_estimado)})`;
  const textos = {
    aprobada: paga === 'central' ? `Aprobada la solicitud ${resumen}. La paga la Sede Central directo al proveedor.` : `Aprobada la solicitud ${resumen}. Ya podés pagarla con el fondo y cargar el gasto.`,
    rechazada: `Rechazada la solicitud ${resumen}: ${comentario}`,
    en_revision: `La solicitud ${resumen} pasó a revisión: se consulta con el Presidente.`
  };
  notificar({ sedeId: s.sede_id }, { tipo: estado === 'aprobada' ? 'ok' : estado === 'rechazada' ? 'mal' : 'info', link: `#/solicitudes/${s.id}`, texto: textos[estado] });
  if (estado === 'en_revision') {
    notificar({ central: true }, { permiso: 'solicitudes.resolver_escaladas', excepto: actor.id, tipo: 'alerta', link: '#/central/panel', texto: `Solicitud de ${s.sede_nombre} para revisar: ${resumen}${comentario ? ` — ${comentario}` : ''}` });
  }
  if (estado === 'aprobada' && paga === 'central') {
    notificar({ central: true }, { permiso: 'gastos.pago_central', excepto: actor.id, tipo: 'info', link: '#/central/panel', texto: `Para pagar: solicitud de ${s.sede_nombre} ${resumen}, aprobada con pago directo de la Central.` });
  }
});

function listar(actor, { sede_id, estado, desde } = {}) {
  const w = []; const args = [];
  if (acceso.veTodas(actor)) { if (sede_id) { w.push('so.sede_id = ?'); args.push(Number(sede_id)); } }
  else { w.push('so.sede_id = ?'); args.push(actor.sede_id); }
  if (estado) {
    const estados = String(estado).split(',').filter(e => ESTADOS[e]);
    if (estados.length) { w.push(`so.estado IN (${estados.map(() => '?').join(',')})`); args.push(...estados); }
  }
  if (desde) { w.push('so.creado_en >= ?'); args.push(desde); }
  return db.prepare(`${SELECT} ${w.length ? 'WHERE ' + w.join(' AND ') : ''} ORDER BY so.id DESC LIMIT 300`).all(...args).map(presentar);
}

function detalle(actor, id) {
  const s = presentar(db.prepare(`${SELECT} WHERE so.id = ?`).get(Number(id)));
  if (!s) throw new ErrorNegocio('Solicitud inexistente', 404);
  acceso.exigirSede(actor, s.sede_id);
  return {
    solicitud: s,
    historial: db.prepare(`SELECT h.*, u.nombre || ' ' || u.apellido AS usuario FROM solicitudes_historial h LEFT JOIN usuarios u ON u.id = h.usuario_id WHERE solicitud_id = ? ORDER BY h.id`).all(s.id),
    adjuntos: db.prepare(`SELECT id, nombre, mime, bytes, subido_en FROM adjuntos WHERE entidad = 'solicitud' AND entidad_id = ? AND activo = 1`).all(s.id)
  };
}

// Aprobadas y todavía sin pagar, para vincular al cargar el gasto.
function aprobadasParaPagar(sedeId, quienPaga) {
  return db.prepare(`${SELECT} WHERE so.sede_id = ? AND so.estado = 'aprobada' AND so.quien_paga = ? ORDER BY so.id`).all(sedeId, quienPaga).map(presentar);
}

module.exports = { ESTADOS, crear, resolver, listar, detalle, aprobadasParaPagar };
