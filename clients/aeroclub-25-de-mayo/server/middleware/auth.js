const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { db, DATA_DIR } = require('../db');

const COOKIE = 'a25_sesion';
const DURACION_DIAS = 30;
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
    try { out[par.slice(0, i).trim()] = decodeURIComponent(par.slice(i + 1).trim()); } catch { /* cookie ajena mal codificada: se ignora */ }
  }
  return out;
}

function emitirSesion(res, usuario) {
  const token = jwt.sign({ uid: usuario.id, v: usuario.token_version }, SECRETO, { expiresIn: `${DURACION_DIAS}d` });
  res.cookie(COOKIE, token, { httpOnly: true, sameSite: 'lax', secure: PROD, maxAge: DURACION_DIAS * 86400000, path: '/' });
}

function cerrarSesion(res) { res.clearCookie(COOKIE, { path: '/' }); }

function publico(u) {
  return {
    id: u.id, nombre: u.nombre, apellido: u.apellido, email: u.email, telefono: u.telefono, dni: u.dni, licencia: u.licencia,
    rol: u.rol, es_instructor: !!u.es_instructor, activo: !!u.activo, debe_cambiar_password: !!u.debe_cambiar_password
  };
}

const qUsuario = db.prepare('SELECT * FROM usuarios WHERE id = ?');

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

// Rutas que se pueden usar aunque el usuario todavía tenga que cambiar la contraseña temporal.
const PERMITIDAS_SIN_CAMBIO = ['/api/auth/me', '/api/auth/password', '/api/auth/logout'];

function requireAuth(req, res, next) {
  const u = identificar(req);
  if (!u) return res.status(401).json({ error: 'Tu sesión venció. Volvé a entrar.' });
  if (u.debe_cambiar_password && !PERMITIDAS_SIN_CAMBIO.includes(req.originalUrl.split('?')[0])) {
    return res.status(403).json({ error: 'Antes de seguir, elegí una contraseña nueva.', codigo: 'CAMBIAR_PASSWORD' });
  }
  req.user = publico(u);
  next();
}

function requireAdmin(req, res, next) {
  if (req.user?.rol !== 'admin') return res.status(403).json({ error: 'Sólo tesorería / administración puede hacer esto' });
  next();
}

// CSRF: toda escritura tiene que venir del frontend propio, que agrega este encabezado.
// Un formulario de otro sitio no puede setear encabezados personalizados.
function exigirOrigenPropio(req, res, next) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  if (req.get('X-A25') !== '1') return res.status(403).json({ error: 'Solicitud rechazada' });
  next();
}

// Límite de intentos de login por IP + email (en memoria, alcanza para un solo proceso).
const intentos = new Map();
const VENTANA_MS = 15 * 60 * 1000;
const MAX_INTENTOS = 8;
function limiteLogin(clave) {
  const ahora = Date.now();
  const lista = (intentos.get(clave) || []).filter(t => ahora - t < VENTANA_MS);
  intentos.set(clave, lista);
  return {
    bloqueado: lista.length >= MAX_INTENTOS,
    fallo() { lista.push(ahora); intentos.set(clave, lista); },
    exito() { intentos.delete(clave); }
  };
}

module.exports = { requireAuth, requireAdmin, exigirOrigenPropio, emitirSesion, cerrarSesion, publico, identificar, limiteLogin };
