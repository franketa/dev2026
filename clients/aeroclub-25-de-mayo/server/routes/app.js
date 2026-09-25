// Rutas de uso diario para cualquier usuario logueado (pilotos, alumnos, instructores y admins).
const express = require('express');
const { db, auditar } = require('../db');
const flota = require('../services/flota');
const vuelos = require('../services/vuelos');
const cierres = require('../services/cierres');
const cuentas = require('../services/cuentas');
const ledger = require('../services/ledger');
const { generarCupon } = require('../services/pdf');
const { ErrorNegocio, periodoActual, esPeriodo, limpiarTexto, telefonoWhatsApp } = require('../util');

const router = express.Router();

router.get('/inicio', (req, res) => {
  const uid = req.user.id;
  const periodo = periodoActual();
  const mes = db.prepare(`SELECT COUNT(*) vuelos, COALESCE(SUM(decimas),0) decimas, COALESCE(SUM(importe),0) importe
                          FROM vuelos WHERE piloto_id = ? AND estado <> 'anulado' AND substr(fecha,1,7) = ?`).get(uid, periodo);
  const instruccion = req.user.es_instructor
    ? db.prepare(`SELECT COUNT(*) vuelos, COALESCE(SUM(decimas),0) decimas FROM vuelos WHERE instructor_id = ? AND estado <> 'anulado' AND substr(fecha,1,7) = ?`).get(uid, periodo)
    : null;
  const ultimoCupon = db.prepare(`SELECT cu.*, ci.periodo FROM cupones cu JOIN cierres ci ON ci.id = cu.cierre_id WHERE cu.usuario_id = ? ORDER BY cu.id DESC LIMIT 1`).get(uid);
  res.json({
    periodo,
    saldo: ledger.saldo(uid),
    abiertos: vuelos.resumenAbiertos(uid),
    mes,
    instruccion,
    ultimo_cupon: ultimoCupon ? { ...ultimoCupon, ...cierres.estadoCupon(ultimoCupon) } : null,
    ultimos_vuelos: vuelos.listar({ piloto_id: uid, limite: 5 }),
    aviones: flota.listarAviones(),
    proximo_cierre: cierres.proximoCierreAutomatico()
  });
});

router.get('/aviones', (req, res) => res.json({ aviones: flota.listarAviones() }));

router.get('/instructores', (req, res) => {
  res.json({
    instructores: db.prepare(`SELECT id, nombre, apellido FROM usuarios WHERE es_instructor = 1 AND activo = 1 ORDER BY apellido, nombre`).all()
  });
});

router.get('/vuelos', (req, res) => {
  const f = { ...req.query };
  if (req.user.rol !== 'admin') {
    // Un piloto ve sus vuelos; un instructor además puede ver los que voló como instructor.
    if (f.como === 'instructor' && req.user.es_instructor) { f.instructor_id = req.user.id; delete f.piloto_id; }
    else { f.piloto_id = req.user.id; delete f.instructor_id; }
  }
  if (f.periodo && !esPeriodo(f.periodo)) delete f.periodo;
  res.json({ vuelos: vuelos.listar(f) });
});

function puedeVer(v, user) {
  return user.rol === 'admin' || v.piloto_id === user.id || v.instructor_id === user.id;
}

router.get('/vuelos/:id', (req, res) => {
  const v = vuelos.getVuelo(Number(req.params.id));
  if (!puedeVer(v, req.user)) throw new ErrorNegocio('No tenés acceso a ese vuelo', 403);
  res.json({ vuelo: v, historial: vuelos.historial(v.id) });
});

router.post('/vuelos', (req, res) => {
  const r = vuelos.crear(req.body || {}, req.user);
  res.status(201).json(r);
});

router.put('/vuelos/:id', (req, res) => {
  res.json(vuelos.editar(Number(req.params.id), req.body || {}, req.user));
});

router.post('/vuelos/:id/anular', (req, res) => {
  res.json({ vuelo: vuelos.anular(Number(req.params.id), req.body?.motivo, req.user) });
});

router.get('/cuenta', (req, res) => res.json(cuentas.estadoCuenta(req.user.id)));

router.put('/perfil', (req, res) => {
  const telefono = limpiarTexto(req.body?.telefono, 30);
  if (telefono && !telefonoWhatsApp(telefono)) throw new ErrorNegocio('Revisá el celular: poné código de área y número, por ejemplo 2345 401234');
  db.prepare('UPDATE usuarios SET telefono = ? WHERE id = ?').run(telefono, req.user.id);
  auditar(req.user.id, 'usuario.perfil', `Actualizó su celular`);
  res.json({ ok: true });
});

// PDF del cupón para el propio socio (o cualquiera, si es admin).
router.get('/cupones/:id/pdf', (req, res) => {
  const datos = cierres.datosCupon(Number(req.params.id));
  if (req.user.rol !== 'admin' && datos.cupon.usuario_id !== req.user.id) throw new ErrorNegocio('No tenés acceso a ese cupón', 403);
  enviarPdf(res, datos, req.query.descargar === '1');
});

function enviarPdf(res, datos, descargar) {
  const nombre = `cupon-${datos.cupon.numero}-${datos.cupon.apellido}`.normalize('NFD').replace(/[^\w-]/g, '').toLowerCase();
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `${descargar ? 'attachment' : 'inline'}; filename="${nombre}.pdf"`);
  res.setHeader('Cache-Control', 'private, no-store');
  generarCupon(datos).pipe(res);
}

module.exports = { router, enviarPdf };
