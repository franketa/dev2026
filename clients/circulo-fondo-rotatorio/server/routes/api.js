// API del sistema. Las rutas sólo traducen HTTP ↔ servicios: los permisos y las reglas viven en los servicios.

const express = require('express');
const { db, getConfig, flag, sedeCentral } = require('../db');
const acceso = require('../services/acceso');
const admin = require('../services/admin');
const fondos = require('../services/fondos');
const libro = require('../services/libro');
const proveedores = require('../services/proveedores');
const gastos = require('../services/gastos');
const solicitudes = require('../services/solicitudes');
const rendiciones = require('../services/rendiciones');
const adjuntos = require('../services/adjuntos');
const panel = require('../services/panel');
const notificaciones = require('../services/notificaciones');
const respaldos = require('../services/respaldos');
const auditoria = require('../services/auditoria');
const pdf = require('../services/pdf');
const excel = require('../services/excel');
const { ROLES } = require('../permisos');
const { ErrorNegocio, hoy, periodoActual, esFecha, esPeriodo } = require('../util');

const router = express.Router();
// Envuelve handlers sincrónicos o async: cualquier error va al manejador central.
const h = (fn) => (req, res, next) => { try { Promise.resolve(fn(req, res)).catch(next); } catch (e) { next(e); } };
const periodoDe = (q) => (esPeriodo(q) ? q : periodoActual());

// ── Inicio y catálogos ──────────────────────────────────────────────────────
router.get('/inicio', h((req, res) => {
  if (acceso.veTodas(req.actor)) return res.json({ tipo: 'central', ...panel.panelCentral(req.actor) });
  res.json({ tipo: 'sede', ...panel.inicioSede(req.actor, periodoDe(req.query.periodo)) });
}));

router.get('/catalogos', h((req, res) => {
  const fecha = esFecha(req.query.fecha) ? req.query.fecha : hoy();
  const conf = getConfig();
  res.json({
    sedes: admin.listarSedes().filter(s => acceso.veTodas(req.actor) || s.id === req.actor.sede_id),
    rubros: admin.listarRubros(),
    reglas: gastos.reglas(fecha),
    alicuotas: admin.listarAlicuotas({ vigentesAl: fecha }),
    tipos_comprobante: gastos.TIPOS_COMPROBANTE,
    tipos_gasto: gastos.TIPOS_GASTO,
    impuestos: admin.IMPUESTOS,
    condiciones_iva: proveedores.CONDICIONES,
    estados_solicitud: solicitudes.ESTADOS,
    estados_rendicion: rendiciones.ESTADOS,
    roles: Object.fromEntries(Object.entries(ROLES).map(([k, v]) => [k, v.nombre])),
    circulo: { razon_social: conf.circulo_razon_social, cuit: conf.circulo_cuit },
    flags: { adjuntos: flag('adjuntos'), cierre_anticipado: flag('cierre_anticipado') },
    central_id: sedeCentral().id,
    hoy: hoy()
  });
}));

router.get('/notificaciones', h((req, res) => res.json({ notificaciones: notificaciones.listar(req.user.id), sin_leer: notificaciones.sinLeer(req.user.id) })));
router.get('/notificaciones/contador', h((req, res) => res.json({ sin_leer: notificaciones.sinLeer(req.user.id) })));
router.post('/notificaciones/leidas', h((req, res) => { notificaciones.marcarLeidas(req.user.id); res.json({ ok: true }); }));

// ── Fondos de una sede ──────────────────────────────────────────────────────
router.get('/fondos', h((req, res) => {
  const sedeId = acceso.sedeDe(req.actor, req.query.sede_id);
  acceso.exigirSede(req.actor, sedeId);
  const sede = acceso.sedeOperativa(sedeId);
  const periodo = periodoDe(req.query.periodo);
  res.json({
    sede: { id: sede.id, nombre: sede.nombre }, periodo,
    estado: fondos.estadoSede(sede.id, periodo),
    movimientos: libro.movimientosDe(sede.id, periodo),
    pedidos: fondos.listarPedidos({ sedeId: sede.id }),
    rendicion: gastos.estadoRendicion(sede.id, periodo)
  });
}));
router.post('/fondos/extraccion', h((req, res) => { fondos.moverEfectivo(req.actor, 'extraccion', req.body); res.json({ ok: true }); }));
router.post('/fondos/deposito', h((req, res) => { fondos.moverEfectivo(req.actor, 'deposito', req.body); res.json({ ok: true }); }));
router.post('/fondos/pedidos', h((req, res) => res.json({ id: fondos.pedirExtra(req.actor, req.body) })));
router.get('/fondos/pedidos', h((req, res) => {
  const sedeId = acceso.veTodas(req.actor) ? (req.query.sede_id ? Number(req.query.sede_id) : null) : req.actor.sede_id;
  res.json({ pedidos: fondos.listarPedidos({ sedeId, estado: req.query.estado || null }) });
}));
router.post('/fondos/pedidos/:id/resolver', h((req, res) => {
  fondos.resolverExtra(req.actor, Number(req.params.id), { autorizar: !!req.body.autorizar, comentario: req.body.comentario });
  res.json({ ok: true });
}));

// ── Central ─────────────────────────────────────────────────────────────────
router.get('/central/panel', h((req, res) => res.json(panel.panelCentral(req.actor))));
router.get('/central/resumen', h((req, res) => {
  acceso.exigir(req.actor, 'sedes.ver_todas');
  res.json(fondos.resumenCentral(periodoDe(req.query.periodo)));
}));
router.get('/central/movimientos', h((req, res) => {
  acceso.exigir(req.actor, 'sedes.ver_todas');
  const periodo = periodoDe(req.query.periodo);
  const central = sedeCentral();
  res.json({ periodo, saldo: libro.saldo(central.id, 'banco'), saldo_inicial: libro.saldosAlInicio(central.id, periodo).banco, movimientos: libro.movimientosDe(central.id, periodo) });
}));
router.post('/central/ingresos', h((req, res) => res.json({ id: fondos.ingresoCentral(req.actor, req.body).id })));
router.get('/central/asignacion', h((req, res) => {
  acceso.exigir(req.actor, 'sedes.ver_todas');
  const periodo = periodoDe(req.query.periodo);
  res.json({ periodo, saldo_central: libro.saldo(sedeCentral().id, 'banco'), sedes: fondos.planillaAsignacion(periodo), asignaciones: fondos.asignacionesDe(periodo) });
}));
router.post('/central/asignacion', h((req, res) => res.json({ ids: fondos.asignar(req.actor, req.body) })));
router.post('/central/asignaciones/:id/anular', h((req, res) => { fondos.anularAsignacion(req.actor, Number(req.params.id), req.body.motivo); res.json({ ok: true }); }));

// ── Proveedores ─────────────────────────────────────────────────────────────
router.get('/proveedores', h((req, res) => res.json({ proveedores: req.query.todos ? proveedores.listar() : proveedores.buscar(req.query.q) })));
router.get('/proveedores/similares', h((req, res) => res.json({ similares: proveedores.similares(req.query.razon || '') })));
router.post('/proveedores', h((req, res) => res.json(proveedores.alta(req.actor, req.body))));
router.put('/proveedores/:id', h((req, res) => res.json({ proveedor: proveedores.editar(req.actor, Number(req.params.id), req.body) })));

// ── Gastos ──────────────────────────────────────────────────────────────────
router.get('/gastos', h((req, res) => res.json({ gastos: gastos.listar(req.actor, req.query) })));
router.get('/gastos/intentos-duplicado', h((req, res) => {
  acceso.exigir(req.actor, 'auditoria.ver');
  res.json({ intentos: gastos.intentosDuplicado(req.actor, req.query) });
}));
router.get('/gastos/:id', h((req, res) => res.json(gastos.detalle(req.actor, Number(req.params.id)))));
router.post('/gastos', h((req, res) => res.json(gastos.registrar(req.actor, req.body))));
router.put('/gastos/:id', h((req, res) => { gastos.corregir(req.actor, Number(req.params.id), req.body); res.json({ ok: true }); }));
router.post('/gastos/:id/anular', h((req, res) => { gastos.anular(req.actor, Number(req.params.id), req.body.motivo); res.json({ ok: true }); }));

router.get('/certificados', h((req, res) => {
  const w = acceso.veTodas(req.actor) ? '' : 'WHERE g.sede_id = ?';
  const args = acceso.veTodas(req.actor) ? [] : [req.actor.sede_id];
  res.json({
    certificados: db.prepare(`SELECT c.id, c.numero, c.fecha, c.total, c.anulado, c.gasto_id, g.bruto, g.neto, g.pagado_por, s.nombre AS sede_nombre, p.razon_social AS proveedor, p.cuit
      FROM certificados_retencion c JOIN gastos g ON g.id = c.gasto_id JOIN sedes s ON s.id = g.sede_id JOIN proveedores p ON p.id = g.proveedor_id
      ${w} ORDER BY c.numero DESC LIMIT 300`).all(...args)
  });
}));
router.get('/certificados/:id/pdf', h((req, res) => {
  const cert = db.prepare('SELECT * FROM certificados_retencion WHERE id = ?').get(Number(req.params.id));
  if (!cert) throw new ErrorNegocio('Comprobante inexistente', 404);
  const d = gastos.detalle(req.actor, cert.gasto_id);
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="retencion-${String(cert.numero).padStart(8, '0')}.pdf"`);
  pdf.generarCertificado({ certificado: cert, gasto: d.gasto, retenciones: d.retenciones }).pipe(res);
}));

// ── Solicitudes ─────────────────────────────────────────────────────────────
router.get('/solicitudes', h((req, res) => res.json({ solicitudes: solicitudes.listar(req.actor, req.query) })));
router.get('/solicitudes/aprobadas', h((req, res) => {
  const sedeId = acceso.sedeDe(req.actor, req.query.sede_id);
  acceso.exigirSede(req.actor, sedeId);
  res.json({ solicitudes: solicitudes.aprobadasParaPagar(sedeId, req.query.quien_paga === 'central' ? 'central' : 'sede') });
}));
router.get('/solicitudes/:id', h((req, res) => res.json(solicitudes.detalle(req.actor, Number(req.params.id)))));
router.post('/solicitudes', h((req, res) => res.json({ id: solicitudes.crear(req.actor, req.body) })));
router.post('/solicitudes/:id/resolver', h((req, res) => { solicitudes.resolver(req.actor, Number(req.params.id), req.body); res.json({ ok: true }); }));

// ── Rendiciones ────────────────────────────────────────────────────────────
router.get('/rendiciones/recibidas', h((req, res) => res.json({ rendiciones: rendiciones.recibidas(req.actor, req.query) })));
router.get('/rendiciones/tablero', h((req, res) => {
  acceso.exigir(req.actor, 'sedes.ver_todas');
  const periodo = periodoDe(req.query.periodo);
  res.json({ periodo, sedes: rendiciones.tablero(periodo) });
}));
router.get('/rendiciones/:sede/:periodo', h((req, res) => res.json(rendiciones.estado(req.actor, Number(req.params.sede), req.params.periodo))));
router.get('/rendiciones/:sede/:periodo/documento', h((req, res) => {
  const d = rendiciones.documento(req.actor, Number(req.params.sede), req.params.periodo, req.query.version);
  res.json({ ...d, version: { ...d.version, snapshot: undefined }, versiones: rendiciones.versiones(d.rendicion.id) });
}));
router.post('/rendiciones/:sede/:periodo/cerrar', h((req, res) => res.json(rendiciones.cerrar(req.actor, Number(req.params.sede), req.params.periodo, req.body))));
router.post('/rendiciones/:sede/:periodo/enviar', h((req, res) => res.json(rendiciones.enviar(req.actor, Number(req.params.sede), req.params.periodo))));
router.post('/rendiciones/:sede/:periodo/reabrir', h((req, res) => { rendiciones.reabrir(req.actor, Number(req.params.sede), req.params.periodo, req.body.motivo); res.json({ ok: true }); }));

function archivoRendicion(req) {
  const d = rendiciones.documento(req.actor, Number(req.params.sede), req.params.periodo, req.query.version);
  const vigente = d.version.version === d.rendicion.version;
  const estadoTexto = vigente ? rendiciones.ESTADOS[d.rendicion.estado] : `Reabierta el ${d.version.reabierto_en?.slice(0, 10).split('-').reverse().join('/')}`;
  const nombre = `rendicion-${d.contenido.sede.codigo}-${d.contenido.periodo}-v${d.version.version}`.toLowerCase();
  return { ...d, rendicion: vigente ? d.rendicion : { ...d.rendicion, estado: 'abierta' }, estadoTexto, nombre };
}
router.get('/rendiciones/:sede/:periodo/pdf', h((req, res) => {
  const d = archivoRendicion(req);
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `${req.query.descargar ? 'attachment' : 'inline'}; filename="${d.nombre}.pdf"`);
  pdf.generarRendicion(d).pipe(res);
}));
router.get('/rendiciones/:sede/:periodo/xlsx', h(async (req, res) => {
  const d = archivoRendicion(req);
  const buf = await excel.generarRendicion(d);
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${d.nombre}.xlsx"`);
  res.send(Buffer.from(buf));
}));

// ── Adjuntos ────────────────────────────────────────────────────────────────
router.post('/adjuntos/:entidad/:id', express.raw({ type: Object.keys(adjuntos.TIPOS), limit: adjuntos.MAX_BYTES }), h(async (req, res) => {
  let nombre = null;
  try { nombre = decodeURIComponent(req.get('X-Archivo') || ''); } catch { /* nombre mal codificado: se ignora */ }
  res.json(await adjuntos.subir(req.actor, req.params.entidad, Number(req.params.id), { buffer: Buffer.isBuffer(req.body) ? req.body : null, mime: req.get('Content-Type'), nombre }));
}));
router.get('/adjuntos/:id', h(async (req, res) => {
  const { adjunto, buffer } = await adjuntos.descargar(req.actor, Number(req.params.id));
  res.setHeader('Content-Type', adjunto.mime);
  res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(adjunto.nombre)}"`);
  res.setHeader('Cache-Control', 'private, max-age=3600');
  res.send(buffer);
}));

// ── Auditoría y respaldos ───────────────────────────────────────────────────
router.get('/auditoria', h((req, res) => {
  acceso.exigir(req.actor, 'auditoria.ver');
  const w = []; const args = [];
  if (!acceso.veTodas(req.actor)) { w.push('a.sede_id = ?'); args.push(req.actor.sede_id); } else if (req.query.sede_id) { w.push('a.sede_id = ?'); args.push(Number(req.query.sede_id)); }
  if (req.query.accion) { w.push('a.accion LIKE ?'); args.push(`${req.query.accion}%`); }
  if (req.query.entidad) { w.push('a.entidad = ?'); args.push(req.query.entidad); }
  if (req.query.entidad_id) { w.push('a.entidad_id = ?'); args.push(Number(req.query.entidad_id)); }
  if (req.query.antes_de) { w.push('a.id < ?'); args.push(Number(req.query.antes_de)); }
  const filas = db.prepare(`SELECT a.*, u.nombre || ' ' || u.apellido AS usuario, s.nombre AS sede_nombre FROM auditoria a
    LEFT JOIN usuarios u ON u.id = a.usuario_id LEFT JOIN sedes s ON s.id = a.sede_id
    ${w.length ? 'WHERE ' + w.join(' AND ') : ''} ORDER BY a.id DESC LIMIT 100`).all(...args);
  res.json({ registros: filas, acciones: auditoria.ACCIONES });
}));
router.get('/auditoria/verificar', h((req, res) => {
  acceso.exigir(req.actor, 'auditoria.ver');
  acceso.exigir(req.actor, 'sedes.ver_todas');
  res.json({ auditoria: auditoria.verificarCadena(), libro: libro.verificarCadena() });
}));
router.get('/respaldos', h((req, res) => {
  acceso.exigir(req.actor, 'auditoria.ver'); acceso.exigir(req.actor, 'sedes.ver_todas');
  res.json({ respaldos: respaldos.listar() });
}));
router.post('/respaldos', h(async (req, res) => {
  acceso.exigir(req.actor, 'admin.parametros');
  res.json({ nombre: await respaldos.respaldoDiario({ forzar: true }) });
}));
router.get('/respaldos/:nombre', h((req, res) => {
  acceso.exigir(req.actor, 'admin.parametros');
  res.download(respaldos.ruta(req.params.nombre));
}));

// ── Administración ──────────────────────────────────────────────────────────
const exigirAdmin = (permiso) => (req, res, next) => { try { acceso.exigir(req.actor, permiso); next(); } catch (e) { next(e); } };

router.get('/admin/sedes', exigirAdmin('admin.sedes'), h((req, res) => res.json({ sedes: admin.listarSedes({ todas: true }) })));
router.post('/admin/sedes', h((req, res) => res.json({ id: admin.guardarSede(req.actor, null, req.body) })));
router.put('/admin/sedes/:id', h((req, res) => res.json({ id: admin.guardarSede(req.actor, Number(req.params.id), req.body) })));

router.get('/admin/usuarios', exigirAdmin('admin.usuarios'), h((req, res) => res.json({ usuarios: admin.listarUsuarios(), roles: ROLES })));
router.post('/admin/usuarios', h((req, res) => res.json(admin.guardarUsuario(req.actor, null, req.body))));
router.put('/admin/usuarios/:id', h((req, res) => res.json(admin.guardarUsuario(req.actor, Number(req.params.id), req.body))));
router.post('/admin/usuarios/:id/reset', h((req, res) => res.json(admin.resetearPassword(req.actor, Number(req.params.id)))));

router.get('/admin/rubros', exigirAdmin('admin.rubros'), h((req, res) => res.json({ rubros: admin.listarRubros({ todos: true }) })));
router.post('/admin/rubros', h((req, res) => res.json({ id: admin.guardarRubro(req.actor, null, req.body) })));
router.put('/admin/rubros/:id', h((req, res) => res.json({ id: admin.guardarRubro(req.actor, Number(req.params.id), req.body) })));

router.get('/admin/parametros', exigirAdmin('admin.parametros'), h((req, res) => res.json({
  parametros: admin.listarParametros(), definiciones: admin.PARAMETROS, vigentes: gastos.reglas(hoy()),
  alicuotas: admin.listarAlicuotas({ todas: true }), impuestos: admin.IMPUESTOS, config: getConfig()
})));
router.post('/admin/parametros', h((req, res) => res.json({ id: admin.agregarParametro(req.actor, req.body) })));
router.post('/admin/alicuotas', h((req, res) => res.json({ id: admin.guardarAlicuota(req.actor, null, req.body) })));
router.put('/admin/alicuotas/:id', h((req, res) => res.json({ id: admin.guardarAlicuota(req.actor, Number(req.params.id), req.body) })));
router.put('/admin/config', h((req, res) => res.json({ config: admin.guardarConfig(req.actor, req.body) })));

router.get('/admin/permisos', exigirAdmin('admin.permisos'), h((req, res) => res.json(admin.matrizPermisos())));
router.post('/admin/permisos', h((req, res) => { admin.cambiarPermiso(req.actor, req.body.rol, req.body.permiso, !!req.body.habilitado); res.json(admin.matrizPermisos()); }));

module.exports = router;
