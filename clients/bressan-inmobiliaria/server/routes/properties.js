const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { getDB, rowToProperty } = require('../db');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(__dirname, '..', '..', 'uploads', 'properties', String(req.params.id));
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const name = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext}`;
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

router.get('/', (req, res) => {
  const db = getDB();
  const rows = db.prepare('SELECT * FROM properties ORDER BY id DESC').all();
  const properties = rows.map(rowToProperty);
  res.json({
    properties,
    propertyTypes: [
      { id: 'casa', label: 'Casa' },
      { id: 'departamento', label: 'Departamento' },
      { id: 'quinta', label: 'Quinta' },
      { id: 'campo', label: 'Campo' },
      { id: 'ph', label: 'PH' },
      { id: 'local', label: 'Local Comercial' },
      { id: 'oficina', label: 'Oficina' },
      { id: 'terreno', label: 'Terreno' },
      { id: 'lote', label: 'Lote' },
      { id: 'cochera', label: 'Cochera' }
    ],
    operations: [
      { id: 'venta', label: 'Venta' },
      { id: 'alquiler', label: 'Alquiler' },
      { id: 'vendido', label: 'Vendido' },
      { id: 'alquilado', label: 'Alquilado' },
      { id: 'reservado', label: 'Reservado' }
    ],
    neighborhoods: [
      'Lobos', 'Antonio Carboni', 'Elvira', 'Salvador María',
      'Empalme Lobos', 'Las Chacras', 'Laguna de Lobos',
      'Navarro', 'San Miguel del Monte', 'Roque Pérez',
      'Cañuelas', '25 de Mayo', 'Saladillo'
    ]
  });
});

router.get('/:id', (req, res) => {
  const db = getDB();
  const row = db.prepare('SELECT * FROM properties WHERE id = ?').get(req.params.id);
  if (!row) {
    return res.status(404).json({ error: 'Propiedad no encontrada' });
  }
  res.json(rowToProperty(row));
});

router.post('/', authMiddleware, (req, res) => {
  const db = getDB();
  const p = req.body;

  const safeCoverImage = (p.coverImage && !p.coverImage.startsWith('blob:')) ? p.coverImage : null;

  const result = db.prepare(`
    INSERT INTO properties (title, type, operation, price, currency, show_price, neighborhood, city, address,
      bedrooms, bathrooms, garage, area, covered_area, description, amenities, cover_image, images, featured, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    p.title,
    p.type,
    p.operation,
    p.price || 0,
    p.currency || 'USD',
    p.showPrice !== false ? 1 : 0,
    p.location?.neighborhood || '',
    p.location?.city || 'Lobos',
    p.location?.address || '',
    p.features?.bedrooms || 0,
    p.features?.bathrooms || 0,
    p.features?.garage || 0,
    p.features?.area || 0,
    p.features?.coveredArea || 0,
    p.description || '',
    JSON.stringify(p.amenities || []),
    safeCoverImage,
    JSON.stringify((p.images || []).filter(img => !img.startsWith('blob:'))),
    p.featured ? 1 : 0,
    p.status || 'disponible'
  );

  const row = db.prepare('SELECT * FROM properties WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json(rowToProperty(row));
});

router.put('/:id', authMiddleware, (req, res) => {
  const db = getDB();
  const existing = db.prepare('SELECT * FROM properties WHERE id = ?').get(req.params.id);
  if (!existing) {
    return res.status(404).json({ error: 'Propiedad no encontrada' });
  }

  const p = req.body;

  let newCoverImage;
  if (p.coverImage !== undefined) {
    newCoverImage = (p.coverImage && !p.coverImage.startsWith('blob:')) ? p.coverImage : null;
  } else {
    newCoverImage = existing.cover_image;
  }

  db.prepare(`
    UPDATE properties SET title=?, type=?, operation=?, price=?, currency=?, show_price=?,
      neighborhood=?, city=?, address=?, bedrooms=?, bathrooms=?, garage=?, area=?, covered_area=?,
      description=?, amenities=?, cover_image=?, images=?, featured=?, status=?
    WHERE id=?
  `).run(
    p.title ?? existing.title,
    p.type ?? existing.type,
    p.operation ?? existing.operation,
    p.price ?? existing.price,
    p.currency ?? existing.currency,
    p.showPrice !== undefined ? (p.showPrice ? 1 : 0) : existing.show_price,
    p.location?.neighborhood ?? existing.neighborhood,
    p.location?.city ?? existing.city,
    p.location?.address ?? existing.address,
    p.features?.bedrooms ?? existing.bedrooms,
    p.features?.bathrooms ?? existing.bathrooms,
    p.features?.garage ?? existing.garage,
    p.features?.area ?? existing.area,
    p.features?.coveredArea ?? existing.covered_area,
    p.description ?? existing.description,
    p.amenities ? JSON.stringify(p.amenities) : existing.amenities,
    newCoverImage,
    p.images ? JSON.stringify(p.images) : existing.images,
    p.featured !== undefined ? (p.featured ? 1 : 0) : existing.featured,
    p.status ?? existing.status,
    req.params.id
  );

  const row = db.prepare('SELECT * FROM properties WHERE id = ?').get(req.params.id);
  res.json(rowToProperty(row));
});

router.delete('/:id', authMiddleware, (req, res) => {
  const db = getDB();
  const existing = db.prepare('SELECT * FROM properties WHERE id = ?').get(req.params.id);
  if (!existing) {
    return res.status(404).json({ error: 'Propiedad no encontrada' });
  }

  db.prepare('DELETE FROM properties WHERE id = ?').run(req.params.id);

  const uploadDir = path.join(__dirname, '..', '..', 'uploads', 'properties', String(req.params.id));
  if (fs.existsSync(uploadDir)) {
    fs.rmSync(uploadDir, { recursive: true, force: true });
  }

  res.json({ success: true });
});

router.post('/:id/images', authMiddleware, upload.array('images', 20), (req, res) => {
  const db = getDB();
  const existing = db.prepare('SELECT * FROM properties WHERE id = ?').get(req.params.id);
  if (!existing) {
    return res.status(404).json({ error: 'Propiedad no encontrada' });
  }

  const currentImages = JSON.parse(existing.images || '[]');
  const newPaths = req.files.map(f => `/uploads/properties/${req.params.id}/${f.filename}`);
  const allImages = [...currentImages, ...newPaths];

  const existingCover = existing.cover_image && !existing.cover_image.startsWith('blob:') ? existing.cover_image : null;
  const coverImage = existingCover || newPaths[0] || null;

  db.prepare('UPDATE properties SET images = ?, cover_image = ? WHERE id = ?').run(
    JSON.stringify(allImages),
    coverImage,
    req.params.id
  );

  const row = db.prepare('SELECT * FROM properties WHERE id = ?').get(req.params.id);
  res.json(rowToProperty(row));
});

router.delete('/:id/images/:filename', authMiddleware, (req, res) => {
  const db = getDB();
  const existing = db.prepare('SELECT * FROM properties WHERE id = ?').get(req.params.id);
  if (!existing) {
    return res.status(404).json({ error: 'Propiedad no encontrada' });
  }

  const imagePath = `/uploads/properties/${req.params.id}/${req.params.filename}`;
  const currentImages = JSON.parse(existing.images || '[]');
  const filtered = currentImages.filter(img => img !== imagePath);

  let coverImage = existing.cover_image;
  if (coverImage === imagePath) {
    coverImage = filtered[0] || null;
  }

  db.prepare('UPDATE properties SET images = ?, cover_image = ? WHERE id = ?').run(
    JSON.stringify(filtered),
    coverImage,
    req.params.id
  );

  const filePath = path.join(__dirname, '..', '..', 'uploads', 'properties', req.params.id, req.params.filename);
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }

  const row = db.prepare('SELECT * FROM properties WHERE id = ?').get(req.params.id);
  res.json(rowToProperty(row));
});

module.exports = router;
