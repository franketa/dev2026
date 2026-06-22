const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcrypt');

const DB_PATH = path.join(__dirname, '..', 'data', 'db.sqlite');
const DEFAULT_PASSWORD = process.env.ADMIN_PASSWORD || 'sinergia2026';

let db;

function getDB() {
  if (!db) {
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
  }
  return db;
}

function initDB() {
  const dataDir = path.dirname(DB_PATH);
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  const db = getDB();

  db.exec(`
    CREATE TABLE IF NOT EXISTS contacts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      specialty TEXT DEFAULT '',
      phone TEXT DEFAULT '',
      link TEXT DEFAULT '',
      message TEXT DEFAULT '',
      position INTEGER DEFAULT 0,
      active INTEGER DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT
    );
  `);

  // Seed the admin password (single, simple password login)
  const pass = db.prepare('SELECT value FROM settings WHERE key = ?').get('password_hash');
  if (!pass) {
    const hash = bcrypt.hashSync(DEFAULT_PASSWORD, 10);
    db.prepare('INSERT INTO settings (key, value) VALUES (?, ?)').run('password_hash', hash);
    console.log(`Admin password initialized: "${DEFAULT_PASSWORD}"`);
  }

  // Seed contacts from JSON if table is empty
  const count = db.prepare('SELECT COUNT(*) AS c FROM contacts').get();
  if (count.c === 0) {
    seedContacts(db);
  }
}

function seedContacts(db) {
  const jsonPath = path.join(__dirname, '..', 'data', 'contacts.json');
  if (!fs.existsSync(jsonPath)) {
    console.log('No contacts.json found, skipping seed');
    return;
  }
  const data = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
  const insert = db.prepare(
    `INSERT INTO contacts (name, specialty, phone, link, message, position, active)
     VALUES (?, ?, ?, ?, ?, ?, 1)`
  );
  const insertMany = db.transaction((contacts) => {
    contacts.forEach((c, i) => {
      insert.run(c.name, c.specialty || '', c.phone || '', c.link || '', c.message || '', i);
    });
  });
  insertMany(data.contacts);
  console.log(`Seeded ${data.contacts.length} contacts from contacts.json`);
}

// Build a wa.me number (Argentina-friendly) from a free-form phone string.
// Strips everything but digits; adds "549" prefix for local AR mobiles.
function waNumber(phone) {
  let d = (phone || '').replace(/\D/g, '');
  if (!d) return '';
  if (d.startsWith('00')) d = d.slice(2);
  if (d.startsWith('54')) return d;        // already international
  if (d.startsWith('0')) d = d.slice(1);   // drop trunk 0
  return '549' + d;                        // AR mobile
}

function rowToContact(row) {
  return {
    id: row.id,
    name: row.name,
    specialty: row.specialty,
    phone: row.phone,
    link: row.link,
    message: row.message,
    position: row.position,
    active: row.active === 1,
    whatsapp: waNumber(row.phone)
  };
}

module.exports = { getDB, initDB, rowToContact, waNumber };
