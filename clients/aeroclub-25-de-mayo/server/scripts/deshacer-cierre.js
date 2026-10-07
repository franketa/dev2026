// Deshace el último cierre (pensado para el cierre de prueba): los vuelos vuelven a quedar abiertos,
// se borran los cupones, los cargos de los vuelos y los derechos de aeronave que generó, y se
// rehace la cadena del libro. Lo cargado después del cierre (vuelos, tickets, pagos) se conserva.
// Queda asentado en la auditoría.
//
//   node server/scripts/deshacer-cierre.js 2026-10

const { db, auditar } = require('../db');
const ledger = require('../services/ledger');
const { nombrePeriodo, esPeriodo } = require('../util');

const periodo = process.argv[2];
if (!esPeriodo(periodo || '')) { console.error('Uso: node server/scripts/deshacer-cierre.js AAAA-MM'); process.exit(1); }

// Triggers que protegen lo cerrado: se sacan sólo durante esta transacción.
const TRIGGERS = ['cierres_no_delete', 'vuelos_cerrados_inmutables', 'vuelos_historial_no_delete', 'cupon_envios_no_delete'];

const deshacer = db.transaction(() => {
  const cierre = db.prepare('SELECT * FROM cierres WHERE periodo = ?').get(periodo);
  if (!cierre) throw new Error(`${nombrePeriodo(periodo)} no está cerrado`);
  const ultimo = db.prepare('SELECT periodo FROM cierres ORDER BY periodo DESC LIMIT 1').get();
  if (ultimo.periodo !== periodo) throw new Error(`Sólo se puede deshacer el último cierre (${nombrePeriodo(ultimo.periodo)})`);

  const movs = db.prepare('SELECT id FROM movimientos WHERE cierre_id = ?').all(cierre.id).map(m => m.id);
  const tickets = db.prepare(`SELECT id FROM tickets WHERE origen = 'cierre' AND movimiento_id IN (SELECT id FROM movimientos WHERE cierre_id = ?)`).all(cierre.id).map(t => t.id);
  if (movs.length && db.prepare(`SELECT 1 FROM movimientos WHERE anula_id IN (${movs.join(',')})`).get()) {
    throw new Error('Algún cargo del cierre ya se anuló: hay que revisarlo a mano');
  }
  const envios = db.prepare('SELECT COUNT(*) n FROM cupon_envios WHERE cupon_id IN (SELECT id FROM cupones WHERE cierre_id = ?)').get(cierre.id).n;

  const sqlTriggers = TRIGGERS.map(n => db.prepare(`SELECT sql FROM sqlite_master WHERE type = 'trigger' AND name = ?`).get(n)?.sql).filter(Boolean);
  for (const n of TRIGGERS) db.exec(`DROP TRIGGER IF EXISTS ${n}`);

  db.prepare('DELETE FROM cupon_envios WHERE cupon_id IN (SELECT id FROM cupones WHERE cierre_id = ?)').run(cierre.id);
  const cupones = db.prepare('DELETE FROM cupones WHERE cierre_id = ?').run(cierre.id).changes;
  if (tickets.length) {
    const lista = tickets.join(',');
    db.exec(`DELETE FROM derechos_aeronave WHERE ticket_id IN (${lista})`);
    db.exec(`DELETE FROM ticket_items WHERE ticket_id IN (${lista})`);
    db.exec(`DELETE FROM tickets WHERE id IN (${lista})`);
  }
  const vuelos = db.prepare('SELECT id FROM vuelos WHERE cierre_id = ?').all(cierre.id).map(v => v.id);
  db.prepare(`UPDATE vuelos SET estado = 'abierto', cierre_id = NULL WHERE cierre_id = ? AND estado = 'cerrado'`).run(cierre.id);
  if (vuelos.length) db.exec(`DELETE FROM vuelos_historial WHERE accion = 'cierre' AND vuelo_id IN (${vuelos.join(',')})`);
  db.prepare('DELETE FROM movimientos WHERE cierre_id = ?').run(cierre.id);
  db.prepare('DELETE FROM cierres WHERE id = ?').run(cierre.id);
  if (movs.length) ledger.rehashDesde(Math.min(...movs));

  for (const sql of sqlTriggers) db.exec(sql);
  const faltan = TRIGGERS.filter(n => !db.prepare(`SELECT 1 FROM sqlite_master WHERE type = 'trigger' AND name = ?`).get(n));
  if (faltan.length) throw new Error(`No se pudieron restaurar los triggers: ${faltan.join(', ')}`);
  const cadena = ledger.verificarCadena();
  if (!cadena.ok) throw new Error(`La cadena del libro quedó mal: ${cadena.error}`);

  const detalle = `${nombrePeriodo(periodo)} (cierre de prueba): ${vuelos.length} vuelos reabiertos, ${cupones} cupones, ${tickets.length} derechos de aeronave y ${movs.length} movimientos borrados${envios ? `, ${envios} envíos registrados` : ''}`;
  auditar(null, 'cierre.deshecho', detalle);
  return detalle;
});

try {
  console.log(`Deshecho: ${deshacer()}`);
} catch (e) {
  console.error(e.message);
  process.exit(1);
}
