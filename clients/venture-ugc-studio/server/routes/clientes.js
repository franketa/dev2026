const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const { getDB, UPLOADS_DIR } = require('../db');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();

/* ---------- Utilidades ---------- */
function normalizarCodigo(v) {
  return String(v || '').trim().toUpperCase().replace(/[^A-Z0-9-]/g, '');
}
function slugArchivo(nombre) {
  const ext = path.extname(nombre).toLowerCase().slice(0, 10);
  const base = path.basename(nombre, path.extname(nombre))
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'archivo';
  return `${Date.now()}-${base}${ext}`;
}
function carpetaCliente(codigo) {
  return path.join(UPLOADS_DIR, codigo);
}
function filaMaterial(m) {
  return {
    id: m.id,
    filename: m.filename,
    original: m.original,
    etiqueta: m.etiqueta,
    mime: m.mime,
    size: m.size,
    created_at: m.created_at,
    url: `/uploads/material/${encodeURIComponent(m.codigo)}/${encodeURIComponent(m.filename)}`
  };
}

/* ---------- Multer (subida de material) ---------- */
const storage = multer.diskStorage({
  destination(req, file, cb) {
    const codigo = normalizarCodigo(req.params.codigo);
    const dir = carpetaCliente(codigo);
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename(req, file, cb) {
    cb(null, slugArchivo(file.originalname));
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 800 * 1024 * 1024, files: 20 } // 800 MB por archivo (reels en alta)
});

/* ============================================================
   PÚBLICO — lo consume portal.html
   El código de acceso ES la credencial del cliente.
   ============================================================ */
router.get('/portal/:codigo', (req, res) => {
  const codigo = normalizarCodigo(req.params.codigo);
  const db = getDB();
  const cliente = db.prepare('SELECT * FROM clientes WHERE codigo = ? AND activo = 1').get(codigo);
  if (!cliente) return res.status(404).json({ error: 'Código no encontrado' });
  const material = db.prepare('SELECT * FROM material WHERE codigo = ? ORDER BY created_at DESC, id DESC').all(codigo)
    .map(filaMaterial);
  delete cliente.activo;
  res.json({ cliente, material });
});

/* ============================================================
   ADMIN — gestión de clientes y material (JWT)
   ============================================================ */
router.get('/clientes', authMiddleware, (req, res) => {
  const db = getDB();
  const clientes = db.prepare(`
    SELECT c.*, COUNT(m.id) AS archivos, COALESCE(SUM(m.size), 0) AS peso
    FROM clientes c LEFT JOIN material m ON m.codigo = c.codigo
    GROUP BY c.codigo ORDER BY c.created_at DESC
  `).all();
  res.json({ clientes });
});

router.post('/clientes', authMiddleware, (req, res) => {
  const { codigo, nombre, rubro, entrega, estado, nota, tema } = req.body || {};
  const cod = normalizarCodigo(codigo);
  if (!cod || cod.length < 4) return res.status(400).json({ error: 'Código inválido (mínimo 4 caracteres, A-Z 0-9 y guiones)' });
  if (!nombre || !String(nombre).trim()) return res.status(400).json({ error: 'El nombre es obligatorio' });
  const db = getDB();
  if (db.prepare('SELECT codigo FROM clientes WHERE codigo = ?').get(cod)) {
    return res.status(409).json({ error: 'Ya existe un cliente con ese código' });
  }
  db.prepare('INSERT INTO clientes (codigo, nombre, rubro, entrega, estado, nota, tema) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(cod, String(nombre).trim(), rubro || '', entrega || '', estado || 'En producción', nota || '', tema || '');
  res.status(201).json({ ok: true, codigo: cod });
});

router.put('/clientes/:codigo', authMiddleware, (req, res) => {
  const cod = normalizarCodigo(req.params.codigo);
  const db = getDB();
  const existente = db.prepare('SELECT * FROM clientes WHERE codigo = ?').get(cod);
  if (!existente) return res.status(404).json({ error: 'Cliente no encontrado' });
  const { nombre, rubro, entrega, estado, nota, tema, activo } = req.body || {};
  db.prepare(`UPDATE clientes SET nombre = ?, rubro = ?, entrega = ?, estado = ?, nota = ?, tema = ?, activo = ? WHERE codigo = ?`)
    .run(
      nombre !== undefined ? String(nombre).trim() : existente.nombre,
      rubro !== undefined ? rubro : existente.rubro,
      entrega !== undefined ? entrega : existente.entrega,
      estado !== undefined ? estado : existente.estado,
      nota !== undefined ? nota : existente.nota,
      tema !== undefined ? tema : existente.tema,
      activo !== undefined ? (activo ? 1 : 0) : existente.activo,
      cod
    );
  res.json({ ok: true });
});

router.delete('/clientes/:codigo', authMiddleware, (req, res) => {
  const cod = normalizarCodigo(req.params.codigo);
  const db = getDB();
  if (!db.prepare('SELECT codigo FROM clientes WHERE codigo = ?').get(cod)) {
    return res.status(404).json({ error: 'Cliente no encontrado' });
  }
  db.prepare('DELETE FROM clientes WHERE codigo = ?').run(cod); // material cae por CASCADE
  fs.rmSync(carpetaCliente(cod), { recursive: true, force: true });
  res.json({ ok: true });
});

/* ---------- Material ---------- */
router.get('/clientes/:codigo/material', authMiddleware, (req, res) => {
  const cod = normalizarCodigo(req.params.codigo);
  const material = getDB().prepare('SELECT * FROM material WHERE codigo = ? ORDER BY created_at DESC, id DESC').all(cod)
    .map(filaMaterial);
  res.json({ material });
});

router.post('/clientes/:codigo/material', authMiddleware, upload.array('archivos', 20), (req, res) => {
  const cod = normalizarCodigo(req.params.codigo);
  const db = getDB();
  if (!db.prepare('SELECT codigo FROM clientes WHERE codigo = ?').get(cod)) {
    (req.files || []).forEach(f => fs.rmSync(f.path, { force: true }));
    return res.status(404).json({ error: 'Cliente no encontrado' });
  }
  if (!req.files || !req.files.length) {
    return res.status(400).json({ error: 'No llegó ningún archivo' });
  }
  const insertar = db.prepare('INSERT INTO material (codigo, filename, original, etiqueta, mime, size) VALUES (?, ?, ?, ?, ?, ?)');
  const subidos = req.files.map(f => {
    const info = insertar.run(cod, f.filename, f.originalname, req.body.etiqueta || '', f.mimetype || '', f.size);
    return filaMaterial({ id: info.lastInsertRowid, codigo: cod, filename: f.filename, original: f.originalname, etiqueta: req.body.etiqueta || '', mime: f.mimetype || '', size: f.size, created_at: new Date().toISOString() });
  });
  res.status(201).json({ ok: true, material: subidos });
});

router.delete('/clientes/:codigo/material/:id', authMiddleware, (req, res) => {
  const cod = normalizarCodigo(req.params.codigo);
  const db = getDB();
  const fila = db.prepare('SELECT * FROM material WHERE id = ? AND codigo = ?').get(req.params.id, cod);
  if (!fila) return res.status(404).json({ error: 'Archivo no encontrado' });
  db.prepare('DELETE FROM material WHERE id = ?').run(fila.id);
  fs.rmSync(path.join(carpetaCliente(cod), fila.filename), { force: true });
  res.json({ ok: true });
});

module.exports = router;
