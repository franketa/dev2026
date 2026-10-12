const express = require('express');
const crm = require('../crm');

// Los formularios de la web (hoy, el cotizador de "Vendé tu auto") dejan la
// consulta en el CRM como lead. El WhatsApp a Felipe se sigue abriendo igual:
// esto es para que la consulta no dependa de que alguien la copie a mano.
const router = express.Router();

// Tope simple por IP para que nadie llene el CRM de leads falsos.
const VENTANA_MS = 10 * 60 * 1000;
const MAX_POR_VENTANA = 5;
const intentos = new Map();

function permitido(ip) {
  const ahora = Date.now();
  const lista = (intentos.get(ip) || []).filter(t => ahora - t < VENTANA_MS);
  if (lista.length >= MAX_POR_VENTANA) { intentos.set(ip, lista); return false; }
  lista.push(ahora);
  intentos.set(ip, lista);
  if (intentos.size > 5000) intentos.clear(); // no crecer sin límite
  return true;
}

const txt = (v, max = 200) => String(v == null ? '' : v).trim().slice(0, max);

router.post('/', async (req, res) => {
  if (!crm.activo()) return res.status(204).end();

  const b = req.body || {};
  // Campo trampa: invisible para una persona, los bots lo completan.
  if (b.web) return res.status(204).end();

  const ip = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket.remoteAddress || '';
  if (!permitido(ip)) return res.status(429).json({ error: 'Demasiados envíos, probá en un rato' });

  if (!txt(b.nombre) || !txt(b.telefono)) return res.status(400).json({ error: 'Faltan nombre y teléfono' });

  try {
    const r = await crm.enviarLead({
      tipo: b.tipo === 'vender' ? 'vender' : 'consulta',
      nombre: txt(b.nombre, 120),
      telefono: txt(b.telefono, 40),
      email: txt(b.email, 120),
      localidad: txt(b.localidad, 80),
      vehiculo_id: Number(b.vehiculo_id) || null,
      vehiculo_texto: txt(b.vehiculo_texto, 120),
      mensaje: txt(b.mensaje, 1000),
      usado: b.usado && typeof b.usado === 'object' ? {
        vehiculo: txt(b.usado.vehiculo, 80),
        anio: txt(b.usado.anio, 10),
        km: txt(b.usado.km, 20),
        combustible: txt(b.usado.combustible, 30),
        transmision: txt(b.usado.transmision, 30),
        estado: txt(b.usado.estado, 30),
        precio: txt(b.usado.precio, 30),
        parte_de_pago: !!b.usado.parte_de_pago,
        interes: txt(b.usado.interes, 120),
      } : null,
    });
    res.status(201).json({ ok: true, id: r.id });
  } catch (err) {
    console.error('Lead a CRM:', err.message);
    res.status(502).json({ error: 'No se pudo registrar la consulta' });
  }
});

module.exports = router;
