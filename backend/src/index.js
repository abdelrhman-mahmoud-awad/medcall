const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

// Fail fast if critical env vars are missing
const required = ['JWT_SECRET', 'MONGO_URI'];
const missing = required.filter(k => !process.env[k]);
if (missing.length) {
  console.error(`❌ Missing required env vars: ${missing.join(', ')}`);
  console.error(`   Check that backend/.env exists and contains these keys.`);
  process.exit(1);
}

const express  = require('express');
const cors     = require('cors');
const mongoose = require('mongoose');

const app = express();

// ── Middleware ────────────────────────────────────────────────────────────────
app.use(cors({ origin: process.env.CLIENT_URL || 'http://localhost:5173' }));
app.use(express.json());
// Twilio sends form-encoded webhook bodies
app.use(express.urlencoded({ extended: false }));

// ── Routes ────────────────────────────────────────────────────────────────────
app.use('/api/auth',    require('./routes/auth'));
app.use('/api/contacts',require('./routes/contacts'));
app.use('/api/calls',   require('./routes/calls'));
app.use('/api/scripts', require('./routes/scripts'));
app.use('/api/twilio',  require('./routes/twilio'));

// ── Health check ──────────────────────────────────────────────────────────────
app.get('/health', (_, res) => res.json({ status: 'ok', time: new Date() }));

// ── 404 ───────────────────────────────────────────────────────────────────────
app.use((_, res) => res.status(404).json({ error: 'Route not found' }));

// ── Global error handler ──────────────────────────────────────────────────────
app.use((err, _, res, __) => {
  console.error(err);
  res.status(500).json({ error: err.message || 'Internal server error' });
});

// ── MongoDB + start server ────────────────────────────────────────────────────
mongoose.connect(process.env.MONGO_URI)
  .then(() => {
    console.log('✅ MongoDB connected');
    const PORT = process.env.PORT || 5000;
    app.listen(PORT, () =>
      console.log(`🚀 MedCall backend running on http://localhost:${PORT}`)
    );
  })
  .catch(err => {
    console.error('❌ MongoDB connection failed:', err.message);
    process.exit(1);
  });
