// Base de demostración: borra la base y arma un escenario realista.
//
//   - La Central con $ 800.000.000 de saldo inicial.
//   - 7 sedes; Vicente López es la más completa (hotel, restaurante, canchas).
//   - Usuarios de cada rol (contraseña de todos: demo1234).
//   - Proveedores conocidos con CUIT ficticio pero válido.
//   - El mes anterior completo, con gastos de los 3 tipos, retenciones, pagos directos de la Central, un N/D,
//     rendiciones enviadas (una con reapertura y versión 2) y la de Vicente López abierta para cerrarla en la demo.
//   - El mes en curso con solicitudes en cada estado, un pedido de fondos extra y un intento de duplicado.
//
// NO CORRER EN PRODUCCIÓN.

const fs = require('fs');
const path = require('path');

if (process.env.NODE_ENV === 'production' && process.env.DEMO_FORZAR !== '1') {
  console.error('seed-demo: NODE_ENV=production. No se borra la base. (DEMO_FORZAR=1 para forzar)');
  process.exit(1);
}
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
for (const f of ['fondo.sqlite', 'fondo.sqlite-wal', 'fondo.sqlite-shm']) fs.rmSync(path.join(DATA_DIR, f), { force: true });
fs.rmSync(path.join(DATA_DIR, 'adjuntos'), { recursive: true, force: true });
delete process.env.ADMIN_EMAIL;

const bcrypt = require('bcryptjs');
const { db, sedeCentral } = require('./db');
const fondos = require('./services/fondos');
const proveedores = require('./services/proveedores');
const gastos = require('./services/gastos');
const solicitudes = require('./services/solicitudes');
const rendiciones = require('./services/rendiciones');
const admin = require('./services/admin');
const { digitoCuit, periodoActual, sumarMeses, ultimoDia, hoy } = require('./util');

const $ = (pesos) => Math.round(pesos * 100);
const ACTUAL = periodoActual();
const ANTERIOR = sumarMeses(ACTUAL, -1);
const HOY = hoy();
const DIA_HOY = Number(HOY.slice(8));
const fechaAnt = (d) => `${ANTERIOR}-${String(Math.min(d, Number(ultimoDia(ANTERIOR).slice(8)))).padStart(2, '0')}`;
const fechaAct = (d) => `${ACTUAL}-${String(Math.min(d, DIA_HOY)).padStart(2, '0')}`;

// Pseudoaleatorio con semilla: la demo sale siempre igual.
let semilla = 20261011;
const azar = () => { semilla = (semilla * 1103515245 + 12345) % 2147483648; return semilla / 2147483648; };
const entre = (a, b) => Math.round(a + azar() * (b - a));
const redondo = (n, paso = 100) => Math.round(n / paso) * paso;

function cuit(ocho, prefijo = '30') {
  for (let base = Number(ocho); ; base++) {
    const diez = `${prefijo}${String(base).padStart(8, '0')}`;
    const dv = digitoCuit(diez);
    if (dv !== null) return `${diez}${dv}`;
  }
}

// ── Configuración del Círculo ───────────────────────────────────────────────
const sistema = { id: null, rol: 'superadmin', sede_id: null, ip: 'seed' };
const HASH = bcrypt.hashSync('demo1234', 10);
const insUsuario = db.prepare(`INSERT INTO usuarios (nombre, apellido, email, telefono, rol, sede_id, password_hash, debe_cambiar_password) VALUES (?, ?, ?, ?, ?, ?, ?, 0)`);
function usuario(nombre, apellido, email, rol, sedeId) {
  const id = Number(insUsuario.run(nombre, apellido, email, null, rol, sedeId, HASH).lastInsertRowid);
  return { id, rol, sede_id: sedeId, ip: '190.0.0.1', nombre: `${nombre} ${apellido}` };
}

const soporte = usuario('Soporte', 'VentureByte', 'soporte@venturebyte.com.ar', 'superadmin', null);
sistema.id = soporte.id;
admin.guardarConfig(soporte, { circulo_cuit: cuit(52000000), circulo_domicilio: 'Domicilio de la Sede Central (a completar)' });

// Alícuotas de DEMOSTRACIÓN. No son las reales: las tiene que pasar el contador.
const NOTA_DEMO = 'DEMO — valor ficticio para la demostración. Reemplazar por el que indique el contador.';
const alic = {};
for (const [imp, regimen, alicuota, jur] of [
  ['iva', 'DEMO · régimen IVA a definir', 2000], ['ganancias', 'DEMO · régimen Ganancias a definir', 2000],
  ['suss', 'DEMO · régimen SUSS a definir', 1000], ['iibb', 'DEMO · IIBB Buenos Aires', 1500, 'Buenos Aires'],
  ['iibb', 'DEMO · IIBB Córdoba', 2000, 'Córdoba']
]) alic[`${imp}${jur ? '_' + jur : ''}`] = admin.guardarAlicuota(soporte, null, { impuesto: imp, regimen, alicuota, jurisdiccion: jur, vigente_desde: '2026-01-01', nota: NOTA_DEMO });

// ── Sedes y usuarios ────────────────────────────────────────────────────────
const SEDES = [
  { codigo: 'VL', nombre: 'Vicente López', desc: 'Sede modelo: hotel, restaurante, pileta, canchas de tenis, pádel y golf', fondo: 170000000, slug: 'vl' },
  { codigo: 'CBA', nombre: 'Córdoba', desc: 'Sede Córdoba capital', fondo: 45000000, slug: 'cba' },
  { codigo: 'ASC', nombre: 'Ascochinga', desc: 'Complejo serrano', fondo: 60000000, slug: 'asc' },
  { codigo: 'COS', nombre: 'Cosquín', desc: 'Colonia de vacaciones', fondo: 38000000, slug: 'cos' },
  { codigo: 'BAG', nombre: 'Bahía Agradable', desc: 'Complejo costero', fondo: 52000000, slug: 'bag' },
  { codigo: 'SN', nombre: 'Sede Norte (nombre a confirmar)', desc: 'Nombre definitivo a confirmar', fondo: 18000000, slug: 'norte' },
  { codigo: 'SS', nombre: 'Sede Sur (nombre a confirmar)', desc: 'Nombre definitivo a confirmar', fondo: 15000000, slug: 'sur' }
];
for (const [i, s] of SEDES.entries()) s.id = admin.guardarSede(soporte, null, { nombre: s.nombre, codigo: s.codigo, descripcion: s.desc, orden: (i + 1) * 10 });

const central = sedeCentral();
const tesorero = usuario('Laura', 'Medina', 'tesoreria@demo.com', 'central_admin', central.id);
const presidente = usuario('Ricardo', 'Albornoz', 'presidente@demo.com', 'presidente', central.id);

const NOMBRES = [['Martín', 'Ferreyra'], ['Carolina', 'Sosa'], ['Diego', 'Luna'], ['Paula', 'Ibáñez'], ['Gustavo', 'Ríos'], ['Silvina', 'Ortega'],
  ['Hernán', 'Vega'], ['Mariela', 'Acosta'], ['Federico', 'Paz'], ['Natalia', 'Godoy'], ['Javier', 'Quiroga'], ['Lorena', 'Molina'],
  ['Pablo', 'Herrera'], ['Valeria', 'Rojas'], ['Andrés', 'Benítez'], ['Romina', 'Castro'], ['Sergio', 'Aguirre'], ['Daniela', 'Peralta'],
  ['Emilio', 'Navarro'], ['Julieta', 'Cabrera'], ['Tomás', 'Villalba']];
let ni = 0;
for (const s of SEDES) {
  const [n1, a1] = NOMBRES[ni++ % NOMBRES.length];
  const [n2, a2] = NOMBRES[ni++ % NOMBRES.length];
  s.jefe = usuario(n1, a1, `jefe.${s.slug}@demo.com`, 'jefe_sede', s.id);
  s.adm = usuario(n2, a2, `admin.${s.slug}@demo.com`, 'administrativo', s.id);
  if (['vl', 'asc', 'cba'].includes(s.slug)) {
    const [n3, a3] = NOMBRES[ni++ % NOMBRES.length];
    s.carga = usuario(n3, a3, `carga.${s.slug}@demo.com`, 'carga', s.id);
  }
}
const [VL, CBA, ASC, COS, BAG, NORTE, SUR] = SEDES;

// ── Proveedores (base única) ────────────────────────────────────────────────
const P = {};
for (const [k, razon, c, cond, pref = '30'] of [
  ['starlink', 'Starlink Argentina SRL', 71794356, 'ri'], ['telecom', 'Telecom Argentina SA', 63945373, 'ri'],
  ['camuzzi', 'Camuzzi Gas Pampeana SA', 65786206, 'ri'], ['edenor', 'Edenor SA', 65511620, 'ri'],
  ['aysa', 'Agua y Saneamientos Argentinos SA', 70956507, 'ri'], ['epec', 'EPEC Empresa Provincial de Energía de Córdoba', 99901483, 'exento'],
  ['vivero', 'Vivero Los Álamos', 23456781, 'monotributo', '20'], ['ferreteria', 'Ferretería Industrial Norte SRL', 71234560, 'ri'],
  ['alimentos', 'Distribuidora de Alimentos del Plata SA', 70888123, 'ri'], ['blanqueria', 'Blanquería Hotelera SRL', 71456780, 'ri'],
  ['remis', 'Remises Costanera', 28765432, 'monotributo', '27'], ['piletas', 'Piletas y Bombas SRL', 71600222, 'ri'],
  ['contable', 'Estudio Contable Ríos & Asociados', 71700333, 'ri'], ['ypf', 'Estación de Servicio Ruta 8 SRL', 71800444, 'ri'],
  ['limpieza', 'Limpieza Integral Zona Norte SRL', 71900555, 'ri'], ['jardinero', 'Ramón Acuña (jardinería)', 20111222, 'monotributo', '20'],
  ['muebles', 'Muebles y Equipamiento Hotelero SA', 70333444, 'ri'], ['tenis', 'Canchas & Polvo de Ladrillo SRL', 71222333, 'ri'],
  ['municipio', 'Municipalidad (tasas)', 99912345, 'exento'], ['eventos', 'Catering y Eventos del Sur SRL', 71333555, 'ri']
]) {
  const actor = ['starlink', 'telecom', 'camuzzi', 'edenor', 'aysa'].includes(k) ? tesorero : VL.adm;
  P[k] = proveedores.alta(actor, { cuit: cuit(c, pref), razon_social: razon, condicion_iva: cond, confirmar_similar: true }).proveedor;
}

const R = Object.fromEntries(db.prepare('SELECT id, nombre FROM rubros').all().map(r => [r.nombre, r.id]));

// ── Plata ───────────────────────────────────────────────────────────────────
fondos.ingresoCentral(tesorero, { importe: $(800000000), fecha: fechaAnt(1), saldo_inicial: true, concepto: 'Saldo inicial de la cuenta de la Central' });
fondos.asignar(tesorero, { periodo: ANTERIOR, fecha: fechaAnt(1), items: SEDES.map((s, i) => ({ sede_id: s.id, importe: $(s.fondo), referencia: `TRF-${ANTERIOR.replace('-', '')}-${String(i + 1).padStart(3, '0')}` })) });

let caeN = 0;
const nuevoCae = () => `7${String(4100000000000 + (++caeN) * 7919 + entre(0, 999)).padStart(13, '0')}`;
const numeros = {};
function cargar(actor, s, { prov, rubro, monto, fecha, medio = 'transferencia', tipo = 'factura_b', sinCae = false, desc = null, sol = null, ret = null, central: pagaCentral = false, adjunto = false }) {
  const n = numeros[prov] = (numeros[prov] || entre(100, 3000)) + 1;
  const conNumero = !['ticket', 'recibo'].includes(tipo) || !sinCae;
  return gastos.registrar(actor, {
    pagado_por: pagaCentral ? 'central' : 'sede', sede_id: s.id, fecha_pago: fecha, fecha_comprobante: fecha,
    proveedor_id: P[prov].id, tipo_comprobante: tipo, punto_venta: conNumero ? (tipo === 'factura_a' ? 2 : 4) : null, numero: conNumero ? n : null,
    cae: sinCae ? null : nuevoCae(), cae_vto: sinCae ? null : fechaAnt(28) > fecha ? fechaAnt(28) : fecha,
    cuit_receptor: tipo === 'factura_a' ? db.prepare(`SELECT valor FROM config WHERE clave = 'circulo_cuit'`).get().valor : null,
    rubro_id: R[rubro], medio: pagaCentral ? 'transferencia' : medio, bruto: $(monto), descripcion: desc, solicitud_id: sol,
    retenciones: ret || [], adjunto_pendiente: adjunto
  });
}

// Pone fecha de alta y resolución realistas a las solicitudes (la bitácora de estados queda con la fecha real).
function fechar(id, creado, resuelto = null) {
  db.prepare('UPDATE solicitudes SET creado_en = ?, resuelto_en = COALESCE(?, resuelto_en), periodo = ? WHERE id = ?')
    .run(`${creado} 13:00:00`, resuelto ? `${resuelto} 15:30:00` : null, creado.slice(0, 7), id);
}

// ── Mes anterior · Vicente López (la sede modelo, mes completo) ─────────────
fondos.moverEfectivo(VL.adm, 'extraccion', { importe: $(400000), fecha: fechaAnt(2), nota: 'Caja chica primera quincena' });
fondos.moverEfectivo(VL.adm, 'extraccion', { importe: $(300000), fecha: fechaAnt(16), nota: 'Caja chica segunda quincena' });

// Fijos (servicios): sin solicitud aunque superen los topes. Los grandes los registra el administrativo.
cargar(VL.adm, VL, { prov: 'edenor', rubro: 'Luz', monto: 2847350.4, fecha: fechaAnt(8), tipo: 'factura_a', desc: 'Luz del hotel y canchas, período anterior' });
cargar(VL.adm, VL, { prov: 'camuzzi', rubro: 'Gas', monto: 1938200, fecha: fechaAnt(9), tipo: 'factura_a', desc: 'Gas: cocina del restaurante y calefacción' });
cargar(VL.adm, VL, { prov: 'aysa', rubro: 'Agua', monto: 612400, fecha: fechaAnt(12), tipo: 'factura_a' });
cargar(VL.adm, VL, { prov: 'starlink', rubro: 'Internet', monto: 458000, fecha: fechaAnt(5), tipo: 'factura_a', desc: 'Internet satelital del hotel' });
cargar(VL.carga, VL, { prov: 'telecom', rubro: 'Telefonía', monto: 186500, fecha: fechaAnt(14), tipo: 'factura_a' });

// Caja chica por transferencia (≤ $ 320.000) y en efectivo (≤ $ 40.000).
const cajaChica = [
  ['vivero', 'Jardineros', 'Plantines y tierra para canteros'], ['ferreteria', 'Edilicio', 'Materiales de plomería'],
  ['alimentos', 'Racionamiento / alimentos', 'Mercadería restaurante'], ['alimentos', 'Racionamiento / alimentos', 'Mercadería restaurante'],
  ['alimentos', 'Racionamiento / alimentos', 'Lácteos y panificados'], ['tenis', 'Canchas de tenis', 'Polvo de ladrillo cancha 2'],
  ['ferreteria', 'Canchas de pádel', 'Reposición de redes de pádel'], ['blanqueria', 'Blanquería', 'Toallas para la pileta'],
  ['muebles', 'Amenities', 'Amenities de habitaciones'], ['ypf', 'Combustibles', 'Nafta para el tractor y la camioneta'],
  ['ferreteria', 'Maquinaria (tractor)', 'Repuestos cortadora de césped'], ['eventos', 'Eventos y protocolo', 'Vino de honor aniversario']
];
cajaChica.forEach(([prov, rubro, desc], i) => {
  cargar(i % 3 ? VL.adm : VL.carga, VL, { prov, rubro, monto: redondo(entre(45000, 318000)), fecha: fechaAnt(3 + i * 2), desc, adjunto: i === 4 });
});
const efectivo = [
  ['remis', 'Movilidad (remís)', 'Remís a la Sede Central con documentación'], ['ferreteria', 'Edilicio', 'Lamparitas y cinta'],
  ['vivero', 'Jardineros', 'Semillas de césped'], ['remis', 'Movilidad (remís)', 'Traslado de personal'],
  ['alimentos', 'Racionamiento / alimentos', 'Compra de urgencia: hielo y frutas'], ['ferreteria', 'Pileta', 'Cloro y pastillas'],
  ['remis', 'Movilidad (remís)', 'Remís al banco']
];
efectivo.forEach(([prov, rubro, desc], i) => {
  cargar(VL.carga, VL, { prov, rubro, monto: redondo(entre(6000, 39500)), fecha: fechaAnt(4 + i * 3), medio: 'efectivo', tipo: i % 2 ? 'ticket' : 'factura_c', sinCae: i % 2 === 1, desc });
});
// Un gasto que nadie supo describir: N/D.
cargar(VL.carga, VL, { prov: 'ferreteria', rubro: 'N/D – sin descripción', monto: 18700, fecha: fechaAnt(19), medio: 'efectivo', tipo: 'ticket', sinCae: true, desc: 'Ticket sin detalle' });
// Jardinero monotributista, mensual.
cargar(VL.adm, VL, { prov: 'jardinero', rubro: 'Jardineros', monto: 295000, fecha: fechaAnt(30), tipo: 'factura_c', desc: 'Mantenimiento de parque, mes completo' });

// Con solicitud: la bomba de la pileta (paga la sede, con retenciones) y colchones (paga la Central directo).
const bomba = solicitudes.crear(VL.jefe, { descripcion: 'Se rompió la bomba de la pileta. Presupuesto de Piletas y Bombas SRL.', monto_estimado: $(400000), proveedor_id: P.piletas.id, rubro_id: R.Pileta, medio_previsto: 'transferencia' });
solicitudes.resolver(tesorero, bomba, { estado: 'aprobada', quien_paga: 'sede', comentario: 'Aprobado. Pagar con el fondo.' });
fechar(bomba, fechaAnt(6), fechaAnt(6));
cargar(VL.adm, VL, { prov: 'piletas', rubro: 'Pileta', monto: 398000, fecha: fechaAnt(8), tipo: 'factura_a', sol: bomba, desc: 'Bomba nueva y mano de obra',
  ret: [{ impuesto: 'ganancias', alicuota_id: alic.ganancias }, { impuesto: 'iibb', alicuota_id: alic['iibb_Buenos Aires'] }] });

const limpieza = solicitudes.crear(VL.jefe, { descripcion: 'Servicio de limpieza del hotel, mes completo (contrato mensual).', monto_estimado: $(3250000), proveedor_id: P.limpieza.id, rubro_id: R.Limpieza });
solicitudes.resolver(tesorero, limpieza, { estado: 'aprobada', quien_paga: 'sede' });
fechar(limpieza, fechaAnt(2), fechaAnt(3));
cargar(VL.adm, VL, { prov: 'limpieza', rubro: 'Limpieza', monto: 3250000, fecha: fechaAnt(29), tipo: 'factura_a', sol: limpieza,
  ret: [{ impuesto: 'iva', alicuota_id: alic.iva }, { impuesto: 'ganancias', alicuota_id: alic.ganancias }, { impuesto: 'suss', alicuota_id: alic.suss }] });

const colchones = solicitudes.crear(VL.jefe, { descripcion: 'Reposición de 12 colchones del ala norte del hotel.', monto_estimado: $(2500000), proveedor_id: P.muebles.id, rubro_id: R['Equipamiento y mobiliario'] });
solicitudes.resolver(tesorero, colchones, { estado: 'aprobada', quien_paga: 'central', comentario: 'Lo paga la Central directo al proveedor.' });
fechar(colchones, fechaAnt(10), fechaAnt(11));
cargar(tesorero, VL, { prov: 'muebles', rubro: 'Equipamiento y mobiliario', monto: 2480000, fecha: fechaAnt(17), tipo: 'factura_a', sol: colchones, central: true,
  ret: [{ impuesto: 'ganancias', alicuota_id: alic.ganancias }] });

// Honorarios del contador (fijo no, caja chica sí) e impuestos y tasas.
cargar(VL.adm, VL, { prov: 'contable', rubro: 'Honorarios', monto: 285000, fecha: fechaAnt(22), tipo: 'factura_a' });
cargar(VL.adm, VL, { prov: 'municipio', rubro: 'Impuestos y tasas', monto: 154300, fecha: fechaAnt(15), tipo: 'recibo', sinCae: true, desc: 'Tasa de seguridad e higiene' });

// Fondos extra autorizados por el Presidente.
const extra = fondos.pedirExtra(VL.jefe, { importe: $(2000000), justificacion: 'Arreglo urgente del techo del salón de eventos antes del fin de semana largo.' });
fondos.resolverExtra(presidente, extra, { autorizar: true, comentario: 'Autorizado por la urgencia.' });

// ── Mes anterior · resto de las sedes ───────────────────────────────────────
const OTRAS = [
  [CBA, 'epec', 'Córdoba'], [ASC, 'epec', 'Córdoba'], [COS, 'epec', 'Córdoba'], [BAG, 'edenor', 'Buenos Aires'], [NORTE, 'edenor', 'Buenos Aires'], [SUR, 'edenor', 'Buenos Aires']
];
for (const [s, luz] of OTRAS) {
  const cargador = s.carga || s.adm;
  fondos.moverEfectivo(s.adm, 'extraccion', { importe: $(150000), fecha: fechaAnt(3) });
  cargar(s.adm, s, { prov: luz, rubro: 'Luz', monto: redondo(entre(600000, 1600000)), fecha: fechaAnt(9), tipo: 'factura_a' });
  cargar(s.adm, s, { prov: 'starlink', rubro: 'Internet', monto: 98000, fecha: fechaAnt(6), tipo: 'factura_a' });
  cargar(cargador, s, { prov: 'alimentos', rubro: 'Racionamiento / alimentos', monto: redondo(entre(120000, 310000)), fecha: fechaAnt(11) });
  cargar(cargador, s, { prov: 'ferreteria', rubro: 'Edilicio', monto: redondo(entre(30000, 240000)), fecha: fechaAnt(17) });
  cargar(cargador, s, { prov: 'remis', rubro: 'Movilidad (remís)', monto: redondo(entre(8000, 35000)), fecha: fechaAnt(21), medio: 'efectivo', tipo: 'ticket', sinCae: true });
  cargar(cargador, s, { prov: 'vivero', rubro: 'Jardineros', monto: redondo(entre(40000, 180000)), fecha: fechaAnt(25), tipo: 'factura_c' });
}
// La Sede Sur tiene demasiados N/D: dispara la alerta.
cargar(SUR.adm, SUR, { prov: 'ferreteria', rubro: 'N/D – sin descripción', monto: 96000, fecha: fechaAnt(26), medio: 'transferencia', desc: 'Sin detalle en la factura' });

// ── Rendiciones del mes anterior ────────────────────────────────────────────
for (const s of [CBA, ASC, COS]) {
  rendiciones.cerrar(s.jefe, s.id, ANTERIOR, { confirmo: true });
  rendiciones.enviar(s.jefe, s.id, ANTERIOR);
}
// Cosquín: la Central la reabre porque faltaba un gasto; la sede corrige y vuelve a enviar (versión 2).
rendiciones.reabrir(tesorero, COS.id, ANTERIOR, 'Falta la factura de gas de la última semana');
cargar(COS.adm, COS, { prov: 'camuzzi', rubro: 'Gas', monto: 412000, fecha: fechaAnt(28), tipo: 'factura_a' });
rendiciones.cerrar(COS.jefe, COS.id, ANTERIOR, { confirmo: true });
rendiciones.enviar(COS.jefe, COS.id, ANTERIOR);
// Bahía Agradable: firmada pero todavía sin enviar. Vicente López, Norte y Sur: abiertas (VL para cerrarla en la demo).
rendiciones.cerrar(BAG.jefe, BAG.id, ANTERIOR, { confirmo: true });

// ── Mes en curso ────────────────────────────────────────────────────────────
const corteAvisos = db.prepare('SELECT COALESCE(MAX(id), 0) n FROM notificaciones').get().n;
fondos.ingresoCentral(tesorero, { importe: $(450000000), fecha: fechaAct(1), concepto: 'Transferencia de fondos de la Fuerza' });
fondos.asignar(tesorero, { periodo: ACTUAL, fecha: fechaAct(1), items: SEDES.filter(s => s !== SUR).map((s, i) => ({ sede_id: s.id, importe: $(s.fondo), referencia: `TRF-${ACTUAL.replace('-', '')}-${String(i + 1).padStart(3, '0')}` })) });

fondos.moverEfectivo(VL.adm, 'extraccion', { importe: $(350000), fecha: fechaAct(2), nota: 'Caja chica' });
const edenorOct = cargar(VL.adm, VL, { prov: 'edenor', rubro: 'Luz', monto: 2610900, fecha: fechaAct(7), tipo: 'factura_a', desc: 'Luz, factura del mes' });
cargar(VL.adm, VL, { prov: 'starlink', rubro: 'Internet', monto: 458000, fecha: fechaAct(5), tipo: 'factura_a', adjunto: true });
cargar(VL.carga, VL, { prov: 'alimentos', rubro: 'Racionamiento / alimentos', monto: 214500, fecha: fechaAct(3), desc: 'Mercadería restaurante', adjunto: true });
cargar(VL.carga, VL, { prov: 'remis', rubro: 'Movilidad (remís)', monto: 12500, fecha: fechaAct(4), medio: 'efectivo', tipo: 'ticket', sinCae: true });
cargar(VL.carga, VL, { prov: 'ferreteria', rubro: 'Canchas de pádel', monto: 86000, fecha: fechaAct(6), desc: 'Pelotas y grips' });
cargar(VL.adm, VL, { prov: 'vivero', rubro: 'Canchas de golf', monto: 176000, fecha: fechaAct(8), tipo: 'factura_c', desc: 'Fertilizante green' });

// Un intento de cargar dos veces la misma factura de luz (mismo CAE): se rechaza y queda registrado.
const original = db.prepare('SELECT * FROM gastos WHERE id = ?').get(edenorOct.id);
try {
  gastos.registrar(VL.adm, { fecha_pago: fechaAct(9), proveedor_id: P.edenor.id, tipo_comprobante: 'factura_a', punto_venta: original.punto_venta, numero: original.numero,
    cae: original.cae, rubro_id: R.Luz, medio: 'transferencia', bruto: original.bruto });
} catch (e) { if (e.codigo !== 'DUPLICADO') throw e; }

// Solicitudes en cada estado.
const techo = solicitudes.crear(VL.jefe, { descripcion: 'Reparación de la membrana del techo del quincho (filtraciones).', monto_estimado: $(1850000), rubro_id: R.Edilicio, medio_previsto: 'transferencia' });
const tractor = solicitudes.crear(VL.jefe, { descripcion: 'Tractor cortacésped nuevo para la cancha de golf: el actual no tiene arreglo.', monto_estimado: $(14200000), rubro_id: R['Maquinaria (tractor)'] });
solicitudes.resolver(tesorero, tractor, { estado: 'en_revision', comentario: 'Monto alto: lo consulto con el Presidente.' });
fechar(tractor, fechaAct(6), fechaAct(7));
const sabanas = solicitudes.crear(VL.jefe, { descripcion: 'Juego de sábanas y acolchados para 20 habitaciones.', monto_estimado: $(1640000), proveedor_id: P.blanqueria.id, rubro_id: R['Blanquería'] });
solicitudes.resolver(tesorero, sabanas, { estado: 'aprobada', quien_paga: 'central', comentario: 'Lo pagamos desde la Central.' });
fechar(sabanas, fechaAct(4), fechaAct(5));
const pintura = solicitudes.crear(CBA.jefe, { descripcion: 'Pintura del salón principal antes del aniversario.', monto_estimado: $(950000), rubro_id: R.Edilicio, medio_previsto: 'transferencia' });
solicitudes.resolver(tesorero, pintura, { estado: 'aprobada', quien_paga: 'sede' });
fechar(pintura, fechaAct(3), fechaAct(3));
const aire = solicitudes.crear(ASC.jefe, { descripcion: 'Aire acondicionado para el comedor.', monto_estimado: $(3200000), rubro_id: R['Equipamiento y mobiliario'] });
solicitudes.resolver(tesorero, aire, { estado: 'rechazada', comentario: 'No está previsto este año. Volver a pedir en el presupuesto de verano.' });
fechar(aire, fechaAct(2), fechaAct(3));
const parrilla = solicitudes.crear(BAG.jefe, { descripcion: 'Arreglo de la parrilla del restaurante (rejilla y ladrillos refractarios).', monto_estimado: $(520000), rubro_id: R.Edilicio });
void techo; void parrilla;

// Pedido de fondos extra pendiente (lo decide el Presidente en la demo).
fondos.pedirExtra(ASC.jefe, { importe: $(2000000), justificacion: 'Se adelanta la temporada de verano: refuerzo de personal de limpieza y mercadería.' });

// Los avisos del mes anterior quedan leídos; los del mes en curso, sin leer.
db.prepare('UPDATE notificaciones SET leida = 1 WHERE id <= ?').run(corteAvisos);

const cuenta = (t) => db.prepare(`SELECT COUNT(*) n FROM ${t}`).get().n;
console.log(`Demo lista · mes anterior ${ANTERIOR} · mes en curso ${ACTUAL}`);
console.log(`  ${cuenta('sedes')} sedes · ${cuenta('usuarios')} usuarios · ${cuenta('proveedores')} proveedores · ${cuenta('gastos')} gastos · ${cuenta('solicitudes')} solicitudes · ${cuenta('auditoria')} registros de auditoría`);
console.log('  Contraseña de todos los usuarios: demo1234');
console.log('  soporte@venturebyte.com.ar (superadmin) · tesoreria@demo.com · presidente@demo.com');
console.log('  jefe.vl@demo.com · admin.vl@demo.com · carga.vl@demo.com (Vicente López) · jefe.cba@demo.com · jefe.asc@demo.com …');
