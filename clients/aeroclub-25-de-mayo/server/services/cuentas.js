const { db } = require('../db');
const ledger = require('./ledger');
const cierres = require('./cierres');
const vuelos = require('./vuelos');
const { ErrorNegocio } = require('../util');

function estadoCuenta(usuarioId) {
  const usuario = db.prepare('SELECT id, nombre, apellido, email, telefono, dni, licencia, rol, es_instructor, activo FROM usuarios WHERE id = ?').get(usuarioId);
  if (!usuario) throw new ErrorNegocio('Socio inexistente', 404);
  const movimientos = db.prepare(`
    SELECT m.id, m.tipo, m.concepto, m.importe, m.fecha, m.medio, m.vuelo_id, m.anula_id, m.creado_en,
           u.nombre || ' ' || u.apellido autor,
           (SELECT a.id FROM movimientos a WHERE a.anula_id = m.id) anulado_por,
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
    cupones
  };
}

function listarCuentas() {
  return db.prepare(`
    SELECT u.id, u.nombre, u.apellido, u.email, u.telefono, u.rol, u.es_instructor, u.activo,
      COALESCE((SELECT SUM(importe) FROM movimientos m WHERE m.usuario_id = u.id), 0) saldo,
      COALESCE((SELECT SUM(importe) FROM vuelos v WHERE v.piloto_id = u.id AND v.estado = 'abierto'), 0) a_facturar,
      COALESCE((SELECT SUM(decimas) FROM vuelos v WHERE v.piloto_id = u.id AND v.estado = 'abierto'), 0) decimas_abiertas,
      (SELECT MAX(fecha) FROM movimientos m WHERE m.usuario_id = u.id AND m.tipo = 'pago') ultimo_pago
    FROM usuarios u
    ORDER BY u.activo DESC, u.apellido, u.nombre`).all();
}

module.exports = { estadoCuenta, listarCuentas };
