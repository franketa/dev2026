const express = require('express');
const bcrypt = require('bcryptjs');
const { db } = require('../db');
const { requireAuth, emitirSesion, cerrarSesion, publico, qUsuario } = require('../middleware/auth');
const { auditar } = require('../services/auditoria');
const { normalizarEmail } = require('../util');

const router = express.Router();

// Hash fijo para comparar aunque el email no exista (mismo tiempo de respuesta).
const HASH_FALSO = bcrypt.hashSync('no-existe', 10);

// Freno simple contra adivinar contraseñas: 8 intentos fallidos por IP y email cada 15 minutos.
const fallidos = new Map();
const VENTANA = 15 * 60 * 1000;
function bloqueado(clave) {
  const f = fallidos.get(clave);
  if (!f || Date.now() - f.desde > VENTANA) { fallidos.delete(clave); return false; }
  return f.n >= 8;
}
function fallo(clave) {
  const f = fallidos.get(clave);
  if (!f || Date.now() - f.desde > VENTANA) fallidos.set(clave, { n: 1, desde: Date.now() });
  else f.n++;
}

router.post('/login', (req, res) => {
  const email = normalizarEmail(req.body?.email);
  const password = String(req.body?.password || '');
  const clave = `${req.ip}|${email}`;
  if (bloqueado(clave)) return res.status(429).json({ error: 'Demasiados intentos. Esperá unos minutos y probá de nuevo.' });

  const u = db.prepare('SELECT * FROM usuarios WHERE email = ?').get(email);
  const ok = bcrypt.compareSync(password, u?.password_hash || HASH_FALSO);
  if (!u || !ok) { fallo(clave); return res.status(401).json({ error: 'Email o contraseña incorrectos' }); }
  if (!u.activo) return res.status(403).json({ error: 'Tu usuario está dado de baja. Consultá con la Sede Central.' });
  fallidos.delete(clave);

  db.prepare(`UPDATE usuarios SET ultimo_acceso = datetime('now') WHERE id = ?`).run(u.id);
  auditar({ id: u.id, ip: req.ip }, { accion: 'sesion.ingreso', sedeId: u.sede_id, entidad: 'usuario', entidadId: u.id });
  emitirSesion(res, u);
  res.json({ usuario: publico(qUsuario.get(u.id)) });
});

router.post('/logout', (req, res) => {
  cerrarSesion(res);
  res.json({ ok: true });
});

router.get('/me', requireAuth, (req, res) => res.json({ usuario: req.user }));

router.post('/password', requireAuth, (req, res) => {
  const actual = String(req.body?.actual || '');
  const nueva = String(req.body?.nueva || '');
  const u = db.prepare('SELECT * FROM usuarios WHERE id = ?').get(req.user.id);
  if (!bcrypt.compareSync(actual, u.password_hash)) return res.status(400).json({ error: 'La contraseña actual no es correcta' });
  if (nueva.length < 8) return res.status(400).json({ error: 'La contraseña nueva tiene que tener al menos 8 caracteres' });
  if (nueva === actual) return res.status(400).json({ error: 'La contraseña nueva tiene que ser distinta de la actual' });

  // Subir token_version cierra las sesiones abiertas en otros dispositivos.
  db.prepare('UPDATE usuarios SET password_hash = ?, debe_cambiar_password = 0, token_version = token_version + 1 WHERE id = ?')
    .run(bcrypt.hashSync(nueva, 10), u.id);
  auditar(req.actor, { accion: 'usuario.password', sedeId: u.sede_id, entidad: 'usuario', entidadId: u.id });
  const actualizado = qUsuario.get(u.id);
  emitirSesion(res, actualizado);
  res.json({ usuario: publico(actualizado) });
});

module.exports = router;
