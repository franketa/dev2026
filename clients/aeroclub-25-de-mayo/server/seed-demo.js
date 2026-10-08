// Datos de demostración: `npm run demo` sobre una base vacía (o DB_PATH apuntando a otra).
// NO usar en producción: crea socios ficticios con contraseñas conocidas.
process.env.ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'demo1234';
const bcrypt = require('bcryptjs');
const { db } = require('./db');
const flota = require('./services/flota');
const vuelos = require('./services/vuelos');
const cierres = require('./services/cierres');
const ledger = require('./services/ledger');
const servicios = require('./services/servicios');
const tickets = require('./services/tickets');
const pagosInformados = require('./services/pagosInformados');
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

// Precios de los servicios (de ejemplo)
const PRECIOS = {
  'Hangaraje mensual': 8000000, 'Hangaraje diario': 500000, Combustible: 280000, Nocturno: 2500000, 'Derecho de aeronave': 1500000,
  'Derecho de examen': 4000000, 'Hora de simulador': 3500000, 'Limpieza de avión': 2000000
};
const servicioId = {};
for (const s of servicios.listar()) {
  servicios.guardar({ nombre: s.nombre, unidad: s.unidad, precio: PRECIOS[s.nombre] }, admin, s.id);
  servicioId[s.nombre] = s.id;
}

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

// Rampa y un miembro de la comisión con usuario de sólo consulta
const conRol = (nombre, apellido, email, rol) => {
  const r = db.prepare(`INSERT INTO usuarios (nombre, apellido, email, telefono, rol, password_hash, debe_cambiar_password) VALUES (?, ?, ?, '2345 407700', ?, ?, 0)`)
    .run(nombre, apellido, email, rol, hash);
  return { id: Number(r.lastInsertRowid), rol, nombre, apellido };
};
const rampa = conRol('Oscar', 'Medina', 'rampa@demo.com', 'rampa');
conRol('Norma', 'Villalba', 'comision@demo.com', 'consulta');

// Aeronaves de afuera y de socios que usan el hangar y la bomba
const aeronaves = [
  tickets.guardarAeronave({ matricula: 'LV-ZKD', modelo: 'Piper PA-25 Pawnee', externo: { nombre: 'Agroaérea del Salado SRL', telefono: '2345 409911', dni: '30-71234567-8' } }, rampa),
  tickets.guardarAeronave({ matricula: 'LV-BRC', modelo: 'Cessna 182', externo: { nombre: 'Ramiro', apellido: 'Castaño', telefono: '2346 412233' } }, rampa),
  tickets.guardarAeronave({ matricula: 'LV-HNT', modelo: 'Aeronca Champ', propietario_id: pilotos[2].id, notas: 'Hangar 2' }, rampa),
  tickets.guardarAeronave({ matricula: 'LV-GRT', modelo: 'Cessna 172' }, rampa)          // tránsito
];

// Vuelos: generador determinístico
let semilla = 7;
const azar = () => { semilla = (semilla * 16807) % 2147483647; return semilla / 2147483647; };
const NOTAS = ['Aceite 5 qt, todo normal', 'Cubierta del tren izquierdo algo baja', 'Ruido en la radio con el motor en alta', 'Viento cruzado fuerte en 21', 'Cargué 40 litros en la bomba', 'Luz de navegación derecha quemada'];

// Salida entre las 8 y las 17; la llegada, justo el tiempo de vuelo (las décimas salen del horario).
function horario(dec) {
  const salida = 8 * 60 + Math.floor(azar() * 9) * 60 + Math.floor(azar() * 12) * 5;
  const llegada = salida + dec * 6;
  const hhmm = (m) => `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
  return { hora_salida: hhmm(salida), hora_llegada: hhmm(llegada) };
}

function vuelo(fecha, piloto, avionId, conInstructor) {
  const dec = conInstructor ? 6 + Math.floor(azar() * 8) : 5 + Math.floor(azar() * 14);
  const inst = conInstructor ? instructores[Math.floor(azar() * instructores.length)] : null;
  vuelos.crear({
    piloto_id: piloto.id, avion_id: avionId, fecha, horas: String(dec / 10), ...horario(dec),
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

// Tickets de servicios: hangaraje mensual y combustible (los de meses pasados los carga tesorería)
const ticket = (actor, aeronave, fecha, items, extra = {}) =>
  tickets.crear({ aeronave_id: aeronave.id, fecha, items: items.map(([nombre, cantidad]) => ({ servicio_id: servicioId[nombre], cantidad })), ...extra }, actor);
const ticketsDelMes = (periodo, actor) => {
  // Rampa sólo carga tickets de los últimos días; los de meses pasados los carga tesorería.
  const dia = (d) => (actor.rol === 'rampa' ? sumarDias(hoy(), -Number(d)) : [`${periodo}-${d}`, hoy()].sort()[0]);
  // Externos y tránsitos pagan en el acto; al socio (LV-HNT) se le deja a cuenta.
  ticket(actor, aeronaves[0], dia('02'), [['Hangaraje mensual', '1']], { cobrado: true, medio: 'transferencia' });
  ticket(actor, aeronaves[0], dia('06'), [['Combustible', '120']], { cobrado: true, medio: 'transferencia' });
  ticket(actor, aeronaves[1], dia('04'), [['Combustible', '85,5'], ['Limpieza de avión', '1']], { cobrado: true, medio: 'efectivo' });
  ticket(actor, aeronaves[2], dia('03'), [['Hangaraje mensual', '1']]);
  ticket(actor, aeronaves[3], dia('05'), [['Hangaraje diario', '2'], ['Nocturno', '2']], { cobrado: true, medio: 'efectivo', piloto: 'Diego Ferrari' });
};
ticketsDelMes(inicio, admin);
tickets.crear({ usuario_id: alumnos[0].id, fecha: `${inicio}-20`, items: [{ servicio_id: servicioId['Hora de simulador'], cantidad: '2' }] }, admin);

// Cierres de los dos meses anteriores con pagos intercalados
cierres.cerrar(inicio, admin);
ticketsDelMes(sumarMeses(inicio, 1), admin);
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
for (const u of [...alumnos.slice(0, 2), pilotos[0], pilotos[2]]) pagar(u, 1, [`${mes3}-0${2 + Math.floor(azar() * 7)}`, hoy()].sort()[0]);
pagar(alumnos[2], 0.5, [`${mes3}-08`, hoy()].sort()[0]);

// Este mes: tickets de rampa y otros conceptos de tesorería
ticketsDelMes(mes3, rampa);
tickets.crear({ usuario_id: alumnos[1].id, items: [{ servicio_id: servicioId['Derecho de examen'] }, { concepto: 'Libro de vuelo', precio: '15.000' }] }, admin);

// Pagos informados por los socios, esperando que tesorería los revise
pagosInformados.informar({ importe: String(Math.max(ledger.saldo(pilotos[1].id), 100000) / 100), medio: 'transferencia', nota: 'Transferí desde Mercado Pago' }, pilotos[1]);
pagosInformados.informar({ importe: '50000', medio: 'efectivo', nota: 'Se lo di a Ricardo en el hangar' }, alumnos[2]);

const n = db.prepare('SELECT COUNT(*) n FROM vuelos').get().n;
console.log(`Demo lista: ${n} vuelos, 2 meses cerrados (${inicio} y ${mes2}), ${mes3} en curso.`);
console.log('Tesorería: tesoreria@aeroclub25demayo.com.ar / demo1234');
console.log('Pilotos:   tomas.aguirre@demo.com, martin.olivera@demo.com, ricardo.benitez@demo.com (instructor)… / piloto1234');
console.log('Rampa:     rampa@demo.com / piloto1234 · Consulta: comision@demo.com / piloto1234');
