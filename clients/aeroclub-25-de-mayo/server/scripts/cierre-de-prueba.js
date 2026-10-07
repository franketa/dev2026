// Cierre de prueba: corre el cierre automático como si ya fuera el día y la hora de cierre del mes
// siguiente, con lo cargado hasta ahora. Sirve para ver los cupones sin esperar a fin de mes.
// Antes guarda una copia de la base. Se deshace con deshacer-cierre.js.
//
//   node server/scripts/cierre-de-prueba.js            (cierra el mes en curso)
//
// Lo que se cargue después con fecha de este mes va a entrar en el cierre siguiente, así que
// conviene deshacerlo apenas se revisen los cupones.

const fs = require('fs');
const path = require('path');

const { db, getConfig, DATA_DIR } = require('../db');
const util = require('../util');

const periodo = util.periodoActual();
const cfg = getConfig();
const sig = util.sumarMeses(periodo, 1);
const dia = String(Math.min(Number(cfg.cierre_dia) || 1, 28)).padStart(2, '0');
const hora = String(Number(cfg.cierre_hora) || 0).padStart(2, '0');
const momento = new Date(`${sig}-${dia}T${hora}:00:30-03:00`);   // hora argentina

(async () => {
  const dir = path.join(DATA_DIR, 'respaldos');
  fs.mkdirSync(dir, { recursive: true });
  const copia = path.join(dir, `antes-del-cierre-de-prueba-${new Date().toISOString().replace(/[:.]/g, '-')}.sqlite`);
  await db.backup(copia);
  console.log(`Copia de la base: ${copia}`);

  // El reloj de este proceso pasa al momento del cierre (la base sigue con la fecha real).
  const Real = Date;
  global.Date = class extends Real {
    constructor(...a) { if (a.length) super(...a); else super(momento.getTime()); }
    static now() { return momento.getTime(); }
  };

  const cierres = require('../services/cierres');
  console.log(`Cierre automático como si fuera el ${util.hoy()} a las ${util.horaAR()} h`);
  const hechos = cierres.cierreAutomatico();
  if (!hechos.length) { console.log('No se cerró nada (¿el cierre automático está apagado?)'); process.exit(1); }
  for (const r of hechos) {
    console.log(`${util.nombrePeriodo(r.cierre.periodo)}: ${r.cierre.cantidad_vuelos} vuelos, ${util.fmtHoras(r.cierre.total_decimas)}, ${r.cupones.length} cupones, ${util.fmtPesos(r.cierre.total_cupones)} a cobrar`);
    for (const c of r.cupones) console.log(`  ${c.numero}  ${c.apellido}, ${c.nombre}: ${util.fmtPesos(c.total)} (vence ${c.vencimiento})`);
  }
})().catch(e => { console.error(e.message); process.exit(1); });
