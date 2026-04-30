const express = require('express');
const path = require('path');
const { initDB } = require('./db');
const propertiesRouter = require('./routes/properties');
const authRouter = require('./routes/auth');

const app = express();
const PORT = process.env.PORT || 3000;

initDB();

app.use(express.json({ limit: '50mb' }));

app.use('/uploads', express.static(path.join(__dirname, '..', 'uploads')));

app.use(express.static(path.join(__dirname, '..'), {
  index: 'index.html',
  extensions: ['html']
}));

app.use('/api/properties', propertiesRouter);
app.use('/api/auth', authRouter);

app.get('*.html', (req, res) => {
  const filePath = path.join(__dirname, '..', req.path);
  res.sendFile(filePath);
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
