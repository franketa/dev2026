const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcrypt');

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

function initDB() {
  const dataDir = path.dirname(DB_PATH);
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  const uploadsDir = path.join(__dirname, '..', 'uploads', 'properties');
  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
  }

  const db = getDB();

  db.exec(`
    CREATE TABLE IF NOT EXISTS properties (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      type TEXT NOT NULL,
      operation TEXT NOT NULL,
      price INTEGER DEFAULT 0,
      currency TEXT DEFAULT 'USD',
      show_price INTEGER DEFAULT 1,
      neighborhood TEXT DEFAULT '',
      city TEXT DEFAULT 'Lobos',
      address TEXT DEFAULT '',
      bedrooms INTEGER DEFAULT 0,
      bathrooms INTEGER DEFAULT 0,
      garage INTEGER DEFAULT 0,
      area INTEGER DEFAULT 0,
      covered_area INTEGER DEFAULT 0,
      description TEXT DEFAULT '',
      amenities TEXT DEFAULT '[]',
      cover_image TEXT,
      images TEXT DEFAULT '[]',
      featured INTEGER DEFAULT 0,
      status TEXT DEFAULT 'disponible',
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS admin_users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL
    );
  `);

  // Ensure the default admin user `vairo` always exists with the seeded
  // password — runs idempotently on every boot so redeploys onto a
  // database with legacy admin rows still work.
  const existing = db.prepare("SELECT id FROM admin_users WHERE email = 'vairo'").get();
  const hash = bcrypt.hashSync('vairo', 10);
  if (!existing) {
    db.prepare('INSERT INTO admin_users (email, password_hash) VALUES (?, ?)').run('vairo', hash);
    console.log('Default admin user created: vairo / vairo');
  } else {
    db.prepare("UPDATE admin_users SET password_hash = ? WHERE email = 'vairo'").run(hash);
  }

  const propCount = db.prepare('SELECT COUNT(*) as count FROM properties').get();
  if (propCount.count === 0) {
    seedProperties(db);
  }
}

function seedProperties(db) {
  const jsonPath = path.join(__dirname, '..', 'data', 'properties.json');
  if (!fs.existsSync(jsonPath)) {
    console.log('No properties.json found, skipping seed');
    return;
  }

  const data = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
  const insert = db.prepare(`
    INSERT INTO properties (title, type, operation, price, currency, show_price, neighborhood, city, address,
      bedrooms, bathrooms, garage, area, covered_area, description, amenities, cover_image, images, featured, status, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const insertMany = db.transaction((properties) => {
    for (const p of properties) {
      insert.run(
        p.title,
        p.type,
        p.operation,
        p.price,
        p.currency || 'USD',
        p.showPrice !== false ? 1 : 0,
        p.location.neighborhood,
        p.location.city || 'Lobos',
        p.location.address || '',
        p.features.bedrooms || 0,
        p.features.bathrooms || 0,
        p.features.garage || 0,
        p.features.area || 0,
        p.features.coveredArea || 0,
        p.description || '',
        JSON.stringify(p.amenities || []),
        p.coverImage || null,
        JSON.stringify(p.images || []),
        p.featured ? 1 : 0,
        p.status || 'disponible',
        p.createdAt || new Date().toISOString().split('T')[0]
      );
    }
  });

  insertMany(data.properties);
  console.log(`Seeded ${data.properties.length} properties from properties.json`);
}

function rowToProperty(row) {
  return {
    id: row.id,
    title: row.title,
    type: row.type,
    operation: row.operation,
    price: row.price,
    currency: row.currency,
    showPrice: row.show_price === 1,
    location: {
      neighborhood: row.neighborhood,
      city: row.city,
      address: row.address
    },
    features: {
      bedrooms: row.bedrooms,
      bathrooms: row.bathrooms,
      garage: row.garage,
      area: row.area,
      coveredArea: row.covered_area
    },
    description: row.description,
    amenities: JSON.parse(row.amenities || '[]'),
    coverImage: row.cover_image,
    images: JSON.parse(row.images || '[]'),
    featured: row.featured === 1,
    status: row.status,
    createdAt: row.created_at
  };
}

module.exports = { getDB, initDB, rowToProperty };
