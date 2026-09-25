// Datos de demostración: `npm run demo` sobre una base vacía (o DB_PATH apuntando a otra).
// NO usar en producción: crea socios ficticios con contraseñas conocidas.
process.env.ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'demo1234';
const bcrypt = require('bcryptjs');
const { db } = require('./db');
const flota = require('./services/flota');
const vuelos = require('./services/vuelos');
const cierres = require('./services/cierres');
const ledger = require('./services/ledger');
const { hoy, periodoActual, sumarMeses, ultimoDia, sumarDias } = require('./util');

if (db.prepare('SELECT COUNT(*) n FROM vuelos').get().n > 0) {
  console.log('La base ya tiene vuelos: no se cargan datos de demostración.');
  process.exit(0);
}

const admin = { id: 1, rol: 'admin' };
db.prepare(`UPDATE usuarios SET debe_cambiar_password = 0, telefono = '2345 401000' WHERE id = 1`).run();

const inicio = sumarMeses(periodoActual(), -2);
db.prepare(`UPDATE config SET valor = ? WHERE clave = 'periodo_inicio'`).run(inicio);
db.prepare(`UPDATE config SET valor = ? WHERE clave = 'pago_alias'`).run('aeroclub.25demayo');
db.prepare(`UPDATE config SET valor = ? WHERE clave = 'pago_cbu'`).run('0140312301000012345678');
db.prepare(`UPDATE config SET valor = ? WHERE clave = 'pago_cuit'`).run('30-00000000-0');
db.prepare(`UPDATE config SET valor = ? WHERE clave = 'pago_banco'`).run('Banco de la Provincia de Buenos Aires');

// Flota y tarifas (precios de ejemplo)
const desde = `${inicio}-01`;
flota.nuevaTarifa(1, { tipo: 'solo', precio_hora: 9500000, vigente_desde: desde }, admin);
flota.nuevaTarifa(1, { tipo: 'instruccion', precio_hora: 12000000, vigente_desde: desde }, admin);
flota.nuevaTarifa(2, { tipo: 'solo', precio_hora: 7000000, vigente_desde: desde }, admin);
flota.nuevaTarifa(2, { tipo: 'instruccion', precio_hora: 9000000, vigente_desde: desde }, admin);
// Aumento a mitad del período (queda en el historial)
flota.nuevaTarifa(1, { tipo: 'solo', precio_hora: 10200000, vigente_desde: `${sumarMeses(inicio, 1)}-15` }, admin);

const hash = bcrypt.hashSync('piloto1234', 10);
const socio = (nombre, apellido, tel, extra = {}) => {
  const email = `${nombre}.${apellido}`.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s/g, '') + '@demo.com';
  const r = db.prepare(`INSERT INTO usuarios (nombre, apellido, email, telefono, licencia, es_instructor, password_hash, debe_cambiar_password)
                        VALUES (?, ?, ?, ?, ?, ?, ?, 0)`).run(nombre, apellido, email, tel, extra.licencia || 'PPA', extra.instructor ? 1 : 0, hash);
  return { id: Number(r.lastInsertRowid), rol: 'piloto', nombre, apellido };
};
const instructores = [
  socio('Ricardo', 'Benítez', '2345 401122', { instructor: true, licencia: 'INVA' }),
  socio('Laura', 'Fernández', '2345 402233', { instructor: true, licencia: 'INVA' })
];
const alumnos = [
  socio('Tomás', 'Aguirre', '2345 405511', { licencia: 'Alumno' }),
  socio('Sofía', 'Cabrera', '2345 405522', { licencia: 'Alumno' }),
  socio('Mateo', 'Ledesma', '2345 405533', { licencia: 'Alumno' })
];
const pilotos = [
  socio('Martín', 'Olivera', '2345 406611'),
  socio('Graciela', 'Suárez', '2345 406622'),
  socio('Julián', 'Pereyra', '2345 406633', { licencia: 'PCA' }),
  socio('Hernán', 'Iturralde', '')
];

// Vuelos: generador determinístico
let semilla = 7;
const azar = () => { semilla = (semilla * 16807) % 2147483647; return semilla / 2147483647; };
const NOTAS = ['Aceite 5 qt, todo normal', 'Cubierta del tren izquierdo algo baja', 'Ruido en la radio con el motor en alta', 'Viento cruzado fuerte en 21', 'Cargué 40 litros en la bomba', 'Luz de navegación derecha quemada'];

function vuelo(fecha, piloto, avionId, conInstructor) {
  const dec = conInstructor ? 6 + Math.floor(azar() * 8) : 5 + Math.floor(azar() * 14);
  const inst = conInstructor ? instructores[Math.floor(azar() * instructores.length)] : null;
  vuelos.crear({
    piloto_id: piloto.id, avion_id: avionId, fecha, horas: String(dec / 10),
    con_instructor: !!inst, instructor_id: inst?.id, notas: azar() < 0.12 ? NOTAS[Math.floor(azar() * NOTAS.length)] : null
  }, admin);
}

const fin = hoy();
for (let f = desde; f <= fin; f = sumarDias(f, 1)) {
  const dow = new Date(f + 'T12:00:00Z').getUTCDay();
  const findeOFeriado = dow === 0 || dow === 6;
  const cantidad = findeOFeriado ? 2 + Math.floor(azar() * 3) : (azar() < 0.45 ? 1 : 0);
  for (let i = 0; i < cantidad; i++) {
    const esAlumno = azar() < 0.5;
    const quien = esAlumno ? alumnos[Math.floor(azar() * alumnos.length)] : pilotos[Math.floor(azar() * pilotos.length)];
    const avion = esAlumno ? (azar() < 0.7 ? 1 : 2) : (azar() < 0.5 ? 1 : 2);
    vuelo(f, quien, avion, esAlumno);
  }
}

// Saldos traídos de la planilla
ledger.registrar({ usuario_id: pilotos[3].id, tipo: 'saldo_inicial', concepto: 'Saldo inicial: deuda en la planilla de Excel a junio', importe: 4500000, fecha: desde, creado_por: admin.id });

// Cierres de los dos meses anteriores con pagos intercalados
cierres.cerrar(inicio, admin);
const pagar = (u, fraccion, fecha, medio = 'transferencia') => {
  const s = ledger.saldo(u.id);
  if (s <= 0) return;
  const imp = Math.round((s * fraccion) / 100) * 100;
  ledger.registrar({ usuario_id: u.id, tipo: 'pago', concepto: `Pago por ${medio}`, importe: -imp, fecha, medio, creado_por: admin.id });
};
const mes2 = sumarMeses(inicio, 1);
for (const u of [...alumnos, ...pilotos.slice(0, 3), ...instructores]) pagar(u, 1, `${mes2}-0${3 + Math.floor(azar() * 6)}`);
pagar(pilotos[3], 0.4, `${mes2}-09`, 'efectivo');
cierres.cerrar(mes2, admin);
const mes3 = periodoActual();
for (const u of [...alumnos.slice(0, 2), pilotos[0], pilotos[2]]) pagar(u, 1, `${mes3}-0${2 + Math.floor(azar() * 7)}`);
pagar(alumnos[2], 0.5, `${mes3}-08`);

const n = db.prepare('SELECT COUNT(*) n FROM vuelos').get().n;
console.log(`Demo lista: ${n} vuelos, 2 meses cerrados (${inicio} y ${mes2}), ${mes3} en curso.`);
console.log('Tesorería: tesoreria@aeroclub25demayo.com.ar / demo1234');
console.log('Pilotos:   tomas.aguirre@demo.com, martin.olivera@demo.com, ricardo.benitez@demo.com (instructor)… / piloto1234');
