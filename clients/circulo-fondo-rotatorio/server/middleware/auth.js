const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { db, DATA_DIR } = require('../db');
const acceso = require('../services/acceso');
const { ROLES } = require('../permisos');

const COOKIE = 'fr_sesion';
const DURACION_HORAS = 12;          // una jornada: es plata de la Fuerza, la sesión no dura un mes
const PROD = process.env.NODE_ENV === 'production';

// El secreto se toma del entorno o se genera una vez y queda en el volumen de datos.
function cargarSecreto() {
  if (process.env.JWT_SECRET) return process.env.JWT_SECRET;
  const archivo = path.join(DATA_DIR, '.jwt-secret');
  if (fs.existsSync(archivo)) return fs.readFileSync(archivo, 'utf8').trim();
  const s = crypto.randomBytes(48).toString('base64url');
  fs.writeFileSync(archivo, s, { mode: 0o600 });
  return s;
}
const SECRETO = cargarSecreto();

function leerCookies(req) {
  const out = {};
  for (const par of (req.headers.cookie || '').split(';')) {
    const i = par.indexOf('=');
    if (i <= 0) continue;
    try { out[par.slice(0, i).trim()] = decodeURIComponent(par.slice(i + 1).trim()); } catch { /* cookie ajena mal codificada */ }
  }
  return out;
}

function emitirSesion(res, usuario) {
  const token = jwt.sign({ uid: usuario.id, v: usuario.token_version }, SECRETO, { expiresIn: `${DURACION_HORAS}h` });
  res.cookie(COOKIE, token, { httpOnly: true, sameSite: 'lax', secure: PROD, maxAge: DURACION_HORAS * 3600000, path: '/' });
}
function cerrarSesion(res) { res.clearCookie(COOKIE, { path: '/' }); }

const qUsuario = db.prepare('SELECT u.*, s.nombre AS sede_nombre, s.es_central FROM usuarios u LEFT JOIN sedes s ON s.id = u.sede_id WHERE u.id = ?');

function publico(u) {
  return {
    id: u.id, nombre: u.nombre, apellido: u.apellido, email: u.email, telefono: u.telefono,
    rol: u.rol, rol_nombre: ROLES[u.rol]?.nombre || u.rol, ambito: ROLES[u.rol]?.ambito,
    sede_id: u.sede_id, sede_nombre: u.sede_nombre || null, es_central: !!u.es_central,
    debe_cambiar_password: !!u.debe_cambiar_password, permisos: acceso.permisosDe(u.rol)
  };
}

function identificar(req) {
  const token = leerCookies(req)[COOKIE];
  if (!token) return null;
  try {
    const p = jwt.verify(token, SECRETO);
    const u = qUsuario.get(p.uid);
    if (!u || !u.activo || u.token_version !== p.v) return null;
    return u;
  } catch { return null; }
}

const PERMITIDAS_SIN_CAMBIO = ['/api/auth/me', '/api/auth/password', '/api/auth/logout'];

function requireAuth(req, res, next) {
  const u = identificar(req);
  if (!u) return res.status(401).json({ error: 'Tu sesión venció. Volvé a entrar.' });
  if (u.debe_cambiar_password && !PERMITIDAS_SIN_CAMBIO.includes(req.originalUrl.split('?')[0])) {
    return res.status(403).json({ error: 'Antes de seguir, elegí una contraseña nueva.', codigo: 'CAMBIAR_PASSWORD' });
  }
  req.user = publico(u);
  // Quien actúa, para los servicios: rol, sede e IP (va a la auditoría).
  req.actor = { id: u.id, rol: u.rol, sede_id: u.sede_id, ip: req.ip, nombre: `${u.nombre} ${u.apellido}`.trim() };
  next();
}

// CSRF: toda escritura tiene que venir del frontend propio, que agrega este encabezado.
function exigirOrigenPropio(req, res, next) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  if (req.get('X-FR') !== '1') return res.status(403).json({ error: 'Solicitud rechazada' });
  next();
}

module.exports = { requireAuth, exigirOrigenPropio, emitirSesion, cerrarSesion, publico, identificar, qUsuario };
