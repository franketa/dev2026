const express = require('express');
const path = require('path');
const { initDB } = require('./db');
const authRouter = require('./routes/auth');
const clientesRouter = require('./routes/clientes');

const app = express();
const PORT = process.env.PORT || 3000;

initDB();

app.use(express.json({ limit: '5mb' }));

// Material subido (videos, packs, exports)
app.use('/uploads', express.static(path.join(__dirname, '..', 'uploads')));

// Sitio estático (landing, portal, admin)
app.use(express.static(path.join(__dirname, '..'), {
  index: 'index.html',
  extensions: ['html']
}));

// API
app.use('/api/auth', authRouter);
app.use('/api', clientesRouter);

// Multer / errores genéricos
app.use((err, req, res, next) => {
  if (err) {
    const msg = err.code === 'LIMIT_FILE_SIZE'
      ? 'El archivo supera el límite de 800 MB'
      : (err.message || 'Error en la solicitud');
    return res.status(400).json({ error: msg });
  }
  next();
});

app.listen(PORT, () => {
  console.log(`VENTURE. UGC Studio corriendo en puerto ${PORT}`);
});
