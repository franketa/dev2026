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

const DDL_USUARIOS = `
CREATE TABLE IF NOT EXISTS usuarios (
  id INTEGER PRIMARY KEY,
  nombre TEXT NOT NULL,
  apellido TEXT NOT NULL DEFAULT '',
  -- Los externos (dueños de aeronaves de afuera) no entran al sistema: sin email ni contraseña.
  email TEXT UNIQUE COLLATE NOCASE,
  telefono TEXT,
  dni TEXT,
  licencia TEXT,
  rol TEXT NOT NULL DEFAULT 'piloto' CHECK (rol IN ('admin','consulta','rampa','piloto','externo')),
  es_instructor INTEGER NOT NULL DEFAULT 0 CHECK (es_instructor IN (0,1)),
  activo INTEGER NOT NULL DEFAULT 1 CHECK (activo IN (0,1)),
  baja_motivo TEXT,
  -- Bloqueado por falta de pago: entra a ver su cuenta e informar pagos, pero no carga vuelos.
  bloqueado INTEGER NOT NULL DEFAULT 0 CHECK (bloqueado IN (0,1)),
  bloqueo_motivo TEXT,
  password_hash TEXT,
  debe_cambiar_password INTEGER NOT NULL DEFAULT 1,
  token_version INTEGER NOT NULL DEFAULT 0,
  creado_en TEXT NOT NULL DEFAULT (datetime('now')),
  ultimo_acceso TEXT,
  CHECK (rol = 'externo' OR (email IS NOT NULL AND password_hash IS NOT NULL))
);`;

const DDL_MOVIMIENTOS = `
CREATE TABLE IF NOT EXISTS movimientos (
  id INTEGER PRIMARY KEY,
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id),
  tipo TEXT NOT NULL CHECK (tipo IN ('vuelo','servicio','pago','ajuste','saldo_inicial','anulacion')),
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
);`;

const DDL_SERVICIOS = `
CREATE TABLE IF NOT EXISTS servicios (
  id INTEGER PRIMARY KEY,
  codigo TEXT UNIQUE,
  nombre TEXT NOT NULL UNIQUE COLLATE NOCASE,
  unidad TEXT NOT NULL CHECK (unidad IN ('unidad','hora','litro','noche','dia','mes')),
  precio INTEGER NOT NULL DEFAULT 0 CHECK (precio >= 0),
  activo INTEGER NOT NULL DEFAULT 1 CHECK (activo IN (0,1)),
  orden INTEGER NOT NULL DEFAULT 0,
  creado_en TEXT NOT NULL DEFAULT (datetime('now'))
);`;

const SCHEMA = `
${DDL_USUARIOS}

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
  total_servicios INTEGER NOT NULL DEFAULT 0,
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

${DDL_MOVIMIENTOS}
CREATE INDEX IF NOT EXISTS idx_mov_usuario ON movimientos(usuario_id, id);

CREATE TABLE IF NOT EXISTS cupones (
  id INTEGER PRIMARY KEY,
  cierre_id INTEGER NOT NULL REFERENCES cierres(id),
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id),
  numero TEXT NOT NULL UNIQUE,
  saldo_anterior INTEGER NOT NULL,
  total_vuelos INTEGER NOT NULL,
  total_servicios INTEGER NOT NULL DEFAULT 0,
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

-- Servicios que se cobran aparte de las horas de vuelo (hangaraje, combustible, etc.).
-- El precio es por unidad; cada ticket congela el precio del día.
${DDL_SERVICIOS}

-- Aeronaves que no son de la flota del club (de socios o de externos), para los tickets de rampa.
CREATE TABLE IF NOT EXISTS aeronaves (
  id INTEGER PRIMARY KEY,
  matricula TEXT NOT NULL UNIQUE COLLATE NOCASE,
  modelo TEXT,
  propietario_id INTEGER NOT NULL REFERENCES usuarios(id),
  notas TEXT,
  creado_por INTEGER REFERENCES usuarios(id),
  creado_en TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Ticket de servicios: se carga a la cuenta de quien corresponda y entra en su cupón del mes.
CREATE TABLE IF NOT EXISTS tickets (
  id INTEGER PRIMARY KEY,
  numero INTEGER NOT NULL UNIQUE,
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id),
  aeronave_id INTEGER REFERENCES aeronaves(id),
  matricula TEXT,
  piloto TEXT,                    -- piloto al mando (sobre todo en tránsitos)
  fecha TEXT NOT NULL,
  origen TEXT NOT NULL CHECK (origen IN ('rampa','tesoreria','cierre')),
  total INTEGER NOT NULL CHECK (total > 0),
  notas TEXT,
  movimiento_id INTEGER REFERENCES movimientos(id),
  pago_movimiento_id INTEGER REFERENCES movimientos(id) ON DELETE SET NULL,
  estado TEXT NOT NULL DEFAULT 'vigente' CHECK (estado IN ('vigente','anulado')),
  motivo_anulacion TEXT,
  token TEXT NOT NULL UNIQUE,
  creado_por INTEGER REFERENCES usuarios(id),
  creado_en TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_tickets_fecha ON tickets(fecha);
CREATE INDEX IF NOT EXISTS idx_tickets_usuario ON tickets(usuario_id);

CREATE TABLE IF NOT EXISTS ticket_items (
  id INTEGER PRIMARY KEY,
  ticket_id INTEGER NOT NULL REFERENCES tickets(id),
  servicio_id INTEGER REFERENCES servicios(id),
  concepto TEXT NOT NULL,
  unidad TEXT,
  cantidad INTEGER NOT NULL CHECK (cantidad > 0),   -- en centésimas: 40,5 litros → 4050
  precio INTEGER NOT NULL CHECK (precio >= 0),       -- centavos por unidad
  importe INTEGER NOT NULL,
  evento TEXT CHECK (evento IN ('total','anticipo')),  -- eventos: si se cobra el total o un anticipo
  detalle TEXT                                         -- eventos: descripción
);
CREATE INDEX IF NOT EXISTS idx_items_ticket ON ticket_items(ticket_id);

-- Derecho de aeronave: una sola vez por piloto y por mes volado.
CREATE TABLE IF NOT EXISTS derechos_aeronave (
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id),
  periodo TEXT NOT NULL,
  ticket_id INTEGER REFERENCES tickets(id),
  PRIMARY KEY (usuario_id, periodo)
);

-- Pagos que informa el socio desde la app; tesorería los confirma (y recién ahí entran al libro).
CREATE TABLE IF NOT EXISTS comprobantes (
  id INTEGER PRIMARY KEY,
  tipo TEXT NOT NULL,
  datos BLOB NOT NULL,
  creado_en TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS pagos_informados (
  id INTEGER PRIMARY KEY,
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id),
  importe INTEGER NOT NULL CHECK (importe > 0),
  fecha TEXT NOT NULL,
  medio TEXT NOT NULL,
  nota TEXT,
  comprobante_id INTEGER REFERENCES comprobantes(id),
  estado TEXT NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente','confirmado','rechazado')),
  movimiento_id INTEGER REFERENCES movimientos(id) ON DELETE SET NULL,
  revisado_por INTEGER REFERENCES usuarios(id),
  revisado_en TEXT,
  motivo_rechazo TEXT,
  creado_en TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_pinf_estado ON pagos_informados(estado, id);
CREATE INDEX IF NOT EXISTS idx_pinf_usuario ON pagos_informados(usuario_id, id);

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
  url_publica: '',
  email_tesoreria: ''   // a dónde escriben los pilotos para cambiar sus datos (si queda vacío, el del primer admin)
};

function sqlTabla(tabla) {
  return db.prepare(`SELECT sql FROM sqlite_master WHERE type = 'table' AND name = ?`).get(tabla)?.sql || null;
}
function columnas(tabla) { return db.prepare(`PRAGMA table_info(${tabla})`).all().map(c => c.name); }

// SQLite no deja cambiar un CHECK ni un NOT NULL: se crea la tabla nueva, se copian los
// datos, se borra la vieja y se renombra la nueva (procedimiento recomendado por SQLite).
function reconstruir(tabla, ddl) {
  const temporal = `${tabla}__nueva`;
  db.pragma('foreign_keys = OFF');
  try {
    db.transaction(() => {
      db.exec(ddl.replace(`CREATE TABLE IF NOT EXISTS ${tabla} (`, `CREATE TABLE ${temporal} (`));
      const nuevas = columnas(temporal);
      const comunes = columnas(tabla).filter(c => nuevas.includes(c)).join(', ');
      db.exec(`INSERT INTO ${temporal} (${comunes}) SELECT ${comunes} FROM ${tabla}`);
      db.exec(`DROP TABLE ${tabla}`);
      db.exec(`ALTER TABLE ${temporal} RENAME TO ${tabla}`);
      const rotas = db.pragma('foreign_key_check');
      if (rotas.length) throw new Error(`La migración de ${tabla} dejó referencias rotas: ${JSON.stringify(rotas.slice(0, 3))}`);
    })();
  } finally {
    db.pragma('foreign_keys = ON');
  }
  console.log(`[db] tabla ${tabla} migrada`);
}

// Bases creadas con versiones anteriores del sistema.
function migrar() {
  const usuarios = sqlTabla('usuarios');
  if (usuarios && !usuarios.includes("'externo'")) reconstruir('usuarios', DDL_USUARIOS);
  const movimientos = sqlTabla('movimientos');
  if (movimientos && !movimientos.includes("'servicio'")) reconstruir('movimientos', DDL_MOVIMIENTOS);
  const tablaServicios = sqlTabla('servicios');
  if (tablaServicios && !tablaServicios.includes("'noche'")) {
    reconstruir('servicios', DDL_SERVICIOS);
    // El nocturno se cobra por noche (antes se había cargado por hora).
    db.prepare("UPDATE servicios SET unidad = 'noche' WHERE nombre = 'Nocturno' AND unidad = 'hora'").run();
  }
  if (usuarios && !columnas('usuarios').includes('bloqueado')) {
    db.exec('ALTER TABLE usuarios ADD COLUMN baja_motivo TEXT');
    db.exec('ALTER TABLE usuarios ADD COLUMN bloqueado INTEGER NOT NULL DEFAULT 0 CHECK (bloqueado IN (0,1))');
    db.exec('ALTER TABLE usuarios ADD COLUMN bloqueo_motivo TEXT');
  }
  if (sqlTabla('tickets') && !columnas('tickets').includes('piloto')) db.exec('ALTER TABLE tickets ADD COLUMN piloto TEXT');
  if (sqlTabla('ticket_items') && !columnas('ticket_items').includes('evento')) {
    db.exec(`ALTER TABLE ticket_items ADD COLUMN evento TEXT CHECK (evento IN ('total','anticipo'))`);
    db.exec('ALTER TABLE ticket_items ADD COLUMN detalle TEXT');
  }
  for (const tabla of ['cierres', 'cupones']) {
    if (sqlTabla(tabla) && !columnas(tabla).includes('total_servicios')) {
      db.exec(`ALTER TABLE ${tabla} ADD COLUMN total_servicios INTEGER NOT NULL DEFAULT 0`);
    }
  }
}

const SERVICIOS_INICIALES = [
  // [codigo, nombre, unidad]
  [null, 'Hangaraje mensual', 'mes'],
  [null, 'Hangaraje diario', 'dia'],
  [null, 'Combustible', 'litro'],
  [null, 'Nocturno', 'noche'],
  ['derecho_aeronave', 'Derecho de aeronave', 'mes'],
  [null, 'Derecho de examen', 'unidad'],
  [null, 'Hora de simulador', 'hora'],
  [null, 'Limpieza de avión', 'unidad']
];

function initDB() {
  for (const t of TRIGGERS_VIEJOS) db.exec(`DROP TRIGGER IF EXISTS ${t}`);
  migrar();
  db.exec(SCHEMA + triggersInmutables());

  // Tabla de servicios inicial, sin precio: tesorería los completa en Flota y tarifas.
  if (db.prepare('SELECT COUNT(*) n FROM servicios').get().n === 0) {
    const ins = db.prepare('INSERT INTO servicios (codigo, nombre, unidad, orden) VALUES (?, ?, ?, ?)');
    SERVICIOS_INICIALES.forEach(([codigo, nombre, unidad], i) => ins.run(codigo, nombre, unidad, i + 1));
  }
  // v1.002: el hangaraje se cobra mensual o diario (bases que tenían un solo "Hangaraje").
  const hangaraje = db.prepare(`SELECT * FROM servicios WHERE nombre = 'Hangaraje'`).get();
  if (hangaraje && !db.prepare(`SELECT 1 FROM servicios WHERE nombre = 'Hangaraje mensual'`).get()) {
    db.prepare(`UPDATE servicios SET nombre = 'Hangaraje mensual', unidad = 'mes' WHERE id = ?`).run(hangaraje.id);
  }
  if (!db.prepare(`SELECT 1 FROM servicios WHERE nombre = 'Hangaraje diario'`).get()) {
    const orden = db.prepare(`SELECT orden FROM servicios WHERE nombre = 'Hangaraje mensual'`).get()?.orden ?? 0;
    db.prepare(`INSERT INTO servicios (nombre, unidad, orden) VALUES ('Hangaraje diario', 'dia', ?)`).run(orden);
  }

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

// Cuenta única de tránsitos: aeronaves de paso sin dueño registrado. Sus tickets se cobran en el acto,
// así que el saldo siempre queda en cero; sirve para individualizar matrícula y piloto en el listado.
function cuentaTransitos() {
  const id = Number(db.prepare(`SELECT valor FROM config WHERE clave = 'cuenta_transitos'`).get()?.valor);
  if (id && db.prepare('SELECT 1 FROM usuarios WHERE id = ?').get(id)) return id;
  const r = db.prepare(`INSERT INTO usuarios (nombre, apellido, rol, password_hash, debe_cambiar_password) VALUES ('Tránsitos', '', 'externo', NULL, 0)`).run();
  db.prepare(`INSERT INTO config (clave, valor) VALUES ('cuenta_transitos', ?) ON CONFLICT(clave) DO UPDATE SET valor = excluded.valor`).run(String(r.lastInsertRowid));
  return Number(r.lastInsertRowid);
}

// Se inicializa al cargar el módulo: los servicios preparan sus consultas apenas se importan.
initDB();
cuentaTransitos();

module.exports = { db, getConfig, auditar, cuentaTransitos, DATA_DIR };
