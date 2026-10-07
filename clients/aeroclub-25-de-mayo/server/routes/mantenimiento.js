// Novedades de la flota para mantenimiento (también las ven tesorería y consulta).
const express = require('express');
const { db } = require('../db');
const novedades = require('../services/novedades');

const router = express.Router();

router.get('/novedades', (req, res) => {
  const estado = req.query.estado === 'verificada' ? 'verificada' : 'pendiente';
  res.json({
    novedades: novedades.listar({ estado, avionId: req.query.avion || null, periodo: req.query.periodo || null }),
    aviones: db.prepare('SELECT id, matricula, modelo, orden FROM aviones ORDER BY activo DESC, orden').all()
  });
});

router.post('/novedades/:id/verificar', (req, res) => {
  res.json({ novedad: novedades.revisar(Number(req.params.id), req.body?.comentario, req.user) });
});

module.exports = router;
