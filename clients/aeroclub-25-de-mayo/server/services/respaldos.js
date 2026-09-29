// Copia de seguridad mensual de la base completa (incluye los comprobantes, que viven en la base).
// Se genera sola una vez por mes, después del cierre del mes anterior, y quedan las últimas 12
// en el volumen de datos. Se descargan desde Registro.

const fs = require('fs');
const path = require('path');
const { db, DATA_DIR, getConfig, auditar } = require('../db');
const cierres = require('./cierres');
const { ErrorNegocio, hoy, periodoActual, sumarMeses } = require('../util');

const DIR = path.join(DATA_DIR, 'respaldos');
const CONSERVAR = 12;
const PATRON = /^aeroclub-\d{4}-\d{2}\.sqlite$/;

const nombreDe = (periodo) => `aeroclub-${periodo}.sqlite`;

function listar() {
  if (!fs.existsSync(DIR)) return [];
  return fs.readdirSync(DIR).filter(n => PATRON.test(n)).sort().reverse().map(nombre => {
    const st = fs.statSync(path.join(DIR, nombre));
    return { nombre, periodo: nombre.slice(9, 16), bytes: st.size, creado_en: st.mtime.toISOString() };
  });
}

function ruta(nombre) {
  if (!PATRON.test(String(nombre))) throw new ErrorNegocio('Copia inexistente', 404);
  const r = path.join(DIR, nombre);
  if (!fs.existsSync(r)) throw new ErrorNegocio('Copia inexistente', 404);
  return r;
}

// Toca hacer la copia de este mes si todavía no existe y el mes anterior ya se cerró
// (o, si el cierre automático está apagado, pasado el día de cierre configurado).
function tocaRespaldo() {
  if (fs.existsSync(path.join(DIR, nombreDe(periodoActual())))) return false;
  const anteriorCerrado = !cierres.periodosPendientes().includes(sumarMeses(periodoActual(), -1));
  const diaCierre = Number(getConfig().cierre_dia) || 5;
  return anteriorCerrado || Number(hoy().slice(8)) > diaCierre;
}

let enCurso = false;
async function respaldoMensual({ forzar = false } = {}) {
  if (enCurso || (!forzar && !tocaRespaldo())) return null;
  enCurso = true;
  try {
    fs.mkdirSync(DIR, { recursive: true });
    const nombre = nombreDe(periodoActual());
    const temporal = path.join(DIR, `.${nombre}.tmp`);
    await db.backup(temporal);            // consistente aunque haya escrituras en curso
    fs.renameSync(temporal, path.join(DIR, nombre));
    for (const viejo of listar().slice(CONSERVAR)) fs.unlinkSync(path.join(DIR, viejo.nombre));
    auditar(null, 'respaldo.mensual', `Copia de seguridad ${nombre}`);
    console.log(`[respaldo] ${nombre} generado`);
    return nombre;
  } finally {
    enCurso = false;
  }
}

module.exports = { listar, ruta, respaldoMensual };
