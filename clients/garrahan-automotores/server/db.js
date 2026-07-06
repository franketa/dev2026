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
  // Ensure data directory exists
  const dataDir = path.dirname(DB_PATH);
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  // Ensure uploads directory exists
  const uploadsDir = path.join(__dirname, '..', 'uploads', 'vehicles');
  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
  }

  const db = getDB();

  db.exec(`
    CREATE TABLE IF NOT EXISTS vehicles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      marca TEXT NOT NULL,
      modelo TEXT NOT NULL,
      version TEXT DEFAULT '',
      anio INTEGER NOT NULL,
      km INTEGER DEFAULT 0,
      condicion TEXT NOT NULL DEFAULT 'usado',
      tipo TEXT DEFAULT 'Sedán',
      combustible TEXT DEFAULT 'Nafta',
      transmision TEXT DEFAULT 'Manual',
      motor TEXT DEFAULT '',
      puertas INTEGER DEFAULT 5,
      color TEXT DEFAULT '',
      traccion TEXT DEFAULT '4x2',
      precio INTEGER DEFAULT 0,
      moneda TEXT DEFAULT 'ARS',
      mostrar_precio INTEGER DEFAULT 1,
      financiacion INTEGER DEFAULT 1,
      permuta INTEGER DEFAULT 1,
      equipamiento TEXT DEFAULT '[]',
      descripcion TEXT DEFAULT '',
      destacado INTEGER DEFAULT 0,
      estado TEXT DEFAULT 'disponible',
      cover_image TEXT,
      images TEXT DEFAULT '[]',
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS admin_users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL
    );
  `);

  // Seed default admin if none exists
  const adminCount = db.prepare('SELECT COUNT(*) as count FROM admin_users').get();
  if (adminCount.count === 0) {
    const hash = bcrypt.hashSync(process.env.ADMIN_PASSWORD || 'garrahan2026', 10);
    const email = process.env.ADMIN_EMAIL || 'admin@garrahan.com';
    db.prepare('INSERT INTO admin_users (email, password_hash) VALUES (?, ?)').run(email, hash);
    console.log(`Default admin user created: ${email}`);
  }

  // Seed sample vehicles if table is empty
  const count = db.prepare('SELECT COUNT(*) as count FROM vehicles').get();
  if (count.count === 0) {
    seedVehicles(db);
  }
}

function seedVehicles(db) {
  const jsonPath = path.join(__dirname, '..', 'data', 'vehicles.json');
  if (!fs.existsSync(jsonPath)) {
    console.log('No vehicles.json found, skipping seed');
    return;
  }

  const data = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
  const insert = db.prepare(`
    INSERT INTO vehicles (marca, modelo, version, anio, km, condicion, tipo, combustible, transmision,
      motor, puertas, color, traccion, precio, moneda, mostrar_precio, financiacion, permuta,
      equipamiento, descripcion, destacado, estado, cover_image, images)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const insertMany = db.transaction((vehicles) => {
    for (const v of vehicles) {
      insert.run(
        v.marca,
        v.modelo,
        v.version || '',
        v.anio,
        v.km || 0,
        v.condicion || 'usado',
        v.tipo || 'Sedán',
        v.combustible || 'Nafta',
        v.transmision || 'Manual',
        v.motor || '',
        v.puertas || 5,
        v.color || '',
        v.traccion || '4x2',
        v.precio || 0,
        v.moneda || 'ARS',
        v.mostrarPrecio !== false ? 1 : 0,
        v.financiacion !== false ? 1 : 0,
        v.permuta !== false ? 1 : 0,
        JSON.stringify(v.equipamiento || []),
        v.descripcion || '',
        v.destacado ? 1 : 0,
        v.estado || 'disponible',
        v.coverImage || null,
        JSON.stringify(v.images || [])
      );
    }
  });

  insertMany(data.vehicles);
  console.log(`Seeded ${data.vehicles.length} vehicles from vehicles.json`);
}

// Transform a DB row to the frontend JSON format
function rowToVehicle(row) {
  return {
    id: row.id,
    marca: row.marca,
    modelo: row.modelo,
    version: row.version,
    anio: row.anio,
    km: row.km,
    condicion: row.condicion,
    tipo: row.tipo,
    combustible: row.combustible,
    transmision: row.transmision,
    motor: row.motor,
    puertas: row.puertas,
    color: row.color,
    traccion: row.traccion,
    precio: row.precio,
    moneda: row.moneda,
    mostrarPrecio: row.mostrar_precio === 1,
    financiacion: row.financiacion === 1,
    permuta: row.permuta === 1,
    equipamiento: JSON.parse(row.equipamiento || '[]'),
    descripcion: row.descripcion,
    destacado: row.destacado === 1,
    estado: row.estado,
    coverImage: row.cover_image,
    images: JSON.parse(row.images || '[]'),
    createdAt: row.created_at
  };
}

module.exports = { getDB, initDB, rowToVehicle };
