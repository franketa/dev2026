// Rampa: registra aeronaves (de socios o externos) y arma tickets de servicios.
// Tesorería también puede usar estas rutas.
const express = require('express');
const { getConfig } = require('../db');
const servicios = require('../services/servicios');
const tickets = require('../services/tickets');
const { generarTicket } = require('../services/pdf');
const { ErrorNegocio } = require('../util');

const router = express.Router();

// Todo lo que necesita el formulario del ticket en un solo pedido.
router.get('/datos', (req, res) => {
  res.json({
    servicios: servicios.listar().filter(s => req.user.rol === 'admin' || s.codigo !== servicios.CODIGO_DERECHO),
    aeronaves: tickets.listarAeronaves(),
    cuentas: tickets.cuentasParaTicket()
  });
});

router.get('/aeronaves', (req, res) => res.json({ aeronaves: tickets.listarAeronaves() }));
router.post('/aeronaves', (req, res) => res.status(201).json({ aeronave: tickets.guardarAeronave(req.body || {}, req.user) }));
router.put('/aeronaves/:id', (req, res) => res.json({ aeronave: tickets.guardarAeronave(req.body || {}, req.user, Number(req.params.id)) }));

router.post('/externos', (req, res) => res.status(201).json({ id: tickets.crearExterno(req.body || {}, req.user) }));

// Rampa ve los tickets que hizo; tesorería, todos.
router.get('/tickets', (req, res) => {
  const f = { periodo: req.query.periodo, aeronave_id: req.query.aeronave_id, limite: 200 };
  if (req.user.rol !== 'admin') f.creado_por = req.user.id;
  res.json({ tickets: tickets.listar(f) });
});

router.post('/tickets', (req, res) => res.status(201).json({ ticket: tickets.crear(req.body || {}, req.user) }));

function ticketVisible(id, user) {
  const t = tickets.detalle(id);
  if (user.rol !== 'admin' && t.creado_por !== user.id) throw new ErrorNegocio('No tenés acceso a ese ticket', 403);
  return t;
}

router.get('/tickets/:id', (req, res) => res.json({ ticket: ticketVisible(Number(req.params.id), req.user) }));

router.get('/tickets/:id/pdf', (req, res) => enviarTicket(res, ticketVisible(Number(req.params.id), req.user), req.query.descargar === '1'));

function enviarTicket(res, t, descargar) {
  const nombre = `ticket-${t.numero_txt}-${t.matricula || t.apellido || t.nombre}`.normalize('NFD').replace(/[^\w-]/g, '').toLowerCase();
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `${descargar ? 'attachment' : 'inline'}; filename="${nombre}.pdf"`);
  res.setHeader('Cache-Control', 'private, no-store');
  generarTicket(t, getConfig()).pipe(res);
}

module.exports = { router, enviarTicket };
