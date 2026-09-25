const express = require('express');
const path = require('path');
const { db } = require('./db');
const { requireAuth, requireAdmin, exigirOrigenPropio, identificar } = require('./middleware/auth');
const authRouter = require('./routes/auth');
const { router: appRouter, enviarPdf } = require('./routes/app');
const adminRouter = require('./routes/admin');
const cierres = require('./services/cierres');
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
    "style-src 'self' https://fonts.googleapis.com",
    "font-src https://fonts.gstatic.com",
    "img-src 'self' data:",
    "connect-src 'self'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'"
  ].join('; '));
  if (PROD) res.setHeader('Strict-Transport-Security', 'max-age=31536000');
  next();
});

app.use(express.json({ limit: '100kb' }));

app.get('/salud', (req, res) => {
  db.prepare('SELECT 1').get();
  res.json({ ok: true });
});

// ── API ─────────────────────────────────────────────────────────────────────
app.use('/api', exigirOrigenPropio);
app.use('/api/auth', authRouter);
app.use('/api/admin', requireAuth, requireAdmin, adminRouter);
app.use('/api', requireAuth, appRouter);
app.use('/api', (req, res) => res.status(404).json({ error: 'Ruta inexistente' }));

// Link público del cupón (el que se manda por WhatsApp). El token es aleatorio e imposible de adivinar.
app.get('/c/:token', (req, res) => {
  const cupon = db.prepare('SELECT id FROM cupones WHERE token = ?').get(String(req.params.token));
  if (!cupon) return res.status(404).type('text/plain; charset=utf-8').send('Cupón inexistente. Pedile el link actualizado a tesorería.');
  cierres.registrarEnvio(cupon.id, 'descarga', null);
  enviarPdf(res, cierres.datosCupon(cupon.id), false);
});

// ── Páginas ─────────────────────────────────────────────────────────────────
app.get('/', (req, res) => {
  if (identificar(req)) return res.redirect('/app');
  res.sendFile(path.join(PUBLIC, 'index.html'));
});
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
}

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Aeroclub 25 de Mayo · http://localhost:${PORT}`);
    revisarCierre();
    setInterval(revisarCierre, 10 * 60 * 1000).unref();
  });
}

module.exports = app;
