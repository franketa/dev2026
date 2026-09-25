// Libro de movimientos (cuenta corriente de cada socio).
//
// Tesorería puede anular, editar o borrar movimientos (ver correcciones.js); cada cambio
// queda en `auditoria` con autor, motivo y el antes/después.
//   - Cadena de hashes: cada movimiento guarda el hash del anterior. Las correcciones hechas
//     desde el sistema rehacen la cadena; un cambio hecho por fuera la rompe y
//     verificarCadena() lo detecta.
//   - Sello en los cupones: cada cupón imprime el hash del libro al cierre de su período.
//
// Convención de signo: importe > 0 aumenta la deuda del socio (vuelos, cargos);
// importe < 0 la reduce (pagos, créditos).

const crypto = require('crypto');
const { db } = require('../db');
const { ErrorNegocio, hoy, fmtPesos } = require('../util');

const GENESIS = '0'.repeat(64);

function calcularHash(m) {
  const canon = [
    m.usuario_id, m.tipo, m.concepto, m.importe, m.fecha,
    m.vuelo_id ?? '', m.cierre_id ?? '', m.anula_id ?? '', m.medio ?? '',
    m.creado_por ?? '', m.creado_en, m.hash_anterior
  ].join('|');
  return crypto.createHash('sha256').update(canon).digest('hex');
}

const qUltimo = db.prepare('SELECT hash FROM movimientos ORDER BY id DESC LIMIT 1');
const qInsert = db.prepare(`
  INSERT INTO movimientos (usuario_id, tipo, concepto, importe, fecha, vuelo_id, cierre_id, anula_id, medio, creado_por, creado_en, hash_anterior, hash)
  VALUES (@usuario_id, @tipo, @concepto, @importe, @fecha, @vuelo_id, @cierre_id, @anula_id, @medio, @creado_por, @creado_en, @hash_anterior, @hash)`);

// Siempre dentro de una transacción de better-sqlite3 (sincrónica): nadie puede
// intercalar un movimiento entre leer el último hash y escribir el nuevo.
const registrar = db.transaction((mov) => {
  const m = {
    usuario_id: mov.usuario_id,
    tipo: mov.tipo,
    concepto: mov.concepto,
    importe: mov.importe,
    fecha: mov.fecha || hoy(),
    vuelo_id: mov.vuelo_id ?? null,
    cierre_id: mov.cierre_id ?? null,
    anula_id: mov.anula_id ?? null,
    medio: mov.medio ?? null,
    creado_por: mov.creado_por ?? null,
    creado_en: new Date().toISOString(),
    hash_anterior: qUltimo.get()?.hash || GENESIS
  };
  if (!Number.isInteger(m.importe) || m.importe === 0) throw new ErrorNegocio('El importe tiene que ser distinto de cero');
  m.hash = calcularHash(m);
  const { lastInsertRowid } = qInsert.run(m);
  return { id: Number(lastInsertRowid), ...m };
});

function saldo(usuarioId, hastaId = null) {
  const r = hastaId == null
    ? db.prepare('SELECT COALESCE(SUM(importe),0) s FROM movimientos WHERE usuario_id = ?').get(usuarioId)
    : db.prepare('SELECT COALESCE(SUM(importe),0) s FROM movimientos WHERE usuario_id = ? AND id <= ?').get(usuarioId, hastaId);
  return r.s;
}

function ultimoHash() { return qUltimo.get()?.hash || GENESIS; }

const anular = db.transaction((movimientoId, motivo, usuarioId) => {
  const m = db.prepare('SELECT * FROM movimientos WHERE id = ?').get(movimientoId);
  if (!m) throw new ErrorNegocio('Movimiento inexistente', 404);
  if (m.tipo === 'anulacion') throw new ErrorNegocio('Una anulación no se puede anular. Si hace falta, cargá un ajuste.');
  if (db.prepare('SELECT 1 FROM movimientos WHERE anula_id = ?').get(m.id)) throw new ErrorNegocio('Ese movimiento ya fue anulado');
  if (!motivo) throw new ErrorNegocio('Indicá el motivo de la anulación');
  return registrar({
    usuario_id: m.usuario_id,
    tipo: 'anulacion',
    concepto: `Anula #${m.id} (${m.concepto}) — ${motivo}`,
    importe: -m.importe,
    anula_id: m.id,
    creado_por: usuarioId
  });
});

// Recorre toda la cadena y devuelve el primer problema encontrado.
function verificarCadena() {
  let anterior = GENESIS;
  let n = 0;
  let idAnterior = 0;
  for (const m of db.prepare('SELECT * FROM movimientos ORDER BY id').iterate()) {
    n++;
    if (m.hash_anterior !== anterior) {
      return { ok: false, movimientos: n, error: `El movimiento #${m.id} no continúa la cadena: falta o se alteró un movimiento anterior (último válido #${idAnterior}).`, movimiento_id: m.id };
    }
    if (calcularHash(m) !== m.hash) {
      return { ok: false, movimientos: n, error: `El contenido del movimiento #${m.id} fue alterado por fuera del sistema.`, movimiento_id: m.id };
    }
    anterior = m.hash;
    idAnterior = m.id;
  }
  return { ok: true, movimientos: n, ultimo_hash: anterior };
}

// Rehace la cadena desde el movimiento `id` en adelante (después de editar o borrar).
function rehashDesde(id) {
  let anterior = db.prepare('SELECT hash FROM movimientos WHERE id < ? ORDER BY id DESC LIMIT 1').get(id)?.hash || GENESIS;
  const upd = db.prepare('UPDATE movimientos SET hash_anterior = ?, hash = ? WHERE id = ?');
  for (const m of db.prepare('SELECT * FROM movimientos WHERE id >= ? ORDER BY id').all(id)) {
    const hash = calcularHash({ ...m, hash_anterior: anterior });
    upd.run(anterior, hash, m.id);
    anterior = hash;
  }
}

function describirImporte(importe) {
  return importe > 0 ? `cargo de ${fmtPesos(importe)}` : `crédito de ${fmtPesos(-importe)}`;
}

module.exports = { registrar, saldo, anular, verificarCadena, rehashDesde, ultimoHash, calcularHash, describirImporte, GENESIS };
