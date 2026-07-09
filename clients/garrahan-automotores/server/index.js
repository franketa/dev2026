const express = require('express');
const path = require('path');
const { initDB } = require('./db');
const vehiclesRouter = require('./routes/vehicles');
const authRouter = require('./routes/auth');

const app = express();
const PORT = process.env.PORT || 3000;

// Initialize database
initDB();

// Middleware
app.use(express.json({ limit: '50mb' }));

// Serve uploaded images
app.use('/uploads', express.static(path.join(__dirname, '..', 'uploads')));

// Serve static files (HTML, CSS, JS, assets)
app.use(express.static(path.join(__dirname, '..'), {
  index: 'index.html',
  extensions: ['html']
}));

// API routes
app.use('/api/vehicles', vehiclesRouter);
app.use('/api/auth', authRouter);

// Multer / generic error handler
app.use((err, req, res, next) => {
  if (err) {
    return res.status(400).json({ error: err.message || 'Error en la solicitud' });
  }
  next();
});

app.listen(PORT, () => {
  console.log(`Garrahan — Negocio de Automotores server running on port ${PORT}`);
});
