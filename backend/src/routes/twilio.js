/**
 * twilio.js  —  Twilio webhook routes + outbound call initiation
 *
 * Flow:
 *  1. POST /api/twilio/call          → initiates outbound call, creates CallLog
 *  2. GET  /api/twilio/twiml/greeting → Twilio fetches this when call connects
 *  3. POST /api/twilio/twiml/respond  → Twilio posts each recording here
 *  4. POST /api/twilio/status         → Twilio posts call status changes here
 *
 * TwiML strategy:
 *  - We use <Say> with language="ar-EG" for a quick fallback OR
 *  - <Play> a pre-synthesized MP3 served from our /api/twilio/audio/:sid endpoint
 *  - After each AI utterance we use <Record> to capture the contact's response
 */

const router   = require('express').Router();
const twilio   = require('twilio');
const auth     = require('../middleware/auth');
const Contact  = require('../models/Contact');
const Script   = require('../models/Script');
const CallLog  = require('../models/CallLog');
const session  = require('../services/callSession');

const client = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);

const getBaseUrl = (req) => {
  const configured = (process.env.PUBLIC_URL || process.env.BASE_URL || '').trim();
  if (configured) return configured.replace(/\/$/, '');

  const proto = req.get('x-forwarded-proto') || req.protocol || 'https';
  const host = req.get('x-forwarded-host') || req.get('host');
  if (host) return `${proto}://${host}`;

  return 'https://medcall2025.loca.lt';
};

// ─── In-memory audio cache (MP3 buffers keyed by callSid_turnIndex) ──────────
const audioCache = new Map();

// ─── 1. Initiate an outbound call ─────────────────────────────────────────────
// POST /api/twilio/call
// Body: { contactId, scriptId }
router.post('/call', auth, async (req, res) => {
  try {
    const { contactId, scriptId } = req.body;
    if (!contactId || !scriptId)
      return res.status(400).json({ error: 'contactId and scriptId required' });

    const [contact, script] = await Promise.all([
      Contact.findById(contactId),
      Script.findById(scriptId),
    ]);

    if (!contact) return res.status(404).json({ error: 'Contact not found' });
    if (!script)  return res.status(404).json({ error: 'Script not found' });
    if (contact.doNotCall) return res.status(400).json({ error: 'Contact is on DNC list' });

    // Create call log entry (status = initiated)
    const callLog = await CallLog.create({
      contact:     contact._id,
      script:      script._id,
      status:      'initiated',
      startedAt:   new Date(),
      initiatedBy: req.user._id,
    });

    // Pre-generate the greeting audio
    const tmpSession = session.create({
      callSid:   'pending',
      contact,
      script,
      callLogId: callLog._id,
    });

    const greeting = await tmpSession.getGreeting();
    const greetingAudio = await tmpSession.synthesize(greeting.speak, 'friendly');

    // Initiate Twilio outbound call
    const call = await client.calls.create({
      to:     contact.phone,
      from:   process.env.TWILIO_NUMBER,
      url:    `${getBaseUrl(req)}/api/twilio/twiml/greeting`,
      method: 'GET',
      statusCallback: `${getBaseUrl(req)}/api/twilio/status`,
      statusCallbackEvent: ['initiated', 'ringing', 'answered', 'completed'],
      statusCallbackMethod: 'POST',
      record: false,  // we record per-turn, not the whole call
    });

    // Re-key the session with the real CallSid
    session.remove('pending');
    const realSession = session.create({
      callSid:   call.sid,
      contact,
      script,
      callLogId: callLog._id,
    });
    // Replay what we already generated
    realSession.history.push({ role: 'assistant', content: greeting.speak });
    realSession.turns.push({ role: 'ai', text: greeting.speak, timestamp: new Date() });

    // Cache the greeting audio
    audioCache.set(`${call.sid}_greeting`, greetingAudio);

    // Update CallLog with Twilio SID
    await CallLog.findByIdAndUpdate(callLog._id, { twilioCallSid: call.sid });

    res.json({
      success:    true,
      callSid:    call.sid,
      callLogId:  callLog._id,
      status:     call.status,
    });

  } catch (err) {
    console.error('[Twilio/call]', err);
    res.status(500).json({ error: err.message });
  }
});

// ─── 2. TwiML: Greeting  ──────────────────────────────────────────────────────
// GET/POST /api/twilio/twiml/greeting?CallSid=...
router.all('/twiml/greeting', async (req, res) => {
  const CallSid = req.query.CallSid || req.body?.CallSid;
  res.type('text/xml');

  const audioKey = `${CallSid}_greeting`;
  const baseUrl = getBaseUrl(req);

  // Prefer the pre-generated AI greeting audio; fall back to <Say> with the
  // session's greeting text (or a generic message) if audio isn't cached.
  let speakBlock;
  if (audioCache.has(audioKey)) {
    speakBlock = `<Play>${baseUrl}/api/twilio/audio/${encodeURIComponent(audioKey)}</Play>`;
  } else {
    const s = session.get(CallSid);
    const greetingText = s?.history?.[0]?.content || 'أهلاً، معاك سلمى من MedCall. إزيك النهاردة؟';
    speakBlock = `<Say language="ar-EG" voice="woman">${greetingText}</Say>`;
  }

  res.send(`<?xml version="1.0" encoding="UTF-8"?>
<Response>
  ${speakBlock}
  <Record action="${baseUrl}/api/twilio/twiml/respond" method="POST"
          maxLength="30" timeout="5" playBeep="false"
          recordingStatusCallback="${baseUrl}/api/twilio/recording-ready" />
</Response>`);
});

// ─── Audio cache endpoint (serves MP3 buffer to Twilio) ───────────────────────
// GET /api/twilio/audio/:key
router.get('/audio/:key', (req, res) => {
  const buf = audioCache.get(req.params.key);
  if (!buf) return res.status(404).send('Not found');
  res.set('Content-Type', 'audio/mpeg');
  res.set('Content-Length', buf.length);
  res.send(buf);
});

// ─── 3. TwiML: Process recording and respond ──────────────────────────────────
// POST /api/twilio/twiml/respond
router.post('/twiml/respond', async (req, res) => {
  res.type('text/xml');
  const { CallSid, RecordingUrl, RecordingStatus } = req.body;
  const baseUrl = getBaseUrl(req);

  const s = session.get(CallSid);
  if (!s || s.ended) {
    res.send(`<?xml version="1.0" encoding="UTF-8"?><Response><Hangup/></Response>`);
    return;
  }

  try {
    // Note: the <Record action> callback sends RecordingUrl but NOT
    // RecordingStatus (that only goes to recordingStatusCallback), so we
    // must not require RecordingStatus here.
    if (RecordingUrl) {
      const result = await s.processRecording(RecordingUrl);

      if (result.action === 'END_CALL' || result.action === 'ESCALATE') {
        // Synthesize closing statement
        const closingAudio = await s.synthesize(result.speak, 'friendly');
        const closeKey = `${CallSid}_closing`;
        audioCache.set(closeKey, closingAudio);

        res.send(`<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Play>${baseUrl}/api/twilio/audio/${encodeURIComponent(closeKey)}</Play>
  <Hangup/>
</Response>`);
        // Cleanup audio cache after 60s
        setTimeout(() => {
          audioCache.delete(closeKey);
          audioCache.delete(`${CallSid}_greeting`);
        }, 60_000);
        return;
      }

      // Continue the conversation — synthesize AI response
      const replyAudio = await s.synthesize(result.speak, 'friendly');
      const replyKey = `${CallSid}_turn_${s.turns.length}`;
      audioCache.set(replyKey, replyAudio);

      res.send(`<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Play>${baseUrl}/api/twilio/audio/${encodeURIComponent(replyKey)}</Play>
  <Record action="${baseUrl}/api/twilio/twiml/respond" method="POST"
          maxLength="30" timeout="5" playBeep="false"
          recordingStatusCallback="${baseUrl}/api/twilio/recording-ready" />
</Response>`);
    } else {
      // No recording received — contact was silent, prompt again
      res.send(`<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say language="ar-EG" voice="woman">معلش، مش سامعك. ممكن تتكلم تاني؟</Say>
  <Record action="${baseUrl}/api/twilio/twiml/respond" method="POST"
          maxLength="30" timeout="5" playBeep="false" />
</Response>`);
    }
  } catch (err) {
    console.error('[Twilio/respond]', err);
    res.send(`<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say language="ar-EG" voice="woman">حصلت مشكلة تقنية. شكراً لوقتك.</Say>
  <Hangup/>
</Response>`);
  }
});

// ─── 4. Recording callback ack ───────────────────────────────────────────────
// POST /api/twilio/recording-ready
router.post('/recording-ready', (_req, res) => {
  res.sendStatus(204);
});

// ─── 5. Call status callback ───────────────────────────────────────────────────
// POST /api/twilio/status
router.post('/status', async (req, res) => {
  const { CallSid, CallStatus } = req.body;

  const statusMap = {
    'queued':     'initiated',
    'ringing':    'initiated',
    'in-progress':'in-progress',
    'completed':  'completed',
    'busy':       'no-answer',
    'no-answer':  'no-answer',
    'failed':     'failed',
    'canceled':   'failed',
  };

  const status = statusMap[CallStatus] || CallStatus;

  try {
    await CallLog.findOneAndUpdate(
      { twilioCallSid: CallSid },
      { status, ...(status === 'in-progress' ? { startedAt: new Date() } : {}) }
    );

    if (['completed', 'busy', 'no-answer', 'failed'].includes(CallStatus)) {
      const s = session.get(CallSid);
      if (s && !s.ended) {
        // Force-finalize if session still open (e.g. contact hung up mid-call)
        await CallLog.findByIdAndUpdate(s.callLogId, {
          status:     'completed',
          endedAt:    new Date(),
          turns:      s.turns,
          responses:  s.responses,
          transcript: s.turns.map(t => `[${t.role}] ${t.text}`).join('\n'),
        });
        session.remove(CallSid);
      }
    }
  } catch (err) {
    console.error('[Twilio/status]', err);
  }

  res.sendStatus(204);
});

module.exports = router;
