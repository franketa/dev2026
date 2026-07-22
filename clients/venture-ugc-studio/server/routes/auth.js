const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { getDB } = require('../db');
const { authMiddleware, JWT_SECRET } = require('../middleware/auth');

const router = express.Router();

router.post('/login', (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) {
    return res.status(400).json({ error: 'Email y contraseña requeridos' });
  }
  const user = getDB().prepare('SELECT * FROM admin_users WHERE email = ?').get(String(email).toLowerCase().trim());
  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return res.status(401).json({ error: 'Credenciales inválidas' });
  }
  const token = jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, { expiresIn: '7d' });
  res.json({ token, email: user.email });
});

router.post('/change-password', authMiddleware, (req, res) => {
  const { actual, nueva } = req.body || {};
  if (!actual || !nueva || String(nueva).length < 8) {
    return res.status(400).json({ error: 'La contraseña nueva debe tener al menos 8 caracteres' });
  }
  const db = getDB();
  const user = db.prepare('SELECT * FROM admin_users WHERE id = ?').get(req.user.id);
  if (!user || !bcrypt.compareSync(actual, user.password_hash)) {
    return res.status(401).json({ error: 'La contraseña actual no es correcta' });
  }
  db.prepare('UPDATE admin_users SET password_hash = ? WHERE id = ?').run(bcrypt.hashSync(nueva, 10), user.id);
  res.json({ ok: true });
});

module.exports = router;
