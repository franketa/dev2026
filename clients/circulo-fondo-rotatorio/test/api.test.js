// Recorrido por HTTP: login, protección CSRF, alcance por sede, flujo de punta a punta y descargas.
const test = require('node:test');
const assert = require('node:assert/strict');
const { vl, cba, cuit, rubro, ANTERIOR } = require('./ayuda');
const app = require('../server/index');

let base; let servidor;
test.before(() => new Promise(ok => { servidor = app.listen(0, () => { base = `http://127.0.0.1:${servidor.address().port}`; ok(); }); }));
test.after(() => servidor.close());

const $ = (p) => p * 100;
async function sesion(email) {
  const r = await fetch(`${base}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-FR': '1' }, body: JSON.stringify({ email, password: 'prueba1234' }) });
  assert.equal(r.status, 200, `login ${email}`);
  const cookie = r.headers.get('set-cookie').split(';')[0];
  const llamar = async (metodo, ruta, cuerpo) => {
    const res = await fetch(`${base}${ruta}`, { method: metodo, headers: { Cookie: cookie, 'Content-Type': 'application/json', 'X-FR': '1' }, body: cuerpo ? JSON.stringify(cuerpo) : undefined });
    const tipo = res.headers.get('content-type') || '';
    return { status: res.status, tipo, datos: tipo.includes('json') ? await res.json() : Buffer.from(await res.arrayBuffer()) };
  };
  return { cookie, get: (r) => llamar('GET', r), post: (r, b = {}) => llamar('POST', r, b) };
}

test('sin sesión no hay API; con contraseña incorrecta no entra', async () => {
  assert.equal((await fetch(`${base}/api/gastos`)).status, 401);
  const r = await fetch(`${base}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-FR': '1' }, body: JSON.stringify({ email: 'jefe@prueba.com', password: 'mal' }) });
  assert.equal(r.status, 401);
});

test('escrituras sin el encabezado propio se rechazan (CSRF)', async () => {
  const s = await sesion('jefe@prueba.com');
  const r = await fetch(`${base}/api/solicitudes`, { method: 'POST', headers: { Cookie: s.cookie, 'Content-Type': 'application/json' }, body: '{}' });
  assert.equal(r.status, 403);
});

test('flujo completo: asignación, gasto, cierre, envío y bandeja de la Central', async () => {
  const tes = await sesion('tesorero@prueba.com');
  const jefe = await sesion('jefe@prueba.com');
  const adm = await sesion('administrativo@prueba.com');
  const otro = await sesion('jefecba@prueba.com');

  assert.equal((await tes.post('/api/central/ingresos', { importe: $(800000000), fecha: `${ANTERIOR}-01`, saldo_inicial: true })).status, 200);
  assert.equal((await tes.post('/api/central/asignacion', { periodo: ANTERIOR, fecha: `${ANTERIOR}-01`, items: [{ sede_id: vl, importe: $(1000000) }, { sede_id: cba, importe: $(500000) }] })).status, 200);

  const prov = (await adm.post('/api/proveedores', { cuit: cuit(30111222), razon_social: 'Proveedor de Prueba SRL' })).datos.proveedor;
  const g = await adm.post('/api/gastos', { fecha_pago: `${ANTERIOR}-05`, proveedor_id: prov.id, tipo_comprobante: 'factura_b', punto_venta: 1, numero: 10, cae: '75000000000001', rubro_id: rubro('Edilicio'), medio: 'transferencia', bruto: $(100000) });
  assert.equal(g.status, 200, JSON.stringify(g.datos));
  // Otra sede no ve ese gasto.
  assert.equal((await otro.get(`/api/gastos/${g.datos.id}`)).status, 403);
  // El duplicado devuelve 409 con el gasto existente.
  const dup = await adm.post('/api/gastos', { fecha_pago: `${ANTERIOR}-06`, proveedor_id: prov.id, tipo_comprobante: 'factura_b', punto_venta: 1, numero: 11, cae: '75000000000001', rubro_id: rubro('Edilicio'), medio: 'transferencia', bruto: $(100000) });
  assert.equal(dup.status, 409);
  assert.equal(dup.datos.codigo, 'DUPLICADO');
  assert.equal(dup.datos.datos.gasto_id, g.datos.id);

  assert.equal((await jefe.post(`/api/rendiciones/${vl}/${ANTERIOR}/cerrar`, { confirmo: true })).status, 200);
  assert.equal((await jefe.post(`/api/rendiciones/${vl}/${ANTERIOR}/enviar`)).status, 200);
  const bandeja = await tes.get('/api/rendiciones/recibidas');
  assert.equal(bandeja.datos.rendiciones.length, 1);
  assert.equal(bandeja.datos.rendiciones[0].total_gastos, $(100000));

  const pdf = await tes.get(`/api/rendiciones/${vl}/${ANTERIOR}/pdf`);
  assert.equal(pdf.tipo, 'application/pdf');
  assert.equal(pdf.datos.subarray(0, 4).toString(), '%PDF');
  const xlsx = await tes.get(`/api/rendiciones/${vl}/${ANTERIOR}/xlsx`);
  assert.match(xlsx.tipo, /spreadsheetml/);
  assert.equal(xlsx.datos.subarray(0, 2).toString(), 'PK');

  // Mes cerrado: la carga se rechaza con un mensaje claro.
  const tarde = await adm.post('/api/gastos', { fecha_pago: `${ANTERIOR}-20`, proveedor_id: prov.id, tipo_comprobante: 'ticket', rubro_id: rubro('Edilicio'), medio: 'transferencia', bruto: $(1000) });
  assert.equal(tarde.status, 409);
  assert.equal(tarde.datos.codigo, 'PERIODO_CERRADO');

  // La verificación de integridad la ve la Central, no la sede.
  assert.equal((await tes.get('/api/auditoria/verificar')).datos.auditoria.ok, true);
  assert.equal((await jefe.get('/api/auditoria/verificar')).status, 403);
});
