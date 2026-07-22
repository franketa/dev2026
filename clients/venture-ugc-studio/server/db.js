const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcrypt');

const DB_PATH = path.join(__dirname, '..', 'data', 'db.sqlite');
const UPLOADS_DIR = path.join(__dirname, '..', 'uploads', 'material');

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
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
  if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

  const db = getDB();

  db.exec(`
    CREATE TABLE IF NOT EXISTS clientes (
      codigo TEXT PRIMARY KEY,
      nombre TEXT NOT NULL,
      rubro TEXT DEFAULT '',
      entrega TEXT DEFAULT '',
      estado TEXT DEFAULT 'En producción',
      nota TEXT DEFAULT '',
      tema TEXT DEFAULT '',
      activo INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS material (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      codigo TEXT NOT NULL REFERENCES clientes(codigo) ON DELETE CASCADE,
      filename TEXT NOT NULL,
      original TEXT NOT NULL,
      etiqueta TEXT DEFAULT '',
      mime TEXT DEFAULT '',
      size INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS admin_users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL
    );
  `);

  // Seed admin
  const adminCount = db.prepare('SELECT COUNT(*) AS count FROM admin_users').get();
  if (adminCount.count === 0) {
    const email = process.env.ADMIN_EMAIL || 'admin@ventureugc.studio';
    const password = process.env.ADMIN_PASSWORD || 'venture2026';
    const hash = bcrypt.hashSync(password, 10);
    db.prepare('INSERT INTO admin_users (email, password_hash) VALUES (?, ?)').run(email, hash);
    console.log(`Seed: usuario admin ${email} creado (cambiar la contraseña desde el panel)`);
  }

  // Seed cliente demo (las piezas de diseño viven en assets/js/portal-data.js)
  const demo = db.prepare('SELECT codigo FROM clientes WHERE codigo = ?').get('TILIFE-DEMO');
  if (!demo) {
    db.prepare(`INSERT INTO clientes (codigo, nombre, rubro, entrega, estado, nota, tema) VALUES (?, ?, ?, ?, ?, ?, ?)`)
      .run(
        'TILIFE-DEMO',
        'TILIFE',
        'Distribuidora de suplementos deportivos',
        'Agosto 2026',
        'Lista para publicar',
        'Lote completo: 7 posts, 4 historias y 2 reels. El calendario de abajo indica el día y la hora ideal de cada publicación. Cualquier ajuste, nos escribís y lo giramos en el día.',
        'tema-tilife'
      );
    console.log('Seed: cliente TILIFE-DEMO creado');
  }
}

module.exports = { getDB, initDB, UPLOADS_DIR };
