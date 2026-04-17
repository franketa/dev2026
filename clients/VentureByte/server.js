/* ============================================================
   VentureByte — Server
   - Sirve los estáticos (index, quienes-somos, que-hacemos, solicitud)
   - Expone POST /api/upload para archivos del formulario
   - Sirve /uploads/<filename> para que Web3Forms incluya la URL
     como texto en el email (evita la feature paga de adjuntos).
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
