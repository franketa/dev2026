/* ============================================================
   VentureByte — Server
   - Sirve los estáticos (index, quienes-somos, que-hacemos, solicitud)
   - Expone POST /api/upload para archivos del formulario
   - Sirve /uploads/<filename> para que Web3Forms incluya la URL
     como texto en el email (evita la feature paga de adjuntos).
   - API /api/tracker/* para el panel interno (tracker.html): tiempo
     y tareas. Datos en data/tracker.json.
     Acceso: claves compartidas TRACKER_ADMIN_KEY / TRACKER_EMPLOYEE_KEY
     (env) o usuarios con email + clave (TRACKER_USERS, JSON en env).
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

// Usuarios con cuenta propia (email + clave). Se pueden sobreescribir con
// TRACKER_USERS='[{"email":"...","password":"...","name":"...","role":"employee"}]'
// Franco entra con la misma clave de admin (TRACKER_ADMIN_KEY).
const DEFAULT_USERS = [
  { email: 'franco@venturebyte.com.ar', password: ADMIN_KEY, name: 'Franco', role: 'admin' },
  { email: 'lucas@venturebyte.com.ar', password: '123456', name: 'Lucas', role: 'employee' },
];
let USERS = DEFAULT_USERS;
if (process.env.TRACKER_USERS) {
  try {
    const parsed = JSON.parse(process.env.TRACKER_USERS);
    if (Array.isArray(parsed)) USERS = parsed;
  } catch {
    console.warn('[tracker] TRACKER_USERS no es JSON válido, usando usuarios por defecto.');
  }
}
USERS = USERS
  .filter((u) => u && u.email && u.password)
  .map((u) => ({
    email: String(u.email).trim().toLowerCase(),
    password: String(u.password),
    name: String(u.name || String(u.email).split('@')[0]).trim().slice(0, 60),
    role: u.role === 'admin' ? 'admin' : 'employee',
  }));
if (!process.env.TRACKER_USERS) {
  console.warn('[tracker] AVISO: usuarios por defecto activos. Configurá TRACKER_USERS para cambiar claves.');
}
const ADMIN_USER = { email: null, name: 'Admin', role: 'admin' };
const TEAM_USER = { email: null, name: 'Equipo', role: 'employee' };
const publicUser = (u) => ({ email: u.email, name: u.name, role: u.role });

function loadTracker() {
  let data;
  try {
    data = JSON.parse(fs.readFileSync(TRACKER_FILE, 'utf8'));
  } catch {
    data = {};
  }
  if (!Array.isArray(data.projects)) data.projects = [];
  if (!Array.isArray(data.entries)) data.entries = [];
  if (!Array.isArray(data.tasks)) data.tasks = [];
  return data;
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

// Devuelve el usuario autenticado o null. Si viene email, valida contra
// USERS; si no, contra las claves compartidas (admin / equipo).
function authenticate(email, key) {
  if (!key) return null;
  const mail = String(email || '').trim().toLowerCase();
  if (mail) {
    const u = USERS.find((x) => x.email === mail);
    return u && safeEqual(key, u.password) ? publicUser(u) : null;
  }
  if (safeEqual(key, ADMIN_KEY)) return ADMIN_USER;
  if (safeEqual(key, EMPLOYEE_KEY)) return TEAM_USER;
  return null;
}

// Auth por header para todos los endpoints del tracker salvo login
const trackerAuth = (req, res, next) => {
  const user = authenticate(req.get('x-tracker-user'), req.get('x-tracker-key'));
  if (!user) return res.status(401).json({ error: 'Clave inválida' });
  req.trackerRole = user.role;
  req.trackerUser = user;
  next();
};
const adminOnly = (req, res, next) => {
  if (req.trackerRole !== 'admin') return res.status(403).json({ error: 'Solo administrador' });
  next();
};

app.use('/api/tracker', express.json());

app.post('/api/tracker/login', (req, res) => {
  const user = authenticate(req.body?.email, req.body?.key);
  if (!user) return res.status(401).json({ error: 'Usuario o clave inválidos' });
  res.json({ role: user.role, user });
});

// Estado completo: proyectos, registros, tareas y el timer en curso (si hay)
app.get('/api/tracker/state', trackerAuth, (req, res) => {
  const data = loadTracker();
  const running = data.entries.find((e) => !e.end) || null;
  const projects = req.trackerRole === 'admin'
    ? data.projects
    : data.projects.filter((p) => p.active);
  res.json({
    role: req.trackerRole,
    user: req.trackerUser,
    users: USERS.map(publicUser),
    projects,
    entries: data.entries,
    tasks: data.tasks,
    running,
  });
});

app.post('/api/tracker/start', trackerAuth, (req, res) => {
  const { projectId, memo } = req.body || {};
  const data = loadTracker();
  if (data.entries.some((e) => !e.end)) {
    return res.status(409).json({ error: 'Ya hay un timer en curso' });
  }
  const project = data.projects.find((p) => p.id === projectId && p.active);
  if (!project) return res.status(400).json({ error: 'Trabajo inválido o pausado' });
  const task = req.body?.taskId ? data.tasks.find((t) => t.id === req.body.taskId) : null;
  const entry = {
    id: crypto.randomBytes(8).toString('hex'),
    projectId,
    memo: String(memo || '').slice(0, 500),
    start: new Date().toISOString(),
    end: null,
    pauses: [],
    user: req.trackerUser.email || null,
    taskId: task ? task.id : null,
  };
  data.entries.push(entry);
  saveTracker(data);
  res.json({ running: entry });
});

// Pausar / reanudar el timer en curso
app.post('/api/tracker/pause', trackerAuth, (req, res) => {
  const data = loadTracker();
  const running = data.entries.find((e) => !e.end);
  if (!running) return res.status(409).json({ error: 'No hay ningún timer en curso' });
  running.pauses = running.pauses || [];
  if (running.pauses.some((p) => !p.end)) return res.status(409).json({ error: 'El timer ya está en pausa' });
  running.pauses.push({ start: new Date().toISOString(), end: null });
  saveTracker(data);
  res.json({ running });
});

app.post('/api/tracker/resume', trackerAuth, (req, res) => {
  const data = loadTracker();
  const running = data.entries.find((e) => !e.end);
  const open = running && (running.pauses || []).find((p) => !p.end);
  if (!open) return res.status(409).json({ error: 'El timer no está en pausa' });
  open.end = new Date().toISOString();
  saveTracker(data);
  res.json({ running });
});

app.post('/api/tracker/stop', trackerAuth, (req, res) => {
  const data = loadTracker();
  const running = data.entries.find((e) => !e.end);
  if (!running) return res.status(409).json({ error: 'No hay ningún timer en curso' });
  if (typeof req.body?.memo === 'string') running.memo = req.body.memo.slice(0, 500);
  const now = new Date().toISOString();
  const openPause = (running.pauses || []).find((p) => !p.end);
  if (openPause) openPause.end = now;
  running.end = now;
  saveTracker(data);
  res.json({ entry: running });
});

// Cambiar el trabajo del timer en curso
app.post('/api/tracker/running', trackerAuth, (req, res) => {
  const data = loadTracker();
  const running = data.entries.find((e) => !e.end);
  if (!running) return res.status(409).json({ error: 'No hay ningún timer en curso' });
  const project = data.projects.find((p) => p.id === req.body?.projectId && p.active);
  if (!project) return res.status(400).json({ error: 'Trabajo inválido o pausado' });
  running.projectId = project.id;
  saveTracker(data);
  res.json({ running });
});

// Carga manual de tiempo (intervalo ya terminado)
app.post('/api/tracker/manual', trackerAuth, (req, res) => {
  const { projectId, memo, start, end } = req.body || {};
  const data = loadTracker();
  const project = data.projects.find((p) => p.id === projectId && p.active);
  if (!project) return res.status(400).json({ error: 'Trabajo inválido o pausado' });
  const s = new Date(start);
  const e = new Date(end);
  if (isNaN(s) || isNaN(e)) return res.status(400).json({ error: 'Fecha u horario inválidos' });
  if (e <= s) return res.status(400).json({ error: 'La hora de fin debe ser posterior a la de inicio' });
  if (e - s > 24 * 60 * 60 * 1000) return res.status(400).json({ error: 'El registro no puede superar 24 horas' });
  if (s > new Date()) return res.status(400).json({ error: 'No se puede registrar tiempo en el futuro' });
  const entry = {
    id: crypto.randomBytes(8).toString('hex'),
    projectId,
    memo: String(memo || '').slice(0, 500),
    start: s.toISOString(),
    end: e.toISOString(),
    manual: true,
    user: req.trackerUser.email || null,
  };
  data.entries.push(entry);
  saveTracker(data);
  res.json({ entry });
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

/* ============================================================
   Tareas (tablero tipo kanban básico)
   ============================================================ */
const TASK_STATUSES = ['todo', 'doing', 'review', 'done'];
const TASK_STATUS_LABEL = { todo: 'Por hacer', doing: 'En curso', review: 'Para revisar', done: 'Listo' };
const TASK_PRIORITIES = ['baja', 'normal', 'alta'];
const MAX_TITLE = 140;
const MAX_DESC = 4000;
const MAX_COMMENT = 2000;

const newId = () => crypto.randomBytes(8).toString('hex');
const cleanStr = (v, max) => String(v ?? '').trim().slice(0, max);
const isAdmin = (req) => req.trackerRole === 'admin';
const canEditTask = (req, task) => isAdmin(req) || (!!task.createdBy && task.createdBy === req.trackerUser.email);

// null = sin responsable; undefined = inválido
function validAssignee(email) {
  if (email == null || email === '') return null;
  const mail = String(email).trim().toLowerCase();
  return USERS.some((u) => u.email === mail) ? mail : undefined;
}

function validDue(v) {
  if (v == null || v === '') return null;
  return /^\d{4}-\d{2}-\d{2}$/.test(String(v)) && !isNaN(new Date(v)) ? String(v) : undefined;
}

function systemComment(task, text) {
  task.comments.push({ id: newId(), author: null, authorName: null, text, at: new Date().toISOString(), system: true });
}

app.post('/api/tracker/tasks', trackerAuth, (req, res) => {
  const b = req.body || {};
  const title = cleanStr(b.title, MAX_TITLE);
  if (!title) return res.status(400).json({ error: 'Falta el título de la tarea' });
  const data = loadTracker();
  const status = TASK_STATUSES.includes(b.status) ? b.status : 'todo';
  const priority = TASK_PRIORITIES.includes(b.priority) ? b.priority : 'normal';
  const projectId = b.projectId && data.projects.some((p) => p.id === b.projectId) ? b.projectId : null;
  // El empleado siempre se asigna a sí mismo; el admin elige
  let assignee = req.trackerUser.email;
  if (isAdmin(req)) {
    assignee = validAssignee(b.assignee);
    if (assignee === undefined) return res.status(400).json({ error: 'Responsable inválido' });
  }
  const dueDate = validDue(b.dueDate);
  if (dueDate === undefined) return res.status(400).json({ error: 'Fecha límite inválida' });
  const now = new Date().toISOString();
  const task = {
    id: newId(),
    title,
    description: cleanStr(b.description, MAX_DESC),
    status,
    priority,
    projectId,
    assignee,
    dueDate,
    createdAt: now,
    updatedAt: now,
    createdBy: req.trackerUser.email || null,
    createdByName: req.trackerUser.name,
    comments: [],
  };
  data.tasks.push(task);
  saveTracker(data);
  res.json({ task });
});

app.patch('/api/tracker/tasks/:id', trackerAuth, (req, res) => {
  const b = req.body || {};
  const data = loadTracker();
  const task = data.tasks.find((t) => t.id === req.params.id);
  if (!task) return res.status(404).json({ error: 'Tarea no encontrada' });
  const editor = canEditTask(req, task);
  let changed = false;

  // Cualquiera con acceso puede mover de estado
  if (typeof b.status === 'string' && b.status !== task.status) {
    if (!TASK_STATUSES.includes(b.status)) return res.status(400).json({ error: 'Estado inválido' });
    systemComment(task, `${req.trackerUser.name} movió la tarea a “${TASK_STATUS_LABEL[b.status]}”`);
    task.status = b.status;
    changed = true;
  }

  // Título, descripción, trabajo, prioridad y fecha: admin o quien la creó
  const wantsEdit = ['title', 'description', 'projectId', 'priority', 'dueDate', 'assignee'].some((k) => k in b);
  if (wantsEdit && !editor) return res.status(403).json({ error: 'Solo el administrador o quien creó la tarea puede editarla' });
  if (editor) {
    if ('title' in b) {
      const title = cleanStr(b.title, MAX_TITLE);
      if (!title) return res.status(400).json({ error: 'El título no puede quedar vacío' });
      if (title !== task.title) { task.title = title; changed = true; }
    }
    if ('description' in b) {
      const d = cleanStr(b.description, MAX_DESC);
      if (d !== task.description) { task.description = d; changed = true; }
    }
    if ('projectId' in b) {
      const pid = b.projectId && data.projects.some((p) => p.id === b.projectId) ? b.projectId : null;
      if (pid !== task.projectId) { task.projectId = pid; changed = true; }
    }
    if ('priority' in b) {
      if (!TASK_PRIORITIES.includes(b.priority)) return res.status(400).json({ error: 'Prioridad inválida' });
      if (b.priority !== task.priority) { task.priority = b.priority; changed = true; }
    }
    if ('dueDate' in b) {
      const due = validDue(b.dueDate);
      if (due === undefined) return res.status(400).json({ error: 'Fecha límite inválida' });
      if (due !== task.dueDate) { task.dueDate = due; changed = true; }
    }
    if ('assignee' in b) {
      if (!isAdmin(req)) return res.status(403).json({ error: 'Solo el administrador puede reasignar' });
      const a = validAssignee(b.assignee);
      if (a === undefined) return res.status(400).json({ error: 'Responsable inválido' });
      if (a !== task.assignee) {
        const who = a ? ((USERS.find((u) => u.email === a) || {}).name || a) : 'nadie';
        systemComment(task, `${req.trackerUser.name} asignó la tarea a ${who}`);
        task.assignee = a;
        changed = true;
      }
    }
  }

  if (changed) {
    task.updatedAt = new Date().toISOString();
    saveTracker(data);
  }
  res.json({ task });
});

app.delete('/api/tracker/tasks/:id', trackerAuth, adminOnly, (req, res) => {
  const data = loadTracker();
  const idx = data.tasks.findIndex((t) => t.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Tarea no encontrada' });
  data.tasks.splice(idx, 1);
  saveTracker(data);
  res.json({ ok: true });
});

app.post('/api/tracker/tasks/:id/comments', trackerAuth, (req, res) => {
  const text = cleanStr(req.body?.text, MAX_COMMENT);
  if (!text) return res.status(400).json({ error: 'El comentario está vacío' });
  const data = loadTracker();
  const task = data.tasks.find((t) => t.id === req.params.id);
  if (!task) return res.status(404).json({ error: 'Tarea no encontrada' });
  const comment = {
    id: newId(),
    author: req.trackerUser.email || null,
    authorName: req.trackerUser.name,
    authorRole: req.trackerRole,
    text,
    at: new Date().toISOString(),
  };
  task.comments.push(comment);
  task.updatedAt = comment.at;
  saveTracker(data);
  res.json({ task, comment });
});

app.delete('/api/tracker/tasks/:id/comments/:cid', trackerAuth, (req, res) => {
  const data = loadTracker();
  const task = data.tasks.find((t) => t.id === req.params.id);
  if (!task) return res.status(404).json({ error: 'Tarea no encontrada' });
  const idx = task.comments.findIndex((c) => c.id === req.params.cid);
  if (idx === -1) return res.status(404).json({ error: 'Comentario no encontrado' });
  const c = task.comments[idx];
  const own = !!c.author && c.author === req.trackerUser.email;
  if (!isAdmin(req) && !own) return res.status(403).json({ error: 'Solo podés borrar tus propios comentarios' });
  task.comments.splice(idx, 1);
  saveTracker(data);
  res.json({ task });
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
