/* ============================================================
   VentureByte — Server
   - Sirve los estáticos (index, quienes-somos, que-hacemos, solicitud)
   - Expone POST /api/upload para archivos del formulario
   - Sirve /uploads/<filename> para que Web3Forms incluya la URL
     como texto en el email (evita la feature paga de adjuntos).
   - API /api/tracker/* para el panel interno de tiempo (tracker.html).
     Datos en data/tracker.json. Claves via TRACKER_ADMIN_KEY /
     TRACKER_EMPLOYEE_KEY (env).
   ============================================================ */
import express from 'express';
import multer from 'multer';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const UPLOAD_DIR = path.join(__dirname, 'uploads');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const PORT = process.env.PORT || 3000;
const MAX_FILE_MB = 5;
const ALLOWED_MIMES = new Set([
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/webp',
  'image/svg+xml',
  'image/gif',
  'application/pdf',
]);

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', true);

// ---- Multer ----
const storage = multer.diskStorage({
  destination: UPLOAD_DIR,
  filename: (req, file, cb) => {
    const safeExt = path.extname(file.originalname).toLowerCase().slice(0, 10).replace(/[^.a-z0-9]/g, '');
    const id = crypto.randomBytes(16).toString('hex');
    cb(null, id + (safeExt || ''));
  },
});
const upload = multer({
  storage,
  limits: { fileSize: MAX_FILE_MB * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (!ALLOWED_MIMES.has(file.mimetype)) {
      return cb(new Error('Tipo de archivo no permitido (' + file.mimetype + ')'));
    }
    cb(null, true);
  },
});

// ---- Endpoint de upload ----
app.post('/api/upload', (req, res) => {
  upload.single('file')(req, res, (err) => {
    if (err) {
      const code = err.code === 'LIMIT_FILE_SIZE' ? 413 : 400;
      return res.status(code).json({ error: err.message });
    }
    if (!req.file) return res.status(400).json({ error: 'No se recibió ningún archivo' });
    const proto = req.get('x-forwarded-proto') || req.protocol;
    const host = req.get('host');
    const url = `${proto}://${host}/uploads/${req.file.filename}`;
    return res.json({
      url,
      filename: req.file.filename,
      size: req.file.size,
      originalName: req.file.originalname,
    });
  });
});

/* ============================================================
   Tracker de tiempo (panel interno)
   ============================================================ */
const DATA_DIR = path.join(__dirname, 'data');
const TRACKER_FILE = path.join(DATA_DIR, 'tracker.json');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const ADMIN_KEY = process.env.TRACKER_ADMIN_KEY || 'venture-admin';
const EMPLOYEE_KEY = process.env.TRACKER_EMPLOYEE_KEY || 'venture-equipo';
if (!process.env.TRACKER_ADMIN_KEY || !process.env.TRACKER_EMPLOYEE_KEY) {
  console.warn('[tracker] AVISO: usando claves por defecto. Configurá TRACKER_ADMIN_KEY y TRACKER_EMPLOYEE_KEY en el entorno.');
}

function loadTracker() {
  try {
    return JSON.parse(fs.readFileSync(TRACKER_FILE, 'utf8'));
  } catch {
    return { projects: [], entries: [] };
  }
}

function saveTracker(data) {
  const tmp = TRACKER_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  fs.renameSync(tmp, TRACKER_FILE);
}

function safeEqual(a, b) {
  const ba = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  return ba.length === bb.length && crypto.timingSafeEqual(ba, bb);
}

function roleFromKey(key) {
  if (key && safeEqual(key, ADMIN_KEY)) return 'admin';
  if (key && safeEqual(key, EMPLOYEE_KEY)) return 'employee';
  return null;
}

// Auth por header para todos los endpoints del tracker salvo login
const trackerAuth = (req, res, next) => {
  const role = roleFromKey(req.get('x-tracker-key'));
  if (!role) return res.status(401).json({ error: 'Clave inválida' });
  req.trackerRole = role;
  next();
};
const adminOnly = (req, res, next) => {
  if (req.trackerRole !== 'admin') return res.status(403).json({ error: 'Solo administrador' });
  next();
};

app.use('/api/tracker', express.json());

app.post('/api/tracker/login', (req, res) => {
  const role = roleFromKey(req.body?.key);
  if (!role) return res.status(401).json({ error: 'Clave inválida' });
  res.json({ role });
});

// Estado completo: proyectos, registros y el timer en curso (si hay)
app.get('/api/tracker/state', trackerAuth, (req, res) => {
  const data = loadTracker();
  const running = data.entries.find((e) => !e.end) || null;
  const projects = req.trackerRole === 'admin'
    ? data.projects
    : data.projects.filter((p) => p.active);
  res.json({ role: req.trackerRole, projects, entries: data.entries, running });
});

app.post('/api/tracker/start', trackerAuth, (req, res) => {
  const { projectId, memo } = req.body || {};
  const data = loadTracker();
  if (data.entries.some((e) => !e.end)) {
    return res.status(409).json({ error: 'Ya hay un timer en curso' });
  }
  const project = data.projects.find((p) => p.id === projectId && p.active);
  if (!project) return res.status(400).json({ error: 'Trabajo inválido o pausado' });
  const entry = {
    id: crypto.randomBytes(8).toString('hex'),
    projectId,
    memo: String(memo || '').slice(0, 500),
    start: new Date().toISOString(),
    end: null,
  };
  data.entries.push(entry);
  saveTracker(data);
  res.json({ running: entry });
});

app.post('/api/tracker/stop', trackerAuth, (req, res) => {
  const data = loadTracker();
  const running = data.entries.find((e) => !e.end);
  if (!running) return res.status(409).json({ error: 'No hay ningún timer en curso' });
  if (typeof req.body?.memo === 'string') running.memo = req.body.memo.slice(0, 500);
  running.end = new Date().toISOString();
  saveTracker(data);
  res.json({ entry: running });
});

// Descartar el timer en curso sin registrarlo
app.post('/api/tracker/cancel', trackerAuth, (req, res) => {
  const data = loadTracker();
  const idx = data.entries.findIndex((e) => !e.end);
  if (idx === -1) return res.status(409).json({ error: 'No hay ningún timer en curso' });
  data.entries.splice(idx, 1);
  saveTracker(data);
  res.json({ ok: true });
});

app.post('/api/tracker/projects', trackerAuth, adminOnly, (req, res) => {
  const name = String(req.body?.name || '').trim().slice(0, 100);
  if (!name) return res.status(400).json({ error: 'Falta el nombre del trabajo' });
  const data = loadTracker();
  const project = {
    id: crypto.randomBytes(8).toString('hex'),
    name,
    active: true,
    createdAt: new Date().toISOString(),
  };
  data.projects.push(project);
  saveTracker(data);
  res.json({ project });
});

app.post('/api/tracker/projects/:id', trackerAuth, adminOnly, (req, res) => {
  const data = loadTracker();
  const project = data.projects.find((p) => p.id === req.params.id);
  if (!project) return res.status(404).json({ error: 'Trabajo no encontrado' });
  if (typeof req.body?.name === 'string' && req.body.name.trim()) {
    project.name = req.body.name.trim().slice(0, 100);
  }
  if (typeof req.body?.active === 'boolean') project.active = req.body.active;
  saveTracker(data);
  res.json({ project });
});

app.delete('/api/tracker/entries/:id', trackerAuth, adminOnly, (req, res) => {
  const data = loadTracker();
  const idx = data.entries.findIndex((e) => e.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Registro no encontrado' });
  data.entries.splice(idx, 1);
  saveTracker(data);
  res.json({ ok: true });
});

// ---- Healthcheck (Coolify lo suele usar) ----
app.get('/healthz', (req, res) => res.json({ ok: true }));

// ---- Servir uploads + estáticos ----
app.use('/uploads', express.static(UPLOAD_DIR, {
  maxAge: '365d',
  immutable: true,
  index: false,
}));
app.use(express.static(__dirname, {
  index: 'index.html',
  extensions: ['html'],
}));

// 404 simple
app.use((req, res) => res.status(404).send('No encontrado'));

app.listen(PORT, () => {
  console.log(`[venturebyte] escuchando en http://localhost:${PORT}`);
  console.log(`[venturebyte] uploads en ${UPLOAD_DIR}`);
});
