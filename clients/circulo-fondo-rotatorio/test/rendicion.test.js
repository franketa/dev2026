const test = require('node:test');
const assert = require('node:assert/strict');
const { db, vl, actores: a, cuit, rubro, PERIODO, ANTERIOR } = require('./ayuda');
const fondos = require('../server/services/fondos');
const proveedores = require('../server/services/proveedores');
const gastos = require('../server/services/gastos');
const rendiciones = require('../server/services/rendiciones');
const { canonico, hoy, ultimoDia } = require('../server/util');

const $ = (pesos) => pesos * 100;
const F = (dia) => `${ANTERIOR}-${String(dia).padStart(2, '0')}`;
let prov; let n = 0;

function gasto(datos) {
  return gastos.registrar(a.administrativo, {
    fecha_pago: F(10), proveedor_id: prov.id, tipo_comprobante: 'factura_c', punto_venta: 2, numero: ++n, cae: String(71000000000000 + n),
    rubro_id: rubro('Edilicio'), medio: 'transferencia', bruto: $(50000), ...datos
  });
}

test('escenario: fondo del mes y algunos gastos', () => {
  fondos.ingresoCentral(a.tesorero, { importe: $(800000000), fecha: F(1), saldo_inicial: true });
  fondos.asignar(a.tesorero, { periodo: ANTERIOR, fecha: F(1), items: [{ sede_id: vl, importe: $(5000000) }] });
  prov = proveedores.alta(a.administrativo, { cuit: cuit(71555000), razon_social: 'Mantenimiento Integral SRL' }).proveedor;
  gasto({ bruto: $(120000) });
  gasto({ bruto: $(80000), rubro_id: rubro('Canchas de tenis') });
  gasto({ bruto: $(10000), rubro_id: rubro('N/D – sin descripción'), cae: null, tipo_comprobante: 'ticket', punto_venta: null, numero: null });
});

test('el resumen previo al cierre arma el listado por rubro con totales y saldo', () => {
  const e = rendiciones.estado(a.jefe, vl, ANTERIOR);
  const r = e.contenido.resumen;
  assert.equal(e.estado, 'abierta');
  assert.equal(r.fondo_recibido, $(5000000));
  assert.equal(r.total_gastos, $(210000));
  assert.equal(r.saldo_final.total, $(5000000 - 210000));
  assert.equal(r.cantidades.gastos, 3);
  assert.equal(r.cantidades.sin_cae, 1);
  assert.equal(r.cantidades.nd, 1);
  const mant = e.contenido.por_rubro.find(x => x.nombre === 'Mantenimiento');
  assert.equal(mant.subtotal, $(200000));
  assert.deepEqual(mant.subrubros.map(s => s.nombre).sort(), ['Canchas de tenis', 'Edilicio']);
});

test('sólo el jefe de la propia sede cierra y firma, con confirmación', () => {
  assert.throws(() => rendiciones.cerrar(a.administrativo, vl, ANTERIOR, { confirmo: true }), /jefe/);
  assert.throws(() => rendiciones.cerrar(a.jefeCba, vl, ANTERIOR, { confirmo: true }), /jefe de la sede/);
  assert.throws(() => rendiciones.cerrar(a.jefe, vl, ANTERIOR, {}), /Confirmá/);
  const r = rendiciones.cerrar(a.jefe, vl, ANTERIOR, { confirmo: true });
  assert.equal(r.version, 1);
  assert.match(r.hash, /^[0-9a-f]{64}$/);
  const v = db.prepare('SELECT * FROM rendicion_versiones WHERE hash = ?').get(r.hash);
  assert.equal(v.firmado_por, a.jefe.id);
  assert.ok(v.firmado_en);
});

test('el mes en curso no se cierra antes del último día', { skip: hoy() === ultimoDia(PERIODO) && 'hoy es el último día del mes' }, () => {
  gasto({ fecha_pago: `${PERIODO}-01`, bruto: $(1000) });
  assert.throws(() => rendiciones.cerrar(a.jefe, vl, PERIODO, { confirmo: true }), /todavía no terminó/);
});

test('período bloqueado después del cierre', () => {
  assert.throws(() => gasto({ bruto: $(1000) }), (e) => e.codigo === 'PERIODO_CERRADO');
  const g = db.prepare('SELECT * FROM gastos WHERE sede_id = ? AND periodo = ? LIMIT 1').get(vl, ANTERIOR);
  assert.throws(() => gastos.anular(a.jefe, g.id, 'intento'), /cerrada/);
  assert.throws(() => gastos.corregir(a.jefe, g.id, { descripcion: 'x', motivo: 'y' }), /cerrada/);
  assert.throws(() => fondos.moverEfectivo(a.jefe, 'extraccion', { importe: $(10), fecha: F(20) }), /Período cerrado/);
  // Aunque se intente directo en la base, el trigger lo rechaza.
  assert.throws(() => db.prepare('UPDATE gastos SET bruto = 1, neto = 1 WHERE id = ?').run(g.id), /Período cerrado/);
  // El adjunto sí puede terminar de subir (no es parte de lo firmado).
  db.prepare(`UPDATE gastos SET adjunto_estado = 'subido' WHERE id = ?`).run(g.id);
});

test('envío a la Central: queda la foto inmutable con su hash', () => {
  assert.throws(() => rendiciones.enviar(a.administrativo, vl, ANTERIOR), /jefe/);
  const { hash } = rendiciones.enviar(a.jefe, vl, ANTERIOR);
  const recibidas = rendiciones.recibidas(a.tesorero, {});
  assert.equal(recibidas.length, 1);
  assert.equal(recibidas[0].hash, hash);
  assert.ok(db.prepare(`SELECT 1 FROM notificaciones WHERE usuario_id = ? AND texto LIKE '%envió la rendición%'`).get(a.tesorero.id));
  const d = rendiciones.documento(a.tesorero, vl, ANTERIOR);
  assert.deepEqual(d.integridad, { foto_ok: true, datos_ok: true, hash });
  assert.equal(rendiciones.hashDe(d.contenido), hash);
  // La versión firmada y enviada no se puede tocar.
  assert.throws(() => db.prepare('UPDATE rendicion_versiones SET snapshot = ? WHERE hash = ?').run('{}', hash), /inmutable/);
  assert.throws(() => db.prepare('UPDATE rendicion_versiones SET enviado_en = ? WHERE hash = ?').run('2000-01-01', hash), /inmutable/);
  // La sede no ve la bandeja de la Central.
  assert.throws(() => rendiciones.recibidas(a.jefe, {}), /permiso/);
});

test('el hash detecta un cambio hecho por fuera del sistema', () => {
  const g = db.prepare('SELECT * FROM gastos WHERE sede_id = ? AND periodo = ? AND estado = ? LIMIT 1').get(vl, ANTERIOR, 'registrado');
  // Alguien con acceso a la base apaga el trigger y "dibuja" un importe.
  db.exec('DROP TRIGGER gastos_periodo_cerrado_upd');
  db.prepare('UPDATE gastos SET bruto = bruto + 100, neto = neto + 100 WHERE id = ?').run(g.id);
  const d = rendiciones.documento(a.tesorero, vl, ANTERIOR);
  assert.equal(d.integridad.foto_ok, true, 'la foto guardada sigue intacta');
  assert.equal(d.integridad.datos_ok, false, 'los datos de la base ya no dan esa foto');
  db.prepare('UPDATE gastos SET bruto = bruto - 100, neto = neto - 100 WHERE id = ?').run(g.id);
  assert.equal(rendiciones.documento(a.tesorero, vl, ANTERIOR).integridad.datos_ok, true);
});

test('reapertura: sólo la Central, con motivo, queda auditada y versionada', () => {
  assert.throws(() => rendiciones.reabrir(a.jefe, vl, ANTERIOR, 'quiero corregir'), /Sede Central/);
  assert.throws(() => rendiciones.reabrir(a.tesorero, vl, ANTERIOR, ''), /motivo/);
  const v1 = db.prepare('SELECT * FROM rendicion_versiones WHERE version = 1').get();
  rendiciones.reabrir(a.tesorero, vl, ANTERIOR, 'Falta una factura de luz');
  assert.equal(rendiciones.estado(a.jefe, vl, ANTERIOR).estado, 'abierta');
  const aud = db.prepare(`SELECT * FROM auditoria WHERE accion = 'rendicion.reapertura' ORDER BY id DESC LIMIT 1`).get();
  assert.equal(aud.usuario_id, a.tesorero.id);
  assert.equal(aud.motivo, 'Falta una factura de luz');
  assert.equal(JSON.parse(aud.antes).hash, v1.hash);

  // Se corrige, se vuelve a cerrar y enviar: versión 2. La 1 queda como estaba.
  const nuevo = gasto({ bruto: $(33000), rubro_id: rubro('Luz') });
  const r2 = rendiciones.cerrar(a.jefe, vl, ANTERIOR, { confirmo: true });
  rendiciones.enviar(a.jefe, vl, ANTERIOR);
  assert.equal(r2.version, 2);
  assert.notEqual(r2.hash, v1.hash);
  const v1despues = db.prepare('SELECT * FROM rendicion_versiones WHERE version = 1').get();
  assert.equal(v1despues.snapshot, v1.snapshot);
  assert.equal(v1despues.motivo_reapertura, 'Falta una factura de luz');
  const viejo = rendiciones.documento(a.tesorero, vl, ANTERIOR, 1);
  assert.equal(viejo.integridad.foto_ok, true);
  assert.ok(!viejo.contenido.pagado_por_sede.some(r => r.subrubros.some(s => s.gastos.some(x => x.id === nuevo.id))));
  assert.equal(canonico(JSON.parse(v1.snapshot)), v1.snapshot);
});
