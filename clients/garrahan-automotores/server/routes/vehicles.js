const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { getDB, rowToVehicle } = require('../db');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();

const MAX_GALLERY = 10;

const CATALOGOS = {
  condiciones: ['0km', 'usado'],
  tipos: ['SUV', 'Pickup', 'Sedán', 'Hatchback', 'Rural', 'Monovolumen', 'Utilitario', 'Coupé', 'Cabriolet', 'Moto', 'Otro'],
  combustibles: ['Nafta', 'Diésel', 'GNC', 'Nafta + GNC', 'Híbrido', 'Eléctrico'],
  transmisiones: ['Manual', 'Automática', 'Automática CVT', 'Automatizada'],
  tracciones: ['4x2', '4x4', 'AWD'],
  monedas: ['ARS', 'USD'],
  estados: ['disponible', 'reservado', 'vendido'],
  marcas: ['Fiat', 'Chery', 'Volkswagen', 'Renault', 'Toyota', 'Chevrolet', 'Ford', 'Peugeot', 'Citroën', 'DS', 'Honda', 'Nissan', 'Jeep']
};

// Multer config for image uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(__dirname, '..', '..', 'uploads', 'vehicles', String(req.params.id));
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const prefix = file.fieldname === 'cover' ? 'cover-' : '';
    const name = `${prefix}${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext}`;
    cb(null, name);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/webp'];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Solo se permiten imagenes JPEG, PNG o WebP'));
    }
  }
});

// Delete a local (uploaded) file given its public /uploads/... path
function deleteLocalFile(publicPath) {
  if (!publicPath || !publicPath.startsWith('/uploads/')) return;
  const filePath = path.join(__dirname, '..', '..', publicPath.replace(/^\//, ''));
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }
}

// Build marcas catalog: defaults + whatever exists in the DB
function marcasCatalog(db) {
  const inDB = db.prepare('SELECT DISTINCT marca FROM vehicles ORDER BY marca').all().map(r => r.marca);
  return [...new Set([...CATALOGOS.marcas, ...inDB])].sort((a, b) => a.localeCompare(b, 'es'));
}

// GET /api/vehicles
router.get('/', (req, res) => {
  const db = getDB();
  const rows = db.prepare('SELECT * FROM vehicles ORDER BY destacado DESC, id DESC').all();
  res.json({
    vehicles: rows.map(rowToVehicle),
    catalogos: { ...CATALOGOS, marcas: marcasCatalog(db) }
  });
});

// GET /api/vehicles/:id
router.get('/:id', (req, res) => {
  const db = getDB();
  const row = db.prepare('SELECT * FROM vehicles WHERE id = ?').get(req.params.id);
  if (!row) {
    return res.status(404).json({ error: 'Vehículo no encontrado' });
  }
  res.json(rowToVehicle(row));
});

// POST /api/vehicles
router.post('/', authMiddleware, (req, res) => {
  const v = req.body;

  if (!v.marca || !v.modelo || !v.anio) {
    return res.status(400).json({ error: 'Marca, modelo y año son obligatorios' });
  }

  const db = getDB();
  const result = db.prepare(`
    INSERT INTO vehicles (marca, modelo, version, anio, km, condicion, tipo, combustible, transmision,
      motor, puertas, color, traccion, precio, precio_descuento, moneda, mostrar_precio, financiacion, permuta,
      equipamiento, descripcion, destacado, estado)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    v.marca,
    v.modelo,
    v.version || '',
    v.anio,
    v.condicion === '0km' ? 0 : (v.km || 0),
    v.condicion || 'usado',
    v.tipo || 'Sedán',
    v.combustible || 'Nafta',
    v.transmision || 'Manual',
    v.motor || '',
    v.puertas || 5,
    v.color || '',
    v.traccion || '4x2',
    v.precio || 0,
    v.precioDescuento || 0,
    v.moneda || 'ARS',
    v.mostrarPrecio !== false ? 1 : 0,
    v.financiacion !== false ? 1 : 0,
    v.permuta !== false ? 1 : 0,
    JSON.stringify(v.equipamiento || []),
    v.descripcion || '',
    v.destacado ? 1 : 0,
    v.estado || 'disponible'
  );

  const row = db.prepare('SELECT * FROM vehicles WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json(rowToVehicle(row));
});

// PUT /api/vehicles/:id
router.put('/:id', authMiddleware, (req, res) => {
  const db = getDB();
  const existing = db.prepare('SELECT * FROM vehicles WHERE id = ?').get(req.params.id);
  if (!existing) {
    return res.status(404).json({ error: 'Vehículo no encontrado' });
  }

  const v = req.body;

  db.prepare(`
    UPDATE vehicles SET marca=?, modelo=?, version=?, anio=?, km=?, condicion=?, tipo=?, combustible=?,
      transmision=?, motor=?, puertas=?, color=?, traccion=?, precio=?, precio_descuento=?, moneda=?, mostrar_precio=?,
      financiacion=?, permuta=?, equipamiento=?, descripcion=?, destacado=?, estado=?
    WHERE id=?
  `).run(
    v.marca ?? existing.marca,
    v.modelo ?? existing.modelo,
    v.version ?? existing.version,
    v.anio ?? existing.anio,
    v.km ?? existing.km,
    v.condicion ?? existing.condicion,
    v.tipo ?? existing.tipo,
    v.combustible ?? existing.combustible,
    v.transmision ?? existing.transmision,
    v.motor ?? existing.motor,
    v.puertas ?? existing.puertas,
    v.color ?? existing.color,
    v.traccion ?? existing.traccion,
    v.precio ?? existing.precio,
    v.precioDescuento ?? existing.precio_descuento,
    v.moneda ?? existing.moneda,
    v.mostrarPrecio !== undefined ? (v.mostrarPrecio ? 1 : 0) : existing.mostrar_precio,
    v.financiacion !== undefined ? (v.financiacion ? 1 : 0) : existing.financiacion,
    v.permuta !== undefined ? (v.permuta ? 1 : 0) : existing.permuta,
    v.equipamiento ? JSON.stringify(v.equipamiento) : existing.equipamiento,
    v.descripcion ?? existing.descripcion,
    v.destacado !== undefined ? (v.destacado ? 1 : 0) : existing.destacado,
    v.estado ?? existing.estado,
    req.params.id
  );

  const row = db.prepare('SELECT * FROM vehicles WHERE id = ?').get(req.params.id);
  res.json(rowToVehicle(row));
});

// DELETE /api/vehicles/:id
router.delete('/:id', authMiddleware, (req, res) => {
  const db = getDB();
  const existing = db.prepare('SELECT * FROM vehicles WHERE id = ?').get(req.params.id);
  if (!existing) {
    return res.status(404).json({ error: 'Vehículo no encontrado' });
  }

  db.prepare('DELETE FROM vehicles WHERE id = ?').run(req.params.id);

  // Clean up uploaded images
  const uploadDir = path.join(__dirname, '..', '..', 'uploads', 'vehicles', String(req.params.id));
  if (fs.existsSync(uploadDir)) {
    fs.rmSync(uploadDir, { recursive: true, force: true });
  }

  res.json({ success: true });
});

// POST /api/vehicles/:id/cover - Upload / replace the cover image (single)
router.post('/:id/cover', authMiddleware, upload.single('cover'), (req, res) => {
  const db = getDB();
  const existing = db.prepare('SELECT * FROM vehicles WHERE id = ?').get(req.params.id);
  if (!existing) {
    if (req.file) fs.unlinkSync(req.file.path);
    return res.status(404).json({ error: 'Vehículo no encontrado' });
  }
  if (!req.file) {
    return res.status(400).json({ error: 'No se recibió ninguna imagen' });
  }

  // Delete previous cover if it was an uploaded file
  deleteLocalFile(existing.cover_image);

  const coverPath = `/uploads/vehicles/${req.params.id}/${req.file.filename}`;
  db.prepare('UPDATE vehicles SET cover_image = ? WHERE id = ?').run(coverPath, req.params.id);

  const row = db.prepare('SELECT * FROM vehicles WHERE id = ?').get(req.params.id);
  res.json(rowToVehicle(row));
});

// DELETE /api/vehicles/:id/cover - Remove the cover image
router.delete('/:id/cover', authMiddleware, (req, res) => {
  const db = getDB();
  const existing = db.prepare('SELECT * FROM vehicles WHERE id = ?').get(req.params.id);
  if (!existing) {
    return res.status(404).json({ error: 'Vehículo no encontrado' });
  }

  deleteLocalFile(existing.cover_image);
  db.prepare('UPDATE vehicles SET cover_image = NULL WHERE id = ?').run(req.params.id);

  const row = db.prepare('SELECT * FROM vehicles WHERE id = ?').get(req.params.id);
  res.json(rowToVehicle(row));
});

// POST /api/vehicles/:id/images - Upload gallery images (up to 10 total per vehicle)
router.post('/:id/images', authMiddleware, upload.array('images', MAX_GALLERY), (req, res) => {
  const db = getDB();
  const existing = db.prepare('SELECT * FROM vehicles WHERE id = ?').get(req.params.id);
  if (!existing) {
    (req.files || []).forEach(f => fs.unlinkSync(f.path));
    return res.status(404).json({ error: 'Vehículo no encontrado' });
  }

  const currentImages = JSON.parse(existing.images || '[]');
  const files = req.files || [];

  if (currentImages.length + files.length > MAX_GALLERY) {
    files.forEach(f => fs.unlinkSync(f.path));
    return res.status(400).json({
      error: `Máximo ${MAX_GALLERY} fotos de galería por vehículo (ya hay ${currentImages.length})`
    });
  }

  const newPaths = files.map(f => `/uploads/vehicles/${req.params.id}/${f.filename}`);
  const allImages = [...currentImages, ...newPaths];

  db.prepare('UPDATE vehicles SET images = ? WHERE id = ?').run(JSON.stringify(allImages), req.params.id);

  const row = db.prepare('SELECT * FROM vehicles WHERE id = ?').get(req.params.id);
  res.json(rowToVehicle(row));
});

// DELETE /api/vehicles/:id/images/:filename - Delete one gallery image
router.delete('/:id/images/:filename', authMiddleware, (req, res) => {
  const db = getDB();
  const existing = db.prepare('SELECT * FROM vehicles WHERE id = ?').get(req.params.id);
  if (!existing) {
    return res.status(404).json({ error: 'Vehículo no encontrado' });
  }

  const filename = path.basename(req.params.filename);
  const imagePath = `/uploads/vehicles/${req.params.id}/${filename}`;
  const currentImages = JSON.parse(existing.images || '[]');
  const filtered = currentImages.filter(img => img !== imagePath);

  db.prepare('UPDATE vehicles SET images = ? WHERE id = ?').run(JSON.stringify(filtered), req.params.id);

  deleteLocalFile(imagePath);

  const row = db.prepare('SELECT * FROM vehicles WHERE id = ?').get(req.params.id);
  res.json(rowToVehicle(row));
});

module.exports = router;
