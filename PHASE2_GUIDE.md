# MedCall AI — Phase 2 Implementation Guide

## What Phase 2 Delivers

Building on the single-call pipeline from Phase 1, Phase 2 adds:

```
Mass Calling Queue (Bull + Redis)
        ↓
Concurrent Call Orchestrator (up to N simultaneous calls)
        ↓
Real-time Dashboard (WebSocket / Socket.io)
        ↓
Human Escalation (Twilio Conference Bridge)
        ↓
Analytics & Reporting (per-drug, per-rep, per-region)
        ↓
Contact Management (import CSV, DNC list, call scheduling)
```

---

## New Files to Add

```
backend/
├── src/
│   ├── queues/
│   │   ├── callQueue.js          ← Bull queue setup (Redis-backed)
│   │   └── callWorker.js         ← Worker: dequeues and fires calls
│   ├── routes/
│   │   ├── campaigns.js          ← Campaign CRUD + launch
│   │   └── analytics.js          ← Aggregated stats endpoints
│   ├── models/
│   │   ├── Campaign.js           ← Batch call campaign model
│   │   └── Agent.js              ← Human agent model (for escalation)
│   ├── services/
│   │   ├── socketService.js      ← Socket.io real-time events
│   │   └── escalationService.js  ← Twilio conference bridge logic
│   └── scripts/
│       └── importContacts.js     ← CSV import utility

frontend/
└── src/
    ├── pages/
    │   ├── CampaignPage.jsx      ← Create & launch mass campaigns
    │   ├── AnalyticsPage.jsx     ← Charts, KPIs, export
    │   └── AgentConsolePage.jsx  ← Human agent escalation console
    ├── components/
    │   ├── LiveCallFeed.jsx      ← Real-time call status via WebSocket
    │   ├── CampaignCard.jsx      ← Campaign summary card
    │   └── LeadScoreChart.jsx    ← Recharts lead distribution
    └── hooks/
        └── useSocket.js          ← Socket.io React hook
```

---

## New Environment Variables

Add these to `backend/.env`:

```env
# ── Redis (for Bull queue) ───────────────────────────────────────────────────
REDIS_URL=redis://localhost:6379

# ── Concurrency ──────────────────────────────────────────────────────────────
MAX_CONCURRENT_CALLS=5          # how many simultaneous Twilio calls

# ── Human Escalation ─────────────────────────────────────────────────────────
ESCALATION_PHONE=+20xxxxxxxxxx  # your team's escalation number

# ── Socket.io ────────────────────────────────────────────────────────────────
CLIENT_URL=http://localhost:5173
```

---

## Setup Steps

### 1. Install new dependencies

```bash
cd backend
npm install bull ioredis socket.io csv-parser

cd ../frontend
npm install socket.io-client recharts
```

### 2. Install & run Redis (Windows)

```powershell
# Option A: Docker (recommended)
docker run -d -p 6379:6379 --name redis redis:alpine

# Option B: WSL
wsl --install
wsl -e sudo apt install redis-server
wsl -e redis-server
```

### 3. Update `backend/src/index.js`

Wrap the Express app with Socket.io and register new routes:

```js
const http   = require('http');
const { Server } = require('socket.io');
const { initSocket } = require('./services/socketService');

const server = http.createServer(app);
const io     = new Server(server, { cors: { origin: process.env.CLIENT_URL } });
initSocket(io);

// New routes
app.use('/api/campaigns', require('./routes/campaigns'));
app.use('/api/analytics', require('./routes/analytics'));

// Change app.listen → server.listen
server.listen(PORT, () => console.log(`🚀 MedCall running on port ${PORT}`));
```

---

## Feature 1: Mass Calling Queue

### `backend/src/queues/callQueue.js`

```js
const Bull  = require('bull');
const queue = new Bull('calls', process.env.REDIS_URL);
module.exports = queue;
```

### `backend/src/queues/callWorker.js`

```js
const queue   = require('./callQueue');
const Contact = require('../models/Contact');
const Script  = require('../models/Script');
const CallLog = require('../models/CallLog');
const session = require('../services/callSession');
const twilio  = require('twilio');

const client  = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
const BASE_URL = () => process.env.BASE_URL;

queue.process(Number(process.env.MAX_CONCURRENT_CALLS) || 5, async (job) => {
  const { contactId, scriptId, campaignId, initiatedBy } = job.data;

  const [contact, script] = await Promise.all([
    Contact.findById(contactId),
    Script.findById(scriptId),
  ]);

  if (!contact || contact.doNotCall) return { skipped: true };

  const callLog = await CallLog.create({
    contact: contact._id, script: script._id,
    status: 'initiated', startedAt: new Date(),
    initiatedBy, campaignId,
  });

  const tmpSession = session.create({ callSid: 'pending', contact, script, callLogId: callLog._id });
  const greeting   = await tmpSession.getGreeting();
  const audio      = await tmpSession.synthesize(greeting.speak, 'friendly');

  const call = await client.calls.create({
    to:   contact.phone,
    from: process.env.TWILIO_NUMBER,
    url:  `${BASE_URL()}/api/twilio/twiml/greeting`,
    statusCallback: `${BASE_URL()}/api/twilio/status`,
    statusCallbackEvent: ['initiated','ringing','answered','completed'],
    statusCallbackMethod: 'POST',
  });

  session.remove('pending');
  const real = session.create({ callSid: call.sid, contact, script, callLogId: callLog._id });
  real.history.push({ role: 'assistant', content: greeting.speak });
  real.turns.push({ role: 'ai', text: greeting.speak, timestamp: new Date() });

  await CallLog.findByIdAndUpdate(callLog._id, { twilioCallSid: call.sid });
  return { callSid: call.sid, callLogId: callLog._id };
});
```

---

## Feature 2: Campaign Model & Routes

### `backend/src/models/Campaign.js`

```js
const mongoose = require('mongoose');

const campaignSchema = new mongoose.Schema({
  name:        { type: String, required: true },
  script:      { type: mongoose.Schema.Types.ObjectId, ref: 'Script', required: true },
  contacts:    [{ type: mongoose.Schema.Types.ObjectId, ref: 'Contact' }],
  status:      { type: String, enum: ['draft','running','paused','completed'], default: 'draft' },
  createdBy:   { type: mongoose.Schema.Types.ObjectId, ref: 'User' },

  // Stats (updated as calls complete)
  totalCalls:     { type: Number, default: 0 },
  completedCalls: { type: Number, default: 0 },
  hotLeads:       { type: Number, default: 0 },
  warmLeads:      { type: Number, default: 0 },
  coldLeads:      { type: Number, default: 0 },
  avgScore:       { type: Number, default: 0 },

  startedAt:   { type: Date },
  completedAt: { type: Date },
}, { timestamps: true });

module.exports = mongoose.model('Campaign', campaignSchema);
```

### `backend/src/routes/campaigns.js`

```js
const router   = require('express').Router();
const auth     = require('../middleware/auth');
const Campaign = require('../models/Campaign');
const Contact  = require('../models/Contact');
const queue    = require('../queues/callQueue');

// GET /api/campaigns
router.get('/', auth, async (req, res) => {
  const campaigns = await Campaign.find().populate('script','name drugName').sort('-createdAt');
  res.json(campaigns);
});

// POST /api/campaigns — create a campaign
router.post('/', auth, async (req, res) => {
  try {
    const { name, scriptId, contactIds } = req.body;
    const campaign = await Campaign.create({
      name, script: scriptId,
      contacts: contactIds,
      createdBy: req.user._id,
      totalCalls: contactIds.length,
    });
    res.json(campaign);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/campaigns/:id/launch — enqueue all calls
router.post('/:id/launch', auth, async (req, res) => {
  try {
    const campaign = await Campaign.findById(req.params.id).populate('contacts');
    if (!campaign) return res.status(404).json({ error: 'Campaign not found' });

    await Campaign.findByIdAndUpdate(campaign._id, { status: 'running', startedAt: new Date() });

    for (const contact of campaign.contacts) {
      await queue.add({
        contactId:   contact._id,
        scriptId:    campaign.script,
        campaignId:  campaign._id,
        initiatedBy: req.user._id,
      }, {
        attempts: 2,
        backoff: { type: 'fixed', delay: 30_000 },
        removeOnComplete: true,
      });
    }

    res.json({ success: true, queued: campaign.contacts.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/campaigns/:id/pause
router.post('/:id/pause', auth, async (req, res) => {
  await queue.pause();
  await Campaign.findByIdAndUpdate(req.params.id, { status: 'paused' });
  res.json({ success: true });
});

module.exports = router;
```

---

## Feature 3: Real-time WebSocket Updates

### `backend/src/services/socketService.js`

```js
let _io = null;

function initSocket(io) {
  _io = io;
  io.on('connection', (socket) => {
    console.log('🔌 Client connected:', socket.id);
    socket.on('disconnect', () => console.log('🔌 Client disconnected:', socket.id));
  });
}

// Emit a call status update to all connected dashboards
function emitCallUpdate(callLog) {
  if (_io) _io.emit('call:update', callLog);
}

// Emit campaign progress
function emitCampaignProgress(campaignId, stats) {
  if (_io) _io.emit('campaign:progress', { campaignId, ...stats });
}

module.exports = { initSocket, emitCallUpdate, emitCampaignProgress };
```

**Hook into `callSession.js` `_finalize()`** — add after saving to MongoDB:

```js
const { emitCallUpdate } = require('./socketService');
// ...inside _finalize():
const updatedLog = await CallLog.findById(this.callLogId).populate('contact script');
emitCallUpdate(updatedLog);
```

### `frontend/src/hooks/useSocket.js`

```js
import { useEffect, useRef } from 'react';
import { io } from 'socket.io-client';

export function useSocket(onCallUpdate, onCampaignProgress) {
  const socketRef = useRef(null);

  useEffect(() => {
    socketRef.current = io(import.meta.env.VITE_API_URL || 'http://localhost:5000');

    socketRef.current.on('call:update',        onCallUpdate);
    socketRef.current.on('campaign:progress',  onCampaignProgress);

    return () => socketRef.current?.disconnect();
  }, []);
}
```

---

## Feature 4: Human Escalation (Conference Bridge)

### `backend/src/services/escalationService.js`

```js
const twilio = require('twilio');
const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

/**
 * Bridges an active AI call to a human agent via Twilio Conference.
 * @param {string} callSid   - The active Twilio call SID
 * @param {string} agentPhone - Human agent's phone number
 */
async function escalateToHuman(callSid, agentPhone) {
  const conferenceName = `escalation_${callSid}`;

  // Move the contact's call into a conference room
  await client.calls(callSid).update({
    twiml: `<Response>
      <Say language="ar-EG">لحظة من فضلك، بحولك لمتخصص.</Say>
      <Dial>
        <Conference>${conferenceName}</Conference>
      </Dial>
    </Response>`,
  });

  // Dial the human agent into the same conference
  await client.calls.create({
    to:   agentPhone,
    from: process.env.TWILIO_NUMBER,
    twiml: `<Response>
      <Say>Incoming escalated call from MedCall AI.</Say>
      <Dial>
        <Conference>${conferenceName}</Conference>
      </Dial>
    </Response>`,
  });

  return conferenceName;
}

module.exports = { escalateToHuman };
```

**Wire into `twilio.js`** — in the `ESCALATE` branch of `/twiml/respond`:

```js
const { escalateToHuman } = require('../services/escalationService');
// ...inside ESCALATE handling:
await escalateToHuman(CallSid, process.env.ESCALATION_PHONE);
```

---

## Feature 5: Analytics Route

### `backend/src/routes/analytics.js`

```js
const router  = require('express').Router();
const auth    = require('../middleware/auth');
const CallLog = require('../models/CallLog');

// GET /api/analytics/summary
router.get('/summary', auth, async (req, res) => {
  const { from, to, scriptId } = req.query;
  const match = {};
  if (from || to) match.createdAt = {};
  if (from) match.createdAt.$gte = new Date(from);
  if (to)   match.createdAt.$lte = new Date(to);
  if (scriptId) match.script = scriptId;

  const [totals, byLabel, byStatus, avgScore] = await Promise.all([
    CallLog.countDocuments(match),
    CallLog.aggregate([
      { $match: match },
      { $group: { _id: '$leadLabel', count: { $sum: 1 } } },
    ]),
    CallLog.aggregate([
      { $match: match },
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]),
    CallLog.aggregate([
      { $match: { ...match, leadScore: { $exists: true } } },
      { $group: { _id: null, avg: { $avg: '$leadScore' } } },
    ]),
  ]);

  res.json({
    totalCalls: totals,
    byLabel:    Object.fromEntries(byLabel.map(b => [b._id, b.count])),
    byStatus:   Object.fromEntries(byStatus.map(b => [b._id, b.count])),
    avgScore:   avgScore[0]?.avg?.toFixed(1) || 0,
  });
});

// GET /api/analytics/timeline — calls per day
router.get('/timeline', auth, async (req, res) => {
  const days = parseInt(req.query.days) || 30;
  const since = new Date(Date.now() - days * 86400_000);

  const data = await CallLog.aggregate([
    { $match: { createdAt: { $gte: since } } },
    { $group: {
      _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
      calls: { $sum: 1 },
      hot:   { $sum: { $cond: [{ $eq: ['$leadLabel','hot']  }, 1, 0] } },
      warm:  { $sum: { $cond: [{ $eq: ['$leadLabel','warm'] }, 1, 0] } },
    }},
    { $sort: { _id: 1 } },
  ]);

  res.json(data);
});

module.exports = router;
```

---

## Feature 6: CSV Contact Import

### `backend/src/scripts/importContacts.js`

```js
/**
 * Usage: node src/scripts/importContacts.js contacts.csv
 *
 * CSV format:
 * name,phone,type,specialty,region
 * د. أحمد محمد,+201001234567,physician,cardiology,Cairo
 */
require('dotenv').config();
const fs       = require('fs');
const csv      = require('csv-parser');
const mongoose = require('mongoose');
const Contact  = require('../models/Contact');

const file = process.argv[2];
if (!file) { console.error('Usage: node importContacts.js <file.csv>'); process.exit(1); }

mongoose.connect(process.env.MONGO_URI).then(async () => {
  const rows = [];
  fs.createReadStream(file)
    .pipe(csv())
    .on('data', row => rows.push(row))
    .on('end', async () => {
      let imported = 0, skipped = 0;
      for (const row of rows) {
        const exists = await Contact.findOne({ phone: row.phone });
        if (exists) { skipped++; continue; }
        await Contact.create({
          name:      row.name,
          phone:     row.phone,
          type:      row.type || 'physician',
          specialty: row.specialty,
          region:    row.region,
        });
        imported++;
      }
      console.log(`✅ Imported: ${imported}, Skipped (duplicate): ${skipped}`);
      process.exit(0);
    });
});
```

---

## Frontend: Campaign Page (skeleton)

### `frontend/src/pages/CampaignPage.jsx`

```jsx
import { useState, useEffect } from 'react';
import { useSocket } from '../hooks/useSocket';
import api from '../services/api';

export default function CampaignPage() {
  const [campaigns, setCampaigns] = useState([]);
  const [scripts,   setScripts]   = useState([]);
  const [contacts,  setContacts]  = useState([]);
  const [form, setForm] = useState({ name: '', scriptId: '', contactIds: [] });

  useSocket(
    (callUpdate) => { /* update live feed */ },
    (progress)   => {
      setCampaigns(prev => prev.map(c =>
        c._id === progress.campaignId ? { ...c, ...progress } : c
      ));
    }
  );

  useEffect(() => {
    Promise.all([
      api.get('/campaigns'),
      api.get('/scripts'),
      api.get('/contacts?limit=500'),
    ]).then(([c, s, ct]) => {
      setCampaigns(c.data);
      setScripts(s.data);
      setContacts(ct.data.contacts || []);
    });
  }, []);

  const launch = async (id) => {
    await api.post(`/campaigns/${id}/launch`);
    const res = await api.get('/campaigns');
    setCampaigns(res.data);
  };

  const create = async (e) => {
    e.preventDefault();
    const res = await api.post('/campaigns', form);
    setCampaigns(prev => [res.data, ...prev]);
  };

  return (
    <div style={{ padding: 24, direction: 'rtl', fontFamily: 'Cairo, sans-serif' }}>
      <h2>الحملات</h2>
      {/* Campaign creation form + list — implement UI here */}
      {campaigns.map(c => (
        <div key={c._id} style={{ background: '#fff', borderRadius: 12, padding: 20, marginBottom: 16, boxShadow: '0 2px 8px rgba(0,0,0,.06)' }}>
          <h3>{c.name}</h3>
          <p>الحالة: {c.status} | المكالمات: {c.completedCalls}/{c.totalCalls}</p>
          <p>🔥 {c.hotLeads} ساخن | 🟡 {c.warmLeads} دافئ | 🔵 {c.coldLeads} بارد</p>
          {c.status === 'draft' && (
            <button onClick={() => launch(c._id)}>🚀 إطلاق الحملة</button>
          )}
        </div>
      ))}
    </div>
  );
}
```

---

## Phase 2 Checklist

- [ ] Install Redis and verify it's running (`redis-cli ping` → `PONG`)
- [ ] Install new npm packages (Bull, ioredis, socket.io, csv-parser, recharts)
- [ ] Add new env vars to `backend/.env`
- [ ] Create `callQueue.js` and `callWorker.js`
- [ ] Create `Campaign.js` model
- [ ] Create `campaigns.js` and `analytics.js` routes
- [ ] Create `socketService.js` and wire into `callSession._finalize()`
- [ ] Create `escalationService.js` and wire into `twilio.js` ESCALATE branch
- [ ] Update `index.js` to use `http.createServer` + Socket.io + new routes
- [ ] Build `CampaignPage.jsx`, `AnalyticsPage.jsx`, `AgentConsolePage.jsx`
- [ ] Build `useSocket.js` hook and `LiveCallFeed.jsx` component
- [ ] Test: create campaign → launch → watch real-time updates → escalate one call
- [ ] Import a real CSV of contacts

---

## Phase 3 Preview (what comes next)

- **Fine-tuned TTS** — upload your own voice recordings, fine-tune XTTS-v2 on Egyptian dialect
- **Improved ASR** — domain-specific vocabulary list for drug names fed into Gemini prompt
- **CRM integrations** — export hot leads to Salesforce / HubSpot / Google Sheets
- **Multi-language support** — Gulf Arabic, Levantine dialect switching per contact region
- **Call scheduling** — respect physician office hours, retry failed calls at optimal times
- **A/B script testing** — run two script variants simultaneously, compare conversion rates
