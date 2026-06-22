const express = require('express');
const path = require('path');
const { initDB } = require('./db');
const contactsRouter = require('./routes/contacts');
const authRouter = require('./routes/auth');

const app = express();
const PORT = process.env.PORT || 3000;

initDB();

app.use(express.json({ limit: '2mb' }));

// API routes
app.use('/api/contacts', contactsRouter);
app.use('/api/auth', authRouter);

// Static files (index.html, admin.html, assets)
app.use(
  express.static(path.join(__dirname, '..'), {
    index: 'index.html',
    extensions: ['html']
  })
);

app.listen(PORT, () => {
  console.log(`Sinergia server running on port ${PORT}`);
});
