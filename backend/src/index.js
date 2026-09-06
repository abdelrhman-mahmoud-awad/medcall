const path = require('path');
const fs = require('fs');
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
const http     = require('http');
const { Server }     = require('socket.io');
const { initSocket } = require('./services/socketService');

const app = express();

// ── Middleware ────────────────────────────────────────────────────────────────
const allowedOrigins = new Set(
  [
    process.env.CLIENT_URL,
    process.env.PUBLIC_URL,
    process.env.BASE_URL,
    'http://localhost:5173',
    'http://127.0.0.1:5173',
    'http://localhost:5000',
    'http://127.0.0.1:5000',
  ].filter(Boolean).map((origin) => origin.replace(/\/$/, ''))
);

const isAllowedOrigin = (origin) => {
  if (!origin) return true;
  const normalized = origin.replace(/\/$/, '');
  if (allowedOrigins.has(normalized)) return true;
  // Vercel creates a new preview hostname for each deployment.
  if (/^https:\/\/medcall(?:-[a-z0-9-]+)?\.vercel\.app$/i.test(normalized)) return true;
  return normalized.startsWith('chrome-extension://');
};

app.use(cors({
  origin: (origin, cb) => {
    if (isAllowedOrigin(origin)) return cb(null, true);
    return cb(new Error(`CORS blocked for origin: ${origin}`));
  },
}));
app.use(express.json());
// Twilio sends form-encoded webhook bodies
app.use(express.urlencoded({ extended: false }));

// ── Routes ────────────────────────────────────────────────────────────────────
app.use('/api/auth',    require('./routes/auth'));
app.use('/api/contacts',require('./routes/contacts'));
app.use('/api/calls',   require('./routes/calls'));
app.use('/api/scripts', require('./routes/scripts'));
app.use('/api/twilio',  require('./routes/twilio'));
app.use('/api/excel',   require('./routes/excel'));
app.use('/api/campaigns', require('./routes/campaigns'));
app.use('/api/analytics', require('./routes/analytics'));
app.use('/api/agents',    require('./routes/agents'));
app.use('/api/recordings', require('./routes/recordings'));
app.use('/api/data-entry', require('./routes/dataEntry'));
app.use('/api/extension',  require('./routes/extension'));
app.use('/api/integrations', require('./routes/integrations'));
app.use('/api/projects',   require('./routes/projects'));

// ── Health check ──────────────────────────────────────────────────────────────
app.get('/health', (_, res) => res.json({ status: 'ok', time: new Date() }));

// ── Frontend shell (serve built React app when available) ────────────────────
const frontendDist = path.resolve(__dirname, '../../frontend/dist');
const frontendIndex = path.join(frontendDist, 'index.html');

if (fs.existsSync(frontendIndex)) {
  app.use(express.static(frontendDist));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api')) return next();
    res.sendFile(frontendIndex);
  });
} else {
  app.get('/', (_, res) => {
    res.json({
      status: 'ok',
      service: 'medcall-backend',
      frontend: process.env.CLIENT_URL || 'http://localhost:5173',
    });
  });
}

// ── 404 ───────────────────────────────────────────────────────────────────────
app.use((_, res) => res.status(404).json({ error: 'Route not found' }));

// ── Global error handler ──────────────────────────────────────────────────────
app.use((err, _, res, __) => {
  console.error(err);
  res.status(500).json({ error: err.message || 'Internal server error' });
});

// ── HTTP server + Socket.io (Phase 2 real-time dashboard) ────────────────────
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: (origin, cb) => cb(null, isAllowedOrigin(origin)) },
});
initSocket(io);

// ── MongoDB + start server ────────────────────────────────────────────────────
mongoose.connect(process.env.MONGO_URI)
  .then(() => {
    console.log('✅ MongoDB connected');

    // Phase 2: start the campaign call worker (no-op if REDIS_URL isn't set)
    require('./queues/callWorker').start();

    // Phase 4: start the Drive upload worker (no-op if REDIS_URL isn't set)
    require('./queues/uploadQueue').startWorker();

    const PORT = process.env.PORT || 5000;
    server.listen(PORT, () =>
      console.log(`🚀 MedCall backend running on http://localhost:${PORT}`)
    );
  })
  .catch(err => {
    console.error('❌ MongoDB connection failed:', err.message);
    process.exit(1);
  });
