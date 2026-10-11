const express = require('express');
const path = require('path');
const { db } = require('./db');
const { requireAuth, exigirOrigenPropio } = require('./middleware/auth');
const authRouter = require('./routes/auth');
const apiRouter = require('./routes/api');
const respaldos = require('./services/respaldos');
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
  res.setHeader('Permissions-Policy', 'microphone=(), geolocation=()');
  res.setHeader('Content-Security-Policy', [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src https://fonts.gstatic.com",
    "img-src 'self' data: blob:",
    "connect-src 'self'",
    "frame-src 'self'",
    "frame-ancestors 'self'",
    "base-uri 'self'",
    "form-action 'self'"
  ].join('; '));
  if (PROD) res.setHeader('Strict-Transport-Security', 'max-age=31536000');
  next();
});

app.use('/api', express.json({ limit: '200kb' }));

app.get('/salud', (req, res) => {
  db.prepare('SELECT 1').get();
  res.json({ ok: true });
});

// ── API ─────────────────────────────────────────────────────────────────────
app.use('/api', exigirOrigenPropio);
app.use('/api/auth', authRouter);
app.use('/api', requireAuth, apiRouter);
app.use('/api', (req, res) => res.status(404).json({ error: 'Ruta inexistente' }));

// ── Páginas ─────────────────────────────────────────────────────────────────
app.get('/', (req, res) => res.sendFile(path.join(PUBLIC, 'index.html')));
app.get('/app', (req, res) => res.sendFile(path.join(PUBLIC, 'app.html')));
app.use(express.static(PUBLIC, { index: false, maxAge: PROD ? '1h' : 0, etag: true }));

// ── Errores ─────────────────────────────────────────────────────────────────
app.use((err, req, res, next) => {
  if (err instanceof ErrorNegocio) return res.status(err.status).json({ error: err.message, codigo: err.codigo, ...(err.datos ? { datos: err.datos } : {}) });
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Datos mal formados' });
  if (err.type === 'entity.too.large') return res.status(413).json({ error: 'El archivo es muy pesado' });
  if (/Período cerrado|Registro inmutable|no se borran/.test(err.message || '')) return res.status(409).json({ error: err.message });
  console.error(err);
  res.status(500).json({ error: 'Error interno. Si se repite, avisá a soporte.' });
});

// ── Respaldo diario ─────────────────────────────────────────────────────────
function respaldar() {
  respaldos.respaldoDiario().catch(e => console.error('[respaldo] falló la copia diaria:', e.message));
}

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Fondo rotatorio · Círculo de Oficiales FAA · http://localhost:${PORT}`);
    respaldar();
    setInterval(respaldar, 60 * 60 * 1000).unref();
  });
}

module.exports = app;
