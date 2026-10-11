// Libro de movimientos: de acá salen todos los saldos (Central · banco, y banco / efectivo de cada sede).
//
//   - Nada se edita ni se borra (trigger en la base). Un error se corrige con un contraasiento (`anulacion`).
//   - Cada movimiento guarda el hash del anterior: una alteración hecha por fuera del sistema rompe la cadena
//     y verificarCadena() la encuentra.
//   - Importe con signo: > 0 entra plata a la cuenta, < 0 sale.

const crypto = require('crypto');
const { db } = require('../db');
const { ErrorNegocio, hoy, periodoDe, sha256 } = require('../util');

const GENESIS = '0'.repeat(64);

function calcularHash(m) {
  return sha256([
    m.sede_id, m.cuenta, m.periodo, m.fecha, m.tipo, m.concepto, m.importe,
    m.asignacion_id ?? '', m.gasto_id ?? '', m.grupo ?? '', m.anula_id ?? '',
    m.creado_por ?? '', m.creado_en, m.hash_anterior
  ].join('|'));
}

const qUltimo = db.prepare('SELECT hash FROM movimientos ORDER BY id DESC LIMIT 1');
const qInsert = db.prepare(`
  INSERT INTO movimientos (sede_id, cuenta, periodo, fecha, tipo, concepto, importe, asignacion_id, gasto_id, grupo, anula_id, creado_por, creado_en, hash_anterior, hash)
  VALUES (@sede_id, @cuenta, @periodo, @fecha, @tipo, @concepto, @importe, @asignacion_id, @gasto_id, @grupo, @anula_id, @creado_por, @creado_en, @hash_anterior, @hash)`);

// Siempre dentro de una transacción (better-sqlite3 es sincrónico: nadie se intercala entre leer el último
// hash y escribir el nuevo).
const registrar = db.transaction((mov) => {
  const fecha = mov.fecha || hoy();
  const m = {
    sede_id: mov.sede_id,
    cuenta: mov.cuenta || 'banco',
    periodo: mov.periodo || periodoDe(fecha),
    fecha,
    tipo: mov.tipo,
    concepto: mov.concepto,
    importe: mov.importe,
    asignacion_id: mov.asignacion_id ?? null,
    gasto_id: mov.gasto_id ?? null,
    grupo: mov.grupo ?? null,
    anula_id: mov.anula_id ?? null,
    creado_por: mov.creado_por ?? null,
    creado_en: new Date().toISOString(),
    hash_anterior: qUltimo.get()?.hash || GENESIS
  };
  if (!Number.isSafeInteger(m.importe) || m.importe === 0) throw new ErrorNegocio('El importe tiene que ser distinto de cero');
  m.hash = calcularHash(m);
  const { lastInsertRowid } = qInsert.run(m);
  return { id: Number(lastInsertRowid), ...m };
});

// Pase entre dos cuentas (asignación, extracción, depósito): dos filas con el mismo `grupo`.
const pase = db.transaction(({ desde, hacia, importe, ...comun }) => {
  const grupo = crypto.randomUUID();
  const salida = registrar({ ...comun, ...desde, importe: -importe, grupo });
  const entrada = registrar({ ...comun, ...hacia, importe, grupo });
  return { salida, entrada, grupo };
});

// Anula todos los movimientos vivos de un gasto o una asignación con su contraasiento.
const anularDe = db.transaction(({ gastoId = null, asignacionId = null }, concepto, actorId, fecha = hoy()) => {
  const movs = gastoId
    ? db.prepare(`SELECT * FROM movimientos m WHERE gasto_id = ? AND tipo <> 'anulacion' AND NOT EXISTS (SELECT 1 FROM movimientos a WHERE a.anula_id = m.id)`).all(gastoId)
    : db.prepare(`SELECT * FROM movimientos m WHERE asignacion_id = ? AND tipo <> 'anulacion' AND NOT EXISTS (SELECT 1 FROM movimientos a WHERE a.anula_id = m.id)`).all(asignacionId);
  return movs.map(m => registrar({
    sede_id: m.sede_id, cuenta: m.cuenta, periodo: m.periodo, fecha, tipo: 'anulacion',
    concepto: `Anula #${m.id} · ${concepto}`, importe: -m.importe,
    gasto_id: m.gasto_id, asignacion_id: m.asignacion_id, grupo: m.grupo, anula_id: m.id, creado_por: actorId
  }));
});

const qSaldo = db.prepare('SELECT COALESCE(SUM(importe), 0) s FROM movimientos WHERE sede_id = ? AND cuenta = ?');
const qSaldoHasta = db.prepare('SELECT COALESCE(SUM(importe), 0) s FROM movimientos WHERE sede_id = ? AND cuenta = ? AND periodo <= ?');
const qSaldoAntes = db.prepare('SELECT COALESCE(SUM(importe), 0) s FROM movimientos WHERE sede_id = ? AND cuenta = ? AND periodo < ?');

function saldo(sedeId, cuenta = 'banco') { return qSaldo.get(sedeId, cuenta).s; }
function saldos(sedeId) {
  const banco = saldo(sedeId, 'banco');
  const efectivo = saldo(sedeId, 'efectivo');
  return { banco, efectivo, total: banco + efectivo };
}
// Saldo al cierre de un período (incluye todo lo imputado a ese mes y los anteriores).
function saldosAlCierre(sedeId, periodo) {
  const banco = qSaldoHasta.get(sedeId, 'banco', periodo).s;
  const efectivo = qSaldoHasta.get(sedeId, 'efectivo', periodo).s;
  return { banco, efectivo, total: banco + efectivo };
}
function saldosAlInicio(sedeId, periodo) {
  const banco = qSaldoAntes.get(sedeId, 'banco', periodo).s;
  const efectivo = qSaldoAntes.get(sedeId, 'efectivo', periodo).s;
  return { banco, efectivo, total: banco + efectivo };
}

function movimientosDe(sedeId, periodo) {
  return db.prepare(`SELECT m.*, u.nombre || ' ' || u.apellido AS creado_por_nombre,
      EXISTS (SELECT 1 FROM movimientos a WHERE a.anula_id = m.id) AS anulado
    FROM movimientos m LEFT JOIN usuarios u ON u.id = m.creado_por
    WHERE m.sede_id = ? AND m.periodo = ? ORDER BY m.fecha, m.id`).all(sedeId, periodo);
}

function verificarCadena() {
  let anterior = GENESIS;
  let n = 0;
  let idAnterior = 0;
  for (const m of db.prepare('SELECT * FROM movimientos ORDER BY id').iterate()) {
    n++;
    if (m.hash_anterior !== anterior) {
      return { ok: false, registros: n, id: m.id, error: `El movimiento #${m.id} no continúa la cadena: falta o se alteró un movimiento anterior (último válido #${idAnterior}).` };
    }
    if (calcularHash(m) !== m.hash) {
      return { ok: false, registros: n, id: m.id, error: `El contenido del movimiento #${m.id} fue alterado por fuera del sistema.` };
    }
    anterior = m.hash;
    idAnterior = m.id;
  }
  return { ok: true, registros: n, ultimo_hash: anterior };
}

module.exports = { registrar, pase, anularDe, saldo, saldos, saldosAlCierre, saldosAlInicio, movimientosDe, verificarCadena, calcularHash, GENESIS };
