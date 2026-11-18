// Tests del Excel de liquidaciones para el módulo de facturación (una fila por concepto de cada cupón).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const os = require('os');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'a25-liq-'));
process.env.DATA_DIR = dir;
process.env.DB_PATH = path.join(dir, 'test.sqlite');
process.env.ADMIN_PASSWORD = 'admin-test-123';

const { db } = require('../server/db');
const util = require('../server/util');
const flota = require('../server/services/flota');
const vuelos = require('../server/services/vuelos');
const cierres = require('../server/services/cierres');
const ledger = require('../server/services/ledger');
const liquidaciones = require('../server/services/liquidaciones');
const { serieFecha } = require('../server/services/xlsx');

const admin = { id: 1, rol: 'admin' };
const INICIO = util.sumarMeses(util.periodoActual(), -2);
const MES2 = util.sumarMeses(INICIO, 1);
const dia = (periodo, d) => `${periodo}-${String(d).padStart(2, '0')}`;

function persona(nombre, apellido, { rol = 'piloto', dni = null, instructor = false } = {}) {
  const externo = rol === 'externo';
  return Number(db.prepare(`INSERT INTO usuarios (nombre, apellido, email, dni, rol, es_instructor, password_hash, debe_cambiar_password)
    VALUES (?, ?, ?, ?, ?, ?, ?, 0)`).run(nombre, apellido, externo ? null : `${nombre.toLowerCase()}@test.com`, dni, rol, instructor ? 1 : 0, externo ? null : 'x').lastInsertRowid);
}

// ── Lector mínimo de .xlsx: abre el zip por su directorio central y lee la hoja ──
function descomprimir(buf) {
  const fin = buf.lastIndexOf(Buffer.from([0x50, 0x4B, 0x05, 0x06]));
  assert.ok(fin >= 0, 'el archivo no termina como un zip');
  const archivos = {};
  let p = buf.readUInt32LE(fin + 16);
  for (let i = 0; i < buf.readUInt16LE(fin + 10); i++) {
    assert.equal(buf.readUInt32LE(p), 0x02014B50);
    const comprimido = buf.readUInt32LE(p + 20);
    const largoNombre = buf.readUInt16LE(p + 28);
    const local = buf.readUInt32LE(p + 42);
    const nombre = buf.toString('utf8', p + 46, p + 46 + largoNombre);
    const datos = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
    archivos[nombre] = zlib.inflateRawSync(buf.subarray(datos, datos + comprimido)).toString('utf8');
    p += 46 + largoNombre + buf.readUInt16LE(p + 30) + buf.readUInt16LE(p + 32);
  }
  return archivos;
}

const sinEscape = (s) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&amp;/g, '&');

// Devuelve las filas como objetos { columna: valor }: texto como string, números y fechas como number, vacío como null.
function leer(buf) {
  const zip = descomprimir(buf);
  assert.match(zip['xl/workbook.xml'], /<sheet name="Liquidaciones"/);
  const filas = [...zip['xl/worksheets/sheet1.xml'].matchAll(/<row r="\d+"[^>]*>(.*?)<\/row>/gs)].map(([, fila]) =>
    [...fila.matchAll(/<c r="[A-Z]+\d+" s="\d+"(?: t="inlineStr")?(?:\/>|>(?:<is><t[^>]*>(.*?)<\/t><\/is>|<v>(.*?)<\/v>)<\/c>)/gs)]
      .map(([, texto, numero]) => (texto != null ? sinEscape(texto) : numero != null ? Number(numero) : null)));
  const [titulos, ...datos] = filas;
  return { titulos, filas: datos.map(f => Object.fromEntries(titulos.map((t, i) => [t, f[i]]))) };
}

const exportar = (periodo) => {
  const cierre = db.prepare('SELECT id FROM cierres WHERE periodo = ?').get(periodo);
  const { archivo, contenido } = liquidaciones.exportar(cierre.id);
  return { archivo, ...leer(contenido) };
};
const delSocio = (filas, nombre) => filas.filter(f => f.socio_nombre === nombre);
const redondo = (n) => Math.round(n * 100);

// La validación que hace el módulo de facturación, cupón por cupón.
function validar(filas) {
  const cupones = new Map();
  for (const f of filas) cupones.set(f.cupon_numero, [...(cupones.get(f.cupon_numero) || []), f]);
  for (const [numero, items] of cupones) {
    const suma = items.reduce((s, f) => s + redondo(f.item_importe), redondo(items[0].saldo_anterior));
    assert.equal(suma, redondo(items[0].total_cupon), `cupón ${numero}: saldo anterior + ítems = total`);
    for (const f of items) {
      assert.equal(f.total_cupon, items[0].total_cupon);
      assert.equal(f.saldo_anterior, items[0].saldo_anterior);
    }
  }
  return cupones.size;
}

let ana, beto, taller, inst, matricula;

test('preparación: un mes con vuelos, cuota social, un saldo inicial, un ajuste y un pago a cuenta', () => {
  db.prepare(`UPDATE config SET valor = ? WHERE clave = 'periodo_inicio'`).run(INICIO);
  db.prepare(`UPDATE servicios SET precio = 700000 WHERE codigo = 'cuota_social'`).run();
  flota.nuevaTarifa(1, { tipo: 'solo', precio_hora: 19800000, vigente_desde: '2020-01-01' }, admin);
  flota.nuevaTarifa(1, { tipo: 'instruccion', precio_hora: 23000000, vigente_desde: '2020-01-01' }, admin);
  matricula = db.prepare('SELECT matricula FROM aviones WHERE id = 1').get().matricula;

  ana = persona('Ana', 'Gómez', { dni: '30.111.222' });
  beto = persona('Beto', 'Pérez');                                             // sin documento cargado
  inst = persona('Carlos', 'Ruiz', { instructor: true, dni: '20123456' });
  taller = persona('Taller', 'del Salado <SRL> & Cía', { rol: 'externo', dni: '30-71234567-8' });

  vuelos.crear({ avion_id: 1, piloto_id: ana, fecha: dia(INICIO, 4), hora_salida: '10:00', hora_llegada: '10:54' }, admin);   // 0,9 h
  vuelos.crear({ avion_id: 1, piloto_id: ana, fecha: dia(INICIO, 12), hora_salida: '10:00', hora_llegada: '11:12', con_instructor: true, instructor_id: inst }, admin);   // 1,2 h
  ledger.registrar({ usuario_id: taller, tipo: 'saldo_inicial', concepto: 'Saldo inicial: hangaraje adeudado', importe: 5000000, fecha: dia(INICIO, 1), creado_por: 1 });
  ledger.registrar({ usuario_id: beto, tipo: 'ajuste', concepto: 'Ajuste: vuelo de traslado', importe: 12800000, fecha: dia(INICIO, 20), creado_por: 1 });
  ledger.registrar({ usuario_id: beto, tipo: 'pago', concepto: 'Pago por transferencia', importe: -3000000, fecha: dia(INICIO, 25), medio: 'transferencia', creado_por: 1 });
  // Un pago mal cargado y anulado en el mismo mes no figura en el cupón: tampoco en el Excel.
  const error = ledger.registrar({ usuario_id: beto, tipo: 'pago', concepto: 'Pago por efectivo', importe: -100000, fecha: dia(INICIO, 26), medio: 'efectivo', creado_por: 1 });
  ledger.anular(error.id, 'Se cargó dos veces', 1);

  cierres.cerrar(INICIO, admin);
});

test('el Excel respeta el formato del módulo: hoja, columnas y un renglón por concepto', () => {
  const { archivo, titulos, filas } = exportar(INICIO);
  assert.equal(archivo, `liquidaciones-${INICIO}.xlsx`);
  assert.deepEqual(titulos, ['periodo', 'cupon_numero', 'fecha_cierre', 'vencimiento', 'socio_numero', 'socio_nombre', 'doc_tipo', 'doc_numero',
    'condicion_iva', 'email', 'saldo_anterior', 'item_fecha', 'item_tipo', 'item_concepto', 'item_horas', 'item_precio_hora', 'item_importe',
    'total_cupon', 'estado_pago']);

  // Ana: dos vuelos y la cuota social. Los datos del cupón y del socio se repiten en cada renglón.
  const deAna = delSocio(filas, 'Ana Gómez');
  assert.deepEqual(deAna.map(f => f.item_tipo), ['vuelo', 'vuelo', 'servicio']);
  const cupon = db.prepare('SELECT * FROM cupones WHERE usuario_id = ?').get(ana);
  for (const f of deAna) {
    assert.equal(f.periodo, INICIO);
    assert.equal(f.cupon_numero, cupon.numero);
    assert.equal(f.fecha_cierre, serieFecha(util.hoy()));
    assert.equal(f.vencimiento, serieFecha(cupon.vencimiento));
    assert.equal(f.doc_tipo, 'DNI');
    assert.equal(f.doc_numero, '30111222');                  // sin puntos, como texto
    assert.equal(f.email, 'ana@test.com');
    assert.equal(f.socio_numero, null);
    assert.equal(f.condicion_iva, null);
    assert.equal(f.saldo_anterior, 0);
    assert.equal(f.total_cupon, 178200 + 276000 + 7000);
    assert.equal(f.estado_pago, 'Pendiente');
  }
  const [solo, conInstructor, cuota] = deAna;
  assert.deepEqual([solo.item_fecha, solo.item_concepto, solo.item_horas, solo.item_precio_hora, solo.item_importe],
    [serieFecha(dia(INICIO, 4)), `${matricula} sin instructor`, 0.9, 198000, 178200]);
  assert.deepEqual([conInstructor.item_concepto, conInstructor.item_horas, conInstructor.item_precio_hora, conInstructor.item_importe],
    [`${matricula} con instructor Carlos Ruiz`, 1.2, 230000, 276000]);
  assert.match(cuota.item_concepto, /Cuota social de /);
  assert.deepEqual([cuota.item_horas, cuota.item_precio_hora, cuota.item_importe], [null, null, 7000]);
  assert.equal(cuota.item_fecha, serieFecha(util.ultimoDia(INICIO)));

  // Beto, sin documento: los campos van vacíos. El pago a cuenta va en negativo y el anulado no aparece.
  const deBeto = delSocio(filas, 'Beto Pérez');
  assert.deepEqual(deBeto.map(f => [f.item_tipo, f.item_importe]), [['ajuste', 128000], ['pago', -30000], ['servicio', 7000]]);
  assert.deepEqual([deBeto[0].doc_tipo, deBeto[0].doc_numero], [null, null]);
  assert.equal(deBeto[0].total_cupon, 105000);

  // El externo con CUIT: el saldo inicial se informa como ajuste y el nombre viaja sin romper el XML.
  const deTaller = delSocio(filas, 'Taller del Salado <SRL> & Cía');
  assert.deepEqual(deTaller.map(f => [f.doc_tipo, f.doc_numero, f.item_tipo, f.item_concepto, f.item_importe]),
    [['CUIT', '30712345678', 'ajuste', 'Saldo inicial: hangaraje adeudado', 50000]]);

  // El instructor no voló como piloto: sólo paga la cuota.
  assert.deepEqual(delSocio(filas, 'Carlos Ruiz').map(f => f.item_tipo), ['servicio']);
  assert.equal(validar(filas), 4);
  assert.deepEqual(filas.map(f => f.cupon_numero), [...filas.map(f => f.cupon_numero)].sort());   // ordenado por cupón
});

test('el estado de pago acompaña lo que se cobró después del cierre', () => {
  ledger.registrar({ usuario_id: ana, tipo: 'pago', concepto: 'Pago por transferencia', importe: -46120000, fecha: util.hoy(), medio: 'transferencia', creado_por: 1 });
  ledger.registrar({ usuario_id: beto, tipo: 'pago', concepto: 'Pago por efectivo', importe: -5000000, fecha: util.hoy(), medio: 'efectivo', creado_por: 1 });   // parcial
  const { filas } = exportar(INICIO);
  assert.deepEqual([...new Set(delSocio(filas, 'Ana Gómez').map(f => f.estado_pago))], ['Pagado']);
  assert.deepEqual([...new Set(delSocio(filas, 'Beto Pérez').map(f => f.estado_pago))], ['Pendiente']);
  validar(filas);                                            // los totales del cupón no cambian por cobrar después
});

test('al mes siguiente: el saldo arrastrado no es un renglón y los pagos del mes cierran la cuenta', () => {
  cierres.cerrar(MES2, admin);
  const { filas } = exportar(MES2);
  assert.ok(filas.every(f => f.periodo === MES2));
  // Ana pagó octubre en noviembre: saldo anterior, el pago en negativo y la cuota nueva.
  const deAna = delSocio(filas, 'Ana Gómez');
  assert.deepEqual(deAna.map(f => [f.item_tipo, f.item_importe]), [['pago', -461200], ['servicio', 7000]]);
  assert.deepEqual([deAna[0].saldo_anterior, deAna[0].total_cupon, deAna[0].estado_pago], [461200, 7000, 'Pendiente']);
  // El externo sólo arrastra deuda: tiene cupón, pero ningún concepto para facturar.
  assert.equal(db.prepare('SELECT COUNT(*) n FROM cupones cu JOIN cierres ci ON ci.id = cu.cierre_id WHERE cu.usuario_id = ? AND ci.periodo = ?').get(taller, MES2).n, 1);
  assert.equal(delSocio(filas, 'Taller del Salado <SRL> & Cía').length, 0);
  validar(filas);

  // El Excel del mes anterior se puede volver a bajar: Ana quedó pagada, el externo y Beto no.
  const anterior = exportar(INICIO).filas;
  const estado = (nombre) => delSocio(anterior, nombre)[0].estado_pago;
  assert.deepEqual([estado('Ana Gómez'), estado('Beto Pérez'), estado('Taller del Salado <SRL> & Cía')], ['Pagado', 'Pendiente', 'Pendiente']);
  validar(anterior);
});

test('un cierre que no existe da el error de siempre', () => {
  assert.throws(() => liquidaciones.exportar(9999), /Cierre inexistente/);
});
