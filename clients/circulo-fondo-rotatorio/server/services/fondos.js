// Fondos: saldo de la Central, asignación mensual a las sedes, extracciones / depósitos entre banco y
// efectivo, y pedidos de fondos extra (los autoriza el Presidente).

const { db, sedeCentral } = require('../db');
const libro = require('./libro');
const acceso = require('./acceso');
const { auditar } = require('./auditoria');
const { notificar } = require('./notificaciones');
const { ErrorNegocio, hoy, periodoDe, esFecha, esPeriodo, centavos, limpiarTexto, fmtPesos, nombrePeriodo, periodoActual } = require('../util');

const tx = (fn) => db.transaction(fn);

function exigirSaldoCentral(importe) {
  const disponible = libro.saldo(sedeCentral().id, 'banco');
  if (importe > disponible) {
    throw new ErrorNegocio(`La Central no tiene saldo suficiente: tiene ${fmtPesos(disponible)} y hacen falta ${fmtPesos(importe)}. Registrá primero el ingreso de fondos.`, 409, 'SALDO_CENTRAL');
  }
}

// ── Cuenta de la Central ────────────────────────────────────────────────────
const ingresoCentral = tx((actor, datos) => {
  acceso.exigir(actor, 'central.ingresos');
  const importe = centavos(datos.importe);
  if (!importe) throw new ErrorNegocio('Indicá el importe');
  const fecha = esFecha(datos.fecha) ? datos.fecha : hoy();
  const central = sedeCentral();
  const primero = !db.prepare('SELECT 1 FROM movimientos WHERE sede_id = ? LIMIT 1').get(central.id);
  const tipo = datos.saldo_inicial && primero ? 'saldo_inicial' : 'ingreso';
  const concepto = limpiarTexto(datos.concepto, 200) || (tipo === 'saldo_inicial' ? `Saldo inicial al ${fecha.split('-').reverse().join('/')}` : 'Ingreso de fondos');
  const mov = libro.registrar({ sede_id: central.id, cuenta: 'banco', fecha, tipo, concepto, importe, creado_por: actor.id });
  auditar(actor, { accion: tipo === 'saldo_inicial' ? 'central.saldo_inicial' : 'central.ingreso', sedeId: central.id, entidad: 'movimiento', entidadId: mov.id, despues: { importe, fecha, concepto } });
  return mov;
});

// ── Asignación mensual ──────────────────────────────────────────────────────
// Varias sedes de una vez. Cada asignación = la transferencia de la Central a la sede.
const asignar = tx((actor, { periodo, fecha, items }) => {
  acceso.exigir(actor, 'fondos.asignar');
  if (!esPeriodo(periodo)) throw new ErrorNegocio('Elegí el mes');
  fecha = esFecha(fecha) ? fecha : hoy();
  const validos = (items || []).map(it => ({ ...it, importe: centavos(it.importe) })).filter(it => it.importe);
  if (!validos.length) throw new ErrorNegocio('Cargá el monto de al menos una sede');
  const total = validos.reduce((s, it) => s + it.importe, 0);
  exigirSaldoCentral(total);
  const central = sedeCentral();
  const creadas = [];
  for (const it of validos) {
    const sede = acceso.sedeOperativa(it.sede_id);
    if (db.prepare(`SELECT 1 FROM asignaciones WHERE sede_id = ? AND periodo = ? AND tipo = 'mensual' AND estado = 'vigente'`).get(sede.id, periodo)) {
      throw new ErrorNegocio(`${sede.nombre} ya tiene asignado el fondo de ${nombrePeriodo(periodo)}. Si hay que cambiarlo, anulá la asignación y volvé a cargarla.`, 409);
    }
    const referencia = limpiarTexto(it.referencia, 60);
    const id = Number(db.prepare(`INSERT INTO asignaciones (sede_id, periodo, tipo, importe, fecha, referencia, nota, creado_por)
      VALUES (?, ?, 'mensual', ?, ?, ?, ?, ?)`).run(sede.id, periodo, it.importe, fecha, referencia, limpiarTexto(it.nota, 200), actor.id).lastInsertRowid);
    libro.pase({
      desde: { sede_id: central.id, cuenta: 'banco' }, hacia: { sede_id: sede.id, cuenta: 'banco' },
      importe: it.importe, periodo, fecha, tipo: 'asignacion', asignacion_id: id, creado_por: actor.id,
      concepto: `Fondo rotatorio ${nombrePeriodo(periodo)} · ${sede.nombre}${referencia ? ` · transf. ${referencia}` : ''}`
    });
    auditar(actor, { accion: 'fondo.asignacion', sedeId: sede.id, entidad: 'asignacion', entidadId: id, despues: { periodo, fecha, importe: it.importe, referencia } });
    notificar({ sedeId: sede.id }, { texto: `La Sede Central transfirió el fondo de ${nombrePeriodo(periodo)}: ${fmtPesos(it.importe)}.`, link: '#/fondos', tipo: 'ok' });
    creadas.push(id);
  }
  return creadas;
});

const anularAsignacion = tx((actor, id, motivo) => {
  acceso.exigir(actor, 'fondos.asignar');
  motivo = limpiarTexto(motivo, 300);
  if (!motivo) throw new ErrorNegocio('Indicá el motivo de la anulación');
  const a = db.prepare('SELECT * FROM asignaciones WHERE id = ?').get(id);
  if (!a) throw new ErrorNegocio('Asignación inexistente', 404);
  if (a.estado !== 'vigente') throw new ErrorNegocio('Esa asignación ya está anulada');
  if (a.tipo === 'extra') throw new ErrorNegocio('Los fondos extra autorizados no se anulan desde acá');
  const disponible = libro.saldo(a.sede_id, 'banco');
  if (disponible < a.importe) throw new ErrorNegocio(`La sede ya usó parte de ese fondo: tiene ${fmtPesos(disponible)} en banco. No se puede anular la asignación completa.`, 409);
  libro.anularDe({ asignacionId: id }, `asignación anulada: ${motivo}`, actor.id);
  db.prepare(`UPDATE asignaciones SET estado = 'anulada', motivo_anulacion = ?, anulada_por = ?, anulada_en = datetime('now') WHERE id = ?`).run(motivo, actor.id, id);
  auditar(actor, { accion: 'fondo.asignacion_anulada', sedeId: a.sede_id, entidad: 'asignacion', entidadId: id, antes: a, motivo });
  notificar({ sedeId: a.sede_id }, { texto: `Se anuló la asignación de ${fmtPesos(a.importe)} de ${nombrePeriodo(a.periodo)}: ${motivo}`, link: '#/fondos', tipo: 'alerta' });
});

function asignacionesDe(periodo) {
  return db.prepare(`SELECT a.*, s.nombre AS sede_nombre FROM asignaciones a JOIN sedes s ON s.id = a.sede_id
    WHERE a.periodo = ? ORDER BY s.orden, s.nombre, a.id`).all(periodo);
}

// Planilla de asignación: una fila por sede activa, con lo ya asignado y lo del mes anterior como sugerencia.
function planillaAsignacion(periodo) {
  const sedes = db.prepare('SELECT * FROM sedes WHERE es_central = 0 AND activa = 1 ORDER BY orden, nombre').all();
  const prev = (sedeId, p) => db.prepare(`SELECT importe FROM asignaciones WHERE sede_id = ? AND periodo < ? AND tipo = 'mensual' AND estado = 'vigente' ORDER BY periodo DESC LIMIT 1`).get(sedeId, p)?.importe || null;
  return sedes.map(s => {
    const actual = db.prepare(`SELECT * FROM asignaciones WHERE sede_id = ? AND periodo = ? AND tipo = 'mensual' AND estado = 'vigente'`).get(s.id, periodo);
    return { sede_id: s.id, sede_nombre: s.nombre, asignada: actual || null, sugerido: prev(s.id, periodo), saldos: libro.saldos(s.id) };
  });
}

// ── Banco ↔ efectivo ────────────────────────────────────────────────────────
const moverEfectivo = tx((actor, tipo, datos) => {
  acceso.exigir(actor, 'fondos.extraccion');
  const sede = acceso.sedeOperativa(acceso.sedeDe(actor, datos.sede_id));
  acceso.exigirSede(actor, sede.id);
  const importe = centavos(datos.importe);
  if (!importe) throw new ErrorNegocio('Indicá el importe');
  const fecha = esFecha(datos.fecha) ? datos.fecha : hoy();
  if (fecha > hoy()) throw new ErrorNegocio('La fecha no puede ser futura');
  const [desde, hacia] = tipo === 'extraccion' ? ['banco', 'efectivo'] : ['efectivo', 'banco'];
  const disponible = libro.saldo(sede.id, desde);
  if (importe > disponible) throw new ErrorNegocio(`No alcanza: en ${desde} hay ${fmtPesos(disponible)}.`, 409);
  const nota = limpiarTexto(datos.nota, 200);
  const r = libro.pase({
    desde: { sede_id: sede.id, cuenta: desde }, hacia: { sede_id: sede.id, cuenta: hacia },
    importe, fecha, periodo: periodoDe(fecha), tipo, creado_por: actor.id,
    concepto: `${tipo === 'extraccion' ? 'Extracción de efectivo' : 'Depósito de efectivo en banco'}${nota ? ` · ${nota}` : ''}`
  });
  auditar(actor, { accion: `fondo.${tipo}`, sedeId: sede.id, entidad: 'movimiento', entidadId: r.salida.id, despues: { importe, fecha, nota } });
  return r;
});

// ── Pedidos de fondos extra ─────────────────────────────────────────────────
const pedirExtra = tx((actor, datos) => {
  acceso.exigir(actor, 'fondos.pedir_extra');
  const sede = acceso.sedeOperativa(actor.sede_id);
  const importe = centavos(datos.importe);
  const justificacion = limpiarTexto(datos.justificacion, 1000);
  if (!importe) throw new ErrorNegocio('Indicá cuánto necesitás');
  if (!justificacion || justificacion.length < 10) throw new ErrorNegocio('Contá para qué hacen falta los fondos');
  if (db.prepare(`SELECT 1 FROM pedidos_fondos WHERE sede_id = ? AND estado = 'pendiente'`).get(sede.id)) {
    throw new ErrorNegocio('Ya tenés un pedido de fondos pendiente. Esperá la respuesta del Presidente.', 409);
  }
  const s = libro.saldos(sede.id);
  const id = Number(db.prepare(`INSERT INTO pedidos_fondos (sede_id, periodo, importe, justificacion, saldo_banco, saldo_efectivo, pedido_por)
    VALUES (?, ?, ?, ?, ?, ?, ?)`).run(sede.id, periodoActual(), importe, justificacion, s.banco, s.efectivo, actor.id).lastInsertRowid);
  auditar(actor, { accion: 'fondo.pedido_extra', sedeId: sede.id, entidad: 'pedido_fondos', entidadId: id, despues: { importe, justificacion, saldo: s } });
  notificar({ central: true }, {
    permiso: 'fondos.autorizar_extra', tipo: 'alerta', link: '#/central/panel',
    texto: `${sede.nombre} pide ${fmtPesos(importe)} de fondos extra y todavía le quedan ${fmtPesos(s.total)}.`
  });
  return id;
});

const resolverExtra = tx((actor, id, { autorizar, comentario }) => {
  acceso.exigir(actor, 'fondos.autorizar_extra', 'Los fondos extra los autoriza el Presidente');
  const p = db.prepare('SELECT p.*, s.nombre AS sede_nombre FROM pedidos_fondos p JOIN sedes s ON s.id = p.sede_id WHERE p.id = ?').get(id);
  if (!p) throw new ErrorNegocio('Pedido inexistente', 404);
  if (p.estado !== 'pendiente') throw new ErrorNegocio('Ese pedido ya fue resuelto', 409);
  comentario = limpiarTexto(comentario, 500);
  if (!autorizar && !comentario) throw new ErrorNegocio('Contale a la sede por qué se rechaza');
  let asignacionId = null;
  if (autorizar) {
    exigirSaldoCentral(p.importe);
    const fecha = hoy();
    const periodo = periodoDe(fecha);
    asignacionId = Number(db.prepare(`INSERT INTO asignaciones (sede_id, periodo, tipo, importe, fecha, nota, pedido_id, creado_por)
      VALUES (?, ?, 'extra', ?, ?, ?, ?, ?)`).run(p.sede_id, periodo, p.importe, fecha, comentario, p.id, actor.id).lastInsertRowid);
    libro.pase({
      desde: { sede_id: sedeCentral().id, cuenta: 'banco' }, hacia: { sede_id: p.sede_id, cuenta: 'banco' },
      importe: p.importe, periodo, fecha, tipo: 'fondo_extra', asignacion_id: asignacionId, creado_por: actor.id,
      concepto: `Fondos extra autorizados · ${p.sede_nombre} · pedido #${p.id}`
    });
  }
  db.prepare(`UPDATE pedidos_fondos SET estado = ?, resuelto_por = ?, resuelto_en = datetime('now'), comentario = ?, asignacion_id = ? WHERE id = ?`)
    .run(autorizar ? 'autorizado' : 'rechazado', actor.id, comentario, asignacionId, id);
  auditar(actor, { accion: autorizar ? 'fondo.extra_autorizado' : 'fondo.extra_rechazado', sedeId: p.sede_id, entidad: 'pedido_fondos', entidadId: id, antes: { estado: 'pendiente' }, despues: { estado: autorizar ? 'autorizado' : 'rechazado', asignacion_id: asignacionId }, motivo: comentario });
  notificar({ sedeId: p.sede_id }, {
    tipo: autorizar ? 'ok' : 'mal', link: '#/fondos',
    texto: autorizar ? `El Presidente autorizó los fondos extra: ${fmtPesos(p.importe)} se suman al fondo.` : `El Presidente rechazó el pedido de ${fmtPesos(p.importe)}: ${comentario}`
  });
});

function listarPedidos({ sedeId = null, estado = null } = {}) {
  const w = []; const args = [];
  if (sedeId) { w.push('p.sede_id = ?'); args.push(sedeId); }
  if (estado) { w.push('p.estado = ?'); args.push(estado); }
  return db.prepare(`SELECT p.*, s.nombre AS sede_nombre, u.nombre || ' ' || u.apellido AS pedido_por_nombre, r.nombre || ' ' || r.apellido AS resuelto_por_nombre
    FROM pedidos_fondos p JOIN sedes s ON s.id = p.sede_id JOIN usuarios u ON u.id = p.pedido_por LEFT JOIN usuarios r ON r.id = p.resuelto_por
    ${w.length ? 'WHERE ' + w.join(' AND ') : ''} ORDER BY p.estado = 'pendiente' DESC, p.id DESC LIMIT 100`).all(...args).map(p => ({
    ...p,
    // Saldo actual de la sede, para decidir (el del momento del pedido también queda guardado).
    saldo_actual: p.estado === 'pendiente' ? libro.saldos(p.sede_id) : null
  }));
}

// ── Estado de una sede en un mes ────────────────────────────────────────────
function estadoSede(sedeId, periodo) {
  const asig = db.prepare(`SELECT COALESCE(SUM(CASE WHEN tipo='mensual' THEN importe END),0) mensual, COALESCE(SUM(CASE WHEN tipo='extra' THEN importe END),0) extra
    FROM asignaciones WHERE sede_id = ? AND periodo = ? AND estado = 'vigente'`).get(sedeId, periodo);
  const g = db.prepare(`SELECT COALESCE(SUM(CASE WHEN pagado_por='sede' THEN bruto END),0) sede, COALESCE(SUM(CASE WHEN pagado_por='central' THEN bruto END),0) central,
      COUNT(*) n FROM gastos WHERE sede_id = ? AND periodo = ? AND estado = 'registrado'`).get(sedeId, periodo);
  return {
    fondo_mensual: asig.mensual, fondo_extra: asig.extra, fondo_recibido: asig.mensual + asig.extra,
    gastado_sede: g.sede, pagado_central: g.central, gastos: g.n,
    saldos: libro.saldos(sedeId), saldo_inicial: libro.saldosAlInicio(sedeId, periodo)
  };
}

function resumenCentral(periodo = periodoActual()) {
  const central = sedeCentral();
  const sedes = db.prepare('SELECT * FROM sedes WHERE es_central = 0 AND activa = 1 ORDER BY orden, nombre').all();
  return {
    saldo: libro.saldo(central.id, 'banco'),
    periodo,
    sedes: sedes.map(s => ({ id: s.id, nombre: s.nombre, ...estadoSede(s.id, periodo) }))
  };
}

module.exports = {
  ingresoCentral, asignar, anularAsignacion, asignacionesDe, planillaAsignacion, moverEfectivo,
  pedirExtra, resolverExtra, listarPedidos, estadoSede, resumenCentral, exigirSaldoCentral
};
