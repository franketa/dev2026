const express = require('express');
const path = require('path');
const { initDB } = require('./db');
const propertiesRouter = require('./routes/properties');
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
app.use('/api/properties', propertiesRouter);
app.use('/api/auth', authRouter);

// SPA fallback for HTML pages
app.get('*.html', (req, res) => {
  const filePath = path.join(__dirname, '..', req.path);
  res.sendFile(filePath);
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
