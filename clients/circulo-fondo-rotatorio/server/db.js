const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const { MATRIZ_INICIAL } = require('./permisos');
const { normalizarEmail } = require('./util');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new Database(process.env.DB_PATH || path.join(DATA_DIR, 'fondo.sqlite'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
db.pragma('busy_timeout = 5000');

// Tablas que la base no deja editar ni borrar: lo escrito queda como se escribió.
const INMUTABLES = ['movimientos', 'auditoria', 'parametros', 'solicitudes_historial', 'intentos_duplicado', 'retenciones'];
// Tablas que se modifican (cambian de estado) pero nunca se borran.
const SIN_BORRADO = ['gastos', 'asignaciones', 'pedidos_fondos', 'solicitudes', 'proveedores', 'rendiciones',
  'rendicion_versiones', 'certificados_retencion', 'usuarios', 'sedes', 'rubros', 'alicuotas', 'adjuntos'];

const SCHEMA = `
CREATE TABLE IF NOT EXISTS sedes (
  id INTEGER PRIMARY KEY,
  nombre TEXT NOT NULL UNIQUE COLLATE NOCASE,
  codigo TEXT NOT NULL UNIQUE COLLATE NOCASE,
  es_central INTEGER NOT NULL DEFAULT 0 CHECK (es_central IN (0,1)),
  descripcion TEXT,
  activa INTEGER NOT NULL DEFAULT 1 CHECK (activa IN (0,1)),
  orden INTEGER NOT NULL DEFAULT 0,
  creado_en TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_sede_central ON sedes(es_central) WHERE es_central = 1;

CREATE TABLE IF NOT EXISTS usuarios (
  id INTEGER PRIMARY KEY,
  nombre TEXT NOT NULL,
  apellido TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  telefono TEXT,
  rol TEXT NOT NULL CHECK (rol IN ('superadmin','central_admin','presidente','jefe_sede','administrativo','carga')),
  sede_id INTEGER REFERENCES sedes(id),
  activo INTEGER NOT NULL DEFAULT 1 CHECK (activo IN (0,1)),
  password_hash TEXT NOT NULL,
  debe_cambiar_password INTEGER NOT NULL DEFAULT 1,
  token_version INTEGER NOT NULL DEFAULT 0,
  creado_en TEXT NOT NULL DEFAULT (datetime('now')),
  ultimo_acceso TEXT,
  CHECK (rol = 'superadmin' OR sede_id IS NOT NULL)
);

CREATE TABLE IF NOT EXISTS roles_permisos (
  rol TEXT NOT NULL,
  permiso TEXT NOT NULL,
  PRIMARY KEY (rol, permiso)
);

CREATE TABLE IF NOT EXISTS config (
  clave TEXT PRIMARY KEY,
  valor TEXT
);

-- Topes y umbrales con fecha de vigencia (la inflación los mueve). Sólo se agregan filas.
CREATE TABLE IF NOT EXISTS parametros (
  id INTEGER PRIMARY KEY,
  clave TEXT NOT NULL CHECK (clave IN ('tope_transferencia','tope_efectivo','umbral_retencion','umbral_nd_pct')),
  valor INTEGER NOT NULL CHECK (valor >= 0),
  vigente_desde TEXT NOT NULL,
  nota TEXT,
  creado_por INTEGER REFERENCES usuarios(id),
  creado_en TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_parametros ON parametros(clave, vigente_desde);

-- Alícuotas de retención por impuesto y régimen. A VALIDAR CON EL CONTADOR: no hay valores reales cargados.
CREATE TABLE IF NOT EXISTS alicuotas (
  id INTEGER PRIMARY KEY,
  impuesto TEXT NOT NULL CHECK (impuesto IN ('iva','ganancias','suss','iibb')),
  regimen TEXT NOT NULL,
  jurisdiccion TEXT,
  alicuota INTEGER NOT NULL CHECK (alicuota >= 0 AND alicuota <= 100000),
  vigente_desde TEXT NOT NULL,
  activa INTEGER NOT NULL DEFAULT 1 CHECK (activa IN (0,1)),
  nota TEXT,
  creado_por INTEGER REFERENCES usuarios(id),
  creado_en TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS rubros (
  id INTEGER PRIMARY KEY,
  padre_id INTEGER REFERENCES rubros(id),
  nombre TEXT NOT NULL,
  es_fijo INTEGER NOT NULL DEFAULT 0 CHECK (es_fijo IN (0,1)),
  es_nd INTEGER NOT NULL DEFAULT 0 CHECK (es_nd IN (0,1)),
  activo INTEGER NOT NULL DEFAULT 1 CHECK (activo IN (0,1)),
  orden INTEGER NOT NULL DEFAULT 0,
  creado_en TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_rubro ON rubros(COALESCE(padre_id, 0), nombre COLLATE NOCASE);
CREATE UNIQUE INDEX IF NOT EXISTS uq_rubro_nd ON rubros(es_nd) WHERE es_nd = 1;

CREATE TABLE IF NOT EXISTS proveedores (
  id INTEGER PRIMARY KEY,
  cuit TEXT NOT NULL UNIQUE CHECK (length(cuit) = 11),
  razon_social TEXT NOT NULL,
  razon_norm TEXT NOT NULL,
  condicion_iva TEXT CHECK (condicion_iva IN ('ri','monotributo','exento','no_alcanzado')),
  domicilio TEXT,
  email TEXT,
  telefono TEXT,
  cbu TEXT,
  activo INTEGER NOT NULL DEFAULT 1 CHECK (activo IN (0,1)),
  creado_por INTEGER REFERENCES usuarios(id),
  creado_sede_id INTEGER REFERENCES sedes(id),
  creado_en TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_proveedores_razon ON proveedores(razon_norm);

CREATE TABLE IF NOT EXISTS asignaciones (
  id INTEGER PRIMARY KEY,
  sede_id INTEGER NOT NULL REFERENCES sedes(id),
  periodo TEXT NOT NULL,
  tipo TEXT NOT NULL CHECK (tipo IN ('mensual','extra')),
  importe INTEGER NOT NULL CHECK (importe > 0),
  fecha TEXT NOT NULL,
  referencia TEXT,
  nota TEXT,
  pedido_id INTEGER REFERENCES pedidos_fondos(id),
  estado TEXT NOT NULL DEFAULT 'vigente' CHECK (estado IN ('vigente','anulada')),
  motivo_anulacion TEXT,
  anulada_por INTEGER REFERENCES usuarios(id),
  anulada_en TEXT,
  creado_por INTEGER REFERENCES usuarios(id),
  creado_en TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_asignacion_mensual ON asignaciones(sede_id, periodo) WHERE tipo = 'mensual' AND estado = 'vigente';

CREATE TABLE IF NOT EXISTS pedidos_fondos (
  id INTEGER PRIMARY KEY,
  sede_id INTEGER NOT NULL REFERENCES sedes(id),
  periodo TEXT NOT NULL,
  importe INTEGER NOT NULL CHECK (importe > 0),
  justificacion TEXT NOT NULL,
  saldo_banco INTEGER NOT NULL,
  saldo_efectivo INTEGER NOT NULL,
  estado TEXT NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente','autorizado','rechazado')),
  pedido_por INTEGER NOT NULL REFERENCES usuarios(id),
  pedido_en TEXT NOT NULL DEFAULT (datetime('now')),
  resuelto_por INTEGER REFERENCES usuarios(id),
  resuelto_en TEXT,
  comentario TEXT,
  asignacion_id INTEGER REFERENCES asignaciones(id)
);

-- Libro único de movimientos. Cada sede tiene subcuenta banco y efectivo; la Central, banco.
-- Encadenado con SHA-256: un cambio hecho por fuera del sistema rompe la cadena.
CREATE TABLE IF NOT EXISTS movimientos (
  id INTEGER PRIMARY KEY,
  sede_id INTEGER NOT NULL REFERENCES sedes(id),
  cuenta TEXT NOT NULL CHECK (cuenta IN ('banco','efectivo')),
  periodo TEXT NOT NULL,
  fecha TEXT NOT NULL,
  tipo TEXT NOT NULL CHECK (tipo IN ('saldo_inicial','ingreso','asignacion','fondo_extra','extraccion','deposito','gasto','pago_central','anulacion')),
  concepto TEXT NOT NULL,
  importe INTEGER NOT NULL CHECK (importe <> 0),
  asignacion_id INTEGER REFERENCES asignaciones(id),
  gasto_id INTEGER REFERENCES gastos(id),
  grupo TEXT,
  anula_id INTEGER UNIQUE REFERENCES movimientos(id),
  creado_por INTEGER REFERENCES usuarios(id),
  creado_en TEXT NOT NULL,
  hash_anterior TEXT NOT NULL,
  hash TEXT NOT NULL UNIQUE
);
CREATE INDEX IF NOT EXISTS idx_mov_sede ON movimientos(sede_id, cuenta, periodo);
CREATE INDEX IF NOT EXISTS idx_mov_gasto ON movimientos(gasto_id);

CREATE TABLE IF NOT EXISTS solicitudes (
  id INTEGER PRIMARY KEY,
  sede_id INTEGER NOT NULL REFERENCES sedes(id),
  periodo TEXT NOT NULL,
  descripcion TEXT NOT NULL,
  monto_estimado INTEGER NOT NULL CHECK (monto_estimado > 0),
  proveedor_id INTEGER REFERENCES proveedores(id),
  rubro_id INTEGER REFERENCES rubros(id),
  medio_previsto TEXT CHECK (medio_previsto IN ('transferencia','efectivo')),
  estado TEXT NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente','en_revision','aprobada','rechazada','ejecutada')),
  quien_paga TEXT CHECK (quien_paga IN ('sede','central')),
  comentario TEXT,
  creado_por INTEGER NOT NULL REFERENCES usuarios(id),
  creado_en TEXT NOT NULL DEFAULT (datetime('now')),
  resuelto_por INTEGER REFERENCES usuarios(id),
  resuelto_en TEXT,
  gasto_id INTEGER REFERENCES gastos(id),
  actualizado_en TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_solicitudes_estado ON solicitudes(estado, creado_en);

CREATE TABLE IF NOT EXISTS solicitudes_historial (
  id INTEGER PRIMARY KEY,
  solicitud_id INTEGER NOT NULL REFERENCES solicitudes(id),
  de TEXT,
  a TEXT NOT NULL,
  quien_paga TEXT,
  comentario TEXT,
  usuario_id INTEGER REFERENCES usuarios(id),
  creado_en TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Un gasto = un comprobante y su pago.
CREATE TABLE IF NOT EXISTS gastos (
  id INTEGER PRIMARY KEY,
  sede_id INTEGER NOT NULL REFERENCES sedes(id),
  periodo TEXT NOT NULL,
  fecha_pago TEXT NOT NULL,
  proveedor_id INTEGER NOT NULL REFERENCES proveedores(id),
  tipo_comprobante TEXT NOT NULL CHECK (tipo_comprobante IN ('factura_a','factura_b','factura_c','ticket','recibo','otro')),
  punto_venta INTEGER,
  numero INTEGER,
  fecha_comprobante TEXT,
  cae TEXT CHECK (cae IS NULL OR length(cae) = 14),
  cae_vto TEXT,
  cuit_receptor TEXT,
  advertencias TEXT,
  bruto INTEGER NOT NULL CHECK (bruto > 0),
  retenciones INTEGER NOT NULL DEFAULT 0 CHECK (retenciones >= 0),
  neto INTEGER NOT NULL,
  rubro_id INTEGER NOT NULL REFERENCES rubros(id),
  tipo_gasto TEXT NOT NULL CHECK (tipo_gasto IN ('fijo','caja_chica','con_solicitud')),
  medio TEXT NOT NULL CHECK (medio IN ('transferencia','efectivo')),
  pagado_por TEXT NOT NULL CHECK (pagado_por IN ('sede','central')),
  solicitud_id INTEGER REFERENCES solicitudes(id),
  descripcion TEXT,
  estado TEXT NOT NULL DEFAULT 'registrado' CHECK (estado IN ('registrado','anulado')),
  motivo_anulacion TEXT,
  anulado_por INTEGER REFERENCES usuarios(id),
  anulado_en TEXT,
  adjunto_estado TEXT NOT NULL DEFAULT 'sin' CHECK (adjunto_estado IN ('sin','pendiente','subido')),
  creado_por INTEGER NOT NULL REFERENCES usuarios(id),
  creado_en TEXT NOT NULL DEFAULT (datetime('now')),
  actualizado_en TEXT,
  CHECK (neto = bruto - retenciones)
);
CREATE INDEX IF NOT EXISTS idx_gastos_sede ON gastos(sede_id, periodo, estado);
-- Anti-duplicado: el CAE es único entre los gastos vigentes; si no hay CAE, CUIT + tipo + PV + número.
CREATE UNIQUE INDEX IF NOT EXISTS uq_gasto_cae ON gastos(cae) WHERE cae IS NOT NULL AND estado = 'registrado';
CREATE UNIQUE INDEX IF NOT EXISTS uq_gasto_numero ON gastos(proveedor_id, tipo_comprobante, punto_venta, numero)
  WHERE numero IS NOT NULL AND punto_venta IS NOT NULL AND estado = 'registrado';
CREATE UNIQUE INDEX IF NOT EXISTS uq_gasto_solicitud ON gastos(solicitud_id) WHERE solicitud_id IS NOT NULL AND estado = 'registrado';

CREATE TABLE IF NOT EXISTS intentos_duplicado (
  id INTEGER PRIMARY KEY,
  sede_id INTEGER REFERENCES sedes(id),
  usuario_id INTEGER REFERENCES usuarios(id),
  ip TEXT,
  clave TEXT NOT NULL CHECK (clave IN ('cae','numero')),
  valor TEXT NOT NULL,
  gasto_existente_id INTEGER REFERENCES gastos(id),
  datos TEXT,
  creado_en TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS certificados_retencion (
  id INTEGER PRIMARY KEY,
  numero INTEGER NOT NULL UNIQUE,
  gasto_id INTEGER NOT NULL UNIQUE REFERENCES gastos(id),
  fecha TEXT NOT NULL,
  agente TEXT NOT NULL,
  sujeto TEXT NOT NULL,
  total INTEGER NOT NULL,
  anulado INTEGER NOT NULL DEFAULT 0 CHECK (anulado IN (0,1)),
  motivo_anulacion TEXT,
  creado_por INTEGER REFERENCES usuarios(id),
  creado_en TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS retenciones (
  id INTEGER PRIMARY KEY,
  gasto_id INTEGER NOT NULL REFERENCES gastos(id),
  impuesto TEXT NOT NULL CHECK (impuesto IN ('iva','ganancias','suss','iibb')),
  alicuota_id INTEGER REFERENCES alicuotas(id),
  regimen TEXT NOT NULL,
  jurisdiccion TEXT,
  base INTEGER NOT NULL CHECK (base > 0),
  alicuota INTEGER NOT NULL,
  importe INTEGER NOT NULL CHECK (importe >= 0),
  tildado_por INTEGER NOT NULL REFERENCES usuarios(id),
  creado_en TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (gasto_id, impuesto)
);

CREATE TABLE IF NOT EXISTS rendiciones (
  id INTEGER PRIMARY KEY,
  sede_id INTEGER NOT NULL REFERENCES sedes(id),
  periodo TEXT NOT NULL,
  -- en_cotejo, observada y aprobada son de la Etapa 2: están en el enum, sin lógica.
  estado TEXT NOT NULL DEFAULT 'abierta' CHECK (estado IN ('abierta','cerrada_firmada','enviada','en_cotejo','observada','aprobada')),
  version INTEGER NOT NULL DEFAULT 0,
  actualizado_en TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (sede_id, periodo)
);

-- Cada cierre es una versión: la foto (snapshot) de lo que se firmó y se envió, con su hash.
CREATE TABLE IF NOT EXISTS rendicion_versiones (
  id INTEGER PRIMARY KEY,
  rendicion_id INTEGER NOT NULL REFERENCES rendiciones(id),
  version INTEGER NOT NULL,
  snapshot TEXT NOT NULL,
  hash TEXT NOT NULL,
  firmado_por INTEGER NOT NULL REFERENCES usuarios(id),
  firmado_en TEXT NOT NULL,
  enviado_por INTEGER REFERENCES usuarios(id),
  enviado_en TEXT,
  reabierto_por INTEGER REFERENCES usuarios(id),
  reabierto_en TEXT,
  motivo_reapertura TEXT,
  UNIQUE (rendicion_id, version)
);

CREATE TABLE IF NOT EXISTS adjuntos (
  id INTEGER PRIMARY KEY,
  entidad TEXT NOT NULL CHECK (entidad IN ('gasto','solicitud')),
  entidad_id INTEGER NOT NULL,
  nombre TEXT NOT NULL,
  mime TEXT NOT NULL,
  bytes INTEGER NOT NULL,
  sha256 TEXT NOT NULL,
  clave TEXT NOT NULL,
  activo INTEGER NOT NULL DEFAULT 1 CHECK (activo IN (0,1)),
  subido_por INTEGER REFERENCES usuarios(id),
  subido_en TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_adjuntos ON adjuntos(entidad, entidad_id);

CREATE TABLE IF NOT EXISTS notificaciones (
  id INTEGER PRIMARY KEY,
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id),
  texto TEXT NOT NULL,
  link TEXT,
  tipo TEXT NOT NULL DEFAULT 'info' CHECK (tipo IN ('info','ok','alerta','mal')),
  leida INTEGER NOT NULL DEFAULT 0 CHECK (leida IN (0,1)),
  creado_en TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_notif ON notificaciones(usuario_id, leida, id);

-- Registro de auditoría append-only, encadenado con SHA-256.
CREATE TABLE IF NOT EXISTS auditoria (
  id INTEGER PRIMARY KEY,
  usuario_id INTEGER REFERENCES usuarios(id),
  sede_id INTEGER REFERENCES sedes(id),
  accion TEXT NOT NULL,
  entidad TEXT,
  entidad_id INTEGER,
  antes TEXT,
  despues TEXT,
  motivo TEXT,
  ip TEXT,
  creado_en TEXT NOT NULL,
  hash_anterior TEXT NOT NULL,
  hash TEXT NOT NULL UNIQUE
);
CREATE INDEX IF NOT EXISTS idx_auditoria_entidad ON auditoria(entidad, entidad_id);
CREATE INDEX IF NOT EXISTS idx_auditoria_sede ON auditoria(sede_id, id);
`;

function crearTriggers() {
  for (const t of INMUTABLES) {
    db.exec(`
      CREATE TRIGGER IF NOT EXISTS ${t}_no_update BEFORE UPDATE ON ${t}
      BEGIN SELECT RAISE(ABORT, 'Registro inmutable: no se puede modificar'); END;
      CREATE TRIGGER IF NOT EXISTS ${t}_no_delete BEFORE DELETE ON ${t}
      BEGIN SELECT RAISE(ABORT, 'Registro inmutable: no se puede borrar'); END;`);
  }
  for (const t of SIN_BORRADO) {
    db.exec(`CREATE TRIGGER IF NOT EXISTS ${t}_no_delete BEFORE DELETE ON ${t}
      BEGIN SELECT RAISE(ABORT, 'Los registros no se borran: se anulan con motivo'); END;`);
  }

  // Período cerrado: la base rechaza cargar o tocar gastos de un mes cuya rendición no está abierta
  // (el adjunto sí puede terminar de subir: no es parte de lo firmado).
  const cerrado = (alias) => `EXISTS (SELECT 1 FROM rendiciones r WHERE r.sede_id = ${alias}.sede_id AND r.periodo = ${alias}.periodo AND r.estado <> 'abierta')`;
  db.exec(`
    CREATE TRIGGER IF NOT EXISTS gastos_periodo_cerrado_ins BEFORE INSERT ON gastos WHEN ${cerrado('NEW')}
    BEGIN SELECT RAISE(ABORT, 'Período cerrado: no se puede cargar ni modificar nada de ese mes'); END;
    CREATE TRIGGER IF NOT EXISTS gastos_periodo_cerrado_upd BEFORE UPDATE OF
      sede_id, periodo, fecha_pago, proveedor_id, tipo_comprobante, punto_venta, numero, fecha_comprobante, cae, cae_vto,
      bruto, retenciones, neto, rubro_id, tipo_gasto, medio, pagado_por, solicitud_id, descripcion, estado
    ON gastos WHEN ${cerrado('OLD')} OR ${cerrado('NEW')}
    BEGIN SELECT RAISE(ABORT, 'Período cerrado: no se puede cargar ni modificar nada de ese mes'); END;
    CREATE TRIGGER IF NOT EXISTS movimientos_periodo_cerrado BEFORE INSERT ON movimientos
      WHEN NEW.tipo <> 'pago_central' AND ${cerrado('NEW')}
    BEGIN SELECT RAISE(ABORT, 'Período cerrado: no se puede cargar ni modificar nada de ese mes'); END;`);

  // Lo firmado no se toca: snapshot, hash y firma de una versión quedan fijos.
  db.exec(`
    CREATE TRIGGER IF NOT EXISTS rendicion_version_sellada BEFORE UPDATE OF rendicion_id, version, snapshot, hash, firmado_por, firmado_en
    ON rendicion_versiones
    BEGIN SELECT RAISE(ABORT, 'Registro inmutable: la versión firmada no se puede modificar'); END;
    CREATE TRIGGER IF NOT EXISTS rendicion_version_envio BEFORE UPDATE OF enviado_por, enviado_en ON rendicion_versiones
      WHEN OLD.enviado_en IS NOT NULL
    BEGIN SELECT RAISE(ABORT, 'Registro inmutable: el envío ya quedó registrado'); END;
    CREATE TRIGGER IF NOT EXISTS rendicion_version_reapertura BEFORE UPDATE OF reabierto_por, reabierto_en, motivo_reapertura ON rendicion_versiones
      WHEN OLD.reabierto_en IS NOT NULL
    BEGIN SELECT RAISE(ABORT, 'Registro inmutable: la reapertura ya quedó registrada'); END;`);
}

// ── Datos base (sólo si la base está vacía) ─────────────────────────────────
const RUBROS_INICIALES = [
  ['Servicios', { fijo: true }, ['Luz', 'Gas', 'Agua', 'Internet', 'Telefonía']],
  ['Personal', {}, ['Sueldos', 'Cargas sociales', 'Jardineros', 'Limpieza']],
  ['Racionamiento / alimentos', {}, []],
  ['Mantenimiento', {}, ['Edilicio', 'Maquinaria (tractor)', 'Pileta', 'Canchas de golf', 'Canchas de tenis', 'Canchas de pádel']],
  ['Hotelería', {}, ['Blanquería', 'Amenities']],
  ['Equipamiento y mobiliario', {}, []],
  ['Combustibles', {}, []],
  ['Movilidad (remís)', {}, []],
  ['Eventos y protocolo', {}, []],
  ['Honorarios', {}, []],
  ['Impuestos y tasas', {}, []],
  ['N/D – sin descripción', { nd: true }, []]
];

// Valores del relevamiento (octubre 2026). Se actualizan desde Administración → Parámetros.
const PARAMETROS_INICIALES = [
  ['tope_transferencia', 32000000, 'Caja chica por transferencia: hasta $ 320.000'],
  ['tope_efectivo', 4000000, 'Caja chica en efectivo: hasta $ 40.000'],
  ['umbral_retencion', 32000000, 'Pagos de más de $ 320.000 muestran las retenciones'],
  ['umbral_nd_pct', 5, 'Alerta si los gastos N/D superan el 5 % de lo gastado por la sede']
];

const CONFIG_INICIAL = {
  circulo_razon_social: 'Círculo de Oficiales de la Fuerza Aérea Argentina',
  circulo_cuit: '',
  circulo_domicilio: '',
  flag_adjuntos: '1',
  flag_cierre_anticipado: '0'
};

function sembrarBase() {
  const vacia = db.prepare('SELECT COUNT(*) n FROM sedes').get().n === 0;
  if (!vacia) return;
  db.transaction(() => {
    db.prepare(`INSERT INTO sedes (nombre, codigo, es_central, descripcion, orden) VALUES ('Sede Central', 'CEN', 1, 'Casa central del Círculo', 0)`).run();

    const insPerm = db.prepare('INSERT OR IGNORE INTO roles_permisos (rol, permiso) VALUES (?, ?)');
    for (const [rol, permisos] of Object.entries(MATRIZ_INICIAL)) for (const p of permisos) insPerm.run(rol, p);

    const insRubro = db.prepare('INSERT INTO rubros (padre_id, nombre, es_fijo, es_nd, orden) VALUES (?, ?, ?, ?, ?)');
    RUBROS_INICIALES.forEach(([nombre, op, hijos], i) => {
      const id = Number(insRubro.run(null, nombre, op.fijo ? 1 : 0, op.nd ? 1 : 0, (i + 1) * 10).lastInsertRowid);
      hijos.forEach((h, j) => insRubro.run(id, h, 0, 0, (j + 1) * 10));
    });

    const insParam = db.prepare(`INSERT INTO parametros (clave, valor, vigente_desde, nota) VALUES (?, ?, '2026-01-01', ?)`);
    for (const [clave, valor, nota] of PARAMETROS_INICIALES) insParam.run(clave, valor, nota);

    const insConf = db.prepare('INSERT OR IGNORE INTO config (clave, valor) VALUES (?, ?)');
    for (const [k, v] of Object.entries(CONFIG_INICIAL)) insConf.run(k, v);

    // Primer superadmin, desde el entorno. Entra con contraseña temporal y la cambia.
    const email = normalizarEmail(process.env.ADMIN_EMAIL);
    if (email && process.env.ADMIN_PASSWORD) {
      db.prepare(`INSERT INTO usuarios (nombre, apellido, email, rol, password_hash, debe_cambiar_password) VALUES ('Soporte', 'VentureByte', ?, 'superadmin', ?, 1)`)
        .run(email, bcrypt.hashSync(process.env.ADMIN_PASSWORD, 10));
    }
  })();
}

db.exec(SCHEMA);
crearTriggers();
sembrarBase();

// ── Lecturas de configuración ───────────────────────────────────────────────
function getConfig() {
  return Object.fromEntries(db.prepare('SELECT clave, valor FROM config').all().map(r => [r.clave, r.valor]));
}
function flag(nombre) { return db.prepare('SELECT valor FROM config WHERE clave = ?').get(`flag_${nombre}`)?.valor === '1'; }

// Valor vigente de un parámetro a una fecha (el último cargado con vigencia ≤ fecha).
const qParam = db.prepare('SELECT valor FROM parametros WHERE clave = ? AND vigente_desde <= ? ORDER BY vigente_desde DESC, id DESC LIMIT 1');
function parametro(clave, fecha) {
  const r = qParam.get(clave, fecha);
  if (!r) throw new Error(`Falta el parámetro ${clave} vigente al ${fecha}`);
  return r.valor;
}

const qCentral = db.prepare('SELECT * FROM sedes WHERE es_central = 1');
function sedeCentral() { return qCentral.get(); }

module.exports = { db, DATA_DIR, getConfig, flag, parametro, sedeCentral, RUBROS_INICIALES };
