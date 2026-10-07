const express = require('express');
const path = require('path');
const { db } = require('./db');
const { requireAuth, requireStaff, requireRampa, exigirOrigenPropio } = require('./middleware/auth');
const authRouter = require('./routes/auth');
const { router: appRouter, enviarPdf } = require('./routes/app');
const adminRouter = require('./routes/admin');
const { router: rampaRouter, enviarTicket } = require('./routes/rampa');
const cierres = require('./services/cierres');
const tickets = require('./services/tickets');
const respaldos = require('./services/respaldos');
const verificacion = require('./services/verificacion');
const { escapar } = require('./services/mail');
const { ErrorNegocio } = require('./util');

const app = express();
const PORT = process.env.PORT || 3000;
const PROD = process.env.NODE_ENV === 'production';
const PUBLIC = path.join(__dirname, '..', 'public');

app.disable('x-powered-by');
app.set('trust proxy', 1); // detrás del proxy de Coolify: IP real y https

app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'same-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.setHeader('Content-Security-Policy', [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src https://fonts.gstatic.com",
    "img-src 'self' data: blob:",
    "connect-src 'self'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'"
  ].join('; '));
  if (PROD) res.setHeader('Strict-Transport-Security', 'max-age=31536000');
  next();
});

// El pago informado puede traer la foto del comprobante (hasta 3 MB, en base64).
app.use('/api/pagos-informados', express.json({ limit: '5mb' }));
app.use(express.json({ limit: '100kb' }));

app.get('/salud', (req, res) => {
  db.prepare('SELECT 1').get();
  res.json({ ok: true });
});

// ── API ─────────────────────────────────────────────────────────────────────
app.use('/api', exigirOrigenPropio);
app.use('/api/auth', authRouter);
app.use('/api/admin', requireAuth, requireStaff, adminRouter);
app.use('/api/rampa', requireAuth, requireRampa, rampaRouter);
app.use('/api', requireAuth, appRouter);
app.use('/api', (req, res) => res.status(404).json({ error: 'Ruta inexistente' }));

// Link público del cupón (el que se manda por WhatsApp). El token es aleatorio e imposible de adivinar.
app.get('/c/:token', (req, res) => {
  const cupon = db.prepare('SELECT id FROM cupones WHERE token = ?').get(String(req.params.token));
  if (!cupon) return res.status(404).type('text/plain; charset=utf-8').send('Cupón inexistente. Pedile el link actualizado a tesorería.');
  cierres.registrarEnvio(cupon.id, 'descarga', null);
  enviarPdf(res, cierres.datosCupon(cupon.id), false);
});

// Link público del ticket de servicios (para mandarlo por WhatsApp al dueño de la aeronave).
app.get('/t/:token', (req, res) => {
  const t = tickets.porToken(req.params.token);
  if (!t) return res.status(404).type('text/plain; charset=utf-8').send('Ticket inexistente. Pedile el link actualizado a tesorería.');
  enviarTicket(res, t, false);
});

// Link del mail de verificación de email.
function paginaSimple(titulo, texto, ok) {
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapar(titulo)} · Aeroclub 25 de Mayo</title><link rel="icon" type="image/png" href="/assets/img/favicon.png"></head>
  <body style="margin:0;min-height:100vh;display:grid;place-items:center;background:#eef3f9;font-family:Arial,Helvetica,sans-serif;color:#16284a">
  <main style="max-width:420px;margin:16px;padding:32px 24px;background:#fff;border-radius:14px;text-align:center;box-shadow:0 8px 30px rgba(22,40,74,.12)">
    <img src="/assets/img/escudo-256.png" alt="" width="88" height="88">
    <h1 style="font-size:22px;margin:16px 0 8px;color:${ok ? '#16284a' : '#b3261e'}">${escapar(titulo)}</h1>
    <p style="font-size:15px;line-height:1.5;color:#44506a;margin:0 0 22px">${escapar(texto)}</p>
    <a href="/app" style="display:inline-block;background:#d43a2f;color:#fff;text-decoration:none;font-weight:600;padding:12px 22px;border-radius:8px">Ir al sistema</a>
  </main></body></html>`;
}

app.get('/verificar-email/:token', (req, res) => {
  const u = verificacion.confirmar(req.params.token);
  res.status(u ? 200 : 410).type('html').send(u
    ? paginaSimple('Email confirmado', `Listo, ${u.nombre}: ${u.email} quedó verificado.`, true)
    : paginaSimple('El link ya no sirve', 'Venció, ya se usó o no es correcto. Desde tu perfil podés pedir uno nuevo.', false));
});

// ── Páginas ─────────────────────────────────────────────────────────────────
app.get('/', (req, res) => res.sendFile(path.join(PUBLIC, 'index.html')));
app.get('/app', (req, res) => res.sendFile(path.join(PUBLIC, 'app.html')));
app.get('/sw.js', (req, res) => {
  res.setHeader('Cache-Control', 'no-cache');
  res.sendFile(path.join(PUBLIC, 'sw.js'));
});

app.use(express.static(PUBLIC, { index: false, maxAge: PROD ? '1h' : 0, etag: true }));

// ── Errores ─────────────────────────────────────────────────────────────────
app.use((err, req, res, next) => {
  if (err instanceof ErrorNegocio) return res.status(err.status).json({ error: err.message, codigo: err.codigo });
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Datos mal formados' });
  if (/SQLITE_CONSTRAINT/.test(err.code || '') || /Registro inmutable|no se puede modificar|no se borran/.test(err.message)) {
    return res.status(409).json({ error: err.message });
  }
  console.error(err);
  res.status(500).json({ error: 'Error interno. Si se repite, avisá a soporte.' });
});

// ── Cierre automático ───────────────────────────────────────────────────────
function revisarCierre() {
  try { cierres.cierreAutomatico(); } catch (e) { console.error('[cierre] falló el cierre automático:', e.message); }
  respaldos.respaldoMensual().catch(e => console.error('[respaldo] falló la copia mensual:', e.message));
}

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Aeroclub 25 de Mayo · http://localhost:${PORT}`);
    revisarCierre();
    setInterval(revisarCierre, 10 * 60 * 1000).unref();
  });
}

module.exports = app;
