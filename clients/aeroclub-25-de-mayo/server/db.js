const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const { periodoActual } = require('./util');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new Database(process.env.DB_PATH || path.join(DATA_DIR, 'aeroclub.sqlite'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
db.pragma('busy_timeout = 5000');

// Bitácoras: la base rechaza editarlas o borrarlas. El libro de movimientos y los cupones
// sí se pueden corregir (tesorería o código); cada cambio queda en `auditoria`.
const INMUTABLES = ['tarifas', 'cupon_envios', 'vuelos_historial', 'auditoria'];

// Triggers de versiones anteriores que ya no aplican (bases creadas antes del cambio).
const TRIGGERS_VIEJOS = ['movimientos_no_update', 'movimientos_no_delete', 'cupones_no_update', 'cupones_no_delete', 'cierres_sellados'];

const SCHEMA = `
CREATE TABLE IF NOT EXISTS usuarios (
  id INTEGER PRIMARY KEY,
  nombre TEXT NOT NULL,
  apellido TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  telefono TEXT,
  dni TEXT,
  licencia TEXT,
  rol TEXT NOT NULL DEFAULT 'piloto' CHECK (rol IN ('admin','piloto')),
  es_instructor INTEGER NOT NULL DEFAULT 0 CHECK (es_instructor IN (0,1)),
  activo INTEGER NOT NULL DEFAULT 1 CHECK (activo IN (0,1)),
  password_hash TEXT NOT NULL,
  debe_cambiar_password INTEGER NOT NULL DEFAULT 1,
  token_version INTEGER NOT NULL DEFAULT 0,
  creado_en TEXT NOT NULL DEFAULT (datetime('now')),
  ultimo_acceso TEXT
);

CREATE TABLE IF NOT EXISTS aviones (
  id INTEGER PRIMARY KEY,
  matricula TEXT NOT NULL UNIQUE COLLATE NOCASE,
  modelo TEXT NOT NULL,
  activo INTEGER NOT NULL DEFAULT 1 CHECK (activo IN (0,1)),
  orden INTEGER NOT NULL DEFAULT 0,
  creado_en TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS tarifas (
  id INTEGER PRIMARY KEY,
  avion_id INTEGER NOT NULL REFERENCES aviones(id),
  tipo TEXT NOT NULL CHECK (tipo IN ('solo','instruccion')),
  precio_hora INTEGER NOT NULL CHECK (precio_hora > 0),
  vigente_desde TEXT NOT NULL,
  creado_por INTEGER REFERENCES usuarios(id),
  creado_en TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_tarifas_avion ON tarifas(avion_id, tipo, vigente_desde);

CREATE TABLE IF NOT EXISTS cierres (
  id INTEGER PRIMARY KEY,
  periodo TEXT NOT NULL UNIQUE,
  desde_movimiento_id INTEGER NOT NULL,
  hasta_movimiento_id INTEGER,
  cantidad_vuelos INTEGER NOT NULL DEFAULT 0,
  total_decimas INTEGER NOT NULL DEFAULT 0,
  total_vuelos INTEGER NOT NULL DEFAULT 0,
  cantidad_cupones INTEGER NOT NULL DEFAULT 0,
  total_cupones INTEGER NOT NULL DEFAULT 0,
  automatico INTEGER NOT NULL DEFAULT 0,
  cerrado_por INTEGER REFERENCES usuarios(id),
  creado_en TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS vuelos (
  id INTEGER PRIMARY KEY,
  piloto_id INTEGER NOT NULL REFERENCES usuarios(id),
  avion_id INTEGER NOT NULL REFERENCES aviones(id),
  instructor_id INTEGER REFERENCES usuarios(id),
  fecha TEXT NOT NULL,
  decimas INTEGER NOT NULL CHECK (decimas > 0),
  -- Opcionales, reservados para sumar el tacómetro más adelante (hoy no se usan).
  tac_inicial INTEGER,
  tac_final INTEGER,
  tipo TEXT NOT NULL CHECK (tipo IN ('solo','instruccion')),
  tarifa_id INTEGER NOT NULL REFERENCES tarifas(id),
  precio_hora INTEGER NOT NULL,
  importe INTEGER NOT NULL,
  notas TEXT,
  estado TEXT NOT NULL DEFAULT 'abierto' CHECK (estado IN ('abierto','cerrado','anulado')),
  motivo_anulacion TEXT,
  cierre_id INTEGER REFERENCES cierres(id),
  cargado_por INTEGER NOT NULL REFERENCES usuarios(id),
  creado_en TEXT NOT NULL DEFAULT (datetime('now')),
  actualizado_en TEXT,
  CHECK ((tipo = 'instruccion') = (instructor_id IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS idx_vuelos_piloto ON vuelos(piloto_id, fecha);
CREATE INDEX IF NOT EXISTS idx_vuelos_avion ON vuelos(avion_id, fecha);
CREATE INDEX IF NOT EXISTS idx_vuelos_estado ON vuelos(estado, fecha);

CREATE TABLE IF NOT EXISTS vuelos_historial (
  id INTEGER PRIMARY KEY,
  vuelo_id INTEGER NOT NULL REFERENCES vuelos(id),
  accion TEXT NOT NULL CHECK (accion IN ('alta','edicion','anulacion','cierre','retarifa')),
  antes TEXT,
  despues TEXT,
  usuario_id INTEGER REFERENCES usuarios(id),
  creado_en TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_vh_vuelo ON vuelos_historial(vuelo_id);

CREATE TABLE IF NOT EXISTS movimientos (
  id INTEGER PRIMARY KEY,
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id),
  tipo TEXT NOT NULL CHECK (tipo IN ('vuelo','pago','ajuste','saldo_inicial','anulacion')),
  concepto TEXT NOT NULL,
  importe INTEGER NOT NULL CHECK (importe <> 0),
  fecha TEXT NOT NULL,
  vuelo_id INTEGER UNIQUE REFERENCES vuelos(id),
  cierre_id INTEGER REFERENCES cierres(id),
  anula_id INTEGER UNIQUE REFERENCES movimientos(id),
  medio TEXT,
  creado_por INTEGER REFERENCES usuarios(id),
  creado_en TEXT NOT NULL,
  hash_anterior TEXT NOT NULL,
  hash TEXT NOT NULL UNIQUE
);
CREATE INDEX IF NOT EXISTS idx_mov_usuario ON movimientos(usuario_id, id);

CREATE TABLE IF NOT EXISTS cupones (
  id INTEGER PRIMARY KEY,
  cierre_id INTEGER NOT NULL REFERENCES cierres(id),
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id),
  numero TEXT NOT NULL UNIQUE,
  saldo_anterior INTEGER NOT NULL,
  total_vuelos INTEGER NOT NULL,
  total_pagos INTEGER NOT NULL,
  total_ajustes INTEGER NOT NULL,
  total INTEGER NOT NULL,
  decimas INTEGER NOT NULL,
  vencimiento TEXT NOT NULL,
  token TEXT NOT NULL UNIQUE,
  sello TEXT NOT NULL,
  creado_en TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (cierre_id, usuario_id)
);

CREATE TABLE IF NOT EXISTS cupon_envios (
  id INTEGER PRIMARY KEY,
  cupon_id INTEGER NOT NULL REFERENCES cupones(id),
  canal TEXT NOT NULL CHECK (canal IN ('whatsapp','descarga')),
  usuario_id INTEGER REFERENCES usuarios(id),
  creado_en TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS config (
  clave TEXT PRIMARY KEY,
  valor TEXT
);

CREATE TABLE IF NOT EXISTS auditoria (
  id INTEGER PRIMARY KEY,
  usuario_id INTEGER REFERENCES usuarios(id),
  accion TEXT NOT NULL,
  detalle TEXT,
  creado_en TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Vuelos: nunca se borran. Se editan sólo mientras están abiertos (antes del cierre del mes).
CREATE TRIGGER IF NOT EXISTS vuelos_no_delete BEFORE DELETE ON vuelos
BEGIN SELECT RAISE(ABORT, 'Los vuelos no se borran: se anulan'); END;
CREATE TRIGGER IF NOT EXISTS vuelos_cerrados_inmutables BEFORE UPDATE ON vuelos
WHEN OLD.estado <> 'abierto'
BEGIN SELECT RAISE(ABORT, 'El vuelo ya está cerrado o anulado y no se puede modificar'); END;

-- Cierres: no se borran (sus totales se recalculan si tesorería corrige movimientos).
CREATE TRIGGER IF NOT EXISTS cierres_no_delete BEFORE DELETE ON cierres
BEGIN SELECT RAISE(ABORT, 'Los cierres no se borran'); END;
`;

function triggersInmutables() {
  return INMUTABLES.map(t => `
CREATE TRIGGER IF NOT EXISTS ${t}_no_update BEFORE UPDATE ON ${t}
BEGIN SELECT RAISE(ABORT, 'Registro inmutable: ${t} no admite modificaciones'); END;
CREATE TRIGGER IF NOT EXISTS ${t}_no_delete BEFORE DELETE ON ${t}
BEGIN SELECT RAISE(ABORT, 'Registro inmutable: ${t} no admite borrados'); END;`).join('\n');
}

const CONFIG_DEFAULT = {
  club_nombre: 'Aeroclub 25 de Mayo',
  club_localidad: '25 de Mayo, Provincia de Buenos Aires',
  pago_alias: '',
  pago_cbu: '',
  pago_titular: 'Aeroclub 25 de Mayo',
  pago_cuit: '',
  pago_banco: '',
  pago_instrucciones: 'Enviá el comprobante al tesorero indicando tu nombre y el número de cupón.',
  cierre_automatico: '1',
  cierre_dia: '5',
  cierre_hora: '9',
  vencimiento_dia: '10',
  whatsapp_mensaje: 'Hola {nombre}. Te enviamos el resumen de {periodo} del {club}: volaste {horas} y el total a pagar es {total}. Podés pagar por transferencia al alias {alias}. Descargá tu cupón acá: {link}',
  url_publica: ''
};

function initDB() {
  for (const t of TRIGGERS_VIEJOS) db.exec(`DROP TRIGGER IF EXISTS ${t}`);
  db.exec(SCHEMA + triggersInmutables());

  const setDefault = db.prepare('INSERT OR IGNORE INTO config (clave, valor) VALUES (?, ?)');
  for (const [k, v] of Object.entries(CONFIG_DEFAULT)) setDefault.run(k, v);
  // Primer período que maneja el sistema: el cierre automático nunca intenta cerrar meses anteriores.
  setDefault.run('periodo_inicio', periodoActual());

  // Flota inicial del aeroclub.
  if (db.prepare('SELECT COUNT(*) n FROM aviones').get().n === 0) {
    const ins = db.prepare('INSERT INTO aviones (matricula, modelo, orden) VALUES (?, ?, ?)');
    ins.run('LV-APH', 'Cessna 152', 1);
    ins.run('LV-XUG', 'Piper PA-11', 2);
  }

  // Primer administrador. Si no viene por variables de entorno, se genera una contraseña temporal.
  if (db.prepare('SELECT COUNT(*) n FROM usuarios').get().n === 0) {
    const email = process.env.ADMIN_EMAIL || 'tesoreria@aeroclub25demayo.com.ar';
    const pass = process.env.ADMIN_PASSWORD || crypto.randomBytes(6).toString('base64url');
    db.prepare(`INSERT INTO usuarios (nombre, apellido, email, rol, password_hash, debe_cambiar_password)
                VALUES ('Tesorería', 'Aeroclub', ?, 'admin', ?, 1)`).run(email, bcrypt.hashSync(pass, 10));
    console.log('──────────────────────────────────────────────');
    console.log(' Administrador inicial creado');
    console.log(` Usuario:    ${email}`);
    if (!process.env.ADMIN_PASSWORD) console.log(` Contraseña: ${pass}  (temporal, se pide cambiarla al entrar)`);
    console.log('──────────────────────────────────────────────');
  }
}

function getConfig() {
  const out = {};
  for (const r of db.prepare('SELECT clave, valor FROM config').all()) out[r.clave] = r.valor;
  return out;
}

function auditar(usuarioId, accion, detalle) {
  db.prepare('INSERT INTO auditoria (usuario_id, accion, detalle) VALUES (?, ?, ?)')
    .run(usuarioId ?? null, accion, detalle == null ? null : (typeof detalle === 'string' ? detalle : JSON.stringify(detalle)));
}

// Se inicializa al cargar el módulo: los servicios preparan sus consultas apenas se importan.
initDB();

module.exports = { db, getConfig, auditar, DATA_DIR };
