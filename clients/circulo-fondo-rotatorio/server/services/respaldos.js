// Copia de seguridad diaria de la base completa en el volumen de datos (`/app/data/respaldos`).
// db.backup() es consistente aunque haya escrituras en curso. Quedan las últimas 30.
// Los adjuntos viven en el volumen (o en MinIO): se respaldan con el volumen.

const fs = require('fs');
const path = require('path');
const { db, DATA_DIR } = require('../db');
const { auditar } = require('./auditoria');
const { ErrorNegocio, hoy } = require('../util');

const DIR = path.join(DATA_DIR, 'respaldos');
const CONSERVAR = 30;
const PATRON = /^fondo-\d{4}-\d{2}-\d{2}\.sqlite$/;

function listar() {
  if (!fs.existsSync(DIR)) return [];
  return fs.readdirSync(DIR).filter(n => PATRON.test(n)).sort().reverse().map(nombre => {
    const st = fs.statSync(path.join(DIR, nombre));
    return { nombre, fecha: nombre.slice(6, 16), bytes: st.size, creado_en: st.mtime.toISOString() };
  });
}

function ruta(nombre) {
  if (!PATRON.test(String(nombre))) throw new ErrorNegocio('Copia inexistente', 404);
  const r = path.join(DIR, nombre);
  if (!fs.existsSync(r)) throw new ErrorNegocio('Copia inexistente', 404);
  return r;
}

let enCurso = false;
async function respaldoDiario({ forzar = false } = {}) {
  const nombre = `fondo-${hoy()}.sqlite`;
  if (enCurso || (!forzar && fs.existsSync(path.join(DIR, nombre)))) return null;
  enCurso = true;
  try {
    fs.mkdirSync(DIR, { recursive: true });
    const temporal = path.join(DIR, `.${nombre}.tmp`);
    await db.backup(temporal);
    fs.renameSync(temporal, path.join(DIR, nombre));
    for (const viejo of listar().slice(CONSERVAR)) fs.unlinkSync(path.join(DIR, viejo.nombre));
    auditar(null, { accion: 'respaldo.diario', despues: { nombre } });
    return nombre;
  } finally {
    enCurso = false;
  }
}

module.exports = { listar, ruta, respaldoDiario };
