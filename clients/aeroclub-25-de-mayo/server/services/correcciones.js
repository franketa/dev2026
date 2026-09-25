// Correcciones de tesorería sobre el libro de movimientos: editar y borrar.
// Todo en una transacción: se cambia el movimiento, se rehace la cadena de hashes,
// se recalculan los cupones del socio y queda asentado en la auditoría.

const { db, auditar } = require('../db');
const ledger = require('./ledger');
const cierres = require('./cierres');
const { ErrorNegocio, hoy, esFecha, parsePesos, fmtPesos, fmtFechaCorta, limpiarTexto } = require('../util');

const MEDIOS = ['transferencia', 'efectivo', 'mercadopago', 'cheque', 'otro'];

function getMovimiento(id) {
  const m = db.prepare(`
    SELECT m.*, u.nombre || ' ' || u.apellido socio FROM movimientos m JOIN usuarios u ON u.id = m.usuario_id WHERE m.id = ?`).get(id);
  if (!m) throw new ErrorNegocio('Movimiento inexistente', 404);
  return m;
}

function resumen(m) {
  return `${fmtFechaCorta(m.fecha)}, ${m.concepto}, ${fmtPesos(m.importe)}${m.medio ? `, ${m.medio}` : ''}`;
}

function despuesDeCorregir(desdeId, usuarioId) {
  ledger.rehashDesde(desdeId);
  cierres.recalcularCupones(usuarioId);
  cierres.actualizarSellos();
}

const editar = db.transaction((id, input, actor) => {
  const m = getMovimiento(id);
  const motivo = limpiarTexto(input.motivo, 200);
  if (!motivo) throw new ErrorNegocio('Contá brevemente por qué se corrige (queda en el registro)');

  const concepto = limpiarTexto(input.concepto, 200) ?? m.concepto;
  const fecha = input.fecha ?? m.fecha;
  if (!esFecha(fecha) || fecha > hoy()) throw new ErrorNegocio('Fecha inválida');
  let importe = m.importe;
  if (input.importe != null && input.importe !== '') {
    const abs = parsePesos(input.importe);
    if (abs == null || abs <= 0) throw new ErrorNegocio('Importe inválido');
    const sentido = input.sentido === 'credito' ? -1 : input.sentido === 'cargo' ? 1 : Math.sign(m.importe);
    importe = abs * sentido;
  }
  const medio = m.tipo === 'pago' && MEDIOS.includes(input.medio) ? input.medio : m.medio;

  if (concepto === m.concepto && fecha === m.fecha && importe === m.importe && medio === m.medio) {
    throw new ErrorNegocio('No hay cambios para guardar');
  }
  db.prepare('UPDATE movimientos SET concepto = ?, fecha = ?, importe = ?, medio = ? WHERE id = ?').run(concepto, fecha, importe, medio, id);
  despuesDeCorregir(id, m.usuario_id);

  const despues = { ...m, concepto, fecha, importe, medio };
  auditar(actor.id, 'movimiento.edicion', `#${id} de ${m.socio}. Antes: ${resumen(m)}. Ahora: ${resumen(despues)}. Motivo: ${motivo}`);
  return { saldo: ledger.saldo(m.usuario_id) };
});

const borrar = db.transaction((id, motivo, actor) => {
  const m = getMovimiento(id);
  motivo = limpiarTexto(motivo, 200);
  if (!motivo) throw new ErrorNegocio('Contá brevemente por qué se borra (queda en el registro)');

  // Si el movimiento tiene una anulación, se borran juntos (la anulación sin su original no tiene sentido).
  const anulaciones = db.prepare('SELECT * FROM movimientos WHERE anula_id = ?').all(id);
  for (const a of anulaciones) db.prepare('DELETE FROM movimientos WHERE id = ?').run(a.id);
  db.prepare('DELETE FROM movimientos WHERE id = ?').run(id);
  despuesDeCorregir(id, m.usuario_id);

  const extra = anulaciones.length ? ` (también su anulación #${anulaciones.map(a => a.id).join(', #')})` : '';
  auditar(actor.id, 'movimiento.borrado', `#${id} de ${m.socio}${extra}: ${resumen(m)}. Motivo: ${motivo}`);
  return { saldo: ledger.saldo(m.usuario_id) };
});

module.exports = { editar, borrar };
