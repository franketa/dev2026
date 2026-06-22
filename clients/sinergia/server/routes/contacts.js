const express = require('express');
const { getDB, rowToContact } = require('../db');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();

// GET /api/contacts  -> public, only active contacts (for the landing page)
router.get('/', (req, res) => {
  const rows = getDB()
    .prepare('SELECT * FROM contacts WHERE active = 1 ORDER BY position ASC, id ASC')
    .all();
  res.json(rows.map(rowToContact));
});

// GET /api/contacts/all  -> admin, every contact (active and hidden)
router.get('/all', authMiddleware, (req, res) => {
  const rows = getDB()
    .prepare('SELECT * FROM contacts ORDER BY position ASC, id ASC')
    .all();
  res.json(rows.map(rowToContact));
});

// POST /api/contacts  -> create
router.post('/', authMiddleware, (req, res) => {
  const { name, specialty, phone, link, message, active } = req.body;
  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'El nombre es obligatorio' });
  }
  const db = getDB();
  const max = db.prepare('SELECT MAX(position) AS m FROM contacts').get();
  const position = (max.m === null ? -1 : max.m) + 1;
  const info = db
    .prepare(
      `INSERT INTO contacts (name, specialty, phone, link, message, position, active)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      name.trim(),
      (specialty || '').trim(),
      (phone || '').trim(),
      (link || '').trim(),
      (message || '').trim(),
      position,
      active === false ? 0 : 1
    );
  const row = db.prepare('SELECT * FROM contacts WHERE id = ?').get(info.lastInsertRowid);
  res.status(201).json(rowToContact(row));
});

// PUT /api/contacts/:id  -> update
router.put('/:id', authMiddleware, (req, res) => {
  const db = getDB();
  const existing = db.prepare('SELECT * FROM contacts WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Contacto no encontrado' });

  const { name, specialty, phone, link, message, active } = req.body;
  db.prepare(
    `UPDATE contacts SET name = ?, specialty = ?, phone = ?, link = ?, message = ?, active = ?
     WHERE id = ?`
  ).run(
    name !== undefined ? name.trim() : existing.name,
    specialty !== undefined ? (specialty || '').trim() : existing.specialty,
    phone !== undefined ? (phone || '').trim() : existing.phone,
    link !== undefined ? (link || '').trim() : existing.link,
    message !== undefined ? (message || '').trim() : existing.message,
    active !== undefined ? (active ? 1 : 0) : existing.active,
    req.params.id
  );
  const row = db.prepare('SELECT * FROM contacts WHERE id = ?').get(req.params.id);
  res.json(rowToContact(row));
});

// DELETE /api/contacts/:id
router.delete('/:id', authMiddleware, (req, res) => {
  const info = getDB().prepare('DELETE FROM contacts WHERE id = ?').run(req.params.id);
  if (info.changes === 0) return res.status(404).json({ error: 'Contacto no encontrado' });
  res.json({ ok: true });
});

// PUT /api/contacts/reorder  -> body: { order: [id1, id2, ...] }
router.put('/order/reorder', authMiddleware, (req, res) => {
  const { order } = req.body;
  if (!Array.isArray(order)) {
    return res.status(400).json({ error: 'Se esperaba un arreglo de ids' });
  }
  const db = getDB();
  const update = db.prepare('UPDATE contacts SET position = ? WHERE id = ?');
  const tx = db.transaction((ids) => {
    ids.forEach((id, i) => update.run(i, id));
  });
  tx(order);
  res.json({ ok: true });
});

module.exports = router;
