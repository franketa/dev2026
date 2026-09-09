const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');

const DB_PATH = path.join(__dirname, '..', 'data', 'db.sqlite');
let db;

function getDB() {
  if (!db) {
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
  }
  return db;
}

function slugify(str) {
  return String(str || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'producto';
}

// Devuelve un slug único (agrega -2, -3... si ya existe)
function uniqueSlug(db, base, excludeId) {
  const root = slugify(base);
  let slug = root;
  let i = 2;
  const q = db.prepare('SELECT id FROM products WHERE slug = ? AND id != ?');
  while (q.get(slug, excludeId || 0)) slug = `${root}-${i++}`;
  return slug;
}

function initDB() {
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  fs.mkdirSync(path.join(__dirname, '..', 'uploads', 'products'), { recursive: true });

  const db = getDB();
  db.exec(`
    CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      slug TEXT UNIQUE NOT NULL,
      nombre TEXT NOT NULL,
      categoria TEXT NOT NULL,
      linea TEXT DEFAULT '',
      codigo TEXT DEFAULT '',
      resumen TEXT DEFAULT '',
      descripcion TEXT DEFAULT '',
      medidas TEXT DEFAULT '',
      terminacion TEXT DEFAULT '',
      unidad TEXT DEFAULT 'unidad',
      precio REAL DEFAULT 0,
      moneda TEXT DEFAULT 'ARS',
      mostrar_precio INTEGER DEFAULT 0,
      specs TEXT DEFAULT '[]',
      tags TEXT DEFAULT '[]',
      destacado INTEGER DEFAULT 0,
      activo INTEGER DEFAULT 1,
      stock TEXT DEFAULT 'disponible',
      orden INTEGER DEFAULT 0,
      cover_image TEXT,
      images TEXT DEFAULT '[]',
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_products_categoria ON products (categoria);
    CREATE INDEX IF NOT EXISTS idx_products_activo ON products (activo);

    CREATE TABLE IF NOT EXISTS admin_users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL
    );
  `);

  if (db.prepare('SELECT COUNT(*) AS c FROM admin_users').get().c === 0) {
    const email = (process.env.ADMIN_EMAIL || 'admin@aluminiosruta5.com').toLowerCase();
    const hash = bcrypt.hashSync(process.env.ADMIN_PASSWORD || 'ruta52026', 10);
    db.prepare('INSERT INTO admin_users (email, password_hash) VALUES (?, ?)').run(email, hash);
    console.log(`Usuario admin inicial creado: ${email}`);
  }

  if (db.prepare('SELECT COUNT(*) AS c FROM products').get().c === 0) {
    seedProducts(db);
  }
}

const INSERT_SQL = `
  INSERT INTO products (slug, nombre, categoria, linea, codigo, resumen, descripcion, medidas, terminacion,
    unidad, precio, moneda, mostrar_precio, specs, tags, destacado, activo, stock, orden, cover_image, images)
  VALUES (@slug, @nombre, @categoria, @linea, @codigo, @resumen, @descripcion, @medidas, @terminacion,
    @unidad, @precio, @moneda, @mostrar_precio, @specs, @tags, @destacado, @activo, @stock, @orden, @cover_image, @images)
`;

function toRow(db, p, excludeId) {
  return {
    slug: uniqueSlug(db, p.slug || p.nombre, excludeId),
    nombre: String(p.nombre || '').trim(),
    categoria: String(p.categoria || 'Perfiles').trim(),
    linea: p.linea || '',
    codigo: p.codigo || '',
    resumen: p.resumen || '',
    descripcion: p.descripcion || '',
    medidas: p.medidas || '',
    terminacion: p.terminacion || '',
    unidad: p.unidad || 'unidad',
    precio: Number(p.precio) || 0,
    moneda: p.moneda || 'ARS',
    mostrar_precio: p.mostrarPrecio ? 1 : 0,
    specs: JSON.stringify(Array.isArray(p.specs) ? p.specs.filter(s => s && s.k) : []),
    tags: JSON.stringify(Array.isArray(p.tags) ? p.tags.filter(Boolean) : []),
    destacado: p.destacado ? 1 : 0,
    activo: p.activo === false ? 0 : 1,
    stock: ['disponible', 'a-pedido', 'sin-stock'].includes(p.stock) ? p.stock : 'disponible',
    orden: Number(p.orden) || 0,
    cover_image: p.coverImage || null,
    images: JSON.stringify(Array.isArray(p.images) ? p.images : [])
  };
}

function seedProducts(db) {
  const jsonPath = path.join(__dirname, '..', 'data', 'products.json');
  if (!fs.existsSync(jsonPath)) return;
  const data = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
  const insert = db.prepare(INSERT_SQL);
  db.transaction(list => list.forEach(p => insert.run(toRow(db, p))))(data.products);
  console.log(`Seed: ${data.products.length} productos cargados desde products.json`);
}

function rowToProduct(row) {
  return {
    id: row.id,
    slug: row.slug,
    nombre: row.nombre,
    categoria: row.categoria,
    linea: row.linea,
    codigo: row.codigo,
    resumen: row.resumen,
    descripcion: row.descripcion,
    medidas: row.medidas,
    terminacion: row.terminacion,
    unidad: row.unidad,
    precio: row.precio,
    moneda: row.moneda,
    mostrarPrecio: row.mostrar_precio === 1,
    specs: JSON.parse(row.specs || '[]'),
    tags: JSON.parse(row.tags || '[]'),
    destacado: row.destacado === 1,
    activo: row.activo === 1,
    stock: row.stock,
    orden: row.orden,
    coverImage: row.cover_image,
    images: JSON.parse(row.images || '[]'),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

module.exports = { getDB, initDB, rowToProduct, toRow, INSERT_SQL, slugify, uniqueSlug };
