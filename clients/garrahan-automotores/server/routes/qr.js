const express = require('express');
const crypto = require('crypto');
const { getDB } = require('../db');
const { authMiddleware, JWT_SECRET } = require('../middleware/auth');

// Router publico (/qr/:codigo) y router privado de estadisticas (/api/qr).
const publico = express.Router();
const stats = express.Router();

// A donde mandamos a la persona despues de registrar el escaneo.
const DESTINO = '/';

// Solo aceptamos codigos con esta forma: evita que cualquiera nos llene
// la tabla pegandole a /qr/<basura>.
const CODIGO_OK = /^[a-z0-9][a-z0-9_-]{0,31}$/;

// Los previsualizadores de links (WhatsApp, Facebook, buscadores) piden la URL
// sin que nadie haya escaneado nada. Los guardamos marcados como bot y los
// dejamos afuera de los totales para que los numeros sean reales.
const BOT_RE = /bot|crawl|spider|preview|facebookexternalhit|whatsapp|telegram|slack|discord|twitter|linkedin|embedly|curl|wget|headless|lighthouse|python-requests|axios|go-http|monitor|uptime/i;

function dispositivoDe(ua) {
  if (!ua) return 'Otro';
  if (/iPad/i.test(ua)) return 'iPad';
  if (/iPhone|iPod/i.test(ua)) return 'iPhone';
  if (/Android/i.test(ua)) return 'Android';
  if (/Windows|Macintosh|X11|Linux|CrOS/i.test(ua)) return 'Escritorio';
  return 'Otro';
}

// No guardamos la IP. Solo un hash con sal, que alcanza para distinguir
// escaneos repetidos de la misma persona sin almacenar datos personales.
function hashVisitante(req) {
  const fwd = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  const ip = fwd || req.socket.remoteAddress || '';
  return crypto.createHash('sha256')
    .update(ip + '|' + (req.headers['user-agent'] || '') + '|' + JWT_SECRET)
    .digest('hex')
    .slice(0, 32);
}

// ===== Redirect publico: es la URL que va impresa en el QR =====
publico.get('/:codigo', (req, res) => {
  const codigo = String(req.params.codigo || '').toLowerCase();

  if (CODIGO_OK.test(codigo)) {
    try {
      const ua = req.headers['user-agent'] || '';
      getDB().prepare(`
        INSERT INTO qr_scans (codigo, scanned_at, dia, dispositivo, visitante, bot)
        VALUES (?, datetime('now','-3 hours'), date('now','-3 hours'), ?, ?, ?)
      `).run(codigo, dispositivoDe(ua), hashVisitante(req), BOT_RE.test(ua) ? 1 : 0);
    } catch (err) {
      // Si el registro falla, la persona igual tiene que llegar al sitio.
      console.error('QR: no se pudo registrar el escaneo:', err.message);
    }
  }

  // 302 y no-store a proposito: con un 301 el navegador cachea el salto y
  // los escaneos siguientes de esa persona nunca vuelven a pegarle al server.
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
  res.redirect(302, DESTINO);
});

// ===== Estadisticas para el panel (requiere login) =====
stats.get('/stats', authMiddleware, (req, res) => {
  try {
    const db = getDB();
    const hoy = db.prepare(`SELECT date('now','-3 hours') AS d`).get().d;

    const resumen = db.prepare(`
      SELECT
        COUNT(*)                                            AS total,
        COUNT(DISTINCT visitante)                           AS personas,
        SUM(CASE WHEN dia = date('now','-3 hours') THEN 1 ELSE 0 END)                  AS hoy,
        SUM(CASE WHEN dia >= date('now','-3 hours','-6 days')  THEN 1 ELSE 0 END)      AS ultimos7,
        SUM(CASE WHEN dia >= date('now','-3 hours','-29 days') THEN 1 ELSE 0 END)      AS ultimos30
      FROM qr_scans WHERE bot = 0
    `).get();

    const porCodigo = db.prepare(`
      SELECT codigo,
             COUNT(*)                  AS total,
             COUNT(DISTINCT visitante) AS personas,
             MAX(scanned_at)           AS ultimo
      FROM qr_scans WHERE bot = 0
      GROUP BY codigo ORDER BY total DESC
    `).all();

    const porDispositivo = db.prepare(`
      SELECT dispositivo, COUNT(*) AS total
      FROM qr_scans WHERE bot = 0
      GROUP BY dispositivo ORDER BY total DESC
    `).all();

    // Ultimos 30 dias, rellenando con 0 los dias sin escaneos para que el
    // grafico no mienta salteando fechas.
    const filas = db.prepare(`
      SELECT dia, COUNT(*) AS total
      FROM qr_scans
      WHERE bot = 0 AND dia >= date('now','-3 hours','-29 days')
      GROUP BY dia
    `).all();
    const mapa = new Map(filas.map(f => [f.dia, f.total]));
    const porDia = [];
    for (let i = 29; i >= 0; i--) {
      const d = db.prepare(`SELECT date(?, ?) AS d`).get(hoy, `-${i} days`).d;
      porDia.push({ dia: d, total: mapa.get(d) || 0 });
    }

    const bots = db.prepare('SELECT COUNT(*) AS n FROM qr_scans WHERE bot = 1').get().n;

    res.json({
      resumen: {
        total: resumen.total || 0,
        personas: resumen.personas || 0,
        hoy: resumen.hoy || 0,
        ultimos7: resumen.ultimos7 || 0,
        ultimos30: resumen.ultimos30 || 0
      },
      porCodigo, porDispositivo, porDia, bots, destino: DESTINO
    });
  } catch (err) {
    console.error('QR stats:', err);
    res.status(500).json({ error: 'No se pudieron leer las estadisticas' });
  }
});

module.exports = { publico, stats };
