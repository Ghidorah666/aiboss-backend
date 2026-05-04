require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');

const authRoutes = require('./routes/auth');
const taskRoutes = require('./routes/tasks');
const paymentRoutes = require('./routes/payment');
const { initDB } = require('./models/db');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

app.use('/api/auth', authRoutes);
app.use('/api/tasks', taskRoutes);
app.use('/api/payment', paymentRoutes);

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.get('*', (req, res) => {
  if (!req.path.startsWith('/api')) {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
  }
});

app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

async function start(port = PORT) {
  await initDB();
  return app.listen(port, () => {
    const address = typeof port === 'number' && port === 0 ? 'random available port' : port;
    console.log(`AIBoss server listening on ${address}`);
  });
}

if (require.main === module) {
  start().catch(error => {
    console.error('Failed to start AIBoss server:', error);
    process.exit(1);
  });
}

module.exports = { app, start };
