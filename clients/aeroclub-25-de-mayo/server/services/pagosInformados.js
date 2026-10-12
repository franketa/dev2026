// Historial de pagos de cada socio.
//   - Los que informa el socio desde la app (con foto del comprobante opcional): no tocan la cuenta
//     hasta que tesorería los confirma; recién ahí se registra el pago en el libro.
//   - Los que cobra rampa en el momento: igual, quedan esperando que tesorería los confirme.
//   - Los que carga tesorería directo en la cuenta: entran confirmados.
// Si después tesorería anula o borra el pago del libro, acá queda como 'anulado' (no se pierde el rastro).

const { db, auditar } = require('../db');
const ledger = require('./ledger');
const { ErrorNegocio, hoy, sumarDias, esFecha, esPeriodo, parsePesos, fmtPesos, limpiarTexto, nombreCompleto, MEDIOS } = require('../util');

const TIPOS_COMPROBANTE = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
const MAX_COMPROBANTE = 3 * 1024 * 1024;
const MAX_PENDIENTES = 10;
const DIAS_ATRAS = 90;
const ESTADOS = ['pendiente', 'confirmado', 'rechazado', 'anulado'];

// El comprobante llega como data URL ("data:image/jpeg;base64,...") desde el navegador.
function leerComprobante(dataUrl) {
  if (!dataUrl) return null;
  const m = /^data:([\w/+.-]+);base64,([A-Za-z0-9+/=]+)$/.exec(String(dataUrl));
  if (!m || !TIPOS_COMPROBANTE.includes(m[1])) throw new ErrorNegocio('El comprobante tiene que ser una foto o un PDF');
  const datos = Buffer.from(m[2], 'base64');
  if (!datos.length) throw new ErrorNegocio('El comprobante está vacío');
  if (datos.length > MAX_COMPROBANTE) throw new ErrorNegocio('El comprobante es muy pesado (máximo 3 MB)');
  // Que el contenido sea lo que dice ser.
  const firma = datos.subarray(0, 4).toString('hex');
  const esperado = { 'image/jpeg': /^ffd8ff/, 'image/png': /^89504e47/, 'image/webp': /^52494646/, 'application/pdf': /^25504446/ }[m[1]];
  if (!esperado.test(firma)) throw new ErrorNegocio('El archivo del comprobante no es válido');
  return { tipo: m[1], datos };
}

const informar = db.transaction((input, actor) => {
  const importe = parsePesos(String(input.importe ?? ''));
  if (importe == null || importe <= 0) throw new ErrorNegocio('Indicá el importe que pagaste');
  const fecha = input.fecha || hoy();
  if (!esFecha(fecha) || fecha > hoy()) throw new ErrorNegocio('Fecha del pago inválida');
  if (fecha < sumarDias(hoy(), -DIAS_ATRAS)) throw new ErrorNegocio(`Sólo se pueden informar pagos de los últimos ${DIAS_ATRAS} días`);
  if (!MEDIOS.includes(input.medio)) throw new ErrorNegocio('Elegí cómo pagaste');
  const nota = limpiarTexto(input.nota, 300);
  const pendientes = db.prepare(`SELECT COUNT(*) n FROM pagos_informados WHERE usuario_id = ? AND estado = 'pendiente'`).get(actor.id).n;
  if (pendientes >= MAX_PENDIENTES) throw new ErrorNegocio('Tenés muchos pagos esperando revisión. Esperá a que tesorería los confirme.');

  const comp = leerComprobante(input.comprobante);
  const comprobanteId = comp
    ? Number(db.prepare('INSERT INTO comprobantes (tipo, datos) VALUES (?, ?)').run(comp.tipo, comp.datos).lastInsertRowid)
    : null;
  const r = db.prepare(`INSERT INTO pagos_informados (usuario_id, importe, fecha, medio, nota, comprobante_id, origen, informado_por) VALUES (?, ?, ?, ?, ?, ?, 'socio', ?)`)
    .run(actor.id, importe, fecha, input.medio, nota, comprobanteId, actor.id);
  auditar(actor.id, 'pago_informado.alta', `${fmtPesos(importe)} por ${input.medio} del ${fecha}${comp ? ', con comprobante' : ''}`);
  return get(Number(r.lastInsertRowid));
});

const SELECT = `
  SELECT p.*, u.nombre, u.apellido, u.telefono, r.nombre || ' ' || r.apellido revisado_por_nombre, c.tipo comprobante_tipo,
    t.numero ticket_numero, i.nombre || ' ' || i.apellido informado_por_nombre,
    CASE WHEN p.origen = 'rampa' THEN i.nombre || ' ' || i.apellido END cobrado_por_nombre,
    an.nombre || ' ' || an.apellido anulado_por_nombre
  FROM pagos_informados p JOIN usuarios u ON u.id = p.usuario_id
  LEFT JOIN usuarios r ON r.id = p.revisado_por LEFT JOIN comprobantes c ON c.id = p.comprobante_id
  LEFT JOIN tickets t ON t.id = p.ticket_id LEFT JOIN usuarios i ON i.id = p.informado_por
  LEFT JOIN usuarios an ON an.id = p.anulado_por`;

const numeroTicket = (n) => `T-${String(n).padStart(5, '0')}`;

// Lo que cobra rampa en el momento (efectivo, transferencia…) no toca la cuenta hasta que tesorería
// lo confirma: queda como pago informado, ligado al ticket.
function desdeTicket({ ticket, usuarioId, importe, fecha, medio, actor }) {
  const r = db.prepare(`INSERT INTO pagos_informados (usuario_id, importe, fecha, medio, nota, ticket_id, origen, informado_por) VALUES (?, ?, ?, ?, ?, ?, 'rampa', ?)`)
    .run(usuarioId, importe, fecha, medio, `Cobrado por rampa en el ticket ${numeroTicket(ticket.numero)}`, ticket.id, actor.id);
  return Number(r.lastInsertRowid);
}

// Un pago que tesorería carga directo (en la cuenta del socio o cobrando un ticket en el acto):
// entra al historial ya confirmado, ligado a su movimiento del libro.
function desdeTesoreria({ movimiento, nota = null, ticketId = null, actor }) {
  const r = db.prepare(`
    INSERT INTO pagos_informados (usuario_id, importe, fecha, medio, nota, estado, origen, movimiento_id, revisado_por, revisado_en, ticket_id, informado_por)
    VALUES (?, ?, ?, ?, ?, 'confirmado', 'tesoreria', ?, ?, datetime('now'), ?, ?)`)
    .run(movimiento.usuario_id, -movimiento.importe, movimiento.fecha, movimiento.medio || 'otro', nota, movimiento.id, actor.id, ticketId, actor.id);
  return Number(r.lastInsertRowid);
}

// Si se anula el ticket antes de que tesorería confirme el cobro, el pago informado se anula con él.
function descartarPorTicket(pagoId, motivo, actor) {
  db.prepare(`UPDATE pagos_informados SET estado = 'anulado', motivo_anulacion = ?, anulado_por = ?, anulado_en = datetime('now') WHERE id = ? AND estado = 'pendiente'`)
    .run(`Ticket anulado: ${motivo}`.slice(0, 200), actor.id, pagoId);
}

// ── Sincronía con el libro ───────────────────────────────────────────────────
// Cuando tesorería anula, borra o corrige un pago desde la cuenta, el historial lo refleja.
// Se llama ANTES de borrar el movimiento (al borrarlo, movimiento_id queda en NULL).
function alAnularMovimiento(movimientoId, motivo, actor) {
  db.prepare(`UPDATE pagos_informados SET estado = 'anulado', motivo_anulacion = ?, anulado_por = ?, anulado_en = datetime('now')
    WHERE movimiento_id = ? AND estado = 'confirmado'`).run(limpiarTexto(motivo, 200), actor?.id ?? null, movimientoId);
}

// Se borró la anulación de un pago: el pago vuelve a contar.
function alRevivirMovimiento(movimientoId) {
  db.prepare(`UPDATE pagos_informados SET estado = 'confirmado', motivo_anulacion = NULL, anulado_por = NULL, anulado_en = NULL
    WHERE movimiento_id = ? AND estado = 'anulado'`).run(movimientoId);
}

function alEditarMovimiento(m) {
  if (m.tipo !== 'pago' || m.importe >= 0) return;
  db.prepare('UPDATE pagos_informados SET importe = ?, fecha = ?, medio = COALESCE(?, medio) WHERE movimiento_id = ?')
    .run(-m.importe, m.fecha, m.medio, m.id);
}

function get(id) {
  const p = db.prepare(`${SELECT} WHERE p.id = ?`).get(id);
  if (!p) throw new ErrorNegocio('Pago informado inexistente', 404);
  return p;
}

// `periodo`: los del mes del pago (para el historial).
function listar({ usuarioId = null, estado = null, periodo = null, limite = 100 } = {}) {
  const where = [];
  const params = [];
  if (periodo && esPeriodo(periodo)) { where.push('substr(p.fecha,1,7) = ?'); params.push(periodo); }
  if (usuarioId) { where.push('p.usuario_id = ?'); params.push(usuarioId); }
  if (ESTADOS.includes(estado)) { where.push('p.estado = ?'); params.push(estado); }
  return db.prepare(`${SELECT} ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY p.fecha DESC, p.id DESC LIMIT ${Math.min(Number(limite) || 100, 500)}`).all(...params);
}

function pendientes() {
  return db.prepare(`SELECT COUNT(*) n, COALESCE(SUM(importe),0) importe FROM pagos_informados WHERE estado = 'pendiente'`).get();
}

// Tesorería puede corregir importe, fecha o medio antes de confirmar (por ejemplo, si llegó otro monto).
const confirmar = db.transaction((id, input, actor) => {
  const p = get(id);
  if (p.estado !== 'pendiente') throw new ErrorNegocio('Ese pago ya fue revisado', 409);
  const importe = input.importe != null && input.importe !== '' ? parsePesos(String(input.importe)) : p.importe;
  if (importe == null || importe <= 0) throw new ErrorNegocio('Importe inválido');
  const fecha = input.fecha || p.fecha;
  if (!esFecha(fecha) || fecha > hoy()) throw new ErrorNegocio('Fecha inválida');
  const medio = MEDIOS.includes(input.medio) ? input.medio : p.medio;
  const mov = ledger.registrar({
    usuario_id: p.usuario_id, tipo: 'pago', importe: -importe, fecha, medio, creado_por: actor.id,
    concepto: (p.ticket_id
      ? `Pago del ticket ${numeroTicket(p.ticket_numero)} por ${medio} (cobrado por rampa${p.cobrado_por_nombre ? `: ${p.cobrado_por_nombre}` : ''})`
      : `Pago por ${medio} (informado por el socio${p.nota ? `: ${p.nota}` : ''})`).slice(0, 250)
  });
  if (p.ticket_id) db.prepare('UPDATE tickets SET pago_movimiento_id = ? WHERE id = ?').run(mov.id, p.ticket_id);
  db.prepare(`UPDATE pagos_informados SET estado = 'confirmado', importe = ?, fecha = ?, medio = ?, movimiento_id = ?, revisado_por = ?, revisado_en = datetime('now') WHERE id = ?`)
    .run(importe, fecha, medio, mov.id, actor.id, id);
  const cambio = importe !== p.importe ? ` (informó ${fmtPesos(p.importe)})` : '';
  auditar(actor.id, 'pago_informado.confirmado', `${nombreCompleto(p)}: ${fmtPesos(importe)} por ${medio}${cambio}, movimiento #${mov.id}`);
  return { pago: get(id), saldo: ledger.saldo(p.usuario_id) };
});

const rechazar = db.transaction((id, motivo, actor) => {
  const p = get(id);
  if (p.estado !== 'pendiente') throw new ErrorNegocio('Ese pago ya fue revisado', 409);
  motivo = limpiarTexto(motivo, 200);
  if (!motivo) throw new ErrorNegocio('Contale al socio por qué se rechaza (lo va a ver en su cuenta)');
  db.prepare(`UPDATE pagos_informados SET estado = 'rechazado', motivo_rechazo = ?, revisado_por = ?, revisado_en = datetime('now') WHERE id = ?`)
    .run(motivo, actor.id, id);
  auditar(actor.id, 'pago_informado.rechazado', `${nombreCompleto(p)}: ${fmtPesos(p.importe)} por ${p.medio}. Motivo: ${motivo}`);
  return get(id);
});

function comprobante(pagoId) {
  const p = get(pagoId);
  if (!p.comprobante_id) throw new ErrorNegocio('Ese pago no tiene comprobante', 404);
  return { usuario_id: p.usuario_id, ...db.prepare('SELECT tipo, datos FROM comprobantes WHERE id = ?').get(p.comprobante_id) };
}

// Resumen del mes para el panel: cuántos pagos hubo y cómo quedaron.
function resumenMes(periodo) {
  return db.prepare(`
    SELECT COUNT(*) n, COALESCE(SUM(estado = 'confirmado'),0) confirmados, COALESCE(SUM(estado = 'rechazado'),0) rechazados,
      COALESCE(SUM(estado = 'anulado'),0) anulados, COALESCE(SUM(estado = 'pendiente'),0) pendientes,
      COALESCE(SUM(CASE WHEN estado = 'confirmado' THEN importe END),0) importe_confirmado
    FROM pagos_informados WHERE substr(fecha,1,7) = ?`).get(periodo);
}

module.exports = {
  informar, desdeTicket, desdeTesoreria, descartarPorTicket, alAnularMovimiento, alRevivirMovimiento, alEditarMovimiento,
  listar, get, pendientes, resumenMes, confirmar, rechazar, comprobante
};
