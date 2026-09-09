const express = require('express');
const path = require('path');
const { initDB } = require('./db');
const productsRouter = require('./routes/products');
const authRouter = require('./routes/auth');

const app = express();
const PORT = process.env.PORT || 3000;
const PROD = process.env.NODE_ENV === 'production';

initDB();

app.disable('x-powered-by');
app.use(express.json({ limit: '5mb' }));

// Fotos subidas desde el panel (volumen persistente en producción)
app.use('/uploads', express.static(path.join(__dirname, '..', 'uploads'), { maxAge: PROD ? '30d' : 0 }));

// Rutas "bonitas" del catálogo
app.get('/catalogo', (req, res) => res.sendFile(path.join(__dirname, '..', 'catalogo.html')));
app.get('/producto/:slug', (req, res) => res.sendFile(path.join(__dirname, '..', 'producto.html')));
app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, '..', 'admin.html')));

app.use(express.static(path.join(__dirname, '..'), {
  index: 'index.html',
  extensions: ['html'],
  maxAge: PROD ? '1h' : 0,
  etag: true
}));

app.use('/api/products', productsRouter);
app.use('/api/auth', authRouter);

app.use((err, req, res, next) => {
  if (err) return res.status(400).json({ error: err.message || 'Error en la solicitud' });
  next();
});

app.listen(PORT, () => {
  console.log(`Aluminios Ruta 5 · servidor en http://localhost:${PORT}`);
});
