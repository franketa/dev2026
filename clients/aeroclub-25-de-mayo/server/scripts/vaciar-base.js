// Deja la base lista para el arranque real: borra toda la plata (libro, cierres, cupones, tickets,
// pagos y comprobantes), los vuelos con sus novedades, la auditoría y el historial de tarifas, y
// las copias de seguridad viejas. Quedan los usuarios, los servicios con sus precios, la flota con
// su tarifa vigente (y las programadas a futuro), las aeronaves de terceros y la configuración.
// La numeración de tickets y cupones vuelve a arrancar en 1.
//
// Antes de borrar deja una copia completa en DATA_DIR/antes-de-vaciar-<fecha>.sqlite (fuera de
// respaldos/, así no aparece en la app).
//
//   node server/scripts/vaciar-base.js        → sólo muestra qué se borraría
//   node server/scripts/vaciar-base.js --si   → lo hace

const fs = require('fs');
const path = require('path');
const { db, DATA_DIR, getConfig, auditar } = require('../db');
const { hoy } = require('../util');

const SE_VACIAN = [
  'cupon_envios', 'cupones', 'derechos_aeronave', 'cuotas_sociales', 'ticket_items', 'pagos_informados',
  'tickets', 'comprobantes', 'novedades_revisadas', 'vuelos_historial', 'movimientos', 'vuelos', 'cierres', 'auditoria'
];
const TABLAS_CON_TRIGGERS = ['vuelos', 'cierres', 'tarifas', 'cupon_envios', 'vuelos_historial', 'auditoria', 'movimientos', 'cupones'];

const contar = (t) => db.prepare(`SELECT COUNT(*) n FROM ${t}`).get().n;
const inicioSistema = `${getConfig().periodo_inicio}-01`;

// Por avión y tipo: la tarifa vigente hoy (la más nueva) y las que arrancan más adelante (una por fecha).
function tarifasQueQuedan() {
  const ids = db.prepare(`
    SELECT MAX(id) id FROM tarifas t
    WHERE vigente_desde = (SELECT MAX(vigente_desde) FROM tarifas x WHERE x.avion_id = t.avion_id AND x.tipo = t.tipo AND x.vigente_desde <= ?)
    GROUP BY avion_id, tipo
    UNION
    SELECT MAX(id) FROM tarifas WHERE vigente_desde > ? GROUP BY avion_id, tipo, vigente_desde`).all(hoy(), hoy()).map(r => r.id);
  return db.prepare(`SELECT t.*, a.matricula FROM tarifas t JOIN aviones a ON a.id = t.avion_id WHERE t.id IN (${ids.join(',') || 0})
    ORDER BY a.matricula, t.tipo, t.vigente_desde`).all();
}

function copiasViejas() {
  const out = [];
  const dirRespaldos = path.join(DATA_DIR, 'respaldos');
  if (fs.existsSync(dirRespaldos)) for (const n of fs.readdirSync(dirRespaldos)) out.push(path.join(dirRespaldos, n));
  for (const n of fs.readdirSync(DATA_DIR)) {
    if (/\.sqlite(-shm|-wal)?$/.test(n) && !/^aeroclub\.sqlite/.test(n)) out.push(path.join(DATA_DIR, n));
  }
  return out;
}

const pesos = (c) => `$${(c / 100).toLocaleString('es-AR')}`;
const quedan = tarifasQueQuedan();
const viejas = copiasViejas();

console.log('Se borra:');
for (const t of SE_VACIAN) console.log(`  ${t.padEnd(20)} ${contar(t)}`);
console.log(`  ${'tarifas'.padEnd(20)} ${contar('tarifas') - quedan.length} (quedan ${quedan.length})`);
console.log(`  copias de seguridad ${viejas.length} archivos`);
for (const f of viejas) console.log(`    ${path.relative(DATA_DIR, f)}`);
console.log('\nTarifas que quedan (la vigente arranca, como tarde, el primer día del sistema):');
for (const t of quedan) {
  const desde = t.vigente_desde <= hoy() && t.vigente_desde > inicioSistema ? inicioSistema : t.vigente_desde;
  console.log(`  ${t.matricula.padEnd(9)} ${t.tipo.padEnd(11)} ${pesos(t.precio_hora).padStart(11)}/h desde ${desde}`);
}
console.log(`\nQuedan: ${contar('usuarios')} usuarios, ${contar('servicios')} servicios, ${contar('aviones')} aviones, ${contar('aeronaves')} aeronaves de terceros, la configuración.`);
console.log(`Primer mes del sistema: ${getConfig().periodo_inicio} (se cierra solo el día ${getConfig().cierre_dia} del mes siguiente a las ${getConfig().cierre_hora} h)`);

if (!process.argv.includes('--si')) {
  console.log('\nNo se tocó nada. Para hacerlo: node server/scripts/vaciar-base.js --si');
  process.exit(0);
}

(async () => {
  const copia = path.join(DATA_DIR, `antes-de-vaciar-${new Date().toISOString().replace(/[:.]/g, '-')}.sqlite`);
  await db.backup(copia);
  console.log(`\nCopia previa: ${copia}`);

  const vaciar = db.transaction(() => {
    const triggers = db.prepare(`SELECT name, sql FROM sqlite_master WHERE type = 'trigger' AND tbl_name IN (${TABLAS_CON_TRIGGERS.map(() => '?').join(',')})`)
      .all(...TABLAS_CON_TRIGGERS);
    for (const t of triggers) db.exec(`DROP TRIGGER ${t.name}`);

    for (const t of SE_VACIAN) db.exec(`DELETE FROM ${t}`);
    db.exec(`DELETE FROM tarifas WHERE id NOT IN (${quedan.map(t => t.id).join(',') || 0})`);
    db.prepare('UPDATE tarifas SET vigente_desde = ? WHERE vigente_desde > ? AND vigente_desde <= ?').run(inicioSistema, inicioSistema, hoy());

    for (const t of triggers) db.exec(t.sql);
    const faltan = triggers.filter(t => !db.prepare(`SELECT 1 FROM sqlite_master WHERE type = 'trigger' AND name = ?`).get(t.name));
    if (faltan.length) throw new Error(`No se pudieron restaurar los triggers: ${faltan.map(t => t.name).join(', ')}`);

    auditar(null, 'base.vaciada', `Arranque real: se borraron los movimientos, cierres, cupones, tickets, pagos, vuelos y novedades de prueba; quedaron ${quedan.length} tarifas. Copia previa: ${path.basename(copia)}`);
  });
  vaciar();

  for (const f of viejas) fs.rmSync(f, { force: true });
  db.pragma('wal_checkpoint(TRUNCATE)');
  db.exec('VACUUM');
  console.log('Listo: base vaciada y copias viejas borradas.');
})().catch(e => { console.error(e.message); process.exit(1); });
