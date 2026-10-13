const { db, cuentaTransitos, getConfig } = require('../db');
const ledger = require('./ledger');
const cierres = require('./cierres');
const vuelos = require('./vuelos');
const pagosInformados = require('./pagosInformados');
const { ErrorNegocio } = require('../util');

// De qué se compone el saldo: lo que quedó del último cupón más lo que pasó después del cierre.
// Los vuelos abiertos no están en el saldo: entran en el próximo cierre (van aparte, en `abiertos`).
function composicionSaldo(usuarioId) {
  const cupon = db.prepare(`
    SELECT cu.numero, cu.vencimiento, ci.periodo, ci.hasta_movimiento_id hasta FROM cupones cu JOIN cierres ci ON ci.id = cu.cierre_id
    WHERE cu.usuario_id = ? ORDER BY cu.id DESC LIMIT 1`).get(usuarioId);
  const desde = cupon?.hasta ?? 0;
  const t = cierres.totalesRango(usuarioId, desde, Number.MAX_SAFE_INTEGER);
  return {
    cupon: cupon ? { numero: cupon.numero, periodo: cupon.periodo, vencimiento: cupon.vencimiento, total: ledger.saldo(usuarioId, desde) } : null,
    anterior: cupon ? 0 : ledger.saldo(usuarioId, desde),
    vuelos: t.vuelos, servicios: t.servicios, pagos: t.pagos, ajustes: t.ajustes,
    saldo: ledger.saldo(usuarioId)
  };
}

// Datos para pagar por transferencia (los mismos del cupón).
function datosPago() {
  const c = getConfig();
  return {
    alias: c.pago_alias || '', cbu: c.pago_cbu || '', titular: c.pago_titular || '', cuit: c.pago_cuit || '', banco: c.pago_banco || '',
    instrucciones: c.pago_instrucciones || '', qr: !!c.pago_qr
  };
}

function estadoCuenta(usuarioId) {
  const usuario = db.prepare('SELECT id, nombre, apellido, email, telefono, dni, licencia, rol, es_instructor, es_instructor_sim, es_mantenimiento, cma_vence, exento_cuota, activo, baja_motivo, bloqueado, bloqueo_motivo FROM usuarios WHERE id = ?').get(usuarioId);
  if (!usuario) throw new ErrorNegocio('Socio inexistente', 404);
  const movimientos = db.prepare(`
    SELECT m.id, m.tipo, m.concepto, m.importe, m.fecha, m.medio, m.vuelo_id, m.anula_id, m.creado_en,
           u.nombre || ' ' || u.apellido autor,
           (SELECT a.id FROM movimientos a WHERE a.anula_id = m.id) anulado_por,
           (SELECT t.id FROM tickets t WHERE t.movimiento_id IN (m.id, m.anula_id)) ticket_id,
           ci.periodo cierre_periodo
    FROM movimientos m LEFT JOIN usuarios u ON u.id = m.creado_por LEFT JOIN cierres ci ON ci.id = m.cierre_id
    WHERE m.usuario_id = ? ORDER BY m.id DESC LIMIT 400`).all(usuarioId);
  const cupones = db.prepare(`
    SELECT cu.*, ci.periodo FROM cupones cu JOIN cierres ci ON ci.id = cu.cierre_id
    WHERE cu.usuario_id = ? ORDER BY cu.id DESC`).all(usuarioId).map(c => ({ ...c, ...cierres.estadoCupon(c) }));
  return {
    usuario,
    saldo: ledger.saldo(usuarioId),
    abiertos: vuelos.resumenAbiertos(usuarioId),
    movimientos,
    cupones,
    pagos_informados: pagosInformados.listar({ usuarioId, limite: 30 }),
    composicion: composicionSaldo(usuarioId),
    pago: datosPago(),
    proximo_cierre: cierres.proximoCierreAutomatico()
  };
}

function listarCuentas() {
  return db.prepare(`
    SELECT u.id, u.nombre, u.apellido, u.email, u.telefono, u.dni, u.licencia, u.rol, u.es_instructor, u.es_instructor_sim, u.es_mantenimiento, u.cma_vence, u.exento_cuota, u.activo, u.ultimo_acceso,
      u.baja_motivo, u.bloqueado, u.bloqueo_motivo, u.email_verificado_en, (u.id = @transitos) transitos,
      COALESCE((SELECT SUM(importe) FROM movimientos m WHERE m.usuario_id = u.id), 0) saldo,
      COALESCE((SELECT SUM(importe) FROM vuelos v WHERE v.piloto_id = u.id AND v.estado = 'abierto'), 0) a_facturar,
      COALESCE((SELECT SUM(decimas) FROM vuelos v WHERE v.piloto_id = u.id AND v.estado = 'abierto'), 0) decimas_abiertas,
      (SELECT MAX(fecha) FROM movimientos m WHERE m.usuario_id = u.id AND m.tipo = 'pago') ultimo_pago
    FROM usuarios u
    ORDER BY u.activo DESC, u.apellido, u.nombre`).all({ transitos: cuentaTransitos() });
}

module.exports = { estadoCuenta, listarCuentas, composicionSaldo, datosPago };
