const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { getDB, rowToProduct, toRow, INSERT_SQL } = require('../db');
const { authMiddleware, optionalAuth } = require('../middleware/auth');

let sharp = null;
try { sharp = require('sharp'); } catch (e) { console.warn('sharp no disponible: las fotos se guardan sin optimizar'); }

const router = express.Router();
const MAX_GALLERY = 8;
const UPLOAD_ROOT = path.join(__dirname, '..', '..', 'uploads', 'products');

const CATALOGOS = {
  categorias: ['Perfiles', 'Aberturas', 'Wall Panels', 'Accesorios', 'Herrajes'],
  lineas: ['Modena', 'A30', 'Herrero', 'Línea 20', 'Universal'],
  terminaciones: ['Anodizado natural', 'Blanco', 'Negro', 'Bronce', 'Gris', 'Símil madera', 'Crudo'],
  unidades: ['unidad', 'barra', 'metro', 'm²', 'juego', 'bolsa', 'rollo', 'caja'],
  stocks: [
    { value: 'disponible', label: 'En stock' },
    { value: 'a-pedido', label: 'A pedido' },
    { value: 'sin-stock', label: 'Sin stock' }
  ],
  monedas: ['ARS', 'USD']
};

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(UPLOAD_ROOT, String(req.params.id));
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase() || '.jpg';
    cb(null, `${file.fieldname === 'cover' ? 'cover-' : ''}${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 12 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype)) cb(null, true);
    else cb(new Error('Solo se permiten imágenes JPG, PNG o WebP'));
  }
});

// Optimiza la imagen subida: máx. 1600px, WebP. Devuelve la ruta pública final.
async function optimize(file, id) {
  const publicOriginal = `/uploads/products/${id}/${file.filename}`;
  if (!sharp) return publicOriginal;
  try {
    const outName = file.filename.replace(/\.[^.]+$/, '') + '.webp';
    const outPath = path.join(path.dirname(file.path), outName);
    await sharp(file.path).rotate().resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 82 }).toFile(outPath);
    fs.unlinkSync(file.path);
    return `/uploads/products/${id}/${outName}`;
  } catch (e) {
    console.warn('No se pudo optimizar la imagen:', e.message);
    return publicOriginal;
  }
}

function deleteLocalFile(publicPath) {
  if (!publicPath || !publicPath.startsWith('/uploads/')) return;
  const filePath = path.join(__dirname, '..', '..', publicPath.replace(/^\//, ''));
  if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
}

function catalogos(db) {
  const cats = db.prepare('SELECT DISTINCT categoria FROM products').all().map(r => r.categoria);
  const lineas = db.prepare("SELECT DISTINCT linea FROM products WHERE linea != ''").all().map(r => r.linea);
  return {
    ...CATALOGOS,
    categorias: [...new Set([...CATALOGOS.categorias, ...cats])],
    lineas: [...new Set([...CATALOGOS.lineas, ...lineas])]
  };
}

function findByIdOrSlug(db, key) {
  return /^\d+$/.test(key)
    ? db.prepare('SELECT * FROM products WHERE id = ?').get(key)
    : db.prepare('SELECT * FROM products WHERE slug = ?').get(key);
}

const ORDER = 'ORDER BY destacado DESC, orden ASC, id DESC';

// GET /api/products  (público: solo activos · admin con ?all=1: todos)
router.get('/', optionalAuth, (req, res) => {
  const db = getDB();
  const all = req.user && req.query.all === '1';
  const rows = db.prepare(`SELECT * FROM products ${all ? '' : 'WHERE activo = 1'} ${ORDER}`).all();
  res.json({ products: rows.map(rowToProduct), catalogos: catalogos(db) });
});

// GET /api/products/:idOrSlug
router.get('/:key', optionalAuth, (req, res) => {
  const db = getDB();
  const row = findByIdOrSlug(db, req.params.key);
  if (!row || (row.activo !== 1 && !req.user)) return res.status(404).json({ error: 'Producto no encontrado' });
  const related = db.prepare(`SELECT * FROM products WHERE activo = 1 AND categoria = ? AND id != ? ${ORDER} LIMIT 4`)
    .all(row.categoria, row.id).map(rowToProduct);
  res.json({ product: rowToProduct(row), related });
});

router.post('/', authMiddleware, (req, res) => {
  const p = req.body || {};
  if (!p.nombre || !p.categoria) return res.status(400).json({ error: 'Nombre y categoría son obligatorios' });
  const db = getDB();
  const result = db.prepare(INSERT_SQL).run(toRow(db, p));
  res.status(201).json(rowToProduct(db.prepare('SELECT * FROM products WHERE id = ?').get(result.lastInsertRowid)));
});

router.put('/:id', authMiddleware, (req, res) => {
  const db = getDB();
  const existing = db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Producto no encontrado' });
  const p = req.body || {};
  if (!p.nombre || !p.categoria) return res.status(400).json({ error: 'Nombre y categoría son obligatorios' });
  const row = toRow(db, {
    ...p,
    slug: p.slug || existing.slug,
    coverImage: existing.cover_image,
    images: JSON.parse(existing.images || '[]')
  }, existing.id);
  db.prepare(`
    UPDATE products SET slug=@slug, nombre=@nombre, categoria=@categoria, linea=@linea, codigo=@codigo, resumen=@resumen,
      descripcion=@descripcion, medidas=@medidas, terminacion=@terminacion, unidad=@unidad, precio=@precio, moneda=@moneda,
      mostrar_precio=@mostrar_precio, specs=@specs, tags=@tags, destacado=@destacado, activo=@activo, stock=@stock, orden=@orden,
      updated_at=datetime('now')
    WHERE id=@id
  `).run({ ...row, id: existing.id });
  res.json(rowToProduct(db.prepare('SELECT * FROM products WHERE id = ?').get(existing.id)));
});

router.delete('/:id', authMiddleware, (req, res) => {
  const db = getDB();
  const existing = db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Producto no encontrado' });
  deleteLocalFile(existing.cover_image);
  JSON.parse(existing.images || '[]').forEach(deleteLocalFile);
  const dir = path.join(UPLOAD_ROOT, String(existing.id));
  if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
  db.prepare('DELETE FROM products WHERE id = ?').run(existing.id);
  res.json({ success: true });
});

router.post('/:id/cover', authMiddleware, upload.single('cover'), async (req, res) => {
  const db = getDB();
  const existing = db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id);
  if (!existing) {
    if (req.file) fs.unlinkSync(req.file.path);
    return res.status(404).json({ error: 'Producto no encontrado' });
  }
  if (!req.file) return res.status(400).json({ error: 'No se recibió ninguna imagen' });
  deleteLocalFile(existing.cover_image);
  const coverPath = await optimize(req.file, existing.id);
  db.prepare("UPDATE products SET cover_image = ?, updated_at = datetime('now') WHERE id = ?").run(coverPath, existing.id);
  res.json(rowToProduct(db.prepare('SELECT * FROM products WHERE id = ?').get(existing.id)));
});

router.delete('/:id/cover', authMiddleware, (req, res) => {
  const db = getDB();
  const existing = db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Producto no encontrado' });
  deleteLocalFile(existing.cover_image);
  db.prepare('UPDATE products SET cover_image = NULL WHERE id = ?').run(existing.id);
  res.json(rowToProduct(db.prepare('SELECT * FROM products WHERE id = ?').get(existing.id)));
});

router.post('/:id/images', authMiddleware, upload.array('images', MAX_GALLERY), async (req, res) => {
  const db = getDB();
  const existing = db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id);
  const files = req.files || [];
  if (!existing) {
    files.forEach(f => fs.unlinkSync(f.path));
    return res.status(404).json({ error: 'Producto no encontrado' });
  }
  const current = JSON.parse(existing.images || '[]');
  if (current.length + files.length > MAX_GALLERY) {
    files.forEach(f => fs.unlinkSync(f.path));
    return res.status(400).json({ error: `Máximo ${MAX_GALLERY} fotos por producto (ya hay ${current.length})` });
  }
  const newPaths = [];
  for (const f of files) newPaths.push(await optimize(f, existing.id));
  db.prepare("UPDATE products SET images = ?, updated_at = datetime('now') WHERE id = ?")
    .run(JSON.stringify([...current, ...newPaths]), existing.id);
  res.json(rowToProduct(db.prepare('SELECT * FROM products WHERE id = ?').get(existing.id)));
});

router.delete('/:id/images/:filename', authMiddleware, (req, res) => {
  const db = getDB();
  const existing = db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Producto no encontrado' });
  const imagePath = `/uploads/products/${existing.id}/${path.basename(req.params.filename)}`;
  const filtered = JSON.parse(existing.images || '[]').filter(i => i !== imagePath);
  db.prepare('UPDATE products SET images = ? WHERE id = ?').run(JSON.stringify(filtered), existing.id);
  deleteLocalFile(imagePath);
  res.json(rowToProduct(db.prepare('SELECT * FROM products WHERE id = ?').get(existing.id)));
});

module.exports = router;
