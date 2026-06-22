const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { getDB } = require('../db');
const { authMiddleware, JWT_SECRET } = require('../middleware/auth');

const router = express.Router();

function getHash() {
  const row = getDB().prepare('SELECT value FROM settings WHERE key = ?').get('password_hash');
  return row ? row.value : null;
}

// POST /api/auth/login  { password }  -> very simple, password-only login
router.post('/login', (req, res) => {
  const { password } = req.body;
  if (!password) {
    return res.status(400).json({ error: 'Ingresá la contraseña' });
  }
  const hash = getHash();
  if (!hash || !bcrypt.compareSync(password, hash)) {
    return res.status(401).json({ error: 'Contraseña incorrecta' });
  }
  const token = jwt.sign({ admin: true }, JWT_SECRET, { expiresIn: '30d' });
  res.json({ token });
});

// GET /api/auth/verify
router.get('/verify', authMiddleware, (req, res) => {
  res.json({ valid: true });
});

// POST /api/auth/password  { current, next }  -> change the admin password
router.post('/password', authMiddleware, (req, res) => {
  const { current, next } = req.body;
  if (!current || !next) {
    return res.status(400).json({ error: 'Completá la contraseña actual y la nueva' });
  }
  const hash = getHash();
  if (!hash || !bcrypt.compareSync(current, hash)) {
    return res.status(401).json({ error: 'La contraseña actual no es correcta' });
  }
  if (next.length < 4) {
    return res.status(400).json({ error: 'La nueva contraseña debe tener al menos 4 caracteres' });
  }
  const newHash = bcrypt.hashSync(next, 10);
  getDB().prepare('UPDATE settings SET value = ? WHERE key = ?').run(newHash, 'password_hash');
  res.json({ ok: true });
});

module.exports = router;
